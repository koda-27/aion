// The thread: what has been written, and for whom. It ships empty.
//
// `threads` is keyed by Seeker number (1 for the first descent, 2 after the
// first ending, ...). Each entry may hold:
//   opening: story            told before the first place
//   floors:  { 1: place, … }  one written place per depth
//   stairs:  { 1: story, … }  told on leaving that depth
// While a slot is unwritten the Seeker walks in nothing. Import written
// modules here and add them:
//   import opening from './written/w1-opening.js';
//   export const threads = { 1: { opening, floors: {}, stairs: {} } };
export const threads = {};

// Where the Seeker is while nothing has been written: no walls, no floor, no edge.
const nowhere = {
  id: 'nowhere',
  shape: { kind: 'drawn', rows: [...Array(8).fill('.'.repeat(31)), `${'.'.repeat(15)}@${'.'.repeat(15)}`, ...Array(8).fill('.'.repeat(31))] },
  tiles: { '.': { sprite: 'none', color: '#000000', look: 'Nothing has been made here.' } },
  sight: 3,
  ambience: { id: 'nothing', layers: [
    { wave: 'sine', frequency: 46, gain: .05, lfo: { rate: .07, depth: .5 } },
    { wave: 'brown', filter: 'lowpass', frequency: 180, gain: .035, lfo: { rate: .05, depth: .6 } },
  ] },
};

// Every place and story by id, so a saved world can find its behaviour again.
export const sources = {};
export function index() {
  for (const id of Object.keys(sources)) delete sources[id];
  sources.nowhere = nowhere;
  for (const thread of Object.values(threads)) {
    for (const spec of [thread.opening, ...Object.values(thread.floors ?? {}), ...Object.values(thread.stairs ?? {})]) {
      if (!spec || sources[spec.id] === spec) continue;
      if (!spec.id || sources[spec.id]) throw new Error(`Missing or duplicate source id: ${spec.id}`);
      sources[spec.id] = spec;
    }
  }
}
index();
