import { readState } from '../state.ts';

/**
 * Restart supervised panes in place.
 *
 * Each pane's supervisor notices its child died and relaunches it, using the
 * tab's `resume` command if it has one. Nothing here is ghosttack-specific:
 * killing a supervised pane's process by any other means has the same effect.
 */
export async function cmdRestart(argv: string[]) {
  const only = argv.find((a) => !a.startsWith('-'));

  let panes = await readState();
  if (only) panes = panes.filter((s) => s.stack === only);

  // Only a supervised command comes back. Killing a pane sitting at a shell,
  // or one whose command runs unsupervised, would just close it.
  const live = panes.filter((s) => s.supervised && !s.shell && s.pid !== null);
  const skipped = panes.length - live.length;

  if (live.length === 0) {
    console.log(
      `ghosttack: no supervised panes running${only ? ` for ${only}` : ''}` +
        (skipped ? ` (${skipped} pane(s) not supervised).` : '.'),
    );
    return;
  }

  for (const pane of live) {
    try {
      Deno.kill(pane.pid!, 'SIGTERM');
      console.log(`ghosttack: restarting ${pane.key} (pid ${pane.pid})`);
    } catch (e) {
      console.error(`ghosttack: could not signal ${pane.key}: ${e}`);
    }
  }

  console.log(
    `\nghosttack: ${live.length} pane(s) will relaunch` +
      (skipped ? `; ${skipped} left alone (not supervised).` : '.'),
  );
}
