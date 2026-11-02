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
    lookBuffer: 0, lookMeasuredAt: 0, lookWarmup: 10, yaw, pitch,
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

export function stepMcdGameplayClock(clock, {
  dt, x = 0, y = 0, grounded = true, yaw = clock.yaw, pitch = clock.pitch, paused = false,
}) {
  if (![dt, x, y, yaw, pitch].every(Number.isFinite) || dt < 0) {
    throw new RangeError('Gameplay time input must be finite with nonnegative dt');
  }
  clock.realTime += dt;
  if (paused) {
    clock.yaw = yaw; clock.pitch = pitch;
    return { worldDelta: 0, timeScale: 0, aggregate: clock.aggregate };
  }
  // Update consumes the previously applied scale; LateUpdate writes the next.
  const worldDelta = Math.fround(Math.fround(dt) * clock.timeScale);
  clock.worldTime += worldDelta;
  const targets = mcdSourcePlayerTimeTargets({
    processedX: x, processedY: y, isGrounded: grounded,
    cameraDollyMode: false, powerActive: false, canAlterTimescale: true,
  });
  const [movement, jump, look] = clock.source.shifters;
  movement.currentTimeModifier = advanceMcdSourceLinearShifter({
    ...MCD_SOURCE_PLAYER_TIME_SHIFTERS.movement,
    currentTimeModifier: movement.currentTimeModifier,
    targetTimeModifier: targets.movementTarget, unscaledDeltaTime: dt,
  });
  jump.currentTimeModifier = advanceMcdSourceLinearShifter({
    ...MCD_SOURCE_PLAYER_TIME_SHIFTERS.jump,
    currentTimeModifier: jump.currentTimeModifier,
    targetTimeModifier: targets.jumpTarget, unscaledDeltaTime: dt,
  });
  if (clock.lookWarmup > 0) {
    clock.yaw = yaw; clock.pitch = pitch; clock.lookWarmup--;
  }
  if (clock.realTime > clock.lookMeasuredAt + Math.fround(1 / 60)) {
    // Quaternion.Angle for the yaw/pitch camera, not raw mouse-pixel distance.
    const dot = Math.abs(Math.cos((yaw - clock.yaw) / 2) * Math.cos((pitch - clock.pitch) / 2));
    const degrees = Math.acos(Math.min(1, dot)) * 360 / Math.PI;
    clock.lookBuffer = Math.fround(clock.lookBuffer + Math.fround(degrees * Math.fround(.03)));
    look.currentTimeModifier = Math.min(Math.fround(.3), Math.max(0, clock.lookBuffer));
    clock.lookBuffer = Math.max(0, Math.fround(clock.lookBuffer - look.currentTimeModifier));
    clock.yaw = yaw; clock.pitch = pitch; clock.lookMeasuredAt = clock.realTime;
  }
  for (const pulse of clock.source.shifters) {
    if (pulse.expiresAt !== undefined) pulse.terminated = clock.worldTime > pulse.expiresAt;
  }
  const next = advanceMcdSourceTime(clock.source);
  clock.source = next.state;
  if (next.wroteTimeScale) {
    clock.timeScale = next.timeScale;
    clock.aggregate = next.aggregate;
  }
  return { worldDelta, timeScale: clock.timeScale, aggregate: clock.aggregate };
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
export function createMcdSourceLookTimeshiftState({ cameraWorldRotation } = {}) {
  return {
    previousWorldRotation: sourceWorldQuaternion(cameraWorldRotation),
    warmupUpdatesRemaining: 10,
    lastTimeMeasuredDeltaA: 0,
    rotationAccumulated: 0,
    timeShiftBuffer: 0,
    currentTimeModifier: 0,
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
