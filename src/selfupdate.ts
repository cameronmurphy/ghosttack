import { fail } from './errors.ts';
import { tilde } from './paths.ts';
import { VERSION } from './version.ts';

const REPO = 'cameronmurphy/ghosttack';
const LATEST = `https://api.github.com/repos/${REPO}/releases/latest`;

/** The checksum manifest the release job publishes alongside the binaries. */
const SUMS = 'SHA256SUMS';

/** What a release looks like, as far as this cares. */
interface Release {
  tag_name: string;
  assets: { name: string; size: number; browser_download_url: string }[];
}

/**
 * Mach-O magic numbers: a thin 64-bit binary, and a universal wrapper.
 *
 * Checked before anything is moved into place. A download that failed into an
 * error page or a truncated file would otherwise replace a working ghosttack
 * with something that can't run — and the tool that fixes it is the one just
 * broken.
 */
const MAGIC = [
  [0xcf, 0xfa, 0xed, 0xfe],
  [0xca, 0xfe, 0xba, 0xbe],
];

export const looksExecutable = (bytes: Uint8Array): boolean => MAGIC.some((m) => m.every((b, i) => bytes[i] === b));

/** Compare two x.y.z versions. Positive when a is newer than b. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => v.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

/** The release asset this machine needs. */
export const assetName = (target = Deno.build.target): string => `ghosttack-${target}`;

/** Hex SHA-256 of a downloaded binary. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Pull one file's hash out of a `sha256sum` manifest.
 *
 * Lines are `<hash>  <name>`, and a name may carry a leading `*` marking
 * binary mode. Returns null when the file isn't listed, which is a refusal
 * rather than a pass.
 */
export function checksumFor(manifest: string, name: string): string | null {
  for (const line of manifest.split('\n')) {
    const m = line.trim().match(/^([0-9a-fA-F]{64})\s+\*?(.+)$/);
    if (m && m[2].trim() === name) return m[1].toLowerCase();
  }
  return null;
}

async function fetchLatest(): Promise<Release> {
  let res: Response;
  try {
    res = await fetch(LATEST, { headers: { accept: 'application/vnd.github+json' } });
  } catch (e) {
    fail(`couldn't reach GitHub: ${(e as Error).message}`);
  }
  if (!res!.ok) {
    fail(`GitHub returned ${res!.status} ${res!.statusText} looking for the latest release.`);
  }
  return await res!.json() as Release;
}

/**
 * Replace the running binary with the newest release.
 *
 * The new binary is written beside the old one and renamed over it, because a
 * rename is atomic and works on a file that is currently executing — writing
 * over the old one in place is not, and would leave a half-written ghosttack
 * behind if the download died partway.
 */
export async function cmdSelfUpdate(argv: string[]) {
  const dryRun = argv.includes('--dry-run');

  // A script has no binary to replace, and reinstalling is how a JSR install
  // moves forward. Say which one this is rather than failing further in.
  if (Deno.execPath().endsWith('/deno')) {
    fail(
      'ghosttack is running from source, so there is no binary to replace.\n' +
        'Installed from JSR? Re-run: deno install -Ag -n ghosttack jsr:@camurphy/ghosttack',
    );
  }

  const target = Deno.execPath();
  const release = await fetchLatest();
  const latest = release.tag_name.replace(/^v/, '');

  if (compareVersions(latest, VERSION) <= 0) {
    console.log(`ghosttack: ${VERSION} is already the latest.`);
    return;
  }

  const wanted = assetName();
  const asset = release.assets.find((a) => a.name === wanted);
  if (!asset) {
    fail(`release ${release.tag_name} has no ${wanted} to download.`);
  }

  console.log(`ghosttack: ${VERSION} → ${latest}, updating ${tilde(target)}`);
  if (dryRun) {
    console.log(`would download ${asset!.browser_download_url}`);
    return;
  }

  const res = await fetch(asset!.browser_download_url);
  if (!res.ok) fail(`downloading ${wanted} failed: ${res.status} ${res.statusText}`);
  const bytes = new Uint8Array(await res.arrayBuffer());

  if (bytes.length !== asset!.size) {
    fail(`downloaded ${bytes.length} bytes, expected ${asset!.size} — leaving ghosttack alone.`);
  }
  if (!looksExecutable(bytes)) {
    fail(`what downloaded isn't a macOS binary — leaving ghosttack alone.`);
  }

  // Refuse rather than fall back to the weaker checks. Every release that can
  // be updated to is newer than this build, so it publishes SHA256SUMS too;
  // a missing or mismatched manifest means something is wrong, not old.
  const sums = release.assets.find((a) => a.name === SUMS);
  if (!sums) {
    fail(`release ${release.tag_name} publishes no ${SUMS} to check against.`);
  }
  const manifest = await fetch(sums!.browser_download_url);
  if (!manifest.ok) {
    fail(`downloading ${SUMS} failed: ${manifest.status} ${manifest.statusText}`);
  }
  const expected = checksumFor(await manifest.text(), wanted);
  if (!expected) fail(`${SUMS} doesn't list ${wanted} — leaving ghosttack alone.`);

  const actual = await sha256Hex(bytes);
  if (actual !== expected) {
    fail(
      `checksum mismatch for ${wanted} — leaving ghosttack alone.\n` +
        `  expected ${expected}\n  got      ${actual}`,
    );
  }

  // Beside the target, so the rename stays on one filesystem and stays atomic.
  const staged = `${target}.new`;
  try {
    await Deno.writeFile(staged, bytes, { mode: 0o755 });
    await Deno.rename(staged, target);
  } catch (e) {
    await Deno.remove(staged).catch(() => {});
    if (e instanceof Deno.errors.PermissionDenied) {
      fail(`no permission to write ${tilde(target)}. Try: sudo ghosttack --self-update`);
    }
    throw e;
  }

  console.log(`ghosttack: now on ${latest}.`);
}
