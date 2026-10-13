import { test } from 'node:test';
import assert from 'node:assert/strict';
import ROT from 'rot-js';
import * as game from '../game/index.js';
import { threads, index } from '../game/thread.js';
import { api, migrateWorld, validateState } from '../shared/runtime.js';

const ctx = { ROT, ...api };
const act = (s, a) => { game.act(s, a, ctx); validateState(s); game.validate(s); return s; };
const fresh = (seed = 7) => game.create({ ROT, seed, ...api });
function write(thread) { threads[1] = thread; index(); game.gather(); }
function unwrite() { delete threads[1]; index(); }

// Walk the Seeker to a cell by the shortest open route, opening doors on the way.
function go(s, goal) {
  for (let guard = 0; guard < 400; guard++) {
    const p = s.player;
    if (p.x === goal.x && p.y === goal.y) return true;
    const open = (x, y) => !['#'].includes(s.map[y]?.[x] ?? '#') && !game.appearance(s, x, y).blocked;
    const d = new Map([[`${goal.x},${goal.y}`, 0]]), queue = [goal];
    for (let i = 0; i < queue.length; i++) {
      const c = queue[i];
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const x = c.x + dx, y = c.y + dy;
        if (!open(x, y) || d.has(`${x},${y}`)) continue;
        d.set(`${x},${y}`, d.get(`${c.x},${c.y}`) + 1); queue.push({ x, y });
      }
    }
    const next = [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([dx, dy]) => ({ dx, dy, n: d.get(`${p.x + dx},${p.y + dy}`) }))
      .filter(c => c.n !== undefined).sort((a, b) => a.n - b.n)[0];
    if (!next) return false;
    act(s, { type: 'move', dx: next.dx, dy: next.dy });
    if (s.prompt || s.phase !== 'floor' || !s.player.hp) return false;
  }
  return false;
}
const find = (s, ch) => { for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) if (s.map[y][x] === ch) return { x, y }; };

const opening = {
  id: 'w1-opening',
  sprites: { bell: ['########'], figure: ['#.#.#.#.'] },
  sounds: { ring: [{ wave: 'sine', frequency: 900, duration: .5 }] },
  kinds: { bell: { sprite: 'bell', name: 'brass bell', portable: true, use(k) { k.vars.hush = k.s.turn + 5; k.sound('ring'); k.say('One note.'); } } },
  vignettes: [
    { id: 'river', title: 'The River', text: 'A ferryman names his fare.', options: [
      { id: 'pay', text: 'Pay.', then: 'He nods.', effect: k => { k.marks.paid = true; } },
      { id: 'keep', text: 'Keep the fist shut.', effect: k => k.give('bell') },
    ] },
    { id: 'door', title: 'The Door', text: k => `A door, for one who chose to ${k.chose('river')}.`, options: [
      { id: 'in', text: 'Go in.', then: 'Places were laid.', effect: k => { k.marks.fed = true; k.wear('figure', '#abcdef'); } },
      { id: 'pay-only', text: 'Only for payers.', when: k => k.chose('river') === 'pay' },
    ] },
  ],
};

const hall = {
  id: 'w1-hall',
  arrival: ['A long cold hall.'],
  title: 'A HALL',
  shape: { kind: 'rooms', doors: true },
  sprites: { wall: ['#.#.#.#.'] },
  palette: { wall: '#123456' },
  ambience: k => ({ id: k.marks.fed ? 'fed' : 'hungry', layers: [{ wave: 'brown', frequency: 300, gain: .05 }], events: [{ sound: 'drip', every: [4, 9] }] }),
  sounds: { drip: [{ wave: 'sine', frequency: 1200, duration: .1 }] },
  status: k => `OWED ${k.vars.paid ? 0 : 1}`,
  kinds: {
    figure: { sprite: 'thing', name: 'standing one', solid: true, look: 'Pale stone.',
      touch(k, t) { k.ask('figure', t); },
      tick(k, t) { if (!k.sees(t)) { const n = k.step(t); if (n) k.move(t, n.x, n.y); } } },
    shadow: { sprite: 'thing', name: 'shadow', comes: true },
    shoe: { sprite: 'thing', name: 'small shoe', portable: true },
  },
  choices: {
    figure: { title: 'The standing one', text: 'It holds something out.', options: [
      { id: 'take', text: 'Take it.', then: 'Stone shifts.', effect(k, t) { k.marks.took = true; k.remove(t); } },
      { id: 'leave', text: 'Leave it.' },
    ] },
    toll: { must: true, title: 'The slab', text: 'It is owed.', options: [
      { id: 'light', text: 'Pay.', effect(k) { k.marks.tolls = (k.marks.tolls ?? 0) + 1; k.vars.paid = true; k.leave(); } },
    ] },
  },
  build(k) { k.place('figure', 'far'); k.place('shadow', 'near'); k.place('shoe', 'near'); k.vars.built = true; },
  law: { leave(k) { if (k.vars.paid) return true; k.ask('toll'); return false; } },
};

