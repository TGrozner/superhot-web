import { buildSceneGraph } from './scenes/graph.js';
import { planSceneDraws } from './visual/scene-plan.js';

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


/**
 * SH-05 opt-in rendering fixture. Every object/material below is newly generated:
 * NOT Containers, NOT a recovered MCD scene, and intentionally visual-only.
 * The independent graph owner (#4) can later supply verified scene nodes.
 */
export function buildSyntheticManifest() {
  const yaw = 0.27, tilt = 0.17;
  const nodes = [
    {
      id: 'demo-root',
      transform: {
        position: { x: 0, y: 0, z: -10 },
        rotation: { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) },
        scale: { x: 1.28, y: 1, z: 0.82 },
      },
    },
    {
      id: 'demo-left-support', parentId: 'demo-root',
      transform: { position: { x: -4.4, y: 2.15, z: 0 } },
      primitive: { kind: 'box', size: { x: 0.9, y: 4.3, z: 1.1 } },
      material: 'steel',
    },
    {
      id: 'demo-right-support', parentId: 'demo-root',
      transform: { position: { x: 4.4, y: 2.15, z: 0 } },
      primitive: { kind: 'box', size: { x: 0.9, y: 4.3, z: 1.1 } },
      material: 'steel',
    },
    {
      id: 'demo-angled-lintel', parentId: 'demo-root',
      transform: {
        position: { x: 0, y: 4.3, z: 0 },
        rotation: { x: 0, y: 0, z: Math.sin(tilt / 2), w: Math.cos(tilt / 2) },
      },
      primitive: { kind: 'box', size: { x: 9.8, y: 0.65, z: 0.95 } },
      material: 'glass',
    },
    {
      id: 'demo-inner-prism', parentId: 'demo-root',
      transform: {
        position: { x: 0, y: 1.9, z: -2.1 },
        rotation: { x: 0, y: Math.sin(Math.PI / 8), z: 0, w: Math.cos(Math.PI / 8) },
        scale: { x: 1, y: 1.15, z: 1 },
      },
      primitive: { kind: 'box', size: { x: 1.7, y: 1.7, z: 1.7 } },
      material: 'red',
    },
    {
      id: 'demo-beam', parentId: 'demo-root',
      transform: { position: { x: 0, y: 0.95, z: -3.8 } },
      primitive: { kind: 'box', size: { x: 7, y: 0.26, z: 0.9 } },
      material: 'porcelain',
    },
    {
      id: 'demo-floor-inlay',
      transform: { position: { x: 0, y: 0.035, z: -6 } },
      primitive: { kind: 'box', size: { x: 4, y: 0.05, z: 4 } },
      material: 'chalk',
    },
  ];
  return buildSceneGraph(nodes, { coordinates: 'web' });
}

/**
 * Source-neutral graph -> culling -> actual WebGL renderer.
 * NEVER flatten a rotated, sheared or reflected matrix to legacy box args.
 */
export function drawGeneratedManifest(renderer, graph, camera, options = {}) {
  const plan = planSceneDraws(graph, camera, options);
  const nodes = new Map(graph.map((node) => [node.id, node]));
  let affineDraws = 0, legacyDraws = 0;
  for (const packet of plan.packets) {
    if (packet.legacyBoxArgs) {
      renderer.box(...packet.legacyBoxArgs);
      legacyDraws++;
    } else {
      renderer.affineBox(packet.matrix, nodes.get(packet.id).primitive.size, packet.color);
      affineDraws++;
    }
  }
  return {
    objects: graph.filter((node) => Boolean(node.primitive) && node.visible).length,
    visible: plan.packets.length,
    culled: plan.culled,
    hidden: plan.hidden,
    affineDraws,
    legacyDraws,
  };
}
