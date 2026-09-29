export { sprites, sounds } from './art.js';
export const abi = 1;

export const bindings = {
  e: { type: 'interact', label: 'use stairs, door, brazier, shrine or oil' },
  l: { type: 'lantern', label: 'cover / uncover lantern' },
  h: { type: 'heal', label: 'drink a draught' },
  c: { type: 'smoke', label: 'break a smoke vessel' },
  f: { type: 'throw', label: 'throw a knife', direction: true },
  v: { type: 'armor', label: 'wear / remove iron mail' },
  o: { type: 'oil', label: 'spill lamp oil on an adjacent tile', direction: true },
  t: { type: 'cast', label: 'cast old silver to draw the hungry', direction: true },
};

const W = 52, H = 28;
const distance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const key = (x, y) => `${x},${y}`;
const at = (s, x, y) => s.map[y]?.[x] ?? '#';
const passable = (s, x, y) => !['#', '+'].includes(at(s, x, y));
const enemyAt = (s, x, y) => s.enemies.find(e => e.hp > 0 && e.x === x && e.y === y);
const shrineUsed = (s, x, y) => s.petitions.some(p => p.depth === s.depth && p.x === x && p.y === y);
const fireAt = (s, x, y) => s.fires.some(f => f.x === x && f.y === y);
const slickAt = (s, x, y) => s.slicks.some(c => c.x === x && c.y === y);
const greased = (s, e) => !!e.greased && e.greased > s.turn;

function nearestSlick(s, e, range) {
  let best = null;
  for (const c of s.slicks) {
    if (c.x === s.player.x && c.y === s.player.y) continue;
    const d = distance(c, e);
    if (d <= range && (!best || d < best.d)) best = { x: c.x, y: c.y, d };
  }
  return best;
}

function ignite(s, x, y) {
  s.slicks = s.slicks.filter(c => c.x !== x || c.y !== y);
  if (!fireAt(s, x, y)) s.fires.push({ x, y, until: s.turn + 5 });
}

// Ash rats are thirsty for what was poured out for flame. They lap it up and gleam.
function drinkOil(s, e, api) {
  s.slicks = s.slicks.filter(c => c.x !== e.x || c.y !== e.y);
  e.greased = s.turn + 12;
  api.say(s, 'The ash rat laps the spilt oil and gleams.');
  api.event(s, 'rat-drinks-oil', { target: e.id, x: e.x, y: e.y, depth: s.depth });
}
const directions = [[0,-1],[1,0],[0,1],[-1,0],[1,-1],[1,1],[-1,1],[-1,-1]];
const names = { rat: 'ash rat', watcher: 'hollow porter', thief: 'tithe collector', moth: 'pale moth', hound: 'grave hound' };
const items = {
  potion: 'stoppered draught', knife: 'throwing knife', smoke: 'smoke vessel',
  oil: 'lamp oil', coins: 'old silver', mail: 'iron mail',
};

function line(s, a, b) {
  const steps = distance(a, b);
  for (let i = 1; i < steps; i++) {
    const x = Math.round(a.x + (b.x-a.x)*i/steps), y = Math.round(a.y + (b.y-a.y)*i/steps);
    if (opaque(s, x, y)) return false;
  }
  return true;
}

function floor(s, ROT, api) {
  const oldRng = ROT.RNG.getState();
  let cells = [];
  try {
    ROT.RNG.setSeed(Math.floor(api.random(s)*0x7fffffff) + 1);
    s.map = Array.from({ length: H }, () => Array(W).fill('#'));
    const digger = new ROT.Map.Digger(W, H, { roomWidth: [4, 9], roomHeight: [3, 6], dugPercentage: .3 });
    digger.create((x,y,wall) => { if (!wall) { s.map[y][x] = '.'; cells.push({ x,y }); } });
    if (cells.length < 30) throw new Error('Dungeon generation failed');
    const rooms = digger.getRooms();
    rooms.forEach(room => room.getDoors((x,y) => { s.map[y][x] = '+'; }));
    const [x,y] = rooms[0].getCenter();
    s.player.x = x; s.player.y = y;
  } finally { ROT.RNG.setState(oldRng); }
  s.width = W; s.height = H;
  s.seen = {}; s.smoke = []; s.enemies = []; s.items = []; s.slicks = []; s.fires = []; s.lure = null;
  s.map[s.player.y][s.player.x] = '.';
  cells = cells.filter(c => at(s,c.x,c.y) === '.' && distance(c,s.player)>3);
  cells.sort((a,b) => distance(b,s.player)-distance(a,s.player));
  const exit = cells.shift();
  s.map[exit.y][exit.x] = '>';
  const pick = () => cells.splice(Math.floor(api.random(s)*cells.length),1)[0];
  const shrine=pick();s.map[shrine.y][shrine.x]='s';
  for (let i=0; i<4; i++) { const c = pick(); s.map[c.y][c.x] = 'b'; }
  for (let i=0; i<9; i++) {
    const c = pick(), kind = i < 4 ? 'rat' : i < 7 ? 'watcher' : 'thief';
    s.enemies.push({ id: `d${s.depth}-e${i}`, ...c, kind, hp: kind === 'watcher' ? 10 : 6,
      intent: null, stolen: 0, lastSeen: null });
  }
  // The deeper dark is full of small blind things that drink light.
  for (let i=0; i<Math.min(4, s.depth-1); i++) {
    const c = pick();
    s.enemies.push({ id: `d${s.depth}-m${i}`, ...c, kind:'moth', hp:3,
      intent:null, stolen:0, lastSeen:null });
  }
  // Blind hunters that follow the noise of the living.
  for (let i=0; i<Math.min(2, s.depth-1); i++) {
    const c = pick();
    s.enemies.push({ id: `d${s.depth}-h${i}`, ...c, kind:'hound', hp:8,
      intent:null, stolen:0, lastSeen:null, heard:0 });
  }
  ['potion','potion','knife','knife','smoke','oil','oil','coins','coins','mail'].forEach((kind,i) => {
    s.items.push({ id: `d${s.depth}-i${i}`, ...pick(), kind });
  });
  // Vessels are not unbreakable; some floors are already wet with their contents.
  const braziers = [];
  s.map.forEach((row,y)=>row.forEach((t,x)=>{ if (t === 'b') braziers.push({ x, y }); }));
  for (const b of braziers) {
    const spots = directions.map(([dx,dy])=>({ x:b.x+dx, y:b.y+dy }))
      .filter(c => at(s,c.x,c.y) === '.' && !s.items.some(i => i.x === c.x && i.y === c.y));
    if (spots.length && api.random(s) < .55) {
      s.slicks.push(spots[Math.floor(api.random(s)*spots.length)]);
    }
  }
  api.event(s, 'entered-depth', { depth:s.depth });
}

