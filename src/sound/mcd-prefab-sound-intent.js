/**
 * Original MCD audio prefab request contract, NOT a sound generator.
 * Build 20299547 / Assembly-CSharp SHA-256
 * ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257.
 * Private research #113: AudioManager.cs:579-612; #89: PejAiBody.cs:565-602.
 * Public logic only: no native code, clip, prefab, or waveform.
 */
export const MCD_PREFAB_SOUND_RESULT = Object.freeze({
  EMPTY_EFFECT: 'empty-effect',
  PLAY_REQUEST: 'audio-prefab-play-request',
});

function finite(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be finite`);
  }
}

function boolean(value, name) {
  if (typeof value !== 'boolean') throw new TypeError(`${name} must be boolean`);
}

function position3(position) {
  if (!position || typeof position !== 'object') throw new TypeError('position is required');
  const {x, y, z} = position;
  finite(x, 'position.x');
  finite(y, 'position.y');
  finite(z, 'position.z');
  return Object.freeze({x, y, z});
}

/**
 * AudioManager.PlayPrefabSound(AudioPrefab, Vector3, float).
 * No clip/channel/cooldown checks from the separate PlayClip overload apply.
 * `pitchBeforeRequest` is the ACTUAL pooled AudioSource pitch; reuse does not
 * reset it in this method. All pool/serialized facts must be supplied.
 */
export function planMcdAudioPrefabPlay({
  prefabName, poolExists, reused, position, pitchBeforeRequest,
  pitchRandomization = 0, unityRandomValue,
} = {}) {
  if (typeof prefabName !== 'string' || prefabName.length === 0) {
    throw new TypeError('resolved AudioPrefab.Name is required');
  }
  boolean(poolExists, 'poolExists');
  if (!poolExists) {
    return Object.freeze({status: MCD_PREFAB_SOUND_RESULT.EMPTY_EFFECT, reason: 'pool-missing'});
  }
  boolean(reused, 'reused');
  const worldPosition = position3(position);
  finite(pitchBeforeRequest, 'pitchBeforeRequest');
  finite(pitchRandomization, 'pitchRandomization');
  if (pitchRandomization > 0) {
    finite(unityRandomValue, 'unityRandomValue');
    if (unityRandomValue < 0 || unityRandomValue > 1) {
      throw new RangeError('unityRandomValue must be in [0,1]');
    }
  }
  const pitch = pitchRandomization > 0
    ? pitchBeforeRequest + (unityRandomValue * pitchRandomization * 2 - pitchRandomization)
    : pitchBeforeRequest;
  return Object.freeze({
    status: MCD_PREFAB_SOUND_RESULT.PLAY_REQUEST,
    prefabName,
    position: worldPosition,
    pauseBeforeReuse: reused,
    registerPlaying: !reused,
    spatialBlend: 1,
    mute: false,
    pitch,
    zeroPitchWarning: pitch === 0,
    action: 'AudioSource.Play',
  });
}

/**
 * PejAiBody.Kill calls the AudioPrefab overload after Controller.Kill.
 * The argument is AudioGameObjectResources.EnemyShatter, whose .Name and pool
 * availability are NOT inferred from its symbolic field identifier.
 * This composes the original body-dead early exit with the sound-call site.
 */
export function planMcdBodyKillShatterPrefab({
  controllerAlreadyDead, bodyWorldPosition, resolvedPrefabName,
  poolExists, reused, pitchBeforeRequest,
} = {}) {
  boolean(controllerAlreadyDead, 'controllerAlreadyDead');
  if (controllerAlreadyDead) return null;
  const origin = position3(bodyWorldPosition);
  return planMcdAudioPrefabPlay({
    prefabName: resolvedPrefabName, poolExists, reused,
    position: {x: origin.x, y: origin.y + 1.5, z: origin.z},
    pitchBeforeRequest,
    pitchRandomization: 0,
  });
}
