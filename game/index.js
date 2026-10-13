// The engine: a few fixed verbs (walk, look, touch, carry, wait, choose) and
// the machinery that reads written places and stories from the thread.
// It ships with no content. Nothing exists until it is written.
import { sprites as baseSprites, sounds as baseSounds } from './art.js';
import { sources, threads } from './thread.js';
import { kit, kindDef, tileDef, resolve, dirs8, dirs4 } from './kit.js';

export const abi = 1;
// Each source's art lives under its own id, so two places may both draw a `wall`.
export const sprites = { ...baseSprites };
export const sounds = { ...baseSounds };
export function gather() {
  for (const spec of Object.values(sources)) {
    for (const [name, rows] of Object.entries(spec.sprites ?? {})) sprites[`${spec.id}/${name}`] = rows;
    for (const [name, layers] of Object.entries(spec.sounds ?? {})) sounds[`${spec.id}/${name}`] = layers;
  }
}
gather();
const art = (src, name) => sprites[`${src}/${name}`] ? `${src}/${name}` : sprites[name] ? name : 'thing';

export const bindings = {
  e: { type: 'interact', label: 'take, or use, what is here' },
  r: { type: 'drop', label: 'set a carried thing down' },
  f: { type: 'use', label: 'use a carried thing' },
  i: { type: 'pack', label: 'recall what is carried' },
};

const W = 44, H = 24, HANDS = 3;
const waiting = ['Nothing yet.', 'There is nothing here to walk upon. Thou walkest.', 'Still nothing.', 'Somewhere, a thing is being decided.'];

// Hooks run with `k.src` set, so what they make remembers where it is from.
function run(k, src, fn, ...args) {
  if (!fn) return undefined;
  const before = k.src; k.src = src;
  try { return fn(k, ...args); } finally { k.src = before; }
}
const law = (k, name, ...args) => run(k, k.s.place, k.spec.law?.[name], ...args);
const hook = (k, t, name, ...args) => run(k, t.from, kindDef(t)[name], t, ...args);
const options = (k, spec, about) => (resolve(spec.options, k, about) ?? []).filter(o => !o.when || o.when(k, about));
const blankTrace = () => ({ turns: 0, steps: 0, waits: 0, regards: 0, looked: {}, opened: 0, closed: 0,
  took: [], dropped: [], used: [], touched: {}, declined: 0 });

function drawn(s, shape, k) {
  const rows = shape.rows, w = Math.max(...rows.map(r => r.length)), made = [];
  s.map = rows.map(r => [...r.padEnd(w, '#')]); s.width = w; s.height = rows.length;
  s.map.forEach((row, y) => row.forEach((ch, x) => {
    const entry = shape.legend?.[ch];
    if (ch === '@') { s.player.x = x; s.player.y = y; row[x] = '.'; }
    else if (ch === ' ') row[x] = '#';
    else if (entry) { row[x] = entry.tile ?? '.'; made.push([entry, x, y]); }
  }));
  for (const [entry, x, y] of made) k.put(entry.kind ?? entry, { x, y }, entry.with ?? {});
}

