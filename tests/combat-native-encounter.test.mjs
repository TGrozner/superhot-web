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

  // J2 browser gun safety: the posed muzzle extends through the nearest ally
  // and begins its projectile INSIDE their body. Its center lies behind the
  // start of the ray, so a (0,1)-only projection wrongly allows an attack.
  // Synthetic positions, not native gun lengths or hitbox measurements.
  ally.x=3;ally.z=2;shooter.muzzlePosition=p(3.18,1.4,2);
  advanceNativeEncounter(runtime,input(group,{...near,scaledDeltaTime:0}));
  assert.equal(shooter.encounter.visible,true);
  assert.equal(shooter.encounter.webAllyBlockingShot,true,
    'the muzzle overlapping an allied body must block a new shot');
  assert.equal(shooter.encounter.canAttack,false);
  shooter.runtime.attackDelayRemaining=-1;shooter.runtime.alertness=2;
  const attack=runNativeEnemyGunAttack(shooter.runtime,{...runtime.enemySettings,family:'Pistol'},{
    scaledDeltaTime:0,unscaledDeltaTime:0,targetSight:shooter.encounter.visible,
    sightMode:'all-directions',aimTargetInSight:shooter.encounter.canAttack,
    aimReady:true,weaponInRightPosition:shooter.encounter.canAttack,
    allowAttacking:true,canShot:true,active:true,animationTarget:near.playerPosition,
  },()=>0);
  assert.equal(attack.shot,false,'no Attack intent or ghost bullet from inside an ally');
  ally.x=4; // A teammate beyond the muzzle capsule and before the player.
  advanceNativeEncounter(runtime,input(group,{...near,scaledDeltaTime:0}));
  assert.equal(shooter.encounter.webAllyBlockingShot,true,
    'the original interior-of-segment crossfire gate stays intact');
  ally.x=2.5; // Fully behind the muzzle, at least one capsule radius away.
  advanceNativeEncounter(runtime,input(group,{...near,scaledDeltaTime:0}));
  assert.equal(shooter.encounter.canAttack,true,
    'a non-overlapping ally behind the muzzle does not suppress fire');
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

