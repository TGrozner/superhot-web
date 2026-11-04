import test from 'node:test';
import assert from 'node:assert/strict';
import { composeLocalMatrix } from '../src/scenes/graph.js';
import { prepareNativeCollision } from '../src/scenes/native-collision.js';
import { advanceNativeFragmentBody, moveNativeFragmentSphere } from '../src/vfx/native-fragment-physics.js';
import { createGunPickupShardRuntime, advanceGunPickupShardRuntime } from '../src/vfx/gun-pickup-shatter.js';

const matrix=(x,y,z)=>composeLocalMatrix({position:{x,y,z}});
const scene=()=>prepareNativeCollision([
  {id:'floor',worldMatrix:matrix(0,-0.5,0),center:[0,0,0],size:[30,1,30]},
  {id:'wall',worldMatrix:matrix(2,2,0),center:[0,0,0],size:[0.02,4,30]},
]);
const context=()=>({collisionScene:scene(),gravity:{x:0,y:-9.81,z:0},fixedDelta:1/150,
  material:{bounciness:0.5,dynamicFriction:2,bounceThreshold:2}});
const body=()=>({position:{x:0,y:1,z:0},velocity:{x:30,y:0,z:0},collisionRadius:0.1,drag:0});

test('authored fragments sweep against thin walls without tunneling',()=>{
  const shard=body(),contacts=advanceNativeFragmentBody(shard,0.2,context());
  assert.ok(contacts.some(c=>c.collider.id==='wall'));
  assert.ok(shard.position.x<1.9);
  assert.ok(shard.velocity.x<0);
});

test('source gravity reaches floor contacts, while scaled pause freezes fragments',()=>{
  const shard=body();shard.velocity={x:0,y:-3,z:0};
  const before=structuredClone(shard);
  assert.deepEqual(advanceNativeFragmentBody(shard,0,context()),[]);
  assert.deepEqual(shard,before);
  const contacts=advanceNativeFragmentBody(shard,0.5,context());
  assert.ok(contacts.some(c=>c.collider.id==='floor'));
  assert.ok(shard.position.y>=0.1-1e-7);
});

test('collision-aware authored draw keeps the existing HDR disappearance clock',()=>{
  const physics=context();
  const runtime=createGunPickupShardRuntime({
    shards:[{id:'original-shard',modelMatrix:matrix(0,0.2,0),originalScale:1,collisionRadius:0.1}],
    parentVelocity:{x:0,y:-30,z:0},attachedToEnemy:false,
    torqueSamples:[{x:0,y:0,z:0}],fadeDelays:[0],gravity:physics.gravity,physics,
  });
  const [draw]=advanceGunPickupShardRuntime(runtime,0.1);
  assert.ok(draw.contacts.some(c=>c.collider.id==='floor'));
  assert.ok(draw.modelMatrix[13]>=0.1-1e-7);
  assert.ok(Math.abs(draw.localScale-(1-(1/3)**2))<1e-10);
  advanceGunPickupShardRuntime(runtime,0.21);
  assert.equal(draw.visible,false);
  advanceGunPickupShardRuntime(runtime,0);
  assert.equal(draw.destroyed,true);
});

test('a fragment initially overlapping its impact floor is recovered above the actual face',()=>{
  const shard=body();shard.position={x:0,y:0.02,z:0};shard.velocity={x:0,y:-1,z:0};
  const contacts=advanceNativeFragmentBody(shard,0.1,context());
  assert.ok(contacts.some(c=>c.penetration>0));
  assert.ok(shard.position.y>=0.1-1e-7);
});

test('resting contacts stop low-speed normal bounce and source friction stops sliding',()=>{
  const physics=context();physics.material.staticFriction=2;
  const shard=body();shard.position={x:0,y:0.1,z:0};shard.velocity={x:0.01,y:0,z:0};
  advanceNativeFragmentBody(shard,0.2,physics);
  assert.ok(Math.abs(shard.velocity.x)<1e-9);
  assert.ok(Math.abs(shard.velocity.y)<1e-9);
  assert.ok(shard.position.y>=0.1-1e-7);
});

