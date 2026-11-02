import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimeState, stepTime, PROTOTYPE_TIME_RULES } from '../src/time.js';

// SH-02: synthetic WEB-only tests for a coherent caller-state snapshot.
// Neither Unity's active time-law nor any native MCD getter is established.

const clockFields = ['timeScale', 'lookActivity', 'shotPulse', 'realClock', 'worldClock'];

function accessorState(values) {
  const reads = Object.fromEntries(clockFields.map((name) => [name, 0]));
  const state = { marker: 'user-metadata' };
  for (const name of clockFields) {
    Object.defineProperty(state, name, {
      enumerable: true,
      get() {
        reads[name] += 1;
        if (reads[name] > 1) throw new Error(`re-read ${name} after validation`);
        return values[name];
      },
    });
  }
  return { state, reads };
}

const oneReadPerField = () => Object.fromEntries(clockFields.map((name) => [name, 1]));

test('active tick reads each validated clock/pulse once, even with accessor-backed state', () => {
  const values = createTimeState({
    timeScale: 0.04, lookActivity: 0.8, shotPulse: 0.4, realClock: 1, worldClock: 2,
  });
  const { state, reads } = accessorState(values);
  const after = stepTime(state, { dt: 0.05, moving: true });
  assert.deepEqual(reads, oneReadPerField());
  assert.equal(after.marker, 'user-metadata');
  assert.equal(after.realClock, 1.05);
  assert.ok(after.worldClock > 2);
  assert.ok(after.lookActivity < values.lookActivity);
  assert.equal(values.realClock, 1, 'caller data remains untouched');
});

test('paused tick freezes the same snapshot without rereading state or invalid rates', () => {
  const values = createTimeState({ realClock: 100, worldClock: 10, shotPulse: 0.9 });
  const { state, reads } = accessorState(values);
  const after = stepTime(
    state,
    { dt: 0.05, paused: true, moving: true },
    { ...PROTOTYPE_TIME_RULES, smoothingRate: -10 },
  );
  assert.deepEqual(reads, oneReadPerField());
  assert.deepEqual(
    { timeScale: after.timeScale, lookActivity: after.lookActivity, shotPulse: after.shotPulse,
      realClock: after.realClock, worldClock: after.worldClock },
    values,
  );
  assert.equal(after.targetScale, values.timeScale);
  assert.equal(after.realDelta, 0);
  assert.equal(after.worldDelta, 0);
  assert.equal(after.marker, 'user-metadata');
});

test('extra metadata is preserved and projected only once alongside the time fields', () => {
  const state = createTimeState({ realClock: 3 });
  let metadataReads = 0;
  Object.defineProperty(state, 'label', {
    enumerable: true,
    get() {
      metadataReads += 1;
      return 'synthetic-frame';
    },
  });
  const after = stepTime(state, { dt: 0.05 });
  assert.equal(metadataReads, 1);
  assert.equal(after.label, 'synthetic-frame');
  assert.equal(after.realClock, 3.05);
});

test('the snapshot retains inherited clock values for existing state-like callers', () => {
  const prototype = createTimeState({ realClock: 7, worldClock: 9 });
  const state = Object.assign(Object.create(prototype), { marker: 'inherited' });
  const after = stepTime(state, { dt: 0.05 });
  assert.equal(after.realClock, 7.05);
  assert.ok(after.worldClock > 9);
  assert.equal(after.marker, 'inherited');
  assert.equal(prototype.realClock, 7);
});

test('invalid accessor-backed clock values are still refused before advancing', () => {
  let reads = 0;
  const state = createTimeState();
  Object.defineProperty(state, 'realClock', {
    enumerable: true,
    get() {
      reads += 1;
      return Number.NaN;
    },
  });
  assert.throws(
    () => stepTime(state, { dt: 0.05 }),
    { name: 'RangeError', message: /realClock must be finite/ },
  );
  assert.equal(reads, 1);
});
