import { buildSceneGraph } from './graph.js';
import { planSceneDraws } from '../visual/scene-plan.js';

/**
 * SH-04: generated presentation of five indexed build28 cargo collision hulls.
 * NOT recovered meshes, materials, textures, shaders or runtime observations.
 *
 * Source provenance (PRIVATE, never copied here):
 * superhot-research corpus-query issues #16, #27, #30, #32, #37, #39.
 * Source scene: build index 28, serialized owner level28.
 * Every center/extent below is a rounded, Z-mirrored world-space AABB
 * derived from an active serialized parent + model TRS and BoxCollider.
 */
export const CONTAINERS_BUILD28_HULLS = Object.freeze([
  Object.freeze({ id: 'cargo-22', center: Object.freeze([17.45, 2.575, 13.975]), size: Object.freeze([3, 3.198, 8.21]) }),
  Object.freeze({ id: 'cargo-upper', center: Object.freeze([17.475, 5.725, 15.8]), size: Object.freeze([8.21, 3.198, 3]) }),
  Object.freeze({ id: 'cargo-86', center: Object.freeze([4.575, 2.575, 15.9]), size: Object.freeze([8.21, 3.198, 3]) }),
  Object.freeze({ id: 'cargo-21', center: Object.freeze([14.5, 2.575, 16.825]), size: Object.freeze([3, 3.198, 8.21]) }),
  Object.freeze({ id: 'cargo-7', center: Object.freeze([10.1, 2.575, 18.475]), size: Object.freeze([3, 3.198, 8.21]) }),
]);

/** Demo-only camera. No native MCD camera binding or player pose is claimed. */
export const CONTAINERS_BUILD28_DEMO_CAMERA = Object.freeze({
  x: 11, y: 7, z: 31, yaw: 0, pitch: -0.19,
});

const vector = (v) => ({ x: v[0], y: v[1], z: v[2] });
const generatedBox = (id, center, size, material) => ({
  id,
  transform: { position: vector(center) },
  primitive: { kind: 'box', size: vector(size) },
  material,
});

/**
 * Every primitive is authored here. Shells approximate serialized COLLIDER
 * envelopes, not native mesh bounds; ribs and floor are invented decoration.
 * Axis-aligned draw proxies are deliberate: current renderer.box() cannot
 * accept arbitrary affine transforms. Do not mistake this for mesh parity.
 */
export function createContainersBuild28Nodes() {
  const nodes = [
    // Purely synthetic floor; the original LevelFloor geometry is not known.
    generatedBox('generated-ground', [11, 0.92, 16], [24, 0.1, 26], 'chalk'),
  ];

  for (const [index, hull] of CONTAINERS_BUILD28_HULLS.entries()) {
    const { id, center, size } = hull;
    nodes.push(generatedBox(id, center, size, index % 2 === 0 ? 'steel' : 'porcelain'));

    // Entirely generated cargo-style corrugation: 4 dark ribs on each side.
    // Decorative offsets are NOT sourced from a Unity mesh or shader.
    const longAxis = size[0] > size[2] ? 0 : 2;
    const sideAxis = longAxis === 0 ? 2 : 0;
    const ribSize = longAxis === 0
      ? [0.065, size[1] - 0.12, 0.065]
      : [0.065, size[1] - 0.12, 0.065];
    for (let rib = 0; rib < 4; rib++) {
      for (const side of [-1, 1]) {
        const at = [...center];
        at[longAxis] += ((rib + 1) / 5 - 0.5) * size[longAxis];
        at[sideAxis] += side * (size[sideAxis] / 2 + 0.025);
        nodes.push(generatedBox(`${id}-rib-${rib}-${side < 0 ? 'a' : 'b'}`, at, ribSize, 'shadow'));
      }
    }
  }
  return nodes;
}

/**
 * SH-05 integration contract:
 *   const plan = createContainersBuild28DrawPlan(camera);
 *   for (const p of plan.packets) renderer.box(...p.legacyBoxArgs);
 * All emitted packets are axis-aligned (legacyBoxArgs !== null).
 * This module NEVER modifies renderer/levels/main.
 */
export function createContainersBuild28DrawPlan(camera = CONTAINERS_BUILD28_DEMO_CAMERA, options = {}) {
  const graph = buildSceneGraph(createContainersBuild28Nodes(), { coordinates: 'web' });
  return planSceneDraws(graph, camera, options);
}
