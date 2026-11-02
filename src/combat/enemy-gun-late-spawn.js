/**
 * SH-03: source-bound GunPejAiWeapon (base gun, NOT shotgun) lifecycle.
 * Private primary #71 / artifact 13138660437, GunPejAiWeapon.cs:17-116,
 * Steam MCD build 20299547. No original C#/asset or synthetic collision gate.
 * Pure plans: requests are never proof of Pooler success or audible sound.
 */
const boolean = (value, field) => {
  if (typeof value !== 'boolean') throw new TypeError(field + ' must be an explicit boolean');
};
const point = (value, field) => {
  if (!value || !['x', 'y', 'z'].every(axis => Number.isFinite(value[axis])))
    throw new TypeError(field + ' must be finite xyz from the active instance');
  return { x: value.x, y: value.y, z: value.z };
};
const gunType = type => type === 'GunPejAiWeapon';

/** Attack may queue a deferred bullet AND request FireSfx now, before pooling.
 * GunAttackBehaviour's Weapon.Attack call is a separate, earlier guard.
 */
export function planEnemyBaseGunAttack({
  weaponType, attackCalled, isAttackReady, pendingBefore, haveBeenSeen,
}) {
  if (!gunType(weaponType)) return { status: 'weapon-type-unverified' };
  for (const [key, value] of Object.entries({
    attackCalled, isAttackReady, pendingBefore, haveBeenSeen,
  })) boolean(value, key);
  const shoot = attackCalled && isAttackReady;
  return {
    status: 'source-method-plan',
    pendingAfterAttack: pendingBefore || shoot,
    shooterHaveBeenSeenAssignment: attackCalled ? haveBeenSeen : null,
    fireSfxCallRequested: shoot,
    fireSfxCallVolumeArgument: shoot ? 0.4 : null,
    onBulletSpawnCallbackRequested: shoot,
    resetAttackDelayRequested: shoot,
    alertRadiusRequested: shoot ? 10 : null,
    // Pooler.GetObject only occurs when UpdateDeferredBulletSpawn later runs.
    projectileEmitted: null,
  };
}

/** UpdateDeferredBulletSpawn → SpawnBulletLate. Caller must attest phase, live
 * late muzzle, Pooler outcome and components; no raycast/LOS guard exists here.
 * pendingClearsOnNormalReturn describes the source assignment AFTER the call;
 * it does not assert a crash-free or actually executed native frame.
 */
export function planEnemyBaseGunLateSpawn({
  weaponType, latePhaseEntered, pending, deferredTarget,
  deferredSpeed, projectileSpeed, lateMuzzle,
  poolAcquired, bulletComponentPresent, bulletColliderPresent,
  hasOwnerBodyPart, hasWeaponCollider, hasMuzzleFlashPrefab,
  shooterHaveBeenSeen,
}) {
  if (!gunType(weaponType)) return { status: 'weapon-type-unverified' };
  if (latePhaseEntered !== null) boolean(latePhaseEntered, 'latePhaseEntered');
  boolean(pending, 'pending');
  if (!pending) return {
    status: 'nothing-deferred', pendingClearsOnNormalReturn: false,
    launchRequested: false,
  };
  if (latePhaseEntered === null) return {
    status: 'late-phase-unverified', pendingClearsOnNormalReturn: false,
    launchRequested: false,
  };
  if (!latePhaseEntered) return {
    status: 'deferred-until-phase', pendingClearsOnNormalReturn: false,
    launchRequested: false,
  };
  const target = point(deferredTarget, 'deferredTarget');
  const muzzle = point(lateMuzzle, 'lateMuzzle');
  if (!Number.isFinite(deferredSpeed) || !Number.isFinite(projectileSpeed))
    throw new TypeError('live finite deferredSpeed and projectileSpeed required');
  const speed = deferredSpeed < 0 ? projectileSpeed : deferredSpeed;
  const delta = { x: target.x - muzzle.x, y: target.y - muzzle.y, z: target.z - muzzle.z };
  const length = Math.hypot(delta.x, delta.y, delta.z);
  if (!(length > 0) || !Number.isFinite(length)) return {
    status: 'degenerate-look-direction-unverified',
    pendingClearsOnNormalReturn: null, launchRequested: false,
  };
  const direction = { x: delta.x / length, y: delta.y / length, z: delta.z / length };
  if (poolAcquired === null) return {
    status: 'pool-result-unverified', pendingClearsOnNormalReturn: true,
    launchRequested: false,
  };
  boolean(poolAcquired, 'poolAcquired');
  if (!poolAcquired) return {
    status: 'pool-miss', pendingClearsOnNormalReturn: true,
    launchRequested: false,
  };
  const parts = { bulletComponentPresent, bulletColliderPresent,
    hasOwnerBodyPart, hasWeaponCollider, hasMuzzleFlashPrefab,
    shooterHaveBeenSeen };
  for (const [name, value] of Object.entries(parts)) {
    if (value === null || value === undefined) return {
      status: 'source-component-unverified', missing: name,
      pendingClearsOnNormalReturn: null, launchRequested: false,
    };
    boolean(value, name);
  }
  if (!bulletComponentPresent || !bulletColliderPresent) return {
    status: 'source-component-missing',
    pendingClearsOnNormalReturn: null, launchRequested: false,
  };
  return {
    status: 'source-launch-request', pendingClearsOnNormalReturn: true,
    launchRequested: true,
    request: {
      origin: muzzle, direction, speed,
      velocity: { x: direction.x * speed, y: direction.y * speed, z: direction.z * speed },
      name: 'EnemyBullet', tag: 'EnemyBullet',
      shooterHaveBeenSeen, setParentWeaponId: true,
      setOwnerFromBodyPart: hasOwnerBodyPart,
      ignoreWeaponCollider: hasWeaponCollider,
      muzzleFlashRequested: hasMuzzleFlashPrefab,
      activateBulletAndColliderRequested: true,
    },
  };
}
