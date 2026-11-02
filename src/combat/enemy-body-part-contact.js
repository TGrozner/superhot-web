/**
 * Source-bounded MCD Bullet.EnemiesCollisionHandle body-part decision.
 * Steam MCD build 20299547, private research #127 (Bullet.cs:785-970),
 * read-only artifact 13158822845. Never treats these intents as applied effects.
 *
 * This is NOT the enemy-weapon collider route, full VFX, BossMind branch,
 * PhysX execution, native animation, or proof of Containers instance state.
 */
const explicitBool = (value, name) => {
  if (typeof value !== 'boolean') throw new TypeError(name + ' must be an explicit boolean');
};
const explicitInstanceId = (value, name) => {
  if (!Number.isInteger(value) || value < -2147483648 || value > 2147483647) {
    throw new TypeError(name + ' must be a source controller GetInstanceID int32');
  }
};
const plan = (outcome, nativeHandlerReturn, intents) => ({
  outcome, nativeHandlerReturn, intents,
  // FixedUpdate's destroyed flag remains unobserved even when this route
  // did not explicitly request DestroyBullet: other effects may change it.
  postHandlerDestroyedUnknown: true,
});

/**
 * ownerControllerInstanceId is Bullet.owner (PejAiController), NOT the
 * Bullet.parentWeaponId used by Bullet.CanCollide in bullet/bullet contact.
 * null means no owner. target is specifically a PejAiBodyPart with live
 * controller; the caller must prove the collider/component chain separately.
 * All booleans, including each CheckIfBossMind call's result, are injected.
 */
export function planEnemyBodyPartBulletContact({ bullet, target, piercingShotActive }) {
  if (!bullet || typeof bullet !== 'object' || !target || typeof target !== 'object') {
    throw new TypeError('explicit bullet and live PejAiBodyPart evidence required');
  }
  if (bullet.ownerControllerInstanceId !== null) {
    explicitInstanceId(bullet.ownerControllerInstanceId, 'bullet.ownerControllerInstanceId');
  }
  explicitInstanceId(target.controllerInstanceId, 'target.controllerInstanceId');
  for (const field of ['ownerInHotswitch', 'excludeInCollision', 'firedByPlayer',
    'pierceConcreteBody', 'goThroughGlass']) {
    explicitBool(bullet[field], 'bullet.' + field);
  }
  for (const field of ['isBulletProof', 'hasArmoredCutter', 'isStunned', 'isDead',
    'bossMindAtImpact', 'bossMindAtCleanup']) {
    explicitBool(target[field], 'target.' + field);
  }
  explicitBool(piercingShotActive, 'piercingShotActive');

  // Bullet.cs:791-797,939-943: only an owner other than this controller,
  // an owner hotswitching, or a null owner may hit this body part.
  const ownerIsSelf = bullet.ownerControllerInstanceId !== null &&
    bullet.ownerControllerInstanceId === target.controllerInstanceId;
  if (ownerIsSelf && !bullet.ownerInHotswitch) {
    return plan('same-controller-owner', false, [{ type: 'bullet-destroy-request' }]);
  }
  if (bullet.excludeInCollision) return plan('excluded-collider', false, []);

  // No guesswork for the distinct boss-mind Stun/ricochet/sniper branch.
  if (target.bossMindAtImpact) return plan('boss-mind-branch-unmodeled', null, []);

  const intents = [];
  const bulletproof = target.isBulletProof && !bullet.pierceConcreteBody &&
    !(piercingShotActive && bullet.firedByPlayer);
  if (bulletproof) {
    if (!target.isStunned) intents.push({ type: 'enemy-stun-request', reason: 'bulletproof' });
  } else if (target.hasArmoredCutter) {
    intents.push({ type: 'enemy-armor-break-request' });
    if (!target.isStunned) intents.push({ type: 'enemy-stun-request', reason: 'armor' });
  } else {
    if (!target.isDead) intents.push({ type: 'replay-bullet-kill-slowdown-request' });
    intents.push({ type: 'enemy-body-kill-request', deathSource: 'Bullet' });
  }

  // Bullet.cs:933-937: goThroughGlass and PiercingShot affect retention on
  // ENEMY contact, not just glass. A second boss check is a distinct input.
  if ((!bullet.goThroughGlass && (!piercingShotActive || !bullet.firedByPlayer)) ||
      target.bossMindAtCleanup) {
    intents.push({ type: 'bullet-destroy-request' });
  }
  return plan(bulletproof ? 'bulletproof-hit' :
    target.hasArmoredCutter ? 'armor-hit' : 'body-kill-requested', true, intents);
}
