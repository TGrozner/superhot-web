/** Original procedural-looking environments; no material extracted from any game. */
const column = (x, z, h = 5) => ({ x, z, y: h / 2, w: 1.1, h, d: 1.1, color: '#d3dce2', solid: true });
const plinth = (x, z, w = 2.6, d = 2.1, h = 1.5) => ({ x, z, y: h / 2, w, h, d, color: '#d6dfe5', solid: true });
const divider = (x, z, w = 4.3, d = 0.75, h = 3.25) => ({ x, z, y: h / 2, w, h, d, color: '#e1e7ea', solid: true });

export const LEVELS = [
  {
    name: 'THE ATRIUM', subtitle: 'DON’T STOP. DON’T DIE.',
    spawn: { x: 0, z: 12 },
    obstacles: [
      column(-9, -4), column(9, -4), column(-9, -17), column(9, -17),
      plinth(-4, -10), plinth(5, -14), plinth(0, -23, 5, 1.3, 2.8),
      divider(-12, -23, 1, 3.5), divider(12, -23, 1, 3.5),
    ],
    enemies: [
      { x: -6.5, z: -5.5, delay: 0 },
      { x: 5.5, z: -8.5, delay: 0.7 },
      { x: 0, z: -18, delay: 1.6 },
    ],
  },
  {
    name: 'THE CROSSING', subtitle: 'THE WORLD IS YOUR WEAPON.',
    spawn: { x: 0, z: 12 },
    obstacles: [
      column(-11, -8), column(11, -8), column(-11, -20), column(11, -20),
      divider(0, -7, 4, 1.2, 2.6), divider(-5, -18, 5, 1.1, 2.7),
      divider(5.5, -17.5, 5, 1.1, 2.7), plinth(-8.5, -12, 2.2, 2.2),
      plinth(8.5, -12, 2.2, 2.2),
    ],
    enemies: [
      { x: -10, z: -3, delay: 0 },
      { x: 10, z: -3, delay: 0.5 },
      { x: -2, z: -13, delay: 0.9 },
      { x: 7.5, z: -23, delay: 1.7 },
      { x: -8.5, z: -24, delay: 2.2 },
    ],
  },
  {
    name: 'THE GALLERY', subtitle: 'MAKE EVERY SECOND COUNT.',
    spawn: { x: 0, z: 12 },
    obstacles: [
      column(-10, 0), column(10, 0), column(-10, -12), column(10, -12),
      column(-10, -23), column(10, -23), plinth(0, -5, 3.8, 2.5, 1.75),
      divider(-6, -14, 1.0, 6, 2.5), divider(6, -14, 1.0, 6, 2.5),
      plinth(0, -23, 5, 1.5, 2.8),
    ],
    enemies: [
      { x: -6.5, z: -3.5, delay: 0 },
      { x: 6.5, z: -3.5, delay: 0.3 },
      { x: -2, z: -10, delay: 0.8 },
      { x: 2, z: -19, delay: 1.3 },
      { x: -8, z: -24, delay: 1.8 },
      { x: 8.5, z: -24, delay: 2.4 },
    ],
  },
];

const WALL_COLOR = '#dee5e9';
export const buildStaticGeometry = (level) => {
  const objects = [
    { x: 0, y: -0.30, z: -6, w: 32, h: 0.60, d: 58, color: '#edf1f3' },
    { x: -16, y: 4.0, z: -6, w: .7, h: 8, d: 58, color: WALL_COLOR, solid: true },
    { x: 16, y: 4.0, z: -6, w: .7, h: 8, d: 58, color: WALL_COLOR, solid: true },
    { x: 0, y: 4.0, z: -35, w: 32, h: 8, d: .7, color: WALL_COLOR, solid: true },
    { x: 0, y: 4.0, z: 23, w: 32, h: 8, d: .7, color: WALL_COLOR, solid: true },
  ];
  // Architectural rhythm and soft floor tile seams.
  for (let z = -32; z <= 20; z += 4) {
    objects.push({ x: 0, y: .008, z, w: 31, h: .014, d: .045, color: '#dce3e7' });
    for (const x of [-15.65, 15.65]) {
      objects.push({ x, y: 4, z, w: .15, h: 7.9, d: .15, color: '#c5d1d9' });
    }
  }
  for (let x = -14; x <= 14; x += 4) {
    objects.push({ x, y: .009, z: -6, w: .045, h: .014, d: 56, color: '#dce3e7' });
  }
  for (let z = -28; z <= 16; z += 12) {
    for (const x of [-15.5, 15.5]) {
      objects.push({ x, y: 5.4, z, w: .15, h: 2.0, d: 5.4, color: '#f8fbfd' });
      objects.push({ x: x + (x < 0 ? .1 : -.1), y: 6.5, z, w: .05, h: .05, d: 5.4, color: '#bdccd5' });
    }
  }
  objects.push(...level.obstacles);
  return objects;
};
