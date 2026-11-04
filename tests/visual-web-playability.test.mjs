import test from 'node:test';
import assert from 'node:assert/strict';
import { assessWebVisualReadability, installWebVisualQa } from '../scripts/visual-web-playability.mjs';

const playing = Object.freeze({
  activeScreen:'playing',frameId:12,totalWebGLDrawCalls:381,
  nativeScene:{source:{sceneBuildIndex:10,scenePath:'Scenes/SHRL_Dojo2.unity'}},
});

test('Web Dojo QA reports real draw-call/frame-time receipts and only feedback conflicts',()=>{
  const r=assessWebVisualReadability({
    frame:playing,metrics:{p95FrameMs:39.2},width:320,height:240,
    boxes:[
      {id:'stage-banner',left:95,top:45,width:160,height:50},
      {id:'chain-banner',left:100,top:55,width:140,height:28},
      {id:'dodge-banner',left:100,top:217,width:170,height:38},
      {id:'crosshair',left:151,top:111,width:20,height:20},
    ],
  });
  assert.equal(r.state,'WEB_DOJO_VISIBLE_QA_NOT_BROWSER_VERIFIED');
  assert.equal(r.drawCalls,381);
  assert.equal(r.p95FrameMs,39.2);
  assert.equal(r.vramBytes,null);
  assert.equal(r.browserScreenshotInspected,false);
  assert.deepEqual(r.warnings.map(w=>w.kind),
    ['frametime','clipped-banner','overlapping-feedback']);
  assert.deepEqual(r.warnings.at(-1).ids,['stage-banner','chain-banner']);
  assert.ok(r.warnings.at(-1).overlapFraction>0.12);
});

test('Menu and missing Web scene are explicit blockers, not graphical observations',()=>{
  const r=assessWebVisualReadability({
    frame:{activeScreen:'menu',frameId:1},metrics:{},width:1920,height:1080,
  });
  assert.equal(r.state,'WEB_FRAME_NOT_READY');
  assert.equal(r.drawCalls,null);
  assert.equal(r.p95FrameMs,null);
  assert.deepEqual(r.warnings.map(w=>w.kind),['scene','screen']);
  assert.throws(()=>assessWebVisualReadability({frame:playing,width:0,height:100}),/viewport/);
});

test('No banner collision, 60 FPS budget and missing metrics make no fabricated defect',()=>{
  const r=assessWebVisualReadability({
    frame:playing,metrics:{p95FrameMs:16.1},width:1920,height:1080,
    boxes:[{id:'stage-banner',left:200,top:50,width:150,height:40},
      {id:'pickup-prompt',left:700,top:600,width:200,height:42}],
  });
  assert.equal(r.warnings.length,0);
  assert.equal(r.overlayBoxesInspected,2);
  assert.ok(r.fpsAtP95>60);
  const missing=assessWebVisualReadability({frame:playing,width:1920,height:1080});
  assert.equal(missing.p95FrameMs,null);
  assert.equal(missing.warnings.length,0);
});

test('100ms real DOM sampling preserves a short clash missed by 1s panel refresh',()=>{
  let active=false, removed=false;
  const timers=new Map();
  const elements={
    'stage-banner':{hidden:false,getBoundingClientRect:()=>({left:100,top:90,width:160,height:70})},
    'chain-banner':{hidden:false,getBoundingClientRect:()=>({left:110,top:110,width:150,height:35})},
  };
  const documentRef={
    body:{append(){}},
    createElement:()=>({style:{},setAttribute(){},remove(){removed=true;}}),
    getElementById:id=>active?elements[id]??null:null,
  };
  const windowRef={
    innerWidth:640,innerHeight:360,
    __superhotGetRenderedFrameSnapshot:()=>playing,
    __superhotSceneMetrics:{p95FrameMs:16.6},
    getComputedStyle:()=>({display:'block',visibility:'visible',opacity:'1'}),
    setInterval:(fn,ms)=>{timers.set(ms,fn);return ms;},
    clearInterval:ms=>{timers.delete(ms);},
  };
  const qa=installWebVisualQa({windowRef,documentRef,sampleMs:100,refreshMs:1000});
  assert.equal(qa.getReport().transientWarnings.length,0);
  active=true;
  timers.get(100)();
  active=false;
  timers.get(100)();
  timers.get(1000)(); // a 1s-only sampler would have missed the overlap entirely
  const r=qa.getReport();
  assert.equal(r.warnings.length,0);
  assert.equal(r.observedSamples,3);
  assert.equal(r.transientWarnings.length,1);
  assert.deepEqual(r.transientWarnings[0].ids,['stage-banner','chain-banner']);
  assert.equal(r.transientWarnings[0].samplesWithWarning,1);
  assert.ok(r.transientWarnings[0].peakOverlapFraction>=0.12);
  assert.equal(r.transientWarnings[0].firstFrameId,12);
  qa.stop();
  qa.stop();
  assert.equal(removed,true);
  assert.equal(timers.size,0);
});


