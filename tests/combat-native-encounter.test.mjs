import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeEncounter, advanceNativeEncounter, readyForVictory } from '../src/combat/native-encounter.js';
import { prepareNativeCollision, nativeSegmentHit } from '../src/scenes/native-collision.js';
import { advanceEnemyReaction } from '../src/animation/enemy-reaction.js';
import { advanceNativeEnemyWeapon, runNativeEnemyGunAttack } from '../src/combat/native-enemy-runtime.js';

// Entirely fabricated geometry/configuration; no private original assets.
const p=(x,y=0,z=0)=>({x,y,z});
const matrix=(x=0,y=0,z=0)=>[1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1];
const polygon=(index,vertices,edges=[])=>({index,vertices,vertex_count:vertices.length,edges});
const tile=(vertices,polygons)=>({identity:{owner:'synthetic',path_id:1,tile:0},vertices,polygons});
const box=(x,y,z,sx,sy,sz)=>({id:'test-wall',worldMatrix:matrix(x,y,z),center:[0,0,0],size:[sx,sy,sz]});
function scene() {
  return {
    navigation:{settings:{agentRadius:.4,agentHeight:1.8,agentClimb:.4,agentSlope:45},portals:[],
      tiles:[tile([[0,0,0],[-30,0,0],[-30,0,10],[0,0,10]],[polygon(0,[0,1,2,3])])]},
    anchors:{enemy:[{id:'door-a',worldMatrix:matrix(2,0,2),initialActiveInHierarchy:true,
      door:{redLightIntensityPickTime:1},source:{kind:'fabricated-marker'}}]},
    gameplay:{
      spawner:{StartDelay:0,SpawnDelay:1,EnemiesToKill:5,enemiesOverhead:10,MaxEnemiesOnScene:3,
        Endless:false,DontSpawnNearPlayer:false,DontSpawnNearEnemies:false,safeDistance:8,
        RemoveInactiveSpawnPoints:false,worldMatrix:matrix(0,1,0)},
      difficulty:{MinEnemiesToSpawn:6,MaxEnemiesToSpawn:7,MaxActiveEnemies:4,EnemieSpawnRate:.4,WeaponAttackSpeedMultiplier:1},
      enemy:{WalkingSpeed:2,RunningSpeed:5,Acceleration:10,StunTime:.75,AlwaysAlert:false,
        weaponSpeedMultiplier:1,canSeeAfterGlowTime:.5,stopAimingTime:.05,
        MinimumDistanceToPlayer:2,MeleeAttackDistance:1,AimHeight:1.6,health:0},
      weapon:{attackDelay:.5,alertDelay:.5,projectileSpeed:28},
    },
  };
}
function input(enemies=[],overrides={}) {
  return {scaledDeltaTime:0,unscaledDeltaTime:0,playerPosition:p(25,1.6,5),
    playerFeet:p(25,0,5),playerForward:p(0,0,1),enemies,...overrides};
}
function setup(data=scene(),colliders=[],rng=()=>0) {
  return createNativeEncounter(data,prepareNativeCollision(colliders),rng);
}
function firstSpawn(runtime,overrides={}) {
  const warning=advanceNativeEncounter(runtime,input([],overrides));
  assert.equal(warning[0].type,'door-warning');
  const events=advanceNativeEncounter(runtime,input([],{...overrides,unscaledDeltaTime:2}));
  const enemy=events.find(event=>event.type==='spawn')?.enemy;
  assert.ok(enemy);
  return enemy;
}

test('markers are not initial enemies; startup/door use unscaled time and spawn interval uses difficulty',()=>{
  const data=scene(); data.gameplay.spawner.StartDelay=3;
  const runtime=setup(data);
  assert.equal(runtime.actors.size,0);
  assert.equal(runtime.killTarget,6);
  assert.equal(runtime.spawner.enemiesLeft,16);
  assert.equal(runtime.spawnerSettings.spawnDelay,.4);
  assert.equal(runtime.spawnerSettings.maxEnemiesOnScene,4);
  assert.deepEqual(advanceNativeEncounter(runtime,input([],{unscaledDeltaTime:2.9})),[]);
  const warnings=advanceNativeEncounter(runtime,input([],{unscaledDeltaTime:.2}));
  assert.equal(warnings[0].type,'door-warning');
  assert.equal(warnings[0].delay,2);
  assert.deepEqual(advanceNativeEncounter(runtime,input([],{unscaledDeltaTime:1.7})),[]);
  const events=advanceNativeEncounter(runtime,input([],{unscaledDeltaTime:.2}));
  const enemy=events.find(event=>event.type==='spawn').enemy;
  assert.equal(enemy.reaction.health,2,'fresh health ignores replay health=0');
  assert.equal(enemy.reaction.hasWeapon,true);
  assert.equal(enemy.delay,0);
  assert.equal(enemy.phase,0);
  assert.equal(enemy.strafe,0);
  assert.deepEqual(p(enemy.x,enemy.y,enemy.z),p(2,0,2),'marker already browser-space, nav X mirrored once');
  assert.equal(enemy.runtime.speed,0);
  assert.match(runtime.limitation,/Web pistol/);
});

test('inclusive randomized restart target, overhead replenishment, and no empty-population victory',()=>{
  const runtime=setup(scene(),[],()=>.999);
  assert.equal(runtime.killTarget,7);
  assert.equal(runtime.spawner.enemiesLeft,17);
  assert.equal(readyForVictory(runtime,[]),false);
  let enemies=[];
  for (let frame=0;frame<250 && !readyForVictory(runtime,enemies);frame++) {
    const events=advanceNativeEncounter(runtime,input(enemies,{scaledDeltaTime:.5,unscaledDeltaTime:.5}));
    enemies.push(...events.filter(event=>event.type==='spawn').map(event=>event.enemy));
    assert.ok(enemies.filter(enemy=>enemy.alive).length+runtime.spawner.pending.length+runtime.arrivals.length<=4);
    const alive=enemies.find(enemy=>enemy.alive);
    if (alive) { alive.alive=false; alive.reaction.dead=true; }
    if (runtime.actors.size < runtime.killTarget) assert.equal(readyForVictory(runtime,enemies),false);
    enemies=enemies.filter(enemy=>enemy.alive);
  }
  assert.equal(runtime.killed,7);
  assert.equal(readyForVictory(runtime,enemies),true);
  assert.equal(runtime.spawner.pending.length,0);
  assert.equal(runtime.arrivals.length,0);
  assert.equal(runtime.spawner.enemiesLeft,0);
  assert.deepEqual(advanceNativeEncounter(runtime,input(enemies,{scaledDeltaTime:10,unscaledDeltaTime:10})),[]);
});

test('live actor removal is not a kill; target death cancels pending overhead arrivals',()=>{
  const data=scene(); data.gameplay.difficulty.MinEnemiesToSpawn=1; data.gameplay.difficulty.MaxEnemiesToSpawn=1;
  const runtime=setup(data), enemy=firstSpawn(runtime);
  assert.equal(readyForVictory(runtime,[]),false);
  advanceNativeEncounter(runtime,input([enemy],{scaledDeltaTime:.5,unscaledDeltaTime:.1}));
  assert.equal(runtime.spawner.pending.length,1);
  enemy.reaction.dead=true;
  assert.equal(readyForVictory(runtime,[enemy]),true);
  assert.equal(runtime.spawner.pending.length,0);
  assert.equal(runtime.killed,1);
  assert.equal(readyForVictory(runtime,[enemy]),true);
  assert.equal(runtime.killed,1,'death counted once');
});


test('disconnected source polygons do not receive direct-line fallback routes or spawn orders',()=>{
  const data=scene();
  data.navigation.tiles=[tile([[0,0,0],[-4,0,0],[-4,0,4],[0,0,4],[-20,0,0],[-30,0,0],[-30,0,10],[-20,0,10]],
    [polygon(0,[0,1,2,3]),polygon(1,[4,5,6,7])])];
  const runtime=setup(data);
  assert.deepEqual(advanceNativeEncounter(runtime,input([],{scaledDeltaTime:1,unscaledDeltaTime:3})),[]);
  assert.equal(runtime.spawner.enemiesLeft,16);
  assert.equal(runtime.spawner.pending.length,0);
});

test('capsule stops at a thin wall even with a long routed travel segment',()=>{
  const runtime=setup(scene(),[box(5,1,5,.1,2,10)]), enemy=firstSpawn(runtime);
  advanceNativeEncounter(runtime,input([enemy],{scaledDeltaTime:10}));
  assert.ok(enemy.x<=4.550001);
  assert.ok(enemy.x>=2);
  assert.equal(enemy.encounter.route,null,'collision invalidates consumed route cursor');
});

test('close visible player stops an armed actor, but occluded player still causes chase',()=>{
  const data=scene(); data.gameplay.enemy.MinimumDistanceToPlayer=10;
  const overrides={playerFeet:p(8,0,2),playerPosition:p(8,1.6,2)};
  const clear=setup(data), clearEnemy=firstSpawn(clear,overrides);
  advanceNativeEncounter(clear,input([clearEnemy],{...overrides,scaledDeltaTime:.5}));
  assert.equal(clearEnemy.x,2);
  assert.equal(clearEnemy.encounter.visible,true);
  const blocked=setup(data,[box(6,1,2,.1,2,4)]), blockedEnemy=firstSpawn(blocked,overrides);
  advanceNativeEncounter(blocked,input([blockedEnemy],{...overrides,scaledDeltaTime:.5}));
  assert.equal(blockedEnemy.encounter.visible,false);
  assert.ok(blockedEnemy.x>2);
});

