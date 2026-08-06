import {
  findTab,
  loadStack,
  resumeCommand,
  supervises,
  tabCommand,
  tabPanes,
} from "../config.ts";
import { fail } from "../errors.ts";
import { runPane } from "../pane.ts";
import { paneKey } from "../state.ts";

/** Run a tab's main pane. This is what a generated tab executes. */
export async function cmdRun(stackName: string, tabName: string) {
  const stack = await loadStack(stackName);
  const tab = findTab(stack, tabName);
  const command = tabCommand(tab);
  const key = paneKey(stackName, tab.name, 0);

  await runPane({
    label: tab.name,
    dir: tab.dir,
    shell: tab.shell,
    command,
    resumeCommand: resumeCommand(tab.resume),
    color: tab.tint,
    supervise: supervises(tab.resume),
    // Leave a usable shell behind rather than a dead pane.
    keep: tab.keep ?? true,
    identity: {
      key,
      stack: stackName,
      tab: tab.name,
      pane: 0,
      dir: tab.dir,
      cmd: command ?? "shell",
    },
  });
}

/** Run one of a tab's splits. This is what a generated split executes. */
export async function cmdPane(
  stackName: string,
  tabName: string,
  index: string,
) {
  const stack = await loadStack(stackName);
  const tab = findTab(stack, tabName);

  const idx = Number(index);
  const split = tabPanes(tab).find((p) => p.index === idx)?.split;
  if (!split) fail(`tab "${tabName}" has no split #${index}.`);

  const key = paneKey(stackName, tab.name, idx);

  await runPane({
    label: tab.name,
    dir: split.dir,
    shell: split.shell,
    command: split.command ?? null,
    resumeCommand: resumeCommand(split.resume),
    color: split.tint ?? tab.tint,
    supervise: supervises(split.resume),
    keep: split.keep ?? true,
    identity: {
      key,
      stack: stackName,
      tab: tab.name,
      pane: idx,
      dir: split.dir,
      cmd: split.command ?? "shell",
    },
  });
}
