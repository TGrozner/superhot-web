import { add3, multiply3, segmentAabb, segmentSphere, subtract3 } from '../math.js';

// Numerical tie tolerance; collision priorities are provisional Web rules, NOT native MCD evidence.
export const IMPACT_EPSILON = 1e-9;

const isFinitePoint = (point) => point !== null && typeof point === 'object' &&
  ['x', 'y', 'z'].every((axis) => Number.isFinite(point[axis]));

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
    consider(segmentAabb(start, end, solid.min, solid.max), 'solid', solid, i);
  }
  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    if (!isFinitePoint(target?.center) || !Number.isFinite(target?.radius) || target.radius < 0) {
      throw new TypeError('Every target needs a finite center and nonnegative radius');
    }
    consider(segmentSphere(start, end, target.center, target.radius), 'target', target, i);
  }

  if (closest === null) return null;
  return {
    ...closest,
    point: add3(start, multiply3(subtract3(end, start), closest.t)),
  };
}
