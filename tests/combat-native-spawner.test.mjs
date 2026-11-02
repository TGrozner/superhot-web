import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeSpawnerState, advanceNativeSpawner, eligibleNativeSpawnPoints } from '../src/combat/native-spawner.js';
const p=(x,y=0,z=0)=>({x,y,z});
const settings={startDelay:3,spawnDelay:.4,enemiesLeft:9,maxEnemiesOnScene:4,endless:false,
  dontSpawnNearPlayer:true,dontSpawnNearEnemies:true,safeDistance:8,removeInactiveSpawnPoints:false};
const point={id:'door-a',position:p(10),active:true,door:{redLightIntensityPickTime:1}};
const template={id:'factory'};
const frame=overrides=>({scaledDeltaTime:0,unscaledDeltaTime:0,enabled:true,spawningAreaInitialized:true,
  currentEnemyCount:0,templates:[template],getEligiblePoints:()=>[point],...overrides});
const tick=(state,overrides={})=>advanceNativeSpawner(state,settings,frame(overrides),()=>.5);

test('disabled replay spawner and uninitialized area do not manufacture enemies',()=>{
  const state=createNativeSpawnerState(settings,()=>.5);
  assert.deepEqual(tick(state,{enabled:false,unscaledDeltaTime:10}),[]);
  assert.equal(state.startDelayRemaining,3);
  assert.deepEqual(tick(state,{spawningAreaInitialized:false,unscaledDeltaTime:10}),[]);
  assert.equal(state.pending.length,0);
});

test('startup is unscaled; empty scene starts warning before delayed spawn',()=>{
  const state=createNativeSpawnerState(settings,()=>.5);
  assert.deepEqual(tick(state,{unscaledDeltaTime:2.9}),[]);
  const warning=tick(state,{unscaledDeltaTime:.11});
  assert.equal(warning.length,1); assert.equal(warning[0].type,'door-warning');
  assert.equal(warning[0].delay,2); assert.equal(state.enemiesLeft,8);
  assert.deepEqual(tick(state,{unscaledDeltaTime:1}),[]);
  const spawn=tick(state,{unscaledDeltaTime:.9});
  assert.equal(spawn.length,1); assert.equal(spawn[0].type,'spawn');
  assert.equal(spawn[0].template,template); assert.equal(state.pending.length,0);
});

test('queued doors count toward cap; scaled interval does not tick at frozen time',()=>{
  const state=createNativeSpawnerState({...settings,startDelay:0},()=>0);
  tick(state,{unscaledDeltaTime:.01});
  assert.equal(state.pending.length,1);
  assert.deepEqual(tick(state,{currentEnemyCount:3,scaledDeltaTime:1,unscaledDeltaTime:0}),[]);
  assert.equal(state.enemiesLeft,8);
  assert.equal(state.intervalRemaining,.4);
  assert.deepEqual(tick(state,{currentEnemyCount:1,scaledDeltaTime:0,unscaledDeltaTime:0}),[]);
  assert.equal(state.pending.length,1);
});

test('strict interval crossing and no qualifying point do not decrement remaining count',()=>{
  const state=createNativeSpawnerState({...settings,startDelay:0},()=>.5);
  assert.deepEqual(tick(state,{currentEnemyCount:1,scaledDeltaTime:.2}),[]);
  assert.equal(state.intervalRemaining,0);
  assert.deepEqual(tick(state,{currentEnemyCount:1,scaledDeltaTime:.01,getEligiblePoints:()=>[]}),[]);
  assert.equal(state.enemiesLeft,9);
  assert.equal(state.intervalRemaining,.4);
});

test('source doorless point counts successful attempt but never invents a spawn order',()=>{
  const state=createNativeSpawnerState({...settings,startDelay:0},()=>0);
  assert.deepEqual(tick(state,{getEligiblePoints:()=>[{...point,door:null}]}),[]);
  assert.equal(state.enemiesLeft,8); assert.equal(state.pending.length,0);
});

function eligibility(overrides={}) {
  return {points:[point],playerPosition:p(0),playerForward:p(1),cameraPosition:p(0),spawnerPosition:p(3),
    nearestEnemyAt:()=>null,castRay:()=>null,pendingPointIds:new Set(),...overrides};
}
test('near-player, nearby mobile enemy, queued and inactive source gates',()=>{
  assert.equal(eligibleNativeSpawnPoints(settings,eligibility()).length,1);
  assert.equal(eligibleNativeSpawnPoints(settings,eligibility({playerPosition:p(5)})).length,0);
  assert.equal(eligibleNativeSpawnPoints(settings,eligibility({nearestEnemyAt:()=>({position:p(11),standingAtCampingPoint:false})})).length,0);
  assert.equal(eligibleNativeSpawnPoints(settings,eligibility({nearestEnemyAt:()=>({position:p(11),standingAtCampingPoint:true})})).length,1);
  assert.equal(eligibleNativeSpawnPoints(settings,eligibility({pendingPointIds:new Set(['door-a'])})).length,0);
  assert.equal(eligibleNativeSpawnPoints({...settings,removeInactiveSpawnPoints:true},eligibility({points:[{...point,active:false}]})).length,0);
});

test('source angle ray originates at spawner root; blocked ray admits point, missing hit does not',()=>{
  const behind={...point,position:p(-10)};
  let request;
  const input=eligibility({points:[behind],castRay:r=>{request=r;return {isPlayer:false};}});
  assert.equal(eligibleNativeSpawnPoints(settings,input).length,1);
  assert.deepEqual(request.origin,p(3)); assert.deepEqual(request.direction,p(1)); assert.equal(request.maxDistance,10);
  assert.equal(eligibleNativeSpawnPoints(settings,{...input,castRay:()=>null}).length,0);
  assert.equal(eligibleNativeSpawnPoints(settings,{...input,castRay:()=>({isPlayer:true})}).length,0);
  assert.equal(eligibleNativeSpawnPoints(settings,{...input,castRay:()=>undefined}).length,0);
});

test('both safety toggles off follows source bypass rather than adding new filters',()=>{
  const input=eligibility({points:[{...point,active:false}],pendingPointIds:new Set(['door-a'])});
  assert.equal(eligibleNativeSpawnPoints({...settings,dontSpawnNearPlayer:false,dontSpawnNearEnemies:false,removeInactiveSpawnPoints:true},input).length,1);
});
