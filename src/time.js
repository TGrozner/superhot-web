/**
 * Dependency-free extraction of the FRAME//BREAK prototype's time rules.
 *
 * PROVENANCE: superhot-web/src/main.js at 9f01f92411b4e125b2c992deee53602a8c67c416
 * STATUS: PROVISIONAL. These numbers are the existing Web prototype, NOT
 * verified SUPERHOT: MIND CONTROL DELETE mechanics. SH-01 owns native parity.
 * A malformed caller-provided ruleset must not leak non-finite target values.
 * Native TimeControl source #13 now establishes the order of its LateUpdate;
 * the explicit source-qualified model below is separate from these Web rules.
 * Containers composes the source-qualified clock below; demos retain stepTime.
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

// Guard caller-supplied Web decay/smoothing coefficients, not native MCD constants.
const requireNonnegativeRate = (value, label) => {
  requireFinite(value, label);
  if (value < 0) throw new RangeError(`${label} must be nonnegative`);
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
  // Snapshot state once. Avoid object-rest destructuring: some engines read
  // excluded accessor properties again while copying the remaining fields.
  // Preserve support for inherited/non-enumerable clocks via explicit fallback.
  // PROVISIONAL WEB integrity rule, not a native SUPERHOT MCD time contract.
  const stateSnapshot = { ...state };
  for (const name of ['timeScale', 'lookActivity', 'shotPulse', 'realClock', 'worldClock']) {
    if (!Object.hasOwn(stateSnapshot, name)) stateSnapshot[name] = state[name];
  }
  const { timeScale, lookActivity, shotPulse, realClock, worldClock } = stateSnapshot;
  for (const [name, value] of Object.entries({timeScale, lookActivity, shotPulse, realClock, worldClock})) {
    requireFinite(value, name);
  }
  if (paused) {
    return { ...stateSnapshot, targetScale: timeScale, realDelta: 0, worldDelta: 0 };
  }
  // Negative rates turn decay into growth or smoothing into reverse time.
  // Reject malformed WEB rules before computing an active tick; the pause path
  // above stays a pure freeze, independent of caller configuration.
  const lookDecayRate = requireNonnegativeRate(rules.lookDecayRate, 'lookDecayRate');
  const shotDecayRate = requireNonnegativeRate(rules.shotDecayRate, 'shotDecayRate');
  const smoothingRate = requireNonnegativeRate(rules.smoothingRate, 'smoothingRate');
  const nextLook = Math.max(0, lookActivity - dt * lookDecayRate);
  const nextShot = Math.max(0, shotPulse - dt * shotDecayRate);
  const targetScale = getTargetTimeScale({ moving, lookActivity: nextLook, shotPulse: nextShot, reloading }, rules);
  const blend = 1 - Math.exp(-smoothingRate * dt);
  const nextScale = requireFinite(timeScale + (targetScale - timeScale) * blend, 'next timeScale');
  const worldDelta = requireFinite(dt * nextScale, 'worldDelta');
  // A nonzero mathematical step must not silently round to zero. These are
  // numeric integrity guards for the WEB prototype, not native MCD rules.
  if (dt > 0 && nextScale !== 0 && worldDelta === 0) {
    throw new RangeError('worldDelta cannot represent this step');
  }
  const nextRealClock = requireFinite(realClock + dt, 'next realClock');
  const nextWorldClock = requireFinite(worldClock + worldDelta, 'next worldClock');
  if (dt > 0 && nextRealClock === realClock) {
    throw new RangeError('realClock cannot represent this step');
  }
  if (worldDelta !== 0 && nextWorldClock === worldClock) {
    throw new RangeError('worldClock cannot represent this step');
  }
  return {
    ...stateSnapshot,
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


/**
 * Split elapsed PLAYING time from the capped physics-simulation step.
 *
 * WEB-ONLY fairness fix. The old main.js applied the 50ms RAF simulation
 * cap to its score clock and to the explicitly real-time unarmed cooldown:
 * at 10 FPS, a real second counted as only half a second in those systems.
 *
 * The caller supplies the timestamp of its most recent start/resume, not a
 * guessed duration. Only the portion of this frame after that timestamp can
 * be charged to active gameplay. On a long frame the simulation still uses
 * the existing 50ms cap, but the score/cooldown can use activeRealDt.
 *
 * Browser ownership, including setting activeSinceTimestampMs on resume and
 * ONLY calling update while playing, stays with SH-05 in src/main.js.
 * Native MCD timing/cadence is not inferred by this Web helper.
 *
 * @param {number} previousTimestampMs Previous requestAnimationFrame timestamp.
 * @param {number} timestampMs Current requestAnimationFrame timestamp.
 * @param {number} activeSinceTimestampMs Last entered-playing timestamp.
 * @returns {{simulationDt:number,activeRealDt:number,nextTimestampMs:number}}
 */
export function sampleActiveFrameDeltas(previousTimestampMs, timestampMs, activeSinceTimestampMs) {
  const frame = sampleFrameDelta(previousTimestampMs, timestampMs);
  requireFinite(activeSinceTimestampMs, 'activeSinceTimestampMs');
  const elapsedMs = Math.max(0, timestampMs - Math.max(previousTimestampMs, activeSinceTimestampMs));
  const activeRealDt = requireFinite(elapsedMs / 1000, 'activeRealDt');
  return {
    simulationDt: Math.min(PROTOTYPE_FRAME_RULES.maximumDeltaSeconds, activeRealDt),
    activeRealDt,
    nextTimestampMs: frame.nextTimestampMs,
  };
}

/**
 * Source-qualified TimeControl model, isolated from the Web prototype rules.
 *
 * PROUVÉ as delivered MCD code (not a runtime trace): private corpus-query
 * #13, artifact 13134370412, TimeControl.decompiled.cs:28-63,70-87.
 * The instance's shifter producer/POWER state must be supplied by the caller.
 * Do not substitute this for stepTime until SH-05 wires a verified scenario.
 */
