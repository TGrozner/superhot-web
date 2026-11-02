import { firstImpact } from './trace.js';

/** Basic geometric occlusion test; this is NOT an implementation of native MCD enemy AI. */
export function hasLineOfSight(origin, target, solids = []) {
  return firstImpact(origin, target, { solids }) === null;
}
