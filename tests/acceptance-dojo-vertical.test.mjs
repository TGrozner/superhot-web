import test from 'node:test';
import assert from 'node:assert/strict';
import { assessDojoVertical, DOJO_VERTICAL_STATUS } from '../scripts/acceptance-dojo-vertical.mjs';
import { assessDojoPlaythrough } from '../scripts/acceptance-dojo-playthrough.mjs';

const source = { scenePath:'Assets/Scenes/SHRL_Dojo2.unity', sceneBuildIndex:10, serializedOwner:'level10' };
const p = (x,y=0,z=0) => ({x,y,z});
function f(frameId, feet=p(0), {screen='playing', kills=0, enemies=[], heldItem=null,
  itemStates=[], ammo=6, weapon=true, fragments=0, audio=3, moving=true, target=6}={}) {
  return {
    frameId, activeScreen:screen, worldClock:frameId*.1,
    nativeScene:{source:{...source}},
    gameplay:{encounter:{killTarget:target,killed:kills,enemies},
      heldItem, itemStates, itemsTotal:2, itemsTruncated:false,
      originalFragmentCount:fragments, audioAmbienceSources:audio,
      weapon, ammo, feet, grounded:true, moving},
  };
}
function complete(target=6) {
  const alive = [{id:'native-encounter-0',alive:true}];
  const deadThrough = count => Array.from({length:count}, (_,id) =>
    ({id:'native-encounter-'+id,alive:false}));
  const frames = [
    f(1,p(0),{target,moving:false}),
    f(2,p(.1),{target}),
    f(3,p(.45),{target}),
    f(4,p(1.05),{target}),
    f(5,p(1.1),{target}),
    f(6,p(1.3,.13),{target}),
    f(7,p(1.5,.35),{target}),
    f(8,p(1.5,.35),{target}),
    f(9,p(1.51,.35),{target}),
    f(10,p(1.51,.35),{target}),
    f(11,p(1.51,.35),{target,enemies:alive,ammo:5}),
    f(12,p(1.51,.35),{target,enemies:alive,weapon:false,ammo:0,heldItem:'cup-1',itemStates:[{id:'cup-1',state:'held'}]}),
    f(13,p(1.51,.35),{target,enemies:alive,weapon:false,ammo:0,itemStates:[{id:'cup-1',state:'broken'}],fragments:25}),
    ...Array.from({length:target}, (_, n) => f(14+n,p(1.51,.35),{
      target,kills:n+1,enemies:deadThrough(n+1),weapon:false,ammo:0,
      itemStates:[{id:'cup-1',state:'broken'}],fragments: n < 2 ? 25 : 10,
    })),
    f(14+target,p(1.51,.35),{target,screen:'win',kills:target,enemies:deadThrough(target),weapon:false,ammo:0,itemStates:[{id:'cup-1',state:'broken'}],fragments:10}),
    f(15+target,p(0),{target,moving:false}),
  ];
  frames.at(-1).worldClock=.1;
  return {schemaVersion:2,captureKind:'SH10_DOJO_OWNER_BROWSER_V2',frames,
    marks:[
      {type:'door-before',frameId:2},{type:'door-after',frameId:4},
      {type:'stairs-bottom',frameId:5},{type:'stairs-top',frameId:7},
      {type:'wall-press-start',frameId:8},{type:'wall-press-end',frameId:10},
    ]};
}
const report = trace => assessDojoVertical(trace);
const failure = (trace, expression) => {
  const result = report(trace);
  assert.equal(result.complete, false);
  assert.match(result.errors.join('\n'), expression);
  assert.equal(result.nativeParityVerdict,'UNKNOWN');
};

test('SH10 full Dojo 6-kill authored trace: source, gun, pickup/throw, route and reset',()=>{
  const data=complete();
  assert.equal(assessDojoPlaythrough(data).complete,true);
  const result=report(data);
  assert.equal(result.status,DOJO_VERTICAL_STATUS.COMPLETE,JSON.stringify(result.errors));
  assert.equal(result.complete,true);
  assert.equal(result.observed.killTarget,6);
  assert.deepEqual(result.observed.ambientSourcesBeforeAndAfter,[3,3]);
  assert.equal(result.browserActuallyExecutedByThisTest,false);
  assert.equal(result.sourceNativeExecuted,false);
  assert.equal(result.matchedNativeWebFrames,false);
  assert.equal(result.nativeParityVerdict,'UNKNOWN');
});

test('SH10 also accepts an independently completed 7-kill trace without asserting Unity parity',()=>{
  const result=report(complete(7));
  assert.equal(result.status,DOJO_VERTICAL_STATUS.COMPLETE);
  assert.equal(result.observed.killTarget,7);
});

test('SH10 baseline alone does not prove pickup, gun or route',()=>{
  const data=complete();
  data.frames.forEach(f=>{f.gameplay.itemStates=[];f.gameplay.heldItem=null;});
  assert.equal(assessDojoPlaythrough(data).complete,true);
  failure(data,/no source-item held state/);
});