test('stun pauses movement, cancels deferred shots, leaves clock to parent and resumes unarmed running',()=>{
  const runtime=setup(), enemy=firstSpawn(runtime);
  enemy.runtime.pendingShot={target:p(25,1.6,5)};
  enemy.reaction.stunRemaining=.75;
  enemy.reaction.hasWeapon=false;
  advanceNativeEncounter(runtime,input([enemy],{scaledDeltaTime:.5}));
  assert.equal(enemy.x,2);
  assert.equal(enemy.reaction.stunRemaining,.75,'encounter never advances reaction twice');
  assert.equal(enemy.runtime.pendingShot,null);
  assert.equal(enemy.encounter.canAttack,false);
  advanceEnemyReaction(enemy.reaction,.75);
  advanceNativeEncounter(runtime,input([enemy],{scaledDeltaTime:.5}));
  assert.equal(enemy.runtime.speed,5);
  assert.ok(enemy.x>2);
  assert.equal(enemy.reaction.hasWeapon,false,'resume never silently rearms');
  assert.equal(enemy.clock,0,'parent owns animation clock');
});

test('occupied chase cannot cross teammates or spawn a second actor on occupied feet',()=>{
  const runtime=setup(), enemy=firstSpawn(runtime);
  const blocker={id:'other',x:4,y:0,z:2.260869565217391,alive:true,active:true};
  advanceNativeEncounter(runtime,input([enemy,blocker],{scaledDeltaTime:1,unscaledDeltaTime:0}));
  assert.ok(enemy.x<blocker.x,'blocked follower never crosses teammate in one frame');
  assert.ok(Math.hypot(enemy.x-blocker.x,enemy.z-blocker.z)>=.8-1e-6,'swept body spacing still holds');
  assert.ok(Math.abs(enemy.z-2)>.05,'follower tries a real navmesh-safe lateral detour');
  const events=advanceNativeEncounter(runtime,input([enemy,blocker],{scaledDeltaTime:0,unscaledDeltaTime:2}));
  assert.equal(events.some(event=>event.type==='spawn'),false);
  assert.equal(runtime.arrivals.length,1);
});

test('J3 Web squad unjamming: followers pass an ally without teleporting or crossing bodies',()=>{
  const data=scene();
  data.gameplay.enemy.MinimumDistanceToPlayer=1;
  const near={playerFeet:p(8,0,2),playerPosition:p(8,1.6,2)};
  const runtime=setup(data), follower=firstSpawn(runtime,near);
  const leader={id:'squad-leader',x:3.2,y:0,z:2,alive:true,active:true};
  let detoured=false,passed=false;
  for(let frame=0;frame<25;frame++) {
    const before=p(follower.x,follower.y,follower.z);
    advanceNativeEncounter(runtime,input([follower,leader],{...near,scaledDeltaTime:.2}));
    const spacing=Math.hypot(follower.x-leader.x,follower.z-leader.z);
    assert.ok(spacing>=.8-1e-6,'squad member never passes through the leader');
    assert.ok(Math.hypot(follower.x-before.x,follower.z-before.z)<=1+1e-6,
      'each frame is bounded by the actual movement budget');
    detoured ||= Math.abs(follower.z-2)>.12;
    passed ||= follower.x>leader.x+.15;
  }
  assert.ok(detoured,'a path blocked by a teammate produces a lateral escape');
  assert.ok(passed,'the follower eventually advances past the teammate');
  assert.equal(follower.reaction.dead,false,'tactic never creates damage');
  assert.equal(follower.encounter.canAttack,false,'absent muzzle is still not firing permission');
});

test('attack permission requires actual muzzle inputs and clear cast, never fake AimTarget facts',()=>{
  const runtime=setup(), enemy=firstSpawn(runtime);
  advanceNativeEncounter(runtime,input([enemy]));
  assert.equal(enemy.encounter.canAttack,false);
  enemy.muzzlePosition=p(2,1.4,2); enemy.muzzleForward=p(1,0,0);
  advanceNativeEncounter(runtime,input([enemy]));
  assert.equal(enemy.encounter.canAttack,true);
  runtime.sightCollision=prepareNativeCollision([box(5,1,5,.1,2,10)]);
  advanceNativeEncounter(runtime,input([enemy]));
  assert.equal(enemy.encounter.canAttack,false);
  assert.equal(enemy.runtime.pendingShot,null);
});

test('J3 Web fair fire: a clear high muzzle cannot shoot at a player hidden from enemy eyes',()=>{
  // Fabricated low cover: eye->player is blocked, muzzle->player is clear.
  // Neither an afterglow nor an ally callout is a license for wallhack shots.
  const data=scene();
  data.gameplay.enemy.MinimumDistanceToPlayer=10;
  const near={playerFeet:p(9,0,2),playerPosition:p(9,1.6,2)};
  const runtime=setup(data),enemy=firstSpawn(runtime,near);
  enemy.muzzlePosition=p(2,3.6,2);
  enemy.muzzleForward=p(1,0,0);
  advanceNativeEncounter(runtime,input([enemy],{...near}));
  assert.equal(enemy.encounter.visible,true);
  assert.equal(enemy.encounter.canAttack,true,'actual eye and muzzle sight permits a shot');

  runtime.sightCollision=prepareNativeCollision([box(5,1.5,2,.2,1.8,3)]);
  assert.equal(nativeSegmentHit(runtime.sightCollision,enemy.muzzlePosition,near.playerPosition),null,
    'the fabricated elevated muzzle still has an unobstructed flight path');
  advanceNativeEncounter(runtime,input([enemy],{...near}));
  assert.equal(enemy.encounter.visible,false,'the actual enemy eye is screened by low cover');
  assert.equal(enemy.encounter.canAttack,false,
    'remembered player coordinates plus a clear muzzle must not grant new fire permission');
  assert.deepEqual(enemy.encounter.webLastSeenFeet,near.playerFeet,
    'the actor retains its last witnessed feet for investigation');

  runtime.sightCollision=prepareNativeCollision([]);
  advanceNativeEncounter(runtime,input([enemy],{...near}));
  assert.equal(enemy.encounter.visible,true);
  assert.equal(enemy.encounter.canAttack,true,'real reacquisition restores permission to shoot');
});

test('source sight uses browser coordinates once and reattempts when camera forward changes',()=>{
  const data=scene(); data.gameplay.spawner.DontSpawnNearPlayer=true;
  data.anchors.enemy[0].worldMatrix=matrix(2,0,2);
  const runtime=setup(data), facing=p(23,0,3);
  assert.deepEqual(advanceNativeEncounter(runtime,input([],{playerForward:facing})),[]);
  assert.equal(runtime.spawner.enemiesLeft,16);
  const events=advanceNativeEncounter(runtime,input([],{playerForward:p(-23,0,-3)}));
  assert.equal(events[0].type,'door-warning');
});

test('ground snap below the baked surface does not trap an actor on route reprojection',()=>{
  const data=scene();
  for (const vertex of data.navigation.tiles[0].vertices) vertex[1]=.05;
  const runtime=setup(data,[box(15,-.5,5,30,1,10)]), enemy=firstSpawn(runtime);
  for (let frame=0;frame<4;frame++) {
    advanceNativeEncounter(runtime,input([enemy],{scaledDeltaTime:.2}));
  }
  assert.ok(enemy.x>2.5);
  assert.ok(Math.abs(enemy.y)<1e-5);
});

test('an existing actor never chases straight across disconnected source polygons',()=>{
  const data=scene();
  data.navigation.tiles=[tile([[0,0,0],[-4,0,0],[-4,0,4],[0,0,4],[-20,0,0],[-30,0,0],[-30,0,10],[-20,0,10]],
    [polygon(0,[0,1,2,3]),polygon(1,[4,5,6,7])])];
  const runtime=setup(data);
  const nearby={playerFeet:p(3,0,3),playerPosition:p(3,1.6,3)};
  const enemy=firstSpawn(runtime,nearby);
  advanceNativeEncounter(runtime,input([enemy],{scaledDeltaTime:2}));
  assert.equal(enemy.x,2);
  assert.equal(enemy.z,2);
  assert.equal(enemy.encounter.route,null);
  assert.equal(enemy.runtime.speed,0);
});