const afterHall = { id: 'w1-after-hall', vignettes: [
  { id: 'count', title: 'The Count', text: 'One too many.', options: [{ id: 'tell', text: 'Tell.' }] },
] };

const cell = {
  id: 'w1-cell',
  shape: { kind: 'drawn', rows: ['#######', '#@.=.X#', '#_....#', '#######'], legend: { _: { kind: 'plate' } } },
  tiles: { '=': { sprite: 'wall', color: '#999', solid: true, look: 'Bars.' }, ':': { sprite: 'floor', color: '#999', look: 'Raised bars.' },
    X: { sprite: 'way', color: '#fff', exit: true, look: 'A hatch.' } },
  kinds: { plate: { sprite: 'thing', name: 'slab' } },
  law: { after(k) {
    const plate = k.one('plate'), pressed = (k.p.x === plate.x && k.p.y === plate.y) || k.at(plate.x, plate.y).length > 1;
    const gate = { x: 3, y: 1 };
    if (pressed) k.set(gate.x, gate.y, ':'); else if (k.free(gate.x, gate.y)) k.set(gate.x, gate.y, '=');
  } },
};

test('with nothing written, the Seeker walks in a nothing that has no edge', () => {
  unwrite();
  const s = fresh();
  assert.equal(s.phase, 'between'); assert.equal(s.place, 'nowhere'); assert.equal(s.prompt, null);
  for (let i = 0; i < 70; i++) act(s, { type: 'move', dx: 0, dy: 1 });
  for (let i = 0; i < 70; i++) act(s, { type: 'move', dx: -1, dy: -1 });
  assert.equal(s.phase, 'between'); assert.equal(s.depth, 0); assert.equal(s.turn, 140);
  assert.deepEqual(game.status(s), ['', '']);
  assert.equal(game.ambience(s).id, 'nowhere/nothing');
  assert.equal(game.appearance(s, 1, 1).sprite, 'none');
  assert.equal(game.appearance(s, s.player.x, s.player.y).sprite, 'none', 'the Seeker has no form yet');
  assert.deepEqual(migrateWorld(game, s, { ROT }), s, 'migration with nothing new changes nothing');
});

