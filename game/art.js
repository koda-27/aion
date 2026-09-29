// Eight-pixel text-authored masks, drawn at integral scale on Canvas 2D.
// Add sprites here; every immutable release carries its own art and sound data.
export const sprites = {
  shrine: ['...##...', '..####..', '.##..##.', '.#....#.', '..####..', '...##...', '..####..', '.######.'],
  wall: ['########', '#..#...#', '########', '..#...#.', '########', '#...#..#', '########', '...#....'],
  floor: ['........', '........', '..#.....', '........', '........', '.....#..', '........', '........'],
  player: ['...##...', '..####..', '...##...', '..####..', '.######.', '...##...', '..#..#..', '.##..##.'],
  rat: ['........', '........', '..#.#...', '..####..', '.######.', '##.##.#.', '....#...', '........'],
  watcher: ['...##...', '..####..', '.######.', '##.##.##', '.######.', '..####..', '..#..#..', '.#....#.'],
  thief: ['..####..', '.######.', '..#..#..', '...##...', '..####..', '.#.##.#.', '..#..#..', '.#....#.'],
  stair: ['........', '.##.....', '.###....', '.####...', '.#####..', '.######.', '........', '........'],
  door: ['.######.', '.#....#.', '.#....#.', '.#..#.#.', '.#....#.', '.#....#.', '.######.', '........'],
  open: ['.#......', '.##.....', '.#.#....', '.#..#...', '.#..#...', '.#.#....', '.##.....', '.#......'],
  brazier: ['...#....', '..#.#...', '...##...', '..####..', '.######.', '..####..', '...##...', '..####..'],
  potion: ['...##...', '...##...', '..####..', '.######.', '.######.', '.######.', '..####..', '........'],
  knife: ['......#.', '.....##.', '....##..', '...##...', '..##....', '.###....', '..#.....', '.#......'],
  mail: ['.##..##.', '########', '##.##.##', '...##...', '..####..', '..####..', '..####..', '........'],
  smoke: ['........', '..##....', '.####...', '...####.', '..####..', '....##..', '........', '........'],
  oil: ['...##...', '..####..', '..####..', '..####..', '..####..', '..####..', '..####..', '........'],
  coins: ['........', '...###..', '..#...#.', '..#...#.', '...###..', '.###....', '.###....', '........'],
  slick: ['........', '........', '........', '..#.....', '.####...', '######..', '.###.#..', '........'],
  flame: ['...##...', '..#..#..', '..#.##..', '.##.##..', '.#####..', '..####..', '...##...', '........'],
  moth: ['........', '#..#..#.', '.##.##..', '#.####.#', '.#.##.#.', '..####..', '...##...', '........'],
  hound: ['........', '##......', '##.###..', '######.#', '.#####..', '.#..#...', '.#..#...', '........'],
};

// Stable Web Audio renderer interprets layered noise/oscillator envelopes.
export const sounds = {
  step: [{ wave: 'noise', frequency: 280, endFrequency: 110, duration: .075, gain: .045, filter: 'lowpass' }],
  hit: [
    { wave: 'noise', frequency: 1800, endFrequency: 240, duration: .12, gain: .16, filter: 'bandpass' },
    { wave: 'triangle', frequency: 95, endFrequency: 35, duration: .1, gain: .12 },
  ],
  hurt: [{ wave: 'noise', frequency: 380, endFrequency: 70, duration: .2, gain: .17, filter: 'lowpass' }],
  door: [{ wave: 'noise', frequency: 650, endFrequency: 120, duration: .28, gain: .1, filter: 'bandpass' }],
  heal: [
    { wave: 'noise', frequency: 1100, endFrequency: 430, duration: .11, gain: .08, filter: 'bandpass' },
    { wave: 'noise', frequency: 380, endFrequency: 850, delay: .1, duration: .5, gain: .07, filter: 'bandpass' },
  ],
  smoke: [{ wave: 'noise', frequency: 2400, endFrequency: 180, duration: .7, gain: .09, filter: 'lowpass' }],
  fire: [
    { wave: 'noise', frequency: 900, endFrequency: 320, duration: .9, gain: .07, filter: 'bandpass' },
    { wave: 'noise', frequency: 240, endFrequency: 120, delay: .1, duration: 1.2, gain: .05, filter: 'lowpass' },
  ],
  oracle: [
    { wave: 'noise', frequency: 210, endFrequency: 490, duration: 1.8, gain: .04, filter: 'bandpass' },
    { wave: 'sine', frequency: 73, endFrequency: 68, delay: .25, duration: 1.5, gain: .025 },
  ],
  coin: [
    { wave: 'sine', frequency: 1980, endFrequency: 1460, duration: .34, gain: .045 },
    { wave: 'sine', frequency: 2660, endFrequency: 2140, delay: .02, duration: .26, gain: .028 },
    { wave: 'noise', frequency: 3600, endFrequency: 2400, duration: .05, gain: .05, filter: 'bandpass' },
  ],
  endure: [
    { wave: 'sine', frequency: 116, endFrequency: 78, duration: 1.1, gain: .09 },
    { wave: 'noise', frequency: 320, endFrequency: 90, duration: .7, gain: .05, filter: 'lowpass' },
  ],
  listen: [
    { wave: 'noise', frequency: 190, endFrequency: 84, duration: 2.8, gain: .035, filter: 'lowpass' },
    { wave: 'sine', frequency: 57, endFrequency: 43, delay: .15, duration: 2.6, gain: .022 },
  ],
  stir: [
    { wave: 'noise', frequency: 880, endFrequency: 240, duration: .45, gain: .05, filter: 'bandpass' },
    { wave: 'sine', frequency: 118, endFrequency: 66, delay: .12, duration: .8, gain: .03 },
  ],
  moth: [
    { wave: 'noise', frequency: 2600, endFrequency: 680, duration: .22, gain: .05, filter: 'bandpass' },
    { wave: 'noise', frequency: 1300, endFrequency: 460, delay: .13, duration: .3, gain: .04, filter: 'bandpass' },
  ],
  hound: [
    { wave: 'sine', frequency: 152, endFrequency: 80, duration: 1, gain: .07 },
    { wave: 'noise', frequency: 720, endFrequency: 170, delay: .18, duration: .9, gain: .05, filter: 'bandpass' },
  ],
};