export const MCD_SOURCE_TIME_CONSTANTS = Object.freeze({
  minimumTimescale: Math.fround(0.005),
  maximumTimescale: 1,
  powerMaximumTimescale: Math.fround(0.2),
  noOverride: -1,
  initialDelayedUpdates: 2,
});

/** Models the values set by Awake, not proof that any given instance ran Awake. */
export function createMcdSourceTimeState({ fixedTimestepDenominator, powerActive } = {}) {
  if (!Number.isFinite(fixedTimestepDenominator) || fixedTimestepDenominator <= 0) {
    throw new RangeError('fixedTimestepDenominator must be positive and finite');
  }
  if (typeof powerActive !== 'boolean') {
    throw new TypeError('powerActive must be an explicitly supplied boolean');
  }
  return {
    fixedDeltaTime: Math.fround(1 / Math.fround(fixedTimestepDenominator)),
    minimumTimescale: MCD_SOURCE_TIME_CONSTANTS.minimumTimescale,
    maximumTimescale: powerActive
      ? MCD_SOURCE_TIME_CONSTANTS.powerMaximumTimescale
      : MCD_SOURCE_TIME_CONSTANTS.maximumTimescale,
    forcedTimeScale: MCD_SOURCE_TIME_CONSTANTS.noOverride,
    delayedUpdates: MCD_SOURCE_TIME_CONSTANTS.initialDelayedUpdates,
    shifters: [],
  };
}

/**
 * Pure representation of one TimeControl.LateUpdate, without simulating Unity.
 * `shifters` are caller-supplied snapshots of IsTerminated and
 * CurrentTimeModifier, not made-up native producers. On the first two calls,
 * there is no Time.timeScale write and no registry termination sweep.
 * Subsequent calls remove terminated shifters, select the maximum strictly
 * positive modifier, clamp it, then apply any forced override (including 0).
 * The result reports a requested write; it does not execute the original game.
 */
export function advanceMcdSourceTime(state) {
  if (!state || typeof state !== 'object') throw new TypeError('state must be supplied');
  const {
    delayedUpdates, shifters, minimumTimescale, maximumTimescale, forcedTimeScale,
  } = state;
  if (!Number.isInteger(delayedUpdates) || delayedUpdates < 0) {
    throw new RangeError('delayedUpdates must be a nonnegative integer');
  }
  if (!Array.isArray(shifters)) throw new TypeError('shifters must be an array');
  if (typeof forcedTimeScale !== 'number') throw new TypeError('forcedTimeScale must be numeric');
  if (!Number.isFinite(minimumTimescale) || !Number.isFinite(maximumTimescale)
      || minimumTimescale > maximumTimescale) {
    throw new RangeError('invalid timescale bounds');
  }
  if (delayedUpdates > 0) {
    return {
      state: { ...state, delayedUpdates: delayedUpdates - 1 },
      wroteTimeScale: false,
      timeScale: null,
      aggregate: null,
    };
  }
  const survivors = [];
  let aggregate = 0;
  for (const shifter of shifters) {
    if (!shifter || typeof shifter.terminated !== 'boolean'
        || typeof shifter.currentTimeModifier !== 'number') {
      throw new TypeError('shifter must supply terminated and currentTimeModifier');
    }
    if (shifter.terminated) continue;
    survivors.push(shifter);
    // Matches positive-only maximum of the source loop; NaN compares false.
    const modifier = Math.fround(shifter.currentTimeModifier);
    if (modifier > aggregate) aggregate = modifier;
  }
  const clamped = Math.min(maximumTimescale, Math.max(minimumTimescale, aggregate));
  const timeScale = forcedTimeScale !== MCD_SOURCE_TIME_CONSTANTS.noOverride
    ? Math.fround(forcedTimeScale) : clamped;
  return {
    state: { ...state, shifters: survivors, timeScale },
    wroteTimeScale: true,
    timeScale,
    aggregate,
  };
}

/**
 * Source-qualified movement/jump time shifter rates for the delivered MCD
 * PlayerController initialization. PRIVATE provenance: research #94,
 * artifact 13140707485, PlayerController.cs:168-185 (build 20299547).
 * Registration in Awake is proven; execution/active instance is not.
 */
export const MCD_SOURCE_PLAYER_TIME_SHIFTERS = Object.freeze({
  movement: Object.freeze({
    inSmoothing: Math.fround(0.025),
    outSmoothing: Math.fround(0.5),
  }),
  jump: Object.freeze({
    inSmoothing: Math.fround(0.5),
    outSmoothing: Math.fround(0.9),
  }),
});

/**
 * One assignment to AsymmetricSmoothLinearInstantTimeShifter.CurrentTimeModifier.
 * PRIVATE primary evidence: research #92, artifact 13139289153,
 * AsymmetricSmoothLinearInstantTimeShifter.cs:11-40. Unity feeds
 * Time.unscaledDeltaTime; the caller must supply this independently of any
 * scaled/world delta. Rates, current value and target are all explicit.
 *
 * This is the delivered C# float32 setter's arithmetic only. It does NOT
 * advance the registry, model Unity's update scheduler, or prove that the
 * PlayerController instance executed in Containers. Input validation is a
 * WEB API safeguard, not an extra native branch.
 */
