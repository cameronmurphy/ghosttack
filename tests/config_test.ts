import { assert, assertEquals, assertThrows } from "@std/assert";
import {
  paneCount,
  parseStack,
  resumeCommand,
  supervises,
  tabCommand,
  tabPanes,
  tabTitle,
} from "../src/config.ts";
import { GhosttackError } from "../src/errors.ts";

const HOME = Deno.env.get("HOME")!;

Deno.test("parses tabs and splits", () => {
  const stack = parseStack(
    "demo",
    `
dir = "~/Source"

[[tab]]
name = "api"

  [[tab.split]]
  direction = "right"
  command   = "bin/dev"

  [[tab.split]]
  direction = "down"
  of        = 1
  command   = "tail -f log/dev.log"

[[tab]]
name = "scratch"
`,
  );

  assertEquals(stack.tabs.length, 2);
  assertEquals(stack.tabs[0].split.length, 2);
  assertEquals(paneCount(stack), 4);
});

Deno.test("dir precedence is split, then tab, then stack", () => {
  const stack = parseStack(
    "demo",
    `
dir = "~/stack"

[[tab]]
name = "inherits"

[[tab]]
name = "own"
dir  = "~/tab"

  [[tab.split]]
  direction = "right"

  [[tab.split]]
  direction = "left"
  dir       = "~/split"
`,
  );

  assertEquals(stack.tabs[0].dir, `${HOME}/stack`);
  assertEquals(stack.tabs[1].dir, `${HOME}/tab`);
  // A split with no dir of its own follows its tab, not the stack.
  assertEquals(stack.tabs[1].split[0].dir, `${HOME}/tab`);
  assertEquals(stack.tabs[1].split[1].dir, `${HOME}/split`);
});

Deno.test("unnamed tabs get positional names", () => {
  const stack = parseStack("demo", `[[tab]]\n\n[[tab]]\n`);
  assertEquals(stack.tabs.map((t) => t.name), ["tab1", "tab2"]);
});

Deno.test("a bare ~ expands to the home directory", () => {
  const stack = parseStack("demo", `dir = "~"\n[[tab]]\nname = "a"\n`);
  assertEquals(stack.tabs[0].dir, HOME);
});

Deno.test("rejects a stack with no tabs", () => {
  assertThrows(() => parseStack("demo", `dir = "~"`), GhosttackError, "no [[tab]]");
});

Deno.test("rejects duplicate tab names", () => {
  assertThrows(
    () => parseStack("demo", `[[tab]]\nname="a"\n\n[[tab]]\nname="a"\n`),
    GhosttackError,
    "duplicate tab name",
  );
});

Deno.test("rejects an unknown split direction", () => {
  assertThrows(
    () =>
      parseStack(
        "demo",
        `[[tab]]\nname="a"\n  [[tab.split]]\n  direction = "sideways"\n`,
      ),
    GhosttackError,
    "direction must be one of",
  );
});

Deno.test("rejects invalid TOML with the stack name attached", () => {
  const e = assertThrows(
    () => parseStack("webapp", `[[tab]\nname=`),
    GhosttackError,
  );
  assert((e as Error).message.includes("webapp.toml"));
});

Deno.test("icon prefixes the tab title", () => {
  const stack = parseStack(
    "demo",
    `[[tab]]\nname="api"\nicon="🔵"\n\n[[tab]]\nname="bare"\n`,
  );
  assertEquals(tabTitle(stack.tabs[0]), "🔵 api");
  // No icon means the title is just the name — no stray leading space.
  assertEquals(tabTitle(stack.tabs[1]), "bare");
});

Deno.test("keep is readable per tab and per split", () => {
  const stack = parseStack(
    "demo",
    `[[tab]]
name = "a"
keep = false
  [[tab.split]]
  direction = "right"
  keep = false
  [[tab.split]]
  direction = "left"
`,
  );
  assertEquals(stack.tabs[0].keep, false);
  assertEquals(stack.tabs[0].split[0].keep, false);
  // Unset stays undefined so the command layer can pick the default.
  assertEquals(stack.tabs[0].split[1].keep, undefined);
});

Deno.test("a tab with no command runs a shell", () => {
  const stack = parseStack("demo", `[[tab]]\nname="plain"\n`);
  assertEquals(tabCommand(stack.tabs[0]), null);
});