function carve(s, spec, k) {
  const shape = spec.shape ?? {}, kind = shape.kind ?? 'rooms', p = s.player;
  s.things = []; s.seen = {}; s.rooms = []; s.vars = {};
  if (kind === 'drawn') { drawn(s, shape, k); k.refresh(); return; }
  const ROT = k.ROT, [w, h] = shape.size ?? [W, H], saved = ROT.RNG.getState();
  try {
    for (let attempt = 0; attempt < 8; attempt++) {
      ROT.RNG.setSeed(Math.floor(k.random() * 0x7fffffff) + 1);
      s.map = Array.from({ length: h }, () => Array(w).fill('#')); s.width = w; s.height = h; s.rooms = [];
      const dig = (x, y, wall) => { if (!wall && x > 0 && y > 0 && x < w - 1 && y < h - 1) s.map[y][x] = '.'; };
      const style = attempt < 5 ? kind : 'rooms';
      if (style === 'caves') {
        const cave = new ROT.Map.Cellular(w, h); cave.randomize(shape.fill ?? .5);
        for (let i = 0; i < 4; i++) cave.create();
        cave.create((x, y, alive) => dig(x, y, !alive));
      } else if (style === 'open') {
        // Open ground with scattered obstacles: a field, a shore, a hall of pillars.
        for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) if (k.random() >= (shape.fill ?? .12)) s.map[y][x] = '.';
      } else if (style === 'maze') {
        new ROT.Map.EllerMaze(w % 2 ? w : w - 1, h % 2 ? h : h - 1).create(dig);
      } else {
        const built = style === 'halls'
          ? new ROT.Map.Uniform(w, h, { roomWidth: [6, 12], roomHeight: [4, 8], roomDugPercentage: .3, ...shape.options })
          : new ROT.Map.Digger(w, h, { roomWidth: [4, 9], roomHeight: [3, 6], dugPercentage: .3, ...shape.options });
        built.create(dig);
        for (const room of built.getRooms()) {
          s.rooms.push({ x1: room.getLeft(), y1: room.getTop(), x2: room.getRight(), y2: room.getBottom() });
          if (shape.doors) room.getDoors((x, y) => { s.map[y][x] = '+'; });
        }
      }
      const floor = [];
      s.map.forEach((row, y) => row.forEach((ch, x) => { if (ch === '.') floor.push({ x, y }); }));
      if (floor.length < 60) continue;
      const start = s.rooms.length
        ? { x: (s.rooms[0].x1 + s.rooms[0].x2) >> 1, y: (s.rooms[0].y1 + s.rooms[0].y2) >> 1 }
        : floor[Math.floor(k.random() * floor.length)];
      p.x = start.x; p.y = start.y; s.map[p.y][p.x] = '.';
      k.refresh();
      const reach = k.field(p, { doors: true });
      if (reach.size < floor.length * .6) continue;
      // Seal whatever cannot be walked to, then put the way on as far off as it goes.
      let far = null;
      s.map.forEach((row, y) => row.forEach((ch, x) => {
        const n = reach.get(`${x},${y}`);
        if (n === undefined) { if (ch !== '#') row[x] = '#'; }
        else if (ch === '.' && (!far || n > far.n)) far = { x, y, n };
      }));
      if (!far || far.n < 8) continue;
      if (shape.way !== false) s.map[far.y][far.x] = '>';
      k.refresh();
      return;
    }
    throw new Error('No walkable place could be made from this shape');
  } finally { ROT.RNG.setState(saved); }
}

function enter(k, spec, depth, phase = 'floor') {
  const s = k.s;
  s.place = spec.id; s.phase = phase; s.prompt = null;
  if (phase === 'floor') s.depth = depth;
  k.src = spec.id;
  carve(s, spec, k);
  s.trace = blankTrace();
  if (phase === 'floor') {
    for (const f of s.followers) { const at = k.spot('near'); if (at) s.things.push({ ...f, x: at.x, y: at.y }); }
    s.followers = [];
    run(k, spec.id, spec.build);
    for (const line of resolve(spec.arrival, k) ?? []) k.say(line);
    k.event('entered', { depth, place: spec.id });
  }
  k.src = null;
  k.refresh();
}

function drift(k) {
  const s = k.s;
  if (s.place === 'nowhere') s.phase = 'between';
  else enter(k, sources.nowhere, s.depth, 'between');
}

function present(k, story, v) {
  const s = k.s;
  s.phase = 'story';
  run(k, story.id, () => {
    s.prompt = { kind: 'choice', action: 'choose', must: true, src: story.id, q: v.id, about: null,
      title: resolve(v.title, k) ?? '', text: resolve(v.text, k) ?? '',
      choices: options(k, v).map(o => ({ id: o.id, text: resolve(o.text, k) })) };
  });
}

// Move to whatever comes next, if it has been written. Otherwise: nowhere.
function advance(k) {
  const s = k.s, thread = threads[s.seeker];
  for (;;) {
    const stage = s.stage;
    if (stage.kind === 'story') {
      const opening = stage.key === 'opening', depth = opening ? 1 : stage.from + 1;
      const story = opening ? thread?.opening : thread?.stairs?.[stage.from];
      const v = story?.vignettes?.[stage.i];
      if (v) return present(k, story, v);
      // The opening is always waited for. A passage with nothing to tell is
      // skipped once the place beyond it exists.
      if (!story && (opening || !thread?.floors?.[depth])) return drift(k);
      s.stage = { kind: 'floor', depth };
    } else {
      const spec = thread?.floors?.[stage.depth];
      if (!spec) return drift(k);
      return enter(k, spec, stage.depth);
    }
  }
}

