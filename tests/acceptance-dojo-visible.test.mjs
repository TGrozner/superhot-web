import test from 'node:test';
import assert from 'node:assert/strict';
import {assessDojoVisibleIntegrations,DOJO_VISIBLE_STATUS} from '../scripts/acceptance-dojo-visible.mjs';

const source={scenePath:'Assets/Scenes/SHRL_Dojo2.unity',sceneBuildIndex:10,serializedOwner:'level10'};
const visual=()=>({
  worldDrawCalls:360,handsDrawCalls:3,handsTriangles:2048,
  handsSourcePoseSampled:true,katanaSocketApplied:true,
  warningReadiness:'source-catalog-present',warningEventStatus:'not-loaded',
  warningActiveEnvelopes:0,warningRenderedSpotlights:0,warningWebFalseLightDrawCalls:0,
});
const trace=(variants=[])=>({
  schemaVersion:2,captureKind:'SH10_DOJO_OWNER_BROWSER_V2',
  frames:[visual(),visual()].map((v,i)=>({
    frameId:i+1,activeScreen:'playing',
    nativeScene:{source},gameplay:{visual:{...v,...(variants[i]??{})}},
  })),
});

test('SH10 reads actual Web GPU frame receipts without calling them source-pixel/native parity',()=>{
  const result=assessDojoVisibleIntegrations(trace());
  assert.equal(result.status,DOJO_VISIBLE_STATUS.OBSERVED);
  assert.equal(result.observed.worldMeshDrawFrames,2);
  assert.equal(result.observed.handsDrawnFrames,2);
  assert.equal(result.observed.handsSourcePoseFrames,2);
  assert.equal(result.observed.katanaSocketFrames,2);
  assert.equal(result.nativeReferenceMatched,false);
  assert.equal(result.pixelComparisonPerformed,false);
  assert.equal(result.nativeParityVerdict,'UNKNOWN');
});

test('SH10 real-frame PBD failure status is a Web regression candidate, not native refutation',()=>{
  const t=trace();
  t.frames[0].gameplay.encounter={enemies:[{id:'native-encounter-0',alive:false,
    deathPhysics:'source-parameters-web-pbd-active'}]};
  t.frames[1].gameplay.encounter={enemies:[{id:'native-encounter-0',alive:false,
    deathPhysics:'web-pbd-step-rejected'}]};
  const result=assessDojoVisibleIntegrations(t);
  assert.equal(result.status,DOJO_VISIBLE_STATUS.RAGDOLL_GAP);
  assert.equal(result.observed.ragdollStatusFrames,2);
  assert.equal(result.observed.ragdollActiveFrames,1);
  assert.equal(result.observed.ragdollStepRejectedFrames,1);
  assert.equal(result.observed.firstRagdollStepRejectedFrameId,2);
  assert.equal(result.nativeParityVerdict,'UNKNOWN');
  assert.equal(result.pixelComparisonPerformed,false);
  assert.match(result.issues.join(' '),/host binding/);
});

test('SH10 reports dead-enemy PBD initialization failures as Web gaps, not success or native refutation',()=>{
  const t=trace();
  t.frames[0].gameplay.encounter={enemies:[{id:'native-encounter-0',alive:false,
    deathPhysics:'source-physics-construction-rejected'}]};
  t.frames[1].gameplay.encounter={enemies:[{id:'native-encounter-0',alive:false,
    deathPhysics:'source-physics-construction-rejected'}]};
  const report=assessDojoVisibleIntegrations(t);
  assert.equal(report.status,DOJO_VISIBLE_STATUS.RAGDOLL_INIT_GAP);
  assert.equal(report.observed.ragdollInitializationRejectedFrames,2);
  assert.equal(report.observed.firstRagdollInitializationRejectedFrameId,1);
  assert.equal(report.nativeReferenceMatched,false);
  assert.equal(report.nativeParityVerdict,'UNKNOWN');
  for (const reason of ['unqualified-source-rig-or-definition',
    'invalid-observed-web-velocity','skin-rig-replaced']) {
    t.frames[0].gameplay.encounter.enemies[0].deathPhysics=reason;
    t.frames[1].gameplay.encounter.enemies[0].deathPhysics=reason;
    assert.equal(assessDojoVisibleIntegrations(t).status,DOJO_VISIBLE_STATUS.RAGDOLL_INIT_GAP);
  }
});

test('SH10 older traces with no death status do not certify working ragdolls',()=>{
  const result=assessDojoVisibleIntegrations(trace());
  assert.equal(result.status,DOJO_VISIBLE_STATUS.OBSERVED);
  assert.equal(result.observed.ragdollStatusFrames,0);
  assert.match(result.issues.join(' '),/ragdoll runtime remains UNKNOWN/);
});

