import { add3, multiply3 } from '../math.js';
import { firstImpact } from './trace.js';

const finitePoint = (p) => p !== null && typeof p === 'object' &&
  ['x', 'y', 'z'].every((axis) => Number.isFinite(p[axis]));

// Snapshot each kinematic component exactly once before validation and integration.
const snapshotPoint = (p) => p !== null && typeof p === 'object'
  ? { x: p.x, y: p.y, z: p.z } : null;

const KINEMATIC_FIELDS = new Set(['pos', 'direction', 'speed', 'ttl', 'age']);

// Equivalent to spreading unrelated enumerable own properties, without a
// second read of the kinematic getters. Symbol metadata is preserved.
function copyMetadata(projectile) {
  const metadata = {};
  for (const key of Reflect.ownKeys(projectile)) {
    const desc = Object.getOwnPropertyDescriptor(projectile, key);
    if (!desc?.enumerable || KINEMATIC_FIELDS.has(key)) continue;
    Object.defineProperty(metadata, key, {
      value: projectile[key], enumerable: true, configurable: true, writable: true,
    });
  }
  return metadata;
}

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
  const pos = snapshotPoint(projectile?.pos);
  const direction = snapshotPoint(projectile?.direction);
  const speed = projectile?.speed;
  const ttl = projectile?.ttl;
  const originalAge = projectile?.age;
  if (!projectile || !finitePoint(pos) || !finitePoint(direction) ||
      !Number.isFinite(speed) || speed < 0 ||
      !Number.isFinite(ttl) || ttl < 0 ||
      (originalAge !== undefined && (!Number.isFinite(originalAge) || originalAge < 0))) {
    throw new TypeError('Projectile needs finite pos/direction, nonnegative speed, ttl and age');
  }

  const availableTime = Math.min(worldDelta, ttl);
  if (availableTime === 0) {
    const hasEnumerableAge = Object.getOwnPropertyDescriptor(projectile, 'age')?.enumerable;
    return {
      projectile: {
        ...copyMetadata(projectile), pos, direction, speed, ttl,
        ...(hasEnumerableAge ? { age: originalAge } : {}),
      },
      impact: null, expired: ttl === 0,
    };
  }

  // Finite inputs may still overflow during integration. Fail before tracing
  // rather than allowing an invalid endpoint to masquerade as a missed hit.
  const travel = speed * availableTime;
  if (!Number.isFinite(travel)) {
    throw new RangeError('Projectile travel must remain finite');
  }
  const destination = add3(pos, multiply3(direction, travel));
  if (!finitePoint(destination)) {
    throw new RangeError('Projectile destination must remain finite');
  }
  const impact = firstImpact(pos, destination, geometry);
  const elapsed = availableTime * (impact?.t ?? 1);
  const remaining = Math.max(0, ttl - elapsed);
  const age = (originalAge ?? 0) + elapsed;
  if (!Number.isFinite(age)) {
    throw new RangeError('Projectile age must remain finite');
  }
  const next = {
    ...copyMetadata(projectile),
    pos: impact ? impact.point : destination,
    direction, speed, ttl: remaining, age,
  };
  return { projectile: next, impact, expired: impact !== null || remaining === 0 };
}
