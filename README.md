# ghosttack

[![Lint and test](https://github.com/cameronmurphy/ghosttack/actions/workflows/lint-and-test.yml/badge.svg)](https://github.com/cameronmurphy/ghosttack/actions/workflows/lint-and-test.yml)

Spin up a whole [Ghostty](https://ghostty.org) workspace from one file.

A stack is a `.toml` file describing tabs, splits, working directories, commands and colours. `ghosttack webapp` builds
it — every service in its own tab, every tab laid out the way you left it.

macOS only: tabs and splits are created through Ghostty's AppleScript dictionary, which was added in Ghostty 1.3.

## Install

Grab a binary with `curl` and put it on your `PATH`:

```shell
curl -fsSLo ghosttack \
  https://github.com/cameronmurphy/ghosttack/releases/latest/download/ghosttack-aarch64-apple-darwin
sudo install -m 755 ghosttack /opt/homebrew/bin/ghosttack
```

On an Intel Mac swap in `ghosttack-x86_64-apple-darwin`.

Or run it straight from JSR:

```shell
deno install -Ag -n ghosttack jsr:@camurphy/ghosttack
```

The first `ghosttack` writes an example stack and explains itself.

## Usage

```
ghosttack                      build default.toml, or introduce itself if there isn't one
ghosttack webapp               build ~/.config/ghosttack/webapp.toml
ghosttack webapp --dry-run     print the AppleScript instead of running it
ghosttack webapp --close       build it, then close the tab you ran this from
ghosttack webapp --no-close    build it and keep that tab, whatever the stack says
ghosttack ls [stack]           show stacks and which panes are live
ghosttack restart [stack]      restart panes that come back
ghosttack --self-update        replace this binary with the latest release
ghosttack --version            print the version
```

### Keeping up to date

`--self-update` asks GitHub for the latest release, and if it's newer than what you're running, downloads the build for
your architecture and replaces the binary in place:

```shell
ghosttack --self-update
```

It writes the new binary beside the old one and renames it over the top, which is atomic and works on a file that is
currently executing. Nothing is moved into place until the download has arrived whole, looks like a macOS binary, and
matches its SHA-256 in the `SHA256SUMS` published with the release — so a flaky connection can't leave you with a
ghosttack that won't start. A release without that file, or a hash that doesn't line up, stops the update rather than
falling back to a weaker check. If the install directory isn't yours to write to it'll say so, and
`sudo ghosttack --self-update` finishes the job.

To check a download by hand:

```shell
curl -fsSLO https://github.com/cameronmurphy/ghosttack/releases/latest/download/SHA256SUMS
sha256sum --ignore-missing -c SHA256SUMS
```

Installed from JSR rather than a release binary? There's nothing to replace — re-run the `deno install` line above.

### Closing the tab you started from

`--close` gets rid of the tab you launched from once the stack is up, leaving only the panes the stack describes. It
closes whether or not something is still running there, and it goes last — if building fails the tab stays put, with the
error still on screen.

Put `close = true` at the top of a stack to get it every time, which is what you want for a `default.toml` you run each
morning. `--close` and `--no-close` override the file for a single run.

Finding the tab means taking the selected tab of the front window, which is only the right answer for someone typing
into it. So this needs an interactive Ghostty terminal: run from another terminal, a script or a coding agent, `--close`
refuses outright and `close = true` says so and builds the stack anyway.

Stacks live in `~/.config/ghosttack` (or `$XDG_CONFIG_HOME/ghosttack`). Name one `default.toml` and a bare `ghosttack`
builds it.

macOS will ask once for permission to control Ghostty. Without it nothing happens — the prompt is under System Settings
→ Privacy & Security → Automation.

## Stacks

```toml
# Default working directory for tabs that don't set their own.
dir = "~/Source/webapp"

[[tab]]
name    = "api"
color   = "red"
dir     = "~/Source/webapp/api"
command = "docker compose up"

  [[tab.split]]
  direction = "down"
  command   = "npm run dev"

    [[tab.split.split]]
    direction = "down"
    command   = "some-agent"
    resume    = "some-agent --resume"
```

| Key         | Applies to        | Meaning                                                                                                         |
| ----------- | ----------------- | --------------------------------------------------------------------------------------------------------------- |
| `name`      | tab               | Names the tab. Set through Ghostty, so a shell that retitles on every prompt can't overwrite it.                |
| `color`     | tab               | `red` `orange` `yellow` `green` `blue` `purple` `brown` `black` `white`, or a hex value matched to the nearest. |
| `icon`      | tab               | Overrides the coloured dot `color` picks, with any glyph you like.                                              |
| `dir`       | stack, tab, split | Working directory. Falls back outward: split → tab → stack → `~`.                                               |
| `command`   | tab, split        | What to run. Omit it for an interactive shell.                                                                  |
| `direction` | split             | `right` `left` `up` `down`.                                                                                     |
| `resume`    | tab, split        | `true` to relaunch when the process dies, or a command to relaunch with instead.                                |
| `keep`      | tab, split        | Leave a shell in the pane when the command finishes. On by default.                                             |
| `shell`     | stack, tab, split | Login shell to run commands under. Defaults to `$SHELL`.                                                        |
| `tint`      | tab, split        | Hex background colour for the pane interior.                                                                    |
| `close`     | stack             | Close the tab you launched from once the stack is up. `--close` / `--no-close` override it.                     |

### Nesting is the layout

A split divides the pane it is nested inside. `[[tab.split]]` divides the tab's main pane; `[[tab.split.split]]` divides
the split above it. Indentation is cosmetic — the table header is what counts, and two `[[tab.split]]` siblings both
divide the main pane, landing in reverse order.

`ghosttack ls` renders the tree a stack will actually build, which is the quickest way to check.

### Colour

Ghostty's right-click tab colour is not scriptable — no AppleScript property, no action, no escape sequence — so `color`
puts a coloured dot in front of the tab name instead. `tint` is separate, and colours the pane interior via OSC 11.

### Coming back

A pane with `resume` relaunches whenever its process dies, including when something outside ghosttack kills it:

```shell
brew upgrade --cask some-tool && killall some-tool
```

Every pane returns on the new build. Give `resume` a command rather than `true` when coming back should differ from
starting up — the first launch begins clean, the relaunch picks up where it left off. Ctrl-C is exempt: it means stop,
so a pane interrupted by hand stays stopped.

## Dev setup (macOS)

Install [Homebrew](https://brew.sh).

```shell
brew bundle
```

Ensure `mise activate` is [in your shell rc/profile](https://mise.jdx.dev/cli/activate.html). If it needed to be added,
restart your terminal session.

```shell
mise install
```

```shell
deno task verify   # fmt, lint, type check, tests
deno task build    # dist/ghosttack
```

## Licence

MIT
