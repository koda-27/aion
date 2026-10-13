# A descent that lasts

## Working memory, not a diary

`.aion/oracle-notes.md` is the agent's handoff across sessions and context limits.
Keep it under **100 lines / 8 KiB**. A useful shape:

```markdown
# Oracle working memory
## Verified snapshot
- Observed date, Seeker/run ID, depth and turn (not assumed current next time).
- Applied release and corresponding Git commit, if known.
## Pending source
- Unpublished or uncommitted work; target and remaining step. Say none if none.
## Open threads
- Active bargain/event, current defects, evidence versus inference.
## Next possibilities
- At most three ideas. Remove them when shipped or disproved.
## Recent changes
- At most five release/commit references; Git holds full history.
## Archive pointers
- Only references relevant to a likely follow-up.
```

Write a replacement to `.aion/notes-draft.md`, then:

```sh
node tools/aion.js remember .aion/notes-draft.md
```

The old text is archived by content hash **before** replacement. Oversized drafts
are rejected, leaving current notes intact. Startup archives oversized legacy
notes and leaves a bounded handoff with a pointer and tail; that is not an automatic
semantic summary. The next agent should reconcile that archive once. Archives
are local and never fed back into the model automatically.

## What is kept

| Data | Retention |
| --- | --- |
| Game development history | Git commits in `game/`; not pruned |
| Current save | `.aion/save.json`, atomically replaced |
| Previous save | `.aion/save-previous.json` |
| Daily checkpoints | First saved position on each UTC day, latest 14 saved days |
| Release modules | Latest 20 at startup, plus every version needed by current/previous/checkpoint saves |
| Failed candidate | Removed; validation copy of save removed after checking |
| Messages / recent telemetry | 120 messages / 100 events in the active world |
| Petitions | Latest 64 plus all on the current floor in the active world; older records archived |
| Seeker records and petitions | `.aion/chronicle/<hashed-run-id>/`; retained across death and restart |
| Prior working notes | `.aion/notes/archive/`; retained, read only on demand |

The host archives petition data before pruning it and before acknowledging a save.
A delayed save acknowledgement cannot erase a newer answer or another Seeker's
petition. Historic pending petitions remain historic, not automatically fulfilled
or transferred to a new Seeker. Current-floor petitions stay in state so shrines
cannot be reused. Maps/effects belong to the current floor, not an ever-growing
collection of all floors. Messages and action telemetry are recent context, not
a full replay recording.

Archives and Git still grow on disk; they deliberately preserve history. The hot
save, agent context and startup release cache stay bounded independently of them.
Browser ES-module imports remain cached for the lifetime of a tab. Normal quit
and reopen between sessions releases that cache; the host never reloads a player
to ship a change. No promise of unlimited patches in one never-closed tab.

## Recover

Startup validates the current save and its release. If damaged, it attempts the
previous save, then daily checkpoints, preserves the damaged file in
`.aion/recovery/`, and reports recovery in terminal diagnostics and `status`.
It refuses to create a fresh world when an existing damaged save has no usable
fallback. Checkpoints recover recent positions; they are not a reversible record
of every turn. To choose a checkpoint manually, stop the server, copy `.aion/`
aside, then restore that checkpoint as `save.json` together with its referenced release.

## Resuming source changes

Restart uses the last published release. Unpublished source stays pending; the
next consented Oracle session should inspect and publish it deliberately. A
fresh distribution has no save and starts from the supplied current seed source.
Game history concerns source commits, not save states.