test('Web QA reads real text ink bounds: nowrap banner may overflow its CSS box',()=>{
  let textInk={left:-18,top:90,width:350,height:25};
  const timers=new Map();
  const banner={
    hidden:false,textContent:'×4 ENCHAÎNEMENT · +150',
    getBoundingClientRect:()=>({left:44,top:84,width:232,height:36}),
  };
  const documentRef={
    body:{append(){}},
    createElement:()=>({style:{},setAttribute(){},remove(){}}),
    getElementById:id=>id==='chain-banner'?banner:null,
    createRange:()=>({
      selectNodeContents(element){assert.equal(element,banner);},
      getBoundingClientRect:()=>textInk,
    }),
  };
  const windowRef={
    innerWidth:320,innerHeight:240,
    __superhotGetRenderedFrameSnapshot:()=>playing,
    __superhotSceneMetrics:{p95FrameMs:16.4},
    getComputedStyle:()=>({display:'block',visibility:'visible',opacity:'1'}),
    setInterval:(fn,ms)=>{timers.set(ms,fn);return ms;},
    clearInterval:ms=>{timers.delete(ms);},
  };
  const qa=installWebVisualQa({windowRef,documentRef});
  assert.deepEqual(qa.getReport().warnings.map(w=>w.kind),['clipped-banner']);
  textInk={left:26,top:90,width:268,height:25}; // inside viewport, beyond panel backdrop
  timers.get(100)();
  const report=qa.getReport();
  assert.deepEqual(report.warnings.map(w=>w.kind),['text-outside-banner']);
  assert.deepEqual(report.transientWarnings.map(w=>w.kind).sort(),
    ['clipped-banner','text-outside-banner']);
  qa.stop();
  assert.equal(timers.size,0);
});

test('painted nowrap ink conflicts even when CSS feedback boxes do not touch',()=>{
  const r=assessWebVisualReadability({
    frame:playing,metrics:{p95FrameMs:16.3},width:320,height:240,
    boxes:[
      {id:'chain-banner',left:20,top:22,width:80,height:24,
        textBounds:{left:20,top:22,width:170,height:22}},
      {id:'pickup-prompt',left:155,top:23,width:45,height:24},
    ],
  });
  assert.deepEqual(r.warnings.map(w=>w.kind),
    ['text-outside-banner','overlapping-feedback']);
  assert.deepEqual(r.warnings[1].ids,['chain-banner','pickup-prompt']);
  assert.ok(r.warnings[1].overlapFraction>0.7);
});

test('Live Web QA detects pickup text covered by the later HUD hint strip, not background-only overlap',()=>{
  const pickup={id:'pickup-prompt',left:60,top:105,width:200,height:52,
    textBounds:{left:78,top:126,width:163,height:21}};
  const hint={id:'hint-bar',left:0,top:132,width:320,height:48};
  const evaluate=(box)=>assessWebVisualReadability({
    frame:playing,metrics:{p95FrameMs:16.2},width:320,height:180,boxes:[pickup,box],
  });
  const overlap=evaluate(hint);
  const warning=overlap.warnings.find(w=>w.kind==='pickup-text-in-controls');
  assert.deepEqual(warning.ids,['pickup-prompt','hint-bar']);
  assert.ok(warning.overlapFraction>0.6);
  assert.equal(overlap.overlayBoxesInspected,1); // hint strip is not a transient banner

  const backgroundOnly=evaluate({...hint,top:153,height:27});
  assert.equal(backgroundOnly.warnings.some(w=>w.kind==='pickup-text-in-controls'),false);
  const unknownInk=assessWebVisualReadability({
    frame:playing,width:320,height:180,
    boxes:[{...pickup,textBounds:undefined},hint],
  });
  assert.equal(unknownInk.warnings.some(w=>w.kind==='pickup-text-in-controls'),false);

  const timers=new Map();
  const pickupEl={hidden:false,textContent:'E RAMASSER L’ARME',
    getBoundingClientRect:()=>({left:60,top:105,width:200,height:52})};
  const hintEl={hidden:false,textContent:'ZQSD / WASD · BOUGER',
    getBoundingClientRect:()=>({left:0,top:132,width:320,height:48})};
  const documentRef={
    body:{append(){}},createElement:()=>({style:{},setAttribute(){},remove(){}}),
    getElementById:id=>id==='pickup-prompt'?pickupEl:id==='hint-bar'?hintEl:null,
    createRange:()=>({selectNodeContents(el){assert.equal(el,pickupEl);},
      getBoundingClientRect:()=>pickup.textBounds}),
  };
  const windowRef={
    innerWidth:320,innerHeight:180,
    __superhotGetRenderedFrameSnapshot:()=>playing,
    __superhotSceneMetrics:{p95FrameMs:16.2},
    getComputedStyle:()=>({display:'block',visibility:'visible',opacity:'1'}),
    setInterval:(fn,ms)=>{timers.set(ms,fn);return ms;},
    clearInterval:ms=>timers.delete(ms),
  };
  const qa=installWebVisualQa({windowRef,documentRef});
  assert.equal(qa.getReport().warnings.some(w=>w.kind==='pickup-text-in-controls'),true);
  assert.equal(qa.getReport().transientWarnings[0].kind,'pickup-text-in-controls');
  qa.stop();
  assert.equal(timers.size,0);
});
