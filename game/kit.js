// The kit: everything a written place or vignette is handed as `k`.
// It is bound to the current world, so authored code stays short:
//   build(k) { k.place('chair', 'far'); }
import { sources } from './thread.js';

export const dirs8 = [[0,-1],[1,0],[0,1],[-1,0],[1,-1],[1,1],[-1,1],[-1,-1]];
export const dirs4 = dirs8.slice(0, 4);
export const dist = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const cell = (x, y) => `${x},${y}`;

// The base knows almost nothing: wall, floor, a door, a way on. A place may
// redefine any of them, and add its own, under `tiles`.
export const baseTiles = {
  '#': { sprite: 'wall', color: '#55575f', solid: true, opaque: true, look: 'A wall.' },
  '.': { sprite: 'floor', color: '#5d5e66', look: 'Floor.' },
  '+': { sprite: 'door', color: '#a08468', solid: true, opaque: true, look: 'A shut door.',
    bump(k, x, y) { k.set(x, y, '/'); k.sound('door'); k.trace.opened++; k.say('The door opens.'); return true; } },
  '/': { sprite: 'open', color: '#7a6853', look: 'An open door. E beside it shuts it.',
    use(k, x, y) {
      if (!k.free(x, y)) return false;
      k.set(x, y, '+'); k.sound('door'); k.trace.closed++; k.say('The door shuts.');
    } },
  '>': { sprite: 'way', color: '#d8d0b0', exit: true, look: 'A way on. E takes it.' },
};

export const baseKinds = {};
const unknown = { sprite: 'thing', color: '#8d8a94', name: 'thing', portable: true,
  look: 'Thou canst not say what it is, or whence.' };

export const placeOf = s => sources[s.place] ?? sources.nowhere;
export const kindDef = t => sources[t.from]?.kinds?.[t.kind] ?? baseKinds[t.kind] ?? unknown;
export function tileDef(s, ch) {
  const spec = placeOf(s), def = spec.tiles?.[ch] ?? baseTiles[ch] ?? baseTiles['.'];
  const tint = spec.palette?.[def.sprite];
  return tint ? { ...def, color: tint } : def;
}
// Authored text and option lists may be plain values or functions of the kit.
export const resolve = (value, ...args) => typeof value === 'function' ? value(...args) : value;

export function bearing(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const ew = dx > 0 ? 'east' : dx < 0 ? 'west' : '', ns = dy > 0 ? 'south' : dy < 0 ? 'north' : '';
  if (!ns || !ew) return ns || ew || 'here';
  if (Math.abs(dx) > 2 * Math.abs(dy)) return ew;
  if (Math.abs(dy) > 2 * Math.abs(dx)) return ns;
  return `${ns}-${ew}`;
}