export function advanceMcdSourceLinearShifter({
  currentTimeModifier,
  targetTimeModifier,
  inSmoothing,
  outSmoothing,
  unscaledDeltaTime,
} = {}) {
  const supplied = { currentTimeModifier, targetTimeModifier, inSmoothing, outSmoothing, unscaledDeltaTime };
  for (const [name, value] of Object.entries(supplied)) {
    if (!Number.isFinite(value)) throw new RangeError(name + ' must be finite');
  }
  if (unscaledDeltaTime < 0) throw new RangeError('unscaledDeltaTime must be nonnegative');
  let current = Math.fround(currentTimeModifier);
  const target = Math.fround(targetTimeModifier);
  const factor = Math.fround(Math.fround(unscaledDeltaTime) * 60);
  if (target > current) {
    const rise = Math.fround(Math.fround(Math.fround(inSmoothing) * target) * factor);
    current = Math.fround(current + rise);
    if (current > target) current = target;
  } else {
    const fall = Math.fround(Math.fround(outSmoothing) * factor);
    current = Math.fround(current - fall);
    if (current < target) current = target;
  }
  return current;
}

/**
 * Source-qualified pair of targets written by PlayerController.UpdateMovement,
 * PRIVATE research #96, artifact 13140787579, PlayerController.cs:331-394.
 * processedX/Y are values AFTER control-blocking, axis swaps and forced
 * forward input handled by the real PlayerController. This function does NOT
 * reproduce those guards or infer actual keyboard/POWER/grounded state.
 *
 * When canAlterTimescale is false, native code does not call either setter:
 * null means "not written", NEVER reset a stored modifier to zero.
 */
export function mcdSourcePlayerTimeTargets({
  processedX,
  processedY,
  isGrounded,
  cameraDollyMode,
  powerActive,
  canAlterTimescale,
} = {}) {
  if (!Number.isFinite(processedX) || !Number.isFinite(processedY)) {
    throw new RangeError('processed movement axes must be finite');
  }
  for (const [name, value] of Object.entries({ isGrounded, cameraDollyMode, powerActive, canAlterTimescale })) {
    if (typeof value !== 'boolean') throw new TypeError(name + ' must be explicitly supplied');
  }
  if (!canAlterTimescale) {
    return { writes: false, movementTarget: null, jumpTarget: null };
  }
  const magnitude = Math.fround(Math.min(1, Math.hypot(Math.fround(processedX), Math.fround(processedY))));
  const adjusted = cameraDollyMode ? Math.fround(magnitude / 2) : magnitude;
  const power = powerActive ? Math.fround(0.2) : 1;
  return {
    writes: true,
    movementTarget: Math.fround(adjusted * power),
    jumpTarget: isGrounded ? 0 : Math.fround(Math.fround(0.75) * power),
  };
}

/**
 * WEB-ONLY camera recovery tuning, not a delivered MCD constant.
 * The fallback look-time estimator is used by the playable Dojo until the
 * real CameraAngle/world-rotation source can be bound.  A quick turn used to
 * queue many .3-scale measurements and kept time fast long after aiming
 * stopped. Retain at most TWO pending look measurements to keep the initial
 * turn responsive but return to slow motion promptly when the mouse stops.
 *
 * Do not apply this limit to advanceMcdSourceLookTimeshift: that separate
 * source-qualified model intentionally preserves the native buffer semantics.
 */
const WEB_LOOK_BUFFER_CAP = Math.fround(0.6);
// Creative Web sampler: account for a full 60 Hz window in float32 terms.
// A JS 1/60 dt is slightly below Math.fround(1/60), so `>` missed it.
const WEB_LOOK_SAMPLE_SECONDS = Math.fround(1 / 60);
// WEB comfort budget: keep at most one residual camera pulse when two
// 60 Hz windows have elapsed since it was actually delivered. This is
// measured in active wall time, not in rendered frames or native MCD ticks.
const WEB_LOOK_RESIDUAL_MAX_AGE_SECONDS = Math.fround(2 * WEB_LOOK_SAMPLE_SECONDS);
const WEB_LOOK_GAIN = Math.fround(0.03);
export const WEB_LOOK_ANGLE_CAP = WEB_LOOK_BUFFER_CAP / WEB_LOOK_GAIN;

/**
 * Creative Web angle estimate for one *applied* change in yaw/pitch.
 * The same estimate is used for the legacy once-per-frame path and for
 * optional pointer-event path accumulation. It is not a native MCD camera
 * transform. The caller must pass post-clamp pitch, not raw mouse movement.
 *
 * @param {number} fromYaw Current yaw before the movement (radians).
 * @param {number} fromPitch Current pitch before the movement (radians).
 * @param {number} toYaw Resulting yaw after the movement (radians).
 * @param {number} toPitch Resulting pitch after the movement (radians).
 * @returns {number} Estimated angular travel, degrees.
 */
export function webLookDeltaDegrees(fromYaw, fromPitch, toYaw, toPitch) {
  if (![fromYaw, fromPitch, toYaw, toPitch].every(Number.isFinite)) {
    throw new RangeError('Web look angles must be finite');
  }
  const dot = Math.abs(
    Math.cos((toYaw - fromYaw) / 2) * Math.cos((toPitch - fromPitch) / 2),
  );
  const degrees = Math.acos(Math.min(1, dot)) * 360 / Math.PI;
  if (!Number.isFinite(degrees)) throw new RangeError('Web look travel must be finite');
  return degrees;
}

/**
 * Default Containers runtime composition, without POWER/SlomoJump modifiers.
 * PlayerController, CameraLookTimeControl and SimplifiedTimeShifter supply the
 * three source time domains here; collision/Unity callback ordering remain Web.
 */
export function createMcdGameplayClock({ yaw = 0, pitch = 0 } = {}) {
  const source = createMcdSourceTimeState({ fixedTimestepDenominator: 120, powerActive: false });
  source.shifters = Array.from({ length: 3 }, () => ({
    terminated: false, currentTimeModifier: 0,
  }));
  return {
    source, timeScale: 1, aggregate: 0, realTime: 0, worldTime: 0,
    // Web-only: start with the caller's actual view as the comparison anchor.
    // Do not discard the first ten simulation frames after start/replay.
    lookBuffer: 0, lookPendingDegrees: 0, lookMeasuredAt: 0,
    // null until a writable time tick actually receives a look modifier.
    // Preserve flicks accumulated during the source's two startup delays.
    lookLastDeliveredAt: null, lookMode: 'web', yaw, pitch,
  };
}

