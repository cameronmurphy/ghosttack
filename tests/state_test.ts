import { assertEquals } from '@std/assert';

// Point the state layer at a scratch directory before importing it.
const DIR = await Deno.makeTempDir({ prefix: 'ghosttack-state-' });
Deno.env.set('GHOSTTACK_STATE_DIR', DIR);

const { clearState, paneKey, readState, writeState } = await import(
  '../src/state.ts'
);

const pane = (key: string, supervisor: number, over: Partial<{
  pid: number | null;
  supervised: boolean;
  shell: boolean;
}> = {}) => ({
  key,
  stack: 'demo',
  tab: key,
  pane: 0,
  dir: '/tmp',
  cmd: 'shell',
  supervisor,
  pid: null,
  supervised: false,
  shell: false,
  started: '2026-08-06T00:00:00.000Z',
  ...over,
});

/** A pid that is certainly not running. */
const DEAD = 2 ** 22 - 1;

Deno.test('paneKey is stable and unique per pane', () => {
  assertEquals(paneKey('demo', 'api', 0), 'demo.api.0');
  assertEquals(paneKey('demo', 'api', 1), 'demo.api.1');
});

Deno.test('a pane with a live supervisor reads back as up', async () => {
  await writeState(pane('live', Deno.pid));
  const state = await readState();
  assertEquals(state.map((s) => s.key), ['live']);
  await clearState('live');
});

Deno.test('a pane at a shell is still live', async () => {
  // The old behaviour keyed liveness off a running command, so a shell pane
  // reported as down even though the pane was plainly there.
  await writeState(pane('shell', Deno.pid, { pid: null, shell: true }));
  const state = await readState();
  assertEquals(state.length, 1);
  assertEquals(state[0].shell, true);
  await clearState('shell');
});

Deno.test('records from dead supervisors are pruned from disk', async () => {
  await writeState(pane('ghost', DEAD));
  await writeState(pane('alive', Deno.pid));

  assertEquals((await readState()).map((s) => s.key), ['alive']);

  // The stale record is gone, not merely filtered out of the result.
  const left = [...Deno.readDirSync(DIR)].map((e) => e.name).sort();
  assertEquals(left, ['alive.json']);
  await clearState('alive');
});

Deno.test('corrupt records are discarded rather than crashing the read', async () => {
  await Deno.writeTextFile(`${DIR}/broken.json`, '{not json');
  await writeState(pane('ok', Deno.pid));

  assertEquals((await readState()).map((s) => s.key), ['ok']);
  assertEquals([...Deno.readDirSync(DIR)].map((e) => e.name), ['ok.json']);
  await clearState('ok');
});

Deno.test('reading an empty state directory yields nothing', async () => {
  assertEquals(await readState(), []);
});

globalThis.addEventListener('unload', () => {
  try {
    Deno.removeSync(DIR, { recursive: true });
  } catch { /* best effort */ }
});
