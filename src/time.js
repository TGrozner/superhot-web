/**
 * Dependency-free extraction of the FRAME//BREAK prototype's time rules.
 *
 * PROVENANCE: superhot-web/src/main.js at 9f01f92411b4e125b2c992deee53602a8c67c416
 * STATUS: PROVISIONAL. These numbers are the existing Web prototype, NOT
 * verified SUPERHOT: MIND CONTROL DELETE mechanics. SH-01 owns native parity.
 * A malformed caller-provided ruleset must not leak non-finite target values.
 * SH-01 PR #12 proves only MCD TimeControl DECLARATIONS (e.g. minTimescale
 * initializer 0.01 and fixedTimestepDenominator initializer 60), not active
 * serialized overrides, update phase, or runtime law. Do not transplant them
 * here until an executable native contract has been independently verified.
 *
 * Call stepTime only for an active simulation tick. The optional paused flag
 * freezes all time domains and activity decay when a caller needs a pure
 * interrupted-state transition. Rendering and DOM events stay outside.
 */
export const PROTOTYPE_TIME_RULES = Object.freeze({
  initialScale: 0.04,
  minimumScale: 0.035,
  movingScale: 0.98,
  lookScaleFactor: 0.77,
  shotScaleFactor: 0.85,
  reloadingScale: 0.60,
  smoothingRate: 8,
  lookDecayRate: 2.1,
  shotDecayRate: 2.7,
});

const requireFinite = (value, label) => {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
  return value;
};

/** A time state has separate real-time and world-time clocks. */
export function createTimeState({
  timeScale = PROTOTYPE_TIME_RULES.initialScale,
  lookActivity = 0,
  shotPulse = 0,
  realClock = 0,
  worldClock = 0,
} = {}) {
  for (const [name, value] of Object.entries({timeScale, lookActivity, shotPulse, realClock, worldClock})) {
    requireFinite(value, name);
  }
  return { timeScale, lookActivity, shotPulse, realClock, worldClock };
}

/**
 * Current Web prototype target-speed formula; inputs are post-decay values.
 * This is not an inferred rule from the native game.
 */
export function getTargetTimeScale({ moving = false, lookActivity = 0, shotPulse = 0, reloading = false } = {}, rules = PROTOTYPE_TIME_RULES) {
  requireFinite(lookActivity, 'lookActivity');
  requireFinite(shotPulse, 'shotPulse');
  return requireFinite(Math.max(
    rules.minimumScale,
    moving ? rules.movingScale : 0,
    lookActivity * rules.lookScaleFactor,
    shotPulse * rules.shotScaleFactor,
    reloading ? rules.reloadingScale : 0,
  ), 'targetScale');
}

/**
 * Advance one variable-dt simulation step without mutating the input state.
 *
 * Exact current-prototype order: decay look/shot activity using real dt;
 * choose target; exponentially smooth scale using real dt; advance the
 * world by dt * the NEW scale. This last right-endpoint integration means
 * worldClock is not perfectly invariant to dt subdivision. The scale is.
 * Finite input clocks can overflow when advanced; these Web-only guards
 * reject nonfinite results instead of poisoning subsequent frames.
 *
 * `paused` means the caller has interrupted gameplay (e.g. focus or pointer
 * lock loss). It freezes both clocks, pulses, and the scale. Browser event
 * ordering and pause/resume UI are handled by the caller / src/input.js.
 */
export function stepTime(state, {
  dt,
  moving = false,
  reloading = false,
  paused = false,
} = {}, rules = PROTOTYPE_TIME_RULES) {
  if (!state || typeof state !== 'object') throw new TypeError('state is required');
  requireFinite(dt, 'dt');
  if (dt < 0) throw new RangeError('dt must be nonnegative');
  const { timeScale, lookActivity, shotPulse, realClock, worldClock } = state;
  for (const [name, value] of Object.entries({timeScale, lookActivity, shotPulse, realClock, worldClock})) {
    requireFinite(value, name);
  }
  if (paused) {
    return { ...state, targetScale: timeScale, realDelta: 0, worldDelta: 0 };
  }
  const nextLook = Math.max(0, lookActivity - dt * rules.lookDecayRate);
  const nextShot = Math.max(0, shotPulse - dt * rules.shotDecayRate);
  const targetScale = getTargetTimeScale({ moving, lookActivity: nextLook, shotPulse: nextShot, reloading }, rules);
  const blend = 1 - Math.exp(-rules.smoothingRate * dt);
  const nextScale = requireFinite(timeScale + (targetScale - timeScale) * blend, 'next timeScale');
  const worldDelta = requireFinite(dt * nextScale, 'worldDelta');
  const nextRealClock = requireFinite(realClock + dt, 'next realClock');
  const nextWorldClock = requireFinite(worldClock + worldDelta, 'next worldClock');
  return {
    ...state,
    timeScale: nextScale,
    lookActivity: nextLook,
    shotPulse: nextShot,
    realClock: nextRealClock,
    worldClock: nextWorldClock,
    targetScale,
    realDelta: dt,
    worldDelta,
  };
}

/**
 * requestAnimationFrame callback delta from the original Web prototype's
 * `src/main.js:frame` (baseline 9f01f924), independent of DOM/performance.
 *
 * PROVISIONAL_WEB_ONLY: the 50 ms cap and the callback re-anchor are observed
 * in our own Web source, not in an MCD native method or runtime measurement.
 *
 * Call once on every frame, including paused frames, then pass `dt` to
 * `stepTime` only while playing. Always use `nextTimestampMs` as the next
 * previous timestamp: a long stall is discarded rather than caught up later.
 * Backward/discontinuous timestamps yield dt=0 but still re-anchor.
 */
export const PROTOTYPE_FRAME_RULES = Object.freeze({
  maximumDeltaSeconds: 0.05,
});

export function sampleFrameDelta(previousTimestampMs, timestampMs) {
  requireFinite(previousTimestampMs, 'previousTimestampMs');
  requireFinite(timestampMs, 'timestampMs');
  return {
    dt: Math.min(
      PROTOTYPE_FRAME_RULES.maximumDeltaSeconds,
      Math.max(0, (timestampMs - previousTimestampMs) / 1000),
    ),
    nextTimestampMs: timestampMs,
  };
}
