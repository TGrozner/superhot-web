/**
 * Source-bounded AudioClipChangerGroupPlay.Update / AudioClipChanger.UpdateVolume
 * intents for SUPERHOT: MIND CONTROL DELETE. This does NOT play audio.
 *
 * Provenance: Steam build 20299547; Assembly-CSharp SHA256
 * ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257.
 * Private corpus #19 (AudioClipChangerGroupPlay.cs lines 1-70,
 * UTF-8 extract SHA256 9ad76fa465849c52ab78a1536a1600519da3739a58291802767ed6fa543f17aa)
 * and #28 (AudioClipChanger.cs lines 1-41,
 * UTF-8 extract SHA256 5cc071c17f4ac855ee6d4dd6417e19c761ca7a0c17c1a62dbbb374d0465c4c04).
 * The presence of a serialized component in Containers is NOT established.
 */

const finite = (n, name) => {
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    throw new TypeError(`${name} must be finite`);
  }
  return n;
};

const nonnegative = (n, name) => {
  finite(n, name);
  if (n < 0) throw new RangeError(`${name} must be nonnegative`);
  return n;
};

const positive = (n, name) => {
  finite(n, name);
  if (n <= 0) throw new RangeError(`${name} must be positive`);
  return n;
};

/** C# fields: progress defaults to 0, lastProgress explicitly starts at -1. */
export function initialMcdMovementLayerState() {
  return Object.freeze({ progress: 0, lastProgress: -1 });
}

/**
 * A single native Update decision, using caller-observed timescale, player
 * velocity magnitude and unscaled delta. Both durations MUST come from the
 * chosen instance: C# field initializers (1 / 0.5s) are not proven overrides.
 *
 * updateVolumes models the original progress != lastProgress guard. It is
 * true on the first Update at progress=0, even if no movement occurs.
 */
export function stepMcdMovementLayer(state, {
  timeScale, playerSpeed, unscaledDeltaTime, toSlowDuration, toFastDuration,
} = {}) {
  if (!state || typeof state !== 'object') throw new TypeError('state required');
  const progress = finite(state.progress, 'progress');
  const lastProgress = finite(state.lastProgress, 'lastProgress');
  if (progress < 0 || progress > 1) throw new RangeError('progress must be within [0,1]');
  finite(timeScale, 'timeScale');
  nonnegative(playerSpeed, 'playerSpeed');
  nonnegative(unscaledDeltaTime, 'unscaledDeltaTime');
  positive(toSlowDuration, 'toSlowDuration');
  positive(toFastDuration, 'toFastDuration');

  let next = progress;
  if (next > 0 && timeScale < 0.1) {
    next = Math.max(0, next - unscaledDeltaTime / toSlowDuration);
  } else if (next < 1 && timeScale > 0.1 && playerSpeed > 0) {
    next = Math.min(1, next + unscaledDeltaTime / toFastDuration);
  }
  next = Math.min(1, Math.max(0, next));
  return Object.freeze({
    progress: next,
    lastProgress: next,
    updateVolumes: next !== lastProgress,
  });
}

/**
 * Source formula for each changer. Pass SERIALIZED min/max fields explicitly,
 * not the C# initializers (slow max .8, fast max .6, mins 0), because the
 * active scene's per-component overrides are not proven.
 */
export function computeMcdMovementLayerVolumes(progress, {
  slowMin, slowMax, fastMin, fastMax,
} = {}) {
  finite(progress, 'progress');
  if (progress < 0 || progress > 1) throw new RangeError('progress must be within [0,1]');
  for (const [name, value] of Object.entries({ slowMin, slowMax, fastMin, fastMax })) {
    finite(value, name);
  }
  return Object.freeze({
    fast: fastMin + (fastMax - fastMin) * progress,
    slow: slowMin + (slowMax - slowMin) * (1 - progress),
  });
}
