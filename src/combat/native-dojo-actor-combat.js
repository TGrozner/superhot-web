import {
  advanceNativeEnemyWeapon,
  runNativeEnemyGunAttack,
  runNativeEnemyMeleeAttack,
} from './native-enemy-runtime.js';
import {
  nativeEnemyFireAttackRequests,
  nativeEnemyFireLateRequests,
} from './native-enemy-fire-phase.js';

const validId = value => (typeof value === 'string' && value.length > 0) ||
  (Number.isSafeInteger(value) && value >= 0);
const validPoint = value => value !== null && typeof value === 'object' &&
  ['x', 'y', 'z'].every(axis => Number.isFinite(value[axis]));
const soundQualifiedFamilies = new Set(['Pistol', 'Shotgun']);
const meleeFamilies = new Set(['Melee', 'Katana']);
const gunFamilies = new Set(['Pistol', 'Shotgun', 'MachineGun', 'SniperRifle']);

/**
 * @typedef {{type:string, [key:string]:unknown}} CombatReactionAction
 * @typedef {{actorId:string|number, kind:string, [key:string]:unknown}} CombatAnimationIntent
 */

/**
 * A single actor's Update or post-animated-pose Late phase. This is a Web
 * integration seam between the existing native-method reconstructions and
 * SH-05's actual Dojo actor/animation renderer. No guessed weapon properties,
 * clip names, pose timestamps, collider results or native prefab are produced.
 *
 * UPDATE: advance weapon cooldown and the selected source gun/melee decision,
 * then expose per-actor animation intentions and only the already qualified
 * Pistol/Shotgun Attack sound/alert requests. A melee ATTACK is not a hit:
 * SH-06's source-event gate plus a sampled SH-03 geometry contact must request
 * damage separately. Reaction actions come from the existing contact owner.
 *
 * LATE: consume the same actor's pending gun shot only after SH-14 provides the
 * actual current muzzle and weapon forward; an absent pose preserves the shot.
 * No wall veto or sound playback occurs here. Collision is a later phase.
 *
 * Private method provenance: MCD build 20299547, #71 (GunPejAiWeapon),
 * #102 (Bullet.FixedUpdate), #168/#178/#179/#180 (factory weapon selection).
 * This module does not authenticate the active Dojo difficulty/prefab or
 * reproduce Unity's cross-component scheduling. All outputs are Web requests.
 *
 * @param {{
 *   actorId:string|number,
 *   phase:'update'|'late',
 *   runtime:object,
 *   weaponSettings:object,
 *   scaledDeltaTime?:number,
 *   unscaledDeltaTime?:number,
 *   gunInput?:object|null,
 *   meleeInput?:object|null,
 *   shooterPosition?:{x:number,y:number,z:number}|null,
 *   pose?:{muzzlePosition:{x:number,y:number,z:number},
 *          weaponForward?:{x:number,y:number,z:number},
 *          sourceSocketMatrix?:Float32Array}|null,
 *   actorFrame?:{actorId:string|number,actorPoseOwnedSnapshot:boolean,
 *     weaponAttachmentMatrix:Float32Array|null}|null,
 *   reactionActions?:CombatReactionAction[],
 *   random?:()=>number
 * }} input
 * @returns {{
 *   actorId:string|number, phase:string, status:string,
 *   gunDecision?:object|null, meleeDecision?:object|null,
 *   audioEvidence?:string, attackRequests?:object[],
 *   animationIntents:CombatAnimationIntent[],
 *   projectileRequests?:object[], pendingShot:boolean
 * }}
 */