export function create({ ROT, seed, ...api }) {
  const s = {
    schema:1, turn:0, rng:(seed >>> 0) || 1, depth:1, eventSequence:0,
    messages:[], events:[], developments:{spilledLure:true,ratThirst:true,ambientGrant:true,
      darkHearing:true,paleMoths:true,graveHounds:true}, petitions:[], prompt:null, sound:null, lure:null,
    player:{ x:0,y:0,hp:30,maxHp:30,oil:100,lantern:true,potions:2,knives:4,
      smoke:2,silver:0,hasMail:false,armored:false,kills:0,endurance:0 },
  };
  floor(s, ROT, api);
  api.say(s, 'The Threshold closes softly behind thee.');
  api.say(s, 'The deep hath made no promise concerning hospitality.', 'oracle');
  return s;
}

export function migrate(s, api) {
  // Add idempotent development migrations here. Do not regenerate the floor.
  // Example: if (!s.developments.someName) { ...; s.developments.someName = true; }
  s.developments ??= {};
  s.petitions ??= [];
  s.prompt ??= null;
  if(s.prompt?.kind==='shrine' && shrineUsed(s,s.prompt.x,s.prompt.y)) s.prompt=null;
  if(s.prompt?.kind==='shrine') {
    s.prompt.input='text';
    s.prompt.text='One petition may this stone bear. Hearing is not assent. Speaking spends a turn.';
    delete s.prompt.choices;
  }
  s.slicks ??= [];
  s.fires ??= [];
  s.lure ??= null;
  s.noise ??= null;
  if (s.lure && s.lure.until<=s.turn) s.lure = null;
  s.player.endurance ??= 0;
  // The first witness finds oil already spilled: a slow fuse laid beside a living flame.
  if (api && !s.developments.spilledLure) {
    let trail = null;
    const lit = [];
    s.map.forEach((row,y)=>row.forEach((t,x)=>{ if (t === 'b') lit.push({ x, y }); }));
    for (const b of lit) {
      for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const line = [];
        for (let i=1; i<=3; i++) {
          const x=b.x+dx*i, y=b.y+dy*i;
          if (at(s,x,y) !== '.' || distance({x,y}, s.player) < 5) break;
          if (s.enemies.some(e => e.x === x && e.y === y)) break;
          line.push({ x, y });
        }
        if (line.length >= 2) { trail = line; break; }
      }
      if (trail) break;
    }
    if (trail) {
      for (const c of trail) if (!slickAt(s, c.x, c.y)) s.slicks.push(c);
      s.developments.spilledLure = true;
      api.event(s, 'spilled-lure', { tiles: trail.length });
    }
  }
  // The deep's least children drink what was poured out for flame.
  if (api && !s.developments.ratThirst) {
    const p = s.player;
    let spot = null, fallback = null;
    for (let r = 3; r <= 8 && !spot; r++) {
      for (const [dx,dy] of directions) {
        const x = p.x+dx*r, y = p.y+dy*r;
        if (at(s,x,y) !== '.') continue;
        if (s.items.some(i => i.x===x && i.y===y) || s.enemies.some(e => e.x===x && e.y===y)) continue;
        if (slickAt(s,x,y) || fireAt(s,x,y)) continue;
        const c = { x, y };
        if (line(s,p,c)) { spot = c; break; }
        if (!fallback) fallback = c;
      }
    }
    spot = spot || fallback;
    if (spot) {
      s.slicks.push(spot);
      api.event(s, 'rat-thirst', { x:spot.x, y:spot.y, depth:s.depth });
    }
    s.developments.ratThirst = true;
    if (p.hp > 0) api.say(s, 'What thou pourest for fire, the least of Mine shall drink first.', 'oracle');
  }
  // A plea for the deep's murmur is granted: stillness is the only listening.
  if (api && !s.developments.ambientGrant) {
    s.developments.ambientGrant = true;
    const plea = s.petitions.find(q => q.status === 'pending' && /ambien|background|murmur|drone/i.test(q.request));
    if (plea) { plea.status = 'answered'; plea.resolution = 'The deep speaks only to stillness.'; }
    if (s.player.hp > 0) {
      api.say(s, 'Thou wouldst have the deep murmur behind thee as a beast kept. It hath stood behind thee since the Threshold. Be still, and hear.', 'oracle');
      api.event(s, 'ambient-grant', { depth:s.depth, petition: plea ? plea.id : null });
    }
  }
  // With the lamp dark, stillness serves as sight: the deep names where fire hides.
  if (api && !s.developments.darkHearing) {
    s.developments.darkHearing = true;
    if (s.player.hp > 0) {
      api.say(s, 'Light is a loud guest and drowneth finer voices. Cover thy lamp, be still, and the dark shall tell thee where fires hide.', 'oracle');
      listen(s, api);
      api.event(s, 'dark-hearing', { depth:s.depth });
    }
  }
  // Deeper floors are thick with pale things that drink a carried flame.
  if (api && !s.developments.paleMoths) {
    s.developments.paleMoths = true;
    if (s.player.hp > 0) {
      api.say(s, 'Thou bearest a small sun into the country of those who drink light. They are many, and patient.', 'oracle');
      if (s.depth >= 2) {
        const spots = [];
        s.map.forEach((row, y) => row.forEach((t, x) => {
          if (t !== '.') return;
          if (x === s.player.x && y === s.player.y) return;
          if (s.items.some(i => i.x === x && i.y === y) || s.enemies.some(e => e.x === x && e.y === y)) return;
          const d = distance({ x, y }, s.player);
          if (d >= 6 && d <= 13) spots.push({ x, y });
        }));
        let placed = 0;
        for (let i = 0; i < 2 && spots.length; i++) {
          const c = spots.splice(Math.floor(api.random(s) * spots.length), 1)[0];
          s.enemies.push({ id: `d${s.depth}-mig${i}`, x: c.x, y: c.y, kind: 'moth', hp: 3,
            intent: null, stolen: 0, lastSeen: null });
          placed++;
        }
        api.event(s, 'pale-moths', { placed, depth: s.depth });
      }
    }
  }
  // A blind hunger hears the witness's every step.
  if (api && !s.developments.graveHounds) {
    s.developments.graveHounds = true;
    if (s.player.hp > 0) {
      api.say(s, 'Thy footsteps have been a long prayer, and something below hath answered. It cometh blind, and it cometh by ear.', 'oracle');
      if (s.depth >= 2) {
        const spots = [];
        s.map.forEach((row, y) => row.forEach((t, x) => {
          if (t !== '.') return;
          if (x === s.player.x && y === s.player.y) return;
          if (s.items.some(i => i.x === x && i.y === y) || s.enemies.some(e => e.x === x && e.y === y)) return;
          const d = distance({ x, y }, s.player);
          if (d >= 10 && d <= 17) spots.push({ x, y });
        }));
        let placed = 0;
        if (spots.length) {
          const c = spots.splice(Math.floor(api.random(s) * spots.length), 1)[0];
          s.enemies.push({ id: `d${s.depth}-hmig`, x: c.x, y: c.y, kind: 'hound', hp: 8,
            intent: null, stolen: 0, lastSeen: null, heard: 0 });
          placed = 1;
        }
        api.event(s, 'grave-hounds', { placed, depth: s.depth });
      }
    }
  }
  // A prayer to endure is answered: the deep lends its patience, and charges for it in light.
  const plea = s.petitions.find(p => p.request === 'Let me endure what lies below.' && p.status === 'pending');
  if (api && plea && s.player.hp > 0 && !s.developments.enduringPatience) {
    s.player.endurance = Math.max(s.player.endurance, 2);
    s.developments.enduringPatience = true;
    plea.status = 'answered';
    plea.resolution = 'Two refusals of death; each is settled in lamp oil, for the deep drinketh the light.';
    api.say(s, 'Thou wouldst endure. So be it: the deep lendeth thee its patience twice, and taketh its due in light.', 'oracle');
    api.event(s, 'enduring-patience', { endowment: s.player.endurance });
  }
  return s;
}

