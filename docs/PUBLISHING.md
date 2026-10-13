# Distributing Aion

Aion's source is MIT licensed; rot.js is BSD-3-Clause (see `THIRD_PARTY.md`).
Players bring their own terminal coding agent. No hosted backend, API key,
model SDK or GitHub integration is part of the game.

## Clean source distribution

From the host directory:

```sh
npm ci
npm test
npm run check
npm audit
npm run export
```

`dist/aion-0.2.1/` contains the host, documentation, tests and current game source.
Its `game/` has one fresh **Seed the dungeon** commit tagged `aion-seed`. Original
local game history is untouched. There are no saves, notes, credentials, old
release snapshots or dependencies in the export. The destination must not
already exist; provide another path after `--` to create a new export.

Distribute this folder as an archive. The recipient runs `npm ci` and asks their
own agent to read `PLAY.md` and start Aion. A source-only copy without the nested
Git metadata also works: startup initializes a seed commit if Git is installed.
When putting the host itself in a new Git repository, use that source-only copy;
otherwise Git would treat the nested `game/.git` as an embedded repository.

Source export includes the **current files**, including deliberate unpublished
work. It does not claim that source has already been applied to your local save.
For an existing descent, publish source through the normal consented Oracle loop.

## Share an evolved dungeon

`game/` is an independent repository of game rules, sprites and sounds. Its
History button reads local commits. To share it, use your normal Git remote/push
workflow from that directory. There is no automatic upload or in-game share flow.
Include `game/README.md` and its MIT license so recipients know how to load it
into an ABI-1 Aion host. Sharing the game repository does not share the host or
the private descent; use a clean host distribution alongside it if needed.

Keep commit descriptions about mechanics. Don't paste player petitions or local
private notes into public commit messages. Private backups made by `npm run
backup` are for restoring your descent, not for public distribution.

## Verification boundaries

Scaffold checks cover transaction rejection, save ordering, expiry/restart,
multi-month checkpoint/archive retention, recovery, notes limits, save coalescing
and clean seeded exports. `npm run check` is the same lightweight
module/state gate used for publication. Browser visuals/audio are human-tested;
there is no browser automation or promise that future generated mechanics are
automatically verified. During play, the Oracle stays in its fast one-shot loop.
