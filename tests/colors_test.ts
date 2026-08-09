import { assert, assertEquals, assertThrows } from '@std/assert';
import { COLOR_NAMES, colorEmoji } from '../src/colors.ts';
import { GhosttackError } from '../src/errors.ts';
import { parseStack, tabTitle } from '../src/config.ts';

Deno.test('every palette name resolves to a glyph', () => {
  for (const name of COLOR_NAMES) {
    const emoji = colorEmoji(name, 'test');
    assert(emoji.length > 0, `${name} produced nothing`);
    assert(emoji !== 'undefined', `${name} produced undefined`);
  }
});

Deno.test('names are case and whitespace insensitive', () => {
  assertEquals(colorEmoji('BLUE', 'test'), colorEmoji('blue', 'test'));
  assertEquals(colorEmoji('  Blue  ', 'test'), colorEmoji('blue', 'test'));
});

Deno.test('a colour with no glyph is rejected, and lists the valid names', () => {
  for (const bad of ['pink', 'teal', 'chartreuse', 'rebeccapurple']) {
    const e = assertThrows(
      () => colorEmoji(bad, `tab "x"`),
      GhosttackError,
      'color must be',
    );
    // The message has to be actionable, not just a refusal.
    assert((e as Error).message.includes('blue'), 'should list valid names');
  }
});

Deno.test('inherited Object properties are not colours', () => {
  // `in` would accept every one of these and yield an undefined glyph.
  for (const bad of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
    assertThrows(() => colorEmoji(bad, 'test'), GhosttackError, 'color must be');
  }
});

Deno.test('hex picks the nearest swatch', () => {
  assertEquals(colorEmoji('#3b82f6', 'test'), '🔵');
  assertEquals(colorEmoji('#ff0000', 'test'), '🔴');
  assertEquals(colorEmoji('#000000', 'test'), '⚫');
  assertEquals(colorEmoji('#ffffff', 'test'), '⚪');
});

Deno.test('a bad colour fails when the stack loads, not at launch', () => {
  assertThrows(
    () => parseStack('demo', `[[tab]]\nname="a"\ncolor="pink"\n`),
    GhosttackError,
    `tab "a": color must be`,
  );
});

Deno.test('color becomes the tab glyph, and icon overrides it', () => {
  const stack = parseStack(
    'demo',
    `[[tab]]
name = "named"
color = "blue"

[[tab]]
name = "overridden"
color = "blue"
icon = "🚀"

[[tab]]
name = "plain"
`,
  );

  assertEquals(tabTitle(stack.tabs[0]), '🔵 named');
  assertEquals(tabTitle(stack.tabs[1]), '🚀 overridden');
  assertEquals(tabTitle(stack.tabs[2]), 'plain');
});

Deno.test('tint must be hex, and is rejected per tab and per split', () => {
  assertThrows(
    () => parseStack('demo', `[[tab]]\nname="a"\ntint="blue"\n`),
    GhosttackError,
    'tint must be #rrggbb',
  );
  assertThrows(
    () =>
      parseStack(
        'demo',
        `[[tab]]\nname="a"\n  [[tab.split]]\n  direction="right"\n  tint="nope"\n`,
      ),
    GhosttackError,
    'tint must be #rrggbb',
  );
});
