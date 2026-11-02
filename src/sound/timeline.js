/**
 * Deterministic event timeline for the independent Web prototype.
 *
 * This module does not implement or claim native SUPERHOT: MIND CONTROL DELETE
 * audio timing. All clock choices must be supplied by the caller and validated
 * against private-corpus evidence before a native-parity claim is possible.
 */
import { snapshotSoundParams } from './params.js';

export const SOUND_CLOCKS = Object.freeze({ REAL: 'real', WORLD: 'world' });
export const SOUND_EVIDENCE = Object.freeze({
  PROTOTYPE: 'prototype',
  UNVERIFIED: 'unverified',
  NATIVE_OBSERVED: 'native-observed',
  NATIVE_PROVEN: 'native-proven',
});

const CLOCKS = new Set(Object.values(SOUND_CLOCKS));
const EVIDENCE = new Set(Object.values(SOUND_EVIDENCE));
// Tolerance tracks machine rounding, never a fixed 1 ns early-playback window.

function nonnegativeSeconds(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a finite, nonnegative number of seconds`);
  }
  return value;
}

function checkedClock(value) {
  if (!CLOCKS.has(value)) throw new TypeError('clock must be explicitly "real" or "world"');
  return value;
}

// A dispatch callback may throw a value whose message getter or string
// conversion itself throws. Reporting failure must not abort later deliveries.
// Web prototype policy; not a claim about native MCD exception handling.
function safeDispatchErrorMessage(error) {
  try {
    return String(error?.message ?? error);
  } catch {
    return 'unprintable sound dispatch error';
  }
}

/**
 * @param {object} options
 * @param {(event: object) => boolean|void} options.dispatch
 *   Returning false means "not accepted"; returning anything else means the
 *   handler was invoked successfully. Neither outcome proves audibility.
 * @param {number} [options.maxPending=1024] Hard cap on queued events.
 */
export function createSoundTimeline({ dispatch, maxPending = 1024 } = {}) {
  if (typeof dispatch !== 'function') throw new TypeError('dispatch callback is required');
  if (!Number.isSafeInteger(maxPending) || maxPending < 1) {
    throw new RangeError('maxPending must be a positive safe integer');
  }

  let real = 0;
  let world = 0;
  let nextId = 1;
  let pending = [];
  let accepted = 0;
  let rejected = 0;
  let failed = 0;
  let cancelled = 0;
  let enqueued = 0;
  const failures = [];
  const enqueuedAt = new WeakMap();

  const nowFor = (clock) => (clock === SOUND_CLOCKS.REAL ? real : world);
  const now = () => Object.freeze({ real, world });
  const stats = () => Object.freeze({
    enqueued, accepted, rejected, failed, cancelled, pending: pending.length,
  });

  function enqueue({ name, clock, delaySeconds = 0, evidence = SOUND_EVIDENCE.UNVERIFIED, params = {} } = {}) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new TypeError('sound event name must be a nonempty string');
    }
    checkedClock(clock);
    nonnegativeSeconds(delaySeconds, 'delaySeconds');
    if (!EVIDENCE.has(evidence)) throw new TypeError('unknown evidence classification');
    if (params === null || typeof params !== 'object' || Array.isArray(params)) {
      throw new TypeError('params must be a plain, non-array object');
    }
    if (pending.length >= maxPending) throw new RangeError('sound event queue capacity exceeded');
    if (!Number.isSafeInteger(nextId)) throw new RangeError('sound event ID space exhausted');

    const enqueueSeconds = nowFor(clock);
    const dueSeconds = enqueueSeconds + delaySeconds;
    if (!Number.isFinite(dueSeconds)) throw new RangeError('sound event due time overflowed');
    if (delaySeconds > 0 && dueSeconds <= enqueueSeconds) {
      throw new RangeError('sound event delay lost clock precision');
    }
    // Validate and snapshot before consuming an ID: invalid data is atomic.
    const immutableParams = snapshotSoundParams(params);
    const event = Object.freeze({
      id: nextId++, name, clock, dueSeconds, evidence,
      params: immutableParams,
    });
    enqueuedAt.set(event, enqueueSeconds);
    pending.push(event);
    enqueued++;
    return event.id;
  }

  function cancel(id) {
    const index = pending.findIndex((event) => event.id === id);
    if (index < 0) return false;
    pending.splice(index, 1);
    cancelled++;
    return true;
  }

  function deliver(event) {
    try {
      const result = dispatch(event);
      // The timeline is synchronous. A Promise/thenable can reject after
      // flushDue has returned; treating it as accepted would hide failures.
      // Observe rejected promises to avoid an unhandled rejection, but do
      // not claim that asynchronous playback finished or became audible.
      if (result !== null && (typeof result === 'object' || typeof result === 'function') &&
          typeof result.then === 'function') {
        void Promise.resolve(result).catch(() => {});
        throw new TypeError('sound dispatch callback must be synchronous');
      }
      if (result === false) rejected++;
      else accepted++;
    } catch (error) {
      failed++;
      // The event is consumed, never retried automatically: avoid doubled sound.
      failures.push(Object.freeze({ id: event.id, message: safeDispatchErrorMessage(error) }));
    }
  }

  // Compensate at most one relative machine epsilon after this clock has
  // advanced. Neither a fixed 1 ns grace period nor rounding alone may
  // dispatch an event at its enqueue timestamp before a positive delay.
  // This remains a Web-only scheduling choice, NOT a native audio contract.
  function isDue(event) {
    const current = nowFor(event.clock);
    if (event.dueSeconds <= current) return true;
    if (current <= enqueuedAt.get(event)) return false;
    return event.dueSeconds - current <=
      Number.EPSILON * Math.max(Math.abs(event.dueSeconds), Math.abs(current));
  }

  // Nested flushing is deferred to the next explicit call. This prevents
  // dispatch callbacks from recursively draining the current batch.
  let flushing = false;

  /** Flush eligible events. Callbacks may cancel/clear/reset later due events. */
  function flushDue() {
    if (flushing) return 0;
    flushing = true;
    try {
      // Snapshot IDs, not events removed from pending: cancellation during a
      // dispatch must still be able to invalidate another already-due event.
      // Across clocks there is no shared timestamp; enqueue order is WEB policy.
      const dueIds = pending
        .filter(isDue)
        .map((event) => event.id);
      let delivered = 0;
      for (const id of dueIds) {
        // clear(), reset() or cancel() inside a callback may have removed it.
        const index = pending.findIndex((event) => event.id === id);
        if (index < 0) continue;
        const [event] = pending.splice(index, 1);
        deliver(event);
        delivered++;
      }
      // Enqueues made from a callback are not in dueIds and require another
      // explicit flush, even if their due time is now.
      return delivered;
    } finally {
      flushing = false;
    }
  }

  /** Advance two independent monotonic clocks by caller-supplied deltas. */
  function advance({ realSeconds = 0, worldSeconds = 0, paused = false } = {}) {
    nonnegativeSeconds(realSeconds, 'realSeconds');
    nonnegativeSeconds(worldSeconds, 'worldSeconds');
    if (typeof paused !== 'boolean') throw new TypeError('paused must be boolean');
    if (paused) return 0;
    const nextReal = real + realSeconds;
    const nextWorld = world + worldSeconds;
    if (!Number.isFinite(nextReal) || !Number.isFinite(nextWorld)) {
      throw new RangeError('sound timeline clock overflowed');
    }
    if ((realSeconds > 0 && nextReal <= real) || (worldSeconds > 0 && nextWorld <= world)) {
      throw new RangeError('sound timeline clock advance lost precision');
    }
    real = nextReal;
    world = nextWorld;
    return flushDue();
  }

  /** Clear scheduled events while preserving clocks and cumulative diagnostics. */
  function clear() {
    cancelled += pending.length;
    pending = [];
  }

  /** Reset a session. IDs stay monotonic to prevent stale cancellation tokens. */
  function reset() {
    clear();
    real = 0;
    world = 0;
  }

  return Object.freeze({ enqueue, cancel, advance, flushDue, clear, reset, now, stats,
    getFailures: () => Object.freeze([...failures]),
  });
}
