# Aion

A local, single-player ambient game of exploration that ships with nothing in
it. You play in a browser while your terminal coding agent writes the game
around you: every place, texture and sound, and the questions that begin it.
In the fiction the agent is the Oracle, and you are the Seeker.

No two descents are the same, because none of it exists until you arrive.

## Play

Clone this repository, open a coding agent in it, and ask:

> Read PLAY.md and start Aion. I'd like to play.

The agent gives you the localhost link and asks you to **say GO**. After that,
leave its turn running while you play, and turn your sound on.

- You begin in an empty dark, without a form. That is not a bug.
- The Oracle tells a few moments of your life and asks what you did. Your
  answers decide what you are, what you carry and where you find yourself.
- A place may have rules of its own to work out, and things worth touching.
- The Oracle watches how you play. The next place is made from it. It never
  says so.
- If you reach the way on before the next place is written, you wait in
  nothing until it is.

**Q → Enter** saves and quits the session.

Requires Node.js 22+ and a coding agent with shell/file tools and enough
execution time to continue its tool loop. Git enables the game history; no
GitHub account is required. Your agent's normal model usage applies. No API
key is built into Aion and no second agent process is launched.

## Controls

**Move:** arrows / WASD (diagonals: Y U B N). **Hold still:** Space / period.
**Take or use what is here:** E. **Set a carried thing down:** R.
**Use a carried thing:** F. **Recall what is carried:** I.
**Look:** X, then a direction, or click a nearby tile; Escape closes.
**Help:** ?. **Mute:** M. **Fullscreen:** starts on the first key or click; Enter toggles. **Quit:** Q.

Without an agent `npm start` still runs, but there is nothing to find: the
game is the writing.

**History** opens a paginated list of the game's Git commits.

## Continue over weeks and months

Quit with Q, then start Aion again whenever you want to continue. The save,
published game and local history persist; your agent reads a compact handoff
rather than replaying the whole conversation.

- Working notes are limited to 100 lines / 8 KiB; earlier versions are archived.
- Seeker records live in a local chronicle, surviving the end of a Seeker.
- Atomic saves have a previous-save fallback and 14 daily checkpoints.
- Startup trims release snapshots to the latest 20 plus versions pinned by saves.
- Slow connections keep only one in-flight and one latest pending save.

See [memory and recovery](docs/MEMORY.md) for retention and recovery.

## What ships

- An engine with six verbs (walk, look, touch, carry, hold still, choose),
  place shapes, field of view, choices and tellings, and a record of conduct.
- A sound engine: one-shot sounds and continuous, cross-fading ambience.
- Local telemetry, long-poll observation, atomic saves and versioned
  ES-module publication without page reload.
- Instructions for the Oracle: launch, practice, voice and the writing format.

No openings, places, sprites or sounds ship. This is an experiment.

## Develop

### Explore and share an evolved game

`game/` is its own Git repository: the engine, and everything the Oracle has
written into it. The Oracle commits each published piece of writing there. Browse how a run changed the game:

```sh
git -C game log --oneline
git -C game show <commit>
git -C game diff <earlier-commit> <later-commit>
```

Push that game repository using your normal Git workflow to share its evolved
code and history. The server,
browser shell, agent instructions and `.aion/` runtime data are outside it. The
Oracle does not push automatically. Commit descriptions describe mechanics, not
private player messages. The initial commit captures the current evolved game;
earlier live releases remain local snapshots rather than reconstructed commits.
Shared game modules run inside a compatible Aion host; they are not a standalone
web app. Git metadata is excluded from published live modules.

### Tools

```sh
npm test
npm run check
node tools/aion.js status
node tools/aion.js watch --after 0
node tools/aion.js state
# Edit game/, then while a player is connected:
node tools/aion.js publish
```

See [the engine contract](docs/ENGINE.md). `.aion/` holds private runtime state,
the save, releases and optional Oracle notes; it is ignored by Git and is not
served to the browser. Each tab shares one saved descent; only one may control it
at a time. A stopped session resumes on the next launch. The host binds only to
loopback. No public deployment or account is involved.

MIT licensed. See `LICENSE` and `THIRD_PARTY.md`.