test('Dojo door matures a source factory order before choosing its active weapon, otherwise reports an explicit Web fallback', () => {
  // Synthetic fixtures only: IDs, weights, delays and prefabs here are NOT
  // original MCD assets or evidence of the deployed Dojo difficulty.
  const data=scene(), collision=prepareNativeCollision([]);
  const child={factoryId:'test-factory-in-spawner',gameObjectId:'test-inactive-child',
    activeInHierarchy:false,enabled:true,weaponSelector:'BasedOnDifficulty',
    aiArchetypeSelector:'BasedOnDifficulty'};
  const outside={factoryId:'test-unrelated-factory',gameObjectId:'test-unrelated-child',
    activeInHierarchy:true,enabled:true,weaponSelector:'Shotgun',
    aiArchetypeSelector:'Offensive'};
  const context={
    sceneName:'SHRL_Dojo2',buildIndex:10,
    catalog:{spawnerGameObjectId:'test-spawner',
      nodes:[
        {gameObjectId:'root',parentGameObjectId:null},
        {gameObjectId:'test-spawner',parentGameObjectId:'root'},
        {gameObjectId:'test-inactive-child',parentGameObjectId:'test-spawner'},
        {gameObjectId:'test-unrelated-child',parentGameObjectId:'root'},
      ],factories:[outside,child]},
    difficulty:{PistolEnemies:10,MeleeEnemies:0,
      MaxActivePistolEnemies:4,MaxActiveMeleeEnemies:4,
      KamperEnemies:0,MeleeBrawlerEnemies:0},
    availableWeapons:{
      Pistol:{prefabId:'synthetic-pistol-prefab',verifiedActiveInDojo:true},
      Melee:{prefabId:'synthetic-melee-prefab',verifiedActiveInDojo:true},
    },
    familySettings:{Pistol:{attackDelay:.25,projectileSpeed:13},Melee:{}},
    baseSettings:{attackDelay:.5,alertDelay:.5,projectileSpeed:28,
      weaponSpeedMultiplier:1,difficultyWeaponSpeedMultiplier:1,
      walkingSpeed:2,runningSpeed:5,acceleration:10,
      afterglowDuration:.5,stopAimingTime:.05,alwaysAlert:false},
    campingPointsAvailable:false,
  };
  let nativeDraws=0;
  const active=createNativeEncounter(data,collision,()=>{nativeDraws++;return 0;},{sourceEnemyActivation:context});
  assert.equal(active.sourceFactoryPlan.status,'qualified');
  assert.deepEqual(active.sourceFactoryPlan.templates.map(x=>x.factoryId),[child.factoryId]);
  const before=advanceNativeEncounter(active,input());
  assert.equal(before[0].type,'door-warning');
  assert.equal(active.actors.size,0,'weapon draw and actor creation wait for actual door order');
  const drawsAtWarning=nativeDraws;
  const issued=advanceNativeEncounter(active,input([],{unscaledDeltaTime:2}));
  const spawn=issued.find(event=>event.type==='spawn');
  assert.ok(spawn);
  assert.ok(nativeDraws>drawsAtWarning,'weapon family is sampled at actual factory activation');
  assert.equal(spawn.activation.status,'qualified');
  assert.equal(spawn.activation.factoryId,child.factoryId);
  assert.equal(spawn.activation.prefabId,'synthetic-pistol-prefab');
  assert.equal(spawn.enemy.weaponFamily,'Pistol');
  assert.equal(spawn.enemy.activeWeaponSettings.attackDelay,.25);
  assert.equal(spawn.enemy.runtime.attackDelayRemaining,.25);
  assert.equal(spawn.enemy.activeWeaponSettings.projectileSpeed,13);

  const unverified=createNativeEncounter(data,collision,()=>0,{
    sourceEnemyActivation:{...context,
      availableWeapons:{...context.availableWeapons,
        Pistol:{prefabId:'synthetic-pistol-prefab',verifiedActiveInDojo:false}}},
  });
  advanceNativeEncounter(unverified,input());
  const denied=advanceNativeEncounter(unverified,input([],{unscaledDeltaTime:2}))
    .find(event=>event.type==='spawn');
  assert.ok(denied);
  assert.equal(denied.activation.status,'web-pistol-fallback');
  assert.equal(denied.activation.reason,'selected-family-active-prefab-unverified');
  assert.equal(denied.enemy.weaponFamily,'Pistol');
  assert.equal(denied.enemy.runtime.attackDelayRemaining,data.gameplay.weapon.attackDelay);
  assert.equal(denied.enemy.activeWeaponSettings,undefined,
    'SH-05 keeps the existing Web settings when provenance is incomplete');

  const missing=createNativeEncounter(data,collision,()=>0,{
    sourceEnemyActivation:{...context,difficulty:null},
  });
  assert.equal(missing.sourceFactoryPlan.status,'blocked');
  assert.equal(missing.sourceFactoryPlan.reason,'active-factory-evidence-incomplete');
});


test('J3 Web strafes: armed enemies alternate safe lateral lanes instead of camping the firing line',()=>{
  // Synthetic Web-only tuning, never source MCD speed/timing data. The
  // existing real encounter loop consumes this without an extra main hook.
  const data=scene();data.gameplay.enemy.MinimumDistanceToPlayer=10;
  const near={playerFeet:p(8,0,2),playerPosition:p(8,1.6,2)};
  const clear=setup(data), enemy=firstSpawn(clear,near);
  enemy.clock=1.6;
  enemy.muzzlePosition=p(2,1.4,2);
  enemy.muzzleForward=p(1,0,0);
  const before=p(enemy.x,enemy.y,enemy.z);
  advanceNativeEncounter(clear,input([enemy],{...near,scaledDeltaTime:.2}));
  assert.ok(Math.abs(enemy.z-before.z)>.05,'qualified armed actor strafes near the visible player');
  assert.ok(Math.abs(enemy.x-before.x)<.001,'movement is tangential to the player');
  assert.equal(enemy.walking,true,'existing skin animation gets the movement flag');
  assert.equal(enemy.encounter.route,null,'strafe invalidates any stale chase corridor');
  const moved=p(enemy.x,enemy.y,enemy.z);
  enemy.clock=3.5; // outside the 1.35 s Web movement window
  advanceNativeEncounter(clear,input([enemy],{...near,scaledDeltaTime:.2}));
  assert.deepEqual(p(enemy.x,enemy.y,enemy.z),moved,'brief pause restores readable shot windows');
  enemy.clock=1.6;
  enemy.reaction.stunRemaining=.7;
  advanceNativeEncounter(clear,input([enemy],{...near,scaledDeltaTime:.2}));
  assert.deepEqual(p(enemy.x,enemy.y,enemy.z),moved,'stun still prevents movement');

  const crowded=setup(data), sideEnemy=firstSpawn(crowded,near);
  sideEnemy.clock=1.6;
  sideEnemy.muzzlePosition=p(2,1.4,2);
  sideEnemy.muzzleForward=p(1,0,0);
  const blocker={id:'web-lane-blocker',x:2,y:0,z:1.05,alive:true,active:true};
  advanceNativeEncounter(crowded,input([sideEnemy,blocker],{...near,scaledDeltaTime:.2}));
  assert.ok(sideEnemy.z>2,'occupied first lane causes a real reverse sidestep');
  assert.ok(Math.hypot(sideEnemy.x-blocker.x,sideEnemy.z-blocker.z)>=.8,
    'no crowd clipping or actor teleport');
});

test('J3 Web peeking: a body-visible enemy sidesteps low cover until its real muzzle line clears',()=>{
  // Fabricated cover and values, not an MCD claim. The already-live encounter
  // loop updates the actor; no new main.js input, traces or weapon rules.
  const data=scene();
  data.gameplay.enemy.MinimumDistanceToPlayer=10;
  const near={playerFeet:p(8,0,5),playerPosition:p(8,1.6,5)};
  const encounter=setup(data,[box(5,.65,5,.15,1.3,1.5)]);
  const enemy=firstSpawn(encounter,near);
  enemy.z=5;
  const originalZ=enemy.z;
  let opened=false;
  for(let step=0;step<13;step++) {
    enemy.clock=1.6+step*.2;
    // In the browser SH-14 supplies the updated animated muzzle each frame.
    enemy.muzzlePosition=p(enemy.x,.3,enemy.z);
    enemy.muzzleForward=p(1,0,0);
    advanceNativeEncounter(encounter,input([enemy],{...near,scaledDeltaTime:.2}));
    assert.equal(enemy.encounter.visible,true,'eye remains over fabricated cover');
    if(step===0) {
      assert.equal(enemy.encounter.canAttack,false,'blocked muzzle cannot fire');
      assert.ok(Math.abs(enemy.z-originalZ)>.05,'actor seeks a safe side lane instead of freezing');
    }
    if(enemy.encounter.canAttack) { opened=true; break; }
  }
  assert.ok(opened,'repositioning reveals an actual unobstructed muzzle ray');
  assert.ok(Math.abs(enemy.z-originalZ)>1,'actor physically moved rather than bypassing collision');
  assert.ok(enemy.x<4.5,'capsule never jumps through the low cover while peeking');

  const missing=setup(data,[box(5,.65,5,.15,1.3,1.5)]);
  const blind=firstSpawn(missing,near);
  blind.z=5; blind.clock=1.6;
  advanceNativeEncounter(missing,input([blind],{...near,scaledDeltaTime:.2}));
  assert.equal(blind.encounter.canAttack,false);
  assert.deepEqual(p(blind.x,blind.y,blind.z),p(2,0,5),
    'unknown muzzle does not authorize speculative peeking or shooting');
});

test('J3 Web crossfire: living allies block muzzle shots and trigger safe flanking, not ghost bullets',()=>{
  const data=scene();
  data.gameplay.enemy.MinimumDistanceToPlayer=10;
  const near={playerFeet:p(8,0,2),playerPosition:p(8,1.6,2)};
  const runtime=setup(data), shooter=firstSpawn(runtime,near);
  const ally={id:'web-ally',x:4,y:0,z:2,alive:true,active:true};
  shooter.clock=1.6;
  shooter.muzzlePosition=p(2,1.4,2);
  shooter.muzzleForward=p(1,0,0);
  const group=[shooter,ally];
  advanceNativeEncounter(runtime,input(group,{...near,scaledDeltaTime:.2}));
  assert.equal(shooter.encounter.visible,true,'empty world keeps line of sight');
  assert.equal(shooter.encounter.webAllyBlockingShot,true,'standing ally occupies the muzzle lane');
  assert.equal(shooter.encounter.canAttack,false,'cannot authorize shooting through ally');
  assert.ok(Math.abs(shooter.z-2)>.05,'already wired tactic seeks an actual lateral shooting lane');

  let cleared=false;
  for(let i=1;i<12;i++){
    shooter.clock=1.6+i*.2;
    shooter.muzzlePosition=p(shooter.x,1.4,shooter.z); // simulated updated GPU socket
    advanceNativeEncounter(runtime,input(group,{...near,scaledDeltaTime:.2}));
    if(shooter.encounter.canAttack){ cleared=true; break; }
  }
  assert.ok(cleared,'swept/navmesh-safe sidesteps eventually clear ally');
  assert.equal(shooter.encounter.webAllyBlockingShot,false);
  assert.ok(Math.hypot(shooter.x-ally.x,shooter.z-ally.z)>.8,
    'shooter never clips through the blocking ally');

  shooter.x=2;shooter.z=2;shooter.muzzlePosition=p(2,1.4,2);
  ally.alive=false;
  advanceNativeEncounter(runtime,input(group,{...near,scaledDeltaTime:0}));
  assert.equal(shooter.encounter.canAttack,true,'dead ally no longer blocks fire');
  ally.alive=true;ally.x=10;ally.z=2;
  advanceNativeEncounter(runtime,input(group,{...near,scaledDeltaTime:0}));
  assert.equal(shooter.encounter.canAttack,true,'ally beyond the target does not occlude');
  ally.x=4;ally.z=3;
  advanceNativeEncounter(runtime,input(group,{...near,scaledDeltaTime:0}));
  assert.equal(shooter.encounter.canAttack,true,'ally outside the capsule radius does not occlude');
});

