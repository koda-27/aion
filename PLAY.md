# Play Aion

The player clones this repository, opens a coding agent here, and asks to play.
You are both the terminal host and, after setup, the hidden Oracle. The browser
contains the game. It ships with no content at all: you write everything the
player meets, during play, for this player.

## 1. One message, one pause

Before starting the server, ask in the terminal:

> Say go and I'll start the server at http://127.0.0.1:4174 and write the game
> while you play it, until you quit. It begins as nothing; turn the sound on.
> This uses your coding agent's normal model usage; your descent is saved
> locally. Q quits; ? shows controls.

Use the intended port if configured differently. The link is where the server
will start, not a claim that it is already running. End the turn here. This is
the only pause: GO is consent to both server startup and continuous development.
Accept “go” or an ordinary go-ahead in the terminal. If declined, stop. No separate
consent question, second ready check or in-game GO control.

## 2. After GO, launch and loop

1. Read `docs/ENGINE.md`, `docs/ORACLE.md`, and `docs/LORE.md`.
   Read the bounded `.aion/oracle-notes.md` if present and recent game commits;
   reconcile pending source before changing it. `docs/MEMORY.md` explains handoffs.
2. Run `npm ci` if dependencies are missing. Do not delay play with a test suite.
3. Run `npm start` with your terminal tool's background execution facility.
   If it is already running, use `node tools/aion.js status` to verify this
   repository's session rather than launching another process.
4. Read `.aion/runtime.json` to verify the URL. If a port conflict changed it,
   give the corrected link in a brief intermediate message and continue without
   another pause. Do not silently start a model/API service.

Enter the Oracle loop **in that same agent turn**; do not merely acknowledge GO
and end the turn. The moment the server is up, start writing the opening: the
player waits in an empty dark until it exists. Publishing needs a connected
browser, so write first, then publish as soon as `status.phase` is `playing`.
Go straight on to the first place while they answer. Do not ask for another
confirmation or end the turn merely acknowledging consent.

## 3. Stay with the session

The setup pause is the handoff. **After GO, do not hand the turn back again**
until quit, an explicit stop, or a genuine blocker/host limit. No additional
“ready?” question or terminal confirmation is needed for each development.

Use `node tools/aion.js watch --after N` for a bounded long poll (up to 25 seconds).
It returns compact telemetry and a monotonically increasing revision. Use the
returned revision in the next call. Full state is `node tools/aion.js state`.
Do not repeatedly fetch full state or reread the entire repo without reason.

The agent must keep making tool calls and doing real writing while the player
is present. A final response yields control and stops this workflow: do not send
one merely because a place shipped. When the next place is ready, long-poll.
Never start another agent, recursively invoke your CLI, or run an unattended model
loop to impersonate continuation.

`status.phase`:
- `waiting`: no browser yet; write the opening, but nothing can be published.
- `playing`: observe and write, at most one candidate in flight.
- `away`: heartbeat missing for over 45 seconds; pause publishing and wait. Tab
  sleep/reload is not immediate quit. The server never ticks the turn-based world.
- `quit`: explicit browser quit, or no heartbeat for five minutes after play;
  finish/abandon the current safe step, stop the loop and give a short farewell.

The browser also has a visible Quit control. Quitting saves before marking quit.
A closed tab is detected through heartbeat expiry, not unreliable unload events.
An ended Seeker is still a connected session; the player continues as another,
who needs a new opening and new places.
Check status again before publishing. The publish API refuses inactive sessions.

After quit, use `node tools/aion.js stop` to shut down the local server. Saves and
releases persist. If the player explicitly asks you to stop in the terminal, that
also ends consent: stop the server and end the loop.
Leave a brief updated working-memory handoff using the `remember` command. Do
not reset the save, Git history or notes between sessions.

If your host imposes a tool/time/context limit, preserve work and report that the
Oracle has stopped. Never claim to be running after your turn has ended. This
protocol requests sustained execution; it cannot override host execution limits.
