import { type Stack, tabTitle, walkSplits } from "./config.ts";

/** Escape for an AppleScript string literal. */
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

/**
 * Quote for the shell.
 *
 * Ghostty runs a surface's command through `bash -c`, so anything with a space
 * in it — a tab called "daily stuff", a path under "Application Support" —
 * would otherwise split into separate arguments before ghosttack ever sees it.
 */
const sh = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`;

/**
 * Build the AppleScript that assembles a stack.
 *
 * Ghostty 1.3 exposes a real AppleScript dictionary, so tabs and splits are
 * created through supported API calls rather than synthetic keystrokes.
 */
export function buildAppleScript(self: string, stack: Stack): string {
  const L: string[] = [
    'tell application "Ghostty"',
    "  activate",
    "  set hadWindow to (count of windows) > 0",
  ];

  const surface = (dir: string, command: string) => [
    "  set cfg to new surface configuration",
    // Keep the pane open if its command exits, so a crash stays readable
    // instead of the split silently vanishing.
    "  set wait after command of cfg to true",
    `  set initial working directory of cfg to "${esc(dir)}"`,
    `  set command of cfg to "${esc(command)}"`,
  ];

  stack.tabs.forEach((t, ti) => {
    const pane = (n: number) => `t${ti}p${n}`;

    L.push("", `  -- ${t.name}`);
    L.push(...surface(t.dir, `${sh(self)} run ${sh(stack.name)} ${sh(t.name)}`));

    if (ti === 0) {
      // Reuse the front window if there is one, otherwise start a new one.
      L.push(
        "  if hadWindow then",
        "    set win to front window",
        "    set tb to new tab in win with configuration cfg",
        "  else",
        "    set win to new window with configuration cfg",
        "    set tb to selected tab of win",
        "  end if",
      );
    } else {
      L.push("  set tb to new tab in win with configuration cfg");
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
      L.push("");
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

  L.push("end tell");
  return L.join("\n");
}
