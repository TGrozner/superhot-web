import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDojoKillCompletion } from '../src/flow/dojo-combat-completion.js';

const source = Object.freeze({
  sceneBuildIndex:10, serializedOwner:'level10',
  scenePath:'Assets/Scenes/SHRL_Dojo2.unity',
});

function battle(killTarget = 6) {
  const enemies = Array.from({length:killTarget}, (_, index) => ({
    id:'native-encounter-'+index, alive:true, active:true, reaction:{dead:false},
  }));
  return {
    enemies,
    encounter:{
      killTarget, killed:0,
      actors:new Map(enemies.map(enemy=>[enemy.id,enemy])),
      countedDeaths:new Set(),
      spawner:{pending:[{id:'pending-door'}],enemiesLeft:3},
      arrivals:[{id:'pending-arrival'}],
    },
  };
}
const resolve = (combat, extra = {}) => resolveDojoKillCompletion({
  source, encounter:combat.encounter, enemies:combat.enemies,
  activeScreen:'playing', playerAlive:true, transitionPending:false, ...extra,
});

test('six actually recorded combat deaths authorize the Web win and cancel unspawned arrivals', () => {
  const combat=battle(6);
  assert.equal(resolve(combat).intent,null,'empty kill counter is not victory');
  for(let i=0;i<5;i++) {
    combat.enemies[i].alive=false;
    const result=resolve(combat);
    assert.equal(combat.encounter.killed,i+1);
    assert.equal(result.progress.remaining,5-i);
    assert.equal(result.intent,null);
    assert.equal(combat.encounter.spawner.pending.length,1,
      'pending source door orders persist before the quota');
  }
  combat.enemies[5].reaction.dead=true;
  const done=resolve(combat);
  assert.equal(done.status,'request-provisional-web-victory');
  assert.deepEqual(done.intent,{
    type:'request-web-win-transition', nativeParity:'UNVERIFIED', delaySeconds:null,
  });
  assert.equal(done.progress.remaining,0);
  assert.equal(combat.encounter.killed,6);
  assert.equal(combat.encounter.spawner.pending.length,0);
  assert.equal(combat.encounter.spawner.enemiesLeft,0);
  assert.equal(combat.encounter.arrivals.length,0);
  assert.equal(combat.encounter.countedDeaths.size,6);
});

test('seven-kill random quota does not win at six or when currently visible enemies are absent', () => {
  const combat=battle(7);
  assert.equal(resolve(combat,{enemies:[]}).status,'waiting-for-combat-quota');
  assert.equal(combat.encounter.killed,0);
  for(let i=0;i<6;i++)combat.enemies[i].alive=false;
  assert.equal(resolve(combat,{enemies:[]}).intent,null,
    'registered dead actors count but six deaths cannot satisfy a seven target');
  assert.equal(combat.encounter.killed,6);
  combat.enemies[6].alive=false;
  assert.equal(resolve(combat,{enemies:[]}).intent?.type,'request-web-win-transition');
  assert.equal(combat.encounter.killed,7);
});

test('bridge traverses the combat enemy array exactly once per eligible kill', () => {
  const combat=battle();
  let iterations=0;
  const observed=combat.enemies;
  Object.defineProperty(observed,Symbol.iterator,{value:function* () {
    iterations++; for(let i=0;i<observed.length;i++) yield observed[i];
  }});
  observed[0].alive=false;
  assert.equal(resolve(combat).progress.killed,1);
  assert.equal(iterations,1,'no second readyForVictory evaluation hidden in flow');
  assert.equal(resolve(combat).progress.killed,1,'counted deaths are idempotent');
  assert.equal(iterations,2,'each new eligible call performs one evaluation');
});

test('already pending Win, dead player and non-playing screens cannot re-arm the timer', () => {
  for(const extra of [
    {transitionPending:true}, {playerAlive:false},
    {activeScreen:'dead'}, {activeScreen:'paused'}, {activeScreen:'win'},
  ]) {
    const combat=battle();
    combat.enemies.forEach(enemy=>{enemy.alive=false;});
    const outcome=resolve(combat,extra);
    assert.equal(outcome.intent,null);
    assert.equal(combat.encounter.killed,0,
      'flow gate must not mutate combat while the game is already leaving play');
    assert.equal(combat.encounter.spawner.pending.length,1);
  }
});

test('quota does not overwrite a running provisional transition after first receipt', () => {
  const combat=battle();
  combat.enemies.forEach(enemy=>{enemy.alive=false;});
  assert.equal(resolve(combat).intent?.type,'request-web-win-transition');
  const pending=resolve(combat,{transitionPending:true});
  assert.equal(pending.status,'web-transition-pending');
  assert.equal(pending.intent,null);
  assert.equal(combat.encounter.countedDeaths.size,6);
});

test('fresh Web restart requires a new encounter, not a replay of counted actors', () => {
  const old=battle(6);
  old.enemies.forEach(enemy=>{enemy.alive=false;});
  assert.ok(resolve(old).intent);
  const restarted=battle(7);
  const next=resolve(restarted);
  assert.equal(next.intent,null);
  assert.equal(next.progress.killTarget,7);
  assert.equal(next.progress.killed,0);
  assert.equal(old.encounter.killed,6,'old runtime is not cleared or reused by flow');
});

test('wrong scene or malformed combat input fails before mutating a death receipt', () => {
  const combat=battle();
  combat.enemies[0].alive=false;
  assert.throws(()=>resolve(combat,{source:{...source,sceneBuildIndex:28}}),/Dojo flow requires/);
  assert.throws(()=>resolve(combat,{source:{...source,serializedOwner:'level28'}}),/Dojo flow requires/);
  assert.throws(()=>resolve(combat,{enemies:null}),/combat actor array/);
  assert.throws(()=>resolve(combat,{encounter:{...combat.encounter,killTarget:5}}),/6\/7/);
  assert.equal(combat.encounter.killed,0);
  assert.equal(combat.encounter.countedDeaths.size,0);
});
