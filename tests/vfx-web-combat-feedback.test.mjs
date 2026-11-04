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

test('confirmed hit and kill fragments eject toward the shooter, not into target geometry',()=>{
  const feedback=createWebImpactFeedback();
  const shot={point:{x:0,y:1,z:0},direction:{x:0,y:0,z:-1}};
  for(const kind of ['hit','kill']){
    resetWebImpactFeedback(feedback);
    assert.equal(recordWebImpact(feedback,{kind,...shot}),true);
    assert.ok(feedback.particles.length>0);
    assert.ok(feedback.particles.every(p=>p.vz>0),
      'incoming -Z shot should eject visible red fragments toward +Z');
    assert.ok(feedback.particles.every(p=>p.z>shot.point.z),
      'spawn red fragments in front of the hit surface, not behind the target');
    const before=feedback.particles.map(p=>p.z);
    advanceWebImpactFeedback(feedback,0.05);
    assert.ok(feedback.particles.every((p,i)=>p.z>before[i]),
      'the live render path should move confirmed debris out of the target');
  }
  resetWebImpactFeedback(feedback);
  recordWebImpact(feedback,{kind:'wall',...shot});
  assert.ok(feedback.particles.every(p=>p.vz>0),
    'existing wall ejection still faces back toward the incoming shot');
});


test('kill glints outrank later wall bursts without expanding the particle budget',()=>{
  const feedback=createWebImpactFeedback();
  recordWebImpact(feedback,{kind:'kill',...contact});
  advanceWebImpactFeedback(feedback,.02);
  const left=feedback.hitSeconds;
  recordWebImpact(feedback,{kind:'hit',...contact});
  assert.equal(feedback.hitKind,'kill');
  assert.equal(feedback.hitSeconds,left);
  for(let i=0;i<30;i++)recordWebImpact(feedback,{kind:'wall',...contact});
  assert.equal(feedback.particles.length,WEB_IMPACT_MAX_PARTICLES);
  assert.equal(feedback.particles.filter(p=>p.webPriority===2).length,11);
  assert.equal(feedback.particles.filter(p=>p.webPriority===1).length,7);
  advanceWebImpactFeedback(feedback,left);
  assert.equal(feedback.hitKind,null);
  recordWebImpact(feedback,{kind:'hit',...contact});
  assert.equal(feedback.hitKind,'hit');
});
