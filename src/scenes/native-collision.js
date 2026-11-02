import { add3, subtract3, multiply3, dot3, clamp, segmentAabb } from '../math.js';

// Numerical contact tolerance, not a substitute for the source controller skin width.
const EPSILON = 1e-7;
const cross = (a, b) => ({ x: a.y*b.z-a.z*b.y, y: a.z*b.x-a.x*b.z, z: a.x*b.y-a.y*b.x });
const lengthSquared = a => dot3(a, a);
const along = (a, delta, t) => add3(a, multiply3(delta, t));
const vector = a => ({ x: a[0], y: a[1], z: a[2] });
const unit = a => multiply3(a, 1 / Math.sqrt(lengthSquared(a)));

/** Prepare authored BoxColliders once. AABBs are rejection bounds, never final geometry.
 * Matrices are column-major browser-space affine transforms, including nonuniform scale
 * and shear. The caller supplies the selected runtime variant (not hidden replay originals).
 * Trigger, disabled and inactive boxes are excluded. No source data is mutated.
 */
export function prepareNativeCollision(colliders) {
  const boxes = [];
  for (const collider of colliders) {
    if (collider.isTrigger || collider.initial?.enabled === false ||
        collider.initial?.activeInHierarchy === false || collider.enabled === false ||
        collider.activeInHierarchy === false) continue;
    const m = collider.worldMatrix, size = collider.size, localCenter = collider.center;
    if (!m || m.length !== 16 || !size || size.length !== 3 || !localCenter || localCenter.length !== 3 ||
        ![...m, ...size, ...localCenter].every(Number.isFinite) || size.some(n => n === 0) ||
        m[3] !== 0 || m[7] !== 0 || m[11] !== 0 || m[15] !== 1) {
      throw new TypeError(`Invalid affine BoxCollider: ${collider.id ?? collider.name ?? 'unnamed'}`);
    }
    const basis = [vector(m.slice(0, 3)), vector(m.slice(4, 7)), vector(m.slice(8, 11))];
    const determinant = dot3(basis[0], cross(basis[1], basis[2]));
    if (Math.abs(determinant) < 1e-15) throw new TypeError(`Singular BoxCollider: ${collider.id ?? 'unnamed'}`);
    const center = vector(m.slice(12, 15));
    for (let i = 0; i < 3; i++) {
      const offset = multiply3(basis[i], localCenter[i]);
      center.x += offset.x; center.y += offset.y; center.z += offset.z;
    }
    const edges = basis.map((b, i) => multiply3(b, size[i] / 2));
    const normals = [cross(edges[1], edges[2]), cross(edges[2], edges[0]), cross(edges[0], edges[1])]
      .map((n, i) => unit(dot3(n, edges[i]) < 0 ? multiply3(n, -1) : n));
    const planes = normals.map((normal, i) => ({ normal, extent: dot3(normal, edges[i]) }));
    const vertices = Array.from({ length: 8 }, (_, mask) => {
      let p = { ...center };
      for (let i = 0; i < 3; i++) p = add3(p, multiply3(edges[i], mask & (1 << i) ? 1 : -1));
      return p;
    });
    const min = {}, max = {};
    for (const axis of ['x', 'y', 'z']) {
      min[axis] = Math.min(...vertices.map(p => p[axis]));
      max[axis] = Math.max(...vertices.map(p => p[axis]));
    }
    const triangles = [];
    for (let axis = 0; axis < 3; axis++) {
      const u = (axis + 1) % 3, v = (axis + 2) % 3;
      for (let side = 0; side < 2; side++) {
        const a = side << axis, b = a | (1 << u), c = b | (1 << v), d = a | (1 << v);
        const normal = multiply3(normals[axis], side ? 1 : -1);
        triangles.push({ a: vertices[a], b: vertices[b], c: vertices[c], normal },
          { a: vertices[a], b: vertices[c], c: vertices[d], normal });
      }
    }
    boxes.push({ collider, center, planes, triangles, min, max, enabled: true });
  }
  const byId = new Map(boxes.map(box => [box.collider.id, box]));
  return {
    boxes,
    /** Toggle a selected static collider without rebuilding geometry or mutating source flags.
     * Unknown/excluded IDs return false; disabled source hierarchies cannot be revived here.
     */
    setEnabled(id, enabled) {
      const box = byId.get(id);
      if (!box) return false;
      box.enabled = Boolean(enabled);
      return true;
    },
  };
}

