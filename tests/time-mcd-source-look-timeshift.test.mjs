import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMcdSourceLookTimeshiftState,
  resetMcdSourceLookRotationAccumulated,
  advanceMcdSourceLookTimeshift,
} from '../src/time.js';

const Q0 = Object.freeze({x: 0, y: 0, z: 0, w: 1});
const qYaw = (degrees) => ({
  x: 0, y: Math.sin(degrees * Math.PI / 360),
  z: 0, w: Math.cos(degrees * Math.PI / 360),
});
const inputs = (rotation = Q0, unscaledTime = 1, extras = {}) => ({
  unscaledTime, cameraWorldRotation: rotation,
  wydmuszkaMode: false, activeWeaponIsTakedown: false,
  takedownCanUseTimeshifts: false, lockLookShifter: false,
  ...extras,
});
const ready = () => ({...createMcdSourceLookTimeshiftState({cameraWorldRotation: Q0}), warmupUpdatesRemaining: 0});
const near = (actual, expected, tol = 1e-4) => assert.ok(Math.abs(actual - expected) < tol, `${actual} != ${expected}`);

test('15° rotation writes max 0.3 and retains 0.15; next zero-angle sample drains it', () => {
  const first = advanceMcdSourceLookTimeshift(ready(), inputs(qYaw(15)));
  assert.equal(first.measured, true);
  assert.equal(first.wroteModifier, true);
  near(first.deltaAngleDegrees, 15, 1e-3);
  near(first.state.currentTimeModifier, .3);
  near(first.state.timeShiftBuffer, .15, 2e-3);
  const second = advanceMcdSourceLookTimeshift(first.state, inputs(qYaw(15), 1.1));
  assert.equal(second.measured, true);
  near(second.deltaAngleDegrees, 0, .1);
  near(second.state.currentTimeModifier, .15, .002);
  near(second.state.timeShiftBuffer, 0, .002);
});

test('Wydmuszka stops warmup, buffer, modifier, last measured time and camera-angle baseline', () => {
  const state = createMcdSourceLookTimeshiftState({cameraWorldRotation: Q0});
  const result = advanceMcdSourceLookTimeshift(state, inputs(qYaw(30), 1, {wydmuszkaMode:true}));
  assert.equal(result.measured, false);
  assert.equal(result.wroteModifier, false);
  assert.deepEqual(result.state, state);
});

test('first ten Update calls rearm previous rotation even when a measure happens', () => {
  let state = createMcdSourceLookTimeshiftState({cameraWorldRotation:Q0});
  for(let n=1;n<=10;n++) {
    const step=advanceMcdSourceLookTimeshift(state, inputs(qYaw(n*15), n*.1));
    assert.equal(step.state.warmupUpdatesRemaining,10-n);
    near(step.deltaAngleDegrees,0,.1);
    state=step.state;
  }
  const step=advanceMcdSourceLookTimeshift(state,inputs(qYaw(165),2));
  near(step.deltaAngleDegrees,15,.001);
});

test('strict unscaled-time threshold: exact source float32 boundary does not measure', () => {
  const t=Math.fround(1/60);
  const result=advanceMcdSourceLookTimeshift(ready(),inputs(qYaw(45),t));
  assert.equal(result.measured,false);
  assert.deepEqual(result.state.previousWorldRotation,Q0);
  assert.equal(result.state.currentTimeModifier,0);
});

test('lock accumulates angle/buffer but preserves previous modifier until unlocked measure', () => {
  const state = {...ready(),currentTimeModifier:.2};
  const locked = advanceMcdSourceLookTimeshift(state,inputs(qYaw(15),1,{lockLookShifter:true}));
  assert.equal(locked.measured,true);
  assert.equal(locked.wroteModifier,false);
  near(locked.state.timeShiftBuffer,.45,.002);
  assert.equal(locked.state.currentTimeModifier,.2);
  const unlocked = advanceMcdSourceLookTimeshift(locked.state,inputs(qYaw(15),1.1));
  assert.equal(unlocked.wroteModifier,true);
  near(unlocked.state.currentTimeModifier,.3);
  near(unlocked.state.timeShiftBuffer,.15,.003);
});

test('blocked Takedown zeroes new rotation but can drain old buffer', () => {
  const state={...ready(),timeShiftBuffer:.15, currentTimeModifier:.3};
  const step=advanceMcdSourceLookTimeshift(state,inputs(qYaw(60),1,{activeWeaponIsTakedown:true,takedownCanUseTimeshifts:false}));
  assert.equal(step.deltaAngleDegrees,0);
  near(step.state.currentTimeModifier,.15);
  assert.equal(step.state.rotationAccumulated,0);
  near(step.state.timeShiftBuffer,0);
  assert.deepEqual(step.state.previousWorldRotation,qYaw(60));
});

test('ResetRotationAccumulated only clears accumulated rotation and reanchors camera',()=>{
  const old = {...ready(),rotationAccumulated:70,timeShiftBuffer:.25,currentTimeModifier:.3,
    lastTimeMeasuredDeltaA:.4,warmupUpdatesRemaining:3};
  const after=resetMcdSourceLookRotationAccumulated(old,qYaw(90));
  assert.equal(after.rotationAccumulated,0);
  assert.deepEqual(after.previousWorldRotation,qYaw(90));
  assert.equal(after.timeShiftBuffer,.25);
  assert.equal(after.currentTimeModifier,.3);
  assert.equal(after.lastTimeMeasuredDeltaA,.4);
  assert.equal(after.warmupUpdatesRemaining,3);
  assert.equal(old.rotationAccumulated,70);
});

test('source adapter requires all unknown runtime gates and an explicit quaternion',()=>{
  assert.throws(()=>createMcdSourceLookTimeshiftState({}),/quaternion/);
  assert.throws(()=>advanceMcdSourceLookTimeshift(ready(),{...inputs(),lockLookShifter:undefined}),/lockLookShifter/);
  assert.throws(()=>advanceMcdSourceLookTimeshift(ready(),inputs(Q0,Number.NaN)),/unscaledTime/);
});
