import { assert, assertEquals } from '@std/assert';
import { assetName, compareVersions, looksExecutable } from '../src/selfupdate.ts';
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
