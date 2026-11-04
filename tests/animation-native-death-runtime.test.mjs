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


test('ragdoll uses indexed authored collider bounds while honoring live enable state',()=>{
  const colliders=[
    {id:'support',worldMatrix:matrix(0,0.5,0),center:[0,0,0],size:[50,1,50]},
    {id:'large-x-span-away-in-y',worldMatrix:matrix(0,100,0),
      center:[0,0,0],size:[3000,1,1]},
    ...Array.from({length:120},(_,i)=>({
      id:'distant-'+i,worldMatrix:matrix(200+i*3,0,0),
      center:[0,0,0],size:[1,1,1],
    })),
  ];
  const scene=prepareNativeCollision(colliders);
  let boundsVisited=0;
  for(const box of scene.boxes){
    let enabled=box.enabled;
    Object.defineProperty(box,'enabled',{
      configurable:true,
      get(){boundsVisited++;return enabled;},
      set(value){enabled=value;},
    });
  }
  const runtime=create(scene),first=advanceNativeDeathRuntime(runtime,1/150);
  assert.ok(first.contacts.some(contact=>contact.collider.id==='support'),
    'the original, source-bounded support still resolves penetration');
  assert.ok(boundsVisited<200,
    'a local ragdoll should not scan 122 distant collider states per contact pass');
  scene.boxes[0].enabled=false;
  const disabled=create(scene),next=advanceNativeDeathRuntime(disabled,1/150);
  assert.equal(next.contacts.some(contact=>contact.collider.id==='support'),false,
    'the shared source enable state must remain live after indexing');
  const near=prepareNativeCollision([{
    id:'new-support',worldMatrix:matrix(0,0.5,0),
    center:[0,0,0],size:[50,1,50],
  }]);
  scene.boxes.push(near.boxes[0]);
  const extended=create(scene),added=advanceNativeDeathRuntime(extended,1/150);
  assert.ok(added.contacts.some(contact=>contact.collider.id==='new-support'),
    'changing the scene box list must invalidate the indexed broadphase');
});

test('Web ragdoll keeps natural 30 Hz fall without an unbounded hitch catch-up',()=>{
  const regular=create(),budgeted=create();
  const frame=1/30;
  advanceNativeDeathRuntime(regular,frame);
  const timely=advanceNativeDeathRuntime(budgeted,frame,{limitWebFrameWork:true});
  near(timely.droppedWebSimulationTime,0);
  for(const part of [1,2]){
    assert.ok(Math.abs(regular.getBoneWorldMatrix(part)[13]-
      budgeted.getBoneWorldMatrix(part)[13])<0.006,
      '30 fps ragdolls must not hover behind an otherwise identical normal frame');
  }
  const hitched=create();
  const delayed=advanceNativeDeathRuntime(hitched,0.3,{limitWebFrameWork:true});
  assert.ok(delayed.droppedWebSimulationTime>0.25 &&
    delayed.droppedWebSimulationTime<0.3,
    'large tab/GPU stalls still discard PBD work beyond the bounded four steps');
  near(hitched.elapsed,0.3);
  assert.ok(hitched.bodies[0].velocity.y>-0.5,
    'a single hitch must not integrate the full fall in one unstable catch-up');
  assert.ok(Array.from(hitched.boneModelMatrices).every(Number.isFinite));
});


