export const ABI = 1;

export function random(state) {
  let x = state.rng | 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  state.rng = x >>> 0;
  return state.rng / 4294967296;
}

export function say(state, text, kind = 'world') {
  state.messages.push({ turn: state.turn, text: String(text), kind });
  state.messages = state.messages.slice(-120);
}

export function event(state, type, detail = {}) {
  state.events.push({ ...detail, id: ++state.eventSequence, turn: state.turn, type });
  state.events = state.events.slice(-100);
}

export const api = Object.freeze({ random, say, event });

// Cold petition history is archived by the host; all shrines on this floor stay
// represented so their one-use rule survives even unusually shrine-heavy floors.
export function retainedPetitions(state) {
  const all=state.petitions ?? [],recent=new Set(all.slice(-64));
  return all.filter(p=>p.depth===state.depth || recent.has(p));
}

export function acknowledgeArchive(state,snapshot) {
  if(!state || state.runId!==snapshot.runId) return;
  const retained=new Set(retainedPetitions(snapshot));
  const removed=new Map((snapshot.petitions ?? []).filter(p=>!retained.has(p)).map(p=>[p.id,JSON.stringify(p)]));
  // An older save acknowledgement cannot discard a newly answered petition.
  state.petitions=(state.petitions ?? []).filter(p=>removed.get(p.id)!==JSON.stringify(p));
}

export function validateState(state) {
  if (!state || state.schema !== 1 || !Number.isInteger(state.turn) || state.turn < 0) {
    throw new Error('Invalid world schema/turn');
  }
  if (!Number.isInteger(state.rng) || !state.player || !Array.isArray(state.messages)
      || !Array.isArray(state.events) || !Number.isInteger(state.eventSequence)) {
    throw new Error('Invalid persistent state');
  }
  if(state.petitions!==undefined && !Array.isArray(state.petitions)) throw new Error('Invalid petition history');
  if(state.runId!==undefined && (typeof state.runId!=='string'||!state.runId||state.runId.length>100)) throw new Error('Invalid witness identity');
  const encoded = JSON.stringify(state);
  if (encoded.length > 4_000_000) throw new Error('World exceeds save limit');
  const visit = (value) => {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Non-finite state');
    if (value === undefined || typeof value === 'function' || typeof value === 'symbol'
        || typeof value === 'bigint') throw new Error('State must be JSON-only');
    if (value && typeof value === 'object') {
      if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) {
        throw new Error('State must contain plain objects');
      }
      Object.values(value).forEach(visit);
    }
  };
  visit(state);
  return true;
}

export function validateModule(mod) {
  if (mod.abi !== ABI) throw new Error(`Expected game ABI ${ABI}`);
  for (const key of ['create', 'migrate', 'act', 'validate', 'appearance', 'opaque', 'inspect', 'status']) {
    if (typeof mod[key] !== 'function') throw new Error(`Missing game export: ${key}`);
  }
  if (!mod.sprites || !mod.sounds || !mod.bindings) throw new Error('Missing presentation exports');
}

// Transactions are synchronous: input cannot interleave with activation/migration.
// A rejected candidate never receives the actual live state object.
export function migrateWorld(mod, current) {
  validateModule(mod);
  const draft = structuredClone(current);
  const migrated = mod.migrate(draft, api);
  validateState(migrated);
  mod.validate(migrated);
  if (migrated.turn !== current.turn) throw new Error('Migration must not spend player turns');
  return migrated;
}
