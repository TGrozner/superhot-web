import test from 'node:test';
import assert from 'node:assert/strict';
import { composeLocalMatrix } from '../src/scenes/graph.js';
import { prepareNativeCollision } from '../src/scenes/native-collision.js';
import { createNativeDeathRuntime, applyNativeDeathForce, advanceNativeDeathRuntime } from '../src/animation/native-death-runtime.js';

const matrix=(x,y,z)=>composeLocalMatrix({position:{x,y,z}});
const definition=()=>({
  boneParents:[-1,0,1,2], fixedDelta:1/150, solverIterations:7,
  boneRestTransforms:[{position:{x:0,y:0,z:0}},{position:{x:0,y:1,z:0}},
    {position:{x:0,y:1,z:0}},{position:{x:0.2,y:0,z:0}}],
  gravity:{x:0,y:-9.81,z:0},cleanupAfterSeconds:3.5,
  material:{bounciness:0,dynamicFriction:2,bounceThreshold:2},
  bodies:[
    {boneIndex:1,partId:'Hips',mass:12,drag:0,angularDrag:0,useGravity:true,contactSpheres:[{center:[0,0,0],radius:0.1}]},
    {boneIndex:2,partId:'Torso',mass:4,drag:0,angularDrag:0,useGravity:true,contactSpheres:[{center:[0,0,0],radius:0.1}]},
  ],joints:[{body:1,connectedBody:0,anchor:[0,0,0],connectedAnchor:[0,1,0],
    axis:[1,0,0],swingAxis:[0,1,0],limits:{lowTwist:-180,highTwist:180,swing1:180,swing2:180}}],
});
const floor=()=>prepareNativeCollision([{id:'floor',worldMatrix:matrix(0,-0.5,0),center:[0,0,0],size:[50,1,50]}]);
const create=(collisionScene={boxes:[]},def=definition())=>createNativeDeathRuntime({definition:def,collisionScene,
  boneModelMatrices:new Float32Array([...matrix(0,0,0),...matrix(0,1,0),...matrix(0,2,0),...matrix(0.2,2,0)]),
  modelMatrix:matrix(0,0,0),initialVelocity:{x:0,y:0,z:0}});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
const distance=(a,b)=>Math.hypot(a[12]-b[12],a[13]-b[13],a[14]-b[14]);

test('ordinary kill releases gravity from the sampled pose without spawning fragments',()=>{
  const runtime=create();
  advanceNativeDeathRuntime(runtime,0.2);
  assert.ok(runtime.getBoneWorldMatrix(1)[13]<1);
  near(distance(runtime.getBoneWorldMatrix(1),runtime.getBoneWorldMatrix(2)),1);
  assert.equal(runtime.fragments,undefined);
  assert.match(runtime.physics,/not-PhysX/);
});

test('real hit impulse uses the source mass and fingers follow the moving rigid parent',()=>{
  const runtime=create();
  applyNativeDeathForce(runtime,{boneIndex:2,mode:'Impulse',vector:{x:8,y:0,z:0}});
  near(runtime.byBone.get(2).velocity.x,2);
  advanceNativeDeathRuntime(runtime,0.2);
  assert.ok(runtime.getBoneWorldMatrix(2)[12]>0);
  assert.ok(Math.abs(distance(runtime.getBoneWorldMatrix(1),runtime.getBoneWorldMatrix(2))-1)<0.01);
  near(distance(runtime.getBoneWorldMatrix(2),runtime.getBoneWorldMatrix(3)),0.2);
});