/** Layer-filtered views share enable state with the prepared source scene. */
export function nativeCollisionView(scene, layerMask) {
  if(!Number.isInteger(layerMask)||layerMask< -2147483648||layerMask>4294967295)throw new TypeError('Source collision mask must be a 32-bit integer');
  const boxes=scene.boxes.filter(box=>{
    const layer=box.collider.layer?.index;
    if(!Number.isInteger(layer)||layer<0||layer>31)throw new TypeError('Source collider layer is required');
    return ((layerMask>>>0)&(1<<layer))!==0;
  });
  return {boxes,setEnabled:scene.setEnabled};
}

function segmentBox(box, start, delta) {
  const relative = subtract3(start, box.center);
  let enter = 0, leave = 1, normal = null, closest = Infinity;
  for (const plane of box.planes) {
    const p = dot3(relative, plane.normal), d = dot3(delta, plane.normal);
    const clearance = plane.extent - Math.abs(p);
    if (clearance < closest) { closest = clearance; if (enter === 0) normal = multiply3(plane.normal, p >= 0 ? 1 : -1); }
    if (Math.abs(d) < 1e-15) {
      if (Math.abs(p) > plane.extent) return null;
      continue;
    }
    let near = (-plane.extent - p) / d, far = (plane.extent - p) / d;
    const n = multiply3(plane.normal, d > 0 ? -1 : 1);
    if (near > far) [near, far] = [far, near];
    if (near > enter) { enter = near; normal = n; }
    leave = Math.min(leave, far);
    if (enter > leave) return null;
  }
  return { t: enter, point: along(start, delta, enter), normal, collider: box.collider };
}

/** Exact point-segment intersection against the affine source boxes. */
export function nativeSegmentHit(scene, start, end) {
  const delta = subtract3(end, start);
  let best = null;
  for (const box of scene.boxes) {
    if (!box.enabled) continue;
    if (segmentAabb(start, end, box.min, box.max) === null) continue;
    const hit = segmentBox(box, start, delta);
    if (hit && (!best || hit.t < best.t)) best = hit;
  }
  return best;
}