test('an exhausted corner sweep never advances unchecked displacement through either surface',()=>{
  const physics=context(),position={x:1.8,y:0.2,z:0},velocity={x:40,y:-40,z:0};
  moveNativeFragmentSphere(physics.collisionScene,position,velocity,{x:20,y:-20,z:0},0.1,physics.material);
  assert.ok(position.x<=1.89+1e-7);assert.ok(position.y>=0.1-1e-7);
});

test('disabled source colliders remain disabled for fragment contacts',()=>{
  const physics=context();physics.collisionScene.setEnabled('floor',false);
  const shard=body();shard.position={x:0,y:0.2,z:0};shard.velocity={x:0,y:-5,z:0};
  const contacts=advanceNativeFragmentBody(shard,0.1,physics);
  assert.equal(contacts.some(c=>c.collider.id==='floor'),false);
  assert.ok(shard.position.y<0);
});

test('Web hitch budget keeps moving authored shards while limiting scene sweeps and skipping invisible HDR debris',()=>{
  // Count scene reads, not wall-clock microbenchmarks. The uncapped baseline
  // does ~45 native-sized steps here; the live Dojo must remain <=4.
  let scans=0;
  const emptyScene={get boxes(){scans++;return [];}};
  const physics={...context(),collisionScene:emptyScene,gravity:{x:0,y:0,z:0}};
  const bounded=body(); bounded.velocity={x:10,y:0,z:0};
  const contacts=advanceNativeFragmentBody(bounded,0.3,{...physics,limitWebFrameWork:true});
  const boundedReads=scans;
  assert.deepEqual(contacts,[]);
  assert.ok(Math.abs(bounded.position.x-3)<1e-8,'no dropped displacement after a hitch');
  scans=0;
  const uncapped=body();uncapped.velocity={x:10,y:0,z:0};
  advanceNativeFragmentBody(uncapped,0.3,physics);
  assert.ok(scans>boundedReads*5,'a long frame must not perform all 150Hz collision queries');
  assert.ok(Math.abs(uncapped.position.x-bounded.position.x)<1e-8);
  assert.throws(()=>advanceNativeFragmentBody(body(),0.1,{...physics,limitWebFrameWork:'yes'}),/required/);

  const group=createGunPickupShardRuntime({
    shards:[{id:'measured-shard',modelMatrix:matrix(0,0.2,0),originalScale:1,collisionRadius:0.1}],
    parentVelocity:{x:10,y:0,z:0},attachedToEnemy:false,
    torqueSamples:[{x:0,y:0,z:0}],fadeDelays:[1.5],gravity:physics.gravity,physics,
  });
  scans=0;
  const [live]=advanceGunPickupShardRuntime(group,0.3);
  assert.equal(live.visible,true);
  assert.ok(scans<=boundedReads+2,'live shard draw must use the same per-frame physics budget');
  scans=0;
  advanceGunPickupShardRuntime(group,2);
  assert.equal(live.visible,false);
  assert.deepEqual(live.contacts,[]);
  assert.equal(scans,0,'invisible fragments must never query scene collision');
});