test('writing arrives while the Seeker waits: opening, a place, choices, a toll, the next place', () => {
  unwrite();
  let s = fresh();
  act(s, { type: 'move', dx: 0, dy: 1 });
  write({ opening, floors: { 1: hall }, stairs: {} });
  s = migrateWorld(game, s, { ROT });
  assert.equal(s.phase, 'story'); assert.equal(s.prompt.q, 'river'); assert.equal(s.prompt.must, true);
  act(s, { type: 'cancel-prompt' }); assert.ok(s.prompt, 'a telling cannot be walked away from');
  act(s, { type: 'move', dx: 0, dy: 1 }); assert.equal(s.prompt.q, 'river');
  act(s, { type: 'choose', id: 'keep' });
  assert.equal(s.pack[0].kind, 'bell'); assert.equal(s.pack[0].from, 'w1-opening');
  assert.equal(s.prompt.q, 'door'); assert.match(s.prompt.text, /chose to keep/);
  assert.deepEqual(s.prompt.choices.map(c => c.id), ['in'], 'options can depend on earlier answers');
  act(s, { type: 'choose', id: 'in' });
  assert.equal(s.prompt.q, '~then'); assert.equal(s.prompt.text, 'Places were laid.');
  act(s, { type: 'choose', id: 'on' });
  assert.equal(s.phase, 'floor'); assert.equal(s.depth, 1); assert.equal(s.place, 'w1-hall');
  assert.ok(s.marks.fed); assert.ok(s.vars.built);
  assert.deepEqual(game.status(s), ['A HALL', 'CARRYING brass bell   OWED 1']);
  // Art and sound belong to their source: the hall's wall, the opening's figure and bell.
  assert.deepEqual(game.appearance(s, 0, 0), { sprite: 'w1-hall/wall', color: '#123456' });
  assert.deepEqual(game.appearance(s, s.player.x, s.player.y), { sprite: 'w1-opening/figure', color: '#abcdef' });
  const bed = game.ambience(s);
  assert.equal(bed.id, 'w1-hall/fed'); assert.equal(bed.events[0].sound[0].frequency, 1200);

  // Carrying is deliberate, and the trace remembers it.
  const shoe = s.things.find(t => t.kind === 'shoe');
  assert.ok(go(s, shoe));
  assert.equal(s.pack.length, 1, 'walking over a thing does not take it');
  act(s, { type: 'interact' }); assert.equal(s.pack.length, 2);
  act(s, { type: 'drop' }); assert.equal(s.prompt.q, '~drop');
  act(s, { type: 'choose', id: s.pack.find(t => t.kind === 'shoe').id });
  assert.deepEqual(s.trace.took, ['shoe']); assert.deepEqual(s.trace.dropped, ['shoe']);
  act(s, { type: 'use' }); assert.ok(s.vars.hush > s.turn, 'a carried thing from the opening still works here');
  assert.equal(s.sound, 'w1-opening/ring');

  // The way on is owed; the answer is recorded and carries the Seeker down.
  const turn = s.turn;
  s.things = s.things.filter(t => t.kind !== 'figure');
  assert.ok(go(s, find(s, '>')), 'reached the way on');
  assert.ok(s.turn > turn);
  act(s, { type: 'interact' });
  assert.equal(s.prompt.q, 'toll'); assert.equal(s.depth, 1);
  write({ opening, floors: { 1: hall, 2: cell }, stairs: { 1: afterHall } });
  act(s, { type: 'choose', id: 'light' });
  assert.equal(s.marks.tolls, 1); assert.equal(s.traces[0].exit, '>');
  assert.equal(s.traces.length, 1); assert.equal(s.traces[0].place, 'w1-hall');
  assert.deepEqual(s.traces[0].choices, ['toll:light']); assert.ok(s.traces[0].left.includes('shoe'));
  assert.equal(s.phase, 'story'); assert.equal(s.prompt.q, 'count');
  act(s, { type: 'choose', id: 'tell' });
  assert.equal(s.phase, 'floor'); assert.equal(s.depth, 2); assert.equal(s.place, 'w1-cell');
  assert.ok(s.things.some(t => t.kind === 'shadow' && t.from === 'w1-hall'), 'what follows comes down too');
  assert.deepEqual(s.choices.map(c => c.q), ['river', 'door', 'toll', 'count']);

  // A drawn place with its own tiles and law: the gate answers the slab.
  assert.equal(s.map[1][3], '=');
  act(s, { type: 'move', dx: 1, dy: 0 }); act(s, { type: 'move', dx: 1, dy: 0 });
  assert.deepEqual([s.player.x, s.player.y], [2, 1], 'bars are solid');
  act(s, { type: 'move', dx: -1, dy: 1 });
  assert.equal(s.map[1][3], ':');
  act(s, { type: 'drop' });
  act(s, { type: 'move', dx: 1, dy: 0 }); act(s, { type: 'move', dx: 1, dy: -1 });
  assert.equal(s.map[1][3], ':', 'a thing left on the slab holds the gate');
  act(s, { type: 'move', dx: 1, dy: 0 }); act(s, { type: 'move', dx: 1, dy: 0 });
  assert.equal(s.map[s.player.y][s.player.x], 'X');
  act(s, { type: 'interact' });
  assert.equal(s.phase, 'between', 'depth 3 is not written, so there is nothing again');
  assert.equal(s.place, 'nowhere'); assert.equal(s.traces[1].exit, 'X');
  assert.equal(s.traces.length, 2);
  const again = migrateWorld(game, JSON.parse(JSON.stringify(s)), { ROT });
  assert.deepEqual(again, migrateWorld(game, again, { ROT }));
  unwrite();
});

test('every shape yields a place whose way on can be walked to', () => {
  for (const kind of ['rooms', 'halls', 'caves', 'maze', 'open']) {
    for (let seed = 1; seed <= 25; seed++) {
      write({ opening: { id: 'o', vignettes: [] }, floors: { 1: { id: `shape-${kind}`, shape: { kind, doors: seed % 2 === 0 } } }, stairs: {} });
      const s = fresh(seed * 7919);
      assert.equal(s.phase, 'floor', `${kind} ${seed}`);
      assert.ok(go(s, find(s, '>')), `${kind} seed ${seed}: way on unreachable`);
      act(s, { type: 'interact' });
      assert.equal(s.phase, 'between');
    }
  }
  unwrite();
});

test('a place that forgets its sprite or its source still draws and plays', () => {
  write({ opening: { id: 'o', vignettes: [] }, floors: { 1: { id: 'odd', shape: { kind: 'drawn', rows: ['####', '#@x#', '####'], legend: { x: 'nameless' } },
    kinds: { nameless: { sprite: 'no-such-sprite', portable: true } } } }, stairs: {} });
  const s = fresh();
  assert.equal(game.appearance(s, 2, 1).sprite, 'thing');
  act(s, { type: 'move', dx: 1, dy: 0 }); act(s, { type: 'interact' });
  unwrite();
  assert.match(game.status(s)[1], /thing/, 'an orphaned carried thing degrades to a plain thing');
  assert.match(game.inspect(s, s.player.x, s.player.y), /Carried/);
});
