import test from 'node:test';
import assert from 'node:assert/strict';
import {assessDojoFpsCapture} from '../scripts/acceptance-dojo-fps.mjs';

const segment=(label,frames=125)=>({label,
  frameIntervalsMs:Array.from({length:frames},(_,i)=>i%10===0?34:16.7),
  skippedFrames:0,
  drawSamples:[{total:420,world:350,ragdolls:2,livingEnemies:3}],
});
const sample=()=>({schemaVersion:1,captureKind:'SH10_DOJO_FPS_BROWSER_V1',
  nativeScene:{source:{sceneBuildIndex:10,serializedOwner:'level10',scenePath:'Assets/SHRL_Dojo2.unity'}},
  viewport:{width:1920,height:1080,dpr:1},segments:[segment('idle'),segment('combat')]});

test('SH-10 FPS: compute Web rAF percentiles without converting to GPU/native proof',()=>{
  const result=assessDojoFpsCapture(sample());
  assert.equal(result.status,'WEB_DOJO_FPS_SAMPLED_OWNER_MARKED_NOT_GPU_BENCHMARK');
  assert.equal(result.observations.combat.frames,125);
  assert.equal(result.observations.combat.p95FrameMs,34);
  assert.equal(result.observations.idle.maxTotalWebGLDrawCalls,420);
  assert.equal(result.gpuTimestampQueriesPerformed,false);
  assert.equal(result.nativeParityVerdict,'UNKNOWN');
});

test('SH-10 FPS: incomplete/invalid provenance cannot become a fake measured pass',()=>{
  const missing=sample();missing.segments.pop();
  assert.equal(assessDojoFpsCapture(missing).status,'WEB_DOJO_FPS_INCOMPLETE');
  const wrong=sample();wrong.nativeScene.source.sceneBuildIndex=28;
  assert.equal(assessDojoFpsCapture(wrong).status,'WEB_DOJO_FPS_INVALID');
  const corrupted=sample();corrupted.segments[1].frameIntervalsMs[0]=NaN;
  assert.equal(assessDojoFpsCapture(corrupted).status,'WEB_DOJO_FPS_INVALID');
});
