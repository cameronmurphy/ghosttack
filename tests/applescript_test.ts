import { assert, assertEquals, assertStringIncludes } from '@std/assert';
import { buildAppleScript } from '../src/applescript.ts';
import { paneCount, parseStack } from '../src/config.ts';

const SELF = '/opt/ghosttack';

const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

Deno.test('every pane gets its own surface configuration', () => {
  const stack = parseStack(
    'demo',
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

  const script = buildAppleScript(SELF, stack);
  assertEquals(paneCount(stack), 4);
  assertEquals(count(script, 'new surface configuration'), 4);
  // Panes stay open when their command exits, so a crash stays readable.
  assertEquals(count(script, 'set wait after command of cfg to true'), 4);
});

Deno.test('splits target the pane named by `of`', () => {
  const stack = parseStack(
    'demo',
    `[[tab]]
name = "a"
  [[tab.split]]
  direction = "right"
    [[tab.split.split]]
    direction = "down"
`,
  );

  const script = buildAppleScript(SELF, stack);
  // Split 1 hangs off the main pane; split 2 nests inside split 1.
  assertStringIncludes(script, 'set t0p1 to split t0p0 direction right');
  assertStringIncludes(script, 'set t0p2 to split t0p1 direction down');
});

Deno.test('the first tab reuses a front window, later tabs do not', () => {
  const stack = parseStack('demo', `[[tab]]\nname="a"\n\n[[tab]]\nname="b"\n`);
  const script = buildAppleScript(SELF, stack);

  assertEquals(count(script, 'if hadWindow then'), 1);
  assertEquals(count(script, 'new window with configuration cfg'), 1);
  // Two tabs: one conditional, one unconditional.
  assertEquals(count(script, 'new tab in win with configuration cfg'), 2);
});

Deno.test('panes are pointed back at ghosttack itself', () => {
  const stack = parseStack(
    'demo',
    `[[tab]]\nname="api"\n  [[tab.split]]\n  direction="right"\n`,
  );
  const script = buildAppleScript(SELF, stack);

  assertStringIncludes(script, `'${SELF}' run 'demo' 'api'`);
  assertStringIncludes(script, `'${SELF}' pane 'demo' 'api' 1`);
});

Deno.test('quotes and backslashes in paths are escaped', () => {
  const stack = parseStack(
    'demo',
    String.raw`[[tab]]
name = "a"
dir = '/tmp/we"ird\path'
command = 'echo "hi"'
`,
  );

  const script = buildAppleScript(SELF, stack);
  assertStringIncludes(script, String.raw`/tmp/we\"ird\\path`);
  // No bare double quote survives inside the directory literal.
  assert(!script.includes(`"/tmp/we"ird`));
});

Deno.test('working directories reach Ghostty per pane', () => {
  const stack = parseStack(
    'demo',
    `dir = "/a"

[[tab]]
name = "t"
dir = "/b"
  [[tab.split]]
  direction = "right"
  dir = "/c"
`,
  );

  const script = buildAppleScript(SELF, stack);
  assertStringIncludes(script, `set initial working directory of cfg to "/b"`);
  assertStringIncludes(script, `set initial working directory of cfg to "/c"`);
});

Deno.test('tab titles are set through Ghostty, not an escape sequence', () => {
  const stack = parseStack(
    'demo',
    `[[tab]]\nname="api"\ncolor="blue"\n\n[[tab]]\nname="plain"\n`,
  );
  const script = buildAppleScript(SELF, stack);

  // A shell that retitles on every prompt would clobber an OSC 0 title, so the
  // tab-level override is what has to be emitted.
  assertStringIncludes(script, `perform action "set_tab_title:🔵 api" on t0p0`);
  assertStringIncludes(script, `perform action "set_tab_title:plain" on t1p0`);
  assertEquals(count(script, 'set_tab_title'), 2);
});

Deno.test("a quote in a tab name can't break out of the action string", () => {
  const stack = parseStack('demo', `[[tab]]\nname = 'we"ird'\n`);
  const script = buildAppleScript(SELF, stack);
  assertStringIncludes(script, String.raw`set_tab_title:we\"ird`);
});

Deno.test('names with spaces survive the shell', () => {
  const stack = parseStack(
    'my stack',
    `[[tab]]
name = "daily stuff"
  [[tab.split]]
  direction = "right"
`,
  );
  const script = buildAppleScript('/opt/my tools/ghosttack', stack);

  // Ghostty runs the command through bash -c, so every argument that can
  // contain a space has to arrive as one word.
  assertStringIncludes(
    script,
    `'/opt/my tools/ghosttack' run 'my stack' 'daily stuff'`,
  );
  assertStringIncludes(
    script,
    `'/opt/my tools/ghosttack' pane 'my stack' 'daily stuff' 1`,
  );
});

Deno.test("a quote in a name can't break out of the shell command", () => {
  const stack = parseStack('demo', `[[tab]]\nname = "it's fine"\n`);
  const script = buildAppleScript(SELF, stack);
  // Closed, escaped, reopened — the classic single-quote dance.
  assertStringIncludes(script, `'it'\\\\''s fine'`);
});

Deno.test("a tab name can't inject a second shell command", () => {
  const stack = parseStack('demo', `[[tab]]\nname = "a; touch /tmp/pwned"\n`);
  const script = buildAppleScript(SELF, stack);
  assertStringIncludes(script, `'a; touch /tmp/pwned'`);
  // The semicolon stays inside the quotes rather than ending the command.
  assert(!script.includes(`ghosttack run demo a; touch`));
});

Deno.test('--close captures the launching tab before any new ones exist', () => {
  const stack = parseStack('demo', `[[tab]]\nname = "a"\n`);
  const script = buildAppleScript(SELF, stack, { closeOrigin: true });

  // Captured before the first `new tab`, or it would grab a tab we just built.
  const captured = script.indexOf('set originTab to selected tab of front window');
  const built = script.indexOf('new tab in win');
  assert(captured !== -1);
  assert(captured < built, 'origin tab must be captured before tabs are created');

  // Closed last, so a failure part way leaves the tab alive to read the error.
  assertStringIncludes(script, 'if originTab is not missing value then close tab originTab');
  assert(script.indexOf('close tab originTab') > script.lastIndexOf('perform action'));
});

Deno.test('without --close nothing is closed', () => {
  const stack = parseStack('demo', `[[tab]]\nname = "a"\n`);
  const script = buildAppleScript(SELF, stack);
  assert(!script.includes('close tab'));
  assert(!script.includes('originTab'));
});

Deno.test('--close survives a first run with no window open', () => {
  const stack = parseStack('demo', `[[tab]]\nname = "a"\n`);
  const script = buildAppleScript(SELF, stack, { closeOrigin: true });
  // No window means no launching tab, so the close is guarded rather than
  // reaching for a tab that was never there.
  assertStringIncludes(script, 'set originTab to missing value');
  assertStringIncludes(script, 'if hadWindow then set originTab to');
});
