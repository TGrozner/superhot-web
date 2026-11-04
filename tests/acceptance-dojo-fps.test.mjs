import test from 'node:test';
import assert from 'node:assert/strict';
import {assessDojoFpsCapture,DOJO_FPS_HOTKEYS,startDojoFpsCapture} from '../scripts/acceptance-dojo-fps.mjs';

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

test('SH-10 FPS: opt-in ragdoll gate refuses an idle/combat-only false green',()=>{
  assert.equal(assessDojoFpsCapture(sample()).status,
    'WEB_DOJO_FPS_SAMPLED_OWNER_MARKED_NOT_GPU_BENCHMARK');
  const none=assessDojoFpsCapture(sample(),{requireRagdolls:true});
  assert.equal(none.status,'WEB_DOJO_FPS_INCOMPLETE');
  assert.match(none.issues.join(' '),/ragdoll gate/);
  const short=sample();short.segments.push(segment('ragdolls',119));
  assert.equal(assessDojoFpsCapture(short,{requireRagdolls:true}).status,
    'WEB_DOJO_FPS_INCOMPLETE');
  const onlyOne=sample();
  onlyOne.segments.push(segment('ragdolls'));
  onlyOne.segments[2].drawSamples[0].ragdolls=1;
  assert.equal(assessDojoFpsCapture(onlyOne,{requireRagdolls:true}).status,
    'WEB_DOJO_FPS_INCOMPLETE');
  const two=sample();two.segments.push(segment('ragdolls'));
  const result=assessDojoFpsCapture(two,{requireRagdolls:true});
  assert.equal(result.status,'WEB_DOJO_FPS_SAMPLED_OWNER_MARKED_NOT_GPU_BENCHMARK');
  assert.equal(result.observations.ragdolls.frames,125);
  assert.equal(result.observations.ragdolls.maxActiveRagdolls,2);
  assert.equal(result.browserExecutionIndependentlyVerified,false);
});

test('SH-10 FPS: physical 7/8/9 and 0 mark/save real-browser phases without DevTools focus changes',()=>{
  const originalWindow=globalThis.window, originalDocument=globalThis.document;
  const callbacks=new Map(), listeners=new Map(), downloads=[];
  let nextRaf=0, cancelCount=0, capture=null;
  const source={sceneBuildIndex:10,serializedOwner:'level10',
    scenePath:'Assets/Scenes/SHRL_Dojo2.unity'};
  const controls={hidden:true}, hud={hidden:false};
  const fakeDocument={
    hidden:false,
    getElementById:id=>id==='scene-controls'?controls:id==='hud'?hud:null,
    addEventListener:(type,fn,captureMode)=>{assert.equal(captureMode,true);listeners.set(type,fn);},
    removeEventListener:(type,fn,captureMode)=>{
      assert.equal(captureMode,true);assert.equal(listeners.get(type),fn);listeners.delete(type);
    },
    createElement:tag=>{
      assert.equal(tag,'a');
      return {href:'',download:'',click(){downloads.push(this.download);}};
    },
  };
  const fakeWindow={
    innerWidth:1280,innerHeight:720,devicePixelRatio:1,
    __superhotGetRenderedFrameSnapshot:()=>({nativeScene:{source}}),
    __superhotSceneMetrics:{mode:'NATIVE_ORIGINAL_GEOMETRY_WEB_GAMEPLAY',
      totalWebGLDrawCalls:330,generatedManifest:{drawCalls:280},
      activeRagdolls:1,enemies:[{alive:true}]},
    requestAnimationFrame:fn=>{const id=++nextRaf;callbacks.set(id,fn);return id;},
    cancelAnimationFrame:id=>{cancelCount++;callbacks.delete(id);},
    setTimeout:()=>0,
  };
  const tick=at=>{
    const [id,fn]=callbacks.entries().next().value;
    callbacks.delete(id);fn(at);
  };
  const press=(code,opts={})=>{
    const event={code,target:{tagName:'BODY'},repeat:false,isComposing:false,
      prevented:false,preventDefault(){this.prevented=true;},...opts};
    listeners.get('keydown')?.(event);
    return event.prevented;
  };
  try {
    globalThis.window=fakeWindow;globalThis.document=fakeDocument;
    capture=startDojoFpsCapture();
    assert.equal(DOJO_FPS_HOTKEYS.Digit7,'idle');
    assert.equal(press('Digit7'),true);
    tick(0);tick(16);tick(32);
    assert.equal(press('Digit8',{repeat:true}),false);
    assert.equal(press('Digit8',{target:{tagName:'INPUT'}}),false);
    assert.equal(press('KeyF'),false); // Gameplay input remains untouched.
    assert.equal(press('Digit8'),true);
    tick(48);tick(64);
    fakeDocument.hidden=true;
    assert.equal(press('Digit9'),false); // Hidden/paused pages don't mark.
    tick(80);
    fakeDocument.hidden=false;
    assert.equal(press('Digit9'),true);
    tick(96);tick(112);
    assert.equal(press('Digit0'),true); // Browser user gesture saves directly.
    assert.deepEqual(downloads,['dojo-fps.json']);
    assert.equal(listeners.has('keydown'),false);
    assert.ok(cancelCount>=1);
    const trace=capture.stop(); // stop is idempotent after hotkey save.
    assert.deepEqual(trace.segments.map(s=>s.label),['idle','combat','ragdolls']);
    assert.deepEqual(trace.segments.map(s=>s.frameIntervalsMs.length),[2,1,1]);
    assert.equal(trace.segments[0].drawSamples[0].total,330);
    assert.equal(press('Digit7'),false); // Listener removed, no post-stop leak.
  } finally {
    capture?.stop();
    if(originalWindow===undefined)delete globalThis.window;
    else globalThis.window=originalWindow;
    if(originalDocument===undefined)delete globalThis.document;
    else globalThis.document=originalDocument;
  }
});
