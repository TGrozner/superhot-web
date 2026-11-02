/**
 * SH-06 source-bounded Bullet body-part hit -> PejAiBody.Stun request.
 *
 * Native MCD build 20299547; private research #127 Bullet.cs:785-970
 * (artifact 13158822845), #105 PejAiBody.cs:478-536
 * (artifact 13144030637). No native asset, shader, animation or audio.
 *
 * This composes existing SH-03 and SH-06 source planners. It is NOT a
 * collider detector: "contactIsQualified" must be based on an independently
 * verified PejAiBodyPart/controller instance, NEVER the Web hit spheres.
 */
import { planEnemyBodyPartBulletContact } from '../combat/enemy-body-part-contact.js';
import { planPejAiBodyStun } from './enemy-stun-command-plan.js';

/**
 * The two method bodies are source-read, but no Containers instance hit,
 * renderer focus change or audible effect is verified. A positive result
 * means these methods REQUEST the described commands under input predicates.
 */
export function planBulletBodyPartStun({
  contactIsQualified, bullet, target, piercingShotActive,
  stunControllerInstanceId, stunState,
}) {
  if (typeof contactIsQualified !== 'boolean') {
    throw new TypeError('contactIsQualified must be an explicit boolean');
  }
  if (!contactIsQualified) {
    return {
      branch: 'unqualified-body-part-contact',
      contact: null,
      stun: null,
      nativeInvocationObserved: false,
    };
  }

  const contact = planEnemyBodyPartBulletContact({
    bullet, target, piercingShotActive,
  });
  const requests = contact.intents.filter(intent => intent.type === 'enemy-stun-request');
  if (requests.length === 0) {
    return {
      branch: 'no-stun-request',
      contact,
      stun: null,
      nativeInvocationObserved: false,
    };
  }
  if (requests.length !== 1) {
    throw new TypeError('one native bullet body-part contact requests at most one Stun');
  }
  // The body receiving Stun must be the body whose collider was hit.
  // Do not combine a source hit on one enemy with another's animation state.
  if (stunControllerInstanceId !== target.controllerInstanceId) {
    throw new TypeError('stun controller must match qualified hit controller');
  }
  if (!stunState || typeof stunState !== 'object' || Array.isArray(stunState)) {
    throw new TypeError('explicit PejAiBody.Stun instance state is required');
  }

  const stun = planPejAiBodyStun(stunState);
  return {
    branch: 'source-stun-request',
    reason: requests[0].reason, // bulletproof or armor: supplied source decision
    contact,
    stun,
    nativeInvocationObserved: false,
    gpuEffectObserved: false,
  };
}
