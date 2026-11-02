/**
 * AudioManager.PlayClip(AudioClip, ...) source-gated request planner.
 * MCD Steam build 20299547, Unity 2018.4.14f1, Assembly-CSharp SHA-256
 * ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257.
 * Source: AudioManager.cs:499-572, private research #112/#113.
 *
 * This only describes a managed request to Unity AudioSource. It does not
 * acquire a real clip, implement pooling, perform playback, or prove sound.
 */
export const MCD_PLAYCLIP_RESULT = Object.freeze({
  EMPTY_EFFECT: 'empty-effect',
  REQUEST: 'audio-source-play-request',
});

function requireBoolean(value, name) {
  if (typeof value !== 'boolean') throw new TypeError(name + ' must be boolean');
}

function requireFinite(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(name + ' must be finite');
  }
}

const empty = (reason) => Object.freeze({status: MCD_PLAYCLIP_RESULT.EMPTY_EFFECT, reason});

/**
 * Guard order is significant: null clip -> null channel -> clip cooldown.
 * Inputs describe state AT the AudioManager call, not at Gun.Attack time.
 * Optional AudioSource settings are checked only after all native early exits.
 * Finite-number checks are a Web boundary policy, not native Unity guards.
 */
export function planMcdPlayClip({
  clipPresent,
  channelPresent,
  cooldownActive,
  channelIsInterfaceSfx,
  bypassEffects,
  positionProvided,
  isLooped,
  playDelaySeconds,
  volume,
  pitch,
  priority,
} = {}) {
  requireBoolean(clipPresent, 'clipPresent');
  if (!clipPresent) return empty('clip-null');
  requireBoolean(channelPresent, 'channelPresent');
  if (!channelPresent) return empty('channel-null');
  requireBoolean(cooldownActive, 'cooldownActive');
  if (cooldownActive) return empty('clip-on-cooldown');

  for (const [key, value] of Object.entries({
    channelIsInterfaceSfx, bypassEffects, positionProvided, isLooped,
  })) requireBoolean(value, key);
  requireFinite(playDelaySeconds, 'playDelaySeconds');
  requireFinite(volume, 'volume');
  requireFinite(pitch, 'pitch');
  if (!Number.isInteger(priority)) throw new TypeError('priority must be integer');

  const effectiveBypass = bypassEffects || channelIsInterfaceSfx;
  const delayed = playDelaySeconds > 0;
  return Object.freeze({
    status: MCD_PLAYCLIP_RESULT.REQUEST,
    // Original code warns on pitch zero; it does not stop playback.
    zeroPitchWarning: pitch === 0,
    audioSource: Object.freeze({
      volume, pitch, priority, loop: isLooped,
      spatialBlend: positionProvided ? 1 : 0,
      bypassEffects: effectiveBypass,
      bypassListenerEffects: effectiveBypass,
      bypassReverbZones: effectiveBypass,
      // A missing channel returns above, so the mixerMaster fallback in the
      // original assignment is unreachable on this request path.
      outputMixer: 'supplied-channel',
      resetClipTimeSeconds: 0,
      playOnAwake: false,
      rolloffMode: 'logarithmic',
    }),
    // Pool GetInstance, if-reused Pause, and AudioSource.Play[Delayed]
    // remain caller/runtime responsibilities, not actions executed here.
    request: Object.freeze({
      operation: delayed ? 'PlayDelayed' : 'Play',
      delaySeconds: delayed ? playDelaySeconds : 0,
      pauseExistingIfPoolReused: true,
    }),
  });
}
