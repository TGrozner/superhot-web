// SH-04/J4: static source BoxCollider visibility for the three Dojo warnings.
// Web-only CPU optimization, NOT a recovered MCD light/occlusion algorithm.
// The movement solver needs triangles, edges and contact normals; a door
// visibility segment only needs an affine box's three local-space slabs.
// Never manufacture occluders from render proxies or missing scene assets.

const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * Prepare enabled, solid source BoxColliders as compact inverse affine boxes.
 * Trigger, inactive and disabled objects remain non-occluding, matching the
 * game collision path. A box's full transform (including shear/mirroring) is
 * respected. The output has no triangles, edges or generated scene geometry.
 * @param {Array<object>} colliders Source-qualified scene colliders.
 * @returns {{boxes: Array<object>}}
 */
export function prepareDoorVisibility(colliders) {
  if (!Array.isArray(colliders)) throw new TypeError('Dojo occlusion needs source colliders');
  const boxes = [];
  for (const collider of colliders) {
    if (collider.isTrigger || collider.initial?.enabled === false ||
        collider.initial?.activeInHierarchy === false || collider.enabled === false ||
        collider.activeInHierarchy === false) continue;
    const m = collider.worldMatrix, size = collider.size, center = collider.center;
    if (!m || m.length !== 16 || !size || size.length !== 3 ||
        !center || center.length !== 3 ||
        ![...m, ...size, ...center].every(Number.isFinite) ||
        size.some(n => n === 0) || m[3] !== 0 || m[7] !== 0 ||
        m[11] !== 0 || m[15] !== 1) {
      throw new TypeError('Invalid affine BoxCollider: ' + (collider.id ?? 'unnamed'));
    }
    const b0 = [m[0], m[1], m[2]];
    const b1 = [m[4], m[5], m[6]];
    const b2 = [m[8], m[9], m[10]];
    const n0 = cross(b1, b2), n1 = cross(b2, b0), n2 = cross(b0, b1);
    const det = dot(b0, n0);
    if (!Number.isFinite(det) || Math.abs(det) < 1e-15) {
      throw new TypeError('Singular BoxCollider: ' + (collider.id ?? 'unnamed'));
    }
    const inv = [n0, n1, n2].map(n => n.map(value => value / det));
    const half = size.map(value => Math.abs(value) / 2);
    const origin = [m[12], m[13], m[14]];
    const worldCenter = origin.map((value, axis) => value +
      b0[axis] * center[0] + b1[axis] * center[1] + b2[axis] * center[2]);
    const extent = [0, 1, 2].map(axis =>
      Math.abs(b0[axis]) * half[0] +
      Math.abs(b1[axis]) * half[1] +
      Math.abs(b2[axis]) * half[2]);
    boxes.push({
      origin, center: [...center], inv, half,
      min: worldCenter.map((value, axis) => value - extent[axis]),
      max: worldCenter.map((value, axis) => value + extent[axis]),
    });
  }
  return { boxes };
}

/**
 * Any static source box between two browser-world points? A conservative
 * world AABB reject is followed by an exact local affine slab intersection.
 * @param {{boxes: Array<object>}} scene Prepared visibility boxes.
 * @param {{x:number,y:number,z:number}} start
 * @param {{x:number,y:number,z:number}} end
 * @returns {boolean}
 */
export function doorSegmentOccluded(scene, start, end) {
  const startValues = [start.x, start.y, start.z];
  const delta = [end.x - start.x, end.y - start.y, end.z - start.z];
  for (const box of scene.boxes) {
    // Segment bounding interval rejection: a miss can never hide a wall.
    let rejected = false;
    for (let axis = 0; axis < 3; axis++) {
      const a = startValues[axis], b = a + delta[axis];
      if (Math.max(a, b) < box.min[axis] ||
          Math.min(a, b) > box.max[axis]) {
        rejected = true;
        break;
      }
    }
    if (rejected) continue;

    const relative = startValues.map((value, axis) => value - box.origin[axis]);
    let enter = 0, leave = 1;
    for (let axis = 0; axis < 3; axis++) {
      const row = box.inv[axis];
      const p = dot(row, relative) - box.center[axis];
      const d = dot(row, delta);
      const half = box.half[axis];
      if (Math.abs(d) < 1e-15) {
        if (Math.abs(p) > half) { rejected = true; break; }
        continue;
      }
      let near = (-half - p) / d, far = (half - p) / d;
      if (near > far) [near, far] = [far, near];
      enter = Math.max(enter, near);
      leave = Math.min(leave, far);
      if (enter > leave) { rejected = true; break; }
    }
    if (!rejected) return true;
  }
  return false;
}
