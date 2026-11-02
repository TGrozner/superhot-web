import test from 'node:test';
import assert from 'node:assert/strict';
import { metrics, compare, decodePng, localMeshDrawEvidence } from '../scripts/acceptance-live-capture.mjs';

// Synthetic-only acceptance invariants: never assert native MCD fidelity.
test('visual metrics distinguish shifted outlines and luminance', () => {
  const image=(shift,red)=>({width:16,height:16,rgba:Uint8Array.from({length:16*16*4},(_,i)=>{const x=Math.floor(i/4)%16,y=Math.floor(i/64),ch=i%4;return ch===3?255:(x>=2+shift&&x<7+shift&&y>=2&&y<8?(ch===0?red:10):220);})});
  const a=image(0,240),b=image(4,240),c=image(0,60);
  assert.equal(metrics(a,a).positionPx,0);
  assert.ok(metrics(a,b).positionPx>3);
  assert.ok(metrics(a,b).shapeEdgeF1<1);
  assert.ok(metrics(a,c).luminanceDelta>0);
});
test('unpaired Containers preview returns INCONNU, never native certification', () => {
  const report=compare({schemaVersion:1,captureKind:'ACTUAL_BROWSER_CDP_PNG',scene:{binding:'WEB_PROXY_OR_UNKNOWN',key:null}},{schemaVersion:1});
  assert.equal(report.status,'INCONNU');
  assert.equal(report.nativeParityCertified,false);
  assert.ok(report.reasons.includes('ACTIVE_SCENE_UNPAIRED'));
});
test('strict PNG decoder rejects invalid sources',()=>{
  assert.throws(()=>decodePng(Buffer.from('synthetic invalid fixture')),/PNG signature/);
});

test('live playable Containers requires six cargo indexed draws: three Mesh6 and three DISTINCT Mesh7 ranges', () => {
  // Mocks exactly the Web counter shape of merged SH-05 #128, not a browser run.
  const live={
    mode:'CONTAINERS_SOURCE_GEOMETRY_WEB_GAMEPLAY_FALLBACK_NOT_MCD',matchedNativeScene:false,
    activeScreen:'playing',browserMeasured:true,locallyLoadedSourceGroups:2,
    generatedManifest:{privateIndexedDraws:6,sourceQualifiedMesh6DrawPackets:3,
      verifiedLocalMesh7RangeDraws:3,convertedTrianglesDrawn:9276,
      hiddenByPrivateMesh:0,nativeMeshMatch:false,localFilePreviewOnly:true,
      sourceConvertedApproximationOnly:true,collisionConnected:true,
      sourceDerivedColliderCount:5,nativeCombatParityVerified:false,
      shootableWebFallbackEnemy:true,nativeEnemySpawnVerified:false},
    totalWebGLDrawCalls:9,p95FrameMs:15.9,samples:50,
    localNativeEnemy:{owner:'sharedassets0.assets',variant:'merged',meshPathId:284,triangles:2254},
    nativeEnemyIndexedDrawCalls:1,nativeEnemySpawnVerified:false,skinAnimationVerified:false,
  };
  const cargo=localMeshDrawEvidence(live);
  assert.equal(cargo.status,'WEB_APP_REPORTED_SIX_CARGO_DRAWS_NOT_MCD_PARITY');
  assert.equal(cargo.nativeParityCertified,false);
  assert.equal(cargo.independentGpuReadback,false);
  assert.deepEqual(cargo.reasons,[]);
  const changed=(part)=>localMeshDrawEvidence({...live,...part});
  const changedManifest=(part)=>changed({generatedManifest:{...live.generatedManifest,...part}});
  assert.ok(changedManifest({privateIndexedDraws:4}).reasons.includes('SIX_CARGO_INDEXED_DRAWS_UNVERIFIED'));
  assert.ok(changedManifest({verifiedLocalMesh7RangeDraws:1}).reasons.includes('THREE_DISTINCT_MESH7_RANGES_UNVERIFIED'));
  assert.ok(changedManifest({convertedTrianglesDrawn:6184}).reasons.includes('CARGO_SOURCE_TRIANGLE_ACCOUNTING_UNVERIFIED'));
  assert.ok(changedManifest({collisionConnected:false}).reasons.includes('FIVE_WEB_FALLBACK_COLLIDERS_UNVERIFIED'));
  assert.ok(changedManifest({sourceConvertedApproximationOnly:false}).reasons.includes('WEB_FALLBACK_PROVENANCE_UNVERIFIED'));
  assert.ok(changedManifest({hiddenByPrivateMesh:-1}).reasons.includes('PROXY_COUNTER_UNVERIFIED'));
  // Zero culling-derived proxy omissions in the current camera is not a failure.
  assert.deepEqual(changedManifest({hiddenByPrivateMesh:0}).reasons,[]);
  assert.ok(changed({locallyLoadedSourceGroups:1}).reasons.includes('TWO_LOCAL_CARGO_SOURCE_GROUPS_UNVERIFIED'));
  assert.ok(changed({matchedNativeScene:undefined}).reasons.includes('NATIVE_SCENE_NOT_PROVEN_FLAG_MISSING'));
  assert.ok(changed({browserMeasured:false}).reasons.includes('LIVE_BROWSER_FRAME_UNVERIFIED'));
  assert.ok(changed({p95FrameMs:null}).reasons.includes('BROWSER_FRAME_TIMING_UNVERIFIED'));
});