export function validate(s) {
  if (!Array.isArray(s.map) || s.map.length !== s.height || s.map.some(r => r.length !== s.width)) {
    throw new Error('Invalid map');
  }
  if (!passable(s,s.player.x,s.player.y)) throw new Error('Player inside blocked terrain');
  if (!Number.isInteger(s.player.x) || !Number.isInteger(s.player.y)) throw new Error('Invalid player position');
  for (const n of ['hp','maxHp','oil','potions','knives','smoke','silver','kills','endurance']) {
    if (!Number.isFinite(s.player[n]) || s.player[n] < 0) throw new Error(`Invalid player ${n}`);
  }
  const ids = new Set();
  for (const e of [...s.enemies,...s.items]) {
    if (!e.id || ids.has(e.id)) throw new Error('Duplicate/missing entity ID');
    ids.add(e.id);
    if (!passable(s,e.x,e.y)) throw new Error(`Entity ${e.id} in wall`);
  }
  if (!s.map.some(row => row.includes('>'))) throw new Error('No descent');
  if (!Array.isArray(s.slicks) || !Array.isArray(s.fires)) throw new Error('Invalid oil spill state');
  for (const c of [...s.slicks, ...s.fires]) {
    if (!passable(s, c.x, c.y)) throw new Error('Spilled oil outside walkable stone');
  }
  if (s.lure && (!passable(s, s.lure.x, s.lure.y) || !Number.isFinite(s.lure.until))) {
    throw new Error('Invalid silver lure');
  }
}

export function opaque(s,x,y) {
  return ['#','+'].includes(at(s,x,y)) || s.smoke.some(c => c.x===x && c.y===y);
}

export function sight(s) { return s.player.lantern && s.player.oil > 0 ? 9 : 3; }

export function appearance(s,x,y,{terrainOnly=false}={}) {
  const terrain = {
    '#':['wall','#585c65'], '.':['floor','#62636a'], '+':['door','#ae8660'],
    '/':['open','#7f684f'], '>':['stair','#e0d5aa'], b:['brazier','#ecc084'],
    o:['brazier','#646372'], s:['shrine','#b6a4ce'],
  };
  let [sprite,color] = terrain[at(s,x,y)] ?? ['floor','#62636a'];
  if (terrainOnly) return {sprite,color};
  if (slickAt(s,x,y)) { sprite='slick'; color='#5b5c46'; }
  if (fireAt(s,x,y)) { sprite='flame'; color='#f08b3a'; }
  const item = s.items.find(i=>i.x===x && i.y===y);
  if (item) { sprite=item.kind; color='#aec6aa'; }
  if (s.smoke.some(c=>c.x===x && c.y===y)) { sprite='smoke'; color='#86819b'; }
  const e = enemyAt(s,x,y);
  if (e) { sprite=e.kind;
    color = e.intent ? '#f4bd6c' : greased(s,e) ? '#c3d07f'
      : e.kind==='watcher' ? '#b1a4c2' : e.kind==='moth' ? '#d9d6c4'
      : e.kind==='hound' ? '#a98a6a' : '#c68d7d'; }
  if (s.player.x===x && s.player.y===y) { sprite='player';
    color = s.player.hp<=0 ? '#826a6b' : s.player.endurance>0 ? '#c9c2a4' : '#f1e4bf'; }
  return { sprite,color };
}