export function kit(s, api = null, engine = {}) {
  const p = s.player;
  let seen = null;
  const fields = new Map();
  const tile = (x, y) => s.map[y]?.[x] ?? '#';
  const def = (x, y) => tileDef(s, tile(x, y));
  const opaqueAt = (x, y) => !!def(x, y).opaque || s.things.some(t => t.x === x && t.y === y && kindDef(t).opaque);

  const k = {
    s, p, ROT: api?.ROT, src: null, dist, bearing, dirs4, dirs8,
    get vars() { return s.vars; },
    get marks() { return s.marks; },
    get pack() { return s.pack; },
    get spec() { return placeOf(s); },
    get trace() { return s.trace; },
    get past() { return s.traces; },
    get hushed() { return (s.vars.hush ?? 0) > s.turn; },

    random: () => api.random(s),
    pick: list => list[Math.floor(api.random(s) * list.length)],
    say: (text, kind) => api.say(s, text, kind),
    event: (type, detail) => api.event(s, type, detail),
    // A place's own sounds shadow the base ones of the same name.
    sound(name) { const src = k.src ?? s.place; s.sound = sources[src]?.sounds?.[name] ? `${src}/${name}` : name; },

    tile, def, opaqueAt,
    set(x, y, ch) { if (s.map[y]?.[x] !== undefined) s.map[y][x] = ch; },
    at: (x, y) => s.things.filter(t => t.x === x && t.y === y),
    all: kind => s.things.filter(t => t.kind === kind),
    one: kind => s.things.find(t => t.kind === kind),
    kind: kindDef,
    name(t) { return resolve(kindDef(t).name, k, t) ?? t.kind; },
    solid: (x, y) => !!def(x, y).solid || s.things.some(t => t.x === x && t.y === y && kindDef(t).solid),
    free: (x, y) => !def(x, y).solid && !s.things.some(t => t.x === x && t.y === y) && !(p.x === x && p.y === y),
    stair() {
      for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) if (s.map[y][x] === '>') return { x, y };
      return null;
    },

    sight: () => resolve(placeOf(s).sight, k) ?? 9,
    refresh() { seen = null; fields.clear(); },
    sees(t) {
      if (dist(t, p) > k.sight()) return false;
      if (!k.ROT) return true;
      if (!seen) {
        seen = new Set();
        new k.ROT.FOV.PreciseShadowcasting((x, y) => !opaqueAt(x, y))
          .compute(p.x, p.y, k.sight(), (x, y) => seen.add(cell(x, y)));
      }
      return seen.has(cell(t.x, t.y));
    },

    // Walking distance from a cell over open tiles. Things never block it;
    // shut doors do unless `doors` is set.
    field(from = p, { doors = false } = {}) {
      const id = `${from.x},${from.y},${doors}`;
      if (fields.has(id)) return fields.get(id);
      const d = new Map([[cell(from.x, from.y), 0]]), queue = [{ x: from.x, y: from.y }];
      const open = (x, y) => !def(x, y).solid || (doors && tile(x, y) === '+');
      for (let i = 0; i < queue.length; i++) {
        const c = queue[i], n = d.get(cell(c.x, c.y)) + 1;
        for (const [dx, dy] of dirs8) {
          const x = c.x + dx, y = c.y + dy;
          if (!open(x, y) || d.has(cell(x, y))) continue;
          if (dx && dy && (!open(c.x + dx, c.y) || !open(c.x, c.y + dy))) continue;
          d.set(cell(x, y), n); queue.push({ x, y });
        }
      }
      fields.set(id, d);
      return d;
    },
    // One step for a thing toward (or away from) a target; null if none helps.
    step(t, target = p, { away = false } = {}) {
      const d = k.field(target), here = d.get(cell(t.x, t.y)) ?? Infinity;
      let best = null, score = here;
      for (const [dx, dy] of dirs8) {
        const x = t.x + dx, y = t.y + dy, n = d.get(cell(x, y));
        if (n === undefined || k.solid(x, y) || (p.x === x && p.y === y)) continue;
        if (dx && dy && (def(t.x + dx, t.y).solid || def(t.x, t.y + dy).solid)) continue;
        if (away ? n > score : n < score) { best = { x, y }; score = n; }
      }
      return best;
    },

    // Choosing where a thing goes. Roles: here, near, mid, far, deadend, room,
    // stairs, any. `open` asks for a cell that cannot block a passage.
    spot(role = 'any', { open = false } = {}) {
      const d = k.field(p, { doors: true });
      const reach = Math.max(1, ...d.values()), stair = k.stair();
      const cells = [];
      for (const [id, n] of d) {
        const [x, y] = id.split(',').map(Number);
        if (tile(x, y) !== '.' || !k.free(x, y) || n < 1) continue;
        if (open && (dirs8.some(([dx, dy]) => def(x + dx, y + dy).solid || tile(x + dx, y + dy) === '/')
          || s.things.some(t => dist(t, { x, y }) <= 2 && kindDef(t).solid))) continue;
        cells.push({ x, y, n });
      }
      const exits = c => dirs4.filter(([dx, dy]) => !def(c.x + dx, c.y + dy).solid || tile(c.x + dx, c.y + dy) === '+').length;
      const rooms = s.rooms.filter(r => !(p.x >= r.x1 && p.x <= r.x2 && p.y >= r.y1 && p.y <= r.y2));
      const room = role === 'room' && rooms.length ? k.pick(rooms) : null;
      const fits = {
        here: c => c.n <= 2,
        near: c => c.n >= 3 && c.n <= Math.max(6, reach * .25),
        mid: c => c.n > reach * .3 && c.n < reach * .65,
        far: c => c.n >= reach * .65,
        deadend: c => exits(c) === 1 && c.n > reach * .3,
        room: c => room && c.x >= room.x1 && c.x <= room.x2 && c.y >= room.y1 && c.y <= room.y2,
        stairs: c => stair && dist(c, stair) >= 2 && dist(c, stair) <= 4,
        any: () => true,
      }[role] ?? (() => true);
      let pool = cells.filter(fits);
      if (!pool.length) pool = cells.filter(c => c.n >= 3);
      if (!pool.length) pool = cells;
      return pool.length ? k.pick(pool) : null;
    },

    // Things in the world and in the hand.
    put(kind, pos, extra = {}) {
      if (!pos) return null;
      const t = { id: `t${++s.serial}`, kind, from: k.src ?? s.place, ...extra, x: pos.x, y: pos.y };
      s.things.push(t);
      return t;
    },
    place(kind, role, extra = {}) {
      const d = sources[extra.from ?? k.src ?? s.place]?.kinds?.[kind] ?? baseKinds[kind];
      return k.put(kind, k.spot(role, { open: !!d?.solid }), extra);
    },
    remove(t) { s.things = s.things.filter(o => o !== t); s.pack = s.pack.filter(o => o !== t); },
    move(t, x, y) { t.x = x; t.y = y; },
    has: kind => s.pack.find(t => t.kind === kind),
    give(kind, extra = {}) {
      const t = { id: `t${++s.serial}`, kind, from: k.src ?? s.place, ...extra };
      s.pack.push(t);
      return t;
    },

    // Shove a thing one cell directly away from the walker. Returns whether it moved.
    push(t) {
      const x = t.x + Math.sign(t.x - p.x), y = t.y + Math.sign(t.y - p.y);
      if (!k.free(x, y) || tile(x, y) !== '.') return false;
      t.x = x; t.y = y; t.moved = (t.moved ?? 0) + 1;
      return true;
    },
    // Trade places with a thing that cannot be shoved.
    swap(t) { const { x, y } = p; p.x = t.x; p.y = t.y; t.x = x; t.y = y; },
    // How the Seeker looks from now on: a sprite of the calling source, and a colour.
    wear(sprite, color) { p.sprite = sprite ? `${k.src ?? s.place}/${sprite}` : null; p.color = color ?? null; },
    // The Seeker is concluded. Use sparingly.
    end(text) { p.hp = 0; if (text) api.say(s, text, 'danger'); },

    // Choices. `ask` opens one of the current source's choices about a thing;
    // `chose` reads back the latest answer to a question from anywhere in the run.
    ask: (q, about = null) => engine.ask(k, q, about),
    chose: q => s.choices.findLast(c => c.q === q)?.a,
    leave: () => engine.leave(k),
  };
  return k;
}
