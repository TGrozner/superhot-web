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

test('occupancy blocks crossing and overlapping spawn without scattering or teleporting',()=>{
  const runtime=setup(), enemy=firstSpawn(runtime);
  const blocker={id:'other',x:4,y:0,z:2.260869565217391,alive:true,active:true};
  advanceNativeEncounter(runtime,input([enemy,blocker],{scaledDeltaTime:1,unscaledDeltaTime:0}));
  assert.equal(enemy.x,2);
  assert.equal(enemy.z,2);
  const events=advanceNativeEncounter(runtime,input([enemy,blocker],{scaledDeltaTime:0,unscaledDeltaTime:2}));
  assert.equal(events.some(event=>event.type==='spawn'),false);
  assert.equal(runtime.arrivals.length,1);
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
