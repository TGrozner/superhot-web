import { add3, multiply3 } from '../math.js';
import { firstImpact } from './trace.js';

const finitePoint = (p) => p !== null && typeof p === 'object' &&
  ['x', 'y', 'z'].every((axis) => Number.isFinite(p[axis]));

/**
 * Pure one-step projectile simulation using world-time seconds, not wall time.
 * Speed, direction, lifetime and collision volumes are injected by the caller;
 * no damage, weapon or native timing assumptions are embedded here.
 * The direction's magnitude is deliberately preserved; normalization is an
 * external policy, and non-unit native shotgun dispersion is not yet verified.
 */
export function advanceProjectile(projectile, worldDelta, geometry = {}) {
  if (!Number.isFinite(worldDelta) || worldDelta < 0) {
    throw new RangeError('worldDelta must be finite and nonnegative');
  }
  if (!projectile || !finitePoint(projectile.pos) || !finitePoint(projectile.direction) ||
      !Number.isFinite(projectile.speed) || projectile.speed < 0 ||
      !Number.isFinite(projectile.ttl) || projectile.ttl < 0 ||
      (projectile.age !== undefined && (!Number.isFinite(projectile.age) || projectile.age < 0))) {
    throw new TypeError('Projectile needs finite pos/direction, nonnegative speed, ttl and age');
  }

  const availableTime = Math.min(worldDelta, projectile.ttl);
  if (availableTime === 0) {
    return { projectile: { ...projectile, pos: { ...projectile.pos } }, impact: null,
      expired: projectile.ttl === 0 };
  }

  // Finite inputs may still overflow during integration. Fail before tracing
  // rather than allowing an invalid endpoint to masquerade as a missed hit.
  const travel = projectile.speed * availableTime;
  if (!Number.isFinite(travel)) {
    throw new RangeError('Projectile travel must remain finite');
  }
  const destination = add3(projectile.pos, multiply3(projectile.direction, travel));
  if (!finitePoint(destination)) {
    throw new RangeError('Projectile destination must remain finite');
  }
  const impact = firstImpact(projectile.pos, destination, geometry);
  const elapsed = availableTime * (impact?.t ?? 1);
  const remaining = Math.max(0, projectile.ttl - elapsed);
  const age = (projectile.age ?? 0) + elapsed;
  if (!Number.isFinite(age)) {
    throw new RangeError('Projectile age must remain finite');
  }
  const next = {
    ...projectile,
    pos: impact ? impact.point : destination,
    ttl: remaining,
    age,
  };
  return { projectile: next, impact, expired: impact !== null || remaining === 0 };
}
