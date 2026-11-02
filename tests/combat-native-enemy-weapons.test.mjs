import test from 'node:test';
import assert from 'node:assert/strict';
import { selectNativeEnemyWeapon, selectNativeEnemyArchetype } from '../src/combat/native-enemy-weapons.js';
import { planNativeInitialSpawns } from '../src/combat/native-initial-spawn.js';
import { createNativeEnemyState,advanceNativeEnemyWeapon,runNativeEnemyGunAttack,consumeNativeEnemyVolley,runNativeEnemyMeleeAttack } from '../src/combat/native-enemy-runtime.js';
import { evaluateNativeMeleeDamage, sampleNativeMeleeTimeline } from '../src/animation/native-melee-events.js';
const weapons={Pistol:{},Shotgun:{},MachineGun:{},SniperRifle:{},Katana:{},Melee:{}};
const difficulty={PistolEnemies:10,ShotgunEnemies:5,MachineGunEnemies:1,SniperRifleEnemies:1,KatanaEnemies:1,MeleeEnemies:6,
  MaxActivePistolEnemies:1,MaxActiveShotgunEnemies:1,MaxActiveMachineGunEnemies:1,MaxActiveSniperRifleEnemies:1,MaxActiveKatanaEnemies:1,MaxActiveMeleeEnemies:1,
  KamperEnemies:40,MeleeBrawlerEnemies:15};
const actor=(family,hasWeapon=true)=>({alive:true,weaponFamily:family,reaction:{hasWeapon,dead:false}});
const settings={attackDelay:.1,alertDelay:.5,projectileSpeed:28,weaponSpeedMultiplier:1,difficultyWeaponSpeedMultiplier:1,
 walkingSpeed:2,runningSpeed:5,acceleration:10,afterglowDuration:.7,stopAimingTime:.05,alwaysAlert:false};
const p=(x=0,y=0,z=0)=>({x,y,z});
const input={scaledDeltaTime:0,unscaledDeltaTime:0,targetSight:true,sightMode:'all-directions',aimTargetInSight:true,
 aimReady:true,weaponInRightPosition:true,allowAttacking:true,canShot:true,active:true,animationTarget:p(10)};

test('weighted source families and current-weapon caps are selected at actual activation',()=>{
 assert.equal(selectNativeEnemyWeapon(difficulty,weapons,[],()=>0),'Pistol');
 assert.equal(selectNativeEnemyWeapon(difficulty,weapons,[actor('Pistol')],()=>0),'Shotgun');
 assert.equal(selectNativeEnemyWeapon(difficulty,weapons,[actor('Pistol',false)],()=>0),'Pistol');
 assert.equal(selectNativeEnemyWeapon(difficulty,weapons,Object.keys(weapons).map(f=>actor(f)),()=>.9),'Melee');
 assert.throws(()=>selectNativeEnemyWeapon(difficulty,{Pistol:{},Melee:{}},[],()=>0),/missing source enemy weapon family/);
 assert.equal(selectNativeEnemyArchetype('Melee',difficulty,false,()=>0),'OffensiveBrawler');
 assert.equal(selectNativeEnemyArchetype('Pistol',difficulty,true,()=>0),'KamperOffensive');
 assert.equal(selectNativeEnemyArchetype('Pistol',difficulty,false,()=>0),'Offensive');
});

test('machinegun uses source burst length and short versus long delays, not pickup ammo',()=>{
 const config={...settings,family:'MachineGun',seriesLength:3,longAttackDelay:.8};
 const state=createNativeEnemyState(config);
 for(let i=0;i<6;i++) {
  state.alertness=1;state.attackDelayRemaining=-1;state.targetNeedsReroll=false;
  assert.equal(runNativeEnemyGunAttack(state,config,{...input,aimReady:i%3===0},()=>0).shot,true);
  assert.equal(state.attackDelayRemaining,i%3===2 ? .8 : .1);
  const shots=consumeNativeEnemyVolley(state,config,p(),p(1),()=>0);
  assert.equal(shots.length,1);assert.equal(shots[0].speed,28);
 }
 assert.equal(state.seriesRemaining,3);
});

