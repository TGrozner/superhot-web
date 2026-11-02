/**
 * Bounded Bullet.FixedUpdate / HandleCollision contact planner for SUPERHOT MCD.
 * Source: build 20299547, Bullet.cs:184-215, 231-281 (private #102).
 * No PhysX SphereCast, native runtime trace, damage delivery, or renderer.
 * Contacts MUST already be in the native comparator order; the caller must
 * supply the projectile's actual firedByPlayer state, not infer it from tag.
 */
const point = value => value !== null && typeof value === 'object' &&
  Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);

const copy = value => ({ x: value.x, y: value.y, z: value.z });

const stop = (status, events, consumedHits, stoppedAt) => ({
  status, events, consumedHits, stoppedAt,
});

/**
 * Only the Environment/Smashers and CustomCollider routes are supported.
 * Unknown layers return a blocker: the code must not guess the native handler.
 * `destroyedAfterHandler` must be supplied to continue a sniper projectile
 * after a handled contact (the native handler may destroy that projectile).
 */
export function planIncomingBulletFixedContacts({
  orderedHits, firedByPlayer, sniperBullet, projectilePosition, velocity,
}) {
  if (!Array.isArray(orderedHits) || typeof firedByPlayer !== 'boolean' ||
      typeof sniperBullet !== 'boolean' || !point(projectilePosition) ||
      !point(velocity)) {
    throw new TypeError('explicit ordered contacts, allegiance and projectile state required');
  }
  const events = [];
  for (let i = 0; i < orderedHits.length; i++) {
    const hit = orderedHits[i];
    if (!hit || typeof hit.layer !== 'string' || typeof hit.ignored !== 'boolean') {
      throw new TypeError('each contact needs an explicit layer and ignored guard');
    }
    // Bullet.IsIgnoredCollider is checked before the general AI alert.
    if (hit.ignored) continue;
    events.push({ type: 'alert-request', hitIndex: i, parameters: [5, 0.05, 2] });
    let handled = false;
    if (hit.layer === 'Environment' || hit.layer === 'Smashers') {
      events.push({ type: 'environment-handler-request', hitIndex: i, layer: hit.layer });
      handled = true; // HandleCollision returns true after the handler call.
    } else if (hit.layer === 'CustomCollider') {
      if (typeof hit.hasPlayerController !== 'boolean') {
        return stop('player-component-unverified', events, i + 1, i);
      }
      if (!firedByPlayer && hit.hasPlayerController) {
        const magnitude = Math.hypot(velocity.x, velocity.y, velocity.z);
        if (!Number.isFinite(magnitude)) {
          throw new RangeError('velocity length must be representable');
        }
        const scale = magnitude > 0 ? 5 / magnitude : 0;
        const attackOrigin = {
          x: projectilePosition.x - velocity.x * scale,
          y: projectilePosition.y - velocity.y * scale,
          z: projectilePosition.z - velocity.z * scale,
        };
        if (!point(attackOrigin)) throw new RangeError('derived attack origin must be finite');
        events.push({
          type: 'player-kill-request', hitIndex: i, attackOrigin,
          flags: { switchToBlack: false, hardKill: false, forceKill: false },
        });
        handled = true;
      }
    } else {
      // Enemies/Glass/Pickups/Bullets require separate native guards/callbacks.
      return stop('unmodeled-native-layer', events, i + 1, i);
    }
    // Bullet.FixedUpdate: (handled && !sniperBullet) || destroyed.
    if (handled && !sniperBullet) {
      return stop('native-loop-stop-requested', events, i + 1, i);
    }
    if (hit.destroyedAfterHandler === true) {
      return stop('native-loop-stop-requested', events, i + 1, i);
    }
    if (handled && sniperBullet && typeof hit.destroyedAfterHandler !== 'boolean') {
      return stop('destruction-state-unverified', events, i + 1, i);
    }
  }
  return stop('contacts-exhausted', events, orderedHits.length, null);
}
