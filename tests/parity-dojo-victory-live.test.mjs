import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isDojoBuild10Source } from '../src/flow/dojo-round-intents.js';
import { resolveDojoKillCompletion } from '../src/flow/dojo-combat-completion.js';

// Check live call-site, while flow-dojo-combat-completion.test.mjs exercises
// the true combat-owner mutable runtime with 6/7 deaths and replay.
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const kill=main.slice(main.indexOf('function killEnemy(enemy,'),main.indexOf('function damagePlayer()'));
assert.ok(kill.startsWith('function killEnemy(enemy,'),'death dispatch must remain reachable');

test('SH-05 main dispatches Dojo kill receipts only once and preserves other scenes',()=>{
  assert.match(kill,/if \(isDojoBuild10Source\(nativeScene\.source\)\)/);
  assert.match(kill,/resolveDojoKillCompletion\(\{/);
  assert.match(kill,/activeScreen:state\.screen/);
  assert.match(kill,/playerAlive:state\.health > 0, transitionPending:state\.transition > 0/);
  assert.match(kill,/result\.intent\?\.type === 'request-web-win-transition'/);
  const dojo=kill.slice(kill.indexOf('if (isDojoBuild10Source'),kill.indexOf('} else if (state.transition <= 0'));
  assert.doesNotMatch(dojo,/readyForVictory\(/);
  assert.match(kill,/state\.transition <= 0 && readyForVictory\(nativeEncounter,state\.enemies\)/);
});
test('SH-05 Dojo victory transition drains by active real time, not capped physics time',()=>{
  const update=main.slice(main.indexOf('function update(dt, activeRealDt)'),main.indexOf('function updateHud('));
  assert.ok(update.includes('state.transition-=nativeGameplay() ? activeRealDt : dt;'));
  assert.ok(!update.includes('state.transition-=dt;'));
});

test('Dojo valid scene receipt only authorizes provisional Web win at true combat quota',()=>{
  const source={sceneBuildIndex:10,serializedOwner:'level10',scenePath:'Assets/Scenes/SHRL_Dojo2.unity'};
  assert.equal(isDojoBuild10Source(source),true);
  assert.equal(isDojoBuild10Source({...source,sceneBuildIndex:28}),false);
  const one={id:'native-encounter-0',alive:false,reaction:{dead:true}};
  const encounter={killTarget:6,killed:5,actors:new Map([[one.id,one]]),
    countedDeaths:new Set(['a','b','c','d','e']),
    spawner:{pending:[],enemiesLeft:0},arrivals:[]};
  const report=resolveDojoKillCompletion({source,encounter,enemies:[one],
    activeScreen:'playing',playerAlive:true,transitionPending:false});
  assert.equal(report.intent?.type,'request-web-win-transition');
  assert.equal(encounter.killed,6);
  assert.equal(resolveDojoKillCompletion({source,encounter,enemies:[one],
    activeScreen:'playing',playerAlive:true,transitionPending:true}).intent,null);
});
