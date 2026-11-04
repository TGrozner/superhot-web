import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWebImpactFeedback, resetWebImpactFeedback, recordWebImpact,
  advanceWebImpactFeedback, WEB_IMPACT_MAX_PARTICLES,
} from '../src/vfx/web-combat-feedback.js';

const contact={point:{x:1,y:2,z:3},direction:{x:0,y:0,z:-1}};

test('only confirmed enemy contacts flash the marker, wall impacts stay visual and bounded',()=>{
  const feedback=createWebImpactFeedback();
  assert.equal(recordWebImpact(feedback,{kind:'kill',...contact}),true);
  assert.equal(feedback.hitKind,'kill');
  assert.equal(feedback.particles.length,11);
  assert.equal(recordWebImpact(feedback,{kind:'wall',...contact}),true);
  assert.equal(feedback.hitKind,'kill','wall cannot overwrite a confirmed kill');
  assert.equal(recordWebImpact(feedback,{kind:'hit',point:null,direction:contact.direction}),false);
  assert.equal(feedback.impactCount,2);
  for(let i=0;i<80;i++)recordWebImpact(feedback,{kind:'wall',...contact});
  assert.equal(feedback.particles.length,WEB_IMPACT_MAX_PARTICLES,'bursts have a strict draw budget');
  assert.ok(feedback.particles.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.vx)));
  // The game budgets at most 50 ms of real time per rendered frame.
  for(let i=0;i<10;i++)advanceWebImpactFeedback(feedback,.05);
  assert.equal(feedback.hitSeconds,0,'realtime hit marker expires even during world slow-motion');
  assert.equal(feedback.particles.length,0,'expired shards cost zero draw calls');
  resetWebImpactFeedback(feedback);
  assert.equal(feedback.impactCount,0);
  assert.equal(feedback.hitKind,null);
});

test('no impact can create NaN effects or an arbitrary hit confirmation',()=>{
  const feedback=createWebImpactFeedback();
  assert.equal(recordWebImpact(feedback,{kind:'kill',point:contact.point,direction:{x:0,y:0,z:0}}),false);
  assert.equal(recordWebImpact(feedback,{kind:'miss',...contact}),false);
  assert.equal(feedback.particles.length,0);
  assert.equal(feedback.hitSeconds,0);
});

test('hit sparks and marker respect active real time across a 100ms frame or two 50ms frames',()=>{
  const once=createWebImpactFeedback(),split=createWebImpactFeedback();
  for(const effect of [once,split])recordWebImpact(effect,{kind:'kill',...contact});
  advanceWebImpactFeedback(once,0.1);
  advanceWebImpactFeedback(split,0.05);
  advanceWebImpactFeedback(split,0.05);
  assert.ok(Math.abs(once.hitSeconds-0.12)<1e-12);
  assert.ok(Math.abs(once.hitSeconds-split.hitSeconds)<1e-12);
  assert.equal(once.particles.length,split.particles.length);
  for(let i=0;i<once.particles.length;i++){
    const a=once.particles[i],b=split.particles[i];
    for(const key of ['x','y','z','vx','vy','vz','life'])
      assert.ok(Math.abs(a[key]-b[key])<1e-10,`${key} must not depend on frame split`);
  }
  // Before this fix, the old 50ms clamp left these particles and the hit
  // marker alive through a 300ms hitch, despite their 240-290ms lifetimes.
  advanceWebImpactFeedback(once,0.3);
  assert.equal(once.hitSeconds,0);
  assert.equal(once.hitKind,null);
  assert.equal(once.particles.length,0);
});
