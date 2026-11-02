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
  const next = advanceClipClock(clock, dt);
  if (!Array.isArray(markers)) throw new TypeError('markers must be an array');
  if (!Number.isSafeInteger(maxOccurrences) || maxOccurrences < 1 || maxOccurrences > MAX_OCCURRENCES) {
    throw new RangeError(`maxOccurrences must be an integer from 1 to ${MAX_OCCURRENCES}`);
  }

  const { duration, time: start = 0, rate = 1, paused = false, loop = false } = clock;
  for (const [index, marker] of markers.entries()) {
    if (!marker || typeof marker !== 'object' ||
      typeof marker.id !== 'string' || marker.id.length === 0) {
      throw new TypeError(`markers[${index}] must have a non-empty string id`);
    }
    if (typeof marker.time !== 'number' || !Number.isFinite(marker.time)) {
      throw new TypeError(`markers[${index}].time must be finite`);
    }
    if (marker.time < 0 || (loop ? marker.time >= duration : marker.time > duration)) {
      throw new RangeError(`markers[${index}].time is outside the clip`);
    }
  }
  if (paused || rate === 0 || dt === 0 || markers.length === 0) {
    return { ...next, events: [] };
  }

  const end = loop ? start + dt * rate : next.time;
  const events = [];
  for (const [index, marker] of markers.entries()) {
    if (!loop) {
      if (marker.time > start && marker.time <= end) {
        events.push({ id: marker.id, index, time: marker.time, cycle: 0,
          elapsedSeconds: (marker.time - start) / rate });
      }
      continue;
    }

    // A clip-local marker repeats every `duration` seconds. Enforce an explicit
    // bound rather than silently losing markers if a frame skips many loops.
    const first = Math.max(0, Math.floor((start - marker.time) / duration) + 1);
    const last = Math.floor((end - marker.time) / duration);
    const count = Math.max(0, last - first + 1);
    if (!Number.isSafeInteger(count) || count > maxOccurrences - events.length) {
      throw new RangeError('animation marker occurrence limit exceeded');
    }
    for (let cycle = first; cycle <= last; cycle++) {
      const at = marker.time + cycle * duration;
      events.push({ id: marker.id, index, time: marker.time, cycle,
        elapsedSeconds: (at - start) / rate });
    }
  }
  if (events.length > maxOccurrences) throw new RangeError('animation marker occurrence limit exceeded');
  events.sort((a, b) => a.elapsedSeconds - b.elapsedSeconds || a.index - b.index);
  return { ...next, events };
}