/** Native pulse durations use world time and expire strictly after the deadline. */
export function addMcdGameplayPulse(clock, duration, amount) {
  if (!Number.isFinite(duration) || duration < 0 || !Number.isFinite(amount) || amount < 0) {
    throw new RangeError('Time pulse duration and amount must be finite and nonnegative');
  }
  clock.source.shifters.push({
    terminated: false, currentTimeModifier: Math.fround(amount),
    expiresAt: clock.worldTime + Math.fround(duration),
  });
}

/**
 * Optional sourceLookSample routes a source-qualified CameraLookTimeControl
 * frame to the actual Web gameplay shifter, without guessing camera binding.
 * This is opt-in: SH-05 must provide persistent source state, the actual
 * WORLD CameraAngle rotation, unscaled timestamp, and all four native gates.
 * PRIVATE provenance research #148 (artifact 13175262864); #162/#163/#174
 * only qualify the initial serialized Dojo hierarchy, not a runtime binding.
 * Without sourceLookSample, the existing Web yaw/pitch preview is unchanged.
 *
 * Optional lookPathDegrees is a WEB-ONLY camera path measured from actual
 * pointer events since the previous frame. It fixes full aim reversals inside
 * one RAF frame that disappear when only the final yaw/pitch are compared.
 * When omitted, the legacy frame-angle estimate remains unchanged.
 * Never combine the two (that would double-count the same rotation).
 *
 * `dt` is capped Web simulation time (movement/physics/worldDelta). The
 * optional `unscaledDt` is actual active browser elapsed time for the source-
 * shaped input shifter rates and Web look-sampling clock. At low FPS, using
 * capped physics dt for both made a 0.5s WASD acceleration take ~1s at 10 FPS.
 * Omission preserves the existing behavior for callers without active wall dt.
 * `pulseExpiryAtFrameStart` is a WEB-only opt-in for bounded low-FPS catch-up:
 * a hit/shot pulse posted between RAFs gets one LateUpdate contribution if
 * live at RAF start, even when the charged collision budget crosses its TTL.
 * Regular/source-shaped ticks still evaluate expiry at frame end.
 * This is a WEB playability fix, NOT a claim about Unity's frame scheduler.
 */
