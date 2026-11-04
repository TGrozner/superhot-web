import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeEncounter, advanceNativeEncounter, readyForVictory } from '../src/combat/native-encounter.js';
import { prepareNativeCollision } from '../src/scenes/native-collision.js';
import { advanceEnemyReaction } from '../src/animation/enemy-reaction.js';

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
  const wingman={id:'armed-wingman',x:2,y:0,z:8,alive:true,active:true,
    reaction:{hasWeapon:true}};
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
  advanceNativeEncounter(edgeRuntime,input([edgeEnemy,wingman],{...edge,scaledDeltaTime:.2}));
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


test('J3 Web projectile evade: visible player bullets trigger a bounded swept side-step, not clairvoyance',()=>{
  const runtime=setup(),enemy=firstSpawn(runtime);
  const aimedFrom=p(15,1,2);
  const bullet={friendly:true,type:'normal',pos:aimedFrom,direction:p(-1,0,0),speed:35};
  const start=p(enemy.x,enemy.y,enemy.z);
  advanceNativeEncounter(runtime,input([enemy],{
    scaledDeltaTime:.12,playerProjectiles:[bullet],
  }));
  assert.ok(Math.abs(enemy.z-start.z)>.005,'enemy sidesteps a live approaching shot');
  assert.ok(Math.hypot(enemy.x-start.x,enemy.z-start.z)<.3,'single frame is speed-bounded');
  assert.ok(enemy.encounter.webDodgeRemaining>0,'dodge persists briefly, without teleporting');
  assert.equal(enemy.encounter.canAttack,false,'evade does not manufacture a muzzle');
  const afterFirst=p(enemy.x,enemy.y,enemy.z);
  advanceNativeEncounter(runtime,input([enemy],{scaledDeltaTime:.12,playerProjectiles:[]}));
  assert.ok(Math.abs(enemy.z-afterFirst.z)>.005,'evade remains legible after bullet moves on');
  for(let i=0;i<4;i++)advanceNativeEncounter(runtime,input([enemy],{scaledDeltaTime:.12,playerProjectiles:[]}));
  assert.equal(enemy.encounter.webDodgeRemaining,0,'short dodge terminates');
  assert.ok(enemy.encounter.webDodgeCooldown>0,'same projectile cannot cause endless jitter');

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