function leave(k) {
  const s = k.s;
  law(k, 'left');
  const walkable = s.map.flat().filter(ch => !tileDef(s, ch).solid).length;
  const seen = Object.keys(s.seen).filter(id => { const [x, y] = id.split(',').map(Number); return !k.def(x, y).solid; }).length;
  const summary = { depth: s.depth, place: s.place, ...s.trace,
    seen: Math.round(100 * seen / Math.max(1, walkable)), exit: k.tile(s.player.x, s.player.y),
    moved: s.things.filter(t => t.moved).map(t => t.kind),
    left: s.things.filter(t => kindDef(t).portable).map(t => t.kind), pack: s.pack.map(t => t.kind),
    choices: s.choices.filter(c => c.depth === s.depth && c.src === s.place).map(c => `${c.q}:${c.a}`) };
  s.traces = [...s.traces, summary].slice(-12);
  k.event('left-floor', summary);
  s.followers = s.things.filter(t => kindDef(t).comes).map(({ x, y, ...rest }) => rest);
  s.things = s.things.filter(t => !kindDef(t).comes);
  s.stage = { kind: 'story', key: 'stairs', from: s.depth, i: 0 };
  s.sound = 'leave';
  advance(k);
}

function ask(k, q, about) {
  const s = k.s;
  const src = about && sources[about.from]?.choices?.[q] ? about.from : (k.src ?? s.place);
  const spec = sources[src]?.choices?.[q];
  if (!spec) return false;
  return run(k, src, () => {
    const list = options(k, spec, about);
    if (!list.length) return false;
    s.prompt = { kind: 'choice', action: 'choose', must: !!spec.must, src, q, about: about?.id ?? null,
      title: resolve(spec.title, k, about) ?? '', text: resolve(spec.text, k, about) ?? '',
      choices: list.map(o => ({ id: o.id, text: resolve(o.text, k, about) })) };
    return true;
  });
}
const engine = { ask, leave };

const builtin = (q, title, text, choices) => ({ kind: 'choice', action: 'choose', must: false, src: null, q, about: null, title, text, choices });

function choose(k, id) {
  const s = k.s, asked = s.prompt;
  const picked = asked?.choices?.find(c => c.id === id);
  if (asked?.kind !== 'choice' || !picked) return false;
  s.prompt = null;
  if (asked.q === '~then') { s.stage.i++; advance(k); return false; }
  if (asked.q === '~drop') return drop(k, id) && endTurn(k);
  if (asked.q === '~use') return use(k, id) && endTurn(k);
  const source = sources[asked.src], story = s.phase === 'story';
  const spec = source?.choices?.[asked.q] ?? source?.vignettes?.find(v => v.id === asked.q);
  const about = asked.about ? [...s.things, ...s.pack].find(t => t.id === asked.about) ?? null : null;
  s.choices = [...s.choices, { q: asked.q, a: id, src: asked.src, depth: s.depth, turn: s.turn, title: asked.title, said: picked.text }].slice(-200);
  k.event('choice', { q: asked.q, a: id, title: asked.title, said: picked.text, depth: s.depth });
  const after = run(k, asked.src, () => {
    const option = spec ? options(k, spec, about).find(o => o.id === id) : null;
    const then = resolve(option?.then, k, about);
    if (then) k.say(then);
    option?.effect?.(k, about);
    spec?.chosen?.(k, id, about);
    return then;
  });
  if (!story) return false;
  // What came of it is read before the telling goes on.
  if (after) s.prompt = { ...builtin('~then', asked.title, after, [{ id: 'on', text: '…' }]), must: true };
  else { s.stage.i++; advance(k); }
  return false;
}

function touch(k, t) {
  const s = k.s, d = kindDef(t);
  s.trace.touched[t.kind] = (s.trace.touched[t.kind] ?? 0) + 1;
  k.event('touch', { kind: t.kind, thing: t.id });
  const result = hook(k, t, 'touch');
  if (!d.touch) k.say(describe(k, t));
  return result !== false && !s.prompt;
}

