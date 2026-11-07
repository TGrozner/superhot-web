import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Exercise the actual browser integration functions with the DOM/audio/storage
// dependencies stubbed; Node cannot import main.js without booting WebGL.
const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const finish = source.match(/function finish\(win\) \{[\s\S]*?\n\}(?=\n\n\$\('start-button'\))/)?.[0];
const damage = source.match(/function damagePlayer\(\) \{[\s\S]*?\n\}(?=\nfunction closestImpact\()/)?.[0];

test('SH-05: one fatal hit ends/persists the round once, even with repeated same-frame contacts', () => {
  assert.ok(finish && damage, 'the live Dojo terminal/damage functions must be exercised');
  const state = {screen:'playing', health:1, kills:1, shots:2, runClock:3, score:200, dodges:0};
  const persisted = [], displayed = new Map();
  let hitSounds = 0, recaps = 0;
  const sandbox = {
    state, canvas:{}, document:{pointerLockElement:null},
    nativeCombatStarted:true, nativeGameplay:()=>true,
    nativeEncounter:{killTarget:6}, nativeScene:{source:{source:'test'}},
    isDojoBuild10Source:()=>true,
    window:{localStorage:{
      getItem:()=>null,
      setItem:(key,value)=>persisted.push({key,value}),
    }},
    readDojoReplayBest:()=>null,
    createDojoReplayRecap:()=>{
      recaps++;return {text:'DEAD',shouldPersist:true,best:{trackedAttempts:1}};
    },
    $:(id)=>{
      if(!displayed.has(id))displayed.set(id,{textContent:''});
      return displayed.get(id);
    },
    setScreen:(screen)=>{state.screen=screen;},
    audio:{hit:()=>{hitSounds++;},win:()=>{}},
  };
  runInNewContext(`${finish}\n${damage}\nglobalThis.applyDamage=damagePlayer;globalThis.endRound=finish;`,sandbox);
  sandbox.applyDamage();
  sandbox.applyDamage(); // A second impact resolves after the fatal one.
  sandbox.endRound(false); // Defensive retry by any other producer.
  assert.equal(state.health,0,'no negative HP after terminal state');
  assert.equal(state.screen,'dead');
  assert.equal(hitSounds,1,'one real fatal hit sound');
  assert.equal(recaps,1,'one persistence/replay attempt computation');
  assert.equal(persisted.length,1,'never double-count the same defeat');
  assert.equal(displayed.get('death-stats').textContent,'DEAD');

  state.screen='paused';state.health=2;
  sandbox.applyDamage();
  assert.equal(state.health,2,'paused combat never takes damage');
  state.screen='playing';sandbox.nativeCombatStarted=false;
  sandbox.applyDamage();
  assert.equal(state.health,2,'pre-START preview never takes damage');
  sandbox.nativeCombatStarted=true;
  sandbox.applyDamage();
  assert.equal(state.health,1,'a resumed active round still takes a nonfatal hit');
});

test('SH-05: late hostile hit cannot overturn confirmed Dojo win, but pre-quota damage is lethal', () => {
  assert.ok(finish && damage, 'exercise the actual live Dojo functions');
  const state = {
    screen:'playing', transition:1, health:1, kills:6, shots:6,
    runClock:9, score:600, dodges:0,
  };
  let hitSounds=0, winSounds=0, recaps=0;
  const displayed=new Map(), persisted=[];
  const sandbox={
    state, canvas:{}, document:{pointerLockElement:null},
    nativeCombatStarted:true, nativeGameplay:()=>true,
    nativeEncounter:{killTarget:6}, nativeScene:{source:{source:'synthetic-dojo'}},
    isDojoBuild10Source:()=>true,
    window:{localStorage:{getItem:()=>null,setItem:(key,v)=>persisted.push([key,v])}},
    readDojoReplayBest:()=>null,
    createDojoReplayRecap:()=>{recaps++;return {text:'VICTORY',shouldPersist:true,best:{trackedAttempts:1}};},
    readDojoGlobalStreak:()=>({}),
    advanceDojoGlobalStreak:()=>({record:{streak:1},announcement:'SÉRIE 1'}),
    $:(id)=>{if(!displayed.has(id))displayed.set(id,{textContent:''});return displayed.get(id);},
    setScreen:(s)=>{state.screen=s;},
    audio:{hit:()=>{hitSounds++;},win:()=>{winSounds++;}},
  };
  runInNewContext(`${finish}\n${damage}\nglobalThis.hit=damagePlayer;globalThis.complete=finish;`,sandbox);

  // The sixth confirmed kill already armed the 1s victory transition.
  // An enemy bullet still in flight must not steal the completed quota.
  sandbox.hit();
  assert.equal(state.health,1);
  assert.equal(state.screen,'playing');
  assert.equal(hitSounds,0);
  sandbox.complete(true);
  sandbox.hit(); // A second late contact after the terminal screen.
  assert.equal(state.screen,'win');
  assert.equal(displayed.get('win-stats').textContent,'VICTORY · SÉRIE 1');
  assert.equal(recaps,1,'score the earned win once');
  assert.equal(winSounds,1);
  assert.equal(persisted.length,2,'persist one quota result and one global streak');

  // REJOUER resets transition: the very next pre-quota hit remains lethal.
  state.screen='playing';state.transition=0;state.health=1;
  sandbox.hit();
  assert.equal(state.screen,'dead');
  assert.equal(state.health,0);
  assert.equal(hitSounds,1);

  // The guard is Dojo-specific: other native scenes keep normal damage.
  state.screen='playing';state.transition=1;state.health=1;
  sandbox.isDojoBuild10Source=()=>false;
  sandbox.hit();
  assert.equal(state.screen,'dead');
  assert.equal(state.health,0);
  assert.equal(hitSounds,2);
});
