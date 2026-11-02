/**
 * SH-07: source-identified Stun AudioPrefabs -> existing browser scene-audio
 * descriptor protocol. No sound samples, network access, or playback here.
 *
 * Source MCD Steam build 20299547. Private bounded evidence:
 * research #105 (PejAiBody.Stun), #120 (AudioPrefab names/pool sizes),
 * #113/#124 (PlayPrefabSound + conditional Resources.Load pools),
 * #144-#147 (GO -> AudioSource -> AudioClip owner/path_id).
 * Assembly-CSharp SHA256:
 * ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257
 *
 * Important: serialized GO active != Resources.Load success != pool present
 * at runtime != browser output != sound heard. The source output mixer ref
 * resources.assets fileID=3/pathID=659 is not a proven active mixer group.
 */
import { MCD_ENEMY_STUN_PREFABS } from './mcd-enemy-stun-prefab.js';
import { MCD_STUN_SERIALIZED_BINDINGS } from './mcd-stun-serialized-clips.js';

const STUN_NAMES = Object.freeze(['EnemyStun', 'EnemyStunConcrete']);

function privateManifestKey(binding) {
  // Matches the allowlisted server.mjs / createAudio.configureSceneAudio ID.
  return `audioNative_${binding.clip.owner.replaceAll('.', '_')}_${binding.clip.pathId}`;
}

function explicitPresence(value, name) {
  if (value !== true && value !== false && value !== 'unknown') {
    throw new TypeError(`${name} resource presence must be true, false, or "unknown"`);
  }
}

/**
 * Build *diagnostic* browser descriptors only after the private owner supplies
 * an explicit observation/assumption about each named prefab resource.
 *
 * `resourcePresent: true` is a caller assertion that the corresponding
 * local prefab should be previewed. It is NOT evidence that the original
 * runtime actually created an AudioManager pool. Unknown or false does not
 * install a playable Web pool. Source samples must be configured separately
 * in the private browser-assets manifest and decoded by createAudio().
 *
 * No invented Unity mixer, falloff, filter, or final gain is emitted.
 * The caller MUST choose a Web diagnostic max distance because the active
 * MCD spatial attenuation is not yet measured. The serialized AudioSource
 * initial volume is only an illustrative Web starting gain, not final output.
 *
 * Existing scene-audio descriptors are retained without modification.
 * Collisions are rejected rather than silently overriding already-verified
 * private package bindings.
 */
export function planMcdLocalStunSceneAudio({
  existingSceneAudio = null,
  resourcePresent,
  diagnosticMaxDistance,
} = {}) {
  if (resourcePresent === null || typeof resourcePresent !== 'object' ||
      Array.isArray(resourcePresent)) {
    throw new TypeError('resourcePresent must provide two explicit source-resource decisions');
  }
  for (const name of STUN_NAMES) explicitPresence(resourcePresent[name], name);

  const base = existingSceneAudio ?? {};
  if (typeof base !== 'object' || Array.isArray(base)) {
    throw new TypeError('existingSceneAudio must be an object');
  }
  const clips = { ...(base.clips ?? {}) };
  const prefabs = { ...(base.prefabs ?? {}) };
  const decisions = [];
  const localManifestKeys = [];

  for (const name of STUN_NAMES) {
    const presence = resourcePresent[name];
    if (presence !== true) {
      decisions.push(Object.freeze({
        prefabName: name,
        status: presence === false ? 'local-resource-absent' : 'local-resource-unverified',
      }));
      continue;
    }
    if (!(typeof diagnosticMaxDistance === 'number' &&
          Number.isFinite(diagnosticMaxDistance) && diagnosticMaxDistance > 0)) {
      throw new TypeError('positive diagnosticMaxDistance required for any local Stun preview');
    }
    const binding = MCD_STUN_SERIALIZED_BINDINGS[name];
    const prefab = MCD_ENEMY_STUN_PREFABS[name];
    const manifestKey = privateManifestKey(binding);
    if (Object.hasOwn(prefabs, name) || Object.hasOwn(clips, manifestKey)) {
      throw new Error(`source Stun binding already configured: ${name} / ${manifestKey}`);
    }
    clips[manifestKey] = Object.freeze({
      manifestKey,
      owner: binding.clip.owner,
      pathId: binding.clip.pathId,
      name: binding.clip.name,
    });
    prefabs[name] = Object.freeze({
      poolSize: prefab.declaredPoolSize,
      clips: Object.freeze([manifestKey]),
      pitch: binding.audioSource.serializedPitch,
      gain: binding.audioSource.serializedVolume,
      maxDistance: diagnosticMaxDistance,
      // Deliberately no mixerGroup: active mixer/DSP and timescale are unknown.
    });
    localManifestKeys.push(manifestKey);
    decisions.push(Object.freeze({
      prefabName: name,
      status: 'local-diagnostic-pool-request',
      manifestKey,
      provenance: `${binding.clip.owner}:${binding.clip.pathId}`,
    }));
  }

  return Object.freeze({
    kind: 'mcd-local-stun-scene-audio-diagnostic',
    sceneAudio: Object.freeze({
      ...base,
      clips: Object.freeze(clips),
      prefabs: Object.freeze(prefabs),
    }),
    localManifestKeys: Object.freeze(localManifestKeys),
    decisions: Object.freeze(decisions),
    nativeRuntimePoolVerified: false,
    browserGraphVerified: false,
    speakerAudibilityVerified: false,
  });
}