test('J3 Web close-range pressure: armed enemies backpedal safely when rushed, never while shot-locked or stunned',()=>{
  // Synthetic geometry, Web-authored spacing; consumed by the live encounter.
  const near={playerFeet:p(3.3,0,2),playerPosition:p(3.3,1.6,2)};
  const runtime=setup(), enemy=firstSpawn(runtime,near);
  enemy.clock=1.6;
  enemy.muzzlePosition=p(2,1.4,2);
  enemy.muzzleForward=p(1,0,0);
  const start=p(enemy.x,enemy.y,enemy.z);
  advanceNativeEncounter(runtime,input([enemy],{...near,scaledDeltaTime:.2}));
  assert.ok(enemy.x<start.x-.05,'rushed gunner gives ground rather than freezing in melee range');
  assert.equal(enemy.walking,true,'walk animation remains wired to real feet movement');
  assert.equal(enemy.encounter.route,null,'retreat invalidates previous chase');
  assert.ok(Math.hypot(enemy.x-near.playerFeet.x,enemy.z-near.playerFeet.z)>
    Math.hypot(start.x-near.playerFeet.x,start.z-near.playerFeet.z),
  'actor must increase spacing rather than slide toward the player');
  const retired=p(enemy.x,enemy.y,enemy.z);
  enemy.runtime.pendingShot={target:near.playerPosition};
  advanceNativeEncounter(runtime,input([enemy],{...near,scaledDeltaTime:.2}));
  assert.deepEqual(p(enemy.x,enemy.y,enemy.z),retired,'an accepted deferred shot holds the pose');
  enemy.runtime.pendingShot=null;
  enemy.reaction.stunRemaining=.5;
  advanceNativeEncounter(runtime,input([enemy],{...near,scaledDeltaTime:.2}));
  assert.deepEqual(p(enemy.x,enemy.y,enemy.z),retired,'stunned enemy cannot disengage');

  const wall=setup(scene(),[box(1.5,1,2,.2,2,10)]);
  const trapped=firstSpawn(wall,near);
  trapped.clock=1.6;
  trapped.muzzlePosition=p(2,1.4,2);
  trapped.muzzleForward=p(1,0,0);
  advanceNativeEncounter(wall,input([trapped],{...near,scaledDeltaTime:.2}));
  assert.ok(trapped.x>=1.99,'retreat cannot tunnel through a world wall');
  assert.ok(Number.isFinite(trapped.z),'blocked retreat cannot teleport');
  assert.equal(trapped.encounter.canAttack,true,
    'retreat never changes the established clear-muzzle firing gate');
});

test('J3 Web squad approach: armed allies take distinct navmesh lanes, solo and unreachable flank keep their route',()=>{
  // Entirely synthetic game space. This is creative Web behavior, not MCD.
  const data=scene();
  const target={playerFeet:p(14,0,5),playerPosition:p(14,1.6,5)};
  const alone=setup(data), solo=firstSpawn(alone,target);
  const together=setup(data), squad=firstSpawn(together,target);
  // A real local fireteam member, not an incomplete armed marker that can
  // globally affect the flanking decision without an encounter runtime.
  const wingman={...squad,id:'armed-wingman',x:2,y:0,z:8,clock:0,
    reaction:{...squad.reaction},runtime:{...squad.runtime},
    encounter:{...squad.encounter,route:null,target:null,webTacticalSide:-1}};
  const initial=p(squad.x,squad.y,squad.z);

  for(let frame=0;frame<8;frame++) {
    advanceNativeEncounter(alone,input([solo],{...target,scaledDeltaTime:.2}));
    advanceNativeEncounter(together,input([squad,wingman],{...target,scaledDeltaTime:.2}));
    assert.ok(Math.hypot(squad.x-initial.x,squad.z-initial.z)<=6,
      'the flanker never teleports or outruns its normal speed budget');
  }
  assert.deepEqual(alone.actors.get(solo.id)?.encounter.target,target.playerFeet,
    'a lone gunner keeps the direct pursuit objective');
  assert.ok(Math.hypot(squad.encounter.target.x-target.playerFeet.x,
    squad.encounter.target.z-target.playerFeet.z)>.9,
  'the second armed actor triggers a real lateral route goal');
  assert.ok(Math.abs(squad.z-solo.z)>.1,
    'different navmesh waypoints produce visibly distinct approaches');
  assert.equal(squad.encounter.canAttack,false,
    'a tactical route cannot grant firing permission without a real muzzle');
  assert.equal(squad.reaction.dead,false,'squad tactics do not inflict damage');

  const edge={playerFeet:p(14,0,9.8),playerPosition:p(14,1.6,9.8)};
  const edgeRuntime=setup(data), edgeEnemy=firstSpawn(edgeRuntime,edge);
  edgeEnemy.encounter.webTacticalSide=1; // offset points beyond the synthetic tile
  const edgeWingman={...wingman,x:2,y:0,z:8,clock:0,
    reaction:{...wingman.reaction},runtime:{...wingman.runtime},
    encounter:{...wingman.encounter,route:null,target:null}};
  advanceNativeEncounter(edgeRuntime,input([edgeEnemy,edgeWingman],{...edge,scaledDeltaTime:.2}));
  assert.deepEqual(edgeEnemy.encounter.target,edge.playerFeet,
    'a flank beyond the baked surface fails closed to a real direct route');
  assert.ok(edgeEnemy.x>2,'an unavailable flank never strands an otherwise navigable chase');

  wingman.reaction.hasWeapon=false;
  advanceNativeEncounter(together,input([squad,wingman],{...target,scaledDeltaTime:.2}));
  assert.deepEqual(squad.encounter.target,target.playerFeet,
    'an unarmed neighbor cannot force the ranged squad tactic');
});

test('J3 Web assault pressure: one armed squadmate closes fast while wingman covers, then disengages when alone',()=>{
  // Synthetic scene and actor identities; this tactic is deliberately Web-only.
  const data=scene();
  data.gameplay.enemy.MinimumDistanceToPlayer=8;
  const near={playerFeet:p(9,0,2),playerPosition:p(9,1.6,2)};
  const soloRuntime=setup(data), solo=firstSpawn(soloRuntime,near);
  advanceNativeEncounter(soloRuntime,input([solo],{...near,scaledDeltaTime:.2}));
  assert.equal(solo.x,2,'solo enemy keeps its original armed stop distance');

  const encounter=setup(data), lead=firstSpawn(encounter,near);
  const wingman={
    ...lead,id:'native-encounter-wingman',x:2,z:4,clock:0,
    reaction:{...lead.reaction},runtime:{...lead.runtime},
    encounter:{...lead.encounter,route:null,target:null,webTacticalSide:-1},
  };
  let last=p(lead.x,lead.y,lead.z);
  for(let frame=0;frame<4;frame++) {
    advanceNativeEncounter(encounter,input([lead,wingman],{...near,scaledDeltaTime:.2}));
    assert.ok(Math.hypot(lead.x-last.x,lead.z-last.z)<=1+1e-6,
      'assault movement remains bound by the existing source running speed');
    assert.ok(Math.hypot(lead.x-wingman.x,lead.z-wingman.z)>=.8,
      'breacher never traverses a teammate capsule');
    assert.equal(lead.encounter.canAttack,false,'squad pressure never fabricates a muzzle');
    last=p(lead.x,lead.y,lead.z);
  }
  assert.ok(lead.x>2.8,'squad leader enters the original stop ring');
  assert.deepEqual(p(wingman.x,wingman.y,wingman.z),p(2,0,4),
    'covering squadmate retains the normal armed stop distance');

  wingman.reaction.dead=true;
  const before=p(lead.x,lead.y,lead.z);
  advanceNativeEncounter(encounter,input([lead,wingman],{...near,scaledDeltaTime:.2}));
  assert.deepEqual(p(lead.x,lead.y,lead.z),before,
    'when the wingman dies, no solo enemy keeps an unjustified assault');
  assert.equal(lead.encounter.canAttack,false,'death does not grant an attack');
});



