/**
 * SH-03 native-source-bounded PejAiController visibility decisions.
 * Private corpus #134/#135: PejAiController.cs:4383-4543, MCD build 20299547.
 * NO PhysX, runtime AI tree, or Containers instance state is implemented here.
 * A null result is UNKNOWN, never permission to shoot.
 */
const vec = (v, name) => {
  if (!v || !Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z))
    throw new TypeError(name + ' must be finite xyz');
  return { x: v.x, y: v.y, z: v.z };
};
const id = (v, name, nullable = false) => {
  if (nullable && v === null) return;
  if (!Number.isInteger(v) || v < -2147483648 || v > 2147483647)
    throw new TypeError(name + ' must be a source Unity int32 ID');
};
const flag = (v, name) => {
  if (typeof v !== 'boolean') throw new TypeError(name + ' must be boolean');
};
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const mag = v => Math.hypot(v.x, v.y, v.z);
const norm = v => {
  const n = mag(v);
  return n === 0 ? null : { x: v.x / n, y: v.y / n, z: v.z / n };
};

/**
 * Plan the actual CanSeeTarget SphereCast, or classify caller-supplied,
 * source-qualified non-alloc hit results. Cast MUST use radius .2, active
 * eyesightLayerMask and sightDistance, with own colliders temporarily layer 2.
 * Results are only the valid hit count, ordered by their actual distances.
 * castHits=null means no source-qualified cast happened; [] means zero hits.
 */
export function planPejAiTargetSight({
  eyePosition, eyeForward, targetPosition, targetInstanceId,
  sightDistance, sightAngleDegrees, eyesightLayerMask,
  disregardSightAngle, isTargetEnemy, useCache,
  nowSinceLevelLoad, cacheRefreshTime, cached, castHits,
}) {
  const eye = vec(eyePosition, 'eyePosition');
  const forward = vec(eyeForward, 'eyeForward');
  const target = vec(targetPosition, 'targetPosition');
  id(targetInstanceId, 'targetInstanceId');
  for (const [name, value] of Object.entries({
    disregardSightAngle, isTargetEnemy, useCache,
  })) flag(value, name);
  if (!Number.isFinite(sightDistance) || sightDistance < 0 ||
      !Number.isFinite(sightAngleDegrees) || sightAngleDegrees < 0 ||
      !Number.isInteger(eyesightLayerMask) ||
      eyesightLayerMask < -2147483648 || eyesightLayerMask > 2147483647)
    throw new TypeError('explicit source sightDistance/angle/layerMask required');
  if (!Number.isFinite(nowSinceLevelLoad) ||
      !Number.isFinite(cacheRefreshTime) || cacheRefreshTime < 0)
    throw new TypeError('explicit source cache clock and refresh required');
  if (cached !== null) {
    if (!cached || !Number.isFinite(cached.at))
      throw new TypeError('cached must be null or { at, value }');
    flag(cached.value, 'cached.value');
  }
  if (castHits !== null && !Array.isArray(castHits))
    throw new TypeError('castHits must be null or qualified hit array');

  // CanSeeTarget calls CheckCanSeeCache; expiry is strictly > refresh.
  if (useCache && cached &&
      nowSinceLevelLoad - cached.at <= cacheRefreshTime)
    return { status: 'cache-hit', visible: cached.value,
      castRequest: null, updateCache: false };

  const delta = { x: target.x-eye.x, y: target.y-eye.y, z: target.z-eye.z };
  const direction = norm(delta);
  if (!direction || !norm(forward))
    return { status: 'degenerate-source-pose-unverified', visible: null,
      castRequest: null, updateCache: false };
  const castRequest = {
    origin: eye, direction, radius: .2, maxDistance: sightDistance,
    layerMask: eyesightLayerMask, ownBodyColliderTemporaryLayer: 2,
  };
  if (castHits === null)
    return { status: 'source-physics-required', visible: null,
      castRequest, updateCache: false };
  // Source early return: zero hits do NOT call UpdateCanSeeCache.
  if (!castHits.length)
    return { status: 'no-cast-hit', visible: false,
      castRequest, updateCache: false };

  let closest = null;
  for (const hit of castHits) {
    if (!hit || !Number.isFinite(hit.distance) || hit.distance < 0)
      throw new TypeError('castHits need valid nonnegative distance');
    id(hit.colliderTransformId, 'colliderTransformId', true);
    id(hit.enemyControllerTransformId, 'enemyControllerTransformId', true);
    if (!closest || hit.distance < closest.distance) closest = hit;
  }
  const onTarget = closest.colliderTransformId === targetInstanceId ||
    (isTargetEnemy && closest.enemyControllerTransformId === targetInstanceId);
  let visible = false;
  if (onTarget) {
    if (disregardSightAngle) visible = true;
    else {
      const d = dot(forward, direction);
      if (d >= 0) {
        const cosine = Math.max(-1, Math.min(1, d / mag(forward)));
        visible = !(Math.acos(cosine) * 180 / Math.PI > sightAngleDegrees);
      }
    }
  }
  return { status: 'cast-classified', visible, castRequest,
    updateCache: true, cacheValue: visible };
}

/**
 * CanSeePlayer / CanSeePlayer360 / hotswitch wrappers, source 4383-4437.
 * Pure decision only: it is not proof of an AI Attack or observed native fire.
 */
export function planPejAiPlayerSight({
  mode, targetSight, addictHotswitchActive,
  afterglowRemaining, afterglowDuration,
}) {
  if (!['normal', 'all-directions', 'hotswitch',
    'hotswitch-all-directions'].includes(mode))
    throw new TypeError('explicit CanSeePlayer mode required');
  flag(addictHotswitchActive, 'addictHotswitchActive');
  if (!Number.isFinite(afterglowRemaining) ||
      !Number.isFinite(afterglowDuration) || afterglowDuration < 0)
    throw new TypeError('explicit afterglow state/settings required');
  if (targetSight !== null) flag(targetSight, 'targetSight');
  const override = addictHotswitchActive &&
    (mode === 'normal' || mode === 'hotswitch');
  if (override) return { status: 'hotswitch-override', visible: true,
    resetAfterglow: false };
  if (targetSight === null) return { status: 'target-sight-unverified',
    visible: null, resetAfterglow: false };
  if (targetSight) return {
    status: 'source-visible', visible: true, resetAfterglow: mode === 'normal',
    ...(mode === 'normal' ? { afterglowValue: afterglowDuration } : {}),
  };
  const allowAfterglow = mode === 'normal' || mode === 'all-directions';
  return { status: 'source-not-visible',
    visible: allowAfterglow && afterglowRemaining > 0, resetAfterglow: false };
}