test('J3 Web three-gunner fanout: left, center and right use stable independent routes',()=>{
  // Web-only tactical layout on fabricated navmesh; no MCD AI parameters.
  const target={playerFeet:p(14,0,5),playerPosition:p(14,1.6,5)};
  const run=(reverse=false)=>{
    const runtime=setup(),lead=firstSpawn(runtime,target);
    lead.id='a'; runtime.actors.clear(); runtime.actors.set('a',lead);
    const copy=(id,z)=>({
      ...lead,id,x:2,y:0,z,clock:0,
      reaction:{...lead.reaction},runtime:{...lead.runtime},
      encounter:{...lead.encounter,route:null,target:null,webTacticalSide:1},
    });
    const middle=copy('b',4),right=copy('c',6);
    runtime.actors.set('b',middle);runtime.actors.set('c',right);
    const actors=reverse?[right,middle,lead]:[lead,middle,right];
    for(let frame=0;frame<3;frame++) {
      advanceNativeEncounter(runtime,input(actors,{...target,scaledDeltaTime:.2}));
      for(let i=0;i<actors.length;i++) for(let j=i+1;j<actors.length;j++)
        assert.ok(Math.hypot(actors[i].x-actors[j].x,actors[i].z-actors[j].z)>=.8-1e-6,
          'fanout movement cannot cross a living ally capsule');
    }
    return [lead,middle,right].map(actor=>({
      goal:actor.encounter.target,canAttack:actor.encounter.canAttack,
      feet:p(actor.x,actor.y,actor.z),
    }));
  };
  const forward=run(),reverse=run(true);
  assert.ok(forward[0].goal.z<target.playerFeet.z-.8,
    'first gunner takes a real left flank rather than sharing another lane');
  assert.deepEqual(forward[1].goal,target.playerFeet,
    'the central gunner keeps the ordinary direct source-navmesh route');
  assert.ok(forward[2].goal.z>target.playerFeet.z+.8,
    'third gunner takes the distinct right flank');
  assert.deepEqual(forward.map(actor=>actor.goal),reverse.map(actor=>actor.goal),
    'reversing iteration order cannot reshuffle squad flank assignments');
  assert.ok(forward.every(actor=>actor.canAttack===false),
    'a tactical slot never grants permission to shoot without a real muzzle');
  assert.ok(forward.every(actor=>actor.feet.x>2),
    'all three actors actually advance along their navmesh-approved routes');
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


test('J3 Web leapfrog: squad lead relays on a shared beat and suppression expiry cannot cancel handoff',()=>{
  // Pure synthetic Web tactical design, not a recovered MCD assault cadence.
  const data=scene();
  data.gameplay.enemy.MinimumDistanceToPlayer=8;
  const target={playerFeet:p(9,0,2),playerPosition:p(9,1.6,2)};
  const createPair=()=>{
    const runtime=setup(data), lead=firstSpawn(runtime,target);
    runtime.actors.delete(lead.id);
    lead.id='a-relay-lead';
    runtime.actors.set(lead.id,lead);
    const wing={
      ...lead,id:'z-relay-wing',x:2,z:4,clock:0,
      reaction:{...lead.reaction},runtime:{...lead.runtime},
      encounter:{...lead.encounter,route:null,target:null,webTacticalSide:-1},
    };
    runtime.actors.set(wing.id,wing);
    return {runtime,lead,wing};
  };

  const {runtime,lead,wing}=createPair();
  advanceNativeEncounter(runtime,input([wing,lead],{...target,scaledDeltaTime:.2}));
  assert.ok(lead.x>2.05,'first shared beat sends the lower-ID gunner forward');
  assert.equal(wing.x,2,'first covering gunner holds his normal firing ring');
  const previousLeadX=lead.x;
  runtime.webVolleyClock=4.75;
  advanceNativeEncounter(runtime,input([lead,wing],{...target,scaledDeltaTime:.2}));
  assert.ok(wing.x>2.05,'next Web beat hands the actual push to the wingman');
  assert.equal(lead.x,previousLeadX,'former point man covers rather than both charging');
  assert.ok(Math.hypot(lead.x-wing.x,lead.z-wing.z)>=.8,
    'relay movement cannot pass through an ally body');
  assert.equal(wing.encounter.canAttack,false,
    'tactical relay cannot invent a muzzle or authorize new shots');

  const expiry=createPair();
  expiry.lead.encounter.webSuppressionRemaining=.05;
  expiry.lead.encounter.webSuppressionFrom=p(1,0,2);
  advanceNativeEncounter(expiry.runtime,input([expiry.lead,expiry.wing],{
    ...target,scaledDeltaTime:.2,
  }));
  assert.equal(expiry.lead.encounter.webSuppressionRemaining,0,
    'the first actor exhausts suppression DURING its movement update');
  assert.ok(expiry.wing.x>2.05,
    'wingman retains the pre-movement breaching baton, even after that expiry');
  assert.ok(Math.hypot(expiry.lead.x-expiry.wing.x,expiry.lead.z-expiry.wing.z)>=.8,
    'suppression handoff also retains swept body occupancy');
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

test('J3 Web bullets intercepted by a living ally cannot panic a downstream gunner',()=>{
  // Web-only projectile prediction on fabricated actor capsules, not native MCD AI.
  const direct={friendly:true,type:'normal',pos:p(15,1,2),
    direction:p(-1,0,0),speed:35,ttl:.6};
  const near={friendly:true,type:'normal',pos:p(7,1,3.4),
    direction:p(-1,0,0),speed:22,ttl:.6};
  function advance(mode,{blocker=false,dead=false,reverse=false}={}) {
    const data=scene();
    const player=mode==='near'
      ? {playerFeet:p(9,0,2),playerPosition:p(9,1.6,2)} : {};
    if(mode==='near') data.gameplay.enemy.MinimumDistanceToPlayer=8;
    const runtime=setup(data),back=firstSpawn(runtime,player);
    back.muzzlePosition=p(back.x,1.4,back.z);
    back.muzzleForward=p(1,0,0);
    const enemies=[back];
    if(blocker) {
      const front={...back,id:'front-shield',x:mode==='near'?5:8,
        z:mode==='near'?3.4:2,alive:!dead,
        reaction:{...back.reaction,dead,stunRemaining:1,stunnedThisFrame:true},
        encounter:{...back.encounter},runtime:{...back.runtime,pendingShot:null}};
      if(reverse) enemies.unshift(front);
      else enemies.push(front);
    }
    advanceNativeEncounter(runtime,input(enemies,{
      ...player,scaledDeltaTime:.12,playerProjectiles:[mode==='near'?near:direct],
    }));
    return back.encounter;
  }
  assert.ok(advance('direct').webDodgeRemaining>0,
    'unobstructed incoming bullet still causes a real sidestep');
  assert.equal(advance('direct',{blocker:true}).webDodgeRemaining,0,
    'living front teammate absorbs the bullet before rear awareness');
  assert.equal(advance('direct',{blocker:true,reverse:true}).webDodgeRemaining,0,
    'actor iteration order cannot reintroduce fake dodges');
  assert.ok(advance('direct',{blocker:true,dead:true}).webDodgeRemaining>0,
    'dead teammates must not cast a phantom threat shadow');
  assert.ok(advance('near').webSuppressionRemaining>0,
    'unobstructed passing bullet still suppresses the rear gunner');
  assert.equal(advance('near',{blocker:true}).webSuppressionRemaining,0,
    'intercepted bullet cannot trigger downstream near-miss suppression');
  assert.equal(advance('near',{blocker:true,reverse:true}).webSuppressionRemaining,0);
  assert.ok(advance('near',{blocker:true,dead:true}).webSuppressionRemaining>0);
});

test('J3 active projectile horizon: enemies react only when a shot survives until its closest pass',()=>{
  // Web-only flight-time fairness using the real Dojo projectile.ttl field.
  // No native MCD prediction or asset is used. The encounter is fully synthetic.
  const dodge=(ttl)=>{
    const runtime=setup(),enemy=firstSpawn(runtime);
    enemy.muzzlePosition=p(enemy.x,1.4,enemy.z);
    enemy.muzzleForward=p(1,0,0);
    const approaching={friendly:true,type:'normal',pos:p(15,1,2),
      direction:p(-1,0,0),speed:35,ttl};
    advanceNativeEncounter(runtime,input([enemy],{
      scaledDeltaTime:.12,playerProjectiles:[approaching],
    }));
    return enemy.encounter;
  };
  assert.equal(dodge(.05).webDodgeRemaining,0,
    'shot expires before reaching the enemy, so no false sidestep');
  assert.equal(dodge(0).webDodgeRemaining,0,
    'already expired bullet cannot cause another dodge');
  assert.equal(dodge(NaN).webDodgeRemaining,0,
    'invalid lifetime cannot authorize predictive awareness');
  assert.ok(dodge(.5).webDodgeRemaining>0,
    'a real live bullet that can reach the enemy still triggers the dodge');

  const nearMiss=(ttl)=>{
    const data=scene();
    data.gameplay.enemy.MinimumDistanceToPlayer=8;
    const player={playerFeet:p(9,0,2),playerPosition:p(9,1.6,2)};
    const runtime=setup(data),enemy=firstSpawn(runtime,player);
    enemy.muzzlePosition=p(2,1.4,2);
    enemy.muzzleForward=p(1,0,0);
    const passing={friendly:true,type:'normal',pos:p(7,1,3.4),
      direction:p(-1,0,0),speed:22,ttl};
    advanceNativeEncounter(runtime,input([enemy],{
      ...player,scaledDeltaTime:.12,playerProjectiles:[passing],
    }));
    return enemy.encounter;
  };
  assert.equal(nearMiss(.05).webSuppressionRemaining,0,
    'an expiring bullet cannot cause suppression before it passes');
  assert.ok(nearMiss(.3).webSuppressionRemaining>0,
    'an unexpired passage still produces cover-constrained suppression');
});

test('J3 Web projectile dodge takes a free perpendicular lane if a teammate blocks the first one',()=>{
  // Fabricated live projectile and actor capsules, never original MCD geometry.
  // The approaching bullet travels along +Z: either +/-X is a valid dodge.
  const target={playerFeet:p(9,0,2),playerPosition:p(9,1.6,2)};
  const bullet={friendly:true,pos:p(2,1,-2),direction:p(0,0,1),speed:20};
  function scenario(blockBothSides) {
    const runtime=setup(),enemy=firstSpawn(runtime,target);
    const initial=p(enemy.x,enemy.y,enemy.z);
    const preferredX=-enemy.encounter.webTacticalSide;
    const blocker=(id,side)=>({
      id,x:initial.x+side*.8,y:initial.y,z:initial.z,alive:true,active:true,
    });
    const enemies=[enemy,blocker('preferred-lane',preferredX)];
    if(blockBothSides)enemies.push(blocker('other-lane',-preferredX));
    advanceNativeEncounter(runtime,input(enemies,{
      ...target,scaledDeltaTime:.18,playerProjectiles:[bullet],
    }));
    return {runtime,enemy,enemies,initial,preferredX};
  }
  const free=scenario(false);
  assert.ok((free.enemy.x-free.initial.x)*free.preferredX<-.05,
    'ally blocks the preferred side, so the enemy genuinely dodges into the open opposite lane');
  assert.equal(Math.sign(free.enemy.encounter.webDodgeSideX),-free.preferredX,
    'remaining dodge retains the valid direction instead of jittering back into the ally');
  assert.ok(free.enemy.encounter.webDodgeRemaining>0);
  const xAfterFirst=free.enemy.x;
  advanceNativeEncounter(free.runtime,input(free.enemies,{
    ...target,scaledDeltaTime:.08,playerProjectiles:[],
  }));
  assert.ok((free.enemy.x-xAfterFirst)*free.preferredX<-.005,
    'the next frame continues in the same collision-safe direction');
  assert.equal(free.enemy.encounter.canAttack,false,'dodging never authorizes an attack');

  const trapped=scenario(true);
  assert.equal(trapped.enemy.x,trapped.initial.x,
    'both lateral dodge lanes are blocked; ordinary non-dodge movement may still occur');
  for(const blocker of trapped.enemies.slice(1)) {
    assert.ok(Math.hypot(trapped.enemy.x-blocker.x,trapped.enemy.z-blocker.z)>=.8-1e-6,
      'failed dodge cannot cross either living ally capsule');
  }
  assert.equal(trapped.enemy.encounter.webDodgeRemaining,0);
  assert.ok(trapped.enemy.encounter.webDodgeCooldown>0,
    'a fully blocked dodge still ends with finite recovery, not frame-by-frame jitter');
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

test('J3 Web blind dodge: real incoming bullet is observable without exposing a hidden shooter',()=>{
  // Synthetic scene: the shooter is behind a genuine wall, while an already
  // launched player bullet approaches through a separate open corridor.
  // Web bullet awareness must use geometry, never reveal hidden player feet.
  const data=scene();
  data.gameplay.enemy.MinimumDistanceToPlayer=8;
  const incoming={friendly:true,type:'normal',pos:p(-3,1,2),
    direction:p(1,0,0),speed:22,ttl:.5};
  function simulate(hiddenZ,{blockedBullet=false}={}) {
    const player={playerFeet:p(9,0,hiddenZ),playerPosition:p(9,1.6,hiddenZ)};
    const obstacles=[box(5,1,2,.2,2,2)];
    if(blockedBullet) obstacles.push(box(0,1,2,.2,2,1.4));
    const runtime=setup(data,obstacles),enemy=firstSpawn(runtime,player);
    enemy.muzzlePosition=p(2,1.4,2);enemy.muzzleForward=p(1,0,0);
    const start=p(enemy.x,enemy.y,enemy.z);
    advanceNativeEncounter(runtime,input([enemy],{
      ...player,scaledDeltaTime:.12,playerProjectiles:[incoming],
    }));
    assert.equal(enemy.encounter.visible,false,'world cover still hides the shooter');
    assert.equal(enemy.encounter.webLastSeenFeet,null,
      'physical bullet awareness must never reveal occluded player coordinates');
    assert.equal(enemy.encounter.canAttack,false,'a blind dodge never grants a shot');
    if(blockedBullet) {
      assert.equal(enemy.encounter.webDodgeRemaining,0,
        'a real wall between bullet and enemy blocks predictive awareness');
      assert.equal(enemy.encounter.webSuppressionRemaining,0,
        'a direct bullet blocked by cover is not misclassified as near-miss');
    } else {
      assert.ok(Math.abs(enemy.z-start.z)>.005,
        'unblocked incoming projectile triggers a real swept lateral step');
      assert.ok(enemy.encounter.webDodgeRemaining>0,
        'a hidden shooter does not suppress legitimate bullet evasion');
    }
    return p(enemy.x,enemy.y,enemy.z);
  }
  assert.deepEqual(simulate(2),simulate(2.6),
    'moving the unseen shooter cannot steer an observed-bullet dodge');
  simulate(2,{blockedBullet:true});
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

test('J3 Web fireteams: solid cover separates nearby squads without silencing either gunner',()=>{
  // Entirely synthetic geometry. Two gunners are close in world distance,
  // with a real wall between their eyes but a clear diagonal to the player.
  // Web-authored tactical coordination must not extend through solid rooms.
  const data=scene();
  data.gameplay.enemy.MinimumDistanceToPlayer=20;
  const target={playerFeet:p(9,0,4),playerPosition:p(9,1.6,4)};
  const simulate=blocked=>{
    const runtime=setup(data,blocked ? [box(2,1,4,1.6,2,.35)] : []);
    const a=firstSpawn(runtime,target);
    a.clock=0;
    a.muzzlePosition=p(2,1.4,2);
    a.muzzleForward=p(1,0,0);
    const b={
      ...a,id:'web-divider-wing',z:6,clock:0,
      reaction:{...a.reaction},runtime:{...a.runtime},
      encounter:{...a.encounter,route:null,target:null},
      muzzlePosition:p(2,1.4,6),muzzleForward:p(1,0,0),
    };
    for(const actor of [a,b]) {
      actor.runtime.pendingShot=null;
      actor.runtime.targetNeedsReroll=false;
      actor.runtime.attackDelayRemaining=-1;
      actor.runtime.alertness=2;
    }
    const aEye=p(a.x,1.6,a.z),bEye=p(b.x,1.6,b.z);
    assert.equal(nativeSegmentHit(runtime.sightCollision,aEye,bEye)!==null,blocked,
      'only the divider determines whether these close gunners can communicate');
    assert.ok(Math.hypot(a.x-b.x,a.z-b.z)<runtime.body.radius*18,
      'the two enemies are within the original spatial squad radius');

    runtime.webVolleyClock=0;
    advanceNativeEncounter(runtime,input([b,a],{...target,scaledDeltaTime:.1}));
    const settings={...runtime.enemySettings,family:'Pistol'};
    const fired=[];
    for(const actor of [a,b]) {
      assert.equal(actor.encounter.visible,true,'each gunner independently sees the player');
      assert.equal(actor.encounter.canAttack,true,'both true muzzle-to-player lines are clear');
      advanceNativeEnemyWeapon(actor.runtime,settings,.1);
      const result=runNativeEnemyGunAttack(actor.runtime,settings,{
        scaledDeltaTime:.1,unscaledDeltaTime:.1,targetSight:actor.encounter.visible,
        sightMode:'all-directions',aimTargetInSight:actor.encounter.canAttack,
        aimReady:true,weaponInRightPosition:actor.encounter.canAttack,
        allowAttacking:true,canShot:true,active:true,
        animationTarget:target.playerPosition,
      },()=>0);
      if(result.shot)fired.push(actor.id);
    }
    return fired.length;
  };
  assert.equal(simulate(false),1,
    'one open-room fireteam continues alternating rather than double-firing');
  assert.equal(simulate(true),2,
    'two wall-separated fireteams independently shoot in the same window');
});

test('J3 Web fireteams skip unalerted and re-aiming gunners without wasting a live volley',()=>{
  // A newly spawned gunner can be clear and reload-ready without being allowed
  // to shoot yet. The other gunner must not lose the team's real Attack tick.
  const data=scene();
  data.gameplay.enemy.MinimumDistanceToPlayer=20;
  const target={playerFeet:p(9,0,2),playerPosition:p(9,1.6,2)};
  const runtime=setup(data),lead=firstSpawn(runtime,target);
  const wing={
    ...lead,id:'z-newly-arrived',z:4,clock:0,
    reaction:{...lead.reaction},runtime:{...lead.runtime},
    encounter:{...lead.encounter,route:null,target:null,webTacticalSide:-1},
  };
  lead.muzzlePosition=p(2,1.4,2);lead.muzzleForward=p(1,0,0);
  wing.muzzlePosition=p(2,1.4,4);wing.muzzleForward=p(1,0,0);
  const settings={...runtime.enemySettings,family:'Pistol'};
  const fire=(wingAlertness,wingReroll,actors=[lead,wing])=>{
    for(const actor of [lead,wing]) {
      actor.runtime.pendingShot=null;
      actor.runtime.targetNeedsReroll=false;
      actor.runtime.targetRerollWait=0;
      actor.runtime.attackDelayRemaining=-1;
      actor.runtime.alertness=2;
      actor.runtime.reloaded=false;
    }
    wing.runtime.alertness=wingAlertness;
    wing.runtime.targetNeedsReroll=wingReroll;
    wing.runtime.targetRerollWait=.2;
    runtime.webVolleyClock=.7; // next window prefers z-newly-arrived.
    advanceNativeEncounter(runtime,input(actors,{...target,scaledDeltaTime:.1}));
    return actors.filter(actor=>{
      assert.equal(actor.encounter.canAttack,true,
        'the off-turn gunner remains able to see, aim and build alertness');
      advanceNativeEnemyWeapon(actor.runtime,settings,.1);
      return runNativeEnemyGunAttack(actor.runtime,settings,{
        scaledDeltaTime:.1,unscaledDeltaTime:.1,targetSight:actor.encounter.visible,
        sightMode:'all-directions',aimTargetInSight:actor.encounter.canAttack,
        aimReady:true,weaponInRightPosition:actor.encounter.canAttack,
        allowAttacking:true,canShot:true,active:true,
        animationTarget:target.playerPosition,
      },()=>0).shot;
    }).map(actor=>actor.id);
  };
  assert.deepEqual(fire(-.5,false),[lead.id],
    'a still-unalerted newcomer cannot steal the ready partner\'s live shot');
  assert.deepEqual(fire(2,true),[lead.id],
    'an outstanding AimTarget reroll cannot waste the shared firing beat');
  assert.deepEqual(fire(2,false,[wing,lead]),[wing.id],
    'once both are really ready, the scheduled wing can fire regardless of actor iteration');
});

test('J3 Web sustained player aim provokes one visible, nav-safe gunner sidestep without wallhacks',()=>{
  // Web-authored aim pressure; synthetic Dojo/nav mesh, not a recovered
  // MCD perception or timing rule. This exercises the live encounter loop.
  const data=scene();
  data.gameplay.enemy.MinimumDistanceToPlayer=10;
  const near={playerFeet:p(8,0,2),playerPosition:p(8,1.6,2)};
  const runtime=setup(data), enemy=firstSpawn(runtime,near);
  enemy.clock=0; // outside ordinary warmup strafing
  const aimed=p(-1,0,0), away=p(0,0,-1);
  const tick=(fwd,world=.1,real=.1)=>
    advanceNativeEncounter(runtime,input([enemy],{
      ...near,playerForward:fwd,scaledDeltaTime:world,unscaledDeltaTime:real,
    }));
  const first=p(enemy.x,enemy.y,enemy.z);
  tick(aimed);tick(aimed);
  assert.deepEqual(p(enemy.x,enemy.y,enemy.z),first,
    'a fleeting camera glance does not trigger a supernatural dodge');
  tick(away);tick(aimed);tick(aimed);
  assert.equal(enemy.encounter.webAimRemaining,0,
    'looking away resets the consecutive active-time aiming requirement');
  tick(aimed);
  assert.ok(Math.abs(enemy.z-first.z)>.04,
    'a sustained, visible aim triggers a swept sidestep before the first shot');
  assert.equal(enemy.encounter.canAttack,false,
    'movement interrupts this enemy firing stance but creates no invulnerability');
  const side=Math.sign(enemy.z-first.z);
  const moved=enemy.z;
  tick(aimed);
  assert.ok((enemy.z-moved)*side>0,
    'the same short avoidance beat continues without jitter or teleportation');
  for(let i=0;i<8;i++)tick(away);
  assert.equal(enemy.encounter.webAimRemaining,0,
    'the move ends even while this actor remains armed and alive');
  const resting=enemy.z;
  tick(aimed);tick(aimed);tick(aimed);
  assert.equal(enemy.z,resting,
    'cooldown prevents an immediate repetitive evasive dance');

  const hidden=setup(data,[box(5,1,2,.3,2.2,3)]);
  const behind=firstSpawn(hidden,near);
  behind.clock=0;
  for(let i=0;i<6;i++)advanceNativeEncounter(hidden,input([behind],{
    ...near,playerForward:aimed,scaledDeltaTime:.1,unscaledDeltaTime:.1,
  }));
  assert.equal(behind.encounter.webAimRemaining,0,
    'a wall that blocks actual enemy sight never authorizes aim-based evasion');
  assert.equal(behind.encounter.webAimLock,0,
    'the player camera cannot reveal itself to a hidden enemy through world cover');

  const invalid=setup(data), blind=firstSpawn(invalid,near);
  blind.clock=0;
  for(let i=0;i<5;i++)advanceNativeEncounter(invalid,input([blind],{
    ...near,playerForward:p(0,0,0),scaledDeltaTime:.1,unscaledDeltaTime:.1,
  }));
  assert.equal(blind.encounter.webAimRemaining,0,
    'zero camera direction fails closed rather than inventing aim pressure');
});

test('J3 Web finale: last two armed survivors close together only after real kill receipts',()=>{
  // Web-designed finale; synthetic geometry. Real encounter death receipts
  // permit the pair to push, without granting free shots through a wall.
  const data=scene();
  data.gameplay.enemy.MinimumDistanceToPlayer=10;
  const target={playerFeet:p(9,0,2),playerPosition:p(9,1.6,2)};
  const runtime=setup(data),lead=firstSpawn(runtime,target);
  const wing={
    ...lead,id:'web-finale-wing',z:4,clock:0,
    reaction:{...lead.reaction},runtime:{...lead.runtime},
    encounter:{...lead.encounter,route:null,target:null,webTacticalSide:-1},
  };
  lead.clock=0;
  runtime.actors.set(wing.id,wing);
  const dead=Array.from({length:runtime.killTarget-2},(_,index)=>({
    ...lead,id:'web-finale-defeated-'+index,alive:false,
    reaction:{...lead.reaction,dead:true},
  }));
  for(const fallen of dead) {
    runtime.actors.set(fallen.id,fallen);
    runtime.webObservedDeaths.add(fallen.id); // Past deaths, not fresh shock beats.
  }
  assert.equal(readyForVictory(runtime,[lead,wing,...dead]),false);
  assert.equal(runtime.killed,runtime.killTarget-2,'the rush requires recorded kills');
  const start=[p(lead.x,lead.y,lead.z),p(wing.x,wing.y,wing.z)];
  advanceNativeEncounter(runtime,input([lead,wing],{...target,scaledDeltaTime:.2}));
  assert.ok(lead.x>start[0].x+.05 && wing.x>start[1].x+.05,
    'both surviving gunners now push inside the old stationary firing ring');
  assert.equal(lead.encounter.canAttack,false);
  assert.equal(wing.encounter.canAttack,false,
    'moving aggressively does not fabricate muzzle and firing permission');
  assert.ok(Math.hypot(lead.x-wing.x,lead.z-wing.z)>runtime.body.radius*2,
    'final push still respects real actor occupancy');

  // A newly present third gunner cancels the special two-person rush; only
  // the ordinary squad leader is allowed to close the ring again.
  const newcomer={
    ...lead,id:'web-finale-arrival',x:2,z:6,clock:0,
    reaction:{...lead.reaction},runtime:{...lead.runtime,speed:0},
    encounter:{...lead.encounter,route:null,target:null,webTacticalSide:1},
  };
  runtime.actors.set(newcomer.id,newcomer);
  const before=[p(lead.x,lead.y,lead.z),p(wing.x,wing.y,wing.z),p(newcomer.x,newcomer.y,newcomer.z)];
  advanceNativeEncounter(runtime,input([lead,wing,newcomer],{...target,scaledDeltaTime:.2}));
  const moved=[lead,wing,newcomer].filter((enemy,i)=>
    Math.hypot(enemy.x-before[i].x,enemy.z-before[i].z)>.01);
  assert.ok(moved.length<=1,
    'an arriving third gunner restores the single squad-breacher policy');
});


test('J3 Web disarmed rush zigzags toward visible player with swept feet, while armed/occluded tactics remain unchanged',()=>{
  // Synthetic geometry and original Web tactics: no claim about MCD melee AI.
  const data=scene();
  data.gameplay.enemy.MeleeAttackDistance=.8;
  const player={playerFeet:p(9,0,2),playerPosition:p(9,1.6,2)};
  const runtime=setup(data),unarmed=firstSpawn(runtime,player);
  unarmed.reaction.hasWeapon=false;
  const armedRuntime=setup(data),armed=firstSpawn(armedRuntime,player);
  const initial=p(unarmed.x,unarmed.y,unarmed.z);
  const dt=.18;
  const frame=(world,actor)=>advanceNativeEncounter(world,input([actor],{
    ...player,scaledDeltaTime:dt,unscaledDeltaTime:dt,
  }));
  frame(runtime,unarmed);
  frame(armedRuntime,armed);
  assert.ok(unarmed.x>initial.x+.1,'unarmed attacker actually advances toward melee');
  assert.ok(Math.abs(unarmed.z-initial.z)>.05,
    'the disarmed rush is no longer a straight-line target');
  assert.equal(armed.z,2,'armed gunners retain their existing route/fire tactics');
  assert.equal(unarmed.encounter.canAttack,false,'approach grants no gun or punch damage');
  const firstSide=Math.sign(unarmed.z-initial.z);
  let counterstepped=false;
  for(let i=0;i<7;i++) {
    const before=p(unarmed.x,unarmed.y,unarmed.z);
    frame(runtime,unarmed);
    const step=Math.hypot(unarmed.x-before.x,unarmed.z-before.z);
    assert.ok(step<=data.gameplay.enemy.RunningSpeed*dt+1e-6,
      'the rush never exceeds real swept movement speed');
    if((unarmed.z-before.z)*firstSide<-.03)counterstepped=true;
    assert.ok(Math.hypot(unarmed.x-player.playerFeet.x,unarmed.z-player.playerFeet.z)>=
      runtime.body.radius*2-1e-6,'the rush cannot step into the player capsule');
  }
  assert.ok(counterstepped,'the diagonal attack side changes during the close-range rush');
  assert.ok(unarmed.x>initial.x+1,'weaving must not replace forward pursuit with a stationary dance');
  assert.equal(unarmed.reaction.hasWeapon,false,'no weapons invented by movement');

  const wall=setup(data,[box(5,1,2,.2,2,4)]),hidden=firstSpawn(wall,player);
  hidden.reaction.hasWeapon=false;
  frame(wall,hidden);
  assert.equal(hidden.encounter.visible,false,'world occlusion prohibits the visible-player weave');
  assert.equal(hidden.encounter.canAttack,false,'the wall never grants attack permission');
});


test('J3 Web verified weapon roles: shotgun closes, sniper holds and retreats, fallback keeps pistol distance',()=>{
  // Synthetic actors and navigation only. These ranges are deliberately Web
  // tuning, not serialized MCD difficulty or native AI proof.
  const data=scene();
  data.gameplay.enemy.MinimumDistanceToPlayer=6;
  const close={playerFeet:p(7.2,0,2),playerPosition:p(7.2,1.6,2)};
  const far={playerFeet:p(10,0,2),playerPosition:p(10,1.6,2)};
  const rushed={playerFeet:p(5,0,2),playerPosition:p(5,1.6,2)};
  const equip=(world,enemy,family,status='qualified')=>{
    enemy.weaponFamily=family;
    enemy.activeWeaponSettings={...world.enemySettings,family};
    enemy.sourceActivation={status,family};
  };
  const tick=(world,enemies,player,delta=.25)=>advanceNativeEncounter(world,input(enemies,{
    ...player,scaledDeltaTime:delta,unscaledDeltaTime:delta,
  }));

  const baseline=setup(data),pistol=firstSpawn(baseline,close);
  tick(baseline,[pistol],close);
  assert.equal(pistol.x,2,'baseline pistol holds the ordinary six-metre ring');

  const shotgunWorld=setup(data),shotgun=firstSpawn(shotgunWorld,close);
  equip(shotgunWorld,shotgun,'Shotgun');
  tick(shotgunWorld,[shotgun],close);
  assert.ok(shotgun.x>2.1,'qualified shotgun actually closes when the pistol would hold');
  assert.equal(shotgun.encounter.canAttack,false,
    'movement does not invent a clear animated muzzle or authorize a shot');

  const fallbackWorld=setup(data),fallback=firstSpawn(fallbackWorld,close);
  equip(fallbackWorld,fallback,'Shotgun','web-pistol-fallback');
  tick(fallbackWorld,[fallback],close);
  assert.equal(fallback.x,2,'unverified family must not silently change Web pistol behavior');

  const sniperWorld=setup(data),sniper=firstSpawn(sniperWorld,far);
  equip(sniperWorld,sniper,'SniperRifle');
  tick(sniperWorld,[sniper],far);
  assert.equal(sniper.x,2,'qualified sniper holds a longer line instead of rushing to pistol range');
  const baselineFar=setup(data),plainFar=firstSpawn(baselineFar,far);
  tick(baselineFar,[plainFar],far);
  assert.ok(plainFar.x>2,'pistol still advances at the same distance');

  const pressured=setup(data),retreater=firstSpawn(pressured,rushed);
  equip(pressured,retreater,'SniperRifle');
  tick(pressured,[retreater],rushed);
  assert.ok(retreater.x<2,'rushed sniper actually backs away on a navmesh-safe step');
  assert.equal(retreater.encounter.canAttack,false,
    'retreat cannot create a shot or bypass the muzzle gates');

  const covered=setup(data,[box(4.5,1,2,.1,2,3)]),blocked=firstSpawn(covered,close);
  equip(covered,blocked,'Shotgun');
  tick(covered,[blocked],close,1);
  assert.ok(blocked.x<=4.05,'closer-ranged shotguns still cannot pass through world cover');
  assert.equal(blocked.encounter.canAttack,false,'cover never grants an attack');

  const duo=setup(data),point=firstSpawn(duo,close);
  equip(duo,point,'Shotgun');
  const wing=firstSpawn(setup(data),close);
  wing.id='synthetic-wingman';wing.z=3.5;
  wing.muzzlePosition=p(wing.x,1.4,wing.z);wing.muzzleForward=p(1,0,0);
  point.muzzlePosition=p(point.x,1.4,point.z);point.muzzleForward=p(1,0,0);
  tick(duo,[wing,point],close);
  assert.ok(point.x>2,'the shotgun takes the assault lead in a local mixed fireteam');
  assert.equal(wing.x,2,'pistol wingman maintains the covering ring');
});


test('J3 Web solo pistol closes only when genuinely visible behind player, never through cover',()=>{
  // Existing fully playable Web fallback is deliberately covered: the native
  // factory selector is not wired in shared main on this HEAD.
  const data=scene();
  data.gameplay.enemy.MinimumDistanceToPlayer=6;
  const player={playerFeet:p(7.2,0,2),playerPosition:p(7.2,1.6,2)};
  const facing={...player,playerForward:p(-1,0,0)};
  const lookingAway={...player,playerForward:p(1,0,0)};
  const oneFrame=(world,actor,view)=>advanceNativeEncounter(world,input([actor],{
    ...view,scaledDeltaTime:.25,unscaledDeltaTime:.25,
  }));

  const ordinary=setup(data),guard=firstSpawn(ordinary,facing);
  oneFrame(ordinary,guard,facing);
  assert.equal(guard.x,2,'facing the gunner keeps the normal pistol ring');

  const hunting=setup(data),approacher=firstSpawn(hunting,lookingAway);
  assert.equal(approacher.sourceActivation.status,'web-pistol-fallback');
  oneFrame(hunting,approacher,lookingAway);
  assert.ok(approacher.x>2.1,'a real visible Web pistol closes from behind');
  assert.equal(approacher.encounter.canAttack,false,
    'turning away is never substitute permission for a missing muzzle');
  const advanced=approacher.x;
  oneFrame(hunting,approacher,facing);
  assert.equal(approacher.x,advanced,'turning back immediately restores pistol spacing');

  const committed=setup(data),firing=firstSpawn(committed,lookingAway);
  firing.runtime.pendingShot={target:p(7.2,1.6,2),speed:28};
  oneFrame(committed,firing,lookingAway);
  assert.equal(firing.x,2,'an accepted shot is never displaced by an ambush approach');

  const covered=setup(data,[box(4.5,1,2,.1,2,3)]),hidden=firstSpawn(covered,lookingAway);
  const control=setup(data,[box(4.5,1,2,.1,2,3)]),hiddenControl=firstSpawn(control,facing);
  oneFrame(covered,hidden,lookingAway);
  oneFrame(control,hiddenControl,facing);
  assert.equal(hidden.encounter.visible,false);
  assert.equal(hidden.x,hiddenControl.x,'no hidden-player camera tracking through real cover');
  assert.ok(hidden.x<=4.05,'cover collision continues to block pursuit');
});

test('J3 Web aim pressure never banks dodges or recovers cooldown while world time is frozen',()=>{
  // Only the simulated world clock is allowed to advance an enemy reaction.
  // The player may look around for seconds of wall time without moving time.
  const data=scene();
  data.gameplay.enemy.MinimumDistanceToPlayer=10;
  const target={playerFeet:p(8,0,2),playerPosition:p(8,1.6,2),playerForward:p(-1,0,0)};
  const runtime=setup(data), enemy=firstSpawn(runtime,target);
  enemy.clock=0; // suppress unrelated ordinary strafe warmup
  const initial=p(enemy.x,enemy.y,enemy.z);
  const tick=(world,real)=>advanceNativeEncounter(runtime,input([enemy],{
    ...target,scaledDeltaTime:world,unscaledDeltaTime:real,
  }));

  for(let frame=0;frame<12;frame++)tick(0,.2);
  assert.deepEqual(p(enemy.x,enemy.y,enemy.z),initial);
  assert.equal(enemy.encounter.webAimLock,0,'frozen camera focus cannot queue a dodge');
  assert.equal(enemy.encounter.webAimRemaining,0);
  assert.equal(enemy.encounter.webAimCooldown,0);

  tick(.1,.1);
  tick(.1,.1);
  assert.deepEqual(p(enemy.x,enemy.y,enemy.z),initial,
    'two brief active-time aim frames do not move a frozen gunner');
  tick(.1,.1);
  assert.ok(Math.abs(enemy.z-initial.z)>.01,
    'three active-time aim frames still trigger the real swept side-step');
  tick(.4,.4);
  assert.equal(enemy.encounter.webAimRemaining,0);
  const remaining=enemy.encounter.webAimCooldown;
  assert.ok(remaining>1,'the existing recovery gate remains active after the dodge');
  const resting=p(enemy.x,enemy.y,enemy.z);

  for(let frame=0;frame<20;frame++)tick(0,.2);
  assert.deepEqual(p(enemy.x,enemy.y,enemy.z),resting);
  assert.equal(enemy.encounter.webAimCooldown,remaining,
    'wall time alone never clears a world-time enemy recovery window');
  tick(.1,.1);
  assert.ok(enemy.encounter.webAimCooldown<remaining);
  assert.deepEqual(p(enemy.x,enemy.y,enemy.z),resting,
    'resumed world time drains recovery normally without an instant new dodge');
});

test('J3 Web shoot-and-scoot: a gunner sidesteps after firing and settles before its next shot',()=>{
  // Fabricated scene; Web-authored movement only. The existing GunAttack
  // cooldown is the only shot receipt, not an invented native reload timer.
  const data=scene();
  data.gameplay.enemy.MinimumDistanceToPlayer=10;
  const target={playerFeet:p(8,0,2),playerPosition:p(8,1.6,2)};
  const spawn=(colliders=[])=>{
    const runtime=setup(data,colliders);
    const enemy=firstSpawn(runtime,target);
    enemy.clock=0; // outside normal warmup/periodic Web strafe window
    enemy.muzzlePosition=p(enemy.x,1.4,enemy.z);
    enemy.muzzleForward=p(1,0,0);
    return {runtime,enemy};
  };
  const tick=({runtime,enemy},dt=.15)=>advanceNativeEncounter(runtime,input([enemy],{
    ...target,scaledDeltaTime:dt,unscaledDeltaTime:dt,
  }));

  const firing=spawn();
  firing.enemy.runtime.haveBeenSeen=true; // set by accepted Pistol GunAttack
  firing.enemy.runtime.attackDelayRemaining=.48; // synthetic post-shot cooldown
  const initial=p(firing.enemy.x,firing.enemy.y,firing.enemy.z);
  tick(firing);
  assert.ok(Math.abs(firing.enemy.z-initial.z)>.03,
    'a visible gunner physically moves sideways while its real weapon is reloading');
  assert.equal(firing.enemy.walking,true,'the existing animated locomotion flag is updated');
  assert.equal(firing.enemy.runtime.attackDelayRemaining,.48,
    'tactical movement cannot consume, refill or synthesize a weapon attack');
  const afterScoot=p(firing.enemy.x,firing.enemy.y,firing.enemy.z);
  firing.enemy.runtime.attackDelayRemaining=.05;
  tick(firing);
  assert.deepEqual(p(firing.enemy.x,firing.enemy.y,firing.enemy.z),afterScoot,
    'the gunner holds still near readiness for a readable next shot');

  const starting=spawn();
  starting.enemy.runtime.attackDelayRemaining=.48;
  tick(starting);
  assert.deepEqual(p(starting.enemy.x,starting.enemy.y,starting.enemy.z),p(2,0,2),
    'the initial delay before any shot does not pretend to be a reload');

  const committed=spawn();
  committed.enemy.runtime.haveBeenSeen=true;
  committed.enemy.runtime.attackDelayRemaining=.48;
  committed.enemy.runtime.pendingShot={target:{...target.playerPosition},speed:28};
  tick(committed);
  assert.deepEqual(p(committed.enemy.x,committed.enemy.y,committed.enemy.z),p(2,0,2),
    'a shot waiting for its real animated muzzle is never displaced');

  const blocked=spawn([box(5,.65,2,.15,1.3,2)]);
  blocked.enemy.muzzlePosition=p(2,.3,2);
  blocked.enemy.runtime.haveBeenSeen=true;
  blocked.enemy.runtime.attackDelayRemaining=.48;
  tick(blocked);
  assert.equal(blocked.enemy.encounter.canAttack,false);
  assert.deepEqual(p(blocked.enemy.x,blocked.enemy.y,blocked.enemy.z),p(2,0,2),
    'blocked muzzle never activates a fake reload dodge before tactical peeking');
});

test('J3 Web hit recovery: confirmed nonlethal stun triggers one swept lateral recovery only after stun',()=>{
  // Entirely synthetic scene. A real admitted hit in main.js sets the same
  // reactionRevision and hitIncomingDirection; neither is a native AI source.
  const data=scene();
  data.gameplay.enemy.MinimumDistanceToPlayer=10;
  const target={playerFeet:p(8,0,2),playerPosition:p(8,1.6,2)};
  const make=()=>{
    const runtime=setup(data),enemy=firstSpawn(runtime,target);
    enemy.clock=0;
    enemy.muzzlePosition=p(2,1.4,2);
    enemy.muzzleForward=p(1,0,0);
    return {runtime,enemy};
  };
  const tick=({runtime,enemy},dt)=>advanceNativeEncounter(runtime,input([enemy],{
    ...target,scaledDeltaTime:dt,unscaledDeltaTime:dt,
  }));
  const victim=make();
  victim.enemy.hitIncomingDirection=p(1,0,0);
  victim.enemy.hitEventId=1;
  victim.enemy.reaction.reactionRevision=1;
  victim.enemy.reaction.stunRemaining=.75;
  victim.enemy.reaction.stunnedThisFrame=true;
  victim.enemy.reaction.hasWeapon=false;
  tick(victim,0);
  assert.equal(victim.enemy.encounter.webHitPending,true);
  tick(victim,.1);
  assert.deepEqual(p(victim.enemy.x,victim.enemy.y,victim.enemy.z),p(2,0,2),
    'stun must hold actor at its actual location, never trigger premature dodge');
  assert.equal(victim.enemy.reaction.stunRemaining,.75,'encounter does not advance stun');
  advanceEnemyReaction(victim.enemy.reaction,.75);
  tick(victim,.15);
  assert.ok(Math.abs(victim.enemy.z-2)>.04,
    'recovery moves across actual incoming hit direction instead of tracking player');
  assert.ok(Math.abs(victim.enemy.x-2)<.01);
  assert.equal(victim.enemy.encounter.canAttack,false);
  assert.equal(victim.enemy.walking,true);
  const after=p(victim.enemy.x,victim.enemy.y,victim.enemy.z);
  tick(victim,0);
  assert.deepEqual(p(victim.enemy.x,victim.enemy.y,victim.enemy.z),after,
    'frozen world time cannot progress recovery');
  tick(victim,.35);
  assert.equal(victim.enemy.encounter.webHitRemaining,0,
    'the reaction is bounded and cannot re-trigger without a new hit receipt');

  const unknown=make();
  unknown.enemy.reaction.reactionRevision=1;
  unknown.enemy.reaction.stunRemaining=.75;
  unknown.enemy.reaction.stunnedThisFrame=true;
  tick(unknown,0);
  advanceEnemyReaction(unknown.enemy.reaction,.75);
  tick(unknown,.15);
  assert.equal(unknown.enemy.encounter.webHitRemaining,0,
    'missing hit direction cannot be replaced by guessed source position');
  assert.equal(unknown.enemy.z,2);

  const dead=make();
  dead.enemy.hitIncomingDirection=p(1,0,0);
  dead.enemy.reaction.reactionRevision=1;
  dead.enemy.reaction.dead=true;
  dead.enemy.alive=false;
  tick(dead,.15);
  assert.equal(dead.enemy.encounter.webHitPending,false);
  assert.deepEqual(p(dead.enemy.x,dead.enemy.y,dead.enemy.z),p(2,0,2),
    'lethal hits do not create recovering living actors');
});
