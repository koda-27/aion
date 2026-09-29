# An Aion dungeon

The evolving game for **Aion**, a local browser roguelike developed live by the
player's terminal coding agent. This repository contains its rules, creatures,
world generation, text-authored sprites and Web Audio recipes. Each development
is a Git commit; browse the history to see how this dungeon grew.

## Play this version

Use an Aion host (Node.js 22+, game ABI 1). With its server stopped, put this
repository in the host's `game/` directory, run `npm ci` from the host directory,
then `npm start`. A **fresh host** starts this game's current source. An existing
host resumes its saved published version; use the Oracle's normal publication
flow to bring new source into that descent.

The host supplies Canvas rendering, input, audio playback, rot.js, local saves
and hot-swapping. These game modules are not a standalone website. To develop
while playing, ask your own coding agent to follow the host's `PLAY.md`.

The shared repository contains no player saves or private Oracle notes. GitHub
sharing publishes committed code and its history, not a recording of a run.

## Files

- `index.js`: creation, actions, migrations, descriptions and floor generation.
- `art.js`: square text sprite masks and synthesized sound recipes.
- Additional relative `.js` modules may be introduced as the game evolves.

MIT licensed; see `LICENSE`.
