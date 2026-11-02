import { planBulletPairContact } from './bullet-pair-contacts.js';
import { planIncomingBulletFixedContacts } from './incoming-bullet-contacts.js';
import { planEnemyBodyPartBulletContact } from './enemy-body-part-contact.js';

/**
 * Bounded composer for Bullet.FixedUpdate's ordered collision loop.
 * Static source: MCD build 20299547, private research #102, Bullet.cs:184-215
 * and HandleCollision:231-317 (artifact 13141705847). No PhysX or runtime
 * trace is executed here. Caller supplies actual comparator-ordered hits and
 * post-handler destroyed state; never infer either from request names.
 *
 * Only Bullets, Environment, Smashers, CustomCollider and source-gated
 * Enemies body-part contacts are modeled.
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
  // Bullet.cs:246-251 and 210: reset after every native FixedUpdate.
  let enemyPartCollisionHandled = false;
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

    if (hit.layer === 'Enemies' && hit.enemyBodyPart !== undefined) {
      // Bullet.HandleCollision alerts even when a prior bodypart in this
      // FixedUpdate has already been handled (private #102:238,244-251).
      events.push({ type: 'alert-request', hitIndex: i, parameters: [5, 0.05, 2] });
      if (!enemyPartCollisionHandled) {
        const enemy = planEnemyBodyPartBulletContact({
          bullet: {
            ownerControllerInstanceId: current.ownerControllerInstanceId,
            ownerInHotswitch: current.ownerInHotswitch,
            excludeInCollision: current.excludeInCollision,
            firedByPlayer: current.firedByPlayer,
            pierceConcreteBody: current.pierceConcreteBody,
            goThroughGlass: current.goThroughGlass,
          },
          target: hit.enemyBodyPart, piercingShotActive: hit.piercingShotActive,
        });
        if (enemy.nativeHandlerReturn === null) {
          return result('enemy-native-branch-unmodeled', i + 1, i);
        }
        enemyPartCollisionHandled = enemy.nativeHandlerReturn;
        for (const intent of enemy.intents) events.push({ ...intent, hitIndex: i });
        // Outer HandleCollision returns true for Enemies even when the
        // inner EnemiesCollisionHandle returned false (private #102:244-251).
        if (!current.sniperBullet) return result('native-loop-stop-requested', i + 1, i);
      }
      // The following destroyed flag is post-handler native state, never
      // deduced from a requested Kill, Stun or DestroyBullet.
      if (typeof hit.destroyedAfterHandler !== 'boolean') {
        return result('destruction-state-unverified', i + 1, i);
      }
      if (hit.destroyedAfterHandler) return result('native-loop-stop-requested', i + 1, i);
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
