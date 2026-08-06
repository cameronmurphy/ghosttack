import { buildAppleScript } from "../applescript.ts";
import { loadStack, paneCount } from "../config.ts";
import { fail } from "../errors.ts";
import { selfPath } from "../paths.ts";

export async function cmdUp(name: string, argv: string[]) {
  const stack = await loadStack(name);
  const script = buildAppleScript(selfPath(), stack);

  if (argv.includes("--dry-run")) {
    console.log(script);
    return;
  }

  const { success, stderr } = await new Deno.Command("osascript", {
    args: ["-e", script],
  }).output();

  if (!success) {
    fail(
      `osascript failed: ${new TextDecoder().decode(stderr).trim()}\n\n` +
        `If this is a permissions error, macOS needs to allow this terminal\n` +
        `to control Ghostty: System Settings > Privacy & Security > Automation.`,
    );
  }

  console.log(
    `ghosttack: ${name} — ${stack.tabs.length} tab(s), ${paneCount(stack)} pane(s).`,
  );
}
