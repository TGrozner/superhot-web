/**
 * Bounded reconstruction of MCD UnityPlayer AnimationClip::FireAnimationEvents
 * interval membership for an already prepared, non-looping clip interval.
 * Native evidence: UnityPlayer.dll SHA-256 bf707463...b25e29290,
 * spec/animation/closure/native-events-contract.md:24-37 (private).
 *
 * NOT a graph evaluator: event weight, first activation, loops, clip offsets,
 * culling, receiver dispatch and actual play state are intentionally external.
 * This function never invokes callbacks or assumes an event was audible/visible.
 */
const finite = (value, name) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(name + ' must be a finite number');
  }
};

/**
 * Events must be pre-sorted by ascending clip time.
 * Forward: lastTime < eventTime <= currentTime.
 * Reverse: currentTime <= eventTime < lastTime, scanned in reverse order.
 * Equal times: no scan. No modulo/weight/activation adjustments are inferred.
 */
export function scanNativeEventInterval(events, lastTime, currentTime) {
  finite(lastTime, 'lastTime');
  finite(currentTime, 'currentTime');
  if (!Array.isArray(events)) throw new TypeError('events must be an array');
  // Snapshot a prepared event table once before traversal.
  const entries = events.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new TypeError('events[' + index + '] must be an event object');
    }
    const id = item.id;
    const time = item.time;
    if (typeof id !== 'string' || id.length === 0) {
      throw new TypeError('events[' + index + '].id must be a nonempty string');
    }
    finite(time, 'events[' + index + '].time');
    return { id, time, index };
  });
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].time < entries[i - 1].time) {
      throw new RangeError('events must be sorted by ascending time');
    }
  }
  if (currentTime === lastTime) return [];
  if (currentTime > lastTime) {
    return entries.filter((event) => lastTime < event.time && event.time <= currentTime);
  }
  return entries.reverse().filter((event) => currentTime <= event.time && event.time < lastTime);
}
