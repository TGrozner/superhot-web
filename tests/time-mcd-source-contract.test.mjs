import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MCD_SOURCE_TIME_CONSTANTS,
  createMcdSourceTimeState,
  advanceMcdSourceTime,
} from '../src/time.js';
import {
  deliveredMcdKeyboardBinding,
  keydownAction,
} from '../src/input.js';

const contributor = (currentTimeModifier, terminated = false) => ({
  currentTimeModifier, terminated,
});
const awake = (powerActive = false) => createMcdSourceTimeState({
  fixedTimestepDenominator: 120, powerActive,
});
const lastTick = (state) => {
  let result;
  for (let i = 0; i < 3; i++) {
    result = advanceMcdSourceTime(state);
    state = result.state;
  }
  return result;
};

test('MCD-SOURCE T01: Containers denominator is explicit; class default 60 is not applied', () => {
  const state = awake();
  assert.ok(Math.abs(state.fixedDeltaTime - 1 / 120) < 1e-9);
  assert.equal(state.delayedUpdates, 2);
  assert.equal(state.maximumTimescale, 1);
  assert.equal(state.minimumTimescale, Math.fround(0.005));
  assert.notEqual(state.fixedDeltaTime, 1 / 60);
  assert.throws(() => createMcdSourceTimeState({ powerActive: false }), /fixedTimestepDenominator/);
  assert.throws(() => createMcdSourceTimeState({ fixedTimestepDenominator: 120 }), /powerActive/);
});

test('MCD-SOURCE T02: first two LateUpdate calls do not sweep or write scale', () => {
  const before = { ...awake(), shifters: [contributor(0.8, true)] };
  const a = advanceMcdSourceTime(before);
  const b = advanceMcdSourceTime(a.state);
  const c = advanceMcdSourceTime(b.state);
  assert.deepEqual([a.wroteTimeScale, b.wroteTimeScale, c.wroteTimeScale], [false, false, true]);
  assert.deepEqual([a.state.delayedUpdates, b.state.delayedUpdates, c.state.delayedUpdates], [1, 0, 0]);
  assert.equal(a.state.shifters.length, 1);
  assert.equal(b.state.shifters.length, 1);
  assert.equal(c.state.shifters.length, 0);
  assert.equal(c.timeScale, MCD_SOURCE_TIME_CONSTANTS.minimumTimescale);
  assert.equal(before.delayedUpdates, 2);
  assert.equal(before.shifters.length, 1);
});

test('MCD-SOURCE T03: terminated ignored; maximum >0 selected before clamp', () => {
  const result = lastTick({ ...awake(), shifters: [
    contributor(-0.6), contributor(NaN), contributor(0.4),
    contributor(5, true), contributor(0.9),
  ] });
  assert.equal(result.aggregate, Math.fround(0.9));
  assert.equal(result.timeScale, Math.fround(0.9));
  assert.equal(result.state.shifters.length, 4);
  assert.equal(result.wroteTimeScale, true);
});

test('MCD-SOURCE T04: clamp precedes forced override, including exact zero pause', () => {
  const initial = awake();
  const shifters = [contributor(3.5)];
  assert.equal(lastTick({ ...initial, shifters }).timeScale, 1);
  assert.equal(lastTick({ ...initial, shifters, forcedTimeScale: 0 }).timeScale, 0);
  assert.equal(lastTick({ ...initial, shifters, forcedTimeScale: 1.75 }).timeScale, Math.fround(1.75));
  assert.equal(lastTick({ ...initial, shifters: [contributor(-4)] }).timeScale,
    MCD_SOURCE_TIME_CONSTANTS.minimumTimescale);
});

test('MCD-SOURCE T05: POWER maximum 0.2f from Awake, no invented shifter values', () => {
  const result = lastTick({ ...awake(true), shifters: [contributor(0.7)] });
  assert.equal(result.aggregate, Math.fround(0.7));
  assert.equal(result.timeScale, Math.fround(0.2));
});

test('MCD-SOURCE I01: delivered Unity profile R is Replay/Back, not reload', () => {
  assert.deepEqual(deliveredMcdKeyboardBinding('KeyCode.R'), {
    label: 'Replay', target: 'Back', rebindable: true,
  });
  assert.deepEqual(deliveredMcdKeyboardBinding('KeyCode.D'), {
    label: 'Move Right', target: 'LeftStickRight', rebindable: true,
  });
  assert.equal(deliveredMcdKeyboardBinding('KeyR'), null,
    'physical DOM code translation is not proven by the Unity profile');
  assert.equal(keydownAction({ code: 'KeyR', screen: 'playing' }), 'reload',
    'Web fallback is still unchanged until SH-05 has a verified mapping');
});
