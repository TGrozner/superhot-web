import { dot3, subtract3 } from '../math.js';

// Numerical tie tolerance; collision priorities are provisional Web rules, NOT native MCD evidence.
export const IMPACT_EPSILON = 1e-9;

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
function sweptSphereFraction(start, end, center, radius) {
  const delta = subtract3(end, start);
  const offset = subtract3(start, center);
  const c = dot3(offset, offset) - radius * radius;
  if (c <= 0) return 0;
  const a = dot3(delta, delta);
  if (a === 0) return null;
  const halfB = dot3(offset, delta);
  const discriminant = halfB * halfB - a * c;
  if (discriminant < 0) return null;
  const t = (-halfB - Math.sqrt(discriminant)) / a;
  return t >= 0 && t <= 1 ? t : null;
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
  if (!isFinitePoint(start) || !isFinitePoint(end)) {
    throw new TypeError('Segment endpoints must be finite 3D points');
  }
  if (!Array.isArray(solids) || !Array.isArray(targets)) {
    throw new TypeError('Geometry solids and targets must be arrays');
  }
  let closest = null;
  const consider = (t, kind, entity, index) => {
    if (t === null || !Number.isFinite(t) || t < 0 || t > 1) return;
    if (closest === null || t < closest.t - IMPACT_EPSILON) {
      closest = { kind, index, entity, t };
    }
  };

  for (let i = 0; i < solids.length; i++) {
    const solid = solids[i];
    if (!isFinitePoint(solid?.min) || !isFinitePoint(solid?.max)) {
      throw new TypeError('Every solid needs finite min/max points');
    }
    if (['x', 'y', 'z'].some((axis) => solid.min[axis] > solid.max[axis])) {
      throw new RangeError('Every solid needs min <= max on every axis');
    }
    consider(sweptBoxFraction(start, end, solid.min, solid.max), 'solid', solid, i);
  }
  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    if (!isFinitePoint(target?.center) || !Number.isFinite(target?.radius) || target.radius < 0) {
      throw new TypeError('Every target needs a finite center and nonnegative radius');
    }
    consider(sweptSphereFraction(start, end, target.center, target.radius), 'target', target, i);
  }

  if (closest === null) return null;
  return {
    ...closest,
    point: pointAtFraction(start, end, closest.t),
  };
}