function take(k, t) {
  const s = k.s, d = kindDef(t);
  const noted = () => { s.trace.took.push(t.kind); k.event('take', { kind: t.kind, thing: t.id }); };
  if (d.take) {
    if (hook(k, t, 'take') === false) return false;
    if (!s.things.includes(t)) noted();
    return !s.prompt;
  }
  if (s.pack.length >= HANDS) { k.say('Thy hands are full. R sets a thing down.'); return false; }
  s.things = s.things.filter(o => o !== t); delete t.x; delete t.y; s.pack.push(t);
  noted(); k.say(`Taken: ${k.name(t)}.`); k.sound('take');
  hook(k, t, 'taken'); law(k, 'took', t);
  return true;
}

function drop(k, id) {
  const s = k.s, p = s.player;
  if (!s.pack.length) { k.say('Thy hands are empty.'); return false; }
  const t = id ? s.pack.find(o => o.id === id) : s.pack.length === 1 ? s.pack[0] : null;
  if (!t) {
    s.prompt = builtin('~drop', 'Set down', 'Which shall be set down here?', s.pack.map(o => ({ id: o.id, text: k.name(o) })));
    return false;
  }
  s.pack = s.pack.filter(o => o !== t); t.x = p.x; t.y = p.y; s.things.push(t);
  s.trace.dropped.push(t.kind); k.event('drop', { kind: t.kind, thing: t.id });
  k.say(`Set down: ${k.name(t)}.`); k.sound('drop');
  hook(k, t, 'dropped'); law(k, 'dropped', t);
  return true;
}

function use(k, id) {
  const s = k.s;
  if (!s.pack.length) { k.say('Thy hands are empty.'); return false; }
  const t = id ? s.pack.find(o => o.id === id) : s.pack.length === 1 ? s.pack[0] : null;
  if (!t) {
    s.prompt = builtin('~use', 'Use', 'Which?', s.pack.map(o => ({ id: o.id, text: k.name(o) })));
    return false;
  }
  if (!kindDef(t).use) { k.say('It does nothing here that thou canst find.'); return false; }
  s.trace.used.push(t.kind); k.event('use', { kind: t.kind, thing: t.id });
  return hook(k, t, 'use') !== false && !s.prompt;
}

function move(k, dx, dy) {
  const s = k.s, p = s.player;
  if (!dirs8.some(([x, y]) => x === dx && y === dy)) return false;
  const x = p.x + dx, y = p.y + dy;
  if (s.map[y]?.[x] === undefined) return false;
  if (dx && dy && (k.def(x, p.y).solid || k.def(p.x, y).solid)) return false;
  const blocker = k.at(x, y).find(t => kindDef(t).solid);
  if (blocker) return touch(k, blocker);
  const d = k.def(x, y);
  if (d.solid) return run(k, s.place, d.bump, x, y) === true;
  p.x = x; p.y = y; k.sound('step'); s.trace.steps++;
  run(k, s.place, d.step, x, y);
  for (const t of k.at(x, y)) hook(k, t, 'step');
  const here = k.at(x, y).filter(t => !kindDef(t).hidden);
  if (here.length && !s.prompt) {
    k.say(`Here: ${here.map(k.name).join(', ')}.${here.some(t => kindDef(t).portable || kindDef(t).take) ? ' E takes it.' : ''}`);
  }
  return true;
}

function interact(k) {
  const s = k.s, p = s.player;
  const item = k.at(p.x, p.y).findLast(t => kindDef(t).portable || kindDef(t).take);
  if (item) return take(k, item);
  const under = k.def(p.x, p.y);
  if (under.exit && s.phase === 'floor') {
    if (law(k, 'leave') !== false && !s.prompt) leave(k);
    return 'left';
  }
  if (under.use) return run(k, s.place, under.use, p.x, p.y) !== false && !s.prompt;
  for (const [dx, dy] of dirs4) {
    const t = k.at(p.x + dx, p.y + dy).find(o => kindDef(o).solid);
    if (t) return touch(k, t);
  }
  for (const [dx, dy] of dirs4) {
    const x = p.x + dx, y = p.y + dy, d = k.def(x, y);
    if (d.use && run(k, s.place, d.use, x, y) !== false) return !s.prompt;
    if (d.solid && d.bump && run(k, s.place, d.bump, x, y) === true) return true;
  }
  k.say('Nothing here answers the hand.');
  return false;
}

