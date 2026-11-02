import { dot3, subtract3 } from '../math.js';

// Numerical tie tolerance; collision priorities are provisional Web rules, NOT native MCD evidence.
export const IMPACT_EPSILON = 1e-9;

// Read externally supplied coordinates once; do not validate one set of getter
// values and then trace a different set. This is Web determinism, not MCD data.
const snapshotPoint = (point) => point !== null && typeof point === 'object'
  ? { x: point.x, y: point.y, z: point.z } : null;

const isFinitePoint = (point) => point !== null && typeof point === 'object' &&
  ['x', 'y', 'z'].every((axis) => Number.isFinite(point[axis]));

// Keep slab fractions meaningful even when subtracting two finite endpoints
// overflows double precision. This is numerical safety, not native hit testing.
function slabFraction(boundary, origin, destination, delta) {
  const numerator = boundary - origin;
  if (Number.isFinite(numerator) && Number.isFinite(delta)) {
    return numerator / delta;
  }
  const scale = Math.max(Math.abs(boundary), Math.abs(origin), Math.abs(destination));
  return ((boundary / scale) - (origin / scale)) /
    ((destination / scale) - (origin / scale));
}

// Combat-only exact-direction slabs: the general math helper treats displacements
// below 1e-8 as parallel, which can miss very short but nonzero sweeps.
function sweptBoxFraction(start, end, min, max) {
  let enter = 0, leave = 1;
  for (const axis of ['x', 'y', 'z']) {
    const delta = end[axis] - start[axis];
    if (delta === 0) {
      if (start[axis] < min[axis] || start[axis] > max[axis]) return null;
      continue;
    }
    let a = slabFraction(min[axis], start[axis], end[axis], delta);
    let b = slabFraction(max[axis], start[axis], end[axis], delta);
    if (a > b) [a, b] = [b, a];
    enter = Math.max(enter, a);
    leave = Math.min(leave, b);
    if (enter > leave) return null;
  }
  return enter;
}

// Do not classify a nonzero segment as a point merely because it is short:
// the general segmentSphere helper uses a < 1e-10 as its zero-length cutoff.
// A scaled fallback prevents overflow/underflow in synthetic Web sweeps.
function sweptSphereFraction(start, end, center, radius) {
  const delta = subtract3(end, start), offset = subtract3(start, center);
  if (Math.hypot(offset.x, offset.y, offset.z) <= radius) return 0;
  const c = dot3(offset, offset) - radius * radius;
  const a = dot3(delta, delta);
  const b = dot3(offset, delta);
  const disc = b * b - a * c;
  if (a > 0 && c > 0 && [a, c, b, disc].every(Number.isFinite)) {
    // The direct discriminant loses near-tangent separation through subtraction.
    // Compute the perpendicular closest approach before classifying a hit.
    const closestT = -b / a;
    const closestDistance = Math.hypot(
      offset.x + delta.x * closestT,
      offset.y + delta.y * closestT,
      offset.z + delta.z * closestT,
    );
    if (closestDistance > radius) return null;
    // Factor before taking the root: (radius²-distance²) may underflow
    // even when the dimensionless chord fraction is representable.
    const halfChord = radius === 0 ? 0 : (radius / Math.sqrt(a)) *
      Math.sqrt(((radius - closestDistance) / radius) *
        ((radius + closestDistance) / radius));
    const t = closestT - halfChord;
    return t >= 0 && t <= 1 ? t : null;
  }
  const axes = ['x', 'y', 'z'];
  const relativeFinite = axes.every((k) => Number.isFinite(delta[k]) && Number.isFinite(offset[k]));
  let scale = radius;
  for (const k of axes) {
    scale = relativeFinite
      ? Math.max(scale, Math.abs(delta[k]), Math.abs(offset[k]))
      : Math.max(scale, Math.abs(start[k]), Math.abs(end[k]), Math.abs(center[k]));
  }
  if (scale === 0) return null;
  const d = {}, o = {};
  for (const k of axes) {
    d[k] = relativeFinite ? delta[k] / scale : end[k] / scale - start[k] / scale;
    o[k] = relativeFinite ? offset[k] / scale : start[k] / scale - center[k] / scale;
  }
  const r = radius / scale;
  const cc = dot3(o, o) - r * r, aa = dot3(d, d);
  // An exterior start must never become an artificial t=0 hit.
  if (cc <= 0 || aa === 0) return null;
  const bb = dot3(o, d);
  if (bb >= 0) return null;
  const dd = bb * bb - aa * cc;
  if (dd < 0) return null;
  const t = cc / (-bb + Math.sqrt(dd));
  return Number.isFinite(t) && t >= 0 && t <= 1 ? t : null;
}

