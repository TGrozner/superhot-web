import test from 'node:test';
import assert from 'node:assert/strict';
import { detectWebCleanDodge, WEB_DODGE_SCORE } from '../src/combat/web-near-miss.js';
import {
  createWebDodgeFeedback, recordWebDodge, advanceWebDodgeFeedback, resetWebDodgeFeedback,
  WEB_DODGE_COOLDOWN,
} from '../src/vfx/web-dodge-feedback.js';

const center={x:0,y:1.35,z:0};
const travel=z=>[{x:-1,y:1.35,z},{x:1,y:1.35,z}];

test('near-miss is only recorded AFTER a completed no-contact bullet crossing',()=>{
  const [start,end]=travel(1.05);
  const result=detectWebCleanDodge(start,end,center);
  assert.ok(result);
  assert.equal(result.fraction,.5);
  assert.ok(Math.abs(result.distance-1.05)<1e-9);
  assert.equal(WEB_DODGE_SCORE,50);
  assert.equal(detectWebCleanDodge(...travel(.1),center),null,
    'actual player/body hits are not clean dodges');
  assert.equal(detectWebCleanDodge(...travel(3),center),null,
    'distant bullet is not a near miss');
  assert.equal(detectWebCleanDodge(
    {x:-3,y:1.35,z:1},{x:-2,y:1.35,z:1},center),null,
    'a bullet still approaching does not earn an early dodge');
  assert.equal(detectWebCleanDodge(start,start,center),null);
});

test('dodge visual expires in real-time, repeated shots are throttled and replay resets it',()=>{
  const fx=createWebDodgeFeedback();
  assert.equal(recordWebDodge(fx,{realTime:1,distance:1.05}),true);
  assert.equal(recordWebDodge(fx,{realTime:1.1,distance:1.05}),false);
  assert.equal(fx.total,1);
  for(let i=0;i<10;i++)advanceWebDodgeFeedback(fx,.05);
  assert.equal(fx.seconds,0);
  assert.equal(recordWebDodge(fx,{realTime:1+WEB_DODGE_COOLDOWN+.01,distance:1.2}),true);
  assert.equal(fx.total,2);
  resetWebDodgeFeedback(fx);
  assert.equal(fx.total,0);
  assert.equal(fx.seconds,0);
  assert.equal(recordWebDodge(fx,{realTime:0,distance:1.2}),true);
  assert.throws(()=>advanceWebDodgeFeedback(fx,-1),RangeError);
});