function endTurn(k, a = {}) {
  const s = k.s, p = s.player;
  s.turn++;
  if (s.phase === 'between') {
    // Nowhere has no edge: walking off one side arrives at the other.
    const before = `${p.x},${p.y}`;
    if (p.x <= 0) p.x = s.width - 2; else if (p.x >= s.width - 1) p.x = 1;
    if (p.y <= 0) p.y = s.height - 2; else if (p.y >= s.height - 1) p.y = 1;
    if (before !== `${p.x},${p.y}`) s.seen = {};
    s.stage.walked = (s.stage.walked ?? 0) + 1;
    if (s.stage.walked % 14 === 0) k.say(waiting[(s.stage.walked / 14 - 1) % waiting.length]);
    advance(k);
    return true;
  }
  if (s.phase !== 'floor') return true;
  s.trace.turns++;
  k.refresh();
  if (!k.hushed) for (const t of [...s.things]) if (s.things.includes(t)) hook(k, t, 'tick');
  law(k, 'after', a);
  if (!p.hp) k.event('ended', { depth: s.depth, place: s.place });
  return true;
}

export function act(s, a, api) {
  const k = kit(s, api, engine), p = s.player;
  if (!p.hp) return false;
  s.sound = null;
  if (a.type === 'choose') return choose(k, a.id);
  if (a.type === 'cancel-prompt') {
    if (!s.prompt || s.prompt.must) return false;
    if (s.prompt.src) { s.trace.declined++; k.event('declined', { q: s.prompt.q, depth: s.depth }); law(k, 'declined', s.prompt.q); }
    s.prompt = null;
    return false;
  }
  if (s.prompt || s.phase === 'story') return false;
  if (a.type === 'pack') {
    k.say(s.pack.length ? `Carried: ${s.pack.map(k.name).join(', ')}.` : 'Thy hands are empty.');
    return false;
  }
  if (a.type === 'regard') {
    if (s.phase !== 'floor' || !Number.isInteger(a.x) || !Number.isInteger(a.y)) return false;
    s.trace.regards++;
    for (const t of k.at(a.x, a.y)) { s.trace.looked[t.kind] = (s.trace.looked[t.kind] ?? 0) + 1; hook(k, t, 'regard'); }
    return false;
  }
  if (s.phase === 'floor' && law(k, 'before', a) === false) return false;
  let spent = false;
  if (a.type === 'move') spent = move(k, a.dx, a.dy);
  else if (a.type === 'wait') {
    spent = true; s.trace.waits++;
    if (s.phase !== 'floor' || !k.spec.law?.wait) k.say('Thou holdest still.');
    else law(k, 'wait');
  } else if (a.type === 'interact') spent = interact(k);
  else if (a.type === 'drop') spent = drop(k, a.id);
  else if (a.type === 'use') spent = use(k, a.id);
  if (spent !== true) return false;
  return endTurn(k, a);
}

export function create({ ROT, seed, seeker = 1, ...api }) {
  const s = {
    schema: 1, turn: 0, rng: (seed >>> 0) || 1, depth: 0, eventSequence: 0, seeker,
    messages: [], events: [], developments: {}, prompt: null, sound: null,
    phase: 'between', stage: { kind: 'story', key: 'opening', i: 0 }, place: null, serial: 0,
    map: [], width: 0, height: 0, seen: {}, rooms: [], things: [], pack: [], followers: [],
    choices: [], trace: blankTrace(), traces: [], vars: {}, marks: {},
    player: { x: 0, y: 0, hp: 1, maxHp: 1, sprite: null, color: null },
  };
  const k = kit(s, { ROT, ...api }, engine);
  enter(k, sources.nowhere, 0, 'between');
  api.say(s, 'There is nothing yet.');
  advance(k);
  return s;
}

export function migrate(s, api) {
  s.developments ??= {};
  s.followers ??= [];
  s.marks ??= {};
  // What the Seeker was waiting for may have been written since.
  if (api?.ROT && s.phase === 'between' && s.player.hp > 0) advance(kit(s, api, engine));
  return s;
}

