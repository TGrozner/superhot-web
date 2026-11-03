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