export function stepMcdGameplayClock(clock, {
  dt, unscaledDt = dt, x = 0, y = 0, grounded = true, yaw = clock.yaw, pitch = clock.pitch, paused = false,
  sourceLookSample, lookPathDegrees, pulseExpiryAtFrameStart = false,
}) {
  if (![dt, x, y, yaw, pitch].every(Number.isFinite) || dt < 0) {
    throw new RangeError('Gameplay time input must be finite with nonnegative dt');
  }
  if (!Number.isFinite(unscaledDt) || unscaledDt < 0) {
    throw new RangeError('unscaledDt must be finite and nonnegative');
  }
  if (lookPathDegrees !== undefined &&
      (!Number.isFinite(lookPathDegrees) || lookPathDegrees < 0)) {
    throw new RangeError('lookPathDegrees must be finite and nonnegative');
  }
  if (paused) {
    // WEB comfort behavior, not a native pause/CameraLookTimeControl claim:
    // pointer-lock loss must not replay a buffered flick after resume.
    // Do not advance realTime or the world while interrupted.
    clock.lookPendingDegrees = 0;
    clock.yaw = yaw; clock.pitch = pitch;
    if (clock.lookMode !== 'source') {
      clock.lookBuffer = 0;
      clock.lookMeasuredAt = clock.realTime;
      clock.lookLastDeliveredAt = null;
      clock.source.shifters[2].currentTimeModifier = 0;
      if (clock.source.delayedUpdates === 0) {
        // Snapshot the already-registered non-look contributions without
        // advancing a synthetic LateUpdate: retain movement, jump, pulses
        // and forced override, but drop the stale look-only next-frame scale.
        const projection = advanceMcdSourceTime(clock.source);
        clock.timeScale = projection.timeScale;
        clock.aggregate = projection.aggregate;
      }
    }
    return { worldDelta: 0, appliedTimeScale: 0, timeScale: 0, aggregate: clock.aggregate };
  }
  clock.realTime += unscaledDt;
  // Update consumes the previously applied scale; LateUpdate writes the next.
  const appliedTimeScale = clock.timeScale;
  const worldDelta = Math.fround(Math.fround(dt) * appliedTimeScale);
  const worldTimeAtFrameStart = clock.worldTime;
  clock.worldTime += worldDelta;
  const targets = mcdSourcePlayerTimeTargets({
    processedX: x, processedY: y, isGrounded: grounded,
    cameraDollyMode: false, powerActive: false, canAlterTimescale: true,
  });
  const [movement, jump, look] = clock.source.shifters;
  movement.currentTimeModifier = advanceMcdSourceLinearShifter({
    ...MCD_SOURCE_PLAYER_TIME_SHIFTERS.movement,
    currentTimeModifier: movement.currentTimeModifier,
    targetTimeModifier: targets.movementTarget, unscaledDeltaTime: unscaledDt,
  });
  jump.currentTimeModifier = advanceMcdSourceLinearShifter({
    ...MCD_SOURCE_PLAYER_TIME_SHIFTERS.jump,
    currentTimeModifier: jump.currentTimeModifier,
    targetTimeModifier: targets.jumpTarget, unscaledDeltaTime: unscaledDt,
  });
  let lookSourceResult = null;
  if (sourceLookSample !== undefined) {
    if (sourceLookSample === null || typeof sourceLookSample !== 'object') {
      throw new TypeError('sourceLookSample must provide source state and guards');
    }
    clock.lookMode = 'source';
    // Reuse the original source-model Update: WORLD rotation, explicit gates,
    // warmup, delayed samples and buffered drain. Never invent a source camera.
    lookSourceResult = advanceMcdSourceLookTimeshift(
      sourceLookSample.state, sourceLookSample,
    );
    // The registered shifter retains its current value even on a skipped
    // measurement or a locked source Update (which performs no write).
    look.currentTimeModifier = lookSourceResult.state.currentTimeModifier;
    clock.lookPendingDegrees = 0;
    clock.yaw = yaw; clock.pitch = pitch; // keep the Web-only fallback anchored
  } else {
    clock.lookMode = 'web';
    // Count the path between *simulation* frames, not just the net angle
    // from the last ~60 Hz sample. On 120+ Hz displays a quick aim reversal
    // otherwise cancels out before the next time-shifter measurement.
    // This is a creative WEB-only estimator, never the native quaternion path.
    const degrees = lookPathDegrees === undefined
      ? webLookDeltaDegrees(clock.yaw, clock.pitch, yaw, pitch)
      : lookPathDegrees;
    clock.lookPendingDegrees = Math.min(WEB_LOOK_ANGLE_CAP, clock.lookPendingDegrees + degrees);
    clock.yaw = yaw; clock.pitch = pitch;
    if (Math.fround(clock.realTime - clock.lookMeasuredAt) >= WEB_LOOK_SAMPLE_SECONDS) {
      // The #281 cap is in samples, not seconds. At 10 FPS, its second
      // buffered pulse could otherwise keep the world fast for another
      // 100ms after the player stopped aiming (vs ~17ms at 60 FPS).
      // Do not age out undelivered startup flicks or fresh pointer input.
      if (clock.lookLastDeliveredAt !== null && clock.lookPendingDegrees === 0
          && Math.fround(clock.realTime - clock.lookLastDeliveredAt)
            >= WEB_LOOK_RESIDUAL_MAX_AGE_SECONDS) {
        clock.lookBuffer = 0;
      }
      // Keep the #281 Web anti-linger cap: two short samples maximum.
      clock.lookBuffer = Math.min(
        WEB_LOOK_BUFFER_CAP,
        Math.fround(clock.lookBuffer + Math.fround(clock.lookPendingDegrees * WEB_LOOK_GAIN)),
      );
      clock.lookPendingDegrees = 0;
      look.currentTimeModifier = Math.min(Math.fround(.3), Math.max(0, clock.lookBuffer));
      // Web-only start/replay responsiveness: TimeControl's first two
      // delayed writes cannot apply this look impulse. Keep it pending until
      // the first writable tick instead of consuming a real camera turn
      // invisibly during startup. Source-qualified models are unchanged.
      if (clock.source.delayedUpdates === 0) {
        if (look.currentTimeModifier > 0) clock.lookLastDeliveredAt = clock.realTime;
        clock.lookBuffer = Math.max(0, Math.fround(clock.lookBuffer - look.currentTimeModifier));
      }
      clock.lookMeasuredAt = clock.realTime;
    }
  }
  for (const pulse of clock.source.shifters) {
    if (pulse.expiresAt === undefined) continue;
    // WEB-only startup protection: a source-delayed LateUpdate cannot
    // consume a just-added shot pulse. Retain an eligible pulse until the
    // first writable tick, even when low FPS crosses its world-time TTL.
    // The default source-shaped expiry path remains untouched.
    if (pulseExpiryAtFrameStart && clock.source.delayedUpdates > 0
        && worldTimeAtFrameStart <= pulse.expiresAt) {
      pulse.webDeferredFirstWrite = true;
    }
    if (pulseExpiryAtFrameStart && pulse.webDeferredFirstWrite) {
      pulse.terminated = false;
      if (clock.source.delayedUpdates === 0) delete pulse.webDeferredFirstWrite;
    } else {
      pulse.terminated =
        (pulseExpiryAtFrameStart ? worldTimeAtFrameStart : clock.worldTime) > pulse.expiresAt;
    }
  }
  const next = advanceMcdSourceTime(clock.source);
  clock.source = next.state;
  if (next.wroteTimeScale) {
    clock.timeScale = next.timeScale;
    clock.aggregate = next.aggregate;
  }
  return {
    worldDelta, appliedTimeScale, timeScale: clock.timeScale, aggregate: clock.aggregate,
    ...(sourceLookSample === undefined ? {} : { lookSourceResult }),
  };
}

/**
 * Source-qualified pre-constraint player displacement, not full movement or
 * a claim that this PlayerController is active in Containers.
 *
 * PROUVÉ as delivered code (not observed gameplay): private research #101,
 * artifact 13141298923, PlayerController.cs:452 (Steam MCD 20299547).
 * Quaternion is the caller-supplied Unity direction.rotation (x,y,z,w),
 * velocity is the caller-supplied pre-constraint velocity in Unity units,
 * scaledDeltaTime is caller-supplied Unity Time.deltaTime in seconds.
 * The native method later modifies this delta for optional lock/offset then
 * calls CharacterController.Move; collisions and those guards are NOT here.
 * No inference from TimeControl.LateUpdate's latest write to the dt of the
 * same UpdateMovement invocation is allowed without an execution trace.
 * The quaternion-vector operation is a mathematical JS approximation, not
 * a bit-exact simulation of the original Unity float32 implementation.
 */
