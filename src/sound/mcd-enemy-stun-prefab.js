/**
 * Source-bounded SH-07 bridge from the SH-06 PejAiBody.Stun intent to the
 * AudioManager.PlayPrefabSound(AudioPrefab, Vector3, float) intent.
 *
 * Native MCD 20299547, Assembly-CSharp SHA-256:
 * ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257
 * Private #105 / artifact 13144030637: PejAiBody.cs:478-519.
 * Private #120 / artifact 13154468332: AudioGameObjectResources.cs:1-46.
 * Private #113 / artifact 13148839109: AudioManager.cs:579-612.
 *
 * No native clip, waveform or playback engine is included. Call this only
 * AFTER a source-qualified Stun invocation; SH-06 owns the source guard.
 */
import { planMcdAudioPrefabPlay } from './mcd-prefab-sound-intent.js';

export const MCD_ENEMY_STUN_PREFABS = Object.freeze({
  EnemyStun: Object.freeze({ name: 'EnemyStun', declaredPoolSize: 3 }),
  EnemyStunConcrete: Object.freeze({ name: 'EnemyStunConcrete', declaredPoolSize: 2 }),
});

/**
 * Compose the existing SH-06 command stream, without evaluating its guards
 * again or guessing a native pool state. SH-06 already adds the 1.5-unit Y
 * offset; do not offset the position a second time.
 *
 * The native Stun method writes stunSoundRest = realtime + 0.25 after asking
 * PlayPrefabSound, even when a missing pool causes that method to return its
 * empty effect (normal return path). Thus "requested" != "played", while
 * the source cooldown still advances. No Unity mixer/speaker output is proven.
 *
 * @param {Array<object>} commands result.commands from planPejAiBodyStun
 * @param {object} playbackState explicit native/runtime hypotheses. No defaults.
 * @returns {object|null} null when the source requested no stun sound
 */
export function planMcdStunAudioFromCommands(commands, playbackState = {}) {
  if (!Array.isArray(commands)) throw new TypeError('commands must be an array');
  const requests = commands.flatMap((command, index) =>
    command?.op === 'request-stun-prefab-sound' ? [{ command, index }] : []);
  if (requests.length === 0) return null;
  if (requests.length !== 1) throw new TypeError('one Stun invocation may request at most one sound');

  const { command, index } = requests[0];
  const prefab = Object.hasOwn(MCD_ENEMY_STUN_PREFABS, command.resource)
    ? MCD_ENEMY_STUN_PREFABS[command.resource]
    : null;
  if (!prefab) throw new TypeError('unknown native Stun AudioPrefab name');

  const restUpdate = commands[index + 1];
  if (restUpdate?.op !== 'set-stun-sound-rest' ||
      typeof restUpdate.realtimeSeconds !== 'number' ||
      !Number.isFinite(restUpdate.realtimeSeconds)) {
    throw new TypeError('Stun sound request must be followed by source realtime-rest update');
  }

  const playback = planMcdAudioPrefabPlay({
    prefabName: prefab.name,
    position: command.position,
    poolExists: playbackState.poolExists,
    reused: playbackState.reused,
    pitchBeforeRequest: playbackState.pitchBeforeRequest,
    pitchRandomization: 0,
  });
  return Object.freeze({
    kind: 'stun-prefab-request',
    prefabName: prefab.name,
    declaredPoolSize: prefab.declaredPoolSize,
    nextEligibleRealtimeSeconds: restUpdate.realtimeSeconds,
    playback,
  });
}