test('J3 Web local fireteams: distant gunners cannot steal a breach or turn a solo guard into an assaulter',()=>{
  // Web-only tactical choice, with entirely synthetic actors/geometry.
  const data=scene();
  data.gameplay.enemy.MinimumDistanceToPlayer=8;
  const target={playerFeet:p(9,0,2),playerPosition:p(9,1.6,2)};
  const runtime=setup(data), a=firstSpawn(runtime,target);
  runtime.actors.delete(a.id);
  a.id='a-lead';
  runtime.actors.set(a.id,a);
  const teammate=(source,id,x,z,side)=>({
    ...source,id,x,z,clock:0,
    reaction:{...source.reaction},runtime:{...source.runtime},
    encounter:{...source.encounter,route:null,target:null,webTacticalSide:side},
  });
  const aWing=teammate(a,'a-wing',2,4,-1);
  const b=teammate(a,'b-lead',16,2,1);
  const bWing=teammate(a,'b-wing',16,4,-1);
  for (const actor of [aWing,b,bWing])runtime.actors.set(actor.id,actor);
  const fireteams=[a,aWing,b,bWing];
  advanceNativeEncounter(runtime,input(fireteams,{...target,scaledDeltaTime:.2}));
  assert.ok(a.x>2.05,'team A sends its own point man, not the only global lowest ID');
  assert.ok(b.x<15.95,'disconnected team B independently pressures the player');
  assert.deepEqual(p(aWing.x,aWing.y,aWing.z),p(2,0,4),
    'team A keeps a covering shooter at the original firing distance');
  assert.deepEqual(p(bWing.x,bWing.y,bWing.z),p(16,0,4),
    'team B also retains its covering shooter');
  assert.ok(fireteams.every(actor=>actor.encounter.canAttack===false),
    'moving tactically does not invent a muzzle or shooting permission');

  const isolated=setup(data),lone=firstSpawn(isolated,target);
  const farAway=teammate(lone,'remote-gunner',27,9,-1);
  advanceNativeEncounter(isolated,input([lone,farAway],{...target,scaledDeltaTime:.2}));
  assert.equal(lone.x,2,
    'a lone gunner already inside its normal stop ring cannot charge because another gunner exists far away');
});

test('J3 Web squad baton: wingman takes breach when point man is stunned or suppressed',()=>{
  // Deliberate Web tactics, synthetic positions; no native MCD squad behavior.
  const data=scene();
  data.gameplay.enemy.MinimumDistanceToPlayer=8;
  const target={playerFeet:p(9,0,2),playerPosition:p(9,1.6,2)};
  const runtime=setup(data), lead=firstSpawn(runtime,target);
  const wingman={
    ...lead,id:'native-encounter-wingman',x:2,z:4,clock:0,
    reaction:{...lead.reaction},runtime:{...lead.runtime},
    encounter:{...lead.encounter,route:null,target:null,webTacticalSide:-1},
  };
  lead.reaction.stunRemaining=.7;
  advanceNativeEncounter(runtime,input([lead,wingman],{...target,scaledDeltaTime:.2}));
  assert.equal(lead.x,2,'stun still immobilizes the original point man');
  assert.ok(wingman.x>2.05,'wingman advances through its normal armed stop ring');
  assert.equal(wingman.encounter.canAttack,false,'handoff never invents a muzzle or permits fire');
  assert.ok(Math.hypot(wingman.x-lead.x,wingman.z-lead.z)>=.8,
    'squad handoff cannot cross a teammate body');

  lead.reaction.stunRemaining=0;
  lead.encounter.webSuppressionRemaining=.6;
  lead.encounter.webSuppressionFrom=p(1,0,2);
  const before=wingman.x;
  advanceNativeEncounter(runtime,input([lead,wingman],{...target,scaledDeltaTime:.2}));
  assert.ok(wingman.x>before+.05,
    'an actually suppressed point man leaves the assault to his active wingman');
  assert.equal(lead.encounter.canAttack,false,'suppressed lead cannot sneak in a new shot');

  lead.encounter.webSuppressionRemaining=0;
  lead.encounter.webSuppressionFrom=null;
  const holding=p(wingman.x,wingman.y,wingman.z);
  advanceNativeEncounter(runtime,input([lead,wingman],{...target,scaledDeltaTime:.2}));
  assert.deepEqual(p(wingman.x,wingman.y,wingman.z),holding,
    'the recovered stable-ID lead reclaims the push; wingman holds his firing ring');
});


test('J3 Web final-survivor pressure closes the finishing gap but yields to reinforcements',()=>{
  // Pure synthetic encounter: a real counted death, not a fake distance flag,
  // activates the finishing chase without authorizing a shot or bypassing nav.
  const data=scene();
  data.gameplay.enemy.MinimumDistanceToPlayer=8;
  const target={playerFeet:p(9,0,2),playerPosition:p(9,1.6,2)};
  const early=setup(data),earlyEnemy=firstSpawn(early,target);
  advanceNativeEncounter(early,input([earlyEnemy],{...target,scaledDeltaTime:.2}));
  assert.equal(earlyEnemy.x,2,
    'an ordinary lone gunner holds its established firing distance');

  const runtime=setup(data),last=firstSpawn(runtime,target);
  runtime.killTarget=2;
  const corpse={
    ...last,id:'synthetic-already-defeated',alive:false,active:false,
    reaction:{...last.reaction,dead:true},
  };
  runtime.actors.set(corpse.id,corpse);
  const before=p(last.x,last.y,last.z);
  advanceNativeEncounter(runtime,input([last,corpse],{...target,scaledDeltaTime:.2}));
  assert.equal(runtime.killed,1,'the actual encounter death receipt starts the final phase');
  assert.ok(last.x>before.x+.05,
    'the final armed opponent charges inside its normal firing ring');
  assert.ok(last.x-before.x<=1.0+1e-6,
    'final pressure remains constrained by its current move speed');
  assert.equal(last.encounter.canAttack,false,
    'closer pursuit cannot grant firing permission without a muzzle');

  const reinforcement={
    ...last,id:'armed-reinforcement-0',x:2,z:6,clock:0,
    reaction:{...last.reaction},runtime:{...last.runtime},
    encounter:{...last.encounter,route:null,target:null},
  };
  const atReinforcement=p(last.x,last.y,last.z);
  advanceNativeEncounter(runtime,input([last,corpse,reinforcement],{...target,scaledDeltaTime:.2}));
  assert.deepEqual(p(last.x,last.y,last.z),atReinforcement,
    'a new living squadmate immediately cancels last-survivor pressure');
});

test('J3 Web projectile evade: visible player bullets trigger a bounded swept side-step, not clairvoyance',()=>{
  const runtime=setup(),enemy=firstSpawn(runtime);
  // Known, unobstructed muzzle: evade must actually gate a live ranged attack.
  enemy.muzzlePosition=p(enemy.x,1.4,enemy.z);
  enemy.muzzleForward=p(1,0,0);
  advanceNativeEncounter(runtime,input([enemy]));
  assert.equal(enemy.encounter.canAttack,true,'an unobstructed gunner is initially allowed to fire');
  const aimedFrom=p(15,1,2);
  const bullet={friendly:true,type:'normal',pos:aimedFrom,direction:p(-1,0,0),speed:35};
  const start=p(enemy.x,enemy.y,enemy.z);
  advanceNativeEncounter(runtime,input([enemy],{
    scaledDeltaTime:.12,playerProjectiles:[bullet],
  }));
  assert.ok(Math.abs(enemy.z-start.z)>.005,'enemy sidesteps a live approaching shot');
  assert.ok(Math.hypot(enemy.x-start.x,enemy.z-start.z)<.3,'single frame is speed-bounded');
  assert.ok(enemy.encounter.webDodgeRemaining>0,'dodge persists briefly, without teleporting');
  assert.equal(enemy.encounter.canAttack,false,
    'an active evasive sidestep suppresses a new shot even with a clear real muzzle');
  const afterFirst=p(enemy.x,enemy.y,enemy.z);
  advanceNativeEncounter(runtime,input([enemy],{scaledDeltaTime:.12,playerProjectiles:[]}));
  assert.ok(Math.abs(enemy.z-afterFirst.z)>.005,'evade remains legible after bullet moves on');
  for(let i=0;i<4;i++)advanceNativeEncounter(runtime,input([enemy],{scaledDeltaTime:.12,playerProjectiles:[]}));
  assert.equal(enemy.encounter.webDodgeRemaining,0,'short dodge terminates');
  assert.ok(enemy.encounter.webDodgeCooldown>0,'same projectile cannot cause endless jitter');
  advanceNativeEncounter(runtime,input([enemy],{scaledDeltaTime:.12,playerProjectiles:[]}));
  assert.equal(enemy.encounter.canAttack,true,
    'a recovered gunner may fire again once the projectile dodge has ended');

  const hiddenRuntime=setup(scene(),[box(8,1,2,.3,3,2)]);
  const hidden=firstSpawn(hiddenRuntime);
  advanceNativeEncounter(hiddenRuntime,input([hidden],{
    scaledDeltaTime:.12,playerProjectiles:[bullet],
  }));
  assert.equal(hidden.encounter.webDodgeRemaining,0,'real wall blocks projectile awareness');
  const invalidRuntime=setup();
  // Ignore malformed/projectile-free input without relying on the caller.
  const invalidEnemy=firstSpawn(invalidRuntime);
  advanceNativeEncounter(invalidRuntime,input([invalidEnemy],{
    scaledDeltaTime:.12,playerProjectiles:[{friendly:false,pos:aimedFrom,direction:p(-1,0,0),speed:35},
      {friendly:true,pos:aimedFrom,direction:p(NaN,0,0),speed:35}],
  }));
  assert.equal(invalidEnemy.encounter.webDodgeRemaining,0,'enemy or invalid shots are not dodged');
});