export function stepNativeDojoActorCombat(input) {
  const {
    actorId, phase, runtime, weaponSettings,
    scaledDeltaTime, unscaledDeltaTime,
    gunInput = null, meleeInput = null, shooterPosition = null, pose = null,
    actorFrame = null, reactionActions = [], random = Math.random,
  } = input ?? {};
  if (!validId(actorId) || !['update', 'late'].includes(phase) ||
      !runtime || typeof runtime !== 'object' ||
      !Object.hasOwn(runtime, 'pendingShot') ||
      !weaponSettings || typeof weaponSettings.family !== 'string' ||
      weaponSettings.family.length === 0 ||
      typeof random !== 'function') {
    throw new TypeError('explicit actor, phase, gun state, family and random required');
  }
  // The selector can enumerate more families than the current native behavior
  // implementation has reconstructed. Fail closed rather than routing a
  // MeleeWeapon/unknown prefab through GunAttack and spawning fake bullets.
  if (!gunFamilies.has(weaponSettings.family) && !meleeFamilies.has(weaponSettings.family)) {
    throw new TypeError('selected weapon family has no qualified attack phase');
  }
  if (phase === 'late') {
    if (gunInput !== null || meleeInput !== null || reactionActions.length !== 0) {
      throw new TypeError('Late may only consume the pending shot and current pose');
    }
    if (meleeFamilies.has(weaponSettings.family)) {
      if (runtime.pendingShot) throw new TypeError('melee actor has an unqualified pending gun shot');
      return { actorId, phase, status: 'empty', animationIntents: [],
        projectileRequests: [], pendingShot: false };
    }
    // SH-14 #253 returns independently owned socket snapshots per actor.
    // A previously drawn enemy's scratch socket must never release this actor's
    // pending shot. Bind the derived muzzle to that SAME snapshot by identity;
    // lack of source pose keeps the shot pending. The actual muzzle-local
    // transform and Web collider sweep remain SH-05's separate responsibilities.
    if (runtime.pendingShot && pose === null) {
      return { actorId, phase, status: 'awaiting-late-pose',
        animationIntents: [], projectileRequests: [], pendingShot: true };
    }
    if (runtime.pendingShot && (
      actorFrame?.actorId !== actorId ||
      actorFrame.actorPoseOwnedSnapshot !== true ||
      !(actorFrame.weaponAttachmentMatrix instanceof Float32Array) ||
      actorFrame.weaponAttachmentMatrix.length !== 16 ||
      !actorFrame.weaponAttachmentMatrix.every(Number.isFinite) ||
      pose?.sourceSocketMatrix !== actorFrame.weaponAttachmentMatrix
    )) {
      return { actorId, phase, status: 'awaiting-owned-actor-frame',
        animationIntents: [], projectileRequests: [], pendingShot: true };
    }
    const result = nativeEnemyFireLateRequests(runtime, weaponSettings, pose, random);
    return {
      actorId, phase, status: result.status, animationIntents: [],
      projectileRequests: result.requests.map(request => ({ actorId, ...request })),
      pendingShot: Boolean(runtime.pendingShot),
    };
  }
  if (!Number.isFinite(scaledDeltaTime) || scaledDeltaTime < 0 ||
      !Number.isFinite(unscaledDeltaTime) || unscaledDeltaTime < 0 ||
      !Array.isArray(reactionActions) ||
      (gunInput !== null && meleeInput !== null) ||
      (gunInput !== null && (typeof gunInput !== 'object' || meleeFamilies.has(weaponSettings.family))) ||
      (meleeInput !== null && (typeof meleeInput !== 'object' || !meleeFamilies.has(weaponSettings.family)))) {
    throw new TypeError('explicit nonnegative Update clocks and one family-compatible action required');
  }
  // Validate the sound emitter BEFORE mutating the attack state. When an
  // unsupported family fires, do not throw or counterfeit its audio contract.
  if (gunInput !== null && soundQualifiedFamilies.has(weaponSettings.family) &&
      !validPoint(shooterPosition)) {
    throw new TypeError('source-qualified gun sound requires the shooter position');
  }
  for (const action of reactionActions) {
    if (!action || typeof action.type !== 'string') {
      throw new TypeError('reaction actions must be explicit source action receipts');
    }
  }

  // A received Kill is an external native reaction receipt. Applying another
  // Attack in the same unspecified frame would invent ordering after the
  // source Animator.Kill has disabled the actor's animator.
  if (reactionActions.some(action => action.type === 'kill') &&
      (gunInput !== null || meleeInput !== null)) {
    throw new TypeError('cannot accept new attack with a kill reaction receipt');
  }

  const animationIntents = [];
  for (const action of reactionActions) {
    if (action.type === 'kill') {
      animationIntents.push({ actorId, kind: 'animator-kill-request',
        deathSource: action.deathSource, source: 'enemy-reaction.kill' });
    } else if (action.type === 'stun') {
      animationIntents.push({ actorId, kind: 'hit-reaction-request',
        stunType: action.stunType, restartAnimation: action.restartAnimation === true,
        source: 'enemy-reaction.stun' });
    } else if (action.type === 'drop-weapon') {
      animationIntents.push({ actorId, kind: 'weapon-detach-request',
        source: 'enemy-reaction.drop-weapon' });
    }
  }

  let gunDecision = null;
  let meleeDecision = null;
  let attackRequests = [];
  let audioEvidence = 'no-accepted-shot';
  if (gunInput !== null) {
    advanceNativeEnemyWeapon(runtime, weaponSettings, scaledDeltaTime);
    gunDecision = runNativeEnemyGunAttack(runtime, weaponSettings, {
      ...gunInput, scaledDeltaTime, unscaledDeltaTime,
    }, random);
    if (gunDecision.shot) {
      animationIntents.push({ actorId, kind: 'gun-attack-accepted',
        family: weaponSettings.family, source: 'GunAttack.shot',
        requiresCurrentLateWeaponPose: true });
      if (soundQualifiedFamilies.has(weaponSettings.family)) {
        attackRequests = nativeEnemyFireAttackRequests(
          gunDecision, weaponSettings.family, shooterPosition,
        ).map(request => ({ actorId, ...request }));
        audioEvidence = 'static-source-request-qualified';
      } else {
        // MachineGun/Sniper and other active families must not borrow the
        // Pistol or Shotgun cue or alert radius without their method proof.
        audioEvidence = 'family-sound-and-alert-unverified';
      }
    }
  } else if (meleeInput !== null) {
    meleeDecision = runNativeEnemyMeleeAttack(weaponSettings, meleeInput);
    if (meleeDecision.attack) {
      animationIntents.push({ actorId, kind: 'melee-attack-intent',
        family: weaponSettings.family,
        source: 'MeleeAttack decision, no contact',
        needsClipEventAndGeometry: true });
    }
    // Even if meleeDecision.kill is true, a renderer may NOT apply damage
    // from this request. Its source event / actual body sweep must be admitted
    // through the separate SH-06 punch/weapon contact gate.
  }
  return {
    actorId, phase, status: 'updated', gunDecision, meleeDecision,
    audioEvidence, attackRequests, animationIntents,
    pendingShot: Boolean(runtime.pendingShot),
  };
}
