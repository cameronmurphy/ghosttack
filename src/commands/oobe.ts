import { EXAMPLE_STACK } from '../example.ts';
import { DEFAULT_STACK, listStacks, stackDir, stackPath, tilde } from '../paths.ts';

/**
 * First-run introduction: drop an example stack in the config directory and
 * explain how stacks work. Safe to run repeatedly — an existing example.toml
 * is left alone, so this doubles as a "what have I got?" summary.
 */
export async function cmdOobe() {
  const dir = stackDir();
  const examplePath = stackPath('example');

  await Deno.mkdir(dir, { recursive: true });

  let wrote = false;
  try {
    await Deno.stat(examplePath);
  } catch {
    await Deno.writeTextFile(examplePath, EXAMPLE_STACK);
    wrote = true;
  }

  const stacks = await listStacks();

  console.log('ghosttack — spin up a whole Ghostty workspace from one file.\n');
  console.log(`stacks live in  ${tilde(dir)}`);

  if (wrote) {
    console.log(
      '\nwrote example.toml — two tabs, one with a split and a nested split.',
    );
  }

  if (stacks.length) {
    console.log('\navailable stacks:');
    for (const s of stacks) console.log(`  ghosttack ${s}`);
  }

  console.log(`
try it:
  ghosttack example              build it
  ghosttack example --dry-run    print the AppleScript instead

then copy it to a name of your own and build that:

  cp ${tilde(examplePath)} ${tilde(stackPath('webapp'))}
  ghosttack webapp

name one ${DEFAULT_STACK}.toml and it becomes what you get from a bare
\`ghosttack\` — the stack you start the day with:

  cp ${tilde(examplePath)} ${tilde(stackPath(DEFAULT_STACK))}
  ghosttack

other commands:
  ghosttack ls [stack]           show stacks and which panes are live
  ghosttack restart [stack]      restart panes that come back

options:
  --dry-run                      print the AppleScript instead of running it
  --close                        close the tab you ran this from once it's up
  --no-close                     keep it, overriding close = true in the stack`);
}