test('J3 Web dodge is cancelled by stun, pending fire or deactivation rather than resumed later',()=>{
  // Entirely synthetic positions, shot and Web timings. No real MCD source data.
  const data=scene();
  data.gameplay.enemy.MinimumDistanceToPlayer=10;
  const near={playerFeet:p(8,0,2),playerPosition:p(8,1.6,2)};
  const incoming={friendly:true,pos:p(15,1,2),direction:p(-1,0,0),speed:35};
  for (const interruption of ['stun','pending-fire','inactive']) {
    const runtime=setup(data),enemy=firstSpawn(runtime,near);
    advanceNativeEncounter(runtime,input([enemy],{
      ...near,scaledDeltaTime:.1,playerProjectiles:[incoming],
    }));
    assert.ok(enemy.encounter.webDodgeRemaining>0,
      interruption+': approaching projectile starts a live dodge');
    const atInterruption=p(enemy.x,enemy.y,enemy.z);
    if (interruption==='stun') enemy.reaction.stunRemaining=.8;
    if (interruption==='pending-fire') enemy.runtime.pendingShot={target:near.playerPosition};
    if (interruption==='inactive') enemy.active=false;
    advanceNativeEncounter(runtime,input([enemy],{
      ...near,scaledDeltaTime:.1,playerProjectiles:[],
    }));
    assert.equal(enemy.encounter.webDodgeRemaining,0,
      interruption+': interruption cancels the remaining dodge lifetime');
    assert.equal(enemy.encounter.webDodgeSideX,0);
    assert.equal(enemy.encounter.webDodgeSideZ,0);
    assert.ok(enemy.encounter.webDodgeCooldown>0,
      interruption+': recovery prevents immediate re-trigger');
    assert.deepEqual(p(enemy.x,enemy.y,enemy.z),atInterruption,
      interruption+': no movement during the interruption');
    enemy.reaction.stunRemaining=0;
    enemy.reaction.stunnedThisFrame=false;
    enemy.runtime.pendingShot=null;
    enemy.active=true;
    advanceNativeEncounter(runtime,input([enemy],{
      ...near,scaledDeltaTime:.1,playerProjectiles:[],
    }));
    assert.deepEqual(p(enemy.x,enemy.y,enemy.z),atInterruption,
      interruption+': an expired bullet does not trigger phantom sidestepping');
    assert.equal(enemy.encounter.webDodgeRemaining,0);
  }
});

test('J3 Web fair hunt: enemies sweep near last seen feet without tracking hidden player',()=>{
  // All positions and the blocking wall are synthetic Web test fixtures.
  // This is NOT an assertion about MCD's native enemy perception.
  const data=scene();
  data.gameplay.enemy.MinimumDistanceToPlayer=1;
  const runtime=setup(data,[box(8,1,5,.4,2,5)]);
  const seen={playerFeet:p(6,0,2),playerPosition:p(6,1.6,2)};
  const enemy=firstSpawn(runtime,seen);
  advanceNativeEncounter(runtime,input([enemy],{...seen,scaledDeltaTime:0}));
  assert.equal(enemy.encounter.visible,true,'the enemy first acquires real line of sight');
  assert.deepEqual(enemy.encounter.webLastSeenFeet,seen.playerFeet);

  const hidden={playerFeet:p(12,0,6),playerPosition:p(12,1.6,6)};
  const sweepPositions=[];
  for(let frame=0;frame<30;frame++){
    advanceNativeEncounter(runtime,input([enemy],{...hidden,scaledDeltaTime:.2}));
    assert.equal(enemy.encounter.visible,false,'the wall keeps the player genuinely occluded');
    assert.deepEqual(enemy.encounter.webLastSeenFeet,seen.playerFeet,
      'hidden coordinates never overwrite the remembered location');
    assert.deepEqual(enemy.encounter.target,seen.playerFeet,
      'navigation and search use remembered feet, not the hidden player');
    if(enemy.encounter.webSearchRemaining!==null && !enemy.encounter.webSearchComplete)
      sweepPositions.push(p(enemy.x,enemy.y,enemy.z));
  }
  assert.ok(sweepPositions.length>2,'hunter arrives and actually searches near last-seen feet');
  assert.ok(sweepPositions.some(feet=>Math.abs(feet.z-2)>.08),
    'hunter changes lane to investigate rather than standing still');
  assert.ok(sweepPositions.every(feet=>Math.hypot(feet.x-6,feet.z-2)<=runtime.body.radius*3.5+1e-5),
    'investigation stays close to last-known feet and uses bounded real movement');
  assert.equal(enemy.encounter.webSearchComplete,true,'search ends in finite time');
  assert.ok(enemy.x<8,'search never tracks the hidden player through cover');
  const holding=p(enemy.x,enemy.y,enemy.z);
  const relocated={playerFeet:p(13,0,7),playerPosition:p(13,1.6,7)};
  advanceNativeEncounter(runtime,input([enemy],{...relocated,scaledDeltaTime:.2}));
  assert.deepEqual(p(enemy.x,enemy.y,enemy.z),holding,
    'completed search holds rather than magically following new hidden coordinates');
  assert.equal(enemy.encounter.canAttack,false,'no invisible target grants muzzle fire');

  const reappeared={playerFeet:p(4,0,2),playerPosition:p(4,1.6,2)};
  advanceNativeEncounter(runtime,input([enemy],{...reappeared,scaledDeltaTime:0}));
  assert.equal(enemy.encounter.visible,true,'normal sight can reacquire the player');
  assert.deepEqual(enemy.encounter.webLastSeenFeet,reappeared.playerFeet,
    'a new real sighting replaces the old search destination');
});

test('J3 Web squad sighting: nearby real observers share only witnessed feet, independent of actor order',()=>{
  // Synthetic corridor and contacts, not a claim about the native MCD AI.
  const data=scene();
  const cover=[box(8,1,5,.4,2,5)];
  const old={playerFeet:p(6,0,2),playerPosition:p(6,1.6,2)};
  const spotted={playerFeet:p(12,0,6),playerPosition:p(12,1.6,6)};
  const relocated={playerFeet:p(13,0,6),playerPosition:p(13,1.6,6)};
  for(const reverse of [false,true]) {
    const runtime=setup(data,cover),hunter=firstSpawn(runtime,old);
    const spotter=firstSpawn(setup(data,cover),old);
    hunter.x=6;hunter.z=6;
    spotter.id='squad-spotter';spotter.x=11;spotter.z=2;
    advanceNativeEncounter(runtime,input([hunter],{...old}));
    assert.equal(hunter.encounter.visible,true,'hunter first witnesses the old position itself');
    assert.deepEqual(hunter.encounter.webLastSeenFeet,old.playerFeet);
    hunter.encounter.webSearchComplete=true;

    const squad=reverse?[spotter,hunter]:[hunter,spotter];
    advanceNativeEncounter(runtime,input(squad,{...spotted,scaledDeltaTime:.2}));
    assert.equal(hunter.encounter.visible,false,'actual wall still blocks hunter sight');
    assert.equal(spotter.encounter.visible,true,'teammate really sees around the wall');
    assert.deepEqual(hunter.encounter.webLastSeenFeet,spotted.playerFeet,
      'fresh witnessed location is shared within bounded squad range');
    assert.equal(hunter.encounter.webSearchComplete,false,'new sighting restarts the hunt');
    assert.deepEqual(hunter.encounter.target,spotted.playerFeet,'the route follows the witnessed feet');
    assert.ok(hunter.x>6 && hunter.x<8,
      'hunter advances towards the callout without crossing cover');

    // Once the observer is gone, the occluded player may move freely without
    // giving the hunter the new coordinates or permission to fire.
    spotter.active=false;
    advanceNativeEncounter(runtime,input(squad,{...relocated,scaledDeltaTime:0}));
    assert.deepEqual(hunter.encounter.webLastSeenFeet,spotted.playerFeet);
    assert.equal(hunter.encounter.canAttack,false);
    spotter.active=true;spotter.x=19;spotter.z=2;
    advanceNativeEncounter(runtime,input(squad,{...relocated,scaledDeltaTime:0}));
    assert.equal(spotter.encounter.visible,true,'distant ally still has genuine sight');
    assert.deepEqual(hunter.encounter.webLastSeenFeet,spotted.playerFeet,
      'far-away sightings do not grant infinite-radius squad tracking');
  }
});

test('J3 Web witnessed loss: visible nearby ally death prompts one swept retreat, cover blocks alarm',()=>{
  // Entirely synthetic positions and Web-authored timing, NOT a native MCD AI claim.
  const data=scene();
  const player={playerFeet:p(20,0,2),playerPosition:p(20,1.6,2)};
  const runtime=setup(data);
  const witness=firstSpawn(runtime,player);
  witness.x=6; witness.z=2;
  witness.muzzlePosition=p(6,1.4,2);
  witness.muzzleForward=p(1,0,0);
  const fallen=firstSpawn(setup(data),player);
  fallen.id='synthetic-fallen'; fallen.x=7; fallen.z=2;
  runtime.actors.set(fallen.id,fallen);
  fallen.alive=false; fallen.reaction.dead=true;

  advanceNativeEncounter(runtime,input([witness,fallen],{...player,scaledDeltaTime:.2}));
  assert.equal(runtime.killed,1,'the same actual death is counted for encounter progress');
  assert.ok(witness.x<5.95,'a nearby real witness immediately retreats away from the fallen ally');
  assert.ok(witness.encounter.webLossRemaining>0,'reaction persists for a short finite beat');
  assert.equal(witness.encounter.canAttack,false,'the evasive beat grants no free shot');
  assert.equal(witness.encounter.webLossFeet.x,7,'the retreat uses the witnessed corpse, not player tracking');
  for(let frame=0;frame<5;frame++)
    advanceNativeEncounter(runtime,input([witness,fallen],{...player,scaledDeltaTime:.2}));
  assert.equal(witness.encounter.webLossRemaining,0,'one death cannot trigger permanent retreat');
  advanceNativeEncounter(runtime,input([witness,fallen],{...player,scaledDeltaTime:0}));
  assert.equal(witness.encounter.webLossRemaining,0,'an already-observed corpse never restarts panic');

  const concealed=setup(data,[box(6,1,2,.5,2,2)]);
  const behind=firstSpawn(concealed,player);
  behind.x=4; behind.z=2;
  const hidden=firstSpawn(setup(data),player);
  hidden.id='synthetic-occluded-fallen';hidden.x=8;hidden.z=2;
  concealed.actors.set(hidden.id,hidden);
  hidden.alive=false;hidden.reaction.dead=true;
  advanceNativeEncounter(concealed,input([behind,hidden],{...player,scaledDeltaTime:.2}));
  assert.equal(behind.encounter.webLossRemaining,0,
    'a wall prevents omniscient awareness of an ally dying on its other side');
  assert.equal(concealed.killed,1,'occlusion does not erase the real kill receipt');
});


