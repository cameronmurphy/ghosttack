#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run --allow-env --allow-net=api.github.com,github.com,release-assets.githubusercontent.com,objects.githubusercontent.com
/**
 * ghosttack — spin up a whole Ghostty workspace from one file.
 *
 * A stack is a .toml file in ~/.config/ghosttack. `ghosttack webapp` reads
 * webapp.toml and builds it: tabs, splits, working directories, commands,
 * colours. Run `ghosttack` with no arguments to get started.
 */

import { GhosttackError } from './src/errors.ts';
import { DEFAULT_STACK, stackExists } from './src/paths.ts';
import { cmdLs } from './src/commands/ls.ts';
import { cmdOobe } from './src/commands/oobe.ts';
import { cmdPane, cmdRun } from './src/commands/run.ts';
import { cmdRestart } from './src/commands/restart.ts';
import { cmdSelfUpdate } from './src/selfupdate.ts';
import { cmdUp } from './src/commands/up.ts';
import { VERSION } from './src/version.ts';

/** Subcommand names can't double as stack names. */
const RESERVED = ['ls', 'restart', 'run', 'pane', 'help'];

/** Flags that stand in for a stack name, building the default stack. */
const BARE_FLAGS = ['--dry-run', '--close', '--no-close'];

/**
 * With no stack named, build default.toml — the stack you start the day with.
 * Without one, there's nothing to build, so introduce yourself instead.
 */
async function cmdDefault(argv: string[]) {
  if (await stackExists(DEFAULT_STACK)) return await cmdUp(DEFAULT_STACK, argv);
  return await cmdOobe();
}

async function dispatch(args: string[]) {
  const [first, ...rest] = args;

  switch (first) {
    case undefined:
      return await cmdDefault([]);

    case 'help':
    case '--help':
    case '-h':
      return await cmdOobe();

    case '--version':
    case '-v':
      console.log(VERSION);
      return;

    case '--self-update':
      return await cmdSelfUpdate(rest);

    case 'ls':
      return await cmdLs(rest);

    case 'restart':
      return await cmdRestart(rest);

    // Internal: these are what generated tabs and splits execute.
    case 'run':
      if (!rest[1]) throw new GhosttackError('run needs a stack and a tab name.');
      return await cmdRun(rest[0], rest[1]);

    case 'pane':
      if (!rest[2]) {
        throw new GhosttackError(
          'pane needs a stack, a tab name and a split number.',
        );
      }
      return await cmdPane(rest[0], rest[1], rest[2]);

    default:
      // `ghosttack --dry-run` should preview the default stack, not complain.
      if (BARE_FLAGS.includes(first)) return await cmdDefault(args);
      if (first.startsWith('-')) {
        throw new GhosttackError(`unknown option "${first}".`);
      }
      if (RESERVED.includes(first)) {
        throw new GhosttackError(`"${first}" is reserved.`);
      }
      return await cmdUp(first, rest);
  }
}

if (import.meta.main) {
  try {
    // Tabs and splits are built through Ghostty's AppleScript dictionary, which
    // is macOS-only. Say so plainly rather than failing at `osascript`.
    if (Deno.build.os !== 'darwin') {
      throw new GhosttackError(
        'ghosttack is macOS only — it drives Ghostty through AppleScript.',
      );
    }
    await dispatch(Deno.args);
  } catch (e) {
    if (e instanceof GhosttackError) {
      console.error(`ghosttack: ${e.message}`);
      Deno.exit(1);
    }
    throw e;
  }
}
