/**
 * Animation timeline primitives independent of the browser and Unity runtime.
 * This is an integration scaffold, NOT a recovered MCD animation contract.
 */
const requireFinite = (value, name) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
};

/**
 * Advance a clip clock in seconds. A looping clip has time in [0, duration).
 * `wraps` counts every crossed loop boundary, including exact boundaries.
 * No mutation; no assumptions about native Unity Animator state machines.
 */
export function advanceClipClock(clock, dt) {
  if (clock === null || typeof clock !== 'object') throw new TypeError('clock must be an object');
  const { time = 0, duration, rate = 1, loop = false, paused = false } = clock;
  for (const [name, value] of [['time', time], ['duration', duration], ['rate', rate], ['dt', dt]]) {
    requireFinite(value, name);
  }
  if (duration <= 0) throw new RangeError('duration must be positive');
  if (rate < 0 || dt < 0) throw new RangeError('rate and dt must be non-negative');
  if (typeof loop !== 'boolean' || typeof paused !== 'boolean') {
    throw new TypeError('loop and paused must be booleans');
  }
  if (time < 0 || time > duration || (loop && time === duration)) {
    throw new RangeError('time is outside the clip interval');
  }
  const travel = paused ? 0 : dt * rate;
  const total = time + travel;
  if (!Number.isFinite(total)) throw new RangeError('advanced clip time overflows');
  if (loop) {
    const wraps = Math.floor(total / duration);
    if (!Number.isSafeInteger(wraps)) throw new RangeError('loop count exceeds safe integer range');
    return { time: total % duration, wraps, finished: false };
  }
  const nextTime = Math.min(duration, total);
  return { time: nextTime, wraps: 0, finished: nextTime === duration };
}

/**
 * Sample a caller-authored numeric track by piecewise linear interpolation.
 * This deliberately does not attempt to emulate Unity AnimationCurves.
 */
export function sampleLinearScalar(keyframes, time) {
  requireFinite(time, 'time');
  if (!Array.isArray(keyframes) || keyframes.length === 0) {
    throw new RangeError('keyframes must be a non-empty array');
  }
  for (let i = 0; i < keyframes.length; i++) {
    const key = keyframes[i];
    if (!key || typeof key !== 'object') throw new TypeError('keyframe must be an object');
    requireFinite(key.time, `keyframes[${i}].time`);
    requireFinite(key.value, `keyframes[${i}].value`);
    if (i && key.time <= keyframes[i - 1].time) {
      throw new RangeError('keyframe times must be strictly increasing');
    }
  }
  if (time <= keyframes[0].time) return keyframes[0].value;
  const last = keyframes[keyframes.length - 1];
  if (time >= last.time) return last.value;
  let low = 0, high = keyframes.length - 1;
  while (high - low > 1) {
    const mid = Math.floor((high + low) / 2);
    if (keyframes[mid].time <= time) low = mid;
    else high = mid;
  }
  const left = keyframes[low], right = keyframes[high];
  // Stay finite when two valid extreme timestamps span more than Number.MAX_VALUE.
  // This is numerical robustness for our Web scaffold, not a Unity curve rule.
  const span = right.time - left.time;
  const fraction = Number.isFinite(span)
    ? (time - left.time) / span
    : (time / 2 - left.time / 2) / (right.time / 2 - left.time / 2);
  // Avoid overflowing the difference between opposite-sign finite values.
  return (1 - fraction) * left.value + fraction * right.value;
}
