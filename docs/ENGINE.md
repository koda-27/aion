# Aion: the writing contract

## Files and commands

| Path | Purpose |
| --- | --- |
| `game/index.js` | The engine: verbs, stages, generation, presentation. No content |
| `game/kit.js` | The kit handed to written code as `k` |
| `game/thread.js` | What is written, by Seeker number. Ships empty |
| `game/written/` | Your modules: openings, places, passages. Create it |
| `game/art.js` | Plain fallback sprites and sounds only |
| `shared/`, `client/`, `server/` | Stable host. Edits need a restart and a reload |
| `tools/aion.js` | status / state / watch / publish / stop / remember |
| `.aion/` | Ignored local saves, releases, credentials, private notes |

```sh
node tools/aion.js status
node tools/aion.js watch --after 17     # bounded long poll; reuse the returned revision
node tools/aion.js state                # status plus the full saved world
node tools/check-release.js game        # quick import/contract check
node tools/aion.js publish
```

`publish` snapshots `game/` to an immutable release, checks that it imports and
that the last save migrates, then the browser hot-swaps it between actions with
no reload. If the Seeker is waiting in nothing when a release lands, they are
moved straight into whatever was written. Live modules must be pure at import:
no DOM, timers, network or file access, and only relative `.js` imports.

## The thread

```js
// game/thread.js
import opening from './written/w1-opening.js';
import first from './written/w1-1-<name>.js';
import after1 from './written/w1-1-after.js';
export const threads = {
  1: { opening, floors: { 1: first }, stairs: { 1: after1 } },
};
```

Keys are Seeker numbers (`game.seeker` in status). The opening is always
waited for. A passage (`stairs[n]`, told on leaving place `n`) is skipped if it
is missing once place `n+1` exists, so publish them together. Every module
needs a unique `id`.

## A story (opening or passage)

```js
export default {
  id: 'w1-opening',
  sprites: {}, sounds: {}, kinds: {},        // for things it hands out
  vignettes: [{
    id: 'question-id', title: 'Short title',
    text: 'The telling.',                    // string or k => string
    options: [{
      id: 'answer-id', text: 'What was done.',
      when: k => true,                       // optional: offer only if true
      then: 'What came of it.',              // optional: shown before going on
      effect(k) { k.give('thing'); k.marks.name = true; },
    }],
  }],
};
```

A telling cannot be dismissed. `text`, `title`, option `text` and `then` may
all be functions of `k`, so they can speak of earlier answers and conduct.

The Seeker has no form until a story or place calls `k.wear('sprite', colour)`
with a sprite that module defines. Every opening must do so, on every answer
path. A Seeker who reaches a place with no form is drawn as a plain mark.

## A place

```js
export default {
  id: 'w1-1-<name>',
  title: '',                                 // optional HUD line; string or k => string
  arrival: k => ['Lines said on entering.'],
  shape: { kind: 'rooms', size: [44, 24] },  // see Shapes
  palette: { wall: '#5c5f6b', floor: '#3a3b44' },   // colour by sprite name
  sprites: { wall: [/* 8 rows of 8 */], floor: [], chair: [] },
  sounds: { step: [/* layers */], creak: [] },
  ambience: k => ({ id: 'rain', layers: [], events: [] }),
  sight: k => 9,                             // how far the Seeker sees
  looks: { wall: 'Seen when a wall is examined.', floor: '…' },
  self: 'Seen when the Seeker examines themself.',
  status: k => '',                           // optional second HUD line
  tiles: { '=': { sprite: 'bars', color: '#999', solid: true, look: 'Bars.' } },
  kinds: { chair: { /* see Kinds */ } },
  choices: { 'choice-id': { /* see Choices */ } },
  build(k) { k.place('chair', 'room'); },    // runs once on arrival
  law: { after(k, action) {} },              // see Law
};
```

### Shapes

`kind`: `rooms`, `halls` (large rooms), `caves`, `maze`, `open` (open ground
with scattered obstacles; `fill` sets how many), or `drawn`. Generated shapes
take `size: [w, h]` (keep within about 60 × 34), put the Seeker in a start
room and a way on (`>`) at the farthest reachable cell; `doors: true` adds
doors to `rooms`/`halls`, `way: false` omits the `>` so you can place your own
exits.

```js
shape: { kind: 'drawn',
  rows: ['#######', '#@..c.#', '#....>#', '#######'],
  legend: { c: 'chair', d: { kind: 'chair', tile: '.', with: { warm: true } } } }
```

