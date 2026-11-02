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

test('live Containers mapping requires two files, four indexed draws and three Mesh6 placements', () => {
  // Synthetic counter shape from merged Web #105; not an actual browser run.
  const live={
    mode:'CONTAINERS_COLLIDER_PROXY_NOT_MCD_RUNTIME',matchedNativeScene:false,
    activeScreen:'playing',browserMeasured:true,locallyLoadedSourceGroups:2,
    generatedManifest:{privateIndexedDraws:4,sourceQualifiedMesh6DrawPackets:3,
      hiddenByPrivateMesh:6,nativeMeshMatch:false,localFilePreviewOnly:true,
      sourceConvertedApproximationOnly:true},
    totalWebGLDrawCalls:20,p95FrameMs:15.9,samples:50,
  };
  const observed=localMeshDrawEvidence(live);
  assert.equal(observed.status,'WEB_APP_REPORTED_FOUR_INDEXED_DRAWS_NOT_MCD_PARITY');
  assert.equal(observed.nativeParityCertified,false);
  assert.deepEqual(observed.reasons,[]);
  const change=(part)=>localMeshDrawEvidence({...live,...part});
  const generated=(part)=>change({generatedManifest:{...live.generatedManifest,...part}});
  assert.ok(generated({privateIndexedDraws:2}).reasons.includes('FOUR_PRIVATE_INDEXED_DRAWS_UNVERIFIED'));
  assert.ok(generated({sourceQualifiedMesh6DrawPackets:2}).reasons.includes('THREE_MESH6_SOURCE_PLACEMENTS_UNVERIFIED'));
  assert.ok(generated({sourceConvertedApproximationOnly:false}).reasons.includes('SOURCE_CONVERTED_PREVIEW_NOT_QUALIFIED'));
  assert.ok(generated({hiddenByPrivateMesh:0}).reasons.includes('PROXY_SUBSTITUTION_UNVERIFIED'));
  assert.ok(change({locallyLoadedSourceGroups:1}).reasons.includes('TWO_LOCAL_SOURCE_GROUPS_UNVERIFIED'));
  assert.ok(change({matchedNativeScene:undefined}).reasons.includes('NON_NATIVE_PREVIEW_PROVENANCE_MISSING'));
  assert.ok(change({browserMeasured:false}).reasons.includes('LIVE_BROWSER_FRAME_UNVERIFIED'));
  assert.ok(change({p95FrameMs:null}).reasons.includes('FRAME_TIMING_UNVERIFIED'));
});