// A hit point must be finite whenever its endpoints and fraction are finite.
// Handle exact endpoints before any multiplication (Infinity * 0 is NaN).
function pointAtFraction(start, end, fraction) {
  if (fraction === 0) return { x: start.x, y: start.y, z: start.z };
  if (fraction === 1) return { x: end.x, y: end.y, z: end.z };
  const result = {};
  for (const axis of ['x', 'y', 'z']) {
    const delta = end[axis] - start[axis];
    result[axis] = Number.isFinite(delta)
      ? start[axis] + delta * fraction
      : start[axis] * (1 - fraction) + end[axis] * fraction;
  }
  return result;
}

/**
 * Trace a finite segment against axis-aligned solids and spherical hit volumes.
 * A solid wins ties against a target, then earlier array entries win remaining ties.
 * The caller supplies all hit volumes; this module contains no game-specific sizes.
 *
 * @param {{x:number,y:number,z:number}} start
 * @param {{x:number,y:number,z:number}} end
 * @param {{solids?:Array<{min:object,max:object}>,targets?:Array<{center:object,radius:number}>}} geometry
 * @returns {null|{kind:'solid'|'target',index:number,entity:object,t:number,point:object}}
 */
export function firstImpact(start, end, { solids = [], targets = [] } = {}) {
  const from = snapshotPoint(start), to = snapshotPoint(end);
  if (!isFinitePoint(from) || !isFinitePoint(to)) {
    throw new TypeError('Segment endpoints must be finite 3D points');
  }
  if (!Array.isArray(solids) || !Array.isArray(targets)) {
    throw new TypeError('Geometry solids and targets must be arrays');
  }
  // Fix candidate membership before reading any collider getters. Such getters
  // may mutate the caller's arrays; newly added/removed entries must not change
  // which objects this particular trace evaluates (Web-only contract).
  const solidCandidates = solids.slice();
  const targetCandidates = targets.slice();
  let closest = null;
  const consider = (t, kind, entity, index) => {
    if (t === null || !Number.isFinite(t) || t < 0 || t > 1) return;
    if (closest === null || t < closest.t - IMPACT_EPSILON) {
      closest = { kind, index, entity, t };
    }
  };

  for (let i = 0; i < solidCandidates.length; i++) {
    const solid = solidCandidates[i];
    const min = snapshotPoint(solid?.min), max = snapshotPoint(solid?.max);
    if (!isFinitePoint(min) || !isFinitePoint(max)) {
      throw new TypeError('Every solid needs finite min/max points');
    }
    if (['x', 'y', 'z'].some((axis) => min[axis] > max[axis])) {
      throw new RangeError('Every solid needs min <= max on every axis');
    }
    consider(sweptBoxFraction(from, to, min, max), 'solid', solid, i);
  }
  for (let i = 0; i < targetCandidates.length; i++) {
    const target = targetCandidates[i];
    const center = snapshotPoint(target?.center), radius = target?.radius;
    if (!isFinitePoint(center) || !Number.isFinite(radius) || radius < 0) {
      throw new TypeError('Every target needs a finite center and nonnegative radius');
    }
    consider(sweptSphereFraction(from, to, center, radius), 'target', target, i);
  }

  if (closest === null) return null;
  return {
    ...closest,
    point: pointAtFraction(from, to, closest.t),
  };
}