export function markers(s) {
  const marks=s.enemies.filter(e=>e.intent).map(e=>({...e.intent,color:'#d28b59'}));
  if(s.lure && s.lure.until>s.turn) marks.push({x:s.lure.x,y:s.lure.y,color:'#cfd0dd'});
  return marks;
}

export function inspect(s,x,y) {
  const e=enemyAt(s,x,y);
  if (e) {
    const desc = {
      rat:'Ash clings to its whiskers. It avoids open flame; a covered lantern is another matter. It will drink spilt oil, and gleam with it.',
      watcher:'Its load is invisible, but heavy. It plants its feet before swinging at a particular place, and walks into fire as though fire were weather.',
      thief:'A lean figure with a collection bowl. It watches for silver and keeps a route of retreat.',
      moth:'Wings of pale dust. It seeks any flame and drinks it; an open lantern is a feast. Cover the lamp and it forgets thee.',
      hound:'Blind and lean, all jaw and ear. It hunts the noise of thy feet; stand still, and it loses thy trail.',
    };
    return `${names[e.kind]} — ${e.hp} health. ${desc[e.kind]}${e.intent ? ' Its blow is committed to the marked ground.' : ''}${greased(s,e) ? ' Drunk on oil; a spark would find it swiftly.' : ''}`;
  }
  if (s.player.x===x && s.player.y===y) {
    const base = 'A dim soul, armed with a serviceable blade.';
    return s.player.endurance
      ? `${base} The deep's patience is lodged within: it shall refuse ${s.player.endurance} ending${s.player.endurance > 1 ? 's' : ''}.`
      : `${base} The Oracle hath seen dimmer.`;
  }
  const i=s.items.find(i=>i.x===x && i.y===y);
  if (i) {
    const ring = s.lure && s.lure.until>s.turn && s.lure.x===x && s.lure.y===y;
    return ring
      ? 'Old silver, still ringing. The hungry hear it from farther than thou canst see.'
      : `${items[i.kind]}. It can be carried by walking over it.`;
  }
  if (fireAt(s,x,y)) return 'Spilt oil burns low and clinging. It takes five from anything that lingers.';
  if (slickAt(s,x,y)) return 'Old oil, black and patient. An open lamp held beside it would wake it, and the flame would travel. The rats of the deep will drink it if given leave.';
  return ({ '#':'Close-set stone. Old scratches stop at the mortar.', '.':'Ash underfoot.',
    '+':'A timber door. Push against it to open; E beside an open door closes it.',
    '/':'An open door. E closes it if the threshold is clear.',
    '>':'Worn steps lead into an older dark. E descends.',
    b:'An oil brazier. Its flame deters ash rats. E draws oil and extinguishes it.',
    o:'A cold brazier. E spends eight oil to light it again.',
    s:shrineUsed(s,x,y)
      ? 'This stone already bears thy words. It accepts but one petition.'
      : 'A hollow face above a stone bowl. Below it: “Hearing is not assent.” E offers one petition; the Oracle owes no answer.',
  })[at(s,x,y)] ?? 'Nothing stirs.';
}

export function status(s) {
  const p=s.player;
  const flame = s.fires.length ? `   FLAME ${s.fires.length}` : '';
  return [`DEPTH ${s.depth}   HP ${p.hp}/${p.maxHp}   SILVER ${p.silver}   TURN ${s.turn}`,
    `LAMP ${p.lantern ? 'open' : 'covered'} ${p.oil}   DRAUGHT ${p.potions}   KNIFE ${p.knives}   SMOKE ${p.smoke}   ${p.armored ? 'IRON MAIL' : 'LIGHT FOOT'}${flame}${p.endurance ? `   ENDURE ${p.endurance}` : ''}`];
}

function pickup(s,api) {
  const p=s.player;
  for (const item of s.items.filter(i=>i.x===p.x && i.y===p.y)) {
    if (item.kind==='mail') { p.hasMail=true; api.say(s,'Iron mail. V wears it: softer blows, a louder step.'); }
    else {
      const [field,amount] = { potion:['potions',1],knife:['knives',2],smoke:['smoke',1],oil:['oil',24],coins:['silver',5] }[item.kind];
      p[field]+=amount;
      api.say(s,`Taken: ${items[item.kind]}.`);
    }
    api.event(s,'pickup',{kind:item.kind,id:item.id});
    s.items=s.items.filter(i=>i.id!==item.id);
  }
}

