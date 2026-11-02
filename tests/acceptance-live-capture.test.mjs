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

test('browser local OBJ GPU evidence rejects partial or proxy-only previews', () => {
  const live={
    mode:'CONTAINERS_COLLIDER_PROXY_NOT_MCD_RUNTIME',
    activeScreen:'playing',browserMeasured:true,locallyLoadedSourceGroups:2,
    generatedManifest:{privateIndexedDraws:2,hiddenByPrivateMesh:3,nativeMeshMatch:false},
    totalWebGLDrawCalls:12,p95FrameMs:15.9,samples:50,
  };
  const observed=localMeshDrawEvidence(live);
  assert.equal(observed.status,'WEB_LOCAL_MESH_GPU_DRAW_OBSERVED_NOT_MCD_PARITY');
  assert.equal(observed.nativeParityCertified,false);
  assert.deepEqual(observed.reasons,[]);
  const noIndexed=localMeshDrawEvidence({...live,generatedManifest:{...live.generatedManifest,privateIndexedDraws:0}});
  assert.equal(noIndexed.status,'WEB_LOCAL_MESH_UNVERIFIED');
  assert.ok(noIndexed.reasons.includes('TWO_PRIVATE_INDEXED_DRAWS_UNVERIFIED'));
  assert.ok(localMeshDrawEvidence({...live,locallyLoadedSourceGroups:1})
    .reasons.includes('TWO_LOCAL_SOURCE_GROUPS_UNVERIFIED'));
  assert.ok(localMeshDrawEvidence({...live,generatedManifest:{...live.generatedManifest,hiddenByPrivateMesh:0}})
    .reasons.includes('PROXY_SUBSTITUTION_UNVERIFIED'));
  assert.ok(localMeshDrawEvidence({...live,browserMeasured:false})
    .reasons.includes('LIVE_BROWSER_FRAME_UNVERIFIED'));
  assert.ok(localMeshDrawEvidence({...live,p95FrameMs:null})
    .reasons.includes('FRAME_TIMING_UNVERIFIED'));
});