test('J3 Web near-miss suppression: actual passing player bullet interrupts gunfire without wallhacks',()=>{
  // Synthetic bullets and geometry; creative Web behavior, not an MCD timing claim.
  const data=scene();
  data.gameplay.enemy.MinimumDistanceToPlayer=8;
  const player={playerFeet:p(9,0,2),playerPosition:p(9,1.6,2)};
  const passing={friendly:true,pos:p(7,1,3.4),direction:p(-1,0,0),speed:22};
  const runtime=setup(data),enemy=firstSpawn(runtime,player);
  enemy.muzzlePosition=p(2,1.4,2);enemy.muzzleForward=p(1,0,0);
  advanceNativeEncounter(runtime,input([enemy],{...player,scaledDeltaTime:.12,playerProjectiles:[passing]}));
  assert.ok(enemy.z<1.95,'visible near miss causes a real retreat away from the flight path');
  assert.equal(enemy.encounter.canAttack,false,'suppression withholds a shot despite a clear muzzle');
  assert.ok(enemy.encounter.webSuppressionRemaining>0,'brief follow-through persists after bullet leaves');
  assert.equal(enemy.encounter.webDodgeRemaining,0,'near miss does not masquerade as a direct-hit dodge');
  for(let i=0;i<5;i++)advanceNativeEncounter(runtime,input([enemy],{
    ...player,scaledDeltaTime:.12,playerProjectiles:[],
  }));
  assert.equal(enemy.encounter.webSuppressionRemaining,0,'finite response expires without projectile');
  assert.ok(enemy.encounter.webSuppressionCooldown>0,'same near miss cannot cause endless retreat');
  const after=p(enemy.x,enemy.y,enemy.z);
  advanceNativeEncounter(runtime,input([enemy],{
    ...player,scaledDeltaTime:.12,playerProjectiles:[passing],
  }));
  assert.equal(enemy.encounter.webSuppressionRemaining,0,'recovery suppresses repeated alarms');
  assert.ok(Math.hypot(enemy.x-after.x,enemy.z-after.z)<.3,'normal movement budget still applies');

  const covered=setup(data,[box(4,1,3.4,.2,2,.45)]),coveredEnemy=firstSpawn(covered,player);
  coveredEnemy.muzzlePosition=p(2,1.4,2);coveredEnemy.muzzleForward=p(1,0,0);
  advanceNativeEncounter(covered,input([coveredEnemy],{
    ...player,scaledDeltaTime:.12,playerProjectiles:[passing],
  }));
  assert.equal(coveredEnemy.encounter.visible,true,'world cover blocks bullet, not player sight');
  assert.equal(coveredEnemy.encounter.webSuppressionRemaining,0,'world cover prevents omniscient suppression');
  assert.equal(coveredEnemy.encounter.canAttack,true,'no false gunfire lockout behind cover');

  const uninvolved=setup(data),idle=firstSpawn(uninvolved,player);
  advanceNativeEncounter(uninvolved,input([idle],{
    ...player,scaledDeltaTime:.12,playerProjectiles:[{...passing,friendly:false}],
  }));
  assert.equal(idle.encounter.webSuppressionRemaining,0,'enemy-fired bullets do not cause player-shot panic');
});


test('J3 Web rear near-miss: suppression breaks laterally instead of charging the shooter',()=>{
  // Player is ahead to the east; a legitimate projectile passes the enemy
  // from behind to its west. Retreating from that line would move TOWARD the
  // player, so suppression should sidestep on the real swept nav/capsule.
  const data=scene();
  data.gameplay.enemy.MinimumDistanceToPlayer=8;
  const player={playerFeet:p(9,0,2),playerPosition:p(9,1.6,2)};
  const runtime=setup(data),enemy=firstSpawn(runtime,player);
  enemy.muzzlePosition=p(2,1.4,2);
  enemy.muzzleForward=p(1,0,0);
  const start=p(enemy.x,enemy.y,enemy.z);
  const rearShot={friendly:true,pos:p(.6,1,-4),direction:p(0,0,1),speed:50};
  advanceNativeEncounter(runtime,input([enemy],{
    ...player,scaledDeltaTime:.12,playerProjectiles:[rearShot],
  }));
  assert.ok(Math.abs(enemy.z-start.z)>.01,
    'rear-side near miss causes actual lateral feet movement');
  assert.ok(Math.hypot(enemy.x-player.playerFeet.x,enemy.z-player.playerFeet.z)>=
    Math.hypot(start.x-player.playerFeet.x,start.z-player.playerFeet.z)-1e-6,
    'suppression must never charge into the player while seeking space');
  assert.equal(enemy.encounter.canAttack,false,'real lateral suppression still delays fire');
  assert.ok(enemy.encounter.webSuppressionRemaining>0,
    'the same finite Web reaction remains active after a successful side-step');
});

test('J3 Web blind suppression: a real nearby bullet prompts cover-safe evasion without hidden-player tracking',()=>{
  // Synthetic geometry and projectiles: original Web tactical behavior, NOT MCD.
  // Wall blocks the gunner's eyes; the separate bullet corridor stays clear.
  const data=scene();
  data.gameplay.enemy.MinimumDistanceToPlayer=8;
  const passing={friendly:true,pos:p(7,1,3.4),direction:p(-1,0,0),speed:22};
  function simulate(hiddenZ) {
    const player={playerFeet:p(9,0,hiddenZ),playerPosition:p(9,1.6,hiddenZ)};
    const runtime=setup(data,[box(5,1,2,.2,2,1.4)]);
    const enemy=firstSpawn(runtime,player);
    enemy.muzzlePosition=p(2,1.4,2);enemy.muzzleForward=p(1,0,0);
    const start=p(enemy.x,enemy.y,enemy.z);
    advanceNativeEncounter(runtime,input([enemy],{
      ...player,scaledDeltaTime:.12,playerProjectiles:[passing],
    }));
    assert.equal(enemy.encounter.visible,false,'real wall occludes the player');
    assert.equal(enemy.encounter.webLastSeenFeet,null,'bullet does not reveal hidden player feet');
    assert.equal(enemy.encounter.canAttack,false,'physical warning cannot authorize blind shots');
    assert.ok(enemy.z<start.z-.01,'clear passing bullet creates an actual swept evasive step');
    assert.ok(enemy.encounter.webSuppressionRemaining>0,'suppression persists as a finite beat');
    return p(enemy.x,enemy.y,enemy.z);
  }
  const centered=simulate(2);
  const displaced=simulate(2.6);
  assert.deepEqual(centered,displaced,
    'changing the occluded player position cannot steer a bullet-triggered retreat');
});

test('J3 Web readable volleys: nearby clear gunners alternate new shots without losing aim or a committed shot',()=>{
  // Synthetic Web-designed windows; the actual GunAttack branch remains the
  // authority for firing. No MCD-native squad cadence is claimed.
  const data=scene();
  data.gameplay.enemy.MinimumDistanceToPlayer=20;
  const target={playerFeet:p(9,0,2),playerPosition:p(9,1.6,2)};
  const runtime=setup(data), lead=firstSpawn(runtime,target);
  const wing={
    ...lead,id:'web-volley-wing',z:4,clock:0,
    reaction:{...lead.reaction},runtime:{...lead.runtime},
    encounter:{...lead.encounter,route:null,target:null,webTacticalSide:-1},
  };
  lead.clock=0;
  lead.muzzlePosition=p(2,1.4,2);lead.muzzleForward=p(1,0,0);
  wing.muzzlePosition=p(2,1.4,4);wing.muzzleForward=p(1,0,0);
  const settings={...runtime.enemySettings,family:'Pistol'};
  const prep=()=>{
    for(const actor of [lead,wing]) {
      actor.runtime.pendingShot=null;
      actor.runtime.targetNeedsReroll=false;
      actor.runtime.attackDelayRemaining=-1;
      actor.runtime.alertness=2;
    }
  };
  const frame=(dt,actors=[lead,wing])=>
    advanceNativeEncounter(runtime,input(actors,{...target,scaledDeltaTime:dt}));
  const attack=(actor,dt)=>{
    advanceNativeEnemyWeapon(actor.runtime,settings,dt);
    return runNativeEnemyGunAttack(actor.runtime,settings,{
      scaledDeltaTime:dt,unscaledDeltaTime:dt,targetSight:actor.encounter.visible,
      sightMode:'all-directions',aimTargetInSight:actor.encounter.canAttack,
      aimReady:true,weaponInRightPosition:actor.encounter.canAttack,
      allowAttacking:true,canShot:true,active:true,
      animationTarget:target.playerPosition,
    },()=>0).shot;
  };
  prep();
  frame(.1);
  assert.equal(lead.encounter.canAttack,true);
  assert.equal(wing.encounter.canAttack,true,
    'waiting gunner stays aware and aimed instead of losing GunAttack alertness');
  assert.deepEqual([attack(lead,.1),attack(wing,.1)],[true,false],
    'first window permits one real projectile request, not simultaneous fire');

  prep();
  frame(.8);
  assert.deepEqual([attack(lead,.8),attack(wing,.8)],[false,true],
    'the actual GunAttack firing branch rotates to the covering wing');
  prep();
  frame(.8);
  assert.deepEqual([attack(lead,.8),attack(wing,.8)],[true,false],
    'the lead regains a later firing window');
  assert.deepEqual(p(lead.x,lead.y,lead.z),p(2,0,2));
  assert.deepEqual(p(wing.x,wing.y,wing.z),p(2,0,4),
    'the volley mechanic never teleports or moves a gunner');

  prep();
  wing.muzzlePosition=null;
  frame(.8);
  assert.equal(lead.runtime.attackDelayRemaining,-1,
    'the only shooter with a real muzzle keeps its existing cooldown');
  assert.equal(wing.encounter.canAttack,false);
  wing.muzzlePosition=p(2,1.4,4);
  prep();
  wing.reaction.stunRemaining=.4;
  frame(.8);
  assert.equal(lead.runtime.attackDelayRemaining,-1,
    'a stunned wing cannot consume the lead firing window');
  wing.reaction.stunRemaining=0;

  prep();
  lead.runtime.pendingShot={id:'already-committed'};
  frame(.8);
  assert.deepEqual(lead.runtime.pendingShot,{id:'already-committed'},
    'an accepted Attack-Late shot is never cancelled or re-delayed');
  assert.equal(wing.encounter.canAttack,true,'the free gunner can still aim');
  prep();
  runtime.webVolleyClock=0;
  frame(.1,[wing,lead]);
  assert.equal(lead.runtime.attackDelayRemaining,-1);
  assert.ok(wing.runtime.attackDelayRemaining>.1,
    'reordering input actors cannot steal the stable-ID lead firing window');
});