test('sniper first-shot alert gate and native zero-length series retain high speed and glass flags',()=>{
 const config={...settings,family:'SniperRifle',seriesLength:0,longAttackDelay:.7,firstShotDelay:.3,projectileSpeed:80};
 const state=createNativeEnemyState(config);state.alertness=1;state.attackDelayRemaining=-1;
 advanceNativeEnemyWeapon(state,config,.29);
 assert.equal(runNativeEnemyGunAttack(state,config,input,()=>0).shot,false);
 advanceNativeEnemyWeapon(state,config,.02);
 assert.equal(runNativeEnemyGunAttack(state,config,input,()=>0).shot,true);
 const [shot]=consumeNativeEnemyVolley(state,config,p(),p(1));
 assert.equal(shot.speed,80);assert.equal(shot.sniper,true);assert.equal(shot.goThroughGlass,true);
 assert.equal(state.attackDelayRemaining,.7);assert.equal(state.haveBeenSeen,false,'sniper has no OnBulletSpawn call');
});

test('shotgun expands late with original pellet count and current weapon direction',()=>{
 const config={...settings,family:'Shotgun',pelletCount:6};
 const state=createNativeEnemyState(config);state.alertness=1;state.attackDelayRemaining=-1;
 runNativeEnemyGunAttack(state,config,input,()=>0);
 const shots=consumeNativeEnemyVolley(state,config,p(2),p(0,0,1),()=>.5);
 assert.equal(shots.length,6);assert.equal(shots.filter(s=>s.muzzleFlash).length,1);
 assert.ok(shots.every(s=>s.direction.z>.98));assert.ok(shots.every(s=>s.position.x===2));
 assert.deepEqual(consumeNativeEnemyVolley(state,config,p(),p(1)),[]);
});

test('source clip damage events gate fists and katana independently of attack cooldown',()=>{
 const clip={events:[{id:'MeleeDamageStart',time:.3},{id:'MeleeDamageEnd',time:.5}]};
 assert.equal(evaluateNativeMeleeDamage(clip,.299).meleeDamage,false);
 assert.equal(evaluateNativeMeleeDamage(clip,.3).meleeDamage,true);
 assert.equal(evaluateNativeMeleeDamage(clip,.5).meleeDamage,false);
 assert.equal(evaluateNativeMeleeDamage(clip,.4,false).meleeDamage,false);
 const pose={active:true,playerAlive:true,inFront:true,enemyPosition:p(),playerPosition:p(.6,1.6),weaponPosition:p(0,1.5),
  inPunchAnimation:true,inHitAnimation:false,inWeaponAttackAnimation:false,meleeDamage:true,meleeWeaponDamage:false,katanaHit:false};
 assert.equal(runNativeEnemyMeleeAttack({...settings,family:'Melee',meleeAttackDistance:2},pose).kill,true);
 assert.equal(runNativeEnemyMeleeAttack({...settings,family:'Melee',meleeAttackDistance:2},{...pose,meleeDamage:false}).kill,false);
 assert.equal(runNativeEnemyMeleeAttack({...settings,family:'Katana',AttackDistance:1.75},{...pose,meleeWeaponDamage:true,katanaHit:true}).kill,true);
 assert.equal(runNativeEnemyMeleeAttack({...settings,family:'Katana',AttackDistance:1.75},{...pose,meleeWeaponDamage:true,katanaHit:null}).kill,false);
});

