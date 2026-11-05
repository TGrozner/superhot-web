import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeEnemyState, advanceNativeEnemySpeed, advanceNativeEnemyWeapon,
  runNativeEnemyGunAttack, consumeNativeEnemyShot, consumeNativeEnemyVolley,
  advanceNativeAimTarget } from '../src/combat/native-enemy-runtime.js';
const settings={attackDelay:.5,alertDelay:.5,projectileSpeed:28,weaponSpeedMultiplier:1,
  difficultyWeaponSpeedMultiplier:1,walkingSpeed:2,runningSpeed:5,acceleration:10,
  afterglowDuration:.7,stopAimingTime:.05,alwaysAlert:false};
const p=(x,y=0,z=0)=>({x,y,z});
const input=()=>({scaledDeltaTime:.01,unscaledDeltaTime:.01,targetSight:true,sightMode:'all-directions',
  aimTargetInSight:true,aimReady:true,weaponInRightPosition:true,allowAttacking:true,canShot:true,
  active:true,animationTarget:p(10)});
const ready=()=>({...createNativeEnemyState(settings),attackDelayRemaining:-.01,alertness:.6});
const run=(state,overrides={})=>runNativeEnemyGunAttack(state,settings,{...input(),...overrides},()=>.5);

test('movement accelerates to configured speed instead of guessed strafe/chase rate',()=>{
  const state=createNativeEnemyState(settings);
  assert.equal(advanceNativeEnemySpeed(state,settings,'running',.1),1);
  assert.equal(advanceNativeEnemySpeed(state,settings,'running',1),5);
  assert.equal(advanceNativeEnemySpeed(state,settings,'standing',.1),4);
  assert.equal(advanceNativeEnemySpeed(state,settings,'standing',1),0);
});

test('weapon cooldown uses scaled delta and BOTH source speed multipliers',()=>{
  const state=createNativeEnemyState(settings);
  advanceNativeEnemyWeapon(state,{...settings,weaponSpeedMultiplier:2,difficultyWeaponSpeedMultiplier:3},.05);
  assert.ok(Math.abs(state.attackDelayRemaining-.2)<1e-12);
  advanceNativeEnemyWeapon(state,settings,0);
  assert.ok(Math.abs(state.attackDelayRemaining-.2)<1e-12);
});

test('readiness uses strict source timer and alert thresholds',()=>{
  assert.equal(run({...ready(),attackDelayRemaining:0}).shot,false);
  assert.equal(run({...ready(),alertness:.5*1.05}).shot,false);
  assert.equal(run(ready()).shot,true);
});

test('nearer wall, unavailable sight, unready arm and muzzle obstruction block firing',()=>{
  for (const overrides of [{targetSight:false},{targetSight:null},{aimTargetInSight:false},
    {aimReady:false},{aimReady:null},{weaponInRightPosition:false},{weaponInRightPosition:null},
    {allowAttacking:false},{canShot:false},{active:false}]) {
    const state=ready();
    assert.equal(run(state,overrides).shot,false);
    assert.equal(consumeNativeEnemyShot(state,p(0)),null);
  }
});

test('afterglow is unscaled and muzzle blockage clears it',()=>{
  const state=ready();
  run(state,{sightMode:'normal',scaledDeltaTime:0,unscaledDeltaTime:.2});
  assert.ok(Math.abs(state.afterglowRemaining-.5)<1e-12);
  state.targetNeedsReroll=false;
  run(state,{targetSight:false,weaponInRightPosition:false,scaledDeltaTime:0,unscaledDeltaTime:0});
  assert.equal(state.afterglowRemaining,-1);
});

test('source delay is attackDelay plus at most ten percent, not arbitrary seconds',()=>{
  const state=ready();
  assert.equal(run(state).shot,true);
  assert.equal(state.attackDelayRemaining,.525);
  assert.equal(state.targetRerollWait,.05);
  assert.equal(state.targetNeedsReroll,true);
});

test('target reroll completion still skips that behavior tick',()=>{
  const state=ready(); state.targetNeedsReroll=true; state.targetRerollWait=.01;
  assert.equal(run(state,{scaledDeltaTime:.01}).rerollAimTarget,false);
  const result=run(state,{scaledDeltaTime:.01});
  assert.equal(result.rerollAimTarget,true);
  assert.equal(result.shot,false);
  assert.equal(run(state).shot,true);
});

