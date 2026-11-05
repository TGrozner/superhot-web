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

test('overlapping Dojo shards recover at the real face and cannot immediately drive back inside',()=>{
  const physics=context(),position={x:0,y:-0.02,z:0};
  const velocity={x:1.5,y:-3,z:0};
  const contacts=moveNativeFragmentSphere(physics.collisionScene,position,velocity,
    {x:0,y:0,z:0},0.1,physics.material);
  const floorContact=contacts.find(c=>c.collider.id==='floor' && c.penetration>0);
  assert.ok(floorContact,'the initial overlap must produce a real source floor contact');
  assert.ok(Math.abs(floorContact.point.y)<1e-7,
    'penetration impact point must lie on the floor face, not behind the sphere');
  assert.ok(position.y>=0.1-1e-7,'depenetration must keep the sphere outside');
  assert.ok(velocity.y>=-1e-9,'inward velocity must not push the shard straight back inside');
  assert.equal(velocity.x,1.5,'the tangent of a hit still permits a sideways slide');

  const wallPos={x:2.005,y:2,z:0},wallVelocity={x:-4,y:0,z:0};
  const wallContacts=moveNativeFragmentSphere(physics.collisionScene,wallPos,wallVelocity,
    {x:0,y:0,z:0},0.1,physics.material);
  const side=wallContacts.find(c=>c.collider.id==='wall' && c.penetration>0);
  assert.ok(side);
  assert.ok(Math.abs(side.point.x-2.01)<1e-7,
    'embedded shards must report the nearest real wall face');
  assert.ok(wallPos.x>=2.11-1e-7);
  assert.ok(wallVelocity.x>=-1e-9);
});

test('source contact friction stops same-frame shard skating without suppressing slick surfaces',()=>{
  // A long swept Web frame must not cross the remaining floor after the
  // impact already stopped the shard's lateral velocity.
  const ground=prepareNativeCollision([
    {id:'floor',worldMatrix:matrix(0,-0.5,0),center:[0,0,0],size:[30,1,30]},
  ]);
  const input=()=>({position:{x:0,y:0.3,z:0},velocity:{x:2,y:-4,z:0}});
  const material={bounciness:0,dynamicFriction:2,staticFriction:2,bounceThreshold:2};
  const stuck=input();
  const contacts=moveNativeFragmentSphere(ground,stuck.position,stuck.velocity,
    {x:4,y:-1,z:0},0.1,material);
  assert.ok(contacts.some(c=>c.collider.id==='floor'));
  assert.ok(stuck.position.x>0.7 && stuck.position.x<1,
    'a fully arrested tangent must not consume the rest of the frame as sideways motion');
  assert.ok(Math.abs(stuck.velocity.x)<1e-9);
  assert.ok(stuck.position.y>=0.1-1e-7);

  const slick=input();
  moveNativeFragmentSphere(ground,slick.position,slick.velocity,
    {x:4,y:-1,z:0},0.1,{...material,dynamicFriction:0,staticFriction:0});
  assert.ok(slick.position.x>3.9,
    'a real zero-friction material must preserve the remaining tangent sweep');
});

