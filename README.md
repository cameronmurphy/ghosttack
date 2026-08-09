# ghosttack

[![Lint and test](https://github.com/cameronmurphy/ghosttack/actions/workflows/lint-and-test.yml/badge.svg)](https://github.com/cameronmurphy/ghosttack/actions/workflows/lint-and-test.yml)

Spin up a whole [Ghostty](https://ghostty.org) workspace from one file.

A stack is a `.toml` file describing tabs, splits, working directories, commands and colours. `ghosttack webapp` builds
it — every service in its own tab, every tab laid out the way you left it.

macOS only: tabs and splits are created through Ghostty's AppleScript dictionary, which was added in Ghostty 1.3.

## Install

Download a binary from [releases](https://github.com/cameronmurphy/ghosttack/releases) and put it on your `PATH`:

```shell
sudo mv ghosttack-aarch64-apple-darwin /opt/homebrew/bin/ghosttack
sudo chmod +x /opt/homebrew/bin/ghosttack
```

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
ghosttack ls [stack]           show stacks and which panes are live
ghosttack restart [stack]      restart panes that come back
```

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
