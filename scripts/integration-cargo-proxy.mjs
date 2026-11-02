/**
 * SH-16: opt-in compatibility adapter, NOT a native PhysX/BoxCollider port.
 *
 * Input must be SH-04's five rounded, source-derived Containers/build28 AABB
 * hulls. This supplies BOTH the x/y/z/w/h/d shape expected by resolveWalk()
 * and the min/max shape expected by segmentAabb(). Generated ribs and the
 * decorative floor are deliberately excluded.
 *
 * This file has no Node or WebGL dependencies; SH-05 alone may wire it into
 * the shared entrypoint. AABB overlap cannot prove Unity contact equivalence.
 */
const CARGO_IDS = Object.freeze(['cargo-22', 'cargo-upper', 'cargo-86', 'cargo-21', 'cargo-7']);

export function buildContainersProxySolids(hulls) {
  if (!Array.isArray(hulls) || hulls.length !== CARGO_IDS.length) {
    throw new RangeError('Expected exactly five indexed Containers collider-derived hulls');
  }
  const ids = new Set();
  const result = hulls.map((hull) => {
    if (!hull || !CARGO_IDS.includes(hull.id) || ids.has(hull.id)) {
      throw new TypeError('Unknown/duplicate Containers hull identifier');
    }
    ids.add(hull.id);
    const { center, size } = hull;
    if (!Array.isArray(center) || !Array.isArray(size) ||
        center.length !== 3 || size.length !== 3 ||
        center.some(v => !Number.isFinite(v)) ||
        size.some(v => !Number.isFinite(v) || v <= 0)) {
      throw new RangeError('Containers AABB must have finite center and positive dimensions');
    }
    const min = center.map((c, i) => c - size[i] / 2);
    const max = center.map((c, i) => c + size[i] / 2);
    if ([...min, ...max].some(v => !Number.isFinite(Math.fround(v)))) {
      throw new RangeError('Containers proxy exceeds finite WebGL2 float32 coordinate range');
    }
    const vector = ([x, y, z]) => Object.freeze({ x, y, z });
    return Object.freeze({
      id: hull.id,
      x: center[0], y: center[1], z: center[2],
      w: size[0], h: size[1], d: size[2],
      solid: true,
      min: vector(min), max: vector(max),
    });
  });
  if (ids.size !== CARGO_IDS.length) throw new RangeError('Missing indexed Containers hull');
  return Object.freeze(result);
}

/**
 * Static integration risk report, not evidence of the actual native spawn.
 * Explicitly checks the legacy prototype bounds which SH-05 must replace.
 */
export function assessLegacySpawnBounds(camera, bounds, solids) {
  if (!camera || !Number.isFinite(camera.x) || !Number.isFinite(camera.z) ||
      !bounds || !Array.isArray(solids)) throw new TypeError('Expected camera, bounds, proxy solids');
  const check = (axis) => {
    const range = bounds[axis];
    if (!Array.isArray(range) || range.length !== 2 || !range.every(Number.isFinite) ||
        range[0] >= range[1]) throw new RangeError('Invalid legacy movement bounds: ' + axis);
    return camera[axis] < range[0] || camera[axis] > range[1];
  };
  const outsideLegacyX = check('x'), outsideLegacyZ = check('z');
  const centersBeyondLegacyX = solids.filter(s => s.x < bounds.x[0] || s.x > bounds.x[1]).map(s => s.id);
  const centersBeyondLegacyZ = solids.filter(s => s.z < bounds.z[0] || s.z > bounds.z[1]).map(s => s.id);
  return Object.freeze({
    cameraOutsideLegacyMovementBounds: outsideLegacyX || outsideLegacyZ,
    outsideLegacyX, outsideLegacyZ,
    centersBeyondLegacyX, centersBeyondLegacyZ,
    nativeSpawnProven: false,
  });
}
