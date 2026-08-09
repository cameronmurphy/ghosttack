import { assertEquals } from '@std/assert';
import { join } from '@std/path';

const HOME = Deno.env.get('HOME')!;
const { DEFAULT_STACK, stackDir, stackExists, stackPath } = await import(
  '../src/paths.ts'
);

const withEnv = async (env: Record<string, string | null>, fn: () => unknown) => {
  const prior = Object.fromEntries(
    Object.keys(env).map((k) => [k, Deno.env.get(k) ?? null]),
  );
  for (const [k, v] of Object.entries(env)) {
    v === null ? Deno.env.delete(k) : Deno.env.set(k, v);
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(prior)) {
      v === null ? Deno.env.delete(k) : Deno.env.set(k, v);
    }
  }
};

Deno.test('stacks live under ~/.config by default', async () => {
  await withEnv({ GHOSTTACK_CONFIG_DIR: null, XDG_CONFIG_HOME: null }, () => {
    assertEquals(stackDir(), join(HOME, '.config', 'ghosttack'));
    assertEquals(
      stackPath('webapp'),
      join(HOME, '.config', 'ghosttack', 'webapp.toml'),
    );
  });
});

Deno.test('XDG_CONFIG_HOME is honoured', async () => {
  await withEnv({ GHOSTTACK_CONFIG_DIR: null, XDG_CONFIG_HOME: '/xdg' }, () => {
    assertEquals(stackDir(), join('/xdg', 'ghosttack'));
  });
});

Deno.test('GHOSTTACK_CONFIG_DIR wins over XDG', async () => {
  await withEnv({ GHOSTTACK_CONFIG_DIR: '/explicit', XDG_CONFIG_HOME: '/xdg' }, () => {
    assertEquals(stackDir(), '/explicit');
  });
});

Deno.test('the default stack is detected only when its file exists', async () => {
  const dir = await Deno.makeTempDir({ prefix: 'ghosttack-cfg-' });
  await withEnv({ GHOSTTACK_CONFIG_DIR: dir }, async () => {
    assertEquals(await stackExists(DEFAULT_STACK), false);
    await Deno.writeTextFile(stackPath(DEFAULT_STACK), `[[tab]]\nname="a"\n`);
    assertEquals(await stackExists(DEFAULT_STACK), true);
    // A directory of the right name is not a stack.
    await Deno.mkdir(stackPath('adir'));
    assertEquals(await stackExists('adir'), false);
  });
  await Deno.remove(dir, { recursive: true });
});
