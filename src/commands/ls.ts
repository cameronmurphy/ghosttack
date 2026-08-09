import { loadStack, tabCommand, tabPanes, tabTitle } from '../config.ts';
import { listStacks, stackDir, stackPath, tilde } from '../paths.ts';
import { paneKey, type PaneState, readState } from '../state.ts';

/**
 * A pane is up while its supervisor is, whether it's running its command or
 * sitting at a shell. `readState` has already pruned dead supervisors.
 */
function status(s: PaneState | undefined): string {
  if (!s) return 'down';
  if (s.shell) return `shell ${s.supervisor}`;
  return `up ${s.supervisor}`;
}

export async function cmdLs(argv: string[]) {
  const only = argv.find((a) => !a.startsWith('-'));
  const names = only ? [only] : await listStacks();

  if (names.length === 0) {
    console.log(
      `ghosttack: no stacks in ${tilde(stackDir())}. ` +
        `run \`ghosttack\` to start one.`,
    );
    return;
  }

  const state = await readState();

  for (const name of names) {
    const stack = await loadStack(name);
    console.log(`\n${name}  (${tilde(stackPath(name))})`);

    for (const tab of stack.tabs) {
      const main = state.find((s) => s.key === paneKey(name, tab.name, 0));
      console.log(
        `  ${tabTitle(tab)}  [${status(main)}]  ${tabCommand(tab) ?? 'shell'}` +
          `  ${tilde(tab.dir)}`,
      );

      // Indent by depth so the nesting in the config is the nesting shown.
      for (const { split, index, depth } of tabPanes(tab)) {
        const pane = state.find((s) => s.key === paneKey(name, tab.name, index));
        console.log(
          `    ${'  '.repeat(depth)}└─ ${split.direction}` +
            `  [${status(pane)}]  ${split.command ?? 'shell'}`,
        );
      }
    }
  }
}
