/** Unweighted Unity AnimationCurve keys; source data is supplied privately. */
export function sampleMcdCurve(keys, time) {
  if (!Array.isArray(keys) || !keys.length || !Number.isFinite(time)) {
    throw new TypeError('finite time and nonempty curve required');
  }
  if (time <= keys[0].time) return keys[0].value;
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i];
    if (time > b.time) continue;
    const a = keys[i - 1];
    if (a.weightedMode || b.weightedMode) throw new TypeError('weighted curve not supported');
    const dt = b.time - a.time;
    if (!(dt > 0)) throw new RangeError('curve times must increase');
    if (!Number.isFinite(a.outSlope) || !Number.isFinite(b.inSlope)) return a.value;
    const t = (time - a.time) / dt, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * a.value + (t3 - 2 * t2 + t) * dt * a.outSlope
      + (-2 * t3 + 3 * t2) * b.value + (t3 - t2) * dt * b.inSlope;
  }
  return keys[keys.length - 1].value;
}
