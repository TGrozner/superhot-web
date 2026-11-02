/**
 * SH-07: serialized source bindings for native MCD Stun AudioPrefabs.
 *
 * MCD Steam build 20299547, Assembly-CSharp SHA-256:
 * ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257
 * Private source: #105 PejAiBody.Stun, #120 AudioGameObjectResources,
 * #113 AudioManager.PlayPrefabSound. Private indexed corpus.sqlite:
 * #144 GO identities, #145 components, #146 AudioSources, #147 AudioClips.
 *
 * These are serialized object pointers, NOT evidence that a prefab pool,
 * effect, source, mixer or audible sample is active in a running level.
 * No original audio data is included or loaded by this module.
 */
import { planMcdStunAudioFromCommands } from './mcd-enemy-stun-prefab.js';
import { MCD_PREFAB_SOUND_RESULT } from './mcd-prefab-sound-intent.js';

export const MCD_STUN_SERIALIZED_BINDINGS = Object.freeze({
  EnemyStun: Object.freeze({
    prefab: Object.freeze({ owner: 'resources.assets', pathId: 1860, serializedActive: true }),
    audioSource: Object.freeze({
      owner: 'resources.assets', pathId: 27512,
      serializedVolume: 0.6340000033378601, serializedPitch: 1,
      outputMixerRef: Object.freeze({ fileId: 3, pathId: 659 }),
    }),
    clip: Object.freeze({
      owner: 'resources.assets', pathId: 1675, name: 'AC_Enemy_Stun',
      serializedChannels: 1, serializedFrequencyHz: 96000,
      serializedDurationSeconds: 0.7437396049499512,
    }),
  }),
  EnemyStunConcrete: Object.freeze({
    prefab: Object.freeze({ owner: 'resources.assets', pathId: 1886, serializedActive: true }),
    audioSource: Object.freeze({
      owner: 'resources.assets', pathId: 27520,
      serializedVolume: 0.699999988079071, serializedPitch: 1,
      outputMixerRef: Object.freeze({ fileId: 3, pathId: 659 }),
    }),
    clip: Object.freeze({
      owner: 'resources.assets', pathId: 1611, name: 'AC_Enemy_Hit',
      serializedChannels: 1, serializedFrequencyHz: 48000,
      serializedDurationSeconds: 0.38374999165534973,
    }),
  }),
});

/**
 * Compose existing native-source Stun commands and AudioPrefab guards with a
 * verified serialized clip identity. This only prepares a private-local clip
 * REQUEST; it cannot play a sample, prove pool registration, or decide a
 * browser AudioContext's state. SH-05 owns the actual audio and main wiring.
 *
 * The returned serialized starting volume is NOT a final output gain:
 * prefab AudioClipEffects and Unity mixer state may change it.
 */
export function planMcdSourceBoundStunClip(commands, playbackState) {
  const request = planMcdStunAudioFromCommands(commands, playbackState);
  if (request === null) return null;

  const binding = MCD_STUN_SERIALIZED_BINDINGS[request.prefabName];
  if (!binding) throw new TypeError('no verified serialized binding for Stun prefab');

  const status = request.playback.status;
  if (status !== MCD_PREFAB_SOUND_RESULT.PLAY_REQUEST &&
      status !== MCD_PREFAB_SOUND_RESULT.EMPTY_EFFECT) {
    throw new TypeError('unsupported AudioPrefab playback status');
  }

  const localClipRequest = status === MCD_PREFAB_SOUND_RESULT.PLAY_REQUEST
    ? Object.freeze({
      kind: 'private-local-clip-request',
      clip: binding.clip,
      audioSource: binding.audioSource,
      position: request.playback.position,
      requestedPitch: request.playback.pitch,
      serializedStartingVolume: binding.audioSource.serializedVolume,
    })
    : null;

  return Object.freeze({
    kind: 'source-derived-stun-clip-intent',
    nativeRequest: request,
    serializedBinding: binding,
    localClipRequest,
  });
}
