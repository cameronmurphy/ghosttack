import { type Stack, tabTitle, walkSplits } from './config.ts';

/** Escape for an AppleScript string literal. */
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

/**
 * Quote for the shell.
 *
 * Ghostty runs a surface's command through `bash -c`, so anything with a space
 * in it — a tab called "daily stuff", a path under "Application Support" —
 * would otherwise split into separate arguments before ghosttack ever sees it.
 */
const sh = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`;

/** Extras that change how a stack is assembled, rather than what it contains. */
export type BuildOptions = {
  /** Close the tab ghosttack was invoked from once the stack is built. */
  closeOrigin?: boolean;
  /** Put the selection back on that tab instead of leaving it on the stack. */
  selectOrigin?: boolean;
};

/**
 * Build the AppleScript that assembles a stack.
 *
 * Ghostty 1.3 exposes a real AppleScript dictionary, so tabs and splits are
 * created through supported API calls rather than synthetic keystrokes.
 */
export function buildAppleScript(
  self: string,
  stack: Stack,
  opts: BuildOptions = {},
): string {
  const L: string[] = [
    'tell application "Ghostty"',
    '  activate',
    '  set hadWindow to (count of windows) > 0',
  ];

  // Grab the launching tab before any new ones exist, while it is still the
  // selected tab of the front window. There is no env var naming the surface a
  // process is running in, so position is the only handle on it.
  if (opts.closeOrigin || opts.selectOrigin) {
    L.push(
      '  set originTab to missing value',
      '  if hadWindow then set originTab to selected tab of front window',
    );
  }

  const surface = (dir: string, command: string) => [
    '  set cfg to new surface configuration',
    // Keep the pane open if its command exits, so a crash stays readable
    // instead of the split silently vanishing.
    '  set wait after command of cfg to true',
    `  set initial working directory of cfg to "${esc(dir)}"`,
    `  set command of cfg to "${esc(command)}"`,
  ];

  stack.tabs.forEach((t, ti) => {
    const pane = (n: number) => `t${ti}p${n}`;

    L.push('', `  -- ${t.name}`);
    L.push(...surface(t.dir, `${sh(self)} run ${sh(stack.name)} ${sh(t.name)}`));

    if (ti === 0) {
      // Reuse the front window if there is one, otherwise start a new one.
      L.push(
        '  if hadWindow then',
        '    set win to front window',
        '    set tb to new tab in win with configuration cfg',
        '  else',
        '    set win to new window with configuration cfg',
        '    set tb to selected tab of win',
        '  end if',
      );
    } else {
      L.push('  set tb to new tab in win with configuration cfg');
    }

    L.push(`  set ${pane(0)} to focused terminal of tb`);

    // Title the tab through Ghostty rather than an OSC escape. A shell that
    // sets its own title on every prompt — fish_title, zsh precmd — overwrites
    // anything the pane emits; this override outlives it.
    L.push(
      `  perform action "set_tab_title:${esc(tabTitle(t))}" on ${pane(0)}`,
    );

    // Depth-first, so the pane being divided always exists already.
    for (const { split, index, parent } of walkSplits(t.split)) {
      L.push('');
      L.push(
        ...surface(
          split.dir,
          `${sh(self)} pane ${sh(stack.name)} ${sh(t.name)} ${index}`,
        ),
      );
      L.push(
        `  set ${pane(index)} to split ${pane(parent)} ` +
          `direction ${split.direction} with configuration cfg`,
      );
    }
  });

  // Every `new tab` selects itself, so the selection walks along the stack as
  // it is built and lands on the last tab. Nothing prevents that — the tabs
  // have to be created — so put it back at the end instead.
  //
  // Selecting before closing is what makes the two work together: closing the
  // selected tab hands the selection to whatever Ghostty thinks comes next,
  // which is the tab beside where you were rather than the far end of a stack
  // you didn't ask to be looking at.
  //
  // Last either way, so a failure building the stack leaves the launching tab
  // alive with the error still on screen.
  if (opts.selectOrigin || opts.closeOrigin) {
    L.push('', '  if originTab is not missing value then');
    if (opts.selectOrigin) L.push('    select tab originTab');
    if (opts.closeOrigin) L.push('    close tab originTab');
    L.push('  end if');
  }

  L.push('end tell');
  return L.join('\n');
}
