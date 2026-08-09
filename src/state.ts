import { HOME } from './paths.ts';

/** Overridable so tests can use a scratch directory. */
const STATE_DIR = Deno.env.get('GHOSTTACK_STATE_DIR') ??
  `${HOME}/.local/state/ghosttack`;

export interface PaneState {
  key: string;
  stack: string;
  tab: string;
  pane: number;
  dir: string;
  /** The configured command, or "shell" for a pane that has no command. */
  cmd: string;
  /** ghosttack's own pid. This is what makes the pane alive. */
  supervisor: number;
  /** The current child: the command, or the shell that replaced it. */
  pid: number | null;
  /** Whether the command is relaunched if it dies. */
  supervised: boolean;
  /** True once the pane has fallen back to an interactive shell. */
  shell: boolean;
  started: string;
}

/** What a caller supplies; the rest is filled in as the pane runs. */
export type PaneIdentity = Pick<
  PaneState,
  'key' | 'stack' | 'tab' | 'pane' | 'dir' | 'cmd'
>;

export const paneKey = (stack: string, tab: string, pane: number): string => `${stack}.${tab}.${pane}`;

/**
 * Encoded, because a pane key carries user-chosen names: a tab called
 * "daily stuff" or "api/v2" must not become a space or a subdirectory on disk.
 */
const stateFile = (key: string) => `${STATE_DIR}/${encodeURIComponent(key)}.json`;

export async function writeState(s: PaneState) {
  await Deno.mkdir(STATE_DIR, { recursive: true });
  await Deno.writeTextFile(stateFile(s.key), JSON.stringify(s, null, 2));
}

export async function clearState(key: string) {
  try {
    await Deno.remove(stateFile(key));
  } catch {
    // Already gone.
  }
}

export function isAlive(pid: number | null): boolean {
  if (pid === null) return false;
  try {
    // Signal 0 isn't exposed by Deno.kill; SIGCONT is a no-op probe for a
    // process that is already running.
    Deno.kill(pid, 'SIGCONT');
    return true;
  } catch {
    return false;
  }
}

/**
 * Every pane ghosttack is currently running.
 *
 * A pane is alive for as long as its supervisor is, which includes panes
 * sitting at a shell — not just ones mid-command. Records whose supervisor has
 * gone are pruned, so a crashed or force-quit pane doesn't linger as a ghost.
 *
 * We track our own children rather than matching on process name. Name
 * matching is unreliable — two builds of the same program can report
 * themselves differently, so `pgrep -x foo` silently misses some — and it
 * would happily signal processes ghosttack never started.
 */
export async function readState(): Promise<PaneState[]> {
  const alive: PaneState[] = [];
  const stale: string[] = [];

  try {
    for await (const entry of Deno.readDir(STATE_DIR)) {
      if (!entry.name.endsWith('.json')) continue;
      const path = `${STATE_DIR}/${entry.name}`;
      try {
        const pane: PaneState = JSON.parse(await Deno.readTextFile(path));
        if (isAlive(pane.supervisor)) alive.push(pane);
        else stale.push(path);
      } catch {
        stale.push(path); // corrupt or half-written
      }
    }
  } catch {
    return []; // no state directory yet
  }

  await Promise.all(stale.map((p) => Deno.remove(p).catch(() => {})));
  return alive.sort((a, b) => a.key.localeCompare(b.key));
}
