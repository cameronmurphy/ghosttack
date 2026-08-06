import { parse as parseToml } from "@std/toml";
import { checkTint, colorEmoji } from "./colors.ts";
import { fail } from "./errors.ts";
import { expandHome, listStacks, stackPath } from "./paths.ts";

export const DIRECTIONS = ["right", "left", "up", "down"] as const;
export type Direction = typeof DIRECTIONS[number];

/**
 * Whether a pane comes back when its process dies, and how.
 *
 *   true      relaunch with the same command
 *   "cmd"     relaunch with this instead, so a fresh start and a return can
 *             differ — a session-based tool can begin clean but pick up where
 *             it left off when something kills it mid-flight
 *   false     don't come back (the default)
 */
export type Resume = boolean | string;

export interface Split {
  direction: Direction;
  command?: string;
  dir: string;
  /** Login shell for this pane's command. Falls back to the tab's, then the
   * stack's, then $SHELL. */
  shell?: string;
  /** Hex background tint for this pane, via OSC 11. */
  tint?: string;
  resume?: Resume;
  keep?: boolean;
  /**
   * Splits of this pane. Nesting is the layout: a split listed here divides
   * the pane above it, so "beside the thing I just made" and "beside the
   * original" are different shapes rather than different index arithmetic.
   */
  split: Split[];
}

export interface Tab {
  name: string;
  dir: string;
  shell?: string;
  command?: string;
  resume?: Resume;
  /** Palette name or hex. Becomes a coloured glyph in front of the tab name,
   * which is the only way to get colour onto a Ghostty tab. */
  color?: string;
  /** Overrides the glyph `color` would pick — any string you like. */
  icon?: string;
  /** Hex background tint for the tab's panes, via OSC 11. */
  tint?: string;
  keep?: boolean;
  split: Split[];
}

export interface Stack {
  name: string;
  dir: string;
  tabs: Tab[];
}

function checkResume(resume: unknown, where: string) {
  if (resume === undefined || typeof resume === "boolean") return;
  if (typeof resume === "string" && resume.trim() !== "") return;
  fail(
    `${where}: resume must be true, false, or a command string — got ` +
      `${JSON.stringify(resume)}`,
  );
}

/**
 * Parse a stack file's contents. Kept free of filesystem access so it can be
 * exercised directly by tests.
 */
export function parseStack(name: string, raw: string): Stack {
  let parsed: Record<string, unknown>;
  try {
    parsed = parseToml(raw) as Record<string, unknown>;
  } catch (e) {
    fail(`${name}.toml is not valid TOML: ${(e as Error).message}`);
  }

  const stackDefaultDir = expandHome((parsed.dir as string) ?? "~");
  const stackShell = parsed.shell as string | undefined;
  const rawTabs = (parsed.tab ?? []) as Partial<Tab>[];

  if (!Array.isArray(rawTabs) || rawTabs.length === 0) {
    fail(`${name}.toml defines no [[tab]] entries.`);
  }

  const seen = new Set<string>();

  const tabs: Tab[] = rawTabs.map((t, i) => {
    const tabName = t.name ?? `tab${i + 1}`;
    if (seen.has(tabName)) fail(`${name}.toml: duplicate tab name "${tabName}".`);
    seen.add(tabName);

    // Resolve the glyph now so a bad colour is caught at load, not at launch.
    const where = `tab "${tabName}"`;
    checkTint(t.tint, where);
    checkResume(t.resume, where);
    const icon = t.icon ?? (t.color ? colorEmoji(t.color, where) : undefined);

    const tabDir = expandHome(t.dir ?? stackDefaultDir);
    const tabShell = t.shell ?? stackShell;

    /** Splits nest, so read them the same way at every depth. */
    const readSplits = (
      raw: Partial<Split>[] | undefined,
      parentDir: string,
      parentShell: string | undefined,
      path: string,
    ): Split[] =>
      (raw ?? []).map((s, j) => {
        const sWhere = `${path} split #${j + 1}`;
        if (!s.direction) fail(`${sWhere}: needs a direction.`);
        if (!DIRECTIONS.includes(s.direction)) {
          fail(`${sWhere}: direction must be one of ${DIRECTIONS.join(", ")}.`);
        }
        checkTint(s.tint, sWhere);
        checkResume(s.resume, sWhere);

        const dir = expandHome(s.dir ?? parentDir);
        const shell = s.shell ?? parentShell;
        return {
          ...s,
          direction: s.direction,
          dir,
          shell,
          split: readSplits(s.split, dir, shell, sWhere),
        };
      });

    return {
      ...t,
      name: tabName,
      dir: tabDir,
      icon,
      shell: tabShell,
      split: readSplits(t.split, tabDir, tabShell, where),
    };
  });

  return { name, dir: stackDefaultDir, tabs };
}

export async function loadStack(name: string): Promise<Stack> {
  const path = stackPath(name);
  let raw: string;
  try {
    raw = await Deno.readTextFile(path);
  } catch {
    const known = await listStacks();
    fail(
      `no stack "${name}" (looked for ${path})` +
        (known.length ? `\navailable: ${known.join(", ")}` : ""),
    );
  }
  return parseStack(name, raw!);
}

export function findTab(stack: Stack, name: string): Tab {
  const tab = stack.tabs.find((t) => t.name === name);
  if (!tab) fail(`stack "${stack.name}" has no tab "${name}".`);
  return tab!;
}

/** The tab's title: its name, with any icon in front. */
export const tabTitle = (t: Tab): string => t.icon ? `${t.icon} ${t.name}` : t.name;

/** What a tab's main pane runs. null means an interactive shell. */
export const tabCommand = (t: Tab): string | null => t.command ?? null;

/** Does this pane come back when its process dies? */
export const supervises = (resume: Resume | undefined): boolean =>
  resume !== undefined && resume !== false;

/**
 * The command to come back with, or undefined to reuse the original.
 *
 * `resume = true` says "come back" without saying "differently", so there is
 * nothing to return — the pane layer already falls back to the command it
 * first ran.
 */
export const resumeCommand = (resume: Resume | undefined): string | undefined =>
  typeof resume === "string" ? resume : undefined;

export interface WalkedSplit {
  split: Split;
  /** Stable pane number: 0 is the tab's main pane, splits count from 1. */
  index: number;
  /** Pane number this one divides. */
  parent: number;
  depth: number;
}

/**
 * Walk a tab's splits depth-first, numbering them in creation order.
 *
 * Pre-order matters: a pane is always numbered — and so built — before any
 * pane that divides it.
 */
export function* walkSplits(
  splits: Split[],
  parent = 0,
  depth = 0,
  counter = { n: 0 },
): Generator<WalkedSplit> {
  for (const split of splits) {
    const index = ++counter.n;
    yield { split, index, parent, depth };
    yield* walkSplits(split.split, index, depth + 1, counter);
  }
}

/** Every split in a tab, flattened in creation order. */
export const tabPanes = (t: Tab): WalkedSplit[] => [...walkSplits(t.split)];

/** Total panes in a stack, counting each tab's main pane. */
export const paneCount = (stack: Stack): number =>
  stack.tabs.reduce((n, t) => n + 1 + tabPanes(t).length, 0);