test('authored torque visibly spins real shards about their swept collider center, independent of frame split',()=>{
  const physics={
    collisionScene:{boxes:[]},gravity:{x:0,y:0,z:0},fixedDelta:1/150,
    material:{bounciness:0,dynamicFriction:0,bounceThreshold:2},
  };
  const create=(torque)=>createGunPickupShardRuntime({
    shards:[{id:'offset-shard',modelMatrix:matrix(1,2,3),originalScale:1,
      collisionRadius:0.1,collisionCenter:{x:1.25,y:2,z:3}}],
    parentVelocity:{x:0,y:0,z:0},attachedToEnemy:false,
    torqueSamples:[torque],fadeDelays:[1.5],gravity:physics.gravity,physics,
  });
  const full=create({x:0,y:0,z:1}),split=create({x:0,y:0,z:1});
  const [shard]=advanceGunPickupShardRuntime(full,0.25);
  advanceGunPickupShardRuntime(split,0.1);
  const [splitShard]=advanceGunPickupShardRuntime(split,0.15);
  // Unit sampled torque produces 90 degrees in 250ms by Web-only visual
  // tuning. This is NOT an extracted inertia or PhysX angular velocity.
  assert.ok(Math.abs(shard.modelMatrix[0])<1e-10);
  assert.ok(Math.abs(shard.modelMatrix[1]-1)<1e-10);
  assert.ok(Math.abs(shard.modelMatrix[4]+1)<1e-10);
  assert.ok(Math.abs(shard.modelMatrix[5])<1e-10);
  assert.ok(Math.abs(shard.modelMatrix[12]-1.25)<1e-10);
  assert.ok(Math.abs(shard.modelMatrix[13]-1.75)<1e-10);
  assert.ok(Math.abs(shard.modelMatrix[12]+shard.modelMatrix[0]*0.25-shard.position.x)<1e-10);
  assert.ok(Math.abs(shard.modelMatrix[13]+shard.modelMatrix[1]*0.25-shard.position.y)<1e-10);
  for(let i=0;i<16;i++)assert.ok(Math.abs(shard.modelMatrix[i]-splitShard.modelMatrix[i])<1e-10);
  assert.equal(shard.sourceMatrix[12],1,'original source transform is never rotated or translated');

  const noTorque=create({x:0,y:0,z:0});
  const [still]=advanceGunPickupShardRuntime(noTorque,0.25);
  assert.equal(still.modelMatrix[0],1);
  assert.equal(still.modelMatrix[1],0);
  assert.equal(still.modelMatrix[12],1);
  assert.equal(still.modelMatrix[13],2);
});


test('authored shard spin settles after a real contact, not during flight or scaled pause',()=>{
  const physics=context();
  physics.gravity={x:0,y:0,z:0};
  const create=(physical)=>createGunPickupShardRuntime({
    shards:[{id:'spin-shard',modelMatrix:matrix(0,0.2,0),originalScale:1,
      ...(physical?{collisionRadius:0.1}:{})}],
    parentVelocity:{x:0,y:-30,z:0},attachedToEnemy:false,
    torqueSamples:[{x:0,y:0,z:1}],fadeDelays:[1.5],
    gravity:physics.gravity,...(physical?{physics}:{})
  });
  const touched=create(true),split=create(true),airborne=create(false);
  advanceGunPickupShardRuntime(touched,0.1);
  assert.ok(touched.shards[0].contacts.some(c=>c.collider.id==='floor'));
  assert.equal(touched.shards[0].firstStaticContactAt,0.1);
  const atContact=Array.from(touched.shards[0].modelMatrix);
  const angleFromFirstContact=Math.atan2(atContact[1],atContact[0]);
  advanceGunPickupShardRuntime(touched,0);
  assert.deepEqual(Array.from(touched.shards[0].modelMatrix),atContact,
    'scaled pause must not change angular pose');
  advanceGunPickupShardRuntime(touched,0.2);
  advanceGunPickupShardRuntime(split,0.1);
  advanceGunPickupShardRuntime(split,0.1);
  advanceGunPickupShardRuntime(split,0.1);
  advanceGunPickupShardRuntime(airborne,0.3);
  const angle=shard=>Math.atan2(shard.modelMatrix[1],shard.modelMatrix[0]);
  assert.ok(angle(touched.shards[0])>angleFromFirstContact);
  assert.ok(angle(touched.shards[0])<angle(airborne.shards[0]),
    'confirmed ground contact must slow visible spin');
  near(angle(touched.shards[0]),angle(split.shards[0]));
});