function hit(s,e,damage,api) {
  e.hp=Math.max(0,e.hp-damage); s.sound='hit';
  api.say(s,`The ${names[e.kind]} takes ${damage}.`);
  api.event(s,'attack',{target:e.id,kind:e.kind,damage});
  if (!e.hp) {
    s.player.kills++;
    s.player.silver+=e.stolen;
    api.say(s,`The ${names[e.kind]} falls.${e.stolen ? ' Its silver returns to circulation.' : ''}`);
    api.event(s,'kill',{target:e.id,kind:e.kind});
    s.enemies=s.enemies.filter(other=>other!==e);
    // The porter's invisible load was oil; broken open, it pools where it fell.
    if (e.kind==='watcher' && passable(s,e.x,e.y) && !slickAt(s,e.x,e.y) && !fireAt(s,e.x,e.y)) {
      s.slicks.push({ x:e.x, y:e.y });
      api.say(s,'Its burden splits: lamp oil, long borne in the dark.','danger');
      api.event(s,'porter-oil',{x:e.x,y:e.y,depth:s.depth});
    }
    // The oil it drank returns to the stone when it dies.
    if (e.kind==='rat' && greased(s,e) && passable(s,e.x,e.y) && !slickAt(s,e.x,e.y) && !fireAt(s,e.x,e.y)) {
      s.slicks.push({ x:e.x, y:e.y });
      api.say(s,'The oil it drank returns to the stone.');
      api.event(s,'rat-oil-return',{x:e.x,y:e.y,depth:s.depth});
    }
  }
}

const bearing = (from, to) => {
  const dx = to.x - from.x, dy = to.y - from.y;
  const ew = dx > 0 ? 'east' : dx < 0 ? 'west' : '';
  const ns = dy > 0 ? 'south' : dy < 0 ? 'north' : '';
  if (!ns || !ew) return ns || ew;
  if (Math.abs(dx) > 2*Math.abs(dy)) return ew;
  if (Math.abs(dy) > 2*Math.abs(dx)) return ns;
  return `${ns}-${ew}`;
};
const stirring = {
  rat: 'small claws scritch, and stop, and scritch again',
  watcher: 'something drags a weight it will not show',
  thief: 'coin is counted, coin on coin, in the dark',
  moth: 'wings beat, papery and close',
  hound: 'a low breath, and claws on stone',
};

// To be still is to let the deep speak. It hath stood behind thee since the Threshold.
function listen(s, api) {
  const p = s.player;
  // Light is a loud guest. With the lantern dark, the deep lends the ear farther.
  const dark = !(p.lantern && p.oil > 0);
  const reach = dark ? 20 : 14;
  const band = d => d <= 6 ? 'very near' : d <= 12 ? 'not far' : 'far off';
  const nearest = (list) => list.slice().sort((a, b) => distance(a, p) - distance(b, p))[0];
  const living = s.enemies.filter(e => e.hp > 0 && distance(e, p) <= reach)
    .sort((a, b) => distance(a, p) - distance(b, p));
  const near = living[0];
  const parts = [];
  if (near) {
    const d = distance(near, p);
    const where = bearing(p, near);
    parts.push(`${where ? `To the ${where}, ` : 'Close by, '}${stirring[near.kind]} — ${band(d)}.`);
    s.sound = d <= 6 ? 'stir' : 'listen';
  } else {
    parts.push('Nothing living moves within earshot.');
    s.sound = 'listen';
  }
  const braziers = [];
  const stairs = [];
  s.map.forEach((row, y) => row.forEach((t, x) => {
    if (t === 'b') braziers.push({ x, y });
    if (t === '>') stairs.push({ x, y });
  }));
  if (dark) {
    const lit = nearest(braziers);
    if (lit && distance(lit, p) <= reach) parts.push(`Fire burns to the ${bearing(p, lit)}, ${band(distance(lit, p))}.`);
    const pool = nearest(s.slicks);
    if (pool && distance(pool, p) <= reach) parts.push(`Oil waits to the ${bearing(p, pool)}, ${band(distance(pool, p))}.`);
    const stair = nearest(stairs);
    if (stair && distance(stair, p) <= 16) parts.push(`A cold draught climbs from the stair to the ${bearing(p, stair)}.`);
  } else {
    if (s.fires.some(f => distance(f, p) <= 8)) parts.push('Flame mutters close by.');
    else if (nearest(braziers) && distance(nearest(braziers), p) <= 6) parts.push('A brazier breathes, slow and orange.');
    if (s.slicks.some(c => distance(c, p) <= 6)) parts.push('Oil lies quiet, keeping its fire in reserve.');
    if (nearest(stairs) && distance(nearest(stairs), p) <= 9) parts.push('A cold draught climbs from the stair.');
  }
  if (s.smoke.some(c => distance(c, p) <= 4)) parts.push('Grey smoke still hangs, muffling the stone.');
  if (living.length > 1) parts.push(`More than one thing stirs within hearing (${living.length}).`);
  api.say(s, parts.join(' '));
  api.event(s, 'listen', { heard: living.length, nearest: near ? near.kind : null, dark, depth: s.depth });
}

// The deep's patience keeps a fallen witness standing, and is paid for in light.
function endure(s, api) {
  const p = s.player;
  if (!p.endurance || p.hp > 0) return;
  p.endurance--;
  p.hp = 8;
  p.oil = 0;
  p.lantern = false;
  s.sound = 'endure';
  api.say(s, 'The deep drinketh thy light, and beareth thee up.', 'danger');
  api.event(s, 'endured', { remaining: p.endurance, depth: s.depth });
}

function hurt(s,amount,source,api) {
  const damage=Math.max(1,amount-(s.player.armored?1:0));
  s.player.hp=Math.max(0,s.player.hp-damage); s.sound='hurt';
  api.say(s,`The ${source} deals ${damage}.`,'danger');
  api.event(s,'hurt',{source,damage});
  endure(s,api);
}

