/**
 * Gun.Attack -> Invoke(PlayReadyToShootSound) -> PlayClip intent in MCD.
 * The two decisions are separated because the weapon may be thrown BEFORE
 * Unity invokes the callback. This is neither a Unity scheduler nor a player.
 *
 * Native static provenance: Steam build 20299547, Assembly-CSharp SHA-256
 * ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257;
 * Gun.cs:99-127 (private research #34, extract SHA256 ae7d70585e54e8c7887357a49aa2b86e384001c89ebdba6b36021bf605b1fdbf),
 * Gun.cs:356-365 (private research #108, extract SHA256 a14cf65d953dfd5219ee07173e968cec0ac596b0fbe83c7dd9d2c432a5857c29).
 * Source code, AudioClip, player output and exact Unity callback execution are
 * NOT present in this public module.
 */
import { MCD_GUN_ATTACK_BRANCH } from './mcd-gun-cues.js';

export const MCD_GUN_READY_CUE = 'gun-ready-to-shoot';
const READY_PARAMS = Object.freeze({
  clipField: 'SFXReadyToShoot', volume: 1, mixerField: 'mixerSfxEnvironment',
});
const READY_PLAY_INTENT = Object.freeze({
  kind: MCD_GUN_READY_CUE, params: READY_PARAMS,
});

/** Return the requested Unity Invoke only on the positive-ammo fire branch. */
export function planMcdGunReadyInvoke({
  attackBranch, readyClipPresent, requestedDelaySeconds,
} = {}) {
  if (!Object.values(MCD_GUN_ATTACK_BRANCH).includes(attackBranch)) {
    throw new TypeError('attackBranch must be a classified Gun.Attack branch');
  }
  if (typeof readyClipPresent !== 'boolean') {
    throw new TypeError('readyClipPresent must be boolean');
  }
  if (attackBranch !== MCD_GUN_ATTACK_BRANCH.FIRE || !readyClipPresent) return null;
  // Preserve the exact value supplied by GetAttackDelay; Unity Invoke's
  // behavior for zero/negative delays is NOT established by these methods.
  if (typeof requestedDelaySeconds !== 'number' || !Number.isFinite(requestedDelaySeconds)) {
    throw new TypeError('requestedDelaySeconds must be a finite GetAttackDelay value');
  }
  return Object.freeze({
    kind: MCD_GUN_READY_CUE,
    callback: 'PlayReadyToShootSound',
    scheduler: 'Unity Invoke',
    requestedDelaySeconds,
  });
}

/** Resolve the callback-side guard at actual invocation, not at fire time. */
export function resolveMcdGunReadyCallback(request, {
  callbackInvoked, weaponThrownAtCallback,
} = {}) {
  if (request === null) return null;
  if (request?.kind !== MCD_GUN_READY_CUE ||
      request.callback !== 'PlayReadyToShootSound') {
    throw new TypeError('request must be a Gun ready-sound Invoke intent');
  }
  if (typeof callbackInvoked !== 'boolean') {
    throw new TypeError('callbackInvoked must be boolean');
  }
  if (typeof weaponThrownAtCallback !== 'boolean') {
    throw new TypeError('weaponThrownAtCallback must be boolean');
  }
  if (!callbackInvoked || weaponThrownAtCallback) return null;
  // Native callback does not re-check SFXReadyToShoot != null. This object
  // expresses a PlayClip REQUEST, never a verified sound or its waveform.
  return READY_PLAY_INTENT;
}
