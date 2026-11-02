/**
 * Static-source-bounded enemy shotgun contracts for SUPERHOT MCD.
 * Private source: ShotGunPejAiWeapon.cs:21-68, GunPejAiWeapon.cs:74-117.
 * MCD build 20299547; Unity 2018.4.14f1.
 * No physics, pooling, animation, sound playback or native timing here.
 */
const finiteVector = v => v !== null && typeof v === 'object' &&
  Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
const clone = v => ({ x: v.x, y: v.y, z: v.z });
const addScaled = (a, aScale, b, bScale) => ({
  x: a.x * aScale + b.x * bScale,
  y: a.y * aScale + b.y * bScale,
  z: a.z * aScale + b.z * bScale,
});
const normalize = v => {
  const length = Math.hypot(v.x, v.y, v.z);
  if (!(length > 0) || !Number.isFinite(length)) {
    throw new RangeError('zero/nonfinite derived direction needs native behavior');
  }
  return { x: v.x / length, y: v.y / length, z: v.z / length };
};

/**
 * ShotGunPejAiWeapon.Attack:39-56; readiness is computed by the caller.
 * The attack target argument does not determine spread: the late pose does.
 * Returned flags denote calls/assignments, not heard audio or spawned bullets.
 * Caller supplies any previously queued shot; non-ready Attack preserves it.
 */
export function planEnemyShotgunAttack({ isAttackReady, haveBeenSeen, alreadyDeferred }) {
  if (typeof isAttackReady !== 'boolean' || typeof haveBeenSeen !== 'boolean' ||
      typeof alreadyDeferred !== 'boolean') {
    throw new TypeError('isAttackReady, haveBeenSeen and alreadyDeferred must be explicit booleans');
  }
  return {
    shooterHaveBeenSeen: haveBeenSeen,
    deferredBulletSpawn: alreadyDeferred || isAttackReady,
    setShootHappenedTrue: isAttackReady,
    setReloadedFalse: isAttackReady,
    resetAttackDelayRequested: isAttackReady,
    soundCallRequested: isAttackReady,
    onBulletSpawnRequested: isAttackReady,
    alertRadius: isAttackReady ? 5 : null,
  };
}

/**
 * ShotGunPejAiWeapon.UpdateDeferredBulletSpawn:21-37, after pose/IK in animator.
 * Caller supplies live prefab values and samples; no class defaults or RNG.
 * spreadSamples are external insideUnitSphere vectors, and extraSpeedFactors
 * are externally sampled offsets in [-1,1], not generated here.
 *
 * Requests correspond to would-be SpawnBulletLate calls, NOT successful pool
 * spawns. Pairwise exclusions only apply if all pool returns succeed.
 */
export function planEnemyShotgunLateVolley({
  deferredBulletSpawn, pelletCount, muzzlePosition, weaponForward,
  projectileSpeed, spreadSamples, extraSpeedFactors,
}) {
  if (typeof deferredBulletSpawn !== 'boolean') {
    throw new TypeError('deferredBulletSpawn must be boolean');
  }
  if (!deferredBulletSpawn) {
    return { outcome: 'no-pending-shot', clearPendingOnSuccessfulCompletion: false,
      requests: [], pairwiseCollisionExclusions: [] };
  }
  if (!Number.isSafeInteger(pelletCount) || pelletCount < 0 ||
      !finiteVector(muzzlePosition) || !finiteVector(weaponForward) ||
      !Number.isFinite(projectileSpeed) || !(projectileSpeed > 0)) {
    throw new TypeError('explicit finite active weapon/pellet configuration required');
  }
  // The native method emits one primary, then i < pelletCount - 1 extras.
  const count = Math.max(1, pelletCount);
  if (!Array.isArray(spreadSamples) || spreadSamples.length !== count ||
      !spreadSamples.every(v => finiteVector(v) && Math.hypot(v.x, v.y, v.z) <= 1) ||
      !Array.isArray(extraSpeedFactors) || extraSpeedFactors.length !== count - 1 ||
      !extraSpeedFactors.every(v => Number.isFinite(v) && v >= -1 && v <= 1)) {
    throw new TypeError('one inside-sphere sample per shot and one bounded speed factor per extra pellet required');
  }
  const requests = [];
  for (let index = 0; index < count; index++) {
    const spreadDirection = index === 0
      ? addScaled(weaponForward, 1.16, spreadSamples[index], 1 / 35)
      : addScaled(weaponForward, 1, spreadSamples[index], 1.5 / 15);
    // GunPejAiWeapon.SpawnBulletLate:85,96 normalizes before launch.
    const direction = normalize(spreadDirection);
    const speed = index === 0 ? projectileSpeed
      : projectileSpeed + projectileSpeed * extraSpeedFactors[index - 1] / 15;
    const velocity = { x: direction.x * speed,
      y: direction.y * speed, z: direction.z * speed };
    if (!finiteVector(velocity)) throw new RangeError('nonfinite velocity');
    requests.push({ index, origin: clone(muzzlePosition), direction,
      velocity, speed, muzzleFlash: index === 0 });
  }
  // IgnoreCollisions:59-68 loops through every unordered bullet pair.
  // These remain candidate operations, not confirmed successful PhysX calls.
  const pairwiseCollisionExclusions = [];
  for (let i = 0; i < count; i++) {
    for (let j = i + 1; j < count; j++) pairwiseCollisionExclusions.push([i, j]);
  }
  return { outcome: 'spawn-requests-planned',
    clearPendingOnSuccessfulCompletion: true,
    requests, pairwiseCollisionExclusions };
}
