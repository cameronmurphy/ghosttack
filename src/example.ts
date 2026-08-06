/**
 * The starter stack written by the first run.
 *
 * Kept as a string rather than a sibling .toml so the compiled binary stays
 * self-contained — `deno compile` embeds this, but would not carry a loose
 * data file along with it.
 */
export const EXAMPLE_STACK = `# ghosttack stack file.
#
# Run it with:  ghosttack example
#
# Every stack is a .toml file in ~/.config/ghosttack, so webapp.toml becomes
# \`ghosttack webapp\`. Copy this file, rename it, and point it at your own
# projects.
#
# Name one default.toml and a bare \`ghosttack\` builds it — the stack you
# start the day with.

# Default working directory for tabs that don't set their own.
dir = "~"

# ---------------------------------------------------------------------------
# A tab with three panes: a shell on the left, two stacked on the right.
#
#   name       names the tab. Set through Ghostty itself, so a shell that
#              retitles on every prompt can't overwrite it.
#   color      colours the tab. Ghostty's right-click tab colour is not
#              scriptable — no AppleScript property, no action, no escape
#              sequence — so this puts a coloured dot in front of the name:
#                red  orange  yellow  green  blue  purple  brown  black  white
#              A hex value like "#3b82f6" also works and picks the nearest.
#   icon       overrides the dot with any glyph you like, if you'd rather.
#   dir        working directory. Falls back to the tab's, then the stack's.
#   command    what to run. Omit it for an interactive shell.
#   tint       hex background colour for the pane interior, via OSC 11.
#   resume     bring the pane back when its process dies.
#                true    relaunch with the same command
#                "cmd"   relaunch with this instead, so a fresh start and a
#                        return can differ
#                false   don't come back (the default)
#   keep       when the command finishes, leave a shell in the pane instead
#              of ending it. On by default.
# ---------------------------------------------------------------------------

[[tab]]
name  = "workspace"
color = "blue"
tint  = "#1f242a"

  # direction is right | left | up | down.
  #
  # A split divides the pane it is nested inside. This one divides the tab's
  # main pane, putting a second pane to its right:
  [[tab.split]]
  direction = "right"
  command   = "echo 'this split ran a command, then left you a shell'"

    # ...and this one is nested a level deeper, so it divides the pane above
    # rather than the main pane — stacking under it instead of beside it:
    [[tab.split.split]]
    direction = "down"
    command   = "echo 'a split of a split — stacked under the one above'"

# ---------------------------------------------------------------------------
# A plain second tab: no splits, just a shell somewhere useful.
# ---------------------------------------------------------------------------

[[tab]]
name  = "scratch"
color = "orange"
dir   = "~"

# ---------------------------------------------------------------------------
# A tab that comes back.
#
# A pane with "resume" relaunches whenever its process dies — including when
# something outside ghosttack kills it. That makes upgrades cheap: update the
# tool, kill its processes, and every pane returns on the new build.
#
# Give resume a command instead of true when coming back should differ from
# starting up: the first launch begins clean, the relaunch picks up where it
# left off, so being killed mid-flight doesn't cost you your place.
#
# Uncomment and point dir at a real project to use it.
# ---------------------------------------------------------------------------

# [[tab]]
# name    = "api"
# color   = "purple"
# dir     = "~/Source/api"
# command = "bin/dev"
# resume  = true

# [[tab]]
# name    = "session"
# color   = "green"
# dir     = "~/Source/api"
# command = "some-tool new-session"
# resume  = "some-tool resume"
`;
