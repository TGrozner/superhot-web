import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimeState, stepTime, PROTOTYPE_TIME_RULES } from '../src/time.js';

// PROVISIONAL WEB rules only: these synthetic callers are not native MCD
// TimeControl observations. SH-01 #1 owns active-method/scene evidence.

const initial = () => createTimeState({ lookActivity: 0.8, shotPulse: 0.6 });

test('negative look decay cannot make a synthetic activity pulse grow', () => {
  const before = initial();
  assert.throws(
    () => stepTime(before, { dt: 0.05 }, { ...PROTOTYPE_TIME_RULES, lookDecayRate: -1 }),
    { name: 'RangeError', message: /lookDecayRate must be nonnegative/ },
  );
  assert.deepEqual(before, initial(), 'invalid rules must not mutate caller state');
});

test('negative shot decay cannot turn a pulse decay into growth', () => {
  assert.throws(
    () => stepTime(initial(), { dt: 0.05 }, { ...PROTOTYPE_TIME_RULES, shotDecayRate: -1 }),
    { name: 'RangeError', message: /shotDecayRate must be nonnegative/ },
  );
});

test('negative smoothing cannot reverse a positive Web world-clock tick', () => {
  const before = createTimeState();
  // Before this guard, -8 with moving=true produced nextScale about -0.4223
  // and a negative worldDelta, despite dt=+0.05.
  assert.throws(
    () => stepTime(before, { dt: 0.05, moving: true }, { ...PROTOTYPE_TIME_RULES, smoothingRate: -8 }),
    { name: 'RangeError', message: /smoothingRate must be nonnegative/ },
  );
  assert.equal(before.worldClock, 0);
});

test('nonfinite decay and smoothing rules fail before any active calculation', () => {
  for (const name of ['lookDecayRate', 'shotDecayRate', 'smoothingRate']) {
    for (const invalid of [NaN, Infinity, -Infinity]) {
      assert.throws(
        () => stepTime(initial(), { dt: 0.05 }, { ...PROTOTYPE_TIME_RULES, [name]: invalid }),
        { name: 'RangeError', message: new RegExp(name + ' must be finite') },
      );
    }
  }
});

test('zero rates stay valid without changing the existing Web defaults', () => {
  const before = initial();
  const rules = {
    ...PROTOTYPE_TIME_RULES,
    lookDecayRate: 0,
    shotDecayRate: 0,
    smoothingRate: 0,
  };
  const after = stepTime(before, { dt: 0.05, moving: true }, rules);
  assert.equal(after.lookActivity, before.lookActivity);
  assert.equal(after.shotPulse, before.shotPulse);
  assert.equal(after.timeScale, before.timeScale);
  assert.equal(after.realClock, 0.05);
  assert.equal(after.worldClock, 0.05 * before.timeScale);
  assert.equal(PROTOTYPE_TIME_RULES.lookDecayRate, 2.1);
  assert.equal(PROTOTYPE_TIME_RULES.shotDecayRate, 2.7);
  assert.equal(PROTOTYPE_TIME_RULES.smoothingRate, 8);
});

test('a paused tick remains a pure freeze even with invalid custom rates', () => {
  const before = initial();
  const invalid = { ...PROTOTYPE_TIME_RULES, smoothingRate: -8 };
  const after = stepTime(before, { dt: 0.05, paused: true }, invalid);
  assert.equal(after.timeScale, before.timeScale);
  assert.equal(after.lookActivity, before.lookActivity);
  assert.equal(after.shotPulse, before.shotPulse);
  assert.equal(after.realClock, before.realClock);
  assert.equal(after.worldClock, before.worldClock);
  assert.equal(after.worldDelta, 0);
  assert.equal(after.realDelta, 0);
});
