/**
 * MCD ShotGun.Fire positive-ammunition branch, reconstructed from the private
 * static source report (MCD build 20299547, ShotGun.cs:51-92).
 *
 * Caller supplies the *actual* readiness gates, scene-bound values, aim vector,
 * per-bullet origin (including muzzle randomness), and randomness samples.
 * No Unity assets, RNG, time controller, collision solver or render code here.
 */
import { shotgunProjectileCount } from './shot-phases.js';

const isVector = (p) => p !== null && typeof p === 'object' &&
  Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
const copy = ({ x, y, z }) => ({ x, y, z });
const addScaled = (a, scale, b, noiseScale) => ({
  x: a.x * scale + b.x * noiseScale,
  y: a.y * scale + b.y * noiseScale,
  z: a.z * scale + b.z * noiseScale,
});

/**
 * Plan ONE successful shotgun trigger, not a continuous weapon simulation.
 * `samples` are caller-owned Unity-like sphere samples: their distribution is
 * not generated or certified here. `origins` are final bullet spawn positions.
 * The *reported* shotgun formula uses a normalized primary direction but does
 * not normalize its spread results or the extra-pellet input direction.
 */
export function planShotgunVolley({
  readiness, ammo, pelletsCount, aimDirection, origins, samples, bulletSpeed,
}) {
  if (!readiness || typeof readiness !== 'object') {
    throw new TypeError('readiness gates must be provided explicitly');
  }
  const gateNames = ['canPlayerAttack', 'isWeaponReady', 'additionalShootingCheck',
    'isThrown', 'noShooting'];
  for (const key of gateNames) {
    if (typeof readiness[key] !== 'boolean') {
      throw new TypeError(`readiness.${key} must be boolean`);
    }
  }
  if (!Number.isSafeInteger(ammo) || ammo < 0) {
    throw new RangeError('ammo must be a nonnegative safe integer');
  }
  const count = shotgunProjectileCount(pelletsCount);
  if (!readiness.canPlayerAttack || !readiness.isWeaponReady ||
      !readiness.additionalShootingCheck || readiness.isThrown) {
    return { outcome: 'blocked', ammo, bullets: [] };
  }
  if (readiness.noShooting) {
    return { outcome: 'unmodeled-throw-instead', ammo, bullets: [] };
  }
  if (ammo === 0) {
    // Native ShotGun has a distinct empty/melee path; never silently refill.
    return { outcome: 'unmodeled-empty-shotgun', ammo, bullets: [] };
  }
  if (!isVector(aimDirection) ||
      !Number.isFinite(bulletSpeed) || bulletSpeed < 0 ||
      !Array.isArray(origins) || !Array.isArray(samples) ||
      origins.length !== count || samples.length !== count ||
      !origins.every(isVector) || !samples.every(isVector)) {
    throw new TypeError('finite aim/speed and one origin/sample per projectile required');
  }
  const magnitude = Math.hypot(aimDirection.x, aimDirection.y, aimDirection.z);
  if (!(magnitude > 0) || !Number.isFinite(magnitude)) {
    throw new RangeError('aim direction must be nonzero and have finite magnitude');
  }
  const unitAim = { x: aimDirection.x / magnitude, y: aimDirection.y / magnitude,
    z: aimDirection.z / magnitude };
  const bullets = [];
  for (let index = 0; index < count; index++) {
    // ShotGun.Fire: primary normalized × 1.16 + sample / 35;
    // extra pellets: original direction + sample × 2 / 15.
    // Neither is normalized again before velocity = direction × speed.
    const direction = index === 0
      ? addScaled(unitAim, 1.16, samples[index], 1 / 35)
      : addScaled(aimDirection, 1, samples[index], 2 / 15);
    const velocity = {
      x: direction.x * bulletSpeed,
      y: direction.y * bulletSpeed,
      z: direction.z * bulletSpeed,
    };
    if (!isVector(velocity)) throw new RangeError('non-finite derived velocity');
    bullets.push({
      pelletIndex: index, position: copy(origins[index]), velocity,
      firedByPlayer: true,
    });
  }
  return { outcome: 'fired', ammo: ammo - 1, bullets };
}
