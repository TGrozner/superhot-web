/**
 * Original MCD audio prefab request contract, NOT a sound generator.
 * Build 20299547 / Assembly-CSharp SHA-256
 * ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257.
 * Private research #113: AudioManager.cs:579-612; #89: PejAiBody.cs:565-602.
 * #120: AudioGameObjectResources.cs:35; #121: AudioPrefab.cs:1-6.
 * #124: AudioManager.cs:96-115,137-168 (pool init).
 * Public logic only: no native code, clip, prefab, or waveform.
 */
// Source initializer: new AudioPrefab("EnemyShatter", 5). This is a
// declared pool size, NOT proof the runtime actually loaded that pool.
export const MCD_ENEMY_SHATTER_PREFAB = Object.freeze({
  name: 'EnemyShatter', declaredPoolSize: 5,
});

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
 * Source-verified AudioGameObjectResources.EnemyShatter has name EnemyShatter
 * and declared pool size 5. Whether the pool exists at runtime is UNKNOWN.
 * This composes the original body-dead early exit with the sound-call site.
 */
export function planMcdBodyKillShatterPrefab({
  controllerAlreadyDead, bodyWorldPosition,
  poolExists, reused, pitchBeforeRequest,
} = {}) {
  boolean(controllerAlreadyDead, 'controllerAlreadyDead');
  if (controllerAlreadyDead) return null;
  const origin = position3(bodyWorldPosition);
  return planMcdAudioPrefabPlay({
    prefabName: MCD_ENEMY_SHATTER_PREFAB.name, poolExists, reused,
    position: {x: origin.x, y: origin.y + 1.5, z: origin.z},
    pitchBeforeRequest,
    pitchRandomization: 0,
  });
}

/**
 * AudioManager.Instance initializes pools once, by reflecting the static
 * AudioGameObjectResources fields (AudioManager.cs:96-115,137-168).
 * The field's declared pool size is used only if Resources.Load<GameObject>
 * finds Sounds/GameObjects/<Name>; an existing named pool is skipped.
 * Private read research #124, artifact 13156944529. Source/static only.
 *
 * No claim about actual Resources assets, pool capacity or Unity execution.
 * Finite integer validation is a Web boundary policy, not a native guard.
 */
export const MCD_PREFAB_POOL_RESULT = Object.freeze({
  ALREADY_REGISTERED: 'already-registered',
  MISSING_RESOURCE: 'prefab-resource-missing',
  REGISTER: 'register-prefab-pool',
});

export function planMcdAudioPrefabPoolInitialization({
  prefabName, declaredPoolSize, alreadyRegistered, resourceLoaded,
} = {}) {
  if (typeof prefabName !== 'string' || !prefabName.length) {
    throw new TypeError('resolved AudioPrefab.Name is required');
  }
  if (!Number.isInteger(declaredPoolSize)) {
    throw new TypeError('declaredPoolSize must be an integer');
  }
  boolean(alreadyRegistered, 'alreadyRegistered');
  if (alreadyRegistered) {
    // Native skips Resources.Load entirely for duplicate names.
    return Object.freeze({status: MCD_PREFAB_POOL_RESULT.ALREADY_REGISTERED, prefabName});
  }
  boolean(resourceLoaded, 'resourceLoaded');
  const resourcePath = 'Sounds/GameObjects/' + prefabName;
  if (!resourceLoaded) {
    return Object.freeze({
      status: MCD_PREFAB_POOL_RESULT.MISSING_RESOURCE, prefabName, resourcePath,
    });
  }
  return Object.freeze({
    status: MCD_PREFAB_POOL_RESULT.REGISTER, prefabName, resourcePath,
    declaredPoolSize,
  });
}
