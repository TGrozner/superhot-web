import test from 'node:test';
import assert from 'node:assert/strict';
import {isDojoBuild10Source, planDojoEncounterOutcome, planDojoRestartIntent}
  from '../src/flow/dojo-round-intents.js';

// Synthetic Web receipt fixtures only. No MCD runtime or private assets.
const source=Object.freeze({sceneBuildIndex:10,serializedOwner:'level10',
  scenePath:'Assets/Scenes/SHRL_Dojo2.unity'});
const outcome=(changes={})=>planDojoEncounterOutcome({source,
  encounter:{killTarget:6,killed:0},quotaConfirmed:false,
  activeScreen:'playing',playerAlive:true,transitionPending:false,...changes});

test('requires exact source scene, build index and serialization owner',()=>{
  assert.equal(isDojoBuild10Source(source),true);
  for(const override of [
    {sceneBuildIndex:28}, {serializedOwner:'level28'},
    {scenePath:'Assets/Scenes/SHRL_ContainerPort.unity'},
    {scenePath:'Assets/Scenes/SHRL_Dojo2.unity.backup'},
  ]) {
    const wrong={...source,...override};
    assert.equal(isDojoBuild10Source(wrong),false);
    assert.throws(()=>outcome({source:wrong}),/Dojo flow requires/);
    assert.throws(()=>planDojoRestartIntent({source:wrong,activeScreen:'win'}),/Dojo flow requires/);
  }
});

test('0/N kills and missing visible actors cannot authorize victory',()=>{
  const before=outcome({encounter:{killTarget:6,killed:0}});
  assert.equal(before.status,'waiting-for-combat-quota');
  assert.equal(before.progress.remaining,6);
  assert.equal(before.intent,null);
  assert.equal(outcome({encounter:{killTarget:6,killed:6},quotaConfirmed:false}).intent,null,
    'raw count alone does not replace combat-owner receipt');
});

test('six-kill receipt emits one declarative Web win request with no timer',()=>{
  const receipt=outcome({encounter:{killTarget:6,killed:6},quotaConfirmed:true});
  assert.equal(receipt.status,'request-provisional-web-victory');
  assert.deepEqual(receipt.intent,{type:'request-web-win-transition',nativeParity:'UNVERIFIED',delaySeconds:null});
  assert.equal(receipt.progress.remaining,0);
});

test('seven-kill selection never wins at six and supports simultaneous overkill',()=>{
  assert.equal(outcome({encounter:{killTarget:7,killed:6}}).progress.remaining,1);
  assert.equal(outcome({encounter:{killTarget:7,killed:6}}).intent,null);
  assert.deepEqual(outcome({encounter:{killTarget:7,killed:8},quotaConfirmed:true}).intent?.type,
    'request-web-win-transition');
});

test('no duplicate request while timer pending or Web win already displayed',()=>{
  const met={encounter:{killTarget:6,killed:6},quotaConfirmed:true};
  assert.equal(outcome({...met,transitionPending:true}).status,'web-transition-pending');
  assert.equal(outcome({...met,transitionPending:true}).intent,null);
  assert.equal(outcome({...met,activeScreen:'win'}).status,'already-won-web');
  assert.equal(outcome({...met,activeScreen:'win'}).intent,null);
});

test('death and pause cannot authorize victory even with a combat receipt',()=>{
  const met={encounter:{killTarget:7,killed:7},quotaConfirmed:true};
  for(const activeScreen of ['dead','paused','menu']) {
    assert.equal(outcome({...met,activeScreen}).intent,null);
  }
  assert.equal(outcome({...met,playerAlive:false}).intent,null);
});

test('rejects absent quota confirmation, forged out-of-range quota and contradictory receipt',()=>{
  assert.throws(()=>outcome({quotaConfirmed:undefined}),/explicit quotaConfirmed/);
  assert.throws(()=>outcome({encounter:{killTarget:5,killed:5},quotaConfirmed:true}),/6\/7/);
  assert.throws(()=>outcome({encounter:{killTarget:7,killed:6},quotaConfirmed:true}),/contradicts/);
  assert.throws(()=>outcome({encounter:{killTarget:6,killed:-1}}),/nonnegative/);
  assert.throws(()=>outcome({encounter:{killTarget:6,killed:NaN}}),/nonnegative/);
});

test('outcome planner is pure and returns frozen progress and intent',()=>{
  const encounter={killTarget:6,killed:6};
  const sourceCopy={...source};
  const result=outcome({encounter,source:sourceCopy,quotaConfirmed:true});
  assert.deepEqual(encounter,{killTarget:6,killed:6});
  assert.deepEqual(sourceCopy,source);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.progress) && Object.isFrozen(result.intent));
});

test('restart from pause/death/win/menu requests fresh Web runtime, never native checkpoint',()=>{
  for(const activeScreen of ['paused','dead','win','menu']) {
    const planned=planDojoRestartIntent({source,activeScreen});
    assert.equal(planned.status,'request-fresh-web-run');
    assert.equal(planned.intent.type,'request-web-resetGame');
    assert.equal(planned.intent.mustRecreateEncounter,true);
    assert.equal(planned.intent.mustClearKillCount,true);
    assert.equal(planned.intent.mustClearPendingTransition,true);
    assert.equal(planned.intent.nativeParity,'UNVERIFIED');
  }
  assert.equal(planDojoRestartIntent({source,activeScreen:'playing'}).intent,null);
});

test('restart is an intent only; an unreset kill receipt stays unchanged',()=>{
  const old={killTarget:6,killed:6};
  planDojoRestartIntent({source,activeScreen:'win'});
  assert.deepEqual(old,{killTarget:6,killed:6});
  const newReceipt=outcome({encounter:{killTarget:7,killed:0},quotaConfirmed:false});
  assert.equal(newReceipt.progress.remaining,7);
  assert.equal(newReceipt.intent,null);
});
