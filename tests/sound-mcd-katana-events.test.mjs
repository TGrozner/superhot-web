import test from 'node:test';
import assert from 'node:assert/strict';
import {MCD_KATANA_AUDIO,planMcdKatanaSliceSound,planMcdKatanaHitSceneBinding} from '../src/sound/mcd-katana-event-intent.js';
import {planMcdPlayClip, MCD_PLAYCLIP_RESULT} from '../src/sound/mcd-playclip-intent.js';
const state = (patch={}) => ({producer:'living-body-part',realtimeSeconds:0.5,
  previousSliceRealtimeSeconds:0,localClipDecoded:true,...patch});

test('native Katana.Hit source IDs and playback request parameters',()=>{
  assert.equal(MCD_KATANA_AUDIO.resourceAsset.pathId,29451);
  assert.deepEqual(MCD_KATANA_AUDIO.defaultSwingClips.map(x=>x.pathId),[603,629,1644]);
  assert.equal(MCD_KATANA_AUDIO.hit.clip.pathId,1443);
  assert.equal(MCD_KATANA_AUDIO.hit.serializedVolume,0.5);
  assert.equal(MCD_KATANA_AUDIO.hit.mixerReference.pathId,659);
  assert.equal(MCD_KATANA_AUDIO.hit.relativePitch,true);
});

test('only four source AttackTarget branches can request slice',()=>{
  for(const producer of ['gun-pickup','shatterable','break-glass','living-body-part']) {
    assert.equal(planMcdKatanaSliceSound(state({producer})).status,'local-clip-request');
  }
  assert.equal(planMcdKatanaSliceSound(state({producer:null})).status,'not-source-slice');
  assert.throws(()=>planMcdKatanaSliceSound(state({producer:'bullet-slice'})),TypeError);
});

test('strict native .1s REAL-time rest (including first start from zero)',()=>{
  assert.equal(planMcdKatanaSliceSound(state({realtimeSeconds:0.1})).status,'native-realtime-rest');
  assert.equal(planMcdKatanaSliceSound(state({realtimeSeconds:0.100001})).status,'local-clip-request');
  assert.equal(planMcdKatanaSliceSound(state({realtimeSeconds:7.1,previousSliceRealtimeSeconds:7})).status,
    'native-realtime-rest');
});

test('missing local original clip never fabricates a procedural replacement',()=>{
  const result=planMcdKatanaSliceSound(state({localClipDecoded:false}));
  assert.equal(result.status,'native-request-local-clip-missing');
  assert.equal(result.clip,null);
  assert.equal(result.requestedNextSliceRealtimeSeconds,0.5);
  assert.equal(result.browserAudibilityObserved,false);
});

test('successful plan retains exact known source clip, never claims audition',()=>{
  const result=planMcdKatanaSliceSound(state());
  assert.deepEqual(result.clip,MCD_KATANA_AUDIO.hit.clip);
  assert.equal(result.requestedNextSliceRealtimeSeconds,0.5);
  assert.equal(result.browserAudibilityObserved,false);
});

test('source rejects unknown flags and nonfinite/negative clock input',()=>{
  assert.throws(()=>planMcdKatanaSliceSound(state({realtimeSeconds:NaN})),TypeError);
  assert.throws(()=>planMcdKatanaSliceSound(state({previousSliceRealtimeSeconds:-1})),TypeError);
  assert.throws(()=>planMcdKatanaSliceSound(state({localClipDecoded:'unknown'})),TypeError);
});

test('Katana private WAV can be registered for verified scene item, not generic hits',()=>{
  const base={ambience:[{id:'existing-door'}],items:{'source-katana-1':{pickup:{prefab:'previous'}}}};
  const call=(patch={})=>planMcdKatanaHitSceneBinding({sceneAudio:base,
    itemId:'source-katana-1',sourceItemVerified:true,privateWavPresent:true,...patch});
  assert.equal(call({sourceItemVerified:false}),null);
  assert.equal(call({privateWavPresent:false}),null);
  const result=call();
  assert.equal(result.ambience,base.ambience);
  assert.equal(result.items['source-katana-1'].pickup,base.items['source-katana-1'].pickup);
  assert.deepEqual(result.clips.audioNative_resources_assets_1443,
    {manifestKey:'audioNative_resources_assets_1443',owner:'resources.assets',pathId:1443,name:'AC_Katana_Hit'});
  assert.equal(result.items['source-katana-1'].slice.clipId,'audioNative_resources_assets_1443');
  assert.equal(result.items['source-katana-1'].slice.realtimeCooldown,0.1);
  assert.equal(result.items['source-katana-1'].slice.gain,0.5);
  assert.throws(()=>planMcdKatanaHitSceneBinding({sceneAudio:result,
    itemId:'source-katana-1',sourceItemVerified:true,privateWavPresent:true}),/overwritten/);
});

test('source Katana mixer Channel reference unblocks the Web PlayClip channel guard', () => {
  const planned=planMcdKatanaHitSceneBinding({
    sceneAudio:null,itemId:'verified-katana-1',
    sourceItemVerified:true,privateWavPresent:true,
  });
  const cue=planned.items['verified-katana-1'].slice;
  // A Web routing label for the proven serialized reference, NOT a
  // Unity mixer name or evidence that the clip has been decoded/heard.
  assert.equal(cue.mixerGroup,'source-mixer-ref:file3:path659');
  const playbackIntent=planMcdPlayClip({
    clipPresent:true,channelPresent:typeof cue.mixerGroup==='string' && cue.mixerGroup.length>0,
    cooldownActive:false,channelIsInterfaceSfx:false,bypassEffects:false,
    positionProvided:false,isLooped:false,playDelaySeconds:0,
    volume:cue.gain,pitch:cue.pitch,priority:cue.priority,
  });
  assert.equal(playbackIntent.status,MCD_PLAYCLIP_RESULT.REQUEST);
});