test('initial population comes from authored valid areas in chosen start cone/cylinder, not doors',()=>{
 const area=(id,x,z,extra={})=>({id,active:true,center:p(x,0,z),IgnoreRandomSpawning:false,ForceRotationTowardsPlayer:true,
  spawningCenters:[{position:p(x,.2,z),isValid:true}],...extra});
 const initial={starts:[{id:'start',position:p(0,1.6,0),forward:p(0,0,1),angle:60,SpawnDistanceHorizontal:20,SpawnDistanceVertical:4}],
  areas:[area('front',0,3),area('priority',2,4,{IgnoreRandomSpawning:true}),area('behind',0,-4),area('far',0,15)],
  weaponWeights:{Shotgun:1,Pistol:1,SniperRifle:100}};
 const result=planNativeInitialSpawns(initial,{InitialEnemySpawn:2,IgnoreInitialSpawnRestrictions:false},'start',()=>0);
 assert.deepEqual(result.map(value=>value.id),['priority','front']);
 assert.deepEqual(result.map(value=>value.weapon),['Shotgun','Pistol']);
 assert.equal(result[0].feet.y,.2,'exact serialized center is retained');
 assert.equal(initial.areas.length,4,'restart source arrays are not mutated');
 assert.throws(()=>planNativeInitialSpawns(initial,{InitialEnemySpawn:2},'missing',()=>0),/chosen source/);
});

test('caps retain source equality semantics, sniper exclusion, and inclusive archetype roll',()=>{
 assert.equal(selectNativeEnemyWeapon(difficulty,weapons,[actor('Pistol'),actor('Pistol')],()=>0),'Pistol');
 const sniperOnly={...difficulty,PistolEnemies:0,ShotgunEnemies:0,MachineGunEnemies:0,KatanaEnemies:0,MeleeEnemies:0};
 assert.equal(selectNativeEnemyWeapon(sniperOnly,weapons,[],()=>0),'SniperRifle');
 assert.equal(selectNativeEnemyWeapon(sniperOnly,weapons,[],()=>0,{disableSnipers:true}),'Melee');
 assert.equal(selectNativeEnemyArchetype('Melee',{...difficulty,MeleeBrawlerEnemies:100},false,()=>100/101),'Offensive');
 assert.equal(selectNativeEnemyArchetype('SniperRifle',difficulty,true,()=>0),'Offensive');
});

test('area cylinder is centered below the authored eye, not above the feet',()=>{
 const area=(id,y)=>({id,active:true,center:p(0,y,2),IgnoreRandomSpawning:false,ForceRotationTowardsPlayer:true,
   spawningCenters:[{position:p(0,y,2),isValid:true}]});
 const initial={starts:[{id:'start',position:p(0,3.6,0),forward:p(0,0,1),angle:80,
   SpawnDistanceHorizontal:20,SpawnDistanceVertical:1}],areas:[area('feet-level',2),area('eye-level',3.6)],
   weaponWeights:{Melee:1}};
 const result=planNativeInitialSpawns(initial,{InitialEnemySpawn:2,IgnoreInitialSpawnRestrictions:false},'start',()=>0);
 assert.deepEqual(result.map(value=>value.id),['feet-level']);
 assert.equal(result[0].weapon,'Melee');
});

test('controller timeline keeps observed damage flags discrete and clears on interruption',()=>{
 const frame=(time,damage)=>({time,meleeDamage:false,meleeWeaponDamage:damage,inPunchAnimation:false,
   inHitAnimation:damage,inWeaponAttackAnimation:damage});
 const sequence={timeline:[frame(0,false),frame(.2,true),frame(.4,false)]};
 assert.equal(sampleNativeMeleeTimeline(sequence,.199).meleeWeaponDamage,false);
 assert.equal(sampleNativeMeleeTimeline(sequence,.2).meleeWeaponDamage,true);
 assert.equal(sampleNativeMeleeTimeline(sequence,.399).meleeWeaponDamage,true);
 assert.equal(sampleNativeMeleeTimeline(sequence,.4).meleeWeaponDamage,false);
 assert.equal(sampleNativeMeleeTimeline(sequence,.3,false).meleeWeaponDamage,false);
 assert.equal(sampleNativeMeleeTimeline(sequence,1).inWeaponAttackAnimation,false);
 assert.throws(()=>sampleNativeMeleeTimeline({timeline:[{time:0},{time:1}]},.5),/missing captured/);
});
