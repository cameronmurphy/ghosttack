import { fromFileUrl, join } from '@std/path';

export const HOME = Deno.env.get('HOME') ?? '';

/**
 * Absolute path to ghosttack itself.
 *
 * When compiled, execPath() is the ghosttack binary; when run as a script it
 * is the deno binary, so fall back to this module's own location.
 *
 * execPath() does not resolve symlinks, so a ghosttack symlinked onto PATH
 * would otherwise report /opt/homebrew/bin — and look for stacks there
 * instead of beside the real binary.
 */
export function selfPath(): string {
  const exec = Deno.execPath();
  const self = exec.endsWith('/deno') ? fromFileUrl(new URL('../main.ts', import.meta.url)) : exec;
  try {
    return Deno.realPathSync(self);
  } catch {
    return self;
  }
}

/**
 * Where stacks live.
 *
 * Kept out of the binary's directory so stacks survive rebuilding, moving or
 * reinstalling ghosttack. Honours XDG_CONFIG_HOME; GHOSTTACK_CONFIG_DIR
 * overrides both, which is also what the tests use.
 */
export const stackDir = (): string =>
  Deno.env.get('GHOSTTACK_CONFIG_DIR') ??
    join(Deno.env.get('XDG_CONFIG_HOME') ?? join(HOME, '.config'), 'ghosttack');

export const stackPath = (name: string): string => join(stackDir(), `${name}.toml`);

/** The stack run when ghosttack is given no arguments. */
export const DEFAULT_STACK = 'default';

export async function stackExists(name: string): Promise<boolean> {
  try {
    return (await Deno.stat(stackPath(name))).isFile;
  } catch {
    return false;
  }
}

/** Every stack name found beside the binary, sorted. */
export async function listStacks(): Promise<string[]> {
  const out: string[] = [];
  try {
    for await (const entry of Deno.readDir(stackDir())) {
      if (entry.isFile && entry.name.endsWith('.toml')) {
        out.push(entry.name.slice(0, -5));
      }
    }
  } catch {
    // No directory yet; treat as no stacks.
  }
  return out.sort();
}

/** Expand a leading ~ against $HOME. */
export function expandHome(p: string): string {
  if (p === '~') return HOME;
  return p.startsWith('~/') ? join(HOME, p.slice(2)) : p;
}

/** Render a path for display, shortening $HOME back to ~. */
export const tilde = (p: string): string => HOME && p.startsWith(HOME) ? `~${p.slice(HOME.length)}` : p;