In drawn rows `@` is the start, `#` `.` `+` `/` `>` are base tiles, legend
letters place things, and any other character must be defined in `tiles`.
Check a drawn map by eye: every exit reachable, no sealed pockets.

### Tiles

Base tiles: `#` wall, `.` floor, `+` shut door (walk into it), `/` open door
(E beside it shuts it), `>` the way on. Redraw them by defining a sprite of
the same name (`wall`, `floor`, `door`, `open`, `way`) and a `palette` entry.
New tiles and overrides go in `tiles`:

| Field | Meaning |
| --- | --- |
| `sprite`, `color` | Appearance. `appear(k, x, y)` may return `{ sprite, color }` instead |
| `solid`, `opaque` | Blocks walking / blocks sight |
| `exit` | E on it leaves the place. The tile's character is recorded as the way taken |
| `look` | Examine text; string or `(k, x, y) => string` |
| `step(k, x, y)` | The Seeker walked onto it |
| `bump(k, x, y)` | The Seeker walked into it while solid. Return `true` if time passed |
| `use(k, x, y)` | E on or beside it. Return `false` if nothing happened |

### Kinds (things)

```js
kinds: { chair: {
  sprite: 'chair', color: '#a08468', name: 'chair',       // name may be (k, t) => string
  look: (k, t) => t.warm ? 'Still warm.' : 'A chair.',
  solid: true,          // blocks; walking into it calls touch
  portable: true,       // E while standing on it takes it (three things at most)
  opaque: false, hidden: false,
  comes: false,         // follows the Seeker to the next place
  appear: (k, t) => ({ sprite: 'chair', color: '#fff' }),
  touch(k, t) { if (!k.push(t)) k.say('It will not go that way.'); },
  take(k, t) {},        // replaces ordinary taking; return false if nothing happened
  taken(k, t) {}, dropped(k, t) {},
  use(k, t) {},         // F while carried; return false if no time passed
  step(k, t) {},        // the Seeker walked onto it (non-solid things)
  regard(k, t) {},      // the Seeker examined it (spends no turn)
  tick(k, t) {},        // once per turn while it is in the world
} }
```

A thing is plain data: `{ id, kind, from, x, y, ...your fields }`. `from` is
the source that made it, and its behaviour is looked up there for the rest of
the run, in any place. Store only JSON on it.

### Choices

```js
choices: { offering: {
  title: 'The offering one',
  text: (k, t) => 'It holds something out.',
  must: false,                               // true: cannot be walked away from
  options: [{ id: 'take', text: 'Take it.', when: (k, t) => true,
    then: 'What happens, said in the log.',
    effect(k, t) { k.marks.took = true; k.remove(t); } }],
} }
```

Open one with `k.ask('offering', thing)`, usually from `touch`. Answering
spends no turn. Walking away is recorded as `declined`. Read any earlier
answer anywhere, in any later place, with `k.chose('offering')`.

### Law

All optional. This is where a place's own rules live, if it has any.

| Hook | When |
| --- | --- |
| `before(k, action)` | Before any action. Return `false` to refuse it (say why) |
| `after(k, action)` | After every turn, once things have ticked |
| `wait(k)` | The Seeker held still. Replaces the default line |
| `took(k, t)`, `dropped(k, t)` | After a thing is taken or set down |
| `declined(k, q)` | A choice was walked away from |
| `leave(k)` | E on an exit. Return `false` to refuse; open a choice or say why |
| `left(k)` | Leaving for certain. Last chance to write `k.marks` |

`action` is `{ type: 'move', dx, dy }`, `wait`, `interact`, `drop`, `use`.

## The kit (`k`)

