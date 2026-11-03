import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativePlayerAnimation, selectNativePlayerClip } from '../src/characters/native-player-controller.js';

// Entirely authored non-cuboid fixture. No MCD asset, native executable,
// extracted animation curve or proprietary capture is shipped in tests.
const identity=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const frame=x=>({positions:[x,0,0],rotations:[0,0,0,1],scales:[1,1,1]});
const leaf=clip=>({children:[],thresholds:[],clip});
const exit=(to,time,duration=0,fixedDuration=true)=>({to,hasExitTime:true,exitTime:time,duration,
  fixedDuration,offset:0,interruptionSource:0,conditions:[]});
const state=(name,clip,speed=1,transitions=[],speedParameter='TimeScale')=>
  ({name,nodes:[leaf(clip)],speed,speedParameter,transitions});

function fixture() {
  const profile={weaponType:0,weaponSubType:0,idleVariant:0,handPosition:[0,0,0],
    containerPosition:[0,0,0],containerRotation:[0,0,0,1],containerScale:[1,1,1],
    attackDelay:0.5,pickupDuration:0.4,restFrameInverse:identity(),handsVisible:true};
  const names=['idle','left','right','throw','pull','hold','catch','back'];
  const clips=Object.fromEntries(names.map(name=>[name,{duration:1,sampleRate:2,
    frames:[frame(0),frame(name==='idle'?0:name==='left'?2:4),frame(0)],loop:name==='hold'}]));
  const states=[state('Hands.Idle','idle',0),state('Hands.Attack','left',1,[exit(0,0.5,0.2,false)]),
    state('Hands.Throw','throw',1,[exit(0,1)]),state('Hands.Pull.Pull_Start','pull',1,[exit(4,1)],null),
    state('Hands.Pull.Pull_Idle','hold',10,[]),state('Hands.Pull.Pull_End','catch',1,[exit(0,0.4,0.25)],null),
    state('Hands.Pull.Pull_Start_Backwards','back',-1,[exit(0,0.5,0.2)],null)];
  states[1].nodes=[{parameter:'LeftRight',thresholds:[-1,1],children:[1,2]},leaf('left'),leaf('right')];
  states[4].transitions=[{...exit(5,0,0.1),hasExitTime:false,conditions:[{parameter:'WeaponInHand',mode:1,value:0}]},
    {...exit(6,0,0.1),hasExitTime:false,conditions:[{parameter:'HideHand',mode:1,value:0}]}];
  const transition=(from,to,duration)=>({from,to,duration,source:'authored fixture transition'});
  return {
    schemaVersion:1,weaponBone:0,
    parameters:{TimeScale:0,LeftRight:1,AttackVariant:0,ThrowVariant:0},
    states,
    anyTransitions:[['Attack',1],['Throw',2],['Pull',3]].map(([parameter,to])=>
      ({...exit(to,0),hasExitTime:false,conditions:[{parameter,mode:1,value:0}]})),
    // The genuine scene exporter uses pickup_<pathId>, not profiles.katana.
    profiles:{unarmed:profile,pickup_4201:{...profile,weaponType:1,weaponSubType:1002,itemFromBone:identity()},
      pistol:{...profile,weaponType:2,weaponSubType:2000,handsVisible:false,fireAnimation:'pistol'},
      object:{...profile,weaponType:9,handsVisible:false,drawingStyle:'throwable'}},
    skin:{schemaVersion:1,source:{owner:'authored fixture'},
      coordinates:{space:'fixture',axes:'XYZ',units:'test units',
        quaternion:'xyzw',boneOrder:'parent first',inverseBindMatrices:'column-major',
        skinEquation:'boneModelMatrix * inverseBindMatrix * vertex',indices:'authored triangle'},
      bones:[{name:'weaponBone',parent:-1,position:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1]}],
      mesh:{positions:[0,0,0,1,0,0,0,1,0],normals:[0,0,1,0,0,1,0,0,1],indices:[0,1,2],
        indexComponentBits:16,submeshes:[{firstIndex:0,indexCount:3,baseVertex:0,topology:0}],
        weights:[1,0,0,0,1,0,0,0,1,0,0,0],jointIndices:Array(12).fill(0),inverseBindMatrices:identity()},
      clips,transitions:{'left->idle':transition('left','idle',0.2),'right->idle':transition('right','idle',0.2),
        'catch->idle':transition('catch','idle',0.25),'hold->catch':transition('hold','catch',0.1),
        'hold->back':transition('hold','back',0.1),'back->idle':transition('back','idle',0.2)}},
  };
}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);

