import { buildAppleScript } from '../applescript.ts';
import { loadStack, paneCount } from '../config.ts';
import { fail } from '../errors.ts';
import { selfPath } from '../paths.ts';

/** Flags `ghosttack <stack>` accepts. */
const FLAGS = ['--dry-run', '--close', '--no-close'];

/**
 * Can this run close the tab it was launched from?
 *
 * The launching tab is found as the selected tab of the front window, which
 * only holds for someone typing into that tab. TERM_PROGRAM can't tell the
 * difference on its own — every child process inherits it — so a script or an
 * agent running inside Ghostty would pass and close whichever tab the user
 * happened to be looking at. A terminal on stdin is what separates the two.
 */
function closeBlocker(): string | null {
  if (Deno.env.get('TERM_PROGRAM') !== 'ghostty') {
    return 'not running under Ghostty, so there is no tab of ours to close';
  }
  if (!Deno.stdin.isTerminal()) {
    return "no interactive terminal, so the launching tab can't be identified";
  }
  return null;
}

export async function cmdUp(name: string, argv: string[]) {
  const unknown = argv.find((a) => a.startsWith('-') && !FLAGS.includes(a));
  if (unknown) fail(`unknown option "${unknown}".`);

  const dryRun = argv.includes('--dry-run');
  const asked = argv.includes('--close');
  const refused = argv.includes('--no-close');

  if (asked && refused) fail('--close and --no-close contradict each other.');

  const stack = await loadStack(name);

  // A flag decides this run; the stack file decides every run that doesn't say.
  let closeOrigin = refused ? false : asked || stack.close === true;

  if (closeOrigin && !dryRun) {
    const blocker = closeBlocker();
    if (blocker) {
      // Asking outright and being unable to is an error worth stopping for.
      // Inheriting it from the stack file is not: the stack is still worth
      // building, so skip the close and say why.
      if (asked) fail(`--close: ${blocker}.`);
      console.error(`ghosttack: not closing this tab — ${blocker}.`);
      closeOrigin = false;
    }
  }

  const script = buildAppleScript(selfPath(), stack, { closeOrigin });

  if (dryRun) {
    console.log(script);
    return;
  }

  const { success, stderr } = await new Deno.Command('osascript', {
    args: ['-e', script],
  }).output();

  if (!success) {
    fail(
      `osascript failed: ${new TextDecoder().decode(stderr).trim()}\n\n` +
        `If this is a permissions error, macOS needs to allow this terminal\n` +
        `to control Ghostty: System Settings > Privacy & Security > Automation.`,
    );
  }

  console.log(
    `ghosttack: ${name} — ${stack.tabs.length} tab(s), ${paneCount(stack)} pane(s).`,
  );
}