export function mcdSourcePlayerPreConstraintMove({
  velocity,
  directionRotation,
  scaledDeltaTime,
} = {}) {
  if (!velocity || !directionRotation) {
    throw new TypeError('explicit velocity and directionRotation required');
  }
  if (!Number.isFinite(scaledDeltaTime) || scaledDeltaTime < 0) {
    throw new RangeError('scaledDeltaTime must be finite and nonnegative');
  }
  const { x: vx, y: vy, z: vz } = velocity;
  const { x: qx, y: qy, z: qz, w: qw } = directionRotation;
  if (![vx, vy, vz, qx, qy, qz, qw].every(Number.isFinite)) {
    throw new RangeError('velocity and directionRotation components must be finite');
  }
  // For an authentic Unity rotation quaternion, q*v*q^-1 applies its
  // pre-existing local-space direction without inventing a camera yaw.
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  const x = (vx + qw * tx + qy * tz - qz * ty) * scaledDeltaTime;
  const y = (vy + qw * ty + qz * tx - qx * tz) * scaledDeltaTime;
  const z = (vz + qw * tz + qx * ty - qy * tx) * scaledDeltaTime;
  if (![x, y, z].every(Number.isFinite)) {
    throw new RangeError('pre-constraint displacement must be finite');
  }
  return { x, y, z };
}

/**
 * Opt-in pure model of MCD CameraLookTimeControl's look-time shifter.
 * PROUVÉ in delivered source, NOT observed in a Containers native frame:
 * private research #148, artifact 13175262864, MCD build 20299547,
 * managed/Assembly-CSharp/CameraLookTimeControl.cs:13,20-21,29-34,41-79,
 * source SHA256 7e3d0bc64fc111a11b46643e2773c213051bd0c9a6fb4f71f85da42a170067d1.
 * CameraAngle is a WORLD-space Transform quaternion, not DOM mouse pixels or
 * necessarily yaw/pitch. Binding in CameraManager.Awake is source-qualified
 * (#142) but execution and actual guards are UNKNOWN in Containers.
 * No Unity lifecycle, input device, world timing or actor is invented here.
 */
const MCD_SOURCE_LOOK_SENSITIVITY = Math.fround(0.03);
const MCD_SOURCE_LOOK_CAP = Math.fround(0.3);
const MCD_SOURCE_LOOK_MEASURE_INTERVAL = Math.fround(1 / 60);

const sourceWorldQuaternion = (rotation) => {
  if (!rotation || ![rotation.x, rotation.y, rotation.z, rotation.w].every(Number.isFinite)) {
    throw new TypeError('explicit finite world quaternion required');
  }
  return { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w };
};

/** Starting this model means CameraLookTimeControl.Start has been invoked. */
export function createMcdSourceLookTimeshiftState({ cameraWorldRotation, currentTimeModifier } = {}) {
  // Start receives a shifter from TimeControl; its initial modifier is NOT
  // established by CameraLookTimeControl.cs, so the caller must supply it.
  if (!Number.isFinite(currentTimeModifier)) {
    throw new TypeError('initial shifter modifier must be explicitly supplied');
  }
  return {
    previousWorldRotation: sourceWorldQuaternion(cameraWorldRotation),
    warmupUpdatesRemaining: 10,
    lastTimeMeasuredDeltaA: 0,
    rotationAccumulated: 0,
    timeShiftBuffer: 0,
    currentTimeModifier,
  };
}

/** Source ResetRotationAccumulated only resets the sum and previous angle. */
export function resetMcdSourceLookRotationAccumulated(state, cameraWorldRotation) {
  if (!state || typeof state !== 'object') throw new TypeError('look state required');
  return {
    ...state,
    previousWorldRotation: sourceWorldQuaternion(cameraWorldRotation),
    rotationAccumulated: 0,
  };
}

const sourceQuaternionAngleDegrees = (a, b) => {
  const dot = Math.abs(
    Math.fround(Math.fround(a.x * b.x) + Math.fround(a.y * b.y)
      + Math.fround(a.z * b.z) + Math.fround(a.w * b.w)),
  );
  return Math.fround(Math.acos(Math.min(1, dot)) * (360 / Math.PI));
};

/**
 * One source Update, not one requestAnimationFrame or input tick. The explicit
 * Wydmuszka, weapon and debug gates are inputs, not guessed Web defaults.
 * A successful measurement with lock=true still adds to the buffer but does
 * not update CurrentTimeModifier. A later zero-angle measurement may drain it.
 * Float32 arithmetic is approximated; exact Unity rounding remains UNKNOWN.
 */
export function advanceMcdSourceLookTimeshift(state, {
  unscaledTime,
  cameraWorldRotation,
  wydmuszkaMode,
  activeWeaponIsTakedown,
  takedownCanUseTimeshifts,
  lockLookShifter,
} = {}) {
  if (!state || typeof state !== 'object' || !Number.isInteger(state.warmupUpdatesRemaining)
      || state.warmupUpdatesRemaining < 0 || ![state.lastTimeMeasuredDeltaA,
        state.rotationAccumulated, state.timeShiftBuffer, state.currentTimeModifier].every(Number.isFinite)) {
    throw new TypeError('valid source look state required');
  }
  sourceWorldQuaternion(state.previousWorldRotation);
  if (!Number.isFinite(unscaledTime) || unscaledTime < 0) {
    throw new RangeError('unscaledTime must be finite nonnegative seconds');
  }
  for (const [name, value] of Object.entries({ wydmuszkaMode,
    activeWeaponIsTakedown, takedownCanUseTimeshifts, lockLookShifter })) {
    if (typeof value !== 'boolean') throw new TypeError(`${name} must be explicit boolean`);
  }
  const rotation = sourceWorldQuaternion(cameraWorldRotation);
  if (wydmuszkaMode) {
    return { state: { ...state, previousWorldRotation: { ...state.previousWorldRotation } },
      measured: false, wroteModifier: false, deltaAngleDegrees: null };
  }
  const next = { ...state, previousWorldRotation: { ...state.previousWorldRotation } };
  if (next.warmupUpdatesRemaining > 0) {
    next.previousWorldRotation = rotation;
    next.warmupUpdatesRemaining--;
  }
  // Source uses strict > on Time.unscaledTime, independent of Time.timeScale.
  if (!(Math.fround(unscaledTime) > Math.fround(
    Math.fround(next.lastTimeMeasuredDeltaA) + MCD_SOURCE_LOOK_MEASURE_INTERVAL))) {
    return { state: next, measured: false, wroteModifier: false, deltaAngleDegrees: null };
  }
  let delta = sourceQuaternionAngleDegrees(rotation, next.previousWorldRotation);
  if (activeWeaponIsTakedown && !takedownCanUseTimeshifts) delta = 0;
  next.previousWorldRotation = rotation;
  next.rotationAccumulated = Math.fround(next.rotationAccumulated + delta);
  next.lastTimeMeasuredDeltaA = Math.fround(unscaledTime);
  next.timeShiftBuffer = Math.fround(next.timeShiftBuffer
    + Math.fround(delta * MCD_SOURCE_LOOK_SENSITIVITY));
  if (lockLookShifter) {
    return { state: next, measured: true, wroteModifier: false, deltaAngleDegrees: delta };
  }
  const amount = Math.min(MCD_SOURCE_LOOK_CAP, Math.max(0, next.timeShiftBuffer));
  next.timeShiftBuffer = Math.fround(next.timeShiftBuffer - amount);
  if (next.timeShiftBuffer < 0) next.timeShiftBuffer = 0;
  next.currentTimeModifier = amount;
  return { state: next, measured: true, wroteModifier: true, deltaAngleDegrees: delta };
}