test('localized hit transfers conserved momentum into authored adjacent joints, not every bone',()=>{
  const runtime=create();
  applyNativeDeathForce(runtime,{
    boneIndex:2,mode:'Impulse',vector:{x:8,y:0,z:0},point:{x:0,y:2,z:0},
  });
  const hips=runtime.byBone.get(1),torso=runtime.byBone.get(2);
  near(torso.velocity.x,8*0.78/4);
  near(hips.velocity.x,8*0.22/12);
  near(torso.source.mass*torso.velocity.x+hips.source.mass*hips.velocity.x,8);
  near(torso.angularVelocity.z,0,'a centred contact must not create extra spin');
  const noPoint=create();
  applyNativeDeathForce(noPoint,{boneIndex:2,mode:'Impulse',vector:{x:8,y:0,z:0}});
  near(noPoint.byBone.get(2).velocity.x,2);
  near(noPoint.byBone.get(1).velocity.x,0);
  advanceNativeDeathRuntime(runtime,0.1);
  assert.ok(Array.from(runtime.boneModelMatrices).every(Number.isFinite));
});

test('contacting the environment stops the corpse rather than falling through the floor',()=>{
  const runtime=create(floor());
  const result=advanceNativeDeathRuntime(runtime,1);
  assert.ok(result.contacts.some(c=>c.collider.id==='floor'));
  for(const body of runtime.bodies) assert.ok(body.position.y>=0.1-1e-6);
  assert.ok(Math.abs(distance(runtime.getBoneWorldMatrix(1),runtime.getBoneWorldMatrix(2))-1)<0.01);
});

test('pause holds bone attachments and cleanup is requested once on scaled source clock',()=>{
  const runtime=create();
  const before=Array.from(runtime.boneModelMatrices);
  advanceNativeDeathRuntime(runtime,0);
  assert.deepEqual(Array.from(runtime.boneModelMatrices),before);
  assert.equal(advanceNativeDeathRuntime(runtime,3.5).cleanupRequested,true);
  assert.equal(advanceNativeDeathRuntime(runtime,0).cleanupRequested,false);
});

test('Web PBD stops at the sourced Kill cleanup edge instead of burning FPS on pooled bodies',()=>{
  const def=definition();def.cleanupAfterSeconds=0.04;
  const atEdge=create({boxes:[]},def),overrun=create({boxes:[]},def);
  advanceNativeDeathRuntime(atEdge,0.04);
  const due=advanceNativeDeathRuntime(overrun,0.2);
  assert.equal(due.cleanupRequested,true);
  assert.deepEqual(Array.from(overrun.boneModelMatrices),Array.from(atEdge.boneModelMatrices),
    'the solver must not advance physics beyond the requested native cleanup time');
  const saved=Array.from(overrun.boneModelMatrices);
  applyNativeDeathForce(overrun,{partId:'Torso',mode:'Impulse',vector:{x:50,y:0,z:0}});
  const after=advanceNativeDeathRuntime(overrun,1);
  assert.equal(after.cleanupRequested,false,'the host receives only one cleanup request');
  assert.deepEqual(after.contacts,[]);
  assert.deepEqual(Array.from(overrun.boneModelMatrices),saved,
    'the Web-only freeze must not keep simulating an unconsumed cleanup request');
  near(overrun.elapsed,1.2);
  assert.equal(overrun.droppedWebSimulationTime,0,
    'time after a source cleanup deadline is not a frame-budget drop');
});

test('constant force expires on its own source duration rather than continuing until cleanup',()=>{
  const def=definition();def.bodies=def.bodies.slice(0,1);def.joints=[];def.gravity={x:0,y:0,z:0};
  const runtime=createNativeDeathRuntime({definition:def,collisionScene:{boxes:[]},
    boneModelMatrices:new Float32Array([...matrix(0,0,0),...matrix(0,1,0),...matrix(0,2,0),...matrix(0.2,2,0)]),
    modelMatrix:matrix(0,0,0),initialVelocity:{x:0,y:0,z:0}});
  applyNativeDeathForce(runtime,{partId:'Hips',mode:'ConstantForce',vector:{x:120,y:0,z:0},duration:0.1});
  advanceNativeDeathRuntime(runtime,0.2);
  near(runtime.bodies[0].velocity.x,1);
  advanceNativeDeathRuntime(runtime,0.2);
  near(runtime.bodies[0].velocity.x,1);
});

