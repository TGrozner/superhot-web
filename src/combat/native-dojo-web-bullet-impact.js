import { planBulletFixedContactSequence } from './bullet-fixed-contact-sequence.js';

const point = value => value !== null && typeof value === 'object' &&
  ['x', 'y', 'z'].every(axis => Number.isFinite(value[axis]));

const bool = value => typeof value === 'boolean';
const int32 = value => Number.isInteger(value) &&
  value >= -2147483648 && value <= 2147483647;
const sourceBulletComplete = bullet => bullet !== null && typeof bullet === 'object' &&
  ['firedByPlayer', 'sniperBullet', 'ownerInHotswitch', 'excludeInCollision',
    'pierceConcreteBody', 'goThroughGlass'].every(key => bool(bullet[key])) &&
  (bullet.ownerControllerInstanceId === null || int32(bullet.ownerControllerInstanceId));
const bodyPartComplete = target => target !== null && typeof target === 'object' &&
  int32(target.controllerInstanceId) &&
  ['isBulletProof', 'hasArmoredCutter', 'isStunned', 'isDead',
    'bossMindAtImpact', 'bossMindAtCleanup'].every(key => bool(target[key]));

const blocked = (reason, impactType = null) => ({
  status: 'blocked', reason, impactType, nativeEvents: [],
  consumesWebBullet: false,
});

/**
 * @typedef {{type:'wall'|'enemy'|'player', t:number}} DojoWebImpact
 * @typedef {{
 *   nativeLayer:'Environment'|'Smashers'|'Enemies'|'CustomCollider',
 *   colliderChainVerified:boolean,
 *   ignored:boolean,
 *   destroyedAfterHandler?:boolean,
 *   hasPlayerController?:boolean,
 *   enemyBodyPart?:object,
 *   piercingShotActive?:boolean
 * }} DojoSourceContactEvidence
 */

/**
 * Translate the FIRST Web swept hit into an explicitly source-gated
 * Bullet.FixedUpdate request. The current main's closestImpact() supplies
 * geometry only: a Web body hit is NOT proof of PejAiBodyPart, Unity layer,
 * ownership, boss state, or a PlayerController on a CustomCollider.
 *
 * SH-05 must supply these *separately attested* source component/owner flags.
 * Missing proof keeps the current Dojo fallback and produces zero native
 * reaction requests. Never infer them from an actor name, weapon sprite, or
 * merely having a collider intersection. This adapter intentionally does not
 * resolve multi-hit sniper ordering or apply effects; the existing composer
 * handles the native decision, while SH-05 owns the actual Web reaction.
 *
 * Provenance: MCD build 20299547; private #102 Bullet.FixedUpdate and
 * #127 Bullet.EnemiesCollisionHandle; existing Web source-bounded planners.
 * Its swept hit is Web geometry, not a native PhysX observation.
 *
 * @param {{
 *   impact:DojoWebImpact|null,
 *   contact:DojoSourceContactEvidence|null,
 *   bullet:object|null,
 *   projectilePosition:{x:number,y:number,z:number},
 *   velocity:{x:number,y:number,z:number}
 * }} input
 * @returns {{status:string,reason?:string,impactType:string|null,
 *   nativeEvents:object[],consumesWebBullet:boolean,nativeLoopStatus?:string}}
 */
export function planDojoWebBulletImpact(input) {
  const { impact, contact, bullet, projectilePosition, velocity } = input ?? {};
  if (impact === null) return {
    status: 'no-hit', impactType: null, nativeEvents: [], consumesWebBullet: false,
  };
  if (!impact || !['wall', 'enemy', 'player'].includes(impact.type) ||
      !Number.isFinite(impact.t) || impact.t < 0 || impact.t > 1 ||
      !point(projectilePosition) || !point(velocity)) {
    throw new TypeError('finite Web impact and projectile segment required');
  }
  if (!sourceBulletComplete(bullet)) {
    return blocked('bullet-owner-and-flags-unverified', impact.type);
  }
  if (!contact || contact.colliderChainVerified !== true ||
      !bool(contact.ignored)) {
    return blocked('native-collider-chain-or-ignore-guard-unverified', impact.type);
  }
  if (bullet.sniperBullet) {
    // A single Web nearest hit cannot establish comparator ordering or
    // the post-handler destroyed state used by native sniper projectiles.
    return blocked('sniper-ordered-contacts-unavailable', impact.type);
  }

  const expected = impact.type === 'wall' ? ['Environment', 'Smashers'] :
    impact.type === 'enemy' ? ['Enemies'] : ['CustomCollider'];
  if (!expected.includes(contact.nativeLayer)) {
    return blocked('native-layer-does-not-match-web-impact', impact.type);
  }
  if (impact.type === 'enemy' &&
      (!bodyPartComplete(contact.enemyBodyPart) ||
       !bool(contact.piercingShotActive))) {
    return blocked('live-enemy-bodypart-or-piercing-guard-unverified', impact.type);
  }
  if (impact.type === 'player' && !bool(contact.hasPlayerController)) {
    return blocked('player-controller-component-unverified', impact.type);
  }

  const hit = { layer: contact.nativeLayer, ignored: contact.ignored };
  if (impact.type === 'enemy') {
    hit.enemyBodyPart = contact.enemyBodyPart;
    hit.piercingShotActive = contact.piercingShotActive;
  }
  if (impact.type === 'player') hit.hasPlayerController = contact.hasPlayerController;

  // Native destroyed state is not guessed from the presence of a request.
  if (bool(contact.destroyedAfterHandler)) {
    hit.destroyedAfterHandler = contact.destroyedAfterHandler;
  }
  const result = planBulletFixedContactSequence({
    orderedHits: [hit], current: bullet, projectilePosition, velocity,
  });
  if (result.status !== 'native-loop-stop-requested' &&
      result.status !== 'contacts-exhausted') {
    return blocked('native-contact-handler-not-qualified:' + result.status, impact.type);
  }
  return {
    status: contact.ignored ? 'ignored-by-source' : 'source-requests',
    impactType: impact.type,
    nativeEvents: result.events,
    nativeLoopStatus: result.status,
    consumesWebBullet: !contact.ignored &&
      result.status === 'native-loop-stop-requested',
  };
}