Deno.test("resume decides whether a pane comes back", () => {
  const stack = parseStack(
    "demo",
    `[[tab]]
name = "same"
command = "bin/dev"
resume = true

[[tab]]
name = "different"
command = "new-session"
resume = "resume-session"

[[tab]]
name = "off"
command = "bin/dev"
resume = false

[[tab]]
name = "unset"
command = "bin/dev"
`,
  );
  const [same, different, off, unset] = stack.tabs;

  assertEquals(supervises(same.resume), true);
  assertEquals(supervises(different.resume), true);
  assertEquals(supervises(off.resume), false);
  assertEquals(supervises(unset.resume), false);

  // `resume = true` means "come back", not "come back differently" — the pane
  // layer reuses the original command, so there's nothing to override with.
  assertEquals(resumeCommand(same.resume), undefined);
  assertEquals(resumeCommand(different.resume), "resume-session");
  assertEquals(resumeCommand(off.resume), undefined);
  assertEquals(resumeCommand(unset.resume), undefined);
});

Deno.test("resume works per split as well as per tab", () => {
  const stack = parseStack(
    "demo",
    `[[tab]]
name = "a"
  [[tab.split]]
  direction = "right"
  command = "bin/dev"
  resume = true
  [[tab.split]]
  direction = "down"
  command = "tail -f log"
`,
  );
  assertEquals(supervises(stack.tabs[0].split[0].resume), true);
  assertEquals(supervises(stack.tabs[0].split[1].resume), false);
});

Deno.test("rejects a resume that is neither a boolean nor a command", () => {
  assertThrows(
    () => parseStack("demo", `[[tab]]\nname="a"\nresume=3\n`),
    GhosttackError,
    "resume must be true, false, or a command string",
  );
  // An empty string would silently mean "come back with nothing".
  assertThrows(
    () => parseStack("demo", `[[tab]]\nname="a"\nresume="  "\n`),
    GhosttackError,
    "resume must be true, false, or a command string",
  );
});

Deno.test("nesting decides which pane a split divides", () => {
  const nested = parseStack(
    "demo",
    `[[tab]]
name = "a"
  [[tab.split]]
  direction = "right"
    [[tab.split.split]]
    direction = "down"
`,
  );
  const flat = parseStack(
    "demo",
    `[[tab]]
name = "a"
  [[tab.split]]
  direction = "right"
  [[tab.split]]
  direction = "down"
`,
  );

  // Identical directions, different shapes: nested splits the pane above it,
  // flat splits the tab's main pane.
  assertEquals(tabPanes(nested.tabs[0]).map((p) => [p.index, p.parent]), [
    [1, 0],
    [2, 1],
  ]);
  assertEquals(tabPanes(flat.tabs[0]).map((p) => [p.index, p.parent]), [
    [1, 0],
    [2, 0],
  ]);
});

Deno.test("panes are numbered depth-first, parents before children", () => {
  const stack = parseStack(
    "demo",
    `[[tab]]
name = "a"
  [[tab.split]]
  direction = "right"
    [[tab.split.split]]
    direction = "down"
      [[tab.split.split.split]]
      direction = "right"
  [[tab.split]]
  direction = "left"
`,
  );

  const panes = tabPanes(stack.tabs[0]);
  assertEquals(panes.map((p) => p.index), [1, 2, 3, 4]);
  assertEquals(panes.map((p) => p.parent), [0, 1, 2, 0]);
  assertEquals(panes.map((p) => p.depth), [0, 1, 2, 0]);

  // Every pane's parent is built before it — nothing splits a pane that
  // doesn't exist yet.
  for (const p of panes) assert(p.parent < p.index);
});

Deno.test("splits inherit dir down the nesting", () => {
  const stack = parseStack(
    "demo",
    `[[tab]]
name = "a"
dir = "/tab"
  [[tab.split]]
  direction = "right"
  dir = "/outer"
    [[tab.split.split]]
    direction = "down"
`,
  );
  const [outer, inner] = tabPanes(stack.tabs[0]);
  assertEquals(outer.split.dir, "/outer");
  // The inner split follows its parent split, not the tab.
  assertEquals(inner.split.dir, "/outer");
});

Deno.test("paneCount counts the whole tree", () => {
  const stack = parseStack(
    "demo",
    `[[tab]]
name = "a"
  [[tab.split]]
  direction = "right"
    [[tab.split.split]]
    direction = "down"

[[tab]]
name = "b"
`,
  );
  // tab a: main + 2 splits, tab b: main only
  assertEquals(paneCount(stack), 4);
});
