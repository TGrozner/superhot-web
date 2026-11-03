import test from 'node:test';
import assert from 'node:assert/strict';
import { assessWebVisualReadability } from '../scripts/visual-web-playability.mjs';

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
