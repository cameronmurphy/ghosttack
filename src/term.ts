const enc = new TextEncoder();

const write = (s: string) => {
  Deno.stdout.writeSync(enc.encode(s));
};

/**
 * Tint the pane's background.
 *
 * Ghostty's macOS tab-chip colour is right-click-only: no config key, no
 * AppleScript property, no escape sequence (1.3.1). OSC 11 is the one
 * programmatic lever, and it colours the pane's *content* background rather
 * than the chip in the tab bar.
 */
export function tint(color: string) {
  const [r, g, b] = [1, 3, 5].map((i) => color.slice(i, i + 2));
  write(`\x1b]11;rgb:${r}/${g}/${b}\x1b\\`);
}