test('SH10 missing pistol fire counter is not silently treated as an equipped fired gun',()=>{
  const data=complete();
  // F throws the pistol and zeroes its ammo: this must NOT count as firing.
  data.frames[10].gameplay.ammo=6;
  assert.equal(assessDojoPlaythrough(data).complete,true);
  failure(data,/armed ammo decrease.*gun discard is not a shot/);
});

test('SH10 same-item release requires observed changed state before victory',()=>{
  const data=complete();data.frames.slice(12,-1).forEach(f=>{f.gameplay.itemStates=[];});
  failure(data,/same-item release/);
});

test('SH10 rejects leftover fragment/shard pool and held item after restart',()=>{
  for(const mutate of [f=>{f.gameplay.originalFragmentCount=4;},f=>{f.gameplay.heldItem='cup-1';f.gameplay.weapon=false;},f=>{f.gameplay.itemsTotal=3;}]){
    const data=complete();mutate(data.frames.at(-1));
    failure(data,/item pool\/held item\/fragments/);
  }
});

test('SH10 observes duplicate ambient sources on restart as a reset leak candidate',()=>{
  const data=complete();data.frames.at(-1).gameplay.audioAmbienceSources=6;
  failure(data,/ambient native WebAudio source count changed/);
});

test('SH10 requires starting weapon and ammo to be restored',()=>{
  const data=complete();data.frames.at(-1).gameplay.ammo=0;
  failure(data,/starting weapon\/ammo not restored/);
});

test('SH10 requires an actual world-clock reset after victory, not just kill reset',()=>{
  const data=complete();data.frames.at(-1).worldClock=99;
  failure(data,/worldClock did not reset/);
});

test('SH10 missing door threshold route is incomplete, not verified by fight',()=>{
  const data=complete();data.marks=data.marks.filter(x=>x.type!=='door-after');
  failure(data,/missing\/out-of-order route segment door-before/);
});

test('SH10 door must be traversed in bounded observed increments, not one teleport',()=>{
  const data=complete();data.frames[3].gameplay.feet=p(9);
  failure(data,/unsampled jump|door\/threshold crossing/);
});

test('SH10 stair ascent must gain height while grounded',()=>{
  const data=complete();data.frames[6].gameplay.feet=p(1.5,.07);
  failure(data,/grounded stair ascent/);
});

test('SH10 wall press must show movement input without moving through wall',()=>{
  const data=complete();data.frames[9].gameplay.feet=p(2.5,.35);
  failure(data,/unsampled jump|blocked movement/);
});

test('SH10 fails closed on invalid input schema, impossible point or fake scene owner',()=>{
  for(const mutate of [
    data=>{data.schemaVersion=1;},
    data=>{data.frames[8].gameplay.feet={x:Infinity,y:0,z:0};},
    data=>{data.frames[8].nativeScene.source.serializedOwner='level28';},
  ]){
    const data=complete();mutate(data);
    assert.equal(report(data).status,DOJO_VERTICAL_STATUS.INVALID);
  }
});

test('SH10 rejects owner-label duplication and unobserved browser frame IDs',()=>{
  const data=complete();data.marks.push({...data.marks[0]});
  failure(data,/duplicate route marker/);
  const missing=complete();missing.marks[0].frameId=123456;
  failure(missing,/invalid\/unmatched route marker/);
});

test('SH10 reset before winning cannot be scored as one continuous win',()=>{
  const data=complete();data.frames[14].gameplay.encounter.killed=0;
  failure(data,/kill counter reset|base Dojo start/);
});

test('SH10 a quota of six is not proved by one large unobserved counter jump',()=>{
  const data=complete();
  data.frames=data.frames.filter(f=>f.gameplay.encounter.killed < 3 || f.gameplay.encounter.killed === 6);
  failure(data,/individual kill-counter transitions/);
});

test('SH10 rejects simultaneous gun-equipped and source-item-held telemetry',()=>{
  const data=complete();
  data.frames[11].gameplay.weapon=true;
  const result=report(data);
  assert.equal(result.status,DOJO_VERTICAL_STATUS.INVALID);
  assert.match(result.errors.join('\n'),/invalid Dojo v2 runtime telemetry/);
});

test('SH10 rejects six counter increments represented by a single repeatedly dead actor',()=>{
  const data=complete();
  for(const frame of data.frames) {
    if(frame.gameplay.encounter.enemies.some(actor=>!actor.alive))
      frame.gameplay.encounter.enemies=[{id:'native-encounter-0',alive:false}];
  }
  failure(data,/distinct dead actor IDs/);
});

test('SH10 does not accept a resurrected enemy or duplicate actor ID before reset',()=>{
  const resurrected=complete();
  resurrected.frames[14].gameplay.encounter.enemies[0].alive=true;
  assert.equal(report(resurrected).status,DOJO_VERTICAL_STATUS.INVALID);
  assert.match(report(resurrected).errors.join('\\n'),/resurrected/);
  const duplicate=complete();
  duplicate.frames[14].gameplay.encounter.enemies.push({...duplicate.frames[14].gameplay.encounter.enemies[0]});
  assert.equal(report(duplicate).status,DOJO_VERTICAL_STATUS.INVALID);
  assert.match(report(duplicate).errors.join('\\n'),/duplicate Web encounter actor/);
});