// Small blind things that seek any light, drink it, and are gone.
function moth(s, e, api) {
  const p = s.player;
  const openLamp = p.lantern && p.oil > 0;
  if (openLamp && distance(e, p) <= 1) {
    const sip = Math.min(9, p.oil);
    p.oil -= sip;
    s.sound = 'moth';
    if (sip) api.say(s, `A pale moth sips at the flame; the lamp gives up ${sip} oil, and the moth is sated.`, 'danger');
    else api.say(s, 'A pale moth bats at the dry lantern and wanders off.');
    api.event(s, 'moth-sip', { target: e.id, oil: sip, depth: s.depth });
    if (!p.oil && p.lantern) { p.lantern = false; api.say(s, 'The flame drowns. The lamp is dark.', 'danger'); }
    s.enemies = s.enemies.filter(o => o !== e);
    return;
  }
  let target = openLamp ? { x: p.x, y: p.y } : null;
  if (!target) {
    let best = null;
    const seen = (c) => { const d = distance(c, e); if (d <= 10 && (!best || d < best.d)) best = { x: c.x, y: c.y, d }; };
    s.fires.forEach(seen);
    s.map.forEach((row, y) => row.forEach((t, x) => { if (t === 'b') seen({ x, y }); }));
    if (!best) return;      // no light to seek; it hangs unseen in the dark
    target = best;
  }
  const options = directions.map(([dx,dy]) => ({ x: e.x+dx, y: e.y+dy })).filter(c =>
    passable(s, c.x, c.y) && !enemyAt(s, c.x, c.y) && distance(c, p) > 0 &&
    (c.x === e.x || c.y === e.y || (passable(s, c.x, e.y) && passable(s, e.x, c.y))));
  options.sort((a, b) => distance(a, target) - distance(b, target));
  if (options.length) { e.x = options[0].x; e.y = options[0].y; }
  // Having reached the fire, it is swallowed.
  if (fireAt(s, e.x, e.y) || at(s, e.x, e.y) === 'b') {
    s.sound = 'moth';
    api.say(s, 'The pale moth is swallowed by the flame.');
    api.event(s, 'moth-burned', { target: e.id, depth: s.depth });
    s.enemies = s.enemies.filter(o => o !== e);
  }
}

// Blind hunters that follow the noise of the living and lose it in silence.
function hound(s, e, api) {
  const p = s.player;
  const trail = s.noise && s.turn - s.noise.turn <= 4 && distance(e, s.noise) <= 14
    ? { x: s.noise.x, y: s.noise.y } : null;
  if (trail) {
    if (!e.alerted && distance(e, p) <= 12) { e.alerted = true; s.sound = 'hound'; api.event(s, 'hound-trail', { target: e.id, depth: s.depth }); }
  } else e.alerted = false;
  if (distance(e, p) <= 1) {                     // flesh found by touch
    hurt(s, 5, names[e.kind], api);
    return;
  }
  if (!trail) return;                            // no trail: it stands blind and still
  const options = directions.map(([dx,dy]) => ({ x: e.x+dx, y: e.y+dy })).filter(c =>
    passable(s, c.x, c.y) && !enemyAt(s, c.x, c.y) && distance(c, p) > 0 && !fireAt(s, c.x, c.y) &&
    (c.x === e.x || c.y === e.y || (passable(s, c.x, e.y) && passable(s, e.x, c.y))));
  options.sort((a, b) => distance(a, trail) - distance(b, trail));
  if (options.length) { e.x = options[0].x; e.y = options[0].y; }
}

function enemies(s,api) {
  const p=s.player;
  for (const e of s.enemies) {
    if (!p.hp) break;
    if (e.kind === 'moth') { moth(s, e, api); continue; }
    if (e.kind === 'hound') { hound(s, e, api); continue; }
    // Ringing silver pulls the hungry harder than an unseen witness does.
    const lure = s.lure && s.lure.until>s.turn &&
      distance(e,s.lure)<=6 && distance(e,s.lure)<distance(e,p) ? s.lure : null;
    const smoky=s.smoke.some(c=>distance(c,e)<2 || (c.x===p.x && c.y===p.y));
    const sees=!smoky && distance(e,p)<=(p.lantern?10:p.armored?7:4) && line(s,e,p);
    if (e.intent) {
      if (p.x===e.intent.x && p.y===e.intent.y) hurt(s,7,names[e.kind],api);
      else api.say(s,'The porter strikes the ground it was promised.');
      e.intent=null;
      continue;
    }
    if (sees) e.lastSeen={x:p.x,y:p.y,turn:s.turn};
    // Ash rats are drawn to spilt oil and will cross a room to drink it.
    const thirst = e.kind==='rat' && !lure ? nearestSlick(s,e,5) : null;
    if (!lure && !thirst && (!e.lastSeen || s.turn-e.lastSeen.turn>6)) continue;
    const afraid=e.kind==='rat' && (
      (p.lantern && p.oil>0 && distance(e,p)<=2) ||
      s.fires.some(f=>distance(f,e)<=3) ||
      s.map.some((r,y)=>r.some((t,x)=>t==='b' && distance(e,{x,y})<=2))
    );
    const fleeing=afraid || (e.kind==='thief' && e.stolen>0);
    if (thirst && !fleeing && e.x===thirst.x && e.y===thirst.y) { drinkOil(s,e,api); continue; }
    if (!fleeing && sees && distance(e,p)<=1) {
      if (e.kind==='watcher') {
        e.intent={x:p.x,y:p.y}; api.say(s,'The porter settles its weight.','danger');
      } else if (e.kind==='thief' && p.silver>0) {
        e.stolen=Math.min(5,p.silver); p.silver-=e.stolen;
        api.say(s,`The collector takes ${e.stolen} silver and bows.`,'danger');
        api.event(s,'theft',{target:e.id,amount:e.stolen});
      } else hurt(s,e.kind==='rat'?3:4,names[e.kind],api);
      continue;
    }
    const target=lure?lure:(thirst&&!fleeing)?thirst:fleeing?p:e.lastSeen;
    const retreat=!lure && fleeing;
    // A porter will not be turned aside by flame; the rest keep clear of fire.
    const options=directions.map(([dx,dy])=>({x:e.x+dx,y:e.y+dy})).filter(c=>
      passable(s,c.x,c.y) && !enemyAt(s,c.x,c.y) && distance(c,p)>0 &&
      (e.kind==='watcher' || !fireAt(s,c.x,c.y)) &&
      (c.x===e.x || c.y===e.y || (passable(s,c.x,e.y) && passable(s,e.x,c.y))));
    options.sort((a,b)=>(distance(a,target)-distance(b,target))*(retreat?-1:1));
    if (options.length) { e.x=options[0].x; e.y=options[0].y; }
    if (thirst && !fleeing && e.x===thirst.x && e.y===thirst.y) { drinkOil(s,e,api); continue; }
    if (lure && e.x===lure.x && e.y===lure.y) {
      if (e.kind==='thief') {
        e.stolen+=5;
        s.items=s.items.filter(it=>!(it.x===e.x && it.y===e.y && it.kind==='coins'));
        s.lure=null;
        api.say(s,'The collector gathers the ringing silver and keeps it.','danger');
        api.event(s,'lured-tithe',{target:e.id,x:e.x,y:e.y});
      } else {
        if (!e.glutted) { e.glutted=true; api.say(s,`The ${names[e.kind]} noses at the silver and lingers.`); }
      }
      continue;
    }
  }
}