test('a source-restitution hit rebounds during the remaining swept frame, not one frame late',()=>{
  const ground=prepareNativeCollision([
    {id:'floor',worldMatrix:matrix(0,-0.5,0),center:[0,0,0],size:[30,1,30]},
  ]);
  const make=()=>({position:{x:0,y:0.3,z:0},velocity:{x:0,y:-4,z:0}});
  const material={bounciness:0.5,dynamicFriction:0,bounceThreshold:2};
  const bouncing=make();
  const hits=moveNativeFragmentSphere(ground,bouncing.position,bouncing.velocity,
    {x:0,y:-1,z:0},0.1,material);
  assert.ok(hits.some(hit=>hit.collider.id==='floor'));
  assert.ok(Math.abs(bouncing.velocity.y-2)<1e-8,
    'existing source restitution must reflect impact velocity');
  assert.ok(Math.abs(bouncing.position.y-0.5)<1e-5,
    'remaining frame must include the outward rebound after floor contact');
  const resting=make();
  moveNativeFragmentSphere(ground,resting.position,resting.velocity,
    {x:0,y:-1,z:0},0.1,{...material,bounciness:0});
  assert.ok(Math.abs(resting.position.y-0.1)<1e-5,
    'inelastic materials must not invent upward displacement');
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

test('Web hitch budget limits shard travel to 100ms while HDR debris expires on full elapsed time',()=>{
  // Count sweeps, not wall-clock microbenchmarks. An interrupted 300ms Web
  // frame must not throw fragments through all 300ms of ballistic travel.
  let scans=0;
  const emptyScene={get boxes(){scans++;return [];}};
  const physics={...context(),collisionScene:emptyScene,gravity:{x:0,y:0,z:0}};
  const bounded=body(); bounded.velocity={x:10,y:0,z:0};
  const contacts=advanceNativeFragmentBody(bounded,0.3,{...physics,limitWebFrameWork:true});
  const boundedReads=scans;
  assert.deepEqual(contacts,[]);
  assert.ok(Math.abs(bounded.position.x-1)<1e-8,
    'budgeted Web shards must simulate only 100ms of a 300ms hitch');
  scans=0;
  const uncapped=body();uncapped.velocity={x:10,y:0,z:0};
  advanceNativeFragmentBody(uncapped,0.3,physics);
  assert.ok(scans>boundedReads*5,'a long frame must not perform all 150Hz collision queries');
  assert.ok(Math.abs(uncapped.position.x-3)<1e-8,
    'explicit unbudgeted native-study calls still consume the full elapsed time');
  const at10fps=body();at10fps.velocity={x:10,y:0,z:0};
  advanceNativeFragmentBody(at10fps,0.1,{...physics,limitWebFrameWork:true});
  assert.ok(Math.abs(at10fps.position.x-bounded.position.x)<1e-8,
    'a normal 10 FPS frame remains fully simulated');
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
  assert.ok(Math.abs(angle(touched.shards[0])-angle(split.shards[0]))<1e-9,
    'post-contact spin should be stable across frame subdivisions');
});

test('grounded Dojo shards sleep without repeated sweeps, then wake on lost support or new impulse',()=>{
  const physics=context();
  physics.material={...physics.material,bounciness:0,staticFriction:2};
  const shard=body();
  shard.position={x:0,y:0.1,z:0};
  shard.velocity={x:0,y:0,z:0};
  const web={...physics,limitWebFrameWork:true};
  for(let i=0;i<24;i++)advanceNativeFragmentBody(shard,1/60,web);
  assert.equal(shard.webShardResting,true,'sustained sourced floor contact should settle the shard');
  const position={...shard.position};
  const boxes=physics.collisionScene.boxes;
  let reads=0;
  Object.defineProperty(physics.collisionScene,'boxes',{
    configurable:true,get(){reads++;return boxes;},
  });
  assert.deepEqual(advanceNativeFragmentBody(shard,0.3,web),[],
    'asleep fragments have no collision events to duplicate');
  assert.deepEqual(shard.position,position,'sleep holds the source-collision-admitted position');
  assert.ok(reads<=2,'resting shard should check support, not sweep the world again');
  physics.collisionScene.setEnabled('floor',false);
  advanceNativeFragmentBody(shard,0.2,web);
  assert.equal(shard.webShardResting,false,'disabled authored floor must wake the shard');
  assert.ok(shard.position.y<position.y,'gravity resumes when the supported surface vanishes');
  physics.collisionScene.setEnabled('floor',true);
  shard.position={x:0,y:0.1,z:0};
  shard.velocity={x:0,y:0,z:0};
  for(let i=0;i<24;i++)advanceNativeFragmentBody(shard,1/60,web);
  assert.equal(shard.webShardResting,true);
  shard.velocity={x:2,y:0,z:0};
  advanceNativeFragmentBody(shard,1/60,web);
  assert.equal(shard.webShardResting,false,'an external impulse cannot remain frozen');
  assert.ok(shard.position.x>0,'the shard resumes physical motion');
});

test('sleeping shards reuse warm authored support lookup instead of scanning distant Dojo boxes',()=>{
  const floor={id:'floor',worldMatrix:matrix(0,-0.5,0),center:[0,0,0],size:[30,1,30]};
  const distant=Array.from({length:96},(_,i)=>({
    id:'distant-'+i,worldMatrix:matrix(100+i*3,-0.5,0),
    center:[0,0,0],size:[1,1,1],
  }));
  const collisionScene=prepareNativeCollision([floor,...distant]);
  let boxReads=0;
  collisionScene.boxes=new Proxy(collisionScene.boxes,{
    get(target,key,receiver){
      if(typeof key==='string' && Number.isInteger(Number(key)))boxReads++;
      return Reflect.get(target,key,receiver);
    },
  });
  const shard=body();
  shard.position={x:0,y:0.1,z:0};
  shard.velocity={x:0,y:0,z:0};
  const web={...context(),collisionScene,limitWebFrameWork:true};
  web.material={...web.material,bounciness:0,staticFriction:2};
  for(let i=0;i<24;i++)advanceNativeFragmentBody(shard,1/60,web);
  assert.equal(shard.webShardResting,true,'only confirmed contact may sleep');
  boxReads=0;
  for(let i=0;i<36;i++)assert.deepEqual(advanceNativeFragmentBody(shard,1/60,web),[]);
  assert.ok(boxReads<6,'the hot resting path must not inspect 97 distant boxes per frame');
  collisionScene.setEnabled('floor',false);
  advanceNativeFragmentBody(shard,1/60,web);
  assert.equal(shard.webShardResting,false,'live collider disable must still wake the shard');
});

test('one long falling frame does not count airborne time toward grounded shard sleep',()=>{
  const physics=context();
  physics.material={...physics.material,bounciness:0};
  const shard=body();
  shard.position={x:0,y:0.3,z:0};
  shard.velocity={x:0,y:-1,z:0};
  advanceNativeFragmentBody(shard,0.3,{...physics,limitWebFrameWork:true});
  assert.ok(shard.position.y>=0.1-1e-7);
  assert.notEqual(shard.webShardResting,true,
    'a late floor contact in one browser hitch is not 300ms of continuous support');
  const flight=body();
  flight.position={x:0,y:3,z:0};
  flight.velocity={x:0,y:0,z:0};
  const noGround={...physics,collisionScene:{boxes:[]},gravity:{x:0,y:0,z:0},limitWebFrameWork:true};
  for(let i=0;i<30;i++)advanceNativeFragmentBody(flight,1/60,noGround);
  assert.notEqual(flight.webShardResting,true,'no source collider means no static sleep');
});


test('many distant Dojo boxes are pruned from shard sweeps without changing exact near contacts',()=>{
  const authored=(id,x,y)=>({id,worldMatrix:matrix(x,y,0),center:[0,0,0],size:[12,1,12]});
  const floorBox=authored('floor',0,-0.5);
  const distant=Array.from({length:96},(_,i)=>authored('far-'+i,100+i*4,-0.5));
  const scene=prepareNativeCollision([floorBox,...distant]);
  const nearOnly=prepareNativeCollision([floorBox]);
  let boxReads=0;
  scene.boxes=new Proxy(scene.boxes,{
    get(target,key,receiver) {
      if(typeof key==='string' && key!=='' && Number.isInteger(Number(key)))boxReads++;
      return Reflect.get(target,key,receiver);
    },
  });
  const material={bounciness:0,dynamicFriction:0,staticFriction:0,bounceThreshold:1};
  const run=collisionScene=>{
    const position={x:0,y:0.22,z:0},velocity={x:0,y:-3,z:0};
    const hits=moveNativeFragmentSphere(collisionScene,position,velocity,
      {x:0,y:-0.4,z:0},0.1,material);
    return {position,velocity,hits:hits.map(hit=>({t:hit.t,id:hit.collider?.id}))};
  };
  const expected=run(nearOnly);
  assert.ok(expected.hits.some(hit=>hit.id==='floor'));
  assert.deepEqual(run(scene),expected,'broadphase must not change contacts or response');
  boxReads=0; // index was built on the first call; hot shard steps must not scan all boxes
  assert.deepEqual(run(scene),expected);
  assert.ok(boxReads<16,'a warm fragmented Dojo scene must not enumerate every distant collider');
  scene.setEnabled('floor',false);
  assert.deepEqual(run(scene).hits,[],'a cached index must respect a disabled source support');
});