// Closest points on triangle/segment features. These retain the actual transformed
// faces even for sheared hierarchies, for which inverse-space sphere radii are invalid.
function closestTriangle(p, { a, b, c }) {
  const ab = subtract3(b, a), ac = subtract3(c, a), ap = subtract3(p, a);
  const d1 = dot3(ab, ap), d2 = dot3(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = subtract3(p, b), d3 = dot3(ab, bp), d4 = dot3(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1*d4-d3*d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return along(a, ab, d1/(d1-d3));
  const cp = subtract3(p, c), d5 = dot3(ab, cp), d6 = dot3(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5*d2-d1*d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return along(a, ac, d2/(d2-d6));
  const va = d3*d6-d5*d4;
  if (va <= 0 && d4-d3 >= 0 && d5-d6 >= 0) return along(b, subtract3(c, b), (d4-d3)/(d4-d3+d5-d6));
  return add3(a, add3(multiply3(ab, vb/(va+vb+vc)), multiply3(ac, vc/(va+vb+vc))));
}

function closestSegments(p, q, a, b) {
  const u = subtract3(q, p), v = subtract3(b, a), w = subtract3(p, a);
  const uu = dot3(u, u), vv = dot3(v, v), uv = dot3(u, v), uw = dot3(u, w), vw = dot3(v, w);
  let s = 0, t = 0;
  if (uu < 1e-20) t = clamp(vw/vv, 0, 1);
  else {
    const determinant = uu*vv-uv*uv;
    if (determinant > 1e-20) s = clamp((uv*vw-vv*uw)/determinant, 0, 1);
    t = (uv*s+vw)/vv;
    if (t < 0) { t = 0; s = clamp(-uw/uu, 0, 1); }
    else if (t > 1) { t = 1; s = clamp((uv-uw)/uu, 0, 1); }
  }
  return [along(p, u, s), along(a, v, t)];
}

function capsuleDistance(box, bottom, top) {
  const crossing = segmentBox(box, bottom, subtract3(top, bottom));
  if (crossing) return { distance: 0, point: crossing.point, normal: crossing.normal };
  let bestSquared = Infinity, point = null, normal = null;
  const consider = (onAxis, onBox, fallback) => {
    const difference = subtract3(onAxis, onBox), squared = lengthSquared(difference);
    if (squared < bestSquared) {
      bestSquared = squared; point = onBox;
      normal = squared > 1e-24 ? multiply3(difference, 1/Math.sqrt(squared)) : fallback;
    }
  };
  for (const triangle of box.triangles) {
    consider(bottom, closestTriangle(bottom, triangle), triangle.normal);
    consider(top, closestTriangle(top, triangle), triangle.normal);
    for (const [a, b] of [[triangle.a, triangle.b], [triangle.b, triangle.c], [triangle.c, triangle.a]]) {
      const pair = closestSegments(bottom, top, a, b);
      consider(pair[0], pair[1], triangle.normal);
    }
  }
  return { distance: Math.sqrt(bestSquared), point, normal };
}

function capsuleBoxHit(box, start, delta, radius, height) {
  let t = 0, contact;
  // Conservative advancement uses a separating plane, not sampled positions: even a
  // very long displacement cannot skip a thin collider. Exhaustion stops at the last
  // safe fraction instead of allowing an unverified remainder through the obstacle.
  for (let iteration = 0; iteration < 64; iteration++) {
    const feet = along(start, delta, t);
    const bottom = { x: feet.x, y: feet.y + radius, z: feet.z };
    const top = { x: feet.x, y: feet.y + height - radius, z: feet.z };
    contact = capsuleDistance(box, bottom, top);
    const closingSpeed = -dot3(delta, contact.normal);
    if (closingSpeed <= 1e-14) return null; // Tangential/away motion is not blocked by a supporting floor.
    if (contact.distance <= radius + EPSILON) return { t, point: contact.point, normal: contact.normal, collider: box.collider };
    t += (contact.distance - radius) / closingSpeed;
    if (t > 1 + EPSILON) return null;
    t = Math.min(t, 1);
  }
  return { t, point: contact.point, normal: contact.normal, collider: box.collider, conservative: true };
}

function dimensions({ radius, height }) {
  if (!Number.isFinite(radius) || radius <= 0 || !Number.isFinite(height) || height < radius*2) {
    throw new RangeError('Collision body requires radius > 0 and height >= 2 * radius');
  }
}

/** Continuous upright capsule sweep. Feet are the bottom of the capsule, not its
 * transform origin. Existing penetrations may move outward but are not teleported out.
 * This is static Web collision, not PhysX contacts, skin-width recovery or rigid bodies.
 */
export function nativeCapsuleHit(scene, start, end, body) {
  dimensions(body);
  const { radius, height } = body, delta = subtract3(end, start);
  let best = null;
  for (const box of scene.boxes) {
    if (!box.enabled) continue;
    const min = { x: box.min.x-radius, y: box.min.y-height, z: box.min.z-radius };
    const max = { x: box.max.x+radius, y: box.max.y, z: box.max.z+radius };
    if (segmentAabb(start, end, min, max) === null) continue;
    const hit = capsuleBoxHit(box, start, delta, radius, height);
    if (hit && (!best || hit.t < best.t)) best = hit;
  }
  return best;
}

/** A conservative bounding sphere for thrown objects; point is on the struck box.
 * Radius must come from the object's shape. Rotation/inertia are outside this sweep.
 */
export function nativeSphereHit(scene, start, end, radius) {
  if (radius === 0) return nativeSegmentHit(scene, start, end);
  return nativeCapsuleHit(scene, { ...start, y: start.y-radius }, { ...end, y: end.y-radius }, { radius, height: radius*2 });
}

function slopeCosine(slopeLimit) {
  if (!Number.isFinite(slopeLimit) || slopeLimit < 0 || slopeLimit >= 90) throw new RangeError('slopeLimit must be in [0, 90) degrees');
  return Math.cos(slopeLimit * Math.PI / 180);
}

/** Highest reachable support within an explicit vertical interval, never a spawn-floor
 * fallback. Raising the query is itself swept so another floor/ceiling cannot be crossed.
 * y is the supported feet elevation (on a slope it need not equal point.y).
 */
export function nativeGroundAt(scene, feet, { radius, height, maxDrop, maxRise = 0, slopeLimit }) {
  if (!Number.isFinite(maxDrop) || maxDrop < 0 || !Number.isFinite(maxRise) || maxRise < 0) throw new RangeError('Ground query requires finite nonnegative bounds');
  const body = { radius, height }, cosine = slopeCosine(slopeLimit);
  let raised = { ...feet, y: feet.y + maxRise };
  if (maxRise > 0) {
    const ceiling = nativeCapsuleHit(scene, feet, raised, body);
    if (ceiling) raised = { ...feet, y: feet.y + maxRise*ceiling.t };
  }
  const end = { ...feet, y: feet.y - maxDrop - EPSILON };
  const hit = nativeCapsuleHit(scene, raised, end, body);
  if (!hit || hit.normal.y + EPSILON < cosine) return null;
  return { ...hit, y: raised.y + (end.y-raised.y)*hit.t };
}

/** First overhead surface reachable by the entire finite-height body. */
export function nativeCeilingAt(scene, feet, { radius, height, maxRise }) {
  if (!Number.isFinite(maxRise) || maxRise < 0) throw new RangeError('Ceiling query requires a finite nonnegative bound');
  const hit = nativeCapsuleHit(scene, feet, { ...feet, y: feet.y + maxRise }, { radius, height });
  return hit && hit.normal.y < 0 ? { ...hit, y: hit.point.y, feetY: feet.y + maxRise*hit.t } : null;
}

function slide(scene, start, displacement, body, cosine) {
  let position = { ...start }, remaining = { ...displacement };
  const contacts = [], planes = [];
  for (let iteration = 0; iteration < 8 && lengthSquared(remaining) > EPSILON*EPSILON; iteration++) {
    const hit = nativeCapsuleHit(scene, position, add3(position, remaining), body);
    if (!hit) { position = add3(position, remaining); break; }
    position = along(position, remaining, hit.t);
    contacts.push(hit);
    let normal = hit.normal;
    // Steep surfaces may slide sideways/downward, but horizontal intent cannot climb them.
    if (normal.y > 0 && normal.y < cosine) normal = unit({ x: normal.x, y: 0, z: normal.z });
    planes.push(normal);
    remaining = multiply3(remaining, 1-hit.t);
    for (const plane of planes) {
      const inward = dot3(remaining, plane);
      if (inward < 0) remaining = subtract3(remaining, multiply3(plane, inward));
    }
    // A later plane can push the remainder into an earlier one at a tight corner.
    // Stop rather than oscillating or tunneling through the first contact.
    if (planes.some(plane => dot3(remaining, plane) < -EPSILON)) break;
  }
  return { position, contacts };
}

/** Sweep, slide, step, then bounded ground snap. Input/output positions are FEET.
 * A step requires support at the start, clear upward travel, horizontal traversal,
 * a walkable landing and more horizontal progress than the ordinary slide.
 * Unsupported bodies keep their elevation: the caller supplies gravity in displacement.y.
 */
export function moveNativeCharacter(scene, start, displacement, options) {
  const { radius, height, stepOffset, slopeLimit, groundSnap } = options;
  dimensions(options);
  if (![stepOffset, groundSnap].every(n => Number.isFinite(n) && n >= 0)) throw new RangeError('Movement requires nonnegative stepOffset and groundSnap');
  const cosine = slopeCosine(slopeLimit), body = { radius, height };
  const support = nativeGroundAt(scene, start, { ...body, maxDrop: groundSnap, slopeLimit });
  let result = slide(scene, start, displacement, body, cosine);
  const horizontalProgress = p => (p.x-start.x)*displacement.x + (p.z-start.z)*displacement.z;
  const wall = result.contacts.some(hit => hit.normal.y < 1-EPSILON && hit.normal.y > -EPSILON);
  if (support && stepOffset > 0 && displacement.y <= EPSILON && wall) {
    const raised = { ...start, y: start.y + stepOffset };
    if (!nativeCapsuleHit(scene, start, raised, body)) {
      const stepped = slide(scene, raised, { ...displacement, y: 0 }, body, cosine);
      const landing = nativeGroundAt(scene, stepped.position, { ...body, maxDrop: stepOffset + groundSnap, slopeLimit });
      if (landing && landing.y <= start.y + stepOffset + EPSILON &&
          horizontalProgress(stepped.position) > horizontalProgress(result.position) + EPSILON) {
        result = { position: { ...stepped.position, y: landing.y }, contacts: [...stepped.contacts, landing] };
      }
    }
  }
  const ground = displacement.y <= EPSILON
    ? nativeGroundAt(scene, result.position, { ...body, maxDrop: support ? groundSnap : 0, slopeLimit }) : null;
  if (ground) result.position.y = ground.y;
  return { ...result, grounded: ground !== null,
    ceiling: result.contacts.some(hit => hit.normal.y < -EPSILON) };
}