test('bullet retains Attack target but samples muzzle only after socket animation',()=>{
  const state=ready(); const target=p(10);
  run(state,{animationTarget:target}); target.x=99;
  const bullet=consumeNativeEnemyShot(state,p(2));
  assert.deepEqual(bullet.position,p(2));
  assert.deepEqual(bullet.target,p(10));
  assert.deepEqual(bullet.velocity,p(28));
  assert.equal(bullet.shooterHaveBeenSeen,false);
  assert.equal(state.haveBeenSeen,true);
  assert.equal(consumeNativeEnemyShot(state,p(2)),null);
});

test('reload warning occurs once and not as a timer-generated shot',()=>{
  const state=createNativeEnemyState(settings); state.attackDelayRemaining=.09;
  assert.equal(run(state).reloadWarning,true);
  assert.equal(run(state).reloadWarning,false);
  assert.equal(state.pendingShot,null);
});

const aimSettings={speed:20,distanceToTarget:3,maxAngle:60,maxBodyToTargetAngle:65,immediateMode:false};
const pose={target:p(0,0,10),muzzle:p(0),bodyPosition:p(0),bodyForward:p(0,0,1),spineUp:p(0,0,-1)};
test('actual body arc and angular convergence gate aim, missing muzzle cannot shoot',()=>{
  const state={position:p(1,0,3),hadMuzzle:true};
  const frozen=advanceNativeAimTarget(state,aimSettings,pose,0);
  assert.equal(frozen.targetInSight,true); assert.equal(frozen.ready,false);
  const converged=advanceNativeAimTarget(state,aimSettings,pose,1);
  assert.equal(converged.ready,true);
  const behind=advanceNativeAimTarget(state,aimSettings,{...pose,target:p(0,0,-10)},1);
  assert.equal(behind.targetInSight,false); assert.equal(behind.ready,false); assert.ok(behind.turn);
  assert.equal(advanceNativeAimTarget(state,aimSettings,{...pose,muzzle:null},1).ready,false);
});

test('unknown source settings and clock domains fail explicitly',()=>{
  assert.throws(()=>createNativeEnemyState({...settings,difficultyWeaponSpeedMultiplier:undefined}),/difficultyWeaponSpeedMultiplier/);
  assert.throws(()=>run(ready(),{unscaledDeltaTime:undefined}),/unscaledDeltaTime/);
  assert.throws(()=>run(ready(),{aimReady:undefined}),/aimReady/);
});

test('J2 Web gunfeel: moving pistol shots get bounded sampled yaw, still shots retain exact aim',()=>{
  const pistol={...settings,family:'Pistol'};
  const standing=ready(),moving=ready();
  moving.speed=pistol.runningSpeed;
  const attack=state=>runNativeEnemyGunAttack(state,pistol,input(),()=>.5);
  assert.equal(attack(standing).shot,true);
  assert.equal(attack(moving).shot,true);
  assert.equal(standing.pendingShot.webMovingYawRange,0);
  assert.equal(moving.pendingShot.webMovingYawRange,.075);
  // The moving shooter stops before LateUpdate. The accepted shot must still
  // represent the actual ATTACK-time motion, not stale/current draw poses.
  moving.speed=0;
  let stationaryDraws=0,movingDraws=0;
  const straight=consumeNativeEnemyVolley(standing,pistol,p(),null,
    ()=>{stationaryDraws++;return .75;})[0];
  const scattered=consumeNativeEnemyVolley(moving,pistol,p(),null,
    ()=>{movingDraws++;return .75;})[0];
  assert.equal(stationaryDraws,0,'no jitter RNG for standing shooter');
  assert.equal(movingDraws,1,'one deterministic sample per moving pistol shot');
  assert.deepEqual(straight.direction,p(1));
  assert.ok(scattered.direction.z>.03 && scattered.direction.z<.075);
  assert.ok(scattered.direction.x>0.99 && scattered.direction.x<1);
  assert.ok(Math.abs(Math.hypot(scattered.velocity.x,scattered.velocity.y,
    scattered.velocity.z)-pistol.projectileSpeed)<1e-12);
  assert.deepEqual(scattered.target,p(10),'original accepted target is preserved');
  assert.equal(moving.pendingShot,null);
});

test('J2 Web gunfeel: failed moving-shot RNG does not erase deferred attack',()=>{
  const pistol={...settings,family:'Pistol'};
  const state=ready();state.speed=3;
  assert.equal(runNativeEnemyGunAttack(state,pistol,input(),()=>.5).shot,true);
  assert.throws(()=>consumeNativeEnemyVolley(state,pistol,p(),null,()=>NaN),/random/);
  assert.ok(state.pendingShot,'failed spawn preparation keeps committed shot');
  const [shot]=consumeNativeEnemyVolley(state,pistol,p(),null,()=>.5);
  assert.deepEqual(shot.direction,p(1));
  assert.equal(state.pendingShot,null);
});
