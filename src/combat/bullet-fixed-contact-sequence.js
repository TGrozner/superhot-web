import { planBulletPairContact } from './bullet-pair-contacts.js';
import { planIncomingBulletFixedContacts } from './incoming-bullet-contacts.js';

/**
 * Bounded composer for Bullet.FixedUpdate's ordered collision loop.
 * Static source: MCD build 20299547, private research #102, Bullet.cs:184-215
 * and HandleCollision:231-317 (artifact 13141705847). No PhysX or runtime
 * trace is executed here. Caller supplies actual comparator-ordered hits and
 * post-handler destroyed state; never infer either from request names.
 *
 * Only Bullets, Environment, Smashers and CustomCollider routes are modeled.
 * Other native layers deliberately stop the composition rather than letting
 * a later hit through. All events are REQUESTS, not verified side effects.
 */
export function planBulletFixedContactSequence({
  orderedHits, current, projectilePosition, velocity,
}) {
  if (!Array.isArray(orderedHits) || current === null ||
      typeof current !== 'object' ||
      typeof current.firedByPlayer !== 'boolean' ||
      typeof current.sniperBullet !== 'boolean') {
    throw new TypeError('orderedHits and explicit current bullet flags required');
  }

  const events = [];
  let currentPosition = projectilePosition;
  const result = (status, consumedHits, stoppedAt = null) => ({
    status, consumedHits, stoppedAt, events,
  });

  for (let i = 0; i < orderedHits.length; i++) {
    const hit = orderedHits[i];
    if (hit === null || typeof hit !== 'object' ||
        typeof hit.layer !== 'string' || typeof hit.ignored !== 'boolean') {
      throw new TypeError('each hit needs explicit layer and ignored guard');
    }
    if (hit.ignored) continue;

    if (hit.layer === 'Bullets') {
      // The native Bullets handler returns false, even after slice requests.
      const pair = planBulletPairContact({
        ignored: false, current, encountered: hit.encountered,
        collisionPoint: hit.collisionPoint,
        otherCanCollideCurrent: hit.otherCanCollideCurrent,
      });
      for (const event of pair.events) {
        events.push({ ...event, hitIndex: i });
        if (event.type === 'position-request' && event.target === 'current')
          currentPosition = event.position;
      }
      if (pair.outcome === 'other-can-collide-unverified') {
        return result('pair-can-collide-unverified', i + 1, i);
      }
      if (pair.outcome === 'parent-weapon-ids-incomplete' ||
          pair.outcome === 'parent-weapon-guard-conflict') {
        return result(pair.outcome, i + 1, i);
      }
      if (typeof hit.destroyedAfterHandler !== 'boolean') {
        return result('destruction-state-unverified', i + 1, i);
      }
      if (hit.destroyedAfterHandler) {
        return result('native-loop-stop-requested', i + 1, i);
      }
      continue;
    }

    const route = planIncomingBulletFixedContacts({
      orderedHits: [hit], firedByPlayer: current.firedByPlayer,
      sniperBullet: current.sniperBullet, projectilePosition: currentPosition, velocity,
    });
    for (const event of route.events) events.push({ ...event, hitIndex: i });
    if (route.status === 'native-loop-stop-requested') {
      return result(route.status, i + 1, i);
    }
    if (route.status !== 'contacts-exhausted') {
      return result(route.status, i + 1, i);
    }
    // FixedUpdate also stops when destroyed, even if HandleCollision=false.
    if (typeof hit.destroyedAfterHandler !== 'boolean') {
      return result('destruction-state-unverified', i + 1, i);
    }
    if (hit.destroyedAfterHandler) {
      return result('native-loop-stop-requested', i + 1, i);
    }
  }
  return result('contacts-exhausted', orderedHits.length);
}
