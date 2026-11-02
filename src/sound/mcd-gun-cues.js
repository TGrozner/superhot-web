/**
 * Base Gun audio branches established from the private MCD managed code.
 * This is an intent adapter, NOT a native clip player or proof of audibility.
 *
 * Native provenance: build 20299547, Assembly-CSharp SHA-256
 * ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257;
 * Gun.cs:99-147, 158-204, 206-217; private corpus issue #34.
 * A derived weapon may override Fire, so only use selectBaseGunFireCue
 * once the actual call path to Gun.Fire has been established.
 */
export const MCD_GUN_ATTACK_BRANCH = Object.freeze({
  BLOCKED: 'blocked',
  FIRE: 'fire',
  THROW: 'throw',
  DRY_FIRE: 'dry-fire',
  THROW_EMPTY: 'throw-empty',
});

export const MCD_GUN_CUE = Object.freeze({
  PRIMARY: 'base-gun-shot-primary',
  ALTERNATE: 'base-gun-shot-alternate',
  EMPTY: 'gun-dry-fire',
});

const SHOT_PARAMS = Object.freeze({
  volume: 0.6, mixerField: 'mixerGunshots', pitchRandomization: 0.15,
  volumeRandomization: 0.15, startFromBeginning: true, relativePitch: true,
});
const EMPTY_PARAMS = Object.freeze({volume: 0.4, mixerField: 'mixerSfxEnvironment'});
const NO_CUE = null;

function boolean(value, name) {
  if (typeof value !== 'boolean') throw new TypeError(`${name} must be boolean`);
}

/** Classify Gun.Attack guards; do not infer subclass Fire behavior from it. */
export function classifyMcdGunAttack({
  thrown, weaponReady, additionalCheckPassed, ammoCount, noShootingActive,
} = {}) {
  boolean(thrown, 'thrown');
  boolean(weaponReady, 'weaponReady');
  boolean(additionalCheckPassed, 'additionalCheckPassed');
  boolean(noShootingActive, 'noShootingActive');
  if (!Number.isSafeInteger(ammoCount)) throw new RangeError('ammoCount must be a safe integer');

  if (thrown || !weaponReady || !additionalCheckPassed) {
    return MCD_GUN_ATTACK_BRANCH.BLOCKED;
  }
  if (ammoCount > 0) {
    return noShootingActive ? MCD_GUN_ATTACK_BRANCH.THROW : MCD_GUN_ATTACK_BRANCH.FIRE;
  }
  return ammoCount === 0 ? MCD_GUN_ATTACK_BRANCH.DRY_FIRE : MCD_GUN_ATTACK_BRANCH.THROW_EMPTY;
}

/** Gun.Fire (base implementation) chooses a clip branch AFTER the actual fire. */
export function selectBaseGunFireCue({ unityRandomValue, alternateClipPresent } = {}) {
  if (typeof unityRandomValue !== 'number' || !Number.isFinite(unityRandomValue) ||
      unityRandomValue < 0 || unityRandomValue > 1) {
    throw new RangeError('unityRandomValue must be in [0,1]');
  }
  boolean(alternateClipPresent, 'alternateClipPresent');
  return Object.freeze({
    kind: unityRandomValue > 0.6 && alternateClipPresent
      ? MCD_GUN_CUE.ALTERNATE : MCD_GUN_CUE.PRIMARY,
    params: SHOT_PARAMS,
  });
}

/** Gun.FireNoAmmo has a PlayClip call only when NoShooting is inactive. */
export function selectGunDryFireCue({ noShootingActive } = {}) {
  boolean(noShootingActive, 'noShootingActive');
  return noShootingActive ? NO_CUE : Object.freeze({
    kind: MCD_GUN_CUE.EMPTY, params: EMPTY_PARAMS,
  });
}

/**
 * Deliberately synthetic mapping to the EXISTING original Web oscillators.
 * Returning true means a callback was called, not audible sound. No clip is
 * copied; alternate and primary sound identical until independently authored.
 */
export function createGeneratedMcdGunCueSink(webSynth) {
  if (!webSynth || typeof webSynth !== 'object') throw new TypeError('webSynth required');
  return (cue) => {
    const name = cue?.kind === MCD_GUN_CUE.EMPTY ? 'empty'
      : cue?.kind === MCD_GUN_CUE.PRIMARY || cue?.kind === MCD_GUN_CUE.ALTERNATE
        ? 'shoot' : null;
    if (!name || typeof webSynth[name] !== 'function') return false;
    const result = webSynth[name]();
    if (result !== undefined && result !== null &&
        (typeof result === 'object' || typeof result === 'function') &&
        typeof result.then === 'function') {
      void Promise.resolve(result).catch(() => {});
      throw new TypeError('synthetic callback must return synchronously');
    }
    return true;
  };
}
