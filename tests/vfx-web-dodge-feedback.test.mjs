import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWebDodgeFeedback, recordWebDodge, advanceWebDodgeFeedback,
} from '../src/vfx/web-dodge-feedback.js';

test('Dojo dodge cue expires in active real seconds across low-FPS frames and pause', () => {
  const once=createWebDodgeFeedback(), split=createWebDodgeFeedback();
  for (const fx of [once,split])
    assert.equal(recordWebDodge(fx,{realTime:1,distance:1.1}),true);
  // A 10 FPS active frame must consume 100ms, not the capped 50ms world step.
  const fraction=advanceWebDodgeFeedback(once,.1);
  advanceWebDodgeFeedback(split,.05);
  advanceWebDodgeFeedback(split,.05);
  assert.ok(Math.abs(once.seconds-.32)<1e-12);
  assert.ok(Math.abs(once.seconds-split.seconds)<1e-12);
  assert.ok(Math.abs(fraction-(.32/.42))<1e-12);
  advanceWebDodgeFeedback(once,0); // Pause does not progress this effect.
  assert.ok(Math.abs(once.seconds-.32)<1e-12);
  assert.equal(advanceWebDodgeFeedback(once,.33),0);
  assert.equal(advanceWebDodgeFeedback(split,.33),0);
  assert.equal(once.total,1);
  // A long active hitch consumes all outstanding cue time in one tick.
  const hitch=createWebDodgeFeedback();
  recordWebDodge(hitch,{realTime:2,distance:.8});
  assert.equal(advanceWebDodgeFeedback(hitch,.6),0);
  assert.equal(hitch.seconds,0);
  assert.throws(()=>advanceWebDodgeFeedback(hitch,NaN),RangeError);
});
