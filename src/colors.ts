import { fail } from "./errors.ts";

/**
 * The palette.
 *
 * Ghostty's right-click tab colour is not scriptable — the AppleScript
 * dictionary has no colour property and there is no corresponding action — so
 * the only way to get colour onto a tab is a coloured glyph in its title.
 * These are the emoji that read as solid blocks of colour at tab-bar size.
 *
 * Each carries an approximate hex so a hand-picked colour can be matched to
 * the nearest swatch.
 */
const PALETTE = {
  red: { emoji: "🔴", hex: "#e0453b" },
  orange: { emoji: "🟠", hex: "#ef8a2b" },
  yellow: { emoji: "🟡", hex: "#f5c542" },
  green: { emoji: "🟢", hex: "#4aa338" },
  blue: { emoji: "🔵", hex: "#3b82f6" },
  purple: { emoji: "🟣", hex: "#9b59d0" },
  brown: { emoji: "🟤", hex: "#8b5a2b" },
  black: { emoji: "⚫", hex: "#2b2b2b" },
  white: { emoji: "⚪", hex: "#f2f2f2" },
} as const;

export type ColorName = keyof typeof PALETTE;

export const COLOR_NAMES = Object.keys(PALETTE) as ColorName[];

const HEX = /^#[0-9a-fA-F]{6}$/;

const rgb = (hex: string): [number, number, number] =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

/** Squared RGB distance — good enough to pick the obvious nearest swatch. */
function nearest(hex: string): ColorName {
  const [r, g, b] = rgb(hex);
  let best: ColorName = COLOR_NAMES[0];
  let bestD = Infinity;

  for (const name of COLOR_NAMES) {
    const [pr, pg, pb] = rgb(PALETTE[name].hex);
    const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  }
  return best;
}

/**
 * Resolve a configured colour to its tab glyph.
 *
 * Accepts a palette name ("blue") or a hex value ("#3b82f6"), which is matched
 * to the nearest swatch.
 */
export function colorEmoji(value: string, where: string): string {
  const key = value.trim().toLowerCase();

  // Object.hasOwn, not `in` — `in` walks the prototype chain, so "constructor"
  // and friends would pass validation and yield an undefined glyph.
  if (Object.hasOwn(PALETTE, key)) return PALETTE[key as ColorName].emoji;
  if (HEX.test(key)) return PALETTE[nearest(key)].emoji;

  fail(
    `${where}: color must be a hex value or one of ` +
      `${COLOR_NAMES.join(", ")} — got "${value}"`,
  );
}

/** Validate a hex value used for a pane background tint. */
export function checkTint(value: string | undefined, where: string) {
  if (value !== undefined && !HEX.test(value)) {
    fail(`${where}: tint must be #rrggbb, got "${value}"`);
  }
}