test('Web corpses settle only on live grounded contact, sleep, then wake for real impacts or lost support',()=>{
  const grounded=(scene=floor())=>{
    const def=definition();
    def.bodies=[def.bodies[0]];
    def.joints=[];
    const runtime=createNativeDeathRuntime({
      definition:def,collisionScene:scene,
      boneModelMatrices:new Float32Array([
        ...matrix(0,0,0),...matrix(0,0.1,0),
        ...matrix(0,1.1,0),...matrix(0.2,1.1,0),
      ]),
      modelMatrix:matrix(0,0,0),initialVelocity:{x:0,y:0,z:0},
    });
    for(let step=0;step<45;step++)
      advanceNativeDeathRuntime(runtime,1/60,{limitWebFrameWork:true});
    assert.equal(runtime.resting,true,'stable floor contacts should retire expensive PBD passes');
    return {runtime,scene};
  };

  const {runtime}=grounded();
  const settledPose=Array.from(runtime.boneModelMatrices);
  const beforeTime=runtime.elapsed;
  const tick=advanceNativeDeathRuntime(runtime,1/30,{limitWebFrameWork:true});
  assert.deepEqual(Array.from(runtime.boneModelMatrices),settledPose);
  assert.deepEqual(tick.contacts,[]);
  near(runtime.elapsed,beforeTime+1/30);

  const yBeforeHit=runtime.bodies[0].position.y;
  applyNativeDeathForce(runtime,{boneIndex:1,mode:'Impulse',vector:{x:0,y:12,z:0}});
  assert.equal(runtime.resting,false,'a later projectile must wake the solved body');
  advanceNativeDeathRuntime(runtime,1/60,{limitWebFrameWork:true});
  assert.ok(runtime.bodies[0].position.y>yBeforeHit+0.001,
    'woken upward impulse must move the body away from its support');

  const displaced=grounded();
  const originalY=displaced.runtime.bodies[0].position.y;
  displaced.scene.boxes[0].enabled=false;
  advanceNativeDeathRuntime(displaced.runtime,1/30,{limitWebFrameWork:true});
  assert.equal(displaced.runtime.resting,false,'disabled source support must wake physics');
  assert.ok(displaced.runtime.bodies[0].position.y<originalY-0.001,
    'body must fall when its support is removed');

  // A later lateral hit must slide along the ACTUAL support instead of being
  // stuck by the initial downward floor contact at sweep fraction t=0.
  const lateral=grounded();
  const xBefore=lateral.runtime.bodies[0].position.x;
  applyNativeDeathForce(lateral.runtime,{
    boneIndex:1,mode:'Impulse',vector:{x:12,y:0,z:0},
  });
  advanceNativeDeathRuntime(lateral.runtime,1/60,{limitWebFrameWork:true});
  assert.ok(lateral.runtime.bodies[0].position.x>xBefore+0.002,
    'floor t=0 contact must not cancel the horizontal impulse');
  assert.ok(lateral.runtime.bodies[0].position.y>=0.1-1e-6,
    'tangent slide must retain the authored floor boundary');

  // A lateral impulse is NOT permission to tunnel through an adjacent wall.
  const walled=grounded(prepareNativeCollision([
    {id:'floor',worldMatrix:matrix(0,-0.5,0),center:[0,0,0],size:[50,1,50]},
    {id:'wall',worldMatrix:matrix(0.65,0.5,0),center:[0,0,0],size:[0.2,1,10]},
  ]));
  applyNativeDeathForce(walled.runtime,{
    boneIndex:1,mode:'Impulse',vector:{x:120,y:0,z:0},
  });
  for(let i=0;i<6;i++)
    advanceNativeDeathRuntime(walled.runtime,1/60,{limitWebFrameWork:true});
  assert.ok(walled.runtime.bodies[0].position.x<=0.45+1e-5,
    'secondary tangent sweep must respect the real wall face');
});

test('Web floor contact damps residual ragdoll spin without damping airborne rotation',()=>{
  const def=definition();
  def.bodies=[def.bodies[0]];def.joints=[];
  const make=collisionScene=>createNativeDeathRuntime({
    definition:def,collisionScene,
    boneModelMatrices:new Float32Array([
      ...matrix(0,0,0),...matrix(0,0.1,0),
      ...matrix(0,1.1,0),...matrix(0.2,1.1,0),
    ]),
    modelMatrix:matrix(0,0,0),initialVelocity:{x:0,y:0,z:0},
  });
  const landed=make(floor()),airborne=make({boxes:[]});
  landed.bodies[0].angularVelocity={x:0,y:0,z:6};
  airborne.bodies[0].angularVelocity={x:0,y:0,z:6};
  const contact=advanceNativeDeathRuntime(landed,1/30);
  advanceNativeDeathRuntime(airborne,1/30);
  assert.ok(contact.contacts.some(c=>c.collider?.id==='floor' && c.normal.y>0.55),
    'angular settling must be backed by an actual static floor contact');
  assert.ok(landed.bodies[0].angularVelocity.z<5.8,
    'grounded post-impact limb spin should dissipate instead of spinning forever');
  near(airborne.bodies[0].angularVelocity.z,6);
  assert.ok(Array.from(landed.boneModelMatrices).every(Number.isFinite));
});


test('mid-frame floor glancing contact preserves surviving corpse slide, friction, and an adjacent wall',()=>{
  // A single authored sphere isolates swept contact from joint projection:
  // at y=0.3, radius=0.1, (4,-4) over 0.1s hits the real floor halfway.
  const floorBox={id:'floor',worldMatrix:matrix(0,-0.5,0),center:[0,0,0],size:[50,1,50]};
  const wallBox={id:'wall',worldMatrix:matrix(0.55,0.5,0),center:[0,0,0],size:[0.2,1,10]};
  const make=(boxes,friction)=>{
    const def=definition();
    def.bodies=[def.bodies[0]];def.joints=[];
    def.fixedDelta=0.1;def.solverIterations=1;
    def.gravity={x:0,y:0,z:0};
    def.material={bounciness:0,dynamicFriction:friction,staticFriction:friction,bounceThreshold:2};
    return createNativeDeathRuntime({
      definition:def,collisionScene:prepareNativeCollision(boxes),
      boneModelMatrices:new Float32Array([
        ...matrix(0,0,0),...matrix(0,0.3,0),
        ...matrix(0,1.3,0),...matrix(0.2,1.3,0),
      ]),
      modelMatrix:matrix(0,0,0),initialVelocity:{x:4,y:-4,z:0},
    });
  };
  const glancing=make([floorBox],0);
  const contacts=advanceNativeDeathRuntime(glancing,0.1).contacts;
  assert.ok(contacts.some(c=>c.collider?.id==='floor' && c.t>0.01 && c.t<0.99),
    'a true swept hit must occur strictly inside the frame');
  assert.ok(glancing.bodies[0].position.x>0.35,
    'the surviving floor tangent must move the corpse during this same step');
  assert.ok(glancing.bodies[0].position.y>=0.1-1e-5);

  const sticky=make([floorBox],2);
  advanceNativeDeathRuntime(sticky,0.1);
  assert.ok(sticky.bodies[0].position.x<0.3,
    'source material friction which already stopped x must not produce fake sliding');

  const corner=make([floorBox,wallBox],0);
  advanceNativeDeathRuntime(corner,0.1);
  assert.ok(corner.bodies[0].position.x<=0.35+1e-5,
    'the second sweep must still stop at the next authored wall');
  assert.ok(corner.bodies[0].position.y>=0.1-1e-5);
});