export function validate(s) {
  if (!Array.isArray(s.map) || s.map.length !== s.height || s.map.some(row => row.length !== s.width)) throw new Error('Invalid map');
  if (!['story', 'between', 'floor'].includes(s.phase)) throw new Error('Invalid phase');
  const p = s.player;
  if (!Number.isInteger(p.x) || !Number.isInteger(p.y) || s.map[p.y]?.[p.x] === undefined) throw new Error('Invalid player position');
  if (tileDef(s, s.map[p.y][p.x]).solid) throw new Error('Player inside blocked terrain');
  if (!Number.isFinite(p.hp) || p.hp < 0) throw new Error('Invalid player state');
  const ids = new Set();
  for (const t of [...s.things, ...s.pack, ...s.followers]) {
    if (!t.id || !t.kind || ids.has(t.id)) throw new Error('Duplicate or missing thing id');
    ids.add(t.id);
  }
  for (const t of s.things) if (s.map[t.y]?.[t.x] === undefined) throw new Error(`Thing ${t.id} is outside the map`);
  if (s.prompt && (!Array.isArray(s.prompt.choices) || !s.prompt.choices.length)) throw new Error('A prompt needs choices');
}

// Presentation is pure and called often; reuse one kit per world object.
let viewed = null, viewer = null;
const view = s => viewed === s ? viewer : (viewed = s, viewer = kit(s));
const describe = (k, t) => {
  const name = k.name(t), look = resolve(kindDef(t).look, k, t);
  return `${name[0].toUpperCase()}${name.slice(1)}.${look ? ` ${look}` : ''}`;
};

export function opaque(s, x, y) { return view(s).opaqueAt(x, y); }
export function sight(s) { return view(s).sight(); }

export function appearance(s, x, y, { terrainOnly = false } = {}) {
  const k = view(s), d = k.def(x, y), p = s.player;
  if (!terrainOnly) {
    // The Seeker has no form until one is written (`k.wear`). In a written
    // place a formless Seeker is drawn as a plain mark, so they are not lost.
    if (p.x === x && p.y === y) return { sprite: sprites[p.sprite] ? p.sprite : s.phase === 'floor' ? 'thing' : 'none', color: p.color ?? '#f1e4bf' };
    const t = k.at(x, y).findLast(o => !kindDef(o).hidden);
    if (t) {
      const kd = kindDef(t), look = resolve(kd.appear, k, t) ?? kd;
      return { sprite: art(t.from, look.sprite ?? 'thing'), color: look.color ?? '#b9b4a8' };
    }
  }
  const look = resolve(d.appear, k, x, y) ?? d;
  return { sprite: art(s.place, look.sprite), color: look.color };
}

export function markers(s) { return resolve(view(s).spec.markers, view(s)) ?? []; }

// The bed of sound for where the Seeker is now. The client cross-fades when the id changes.
export function ambience(s) {
  const k = view(s), spec = k.spec, bed = resolve(spec.ambience, k);
  if (!bed) return null;
  const named = name => typeof name === 'string' ? sounds[`${spec.id}/${name}`] ?? sounds[name] : name;
  return { ...bed, id: `${spec.id}/${bed.id ?? 'bed'}`, events: (bed.events ?? []).map(e => ({ ...e, sound: named(e.sound) })) };
}

export function inspect(s, x, y) {
  const k = view(s), things = k.at(x, y).filter(t => !kindDef(t).hidden);
  if (s.player.x === x && s.player.y === y) {
    const self = resolve(k.spec.self, k) ?? 'Thyself.';
    const held = s.pack.length ? ` Carried: ${s.pack.map(k.name).join(', ')}.` : ' Empty-handed.';
    return `${self}${held}${things.length ? ` Underfoot: ${things.map(k.name).join(', ')}.` : ''}`;
  }
  if (things.length) return things.map(t => describe(k, t)).join(' ');
  const d = k.def(x, y);
  return resolve(k.spec.looks?.[d.sprite], k, x, y) ?? resolve(d.look, k, x, y) ?? 'Nothing.';
}

export function status(s) {
  const k = view(s);
  const held = s.pack.length ? `CARRYING ${s.pack.map(k.name).join(', ')}` : '';
  if (s.phase !== 'floor') return ['', held];
  return [resolve(k.spec.title, k) ?? '', [held, resolve(k.spec.status, k)].filter(Boolean).join('   ')];
}
