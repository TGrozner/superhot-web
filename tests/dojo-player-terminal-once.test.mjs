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