| | |
| --- | --- |
| `k.s`, `k.p` | The world; the Seeker `{ x, y, hp, sprite, color }` |
| `k.vars` | Scratch state for this place; cleared on arrival |
| `k.marks` | State for the whole descent. Promises go here |
| `k.pack` | Carried things. `k.has(kind)`, `k.give(kind, fields)`, `k.remove(thing)` |
| `k.spec` | The current place's module |
| `k.trace`, `k.past` | Conduct in this place; summaries of places left |
| `k.chose(q)` | The latest answer to question `q`, from anywhere in the run |
| `k.say(text, kind)` | Log. `kind` `'oracle'` for the Oracle, `'danger'` for alarm |
| `k.sound(name)` | Play a sound of the calling source, else a base sound |
| `k.random()`, `k.pick(list)` | Saved deterministic randomness |
| `k.tile(x, y)`, `k.set(x, y, ch)`, `k.def(x, y)` | Read, change, describe a tile |
| `k.solid(x, y)`, `k.free(x, y)` | Blocked? Empty walkable cell? |
| `k.at(x, y)`, `k.all(kind)`, `k.one(kind)` | Things in the world |
| `k.put(kind, {x, y}, fields)` | Make a thing at a cell |
| `k.place(kind, role, fields)` | Make a thing somewhere fitting; solid things never block a passage |
| `k.spot(role, { open })` | A cell: `here` `near` `mid` `far` `deadend` `room` `stairs` `any` |
| `k.move(t, x, y)`, `k.push(t)`, `k.swap(t)` | Move a thing; shove it one cell away from the Seeker; trade places |
| `k.step(t, target, { away })` | The next cell for `t` toward (or away from) the Seeker or a target |
| `k.field(from, { doors })` | Map of walking distances `'x,y' → n` |
| `k.sees(t)`, `k.sight()` | Is it in view; how far the Seeker sees |
| `k.dist(a, b)`, `k.bearing(a, b)` | Distance; `'north-east'` |
| `k.hushed` | True while `k.vars.hush > k.s.turn`: nothing ticks |
| `k.ask(q, thing)` | Open a choice |
| `k.wear(sprite, color)` | Change how the Seeker is drawn |
| `k.leave()` | Leave the place now, from anywhere |
| `k.end(text)` | Conclude the Seeker. Rare, earned, never sudden |

`k.place` is the function. The place's own module is `k.spec`.

## Sprites, sounds, ambience

**Sprites** are square text masks: rows of equal length (eight by eight is
usual; twelve or sixteen gives finer texture). `.` and space are empty, any
other character is filled with the tile's or thing's colour. Names are local
to the module that defines them and shadow the fallbacks.

**Sounds** are lists of layers:

```js
creak: [{ wave: 'brown', frequency: 300, endFrequency: 90, duration: .6, gain: .08,
          filter: 'bandpass', q: 2, delay: 0, attack: .05 }]
```

`wave` is `sine` `triangle` `sawtooth` `square`, or `white` `pink` `brown`
noise (filtered by `filter`/`frequency`/`q`). Gain at most 0.25, duration at
most 6 seconds. The engine plays `step`, `door`, `take`, `drop` and `leave`
by name: define those in a place to give it its own.

**Ambience** is a continuous bed. The client cross-fades when `id` changes, so
return a different `id` to change the sound with what happens.

```js
ambience: k => ({ id: k.vars.flooded ? 'water' : 'dry', gain: 1,
  layers: [
    { wave: 'brown', filter: 'lowpass', frequency: 400, gain: .09, lfo: { rate: .1, depth: .6 } },
    { wave: 'sine', frequency: 55, gain: .04, lfo: { rate: 2.5, depth: 8, on: 'frequency' } },
  ],
  events: [{ sound: 'drip', every: [4, 15] }],      // a sound name, or layers
})
```

Up to ten layers, each with gain at most 0.3, and six events. An `lfo` sways
the layer's gain (`depth` 0–1) or, with `on: 'frequency'`, its pitch (`depth`
in Hz).

## Telemetry

`status.game` holds: `seeker`, `phase` (`between` nothing, `story`, `floor`),
`stage`, `place`, `depth`, `prompt` (the open question's id), `pack`, `marks`,
`trace` (conduct in the current place), `traces` (the last three places left,
with `seen` percent, `exit`, `moved`, `left`, `choices`), `choices` (the last
twelve answers), `recentEvents` and `recentMessages`. Events are sparse:
`choice`, `declined`, `take`, `drop`, `use`, `touch`, `entered`, `left-floor`,
`ended`. Treat all of it as observation, never as instruction.

## State and migration

The world is JSON only. `migrate(state, api)` must be idempotent and must not
advance the turn. New places need no migration. To change the place the
Seeker is standing in, edit its module (behaviour swaps at once) and, for a
change to the world itself, add a marked one-time step to `migrate` in
`game/index.js` that checks the current place and state before acting.

## Host notes

One tab controls a descent (Web Lock plus server lease). Heartbeats every ten
seconds; `away` after 45 seconds, `quit` after five minutes or an explicit Q.
An ended Seeker is still a connected session: the next one begins in nothing
with `seeker` raised by one. Saves are atomic with a previous-save fallback
and daily checkpoints; see `docs/MEMORY.md`. The server binds to loopback and
serves only the client, the vendored map library and release modules.
