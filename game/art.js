// The base art is a set of plain fallbacks, nothing more. Every written place
// and story carries its own `sprites` and `sounds`, and a name defined there
// is used in preference to the same name here.
//
// Sprites are eight text rows of eight; `.` and space are empty.
export const sprites = {
  none: Array(8).fill('........'),
  wall: Array(8).fill('########'),
  floor: ['........', '........', '........', '....#...', '........', '........', '........', '........'],
  door: ['.######.', '.#....#.', '.#....#.', '.#..#.#.', '.#....#.', '.#....#.', '.######.', '........'],
  open: ['.#......', '.##.....', '.#.#....', '.#..#...', '.#..#...', '.#.#....', '.##.....', '.#......'],
  way: ['........', '..####..', '.#....#.', '.#....#.', '.#....#.', '.#....#.', '.#....#.', '........'],
  thing: ['........', '........', '..####..', '..#..#..', '..#..#..', '..####..', '........', '........'],
};

// A sound is a list of layers: { wave, frequency, endFrequency, duration, gain,
// delay, attack, filter, q }. `wave` is sine/triangle/sawtooth/square or
// white/pink/brown noise.
export const sounds = {
  step: [{ wave: 'brown', frequency: 420, endFrequency: 160, duration: .07, gain: .05, filter: 'lowpass' }],
  door: [{ wave: 'white', frequency: 650, endFrequency: 120, duration: .28, gain: .08, filter: 'bandpass' }],
  take: [{ wave: 'white', frequency: 1100, endFrequency: 430, duration: .11, gain: .05, filter: 'bandpass' }],
  drop: [{ wave: 'triangle', frequency: 140, endFrequency: 60, duration: .12, gain: .07 }],
  leave: [{ wave: 'brown', frequency: 420, endFrequency: 90, duration: 1.4, gain: .06, filter: 'lowpass' }],
};