test('SH10 an ACTIVE source door-warning envelope without GPU spotlight is an explicit Web rendering gap',()=>{
  const result=assessDojoVisibleIntegrations(trace([
    {},{warningEventStatus:'triggered',warningActiveEnvelopes:1,warningRenderedSpotlights:0},
  ]));
  assert.equal(result.status,DOJO_VISIBLE_STATUS.GAP);
  assert.equal(result.observed.firstWarningGapFrameId,2);
  assert.equal(result.observed.warningActiveWithoutAnyLightDrawFrames,1);
  assert.equal(result.nativeParityVerdict,'UNKNOWN');
});

test('SH10 a Web red-wash draw counts even without source spotlights',()=>{
  const result=assessDojoVisibleIntegrations(trace([
    {},{warningActiveEnvelopes:1,warningRenderedSpotlights:0,warningWebFalseLightDrawCalls:12},
  ]));
  assert.equal(result.status,DOJO_VISIBLE_STATUS.OBSERVED);
  assert.equal(result.observed.warningFalseLightDrawFrames,1);
  assert.equal(result.observed.warningAnyLightDrawFrames,1);
  assert.equal(result.pixelComparisonPerformed,false);
});

test('SH10 missing newer light channel is unknown, not zero',()=>{
  const result=assessDojoVisibleIntegrations(trace([
    {},{warningActiveEnvelopes:1,warningRenderedSpotlights:0,warningWebFalseLightDrawCalls:null},
  ]));
  assert.equal(result.status,DOJO_VISIBLE_STATUS.OBSERVED);
  assert.equal(result.observed.warningUnknownLightTelemetryFrames,1);
  assert.match(result.issues.join(' '),/older capture lacks/);
});

test('SH10 source door-warning with nonzero rendered lights is OBSERVED, not native light parity',()=>{
  const result=assessDojoVisibleIntegrations(trace([
    {},{warningEventStatus:'triggered',warningActiveEnvelopes:1,warningRenderedSpotlights:1},
  ]));
  assert.equal(result.status,DOJO_VISIBLE_STATUS.OBSERVED);
  assert.equal(result.observed.warningSpotlightFrames,1);
  assert.equal(result.pixelComparisonPerformed,false);
});

test('SH10 no active sampled warning cannot be mislabeled as red-light success or refutation',()=>{
  const result=assessDojoVisibleIntegrations(trace());
  assert.equal(result.observed.warningActiveFrames,0);
  assert.match(result.issues.join(' '),/door warning not active/);
});

test('SH10 missing visual recording and zero native-world draws remain INCOMPLETE',()=>{
  const old=trace();for(const f of old.frames)delete f.gameplay.visual;
  assert.equal(assessDojoVisibleIntegrations(old).status,DOJO_VISIBLE_STATUS.INCOMPLETE);
  const empty=trace([{worldDrawCalls:0},{worldDrawCalls:0}]);
  assert.equal(assessDojoVisibleIntegrations(empty).status,DOJO_VISIBLE_STATUS.INCOMPLETE);
});

test('SH10 invalid source, frame order or telemetry cannot create a false GPU receipt',()=>{
  const x=trace();x.frames[1].nativeScene.source={...source,sceneBuildIndex:28};
  assert.equal(assessDojoVisibleIntegrations(x).status,DOJO_VISIBLE_STATUS.INVALID);
  const y=trace();y.frames[1].frameId=1;
  assert.equal(assessDojoVisibleIntegrations(y).status,DOJO_VISIBLE_STATUS.INVALID);
  const z=trace();z.frames[1].gameplay.visual.warningActiveEnvelopes=-2;
  assert.equal(assessDojoVisibleIntegrations(z).status,DOJO_VISIBLE_STATUS.INVALID);
  const leaking=trace();leaking.frames[1].gameplay.visual.warningEventStatus='private/source.asset:998';
  assert.equal(assessDojoVisibleIntegrations(leaking).status,DOJO_VISIBLE_STATUS.INVALID);
});

test('SH10 pistol-only runs do not prove or fail a katana-animation integration',()=>{
  const result=assessDojoVisibleIntegrations(trace([
    {handsDrawCalls:null,handsTriangles:null,handsSourcePoseSampled:null,katanaSocketApplied:null},
    {handsDrawCalls:null,handsTriangles:null,handsSourcePoseSampled:null,katanaSocketApplied:null},
  ]));
  assert.equal(result.status,DOJO_VISIBLE_STATUS.OBSERVED);
  assert.equal(result.observed.handsDrawnFrames,0);
  assert.match(result.issues.join(' '),/hands\/katana draw not witnessed/);
});
