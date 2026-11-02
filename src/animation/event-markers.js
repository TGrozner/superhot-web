/**
 * Source-neutral animation marker traversal. Markers are caller-authored data:
 * this is NOT a reconstruction of Unity AnimationEvents or MCD transitions.
 * No DOM, global clock, scene state, or sound output is used here.
 */
import { advanceClipClock } from './clip-clock.js';

const MAX_OCCURRENCES = 4096;

/**
 * Return marker crossings in (previous clip time, next clip time].
 * A marker at 0 fires only when a looping clip wraps, not on initial time 0.
 * For a non-looping clip, a marker at duration fires once on reaching its end.
 * A looping clip must use marker times in [0, duration).
 *
 * Each occurrence contains the marker's source-array index, caller-authored id,
 * clip-local time, zero-based completed-loop index, and elapsed caller time.
 * This deliberately imposes no Unity ordering or blending semantics.
 */
export function advanceAnimationMarkers(clock, dt, markers, { maxOccurrences = MAX_OCCURRENCES } = {}) {
  // Advance and traverse the same validated clock values. Mutable getters
  // must not change the rate or duration halfway through one operation.
  if (clock === null || typeof clock !== 'object') throw new TypeError('clock must be an object');
  const clockSnapshot = {
    time: clock.time, duration: clock.duration, rate: clock.rate,
    loop: clock.loop, paused: clock.paused,
  };
  const next = advanceClipClock(clockSnapshot, dt);
  if (!Array.isArray(markers)) throw new TypeError('markers must be an array');
  if (!Number.isSafeInteger(maxOccurrences) || maxOccurrences < 1 || maxOccurrences > MAX_OCCURRENCES) {
    throw new RangeError(`maxOccurrences must be an integer from 1 to ${MAX_OCCURRENCES}`);
  }

  const { duration, time: start = 0, rate = 1, paused = false, loop = false } = clockSnapshot;
  const snapshots = [];
  for (const [index, marker] of markers.entries()) {
    if (!marker || typeof marker !== 'object') {
      throw new TypeError(`markers[${index}] must have a non-empty string id`);
    }
    const id = marker.id;
    const time = marker.time;
    if (typeof id !== 'string' || id.length === 0) {
      throw new TypeError(`markers[${index}] must have a non-empty string id`);
    }
    if (typeof time !== 'number' || !Number.isFinite(time)) {
      throw new TypeError(`markers[${index}].time must be finite`);
    }
    if (time < 0 || (loop ? time >= duration : time > duration)) {
      throw new RangeError(`markers[${index}].time is outside the clip`);
    }
    snapshots.push({ index, id, time });
  }
  if (paused || rate === 0 || dt === 0 || snapshots.length === 0) {
    return { ...next, events: [] };
  }

  const end = loop ? start + dt * rate : next.time;
  const events = [];
  for (const { index, id, time } of snapshots) {
    if (!loop) {
      if (time > start && time <= end) {
        events.push({ id, index, time, cycle: 0,
          elapsedSeconds: (time - start) / rate });
      }
      continue;
    }

    // A clip-local marker repeats every `duration` seconds. Enforce an explicit
    // bound rather than silently losing markers if a frame skips many loops.
    const first = Math.max(0, Math.floor((start - time) / duration) + 1);
    const last = Math.floor((end - time) / duration);
    const count = Math.max(0, last - first + 1);
    if (!Number.isSafeInteger(count) || count > maxOccurrences - events.length) {
      throw new RangeError('animation marker occurrence limit exceeded');
    }
    for (let cycle = first; cycle <= last; cycle++) {
      const at = time + cycle * duration;
      events.push({ id, index, time, cycle,
        elapsedSeconds: (at - start) / rate });
    }
  }
  if (events.length > maxOccurrences) throw new RangeError('animation marker occurrence limit exceeded');
  events.sort((a, b) => a.elapsedSeconds - b.elapsedSeconds || a.index - b.index);
  return { ...next, events };
}
