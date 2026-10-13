# An Aion game

The game modules for **Aion**, a local ambient game of exploration written
live by the player's terminal coding agent. A fresh copy holds only the engine:
no openings, places, sprites or sounds. Whatever is under `written/` was
written by an Oracle for one player, and each piece is a Git commit.

## Play this version

Use an Aion host (Node.js 22+, game ABI 1). With its server stopped, put this
repository in the host's `game/` directory, run `npm ci` from the host
directory, then ask your coding agent to follow the host's `PLAY.md`. A fresh
host starts this game's current source; an existing host resumes its saved
published version.

The host supplies Canvas rendering, input, audio playback, rot.js, local saves
and hot-swapping. These modules are not a standalone website.

The repository contains no player saves or private Oracle notes.

## Files

- `index.js`: the engine: verbs, stages, generation, presentation.
- `kit.js`: the helpers handed to written places and stories.
- `thread.js`: the register of what has been written, by Seeker number.
- `art.js`: plain fallback sprites and sounds.
- `written/`: openings, places and passages, once an Oracle has written any.

MIT licensed; see `LICENSE`.