/**
 * Scene-identity gate for the source-serialized TimeControl timestep.
 *
 * PROVED SERIALIZED, NOT EXECUTED (Steam MCD build 20299547):
 * - Containers/level28: research #38, artifact 13134630168,
 *   level28:TimeControl18679 fixedTimestepDenominator=120.
 * - Dojo/level10: research #162, artifact 13187615600,
 *   level10:TimeControl6430 (GO83 _Omni, enabled) denominator=120;
 *   GO83's serialized active flag was checked separately in research #163.
 * - TimeControl.Awake's conditional fixed-step assignment is research #13,
 *   artifact 13134370412, decompiled/TimeControl.decompiled.cs:30-46.
 *
 * Both scene tuples qualify the SERIALIZED denominator only. An Awake
 * execution, later runtime writes, Unity fixed-tick schedule and effective
 * shifter/Animator time domains remain UNKNOWN. In particular, creating the
 * EXISTING Web clock below does NOT certify native gameplay time parity.
 * SH-05 exclusively owns runtime selection and fallback in src/main.js.
 */
export const MCD_CONTAINERS_SERIALIZED_TIME_SCENE = Object.freeze({
  sceneBuildIndex: 28,
  scenePath: 'Assets/Scenes/SHRL/SHRL_ContainerPort/SHRL_ContainerPort.unity',
  serializedOwner: 'level28',
});

export const MCD_DOJO_SERIALIZED_TIME_SCENE = Object.freeze({
  sceneBuildIndex: 10,
  scenePath: 'Assets/Scenes/SHRL/SHRL_Dojo2/SHRL_Dojo2.unity',
  serializedOwner: 'level10',
});

const matchesSerializedTimeScene = (candidate, known) => candidate != null
  && typeof candidate === 'object'
  && candidate.sceneBuildIndex === known.sceneBuildIndex
  && candidate.scenePath === known.scenePath
  && candidate.serializedOwner === known.serializedOwner;

export function qualifyMcdGameplayClockScene(sceneSource) {
  const containers = matchesSerializedTimeScene(sceneSource, MCD_CONTAINERS_SERIALIZED_TIME_SCENE);
  const dojo = matchesSerializedTimeScene(sceneSource, MCD_DOJO_SERIALIZED_TIME_SCENE);
  const sourceQualified = containers || dojo;
  return Object.freeze({
    status: containers
      ? 'CONTAINERS_SERIALIZED_TIME_PROFILE_ONLY'
      : dojo
        ? 'DOJO_SERIALIZED_TIME_PROFILE_ONLY'
        : 'NATIVE_SCENE_TIME_UNKNOWN',
    sourceQualified,
    fixedTimestepDenominator: sourceQualified ? 120 : null,
    nativeRuntimeObserved: false,
  });
}

/**
 * Reuse the existing WEB gameplay clock only when the source scene tuple has
 * a primary serialized 120 denominator. This is an opt-in WEB model, not a
 * reconstruction of Unity's executed fixed-step or animation scheduler.
 * Dojo remains playable if SH-05 keeps the existing runtime connection;
 * no scene is automatically switched by this pure factory.
 *
 * Unknown, missing or cross-scene metadata returns null, never a silently
 * borrowed Containers denominator.
 */
export function createSceneQualifiedMcdGameplayClock({ sceneSource, yaw = 0, pitch = 0 } = {}) {
  const qualification = qualifyMcdGameplayClockScene(sceneSource);
  return Object.freeze({
    qualification,
    clock: qualification.sourceQualified ? createMcdGameplayClock({ yaw, pitch }) : null,
  });
}

