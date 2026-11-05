import { consumeNativeEnemyVolley } from './native-enemy-runtime.js';

const validPoint = value => value !== null && typeof value === 'object' &&
  ['x', 'y', 'z'].every(axis => Number.isFinite(value[axis]));
const copyPoint = value => ({ x: value.x, y: value.y, z: value.z });

/**
 * A gun's accepted Attack and its deferred bullet creation are distinct events.
 * This adapter only emits source-supported Pistol/Shotgun audio requests; it
 * never consults a camera, render callback or muzzle-to-target obstruction.
 *
 * Private provenance: MCD build 20299547, research #71 (GunPejAiWeapon.Shoot)
 * and existing ShotGunPejAiWeapon attack evidence in enemy-shotgun.js.
 * Returned requests are NOT proof that audio played in a browser.
 */
export function nativeEnemyFireAttackRequests(actions, family, shooterPosition) {
  if (typeof actions?.shot !== 'boolean') {
    throw new TypeError('explicit gun attack decision required');
  }
  if (!actions.shot) return [];
  if (!validPoint(shooterPosition)) throw new TypeError('finite shooter position required');
  const radius = family === 'Pistol' ? 10 : family === 'Shotgun' ? 5 : null;
  if (radius === null) {
    throw new TypeError('fire sound and alert contract not verified for this weapon family');
  }
  return [
    { type: 'fire-sfx-request', family, position: copyPoint(shooterPosition) },
    { type: 'enemy-alert-request', family, position: copyPoint(shooterPosition), radius },
  ];
}

/**
 * Called after the current animated weapon pose is available, not inside draw.
 * If the pose is unavailable the pending shot is kept intact, not dropped.
 * Neither a wall cast nor a player sight test may suppress a deferred request:
 * actual contacts happen after a bullet is created (Bullet.FixedUpdate, #102).
 *
 * A "projectile-spawn-request" is NOT proof of successful native pooling.
 */
export function nativeEnemyFireLateRequests(state, settings, pose, random = Math.random) {
  if (!state || !Object.hasOwn(state, 'pendingShot')) {
    throw new TypeError('explicit weapon state with pendingShot required');
  }
  if (!state.pendingShot) return { status: 'empty', requests: [] };
  if (!settings || typeof settings.family !== 'string') {
    throw new TypeError('active weapon family required');
  }
  if (!validPoint(pose?.muzzlePosition) ||
      (settings.family === 'Shotgun' && (!validPoint(pose?.weaponForward) ||
        Math.hypot(pose.weaponForward.x, pose.weaponForward.y, pose.weaponForward.z) === 0)) ||
      (settings.family !== 'Shotgun' && validPoint(state.pendingShot.target) &&
        Math.hypot(
          state.pendingShot.target.x - pose.muzzlePosition.x,
          state.pendingShot.target.y - pose.muzzlePosition.y,
          state.pendingShot.target.z - pose.muzzlePosition.z,
        ) === 0)) {
    // Web gameplay guard, not a native MCD rule: a collapsed animated
    // socket/aim vector must never consume the one accepted Attack. A zero
    // shotgun forward otherwise makes jitter alone choose the entire volley;
    // a coincident pistol target otherwise emits a stationary projectile.
    // Keep the accepted target and reload gate until an actual aim pose exists.
    return { status: 'awaiting-late-pose', requests: [] };
  }
  const shots = consumeNativeEnemyVolley(
    state, settings, pose.muzzlePosition, pose.weaponForward ?? null, random,
  );
  return {
    status: 'spawn-requests',
    requests: shots.map(shot => ({ type: 'projectile-spawn-request', ...shot })),
  };
}
