import test from 'node:test';
import assert from 'node:assert/strict';
import {stepDojoNativeRunEnding} from '../src/flow/dojo-native-ending.js';

// Public synthetic signals; never imported from a private Unity package.
const source={sceneBuildIndex:10, serializedOwner:'level10',scenePath:'Assets/Scenes/SHRL_Dojo2.unity'};
const inputs=(overrides={})=>({source,gameType:'STANDARD_RUN',
  allNeededEnemyKilled:false,playerDead:false,winOnDeath:false,
  allowDebugKeys:false,lockLevel:false,...overrides});
const initial=Object.freeze({audioFaded:false});
const step=(overrides={}, state=initial)=>stepDojoNativeRunEnding(state,inputs(overrides));

test('Dojo authored RunEnding does not advance on an empty Web room or incomplete native quota',()=>{
  const out=step();
  assert.equal(out.branch,'waiting-for-native-clear');
  assert.equal(out.methodStatus,'Running');
  assert.equal(out.timelinePhaseComplete,false);
  assert.deepEqual(out.effects,[]);
  assert.equal(out.next.audioFaded,false);
});

test('normal native clear requests fade, crosshair off, player block then ending, not instant Win',()=>{
  const out=step({allNeededEnemyKilled:true});
  assert.equal(out.branch,'progress-ending');
  assert.deepEqual(out.effects,[
    {type:'fade-submaster',durationSeconds:2.5},
    {type:'disable-crosshair'}, {type:'block-player-actions'}, {type:'run-progress-ending'},
  ]);
  assert.equal(out.methodStatus,'Running');
  assert.equal(out.timelinePhaseComplete,false);
  assert.equal(out.next.audioFaded,true);
  assert.equal(out.nativeParity,'STATIC_SOURCE_ONLY');
  assert.ok(Object.isFrozen(out) && Object.isFrozen(out.effects) && Object.isFrozen(out.next));
});

test('a repeated callback does not request a second fade but repeats the ending procedure',()=>{
  const first=step({allNeededEnemyKilled:true});
  const second=step({allNeededEnemyKilled:true},first.next);
  assert.deepEqual(second.effects,[{type:'disable-crosshair'},
    {type:'block-player-actions'},{type:'run-progress-ending'}]);
  assert.equal(second.methodStatus,'Running');
});

test('WinOnDeath invokes ending even with unmet quota; normal dead player cannot clear',()=>{
  assert.equal(step({playerDead:true,allNeededEnemyKilled:true}).branch,'waiting-for-native-clear');
  assert.equal(step({playerDead:true,winOnDeath:true}).branch,'progress-ending');
});

test('endless level never progresses, even with WinOnDeath',()=>{
  assert.equal(step({gameType:'ENDLESS_LEVEL',allNeededEnemyKilled:true}).branch,'waiting-for-native-clear');
  assert.equal(step({gameType:'ENDLESS_LEVEL',playerDead:true,winOnDeath:true}).effects.length,0);
});

test('tutorial ending uses 1.5 s fade and tutorial handler, never the debug restart',()=>{
  const out=step({gameType:'TUTORIAL_RUN',allNeededEnemyKilled:true,
    allowDebugKeys:true,lockLevel:true});
  assert.deepEqual(out.effects,[{type:'fade-submaster',durationSeconds:1.5},
    {type:'disable-crosshair'},{type:'block-player-actions'},{type:'run-tutorial-ending'}]);
  assert.equal(out.methodStatus,'Running');
});

test('enabled native debug lock restarts and returns Status.Success before audio or HUD',()=>{
  const out=step({allNeededEnemyKilled:true,allowDebugKeys:true,lockLevel:true});
  assert.deepEqual(out.effects,[{type:'restart-level'}]);
  assert.equal(out.methodStatus,'Success');
  assert.equal(out.timelinePhaseComplete,true);
  assert.equal(out.next.audioFaded,false);
  assert.equal(step({allNeededEnemyKilled:true,lockLevel:true}).branch,'progress-ending');
});

test('Dojo identity and every source signal must be explicit',()=>{
  for(const patch of [{source:{...source,sceneBuildIndex:28}},
    {source:{...source,serializedOwner:'level28'}}, {source:{...source,scenePath:'SHRL_Dojo2.unity.backup'}}]){
    assert.throws(()=>step(patch),/Dojo ending/);
  }
  for(const field of ['allNeededEnemyKilled','playerDead','winOnDeath','allowDebugKeys','lockLevel']){
    assert.throws(()=>step({[field]:undefined}),/explicit boolean/);
  }
  assert.throws(()=>step({gameType:null}),/gameType/);
  assert.throws(()=>step({}, {audioFaded:undefined}),/explicit boolean/);
});

test('signals and saved state remain untouched by each pure callback',()=>{
  const s=inputs({allNeededEnemyKilled:true});const p={audioFaded:false};
  stepDojoNativeRunEnding(p,s);
  assert.deepEqual(p,{audioFaded:false});
  assert.deepEqual(s,inputs({allNeededEnemyKilled:true}));
});