test('grounded t=0 impact spends horizontal displacement according to contact friction',()=>{
  // The body begins exactly touching an authored Dojo floor. It has enough
  // downward and lateral velocity to hit at t=0 rather than halfway through.
  // The collision adapter already applies source material friction to velocity;
  // the remaining same-frame motion must respect that reduced velocity too.
  const make=(friction)=>{
    const def=definition();
    def.bodies=[def.bodies[0]];def.joints=[];
    def.fixedDelta=0.1;def.solverIterations=1;
    def.gravity={x:0,y:0,z:0};
    def.material={bounciness:0,dynamicFriction:friction,staticFriction:friction,bounceThreshold:2};
    return createNativeDeathRuntime({
      definition:def,collisionScene:floor(),
      boneModelMatrices:new Float32Array([
        ...matrix(0,0,0),...matrix(0,0.1,0),
        ...matrix(0,1.1,0),...matrix(0.2,1.1,0),
      ]),
      modelMatrix:matrix(0,0,0),
      initialVelocity:{x:3,y:-1,z:0},
    });
  };
  const slick=make(0),grippy=make(3);
  const slickFrame=advanceNativeDeathRuntime(slick,0.1);
  const gripFrame=advanceNativeDeathRuntime(grippy,0.1);
  for(const frame of [slickFrame,gripFrame])
    assert.ok(frame.contacts.some(c=>c.collider?.id==='floor' && c.t<=1e-7),
      'friction comparison must use an actual t=0 source collider contact');
  assert.ok(slick.bodies[0].position.x>0.25,
    'a frictionless floor must preserve the sideways impulse in this frame');
  assert.ok(grippy.bodies[0].position.x<0.05,
    'high floor friction must stop the same-frame post-impact skid');
  for(const runtime of [slick,grippy]) {
    assert.ok(runtime.bodies[0].position.y>=0.1-1e-6,
      'the existing floor collision guard must remain active');
    assert.ok(Array.from(runtime.boneModelMatrices).every(Number.isFinite));
  }
});


test('extreme ragdoll impact velocity is bounded only for realtime Dojo, not ordinary hits',()=>{
  const def=definition();def.bodies=[def.bodies[0]];def.joints=[];
  def.gravity={x:0,y:0,z:0};def.solverIterations=1;
  const make=()=>create({boxes:[]},def);
  const violent=make();
  applyNativeDeathForce(violent,{partId:'Hips',mode:'Impulse',vector:{x:12000,y:0,z:0}});
  violent.bodies[0].angularVelocity={x:0,y:0,z:100};
  assert.ok(violent.bodies[0].velocity.x>100);
  const frame=advanceNativeDeathRuntime(violent,1/30,{limitWebFrameWork:true});
  assert.ok(Math.hypot(...Object.values(violent.bodies[0].velocity))<=24+1e-8);
  assert.ok(Math.hypot(...Object.values(violent.bodies[0].angularVelocity))<=16+1e-8);
  assert.ok(violent.bodies[0].position.x<1,
    'a strong impulse cannot launch an entire limb across the room in one 30Hz frame');
  assert.ok(Array.from(frame.boneModelMatrices).every(Number.isFinite));

  const ordinary=make();
  applyNativeDeathForce(ordinary,{partId:'Hips',mode:'Impulse',vector:{x:24,y:0,z:0}});
  advanceNativeDeathRuntime(ordinary,1/30,{limitWebFrameWork:true});
  near(ordinary.bodies[0].velocity.x,2);

  const sustained=make();
  applyNativeDeathForce(sustained,{
    partId:'Hips',mode:'ConstantForce',vector:{x:240000,y:0,z:0},duration:0.1,
  });
  advanceNativeDeathRuntime(sustained,1/30,{limitWebFrameWork:true});
  assert.ok(Math.hypot(...Object.values(sustained.bodies[0].velocity))<=24+1e-8);

  const research=make();
  applyNativeDeathForce(research,{partId:'Hips',mode:'Impulse',vector:{x:12000,y:0,z:0}});
  advanceNativeDeathRuntime(research,1/150);
  assert.ok(research.bodies[0].velocity.x>100,
    'unbudgeted physics keeps the original input for explicit research runs');
});