test('static source-qualified EnemyMerged/Headless requires a real indexed Web draw, not native animation', () => {
  const sample={
    mode:'CONTAINERS_SOURCE_GEOMETRY_WEB_GAMEPLAY_FALLBACK_NOT_MCD',
    matchedNativeScene:false,activeScreen:'playing',browserMeasured:true,
    locallyLoadedSourceGroups:2,totalWebGLDrawCalls:7,p95FrameMs:14,samples:30,
    generatedManifest:{privateIndexedDraws:6,sourceQualifiedMesh6DrawPackets:3,
      verifiedLocalMesh7RangeDraws:3,convertedTrianglesDrawn:9276,
      hiddenByPrivateMesh:0,sourceConvertedApproximationOnly:true,
      localFilePreviewOnly:true,nativeMeshMatch:false,nativeCombatParityVerified:false,
      collisionConnected:true,sourceDerivedColliderCount:5,
      shootableWebFallbackEnemy:true,nativeEnemySpawnVerified:false},
    localNativeEnemy:{owner:'sharedassets0.assets',variant:'merged',meshPathId:284,triangles:2254},
    nativeEnemyIndexedDrawCalls:1,nativeEnemySpawnVerified:false,skinAnimationVerified:false,
  };
  const result=localMeshDrawEvidence(sample,{requireEnemy:true});
  assert.equal(result.status,'WEB_APP_REPORTED_STATIC_ENEMY_AND_SIX_CARGO_DRAWS_NOT_MCD_PARITY');
  assert.equal(result.nativeParityCertified,false);
  assert.equal(result.independentGpuReadback,false);
  assert.deepEqual(result.reasons,[]);
  const noEnemy=localMeshDrawEvidence({...sample,nativeEnemyIndexedDrawCalls:0},{requireEnemy:true});
  assert.ok(noEnemy.reasons.includes('SOURCE_QUALIFIED_ENEMY_INDEXED_DRAW_UNVERIFIED'));
  const fakeOwner=localMeshDrawEvidence({...sample,localNativeEnemy:{...sample.localNativeEnemy,owner:'resources.assets'}},{requireEnemy:true});
  assert.ok(fakeOwner.reasons.includes('SOURCE_QUALIFIED_ENEMY_INDEXED_DRAW_UNVERIFIED'));
  const headless=localMeshDrawEvidence({...sample,localNativeEnemy:{...sample.localNativeEnemy,variant:'headless',meshPathId:285,triangles:2132}},{requireEnemy:true});
  assert.deepEqual(headless.reasons,[]);
  const falseAnimation=localMeshDrawEvidence({...sample,skinAnimationVerified:true},{requireEnemy:true});
  assert.ok(falseAnimation.reasons.includes('STATIC_ENEMY_NON_NATIVE_PROVENANCE_UNVERIFIED'));
});
