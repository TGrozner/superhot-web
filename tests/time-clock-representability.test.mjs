import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimeState, stepTime, PROTOTYPE_TIME_RULES } from '../src/time.js';

// SH-02: numeric integrity of PROVISIONAL WEB clocks. All values are synthetic.
// No MCD runtime measurement or native time rule is inferred from these cases.

test('positive real dt never disappears in a very large finite real clock', () => {
  const state = createTimeState({ realClock: 2 ** 53 });
  assert.throws(
    () => stepTime(state, { dt: 0.05, moving: true }),
    { name: 'RangeError', message: /realClock cannot represent this step/ },
  );
  assert.equal(state.realClock, 2 ** 53, 'rejected step must not mutate the caller');
});

test('nonzero world delta never disappears in a very large finite world clock', () => {
  const state = createTimeState({ worldClock: 2 ** 53 });
  assert.throws(
    () => stepTime(state, { dt: 0.05, moving: true }),
    { name: 'RangeError', message: /worldClock cannot represent this step/ },
  );
  assert.equal(state.worldClock, 2 ** 53);
});

test('nonzero world time step cannot silently underflow to zero', () => {
  const state = createTimeState();
  assert.throws(
    () => stepTime(state, { dt: Number.MIN_VALUE, moving: true }),
    { name: 'RangeError', message: /worldDelta cannot represent this step/ },
  );
  assert.equal(state.worldClock, 0);
});

test('a genuinely zero world scale remains legal while real time advances', () => {
  const state = createTimeState({ timeScale: 0 });
  const rules = { ...PROTOTYPE_TIME_RULES, minimumScale: 0 };
  const next = stepTime(state, { dt: 0.05 }, rules);
  assert.equal(next.realClock, 0.05);
  assert.equal(next.worldClock, 0);
  assert.equal(next.worldDelta, 0);
  assert.equal(next.timeScale, 0);
});

test('paused clocks remain frozen even at large finite values', () => {
  const state = createTimeState({ realClock: 2 ** 53, worldClock: 2 ** 53 });
  const next = stepTime(state, { dt: 0.05, paused: true });
  assert.equal(next.realClock, state.realClock);
  assert.equal(next.worldClock, state.worldClock);
  assert.equal(next.realDelta, 0);
  assert.equal(next.worldDelta, 0);
});

test('ordinary prototype ticks still progress both clocks without mutation', () => {
  const state = createTimeState({ realClock: 100, worldClock: 10 });
  const next = stepTime(state, { dt: 1 / 60, moving: true });
  assert.ok(next.realClock > state.realClock);
  assert.ok(next.worldClock > state.worldClock);
  assert.ok(next.worldDelta > 0);
  assert.deepEqual(state, createTimeState({ realClock: 100, worldClock: 10 }));
});