test('J3 Web volleys: connected three-gunner chain grants only one real shot',()=>{
  // Synthetic Web tactic, not a recovered MCD squad cadence. A-B and B-C are
  // in range, A-C are not: overlapping local lists used to elect TWO shooters.
  const data=scene();
  data.gameplay.enemy.MinimumDistanceToPlayer=20;
  const target={playerFeet:p(9,0,2),playerPosition:p(9,1.6,2)};
  const runtime=setup(data),a=firstSpawn(runtime,target);
  a.muzzlePosition=p(2,1.4,2);
  a.muzzleForward=p(1,0,0);
  const clone=(id,z)=>({
    ...a,id,z,clock:0,
    reaction:{...a.reaction},
    runtime:{...a.runtime},
    encounter:{...a.encounter,route:null,target:null},
    muzzlePosition:p(2,1.4,z),
    muzzleForward:p(1,0,0),
  });
  const b=clone('web-triad-b',6),c=clone('web-triad-c',10);
  const actors=[c,a,b]; // deliberately not sorted by ID
  for(const actor of actors) {
    actor.runtime.attackDelayRemaining=-1;
    actor.runtime.alertness=2;
    actor.runtime.pendingShot=null;
  }
  const settings={...runtime.enemySettings,family:'Pistol'};
  runtime.webVolleyClock=.8; // second beat: old local-list bug elected B AND C
  advanceNativeEncounter(runtime,input(actors,{...target,scaledDeltaTime:.1}));
  const fired=actors.filter(actor=>{
    assert.equal(actor.encounter.canAttack,true,'off-turn retains real aiming permission');
    advanceNativeEnemyWeapon(actor.runtime,settings,.1);
    return runNativeEnemyGunAttack(actor.runtime,settings,{
      scaledDeltaTime:.1,unscaledDeltaTime:.1,targetSight:actor.encounter.visible,
      sightMode:'all-directions',aimTargetInSight:actor.encounter.canAttack,
      aimReady:true,weaponInRightPosition:actor.encounter.canAttack,
      allowAttacking:true,canShot:true,active:true,
      animationTarget:target.playerPosition,
    },()=>0).shot;
  });
  assert.deepEqual(fired,[b],'one connected squad must elect one shooter, not two');
  assert.ok(a.runtime.attackDelayRemaining>0 && c.runtime.attackDelayRemaining>0,
    'both overlapping neighbors retain the safe cooldown floor');
  assert.ok(b.runtime.pendingShot,'selected gunner reached the actual Attack-Late pipeline');

  // The center gunner still connects A to C spatially while reloading, but
  // cannot waste the whole squad's turn. The next ready member C fires once;
  // A must not create a second volley through the temporary cooldown gap.
  for(const actor of actors) {
    actor.runtime.pendingShot=null;
    actor.runtime.targetNeedsReroll=false;
    actor.runtime.attackDelayRemaining=actor===b ? 1 : -1;
    actor.runtime.alertness=2;
  }
  runtime.webVolleyClock=.8;
  advanceNativeEncounter(runtime,input(actors,{...target,scaledDeltaTime:.1}));
  const resumed=actors.filter(actor=>{
    advanceNativeEnemyWeapon(actor.runtime,settings,.1);
    return runNativeEnemyGunAttack(actor.runtime,settings,{
      scaledDeltaTime:.1,unscaledDeltaTime:.1,targetSight:actor.encounter.visible,
      sightMode:'all-directions',aimTargetInSight:actor.encounter.canAttack,
      aimReady:true,weaponInRightPosition:actor.encounter.canAttack,
      allowAttacking:true,canShot:true,active:true,
      animationTarget:target.playerPosition,
    },()=>0).shot;
  });
  assert.deepEqual(resumed,[c],
    'reload-vacated center turn passes to C, never splits connected squad into two volleys');
  assert.ok(b.runtime.attackDelayRemaining>.8,'cooling gunner keeps its actual reload delay');
  assert.ok(c.runtime.pendingShot,'replacement gunner reaches the real Attack-Late request');

  // A stunned B remains a SPATIAL bridge even though B cannot fire. The
  // previous ready-only components split A and C and emitted two bullets in
  // the same window. The Web fireteam must hold a single shooting slot.
  for(const actor of actors) {
    actor.runtime.pendingShot=null;
    actor.runtime.targetNeedsReroll=false;
    actor.runtime.attackDelayRemaining=-1;
    actor.runtime.alertness=2;
  }
  b.reaction.stunRemaining=.4;
  runtime.webVolleyClock=.8;
  advanceNativeEncounter(runtime,input(actors,{...target,scaledDeltaTime:.1}));
  const bridged=actors.filter(actor=>{
    if(actor===b)return false;
    advanceNativeEnemyWeapon(actor.runtime,settings,.1);
    return runNativeEnemyGunAttack(actor.runtime,settings,{
      scaledDeltaTime:.1,unscaledDeltaTime:.1,targetSight:actor.encounter.visible,
      sightMode:'all-directions',aimTargetInSight:actor.encounter.canAttack,
      aimReady:true,weaponInRightPosition:actor.encounter.canAttack,
      allowAttacking:true,canShot:true,active:true,
      animationTarget:target.playerPosition,
    },()=>0).shot;
  });
  assert.deepEqual(bridged,[c],
    'a stunned middle ally cannot split one physically connected fireteam into two shots');
  assert.equal(b.encounter.canAttack,false,'stunned bridge stays unable to attack');
  assert.ok(a.runtime.attackDelayRemaining>0,'other flank keeps its safe shot-delay floor');
});


test('J3 Web moving cover: a legal pre-step shot is vetoed if a strafe moves its muzzle behind cover',()=>{
  // Fabricated short upper wall: eye rays stay clear but the gun's swept
  // translated muzzle acquires real world cover AFTER the enemy strafes.
  // The scene renderer will only supply the exact posed muzzle at Late.
  const data=scene();
  data.gameplay.enemy.MinimumDistanceToPlayer=20;
  const target={playerFeet:p(9,0,2),playerPosition:p(9,1.6,2)};
  const runtime=setup(data,[box(4,2.65,2.35,.25,.5,.25)]);
  const enemy=firstSpawn(runtime,target);
  enemy.clock=1.3; // inside the existing Web strafe window
  enemy.encounter.webTacticalSide=1;
  enemy.muzzlePosition=p(2,3,2);
  enemy.muzzleForward=p(1,0,0);
  const start=p(enemy.x,enemy.y,enemy.z);
  assert.equal(nativeSegmentHit(runtime.sightCollision,enemy.muzzlePosition,target.playerPosition),null,
    'the old muzzle path is initially legal before feet move');
  advanceNativeEncounter(runtime,input([enemy],{...target,scaledDeltaTime:.2}));
  assert.ok(enemy.z>start.z+.1,'enemy made a real capsule/navmesh-approved strafe');
  assert.equal(enemy.encounter.visible,true,'short upper cover does not hide the player from the eyes');
  assert.equal(enemy.encounter.canAttack,false,
    'the updated shot corridor crosses world cover, so no new GunAttack is authorized');
  enemy.runtime.attackDelayRemaining=-1;
  enemy.runtime.alertness=2;
  advanceNativeEnemyWeapon(enemy.runtime,{...runtime.enemySettings,family:'Pistol'},.2);
  const attack=runNativeEnemyGunAttack(enemy.runtime,{...runtime.enemySettings,family:'Pistol'},{
    scaledDeltaTime:.2,unscaledDeltaTime:.2,targetSight:enemy.encounter.visible,
    sightMode:'all-directions',aimTargetInSight:enemy.encounter.canAttack,
    aimReady:true,weaponInRightPosition:enemy.encounter.canAttack,
    allowAttacking:true,canShot:true,active:true,animationTarget:target.playerPosition,
  },()=>0);
  assert.equal(attack.shot,false,'no projectile is requested through cover after the move');
});
