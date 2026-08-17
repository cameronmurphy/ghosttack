import { buildAppleScript } from '../applescript.ts';
import { loadStack, paneCount } from '../config.ts';
import { fail } from '../errors.ts';
import { selfPath } from '../paths.ts';

/** Flags `ghosttack <stack>` accepts. */
const FLAGS = ['--dry-run', '--close', '--no-close', '--stay', '--no-stay'];

/**
 * Can this run act on the tab it was launched from?
 *
 * The launching tab is found as the selected tab of the front window, which
 * only holds for someone typing into that tab. TERM_PROGRAM can't tell the
 * difference on its own — every child process inherits it — so a script or an
 * agent running inside Ghostty would pass and act on whichever tab the user
 * happened to be looking at. A terminal on stdin is what separates the two.
 */
function originBlocker(): string | null {
  if (Deno.env.get('TERM_PROGRAM') !== 'ghostty') {
    return 'not running under Ghostty, so there is no tab of ours';
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
  const askedStay = argv.includes('--stay');
  const refusedStay = argv.includes('--no-stay');

  if (asked && refused) fail('--close and --no-close contradict each other.');
  if (askedStay && refusedStay) fail('--stay and --no-stay contradict each other.');

  const stack = await loadStack(name);

  // A flag decides this run; the stack file decides every run that doesn't say.
  let closeOrigin = refused ? false : asked || stack.close === true;

  // On unless something says otherwise. Every `new tab` selects itself, so
  // building a stack drags the selection off whatever you were doing; putting
  // it back is what someone running this from a tab they're working in wants.
  // It composes with closing rather than competing with it — see the script.
  let selectOrigin = refusedStay ? false : askedStay || stack.stay !== false;

  if ((closeOrigin || selectOrigin) && !dryRun) {
    const blocker = originBlocker();
    if (blocker) {
      // Asking outright and being unable to is an error worth stopping for.
      // Inheriting it is not: the stack is still worth building. A close is
      // loud enough to explain skipping; leaving the selection where it landed
      // is visible on its own, so it goes quietly.
      if (asked) fail(`--close: ${blocker}.`);
      if (askedStay) fail(`--stay: ${blocker}.`);
      if (closeOrigin) console.error(`ghosttack: not closing this tab — ${blocker}.`);
      closeOrigin = false;
      selectOrigin = false;
    }
  }

  const script = buildAppleScript(selfPath(), stack, { closeOrigin, selectOrigin });

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
