import { assert, assertEquals } from '@std/assert';
import { assetName, checksumFor, compareVersions, looksExecutable, sha256Hex } from '../src/selfupdate.ts';
import { VERSION } from '../src/version.ts';

Deno.test('versions compare numerically, not as strings', () => {
  assertEquals(compareVersions('0.0.4', '0.0.3'), 1);
  assertEquals(compareVersions('0.0.3', '0.0.4'), -1);
  assertEquals(compareVersions('0.0.3', '0.0.3'), 0);
  // The string comparison every hand-rolled version check gets wrong.
  assertEquals(compareVersions('0.0.10', '0.0.9'), 1);
  assertEquals(compareVersions('0.10.0', '0.9.0'), 1);
  assertEquals(compareVersions('1.0.0', '0.99.99'), 1);
});

Deno.test('a leading v on the tag makes no difference', () => {
  assertEquals(compareVersions('v0.0.4', '0.0.3'), 1);
  assertEquals(compareVersions('v0.0.3', '0.0.3'), 0);
});

Deno.test('missing parts count as zero', () => {
  assertEquals(compareVersions('1', '1.0.0'), 0);
  assertEquals(compareVersions('1.1', '1.0.9'), 1);
});

Deno.test('the asset name matches what the build publishes', () => {
  // .github/workflows/build.yml compiles to ghosttack-<target>.
  assertEquals(assetName('aarch64-apple-darwin'), 'ghosttack-aarch64-apple-darwin');
  assertEquals(assetName('x86_64-apple-darwin'), 'ghosttack-x86_64-apple-darwin');
});

Deno.test('the version is baked in from deno.json', async () => {
  const raw = await Deno.readTextFile(new URL('../deno.json', import.meta.url));
  assertEquals(VERSION, JSON.parse(raw).version);
  assert(/^\d+\.\d+\.\d+$/.test(VERSION), `${VERSION} should be x.y.z`);
});

Deno.test('only a Mach-O binary is allowed to replace ghosttack', () => {
  const bytes = (...b: number[]) => new Uint8Array(b);
  // Thin 64-bit, which is what deno compile emits, and a universal wrapper.
  assert(looksExecutable(bytes(0xcf, 0xfa, 0xed, 0xfe, 0x0c)));
  assert(looksExecutable(bytes(0xca, 0xfe, 0xba, 0xbe, 0x00)));

  // A GitHub error page, an empty body, a truncated download.
  assert(!looksExecutable(new TextEncoder().encode('<!DOCTYPE html>')));
  assert(!looksExecutable(bytes()));
  assert(!looksExecutable(bytes(0xcf, 0xfa)));
  // An ELF binary — right idea, wrong platform.
  assert(!looksExecutable(bytes(0x7f, 0x45, 0x4c, 0x46)));
});

Deno.test('sha256 matches the reference digest', async () => {
  // The empty-string and "abc" digests from FIPS 180-4.
  assertEquals(
    await sha256Hex(new Uint8Array()),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  );
  assertEquals(
    await sha256Hex(new TextEncoder().encode('abc')),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
});

Deno.test('a hash is picked out of a sha256sum manifest', () => {
  const manifest = [
    'aa'.repeat(32) + '  ghosttack-aarch64-apple-darwin',
    'bb'.repeat(32) + '  ghosttack-x86_64-apple-darwin',
    '',
  ].join('\n');

  assertEquals(checksumFor(manifest, 'ghosttack-aarch64-apple-darwin'), 'aa'.repeat(32));
  assertEquals(checksumFor(manifest, 'ghosttack-x86_64-apple-darwin'), 'bb'.repeat(32));
  // Not listed is null, so the caller refuses rather than skipping the check.
  assertEquals(checksumFor(manifest, 'ghosttack-aarch64-unknown-linux-gnu'), null);
  assertEquals(checksumFor('', 'ghosttack-aarch64-apple-darwin'), null);
});

Deno.test('binary-mode and uppercase manifests still parse', () => {
  assertEquals(
    checksumFor('CC'.repeat(32) + ' *ghosttack-aarch64-apple-darwin', 'ghosttack-aarch64-apple-darwin'),
    'cc'.repeat(32),
  );
});

Deno.test('a name that merely contains ours is not a match', () => {
  const manifest = 'dd'.repeat(32) + '  ghosttack-aarch64-apple-darwin.sig';
  assertEquals(checksumFor(manifest, 'ghosttack-aarch64-apple-darwin'), null);
});
