import test from 'node:test';
import assert from 'node:assert/strict';
import {assessDojoClockObservation,DOJO_CLOCK_STATUS} from '../scripts/acceptance-dojo-clock.mjs';

const source={scenePath:'Assets/Scenes/SHRL_Dojo2.unity',sceneBuildIndex:10,serializedOwner:'level10'};
function trace(mode=['idle','moving'],withTime=true) {
  const frames=[]; let frameId=0,now=0,world=0;
  for(const step of mode) for(let i=0;i<16;i++) {
    const moving=step==='moving';
    now+=50;
    world+=(moving?0.9:0.04)*0.05;
    frames.push({frameId:++frameId,activeScreen:'playing',worldClock:world,
      nativeScene:{source},
      ...(withTime?{sampledAtMs:now}:{}),
      gameplay:{moving,...(withTime?{timeScale:moving?0.9:0.04}:{})}});
  }
  return {schemaVersion:2,captureKind:'SH10_DOJO_OWNER_BROWSER_V2',frames};
}

test('SH10 records measurable Web world/real clock regimes without claiming native execution',()=>{
  const result=assessDojoClockObservation(trace());
  assert.equal(result.status,DOJO_CLOCK_STATUS.OBSERVED);
  assert.ok(result.observations.moving.worldSecondsPerRealSecond>result.observations.idle.worldSecondsPerRealSecond);
  assert.equal(result.nativeTimeMeasured,false);
  assert.equal(result.nativeParityVerdict,'UNKNOWN');
  assert.equal(result.browserExecutionIndependentlyVerified,false);
});
test('SH10 old browser traces without measured time are INCOMPLETE, not native refutation',()=>{
  const result=assessDojoClockObservation(trace(['idle','moving'],false));
  assert.equal(result.status,DOJO_CLOCK_STATUS.INCOMPLETE);
  assert.equal(result.nativeParityVerdict,'UNKNOWN');
});
test('SH10 movement-only captures cannot stand in for two time regimes',()=>{
  const result=assessDojoClockObservation(trace(['moving','moving']));
  assert.equal(result.status,DOJO_CLOCK_STATUS.INCOMPLETE);
  assert.equal(result.observations.idle,null);
});
test('SH10 rejects synthetic or mislabeled source as actual Dojo clock data',()=>{
  const x=trace();x.frames[1].nativeScene.source={...source,sceneBuildIndex:28};
  assert.equal(assessDojoClockObservation(x).status,DOJO_CLOCK_STATUS.INVALID);
});
test('SH10 invalid sample timestamps are not silently converted to a time ratio',()=>{
  const x=trace();x.frames[5].sampledAtMs=x.frames[4].sampledAtMs;
  assert.equal(assessDojoClockObservation(x).status,DOJO_CLOCK_STATUS.INVALID);
});
test('SH10 prevents paused/world-reset frames from establishing clock slope',()=>{
  const x=trace();
  x.frames.forEach((f,i)=>{if(i>=4 && i<=13) f.activeScreen='paused';});
  const report=assessDojoClockObservation(x);
  assert.equal(report.status,DOJO_CLOCK_STATUS.INCOMPLETE);
});