// Fire is fed by what was spilled, travels along it, and starves in five turns.
function burn(s,api) {
  const p=s.player;
  for (const f of [...s.fires]) {
    if (s.turn > f.until) continue;
    for (const [dx,dy] of directions.slice(0,4)) {
      if (slickAt(s,f.x+dx,f.y+dy)) ignite(s,f.x+dx,f.y+dy);
    }
  }
  for (const f of [...s.fires]) {
    if (s.turn > f.until) continue;
    const e=enemyAt(s,f.x,f.y);
    if (e) {
      if (greased(s,e)) { hit(s,e,9,api); api.event(s,'greased-burn',{target:e.id,x:f.x,y:f.y}); }
      else hit(s,e,4,api);
    }
    if (p.hp && p.x===f.x && p.y===f.y) {
      p.hp=Math.max(0,p.hp-5); s.sound='hurt';
      api.say(s,'The burning oil takes five of thee.','danger');
      api.event(s,'burned',{x:f.x,y:f.y,damage:5});
      endure(s,api);
    }
  }
  s.fires=s.fires.filter(f=>s.turn<=f.until);
}

export function act(s,a,api) {
  const p=s.player;
  if (!p.hp) return false;
  s.sound=null;
  let consumed=true;
  if (a.type==='petition') {
    if(s.prompt?.kind!=='shrine' || typeof a.text!=='string') return false;
    if(shrineUsed(s,s.prompt.x,s.prompt.y)) {
      s.prompt=null;api.say(s,'This stone already bears thy words.');return false;
    }
    const request=a.text.trim();
    if(!request || request.length>2000) return false;
    const petition={id:`petition-${s.eventSequence+1}`,turn:s.turn,depth:s.depth,
      x:s.prompt.x,y:s.prompt.y,request,status:'pending'};
    s.petitions.push(petition);s.prompt=null;
    api.event(s,'petition',{...petition,petitionId:petition.id});
    api.say(s,`Into the hollow stone: “${request}”`);
    api.say(s,'The stone makes no undertaking.');
  } else if (a.type==='cancel-prompt') {s.prompt=null;return false;
  } else if (a.type==='move') {
    if (!directions.some(([dx,dy])=>dx===a.dx && dy===a.dy)) return false;
    const x=p.x+a.dx,y=p.y+a.dy;
    if (a.dx && a.dy && (!passable(s,x,p.y)||!passable(s,p.x,y))) return false;
    const e=enemyAt(s,x,y);
    if (e) hit(s,e,3+Math.floor(api.random(s)*3),api);
    else if (at(s,x,y)==='+') { s.map[y][x]='/'; s.sound='door'; api.say(s,'The door yields.'); }
    else if (passable(s,x,y)) { p.x=x;p.y=y;s.sound='step';pickup(s,api); }
    else consumed=false;
  } else if (a.type==='wait') { listen(s,api); /* Time is sometimes the necessary expense. */
  } else if (a.type==='lantern') {
    if(!p.lantern && !p.oil) {api.say(s,'The lantern holds no oil.');return false;}
    p.lantern=!p.lantern; api.say(s,p.lantern?'The lantern opens.':'The light is covered.');
  } else if (a.type==='heal') {
    if (!p.potions || p.hp===p.maxHp) { api.say(s,'No draught is spent.'); return false; }
    p.potions--; p.hp=Math.min(p.maxHp,p.hp+13); s.sound='heal'; api.say(s,'Bitter warmth. Thirteen wounds, or thereabouts.');
  } else if (a.type==='armor') {
    if (!p.hasMail) { api.say(s,'No mail is carried.'); return false; }
    p.armored=!p.armored; api.say(s,p.armored?'The iron settles noisily.':'The iron is bundled away.');
  } else if (a.type==='smoke') {
    if (!p.smoke) { api.say(s,'No smoke vessel remains.'); return false; }
    p.smoke--;s.sound='smoke';
    for (let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) {
      if(passable(s,p.x+dx,p.y+dy)) s.smoke.push({x:p.x+dx,y:p.y+dy,until:s.turn+6});
    }
    api.say(s,'Grey smoke separates the witnesses.');
  } else if (a.type==='oil') {
    if (!directions.some(([dx,dy])=>dx===a.dx && dy===a.dy)) return false;
    const x=p.x+a.dx, y=p.y+a.dy;
    if (!passable(s,x,y)) { api.say(s,'Stone will not drink it.'); return false; }
    if (slickAt(s,x,y)) { api.say(s,'Oil already pools there.'); return false; }
    if (fireAt(s,x,y)) { api.say(s,'That ground is already alight.'); return false; }
    if (p.oil<6) { api.say(s,'Six measures are not to be spared.'); return false; }
    p.oil-=6; s.slicks.push({x,y});
    const naked = s.fires.some(f=>distance(f,{x,y})<=1) ||
      s.map.some((row,j)=>row.some((t,i)=>t==='b' && distance({x:i,y:j},{x,y})<=1));
    if (naked) {
      ignite(s,x,y); s.sound='fire';
      api.say(s,'The fresh oil takes the flame at once.','danger');
    } else api.say(s,'Six measures of lamp oil spread across the stone.');
    api.event(s,'spill-oil',{x,y,ignited:naked});
  } else if (a.type==='throw') {
    if (!p.knives || !directions.some(([dx,dy])=>dx===a.dx && dy===a.dy)) { api.say(s,'No knife is thrown.'); return false; }
    p.knives--; let struck=false;
    for(let i=1;i<=6;i++) {
      const x=p.x+a.dx*i,y=p.y+a.dy*i;
      if(!passable(s,x,y)) break;
      const e=enemyAt(s,x,y);
      if(e) { hit(s,e,7,api);struck=true;break; }
    }
    if(!struck) api.say(s,'The knife is lost to stone.');
  } else if (a.type==='cast') {
    if(!directions.some(([dx,dy])=>dx===a.dx && dy===a.dy)) return false;
    if(p.silver<5) { api.say(s,'Five silver are not in thy keeping.');return false; }
    let x=p.x,y=p.y;
    for(let i=1;i<=4;i++) {
      const nx=p.x+a.dx*i,ny=p.y+a.dy*i;
      if(!passable(s,nx,ny) || s.items.some(it=>it.x===nx && it.y===ny) || enemyAt(s,nx,ny)) break;
      x=nx;y=ny;
    }
    if(x===p.x && y===p.y) { api.say(s,'No bare stone shows itself that way.');return false; }
    p.silver-=5;
    s.items.push({ id:`d${s.depth}-cast${s.eventSequence+1}`, x, y, kind:'coins' });
    // The ringing draws the hungry from farther than the eye can reach.
    s.lure={ x, y, until:s.turn+7 };
    for(const foe of s.enemies) delete foe.glutted;
    s.sound='coin';
    api.say(s,'Five silver ring across the stone. The deep listens.');
    api.event(s,'cast-tithe',{x,y,depth:s.depth});
  } else if (a.type==='interact') {
    if(at(s,p.x,p.y)==='>') {
      s.depth++; floor(s,api.ROT,api); s.sound='door';
      api.say(s,'The stairs remember a lighter burden.');
      s.turn++; api.event(s,'action',{action:a.type,depth:s.depth,x:p.x,y:p.y}); return true;
    }
    const neighbours=[{x:p.x,y:p.y},...directions.slice(0,4).map(([dx,dy])=>({x:p.x+dx,y:p.y+dy}))];
    const c=neighbours.find(c=>['s','b','o','/','+'].includes(at(s,c.x,c.y)) && !enemyAt(s,c.x,c.y));
    if(!c) {
      // An open lamp held to old oil wakes it. Whatever burns then travels as it wills.
      const pool=directions.slice(0,4).map(([dx,dy])=>({x:p.x+dx,y:p.y+dy}))
        .find(q=>slickAt(s,q.x,q.y) && !fireAt(s,q.x,q.y));
      if(pool) {
        if(!p.lantern) { api.say(s,'A covered light will not serve. Uncover it first.');return false; }
        if(!p.oil) { api.say(s,'The lamp is dry.');return false; }
        ignite(s,pool.x,pool.y); s.sound='fire';
        api.say(s,'Thou settest thy open flame to the oil. It takes.','danger');
        api.event(s,'light-slick',{x:pool.x,y:pool.y,depth:s.depth});
      } else if(slickAt(s,p.x,p.y)) {
        api.say(s,'The oil pools beneath thee. Step aside and set flame to it.');return false;
      } else { api.say(s,'Nothing here answers the hand.');return false; }
    } else {
      const t=at(s,c.x,c.y);
      if(t==='s') {
        if(shrineUsed(s,c.x,c.y)) {
          s.prompt=null;api.say(s,'This stone already bears thy words.');return false;
        }
        s.prompt={kind:'shrine',input:'text',x:c.x,y:c.y,title:'The hollow face',
          text:'One petition may this stone bear. Hearing is not assent. Speaking spends a turn.'};return false;
      }
      if(t==='b') { s.map[c.y][c.x]='o';p.oil+=16;api.say(s,'Sixteen measures of oil. One less flame.'); }
      if(t==='o') {
        if(p.oil<8) { api.say(s,'The brazier requires eight measures of oil.');return false; }
        p.oil-=8;s.map[c.y][c.x]='b';api.say(s,'The flame takes hold.');
      }
      if(t==='/') {
        if(c.x===p.x && c.y===p.y) { api.say(s,'The threshold must first be clear.');return false; }
        s.map[c.y][c.x]='+';s.sound='door';api.say(s,'The door closes.');
      }
      if(t==='+') { s.map[c.y][c.x]='/';s.sound='door';api.say(s,'The door opens.'); }
    }
  } else return false;
  if(!consumed) return false;
  s.turn++;
  // Every deed but stillness makes a noise for the blind to follow.
  if(a.type!=='wait') s.noise={ x:p.x, y:p.y, turn:s.turn };
  if(p.lantern && p.oil>0) {
    p.oil--; if(!p.oil) { p.lantern=false;api.say(s,'The last oil darkens.','danger'); }
  }
  s.smoke=s.smoke.filter(c=>c.until>s.turn);
  enemies(s,api);
  burn(s,api);
  api.event(s,'action',{action:a.type,x:p.x,y:p.y,depth:s.depth,hp:p.hp});
  if(!p.hp) { api.say(s,'The witness is concluded. The Threshold remains.','danger');api.event(s,'death',{depth:s.depth}); }
  return true;
}