/**
 * WEB-ONLY clock-consistent Dojo catch-up scheduler for SH-05 integration.
 *
 * The legacy slice helper above is post-clock and CANNOT safely be connected
 * on its own: it can advance actor movement more than clock.worldTime. This
 * adapter runs the existing MCD-shaped WEB clock exactly ONCE with the bounded
 * amount of active time that will actually be simulated, then partitions that
 * SAME worldDelta into short collision/world steps. Thus:
 *   sum(worldSteps) === tick.worldDelta === clock.worldTime increment
 * for a live frame, up to floating-point accumulation. worldStepOffsets are
 * cumulative world-time offsets FROM THIS FRAME'S START for TTL checks during
 * each collision slice; never use the final frame time for every slice.
 *
 * This is a WEB feel correction for the 50ms capped frame-time at low FPS,
 * NOT a recovered Unity fixed-step scheduler. maximumSteps is an explicit
 * Web performance budget, not an inferred MCD constant.
 * Input pulses already present at RAF start retain one Web LateUpdate
 * contribution across a long catch-up tick; no native TTL cadence is inferred. SH-05 must arrange
 * input edges and active-time effects once/RAF, with world systems sharing
 * the slices; the ragdoll bridge ALREADY compensates capped frame time and
 * must never be compensated a second time.
 *
 * @param {ReturnType<typeof createMcdGameplayClock>} clock Mutable Web clock.
 * @param {{simulationDt:number,activeRealDt:number,maximumSteps:number,
 *   paused?:boolean,x?:number,y?:number,grounded?:boolean,yaw?:number,
 *   pitch?:number,lookPathDegrees?:number}} frame
 * @returns {{worldSteps:number[],worldStepOffsets:number[],
 *   simulationStepDeltas:number[],unscaledStepDeltas:number[],unscaledFrameDelta:number,
 *   chargedActiveDt:number,discardedActiveDt:number,worldDelta:number,appliedTimeScale:number,
 *   timeScale:number,aggregate:number}}
 */
export function stepWebMcdGameplayFrame(clock, {
  simulationDt, activeRealDt, maximumSteps, paused = false, ...clockInputs
} = {}) {
  for (const [label, value] of Object.entries({simulationDt, activeRealDt})) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`${label} must be finite and nonnegative`);
    }
  }
  // A collision-sized slice must retain the existing Web 50ms upper bound.
  // Charged active time MAY exceed this per RAF, but each slice must not.
  if (simulationDt > PROTOTYPE_FRAME_RULES.maximumDeltaSeconds) {
    throw new RangeError('simulationDt exceeds the maximum collision step');
  }
  if (activeRealDt < simulationDt) {
    throw new RangeError('activeRealDt must cover simulationDt');
  }
  if (!Number.isSafeInteger(maximumSteps) || maximumSteps < 1 || maximumSteps > 16) {
    throw new RangeError('maximumSteps must be an integer from 1 to 16');
  }
  if (typeof paused !== 'boolean') throw new TypeError('paused must be boolean');

  // No accumulated debt: a very long hitch can discard excess world time,
  // while the clock's unscaled input/aim shifters still see actual active dt.
  const chargedActiveDt = paused ? 0 : Math.min(activeRealDt, simulationDt * maximumSteps);
  const tick = stepMcdGameplayClock(clock, {
    ...clockInputs, dt: chargedActiveDt, unscaledDt: paused ? 0 : activeRealDt, paused,
    pulseExpiryAtFrameStart: true,
  });
  const worldSteps = [];
  const worldStepOffsets = [];
  // Dojo caller currently passes unscaledDeltaTime: activeRealDt to both the
  // encounter and enemy attack systems. When a future SH-05 hookup iterates
  // worldSteps, repeating the FULL frame's activeRealDt for every slice would
  // multiply these real-time timers. Keep the two independent domains explicit:
  // simulationStepDeltas sum to chargedActiveDt (movement/damping budget),
  // unscaledStepDeltas sum to activeRealDt (one RAF's active elapsed time).
  // A frame-scoped discontinuity guard MUST inspect the unsplit RAF delta.
  // In #567 the Dojo encounter resets stationary sight on >0.25s real hitches.
  // A .8s hitch sliced into 4 x .2s otherwise looks like uninterrupted LOS
  // and charges a fake continuous observation. Do not reuse this FULL delta
  // as a per-slice timer increment: unscaledStepDeltas owns that partition.
  // Both rules are WEB-original, not MCD frame-scheduler evidence.
  const unscaledFrameDelta = paused ? 0 : activeRealDt;
  const simulationStepDeltas = [];
  const unscaledStepDeltas = [];
  if (chargedActiveDt > 0 && tick.worldDelta > 0) {
    // The Web clock rounds its charged dt to float32. At an exact 50ms RAF
    // boundary, a double-precision timestamp difference can exceed 50ms by
    // mere picoseconds; ceil(double ratio) then invents a near-zero second
    // collision slice and repeats collision/AI work. Round the ratio to the
    // same float32 precision as the tick before counting its collision slices.
    // This is numeric scheduler hygiene, not a new MCD cadence constant.
    const count = Math.min(maximumSteps, Math.ceil(Math.fround(chargedActiveDt / simulationDt)));
    let previousActive = 0;
    let previousWorld = 0;
    let previousUnscaled = 0;
    for (let i = 0; i < count; i++) {
      const nextActive = Math.min(chargedActiveDt, (i + 1) * simulationDt);
      const simulationStep = nextActive - previousActive;
      const nextUnscaled = i === count - 1
        ? activeRealDt : activeRealDt * (nextActive / chargedActiveDt);
      const unscaledStep = nextUnscaled - previousUnscaled;
      if (!Number.isFinite(unscaledStep) || unscaledStep < 0) {
        throw new RangeError('invalid unscaled slice');
      }
      simulationStepDeltas.push(simulationStep);
      unscaledStepDeltas.push(unscaledStep);
      previousUnscaled = nextUnscaled;
      const step = i === count - 1
        ? tick.worldDelta - previousWorld
        : tick.worldDelta * ((nextActive - previousActive) / chargedActiveDt);
      if (!Number.isFinite(step) || step < 0) throw new RangeError('invalid world slice');
      worldSteps.push(step);
      previousActive = nextActive;
      previousWorld += step;
      // Last boundary uses the exact tick delta, avoiding accumulated drift.
      worldStepOffsets.push(i === count - 1 ? tick.worldDelta : previousWorld);
    }
  }
  return {
    ...tick, worldSteps, worldStepOffsets, simulationStepDeltas,
    unscaledStepDeltas, unscaledFrameDelta, chargedActiveDt,
    discardedActiveDt: Math.max(0, activeRealDt - chargedActiveDt),
  };
}
