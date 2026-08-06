import { clearState, type PaneIdentity, type PaneState, writeState } from "./state.ts";
import { tint } from "./term.ts";

/** A command that dies faster than this is broken, not being restarted. */
const MIN_UPTIME_SECONDS = 5;

export interface PaneOpts {
  /** Tab name, used in ghosttack's own messages. */
  label: string;
  dir: string;
  /** Login shell to run the command under. Defaults to $SHELL. */
  shell?: string;
  /** null runs an interactive shell instead. */
  command: string | null;
  /** Used in place of `command` when a killed pane comes back. */
  resumeCommand?: string;
  color?: string;
  supervise: boolean;
  /** Drop into a shell when the command finishes, instead of ending the pane. */
  keep: boolean;
  identity: PaneIdentity;
}

function spawn(cmd: string[], dir: string): Deno.ChildProcess {
  return new Deno.Command(cmd[0], {
    args: cmd.slice(1),
    cwd: dir,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  }).spawn();
}

/**
 * Run one pane, optionally keeping it alive.
 *
 * A supervised pane that is killed mid-flight comes straight back — which is
 * what makes `ghosttack restart` painless: sessions relaunch themselves
 * already named and configured, with nothing to retype.
 *
 * The pane registers itself for as long as it exists, not merely while a
 * command is running, so a pane sitting at a shell still reports as up.
 */
export async function runPane(o: PaneOpts): Promise<never> {
  const started = new Date().toISOString();

  const record = (pid: number | null, shell: boolean): Promise<void> =>
    writeState(
      {
        ...o.identity,
        supervisor: Deno.pid,
        pid,
        supervised: o.supervise,
        shell,
        started,
      } satisfies PaneState,
    );

  const dress = () => {
    if (o.color) tint(o.color);
  };

  /**
   * The user's login shell, not /bin/sh.
   *
   * A command is written the way you'd type it, so it needs the environment
   * you'd have typed it in: the PATH your profile builds, your abbreviations,
   * your version manager's shims. /bin/sh reads /etc/profile and ~/.profile
   * and nothing else, so a fish or zsh setup silently loses everything.
   */
  const shell = o.shell ?? Deno.env.get("SHELL") ?? "/bin/sh";

  /** Hand the pane over to an interactive shell and never come back. */
  const handOver = async (): Promise<never> => {
    const child = spawn([shell, "-l"], o.dir);
    await record(child.pid, true);
    const status = await child.status;
    await clearState(o.identity.key);
    Deno.exit(status.code);
  };

  /**
   * End the pane, or keep it as a shell.
   *
   * Keeping it also sidesteps a Ghostty heuristic: on macOS it cannot tell a
   * fast success from a failed exec, so any command exiting sooner than
   * `abnormal-command-exit-runtime` is reported as "Ghostty failed to launch
   * the requested command" — alarming, and wrong.
   */
  const finish = async (code: number): Promise<never> => {
    if (!o.keep) {
      await clearState(o.identity.key);
      Deno.exit(code);
    }
    dress();
    return await handOver();
  };

  dress();

  // Register immediately: the pane is live from here, command or not.
  await record(null, o.command === null);

  /**
   * Ctrl-C reaches the whole foreground process group, so the supervisor gets
   * it alongside the command. It means "stop this", not "the pane died" —
   * so stop supervising, but otherwise let the pane finish the way it would
   * if the command had exited on its own, honouring `keep`.
   *
   * Without this the supervisor exits outright, which also means Ctrl-C at an
   * idle shell prompt closes the pane.
   */
  let interrupted = false;
  try {
    Deno.addSignalListener("SIGINT", () => {
      interrupted = true;
    });
  } catch {
    // Not listenable everywhere; best effort.
  }

  // SIGTERM and SIGHUP mean something else is shutting us down. Leaving a
  // record behind would make a dead pane look alive; readState prunes those
  // anyway, but clearing up front keeps `ls` honest immediately.
  for (const sig of ["SIGTERM", "SIGHUP"] as const) {
    try {
      Deno.addSignalListener(sig, () => {
        clearState(o.identity.key).finally(() => Deno.exit(143));
      });
    } catch {
      // Not all signals are listenable everywhere; best effort.
    }
  }

  if (o.command === null) return await handOver();

  let attempt = 0;

  while (true) {
    // The first run starts fresh; every relaunch picks up where it left off.
    const cmd = attempt++ === 0 ? o.command : (o.resumeCommand ?? o.command);

    const startedAt = Date.now();
    // Separate flags, not -lc: fish doesn't bundle short options.
    const child = spawn([shell, "-l", "-c", cmd], o.dir);
    await record(child.pid, false);

    const status = await child.status;
    const uptime = (Date.now() - startedAt) / 1000;

    // A clean exit means it was meant: /exit, Ctrl-D, or the job finished.
    if (status.success) {
      if (o.keep) console.error(`\nghosttack: ${o.label} finished.`);
      return await finish(0);
    }

    // You asked it to stop. Don't argue by starting it again.
    if (interrupted) return await finish(status.code || 130);

    if (!o.supervise) {
      console.error(`\nghosttack: ${o.label} exited (code ${status.code}).`);
      return await finish(status.code || 1);
    }

    if (uptime < MIN_UPTIME_SECONDS) {
      console.error(
        `\nghosttack: ${o.label} exited after ${uptime.toFixed(1)}s ` +
          `(code ${status.code}) — not relaunching.`,
      );
      return await finish(status.code || 1);
    }

    dress();
    console.error(`\nghosttack: relaunching ${o.label}…\n`);
  }
}
