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
const EPSILON = 1e-9;

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

    const dueSeconds = nowFor(clock) + delaySeconds;
    if (!Number.isFinite(dueSeconds)) throw new RangeError('sound event due time overflowed');
    // Validate and snapshot before consuming an ID: invalid data is atomic.
    const immutableParams = snapshotSoundParams(params);
    const event = Object.freeze({
      id: nextId++, name, clock, dueSeconds, evidence,
      params: immutableParams,
    });
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
      if (dispatch(event) === false) rejected++;
      else accepted++;
    } catch (error) {
      failed++;
      // The event is consumed, never retried automatically: avoid doubled sound.
      failures.push(Object.freeze({ id: event.id, message: String(error?.message ?? error) }));
    }
  }

  /** Flush all events due at the current real/world clock positions. */
  function flushDue() {
    const due = [];
    const future = [];
    for (const event of pending) {
      if (event.dueSeconds <= nowFor(event.clock) + EPSILON) due.push(event);
      else future.push(event);
    }
    pending = future;
    // Across different clocks there is no meaningful common timestamp.
    // Creation order is stable and does not assert native ordering.
    due.sort((a, b) => a.id - b.id);
    for (const event of due) deliver(event);
    return due.length;
  }

  /** Advance two independent monotonic clocks by caller-supplied deltas. */
  function advance({ realSeconds = 0, worldSeconds = 0, paused = false } = {}) {
    nonnegativeSeconds(realSeconds, 'realSeconds');
    nonnegativeSeconds(worldSeconds, 'worldSeconds');
    if (typeof paused !== 'boolean') throw new TypeError('paused must be boolean');
    if (paused) return 0;
    if (!Number.isFinite(real + realSeconds) || !Number.isFinite(world + worldSeconds)) {
      throw new RangeError('sound timeline clock overflowed');
    }
    real += realSeconds;
    world += worldSeconds;
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