test('rendered body matrices and attachment matrices are the solved bodies, never a visual projection',()=>{
  const runtime=create(floor());
  applyNativeDeathForce(runtime,{boneIndex:2,mode:'Impulse',vector:{x:8,y:2,z:1}});
  advanceNativeDeathRuntime(runtime,0.3);
  for(const body of runtime.bodies) {
    assert.deepEqual(runtime.getBoneWorldMatrix(body.source.boneIndex),body.world);
    near(body.world[12],body.position.x);near(body.world[13],body.position.y);
  }
});

test('locked source angular axes constrain relative orientation, not only body distance',()=>{
  const def=definition();def.gravity={x:0,y:0,z:0};
  def.joints[0].limits={lowTwist:0,highTwist:0,swing1:0,swing2:0};
  const runtime=create({boxes:[]},def);
  runtime.bodies[1].angularVelocity={x:0,y:0,z:5};
  advanceNativeDeathRuntime(runtime,0.1);
  const a=runtime.bodies[0].world,b=runtime.bodies[1].world;
  for(const i of [0,1,2,4,5,6,8,9,10])assert.ok(Math.abs(a[i]-b[i])<0.01);
});

test('parallel authored axis and swingAxis produce deterministic finite constraints',()=>{
  const def=definition();def.joints[0].swingAxis=[1,0,0];
  const a=create(floor(),def),b=create(floor(),def);
  for(const runtime of [a,b]) {
    applyNativeDeathForce(runtime,{partId:'Torso',mode:'Impulse',vector:{x:4,y:0,z:2}});
    advanceNativeDeathRuntime(runtime,0.15);
    assert.ok(Array.from(runtime.boneModelMatrices).every(Number.isFinite));
  }
  assert.deepEqual(a.boneModelMatrices,b.boneModelMatrices);
});

test('death inherits each sampled rigidbody linear and angular velocity, not a shared root velocity',()=>{
  const def=definition();def.gravity={x:0,y:0,z:0};
  const current=new Float32Array([...matrix(0,0,0),...matrix(0,1,0),
    ...matrix(0,2,0),...matrix(0.2,2,0)]);
  const previousTorso=composeLocalMatrix({position:{x:-0.1,y:2,z:0},
    rotation:{x:0,y:0,z:-Math.sin(0.1),w:Math.cos(0.1)}});
  const previous=new Float32Array([...matrix(0,0,0),...matrix(0,1,0),
    ...previousTorso,...matrix(0.2,2,0)]);
  const runtime=createNativeDeathRuntime({
    definition:def,collisionScene:{boxes:[]},boneModelMatrices:current,
    modelMatrix:matrix(0,0,0),initialVelocity:{x:0.5,y:0,z:0},
    previousBoneModelMatrices:previous,previousModelMatrix:matrix(0,0,0),
    poseDeltaSeconds:0.1,
  });
  near(runtime.bodies[0].velocity.x,0);
  near(runtime.bodies[1].velocity.x,1);
  near(runtime.bodies[1].angularVelocity.z,2);
  near(runtime.bodies[0].angularVelocity.z,0);
  assert.ok(Array.from(runtime.boneModelMatrices).every(Number.isFinite));
});

test('a world-space off-centre impact rotates the struck bone but a centre hit does not',()=>{
  const side=create(),centre=create();
  const impulse={x:8,y:0,z:0};
  applyNativeDeathForce(side,{boneIndex:2,mode:'Impulse',vector:impulse,point:{x:0,y:2.5,z:0}});
  applyNativeDeathForce(centre,{boneIndex:2,mode:'Impulse',vector:impulse,point:{x:0,y:2,z:0}});
  near(side.bodies[1].velocity.x,centre.bodies[1].velocity.x);
  assert.ok(Math.abs(side.bodies[1].angularVelocity.z)>0);
  near(centre.bodies[1].angularVelocity.z,0);
  assert.ok(Math.hypot(...Object.values(side.bodies[1].angularVelocity))<=12+1e-8,
    'angular kick stays in the browser safety envelope');
  advanceNativeDeathRuntime(side,0.02);
  assert.ok(Array.from(side.boneModelMatrices).every(Number.isFinite));
});
