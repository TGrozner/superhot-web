import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimeState, getTargetTimeScale, stepTime, PROTOTYPE_TIME_RULES } from '../src/time.js';

const near = (actual, expected, error = 1e-12) => assert.ok(Math.abs(actual - expected) <= error, `${actual} != ${expected}`);

test('all default time values are explicitly labeled provisional prototype values', () => {
  assert.equal(PROTOTYPE_TIME_RULES.initialScale, .04);
  assert.equal(PROTOTYPE_TIME_RULES.minimumScale, .035);
  assert.equal(PROTOTYPE_TIME_RULES.smoothingRate, 8);
});

test('target chooses the strongest current Web prototype activity', () => {
  near(getTargetTimeScale({}), .035);
  near(getTargetTimeScale({moving:true,lookActivity:1,shotPulse:1,reloading:true}), .98);
  near(getTargetTimeScale({lookActivity:1}), .77);
  near(getTargetTimeScale({shotPulse:1}), .85);
  near(getTargetTimeScale({reloading:true}), .60);
});

test('activity decays before target selection, then smooths scale with real dt', () => {
  const before = createTimeState({lookActivity:1,shotPulse:.7});
  const after = stepTime(before, {dt:.1});
  near(after.lookActivity, .79);
  near(after.shotPulse, .43);
  const wanted = Math.max(.035, .79*.77, .43*.85);
  near(after.targetScale, wanted);
  near(after.timeScale, .04 + (wanted-.04)*(1-Math.exp(-.8)));
  near(after.realDelta, .1);
  near(after.worldDelta, .1*after.timeScale);
  near(after.realClock, .1);
  near(after.worldClock, after.worldDelta);
  assert.deepEqual(before, createTimeState({lookActivity:1,shotPulse:.7}), 'caller state must stay unchanged');
});

test('real movement uses real dt while world time advances at smoothed speed', () => {
  const after = stepTime(createTimeState(), {dt:1/60,moving:true});
  assert.ok(after.timeScale>.04 && after.timeScale<.98);
  assert.equal(after.realDelta,1/60);
  near(after.worldDelta,after.realDelta*after.timeScale);
});

test('pause freezes clocks, activity, and scale even when dt is nonzero', () => {
  const before = createTimeState({timeScale:.8,lookActivity:.9,shotPulse:.6,realClock:12,worldClock:3});
  const after = stepTime(before, {dt:60,paused:true,moving:true,reloading:true});
  assert.deepEqual({timeScale:after.timeScale,lookActivity:after.lookActivity,shotPulse:after.shotPulse,realClock:after.realClock,worldClock:after.worldClock}, before);
  assert.equal(after.realDelta,0);
  assert.equal(after.worldDelta,0);
});

test('dt=0 is an identity transition; invalid time does not silently run', () => {
  const before = createTimeState({timeScale:.4,lookActivity:.8,shotPulse:1});
  const after = stepTime(before,{dt:0,moving:true});
  for(const key of ['timeScale','lookActivity','shotPulse','realClock','worldClock']) near(after[key],before[key]);
  for(const dt of [-1,NaN,Infinity]) assert.throws(()=>stepTime(before,{dt}),RangeError);
  assert.throws(()=>stepTime(before,{}),RangeError);
});

test('exponential scale is insensitive to dt subdivision for constant target', () => {
  const single = stepTime(createTimeState(),{dt:.2,moving:true});
  let chunked = createTimeState();
  for(let i=0;i<20;i++) chunked=stepTime(chunked,{dt:.01,moving:true});
  near(single.timeScale,chunked.timeScale,1e-12);
  // Legacy world-time right-endpoint integration is NOT exactly invariant.
  assert.ok(Math.abs(single.worldClock-chunked.worldClock)>.0001);
  assert.ok(Math.abs(single.worldClock-chunked.worldClock)<.1);
  near(single.realClock,chunked.realClock);
});