test('recovered discrete attack blend routes left/right and rejects unsupported fractional choice',()=>{
  const attack=fixture().states[1];
  assert.equal(selectNativePlayerClip(attack,{LeftRight:-1}),'left');
  assert.equal(selectNativePlayerClip(attack,{LeftRight:1}),'right');
  assert.throws(()=>selectNativePlayerClip(attack,{LeftRight:0}),/Fractional/);
});

test('item-keyed Dojo katana action uses source clip and actual posed socket, then exits',()=>{
  const driver=createNativePlayerAnimation(fixture(),{random:()=>0.5});
  driver.equip('pickup_4201',{animate:false});
  driver.action('attack'); driver.update(0.1,1);
  const active=driver.sample();
  assert.equal(active.profileId,'pickup_4201');
  assert.equal(active.descriptor.clip,'left');
  assert.equal(active.state,'Hands.Attack');
  near(active.pose.boneModelMatrices[12],0.4);
  near(active.itemMatrix[12],-active.weaponBoneMatrix[12]);
  driver.update(0.45,1);
  assert.equal(driver.sample().state,'Hands.Idle');
  assert.equal(driver.sample().descriptor.transition.fromClip,'left');
  driver.update(0.3,1);
  assert.equal(driver.sample().descriptor.transition,null);
  driver.action('attack');
  assert.equal(driver.sample().descriptor.clip,'right');
});

test('player hands honor unscaled Animator clock and narrow source low-time multiplier',()=>{
  const driver=createNativePlayerAnimation(fixture());
  driver.equip('pickup_4201',{animate:false}); driver.action('attack');
  driver.update(1,0); near(driver.sample().descriptor.time,0);
  driver.update(1,0.005); near(driver.sample().descriptor.time,0.005);
  driver.update(1,0.006); near(driver.sample().descriptor.time,0.065);
  driver.update(1,0.01); near(driver.sample().descriptor.time,0.075);
});

test('pistol is hands-free, source draw and recoil affect the container, not a fake gripping pose',()=>{
  const driver=createNativePlayerAnimation(fixture(),{random:()=>0.5});
  driver.equip('pistol');
  assert.equal(driver.sample().handsVisible,false);
  assert.equal(driver.sample().pose,null);
  near(driver.sample().rootMatrix[12],-0.65);
  driver.update(0.5,1);
  assert.deepEqual(driver.sample().rootMatrix,identity());
  driver.action('fire'); driver.update(0.125,1);
  assert.ok(driver.sample().containerMatrix[13]>0);
  driver.update(0.5,1);
  driver.sample().weaponDeltaMatrix.forEach((value,i)=>near(value,identity()[i]));
});

test('throw drops the equipped source profile immediately and does not retain an animated blade',()=>{
  const driver=createNativePlayerAnimation(fixture());
  driver.equip('pickup_4201',{animate:false}); driver.action('throw');
  assert.equal(driver.sample().profileId,'unarmed');
  assert.equal(driver.sample().state,'Hands.Throw');
  assert.equal(driver.sample().itemMatrix,null);
  driver.update(1.1,1);
  assert.equal(driver.sample().state,'Hands.Idle');
});

test('source reset clears active attack, timers and alternate-hand state',()=>{
  const driver=createNativePlayerAnimation(fixture(),{random:()=>0});
  driver.action('attack'); driver.update(.1,1);
  assert.equal(driver.sample().descriptor.clip,'left');
  driver.equip('pistol'); driver.action('fire'); driver.update(.1,1);
  driver.reset();
  const reset=driver.sample();
  assert.equal(reset.profileId,'unarmed');
  assert.equal(reset.state,'Hands.Idle');
  assert.equal(reset.descriptor.transition,null);
  assert.deepEqual(reset.rootMatrix,identity());
  driver.action('attack');
  assert.equal(driver.sample().descriptor.clip,'left');
});

test('unknown source equipment, bad packet and negative dt fail closed',()=>{
  assert.throws(()=>createNativePlayerAnimation(null),/packet/);
  const driver=createNativePlayerAnimation(fixture());
  assert.throws(()=>driver.equip('katana'),/unavailable/);
  assert.throws(()=>driver.update(-1,1),/clocks/);
  assert.throws(()=>driver.action('fire'),/firearm/);
});
