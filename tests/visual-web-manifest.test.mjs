import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import { embedWebCaptureMetadata } from '../scripts/visual-web-capture.mjs';
import {
  matricesFromWebFrame, verifyOriginalWebPngDigest, preparePrivateWebManifest,
} from '../scripts/visual-web-manifest.mjs';
import { registration } from '../scripts/visual-compare.mjs';

// Entirely synthetic PNG and matrices; never place proprietary MCD assets in CI.
const PNG_MAGIC=Buffer.from([137,80,78,71,13,10,26,10]);
function crc32(bytes){
  let c=0xffffffff;
  for(const byte of bytes){c^=byte;for(let i=0;i<8;i++)c=(c>>>1)^(c&1?0xedb88320:0);}
  return(c^0xffffffff)>>>0;
}
function chunk(type,data){
  const prefix=Buffer.alloc(8);prefix.writeUInt32BE(data.length,0);prefix.write(type,4);
  const checksum=Buffer.alloc(4);checksum.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type),data])));
  return Buffer.concat([prefix,data,checksum]);
}
function png(colors=[0,16,32, 200,100,0, 4,55,252, 24,200,6]){
  const header=Buffer.alloc(13);header.writeUInt32BE(2,0);header.writeUInt32BE(2,4);
  header[8]=8;header[9]=2;
  const scan=Buffer.concat([Buffer.from([0,...colors.slice(0,6)]),Buffer.from([0,...colors.slice(6,12)])]);
  return Buffer.concat([PNG_MAGIC,chunk('IHDR',header),chunk('IDAT',deflateSync(scan)),chunk('IEND',Buffer.alloc(0))]);
}
const camera={x:2,y:1,z:5,yaw:0.4,pitch:-0.1};
const projection={verticalScale:1.732,near:0.03,far:1000,aspect:1,viewProjection:null};
function sourceWebProjection(cam=camera,proj=projection){
  const sy=Math.sin(cam.yaw),cy=Math.cos(cam.yaw),sp=Math.sin(cam.pitch),cp=Math.cos(cam.pitch);
  const r=[cy,0,sy],u=[-sy*sp,cp,cy*sp],f=[sy*cp,sp,-cy*cp];
  const p=[cam.x,cam.y,cam.z],dot=(a)=>a.reduce((total,n,i)=>total+n*p[i],0);
  const v=[r[0],u[0],f[0],0,r[1],u[1],f[1],0,r[2],u[2],f[2],0,-dot(r),-dot(u),-dot(f),1];
  const d=(proj.far+proj.near)/(proj.far-proj.near);
  const z=-2*proj.far*proj.near/(proj.far-proj.near);
  const m=[proj.verticalScale/proj.aspect,0,0,0,0,proj.verticalScale,0,0,0,0,d,1,0,0,z,0];
  const gpu=new Float32Array(16);
  for(let col=0;col<4;col++)for(let row=0;row<4;row++)for(let k=0;k<4;k++) {
    gpu[col*4+row]+=m[k*4+row]*v[col*4+k];
  }
  return Array.from(gpu);
}
const observed={...projection,viewProjection:sourceWebProjection()};
function metadata(base, overrides={}){
  const sha=createHash('sha256').update(base).digest('hex');
  return {
    schemaVersion:1,origin:'web',status:'WEB_ONLY_CAPTURE_NATIVE_PAIR_MISSING',
    captureMethod:'WEBGL2_READ_PIXELS_SYNCHRONOUS_COMPLETED_FRAME',
    pixelEncoding:'RGBA8_DEFAULT_FRAMEBUFFER_TO_2D_SRGB_PNG',
    mode:'NATIVE_ORIGINAL_GEOMETRY_WEB_GAMEPLAY',
    geometryProvenance:'RENDERED_FRAME_COUNTERS',
    activeScreen:'playing',frameId:20,worldClock:0.25,
    webCommit:'aabbccdd',rawCanvasSha256:sha,
    rawFrameRgbaSha256:'9'.repeat(64),
    nativeCameraMatched:false,nativeWorldPoseMatched:false,pixelComparisonPerformed:false,
    nativeScene:{source:{scenePath:'Assets/Scenes/SHRL_Dojo2.unity',
      sceneBuildIndex:10,serializedOwner:'level10'},meshes:20,instances:178,textures:17},
    generatedManifest:{nativeGeometry:true,drawCalls:178,triangles:49820},
    viewport:[2,2],dpr:1,scene:{id:'SHRL_Dojo2',buildIndex:10},
    camera:{status:'RENDERED_FRAME_POSE_AND_PROJECTION_ONLY',pose:camera},
    projection:observed,
    ...overrides,
  };
}
const options={pngFilename:'web.png',expectedScene:'SHRL_Dojo2',expectedBuildIndex:10,stateId:'PRIVATE_EXECUTED_NATIVE_STATE'};
function signed(colors, overrides){
  const base=png(colors);
  return Buffer.from(embedWebCaptureMetadata(base,metadata(base,overrides)));
}
test('reconstructed camera matrices reproduce same recorded GPU viewProjection',()=>{
  const derived=matricesFromWebFrame(camera,observed);
  assert.equal(derived.viewMatrix.length,16);
  assert.equal(derived.projectionMatrix.length,16);
  assert.ok(derived.maxViewProjectionCoefficientDelta<0.0001);
  assert.equal(derived.viewMatrix[15],1);
  assert.equal(derived.projectionMatrix[11],1);
  assert.equal(derived.projectionMatrix[15],0);
  assert.throws(()=>matricesFromWebFrame(camera,{...observed,viewProjection:[...observed.viewProjection.slice(0,15),999]}),/disagrees/);
});
test('real encoded Web-only PNG receipt becomes private camera-registered Web manifest, never native proof',()=>{
  const bytes=signed();
  const {manifest,receipt}=preparePrivateWebManifest(bytes,options);
  assert.deepEqual(manifest.scene,{id:'SHRL_Dojo2',buildIndex:10,stateId:options.stateId});
  assert.deepEqual(manifest.capture,{viewport:[2,2],colorSpace:'srgb',hud:'off',png:'web.png'});
  assert.equal(manifest.origin,'web');
  assert.deepEqual(manifest.objects,[]);
  assert.equal(receipt.sourceWorldRendered,true);
  assert.equal(receipt.pngDigestVerified,true);
  assert.equal(receipt.nativeFrameAuthenticated,false);
  assert.equal(receipt.pixelComparisonPerformed,false);
  assert.equal(manifest.evidence.stateIdOwnerSuppliedNotProven,true);
  assert.doesNotMatch(JSON.stringify(receipt),/PRIVATE_EXECUTED_NATIVE_STATE|Assets\/Scenes/);
  const futureNative={...manifest,origin:'synthetic',evidence:{captureId:'fixture',buildId:'fixture'}};
  assert.deepEqual(registration(futureNative,manifest).blockers,[]);
});
test('independently chosen source scene and build index must match saved Web screenshot',()=>{
  const bytes=signed();
  assert.throws(()=>preparePrivateWebManifest(bytes,{...options,expectedScene:'Containers'}),/differs/);
  assert.throws(()=>preparePrivateWebManifest(bytes,{...options,expectedBuildIndex:28}),/differs/);
  assert.throws(()=>preparePrivateWebManifest(bytes,{...options,expectedBuildIndex:-1}),/buildIndex/);
  assert.throws(()=>preparePrivateWebManifest(bytes,{...options,stateId:''}),/stateId/);
  assert.throws(()=>preparePrivateWebManifest(bytes,{...options,pngFilename:'../public.png'}),/beside/);
});
test('signed metadata cannot be transplanted onto another valid PNG without SHA rejection',()=>{
  const baseA=png(),baseB=png([5,6,7, 8,9,10, 11,12,13, 14,15,16]);
  const meta=metadata(baseA);
  const taggedOriginal=Buffer.from(embedWebCaptureMetadata(baseA,meta));
  assert.equal(verifyOriginalWebPngDigest(taggedOriginal,meta.rawCanvasSha256).originalPngSha256,
    meta.rawCanvasSha256);
  const transplanted=Buffer.from(embedWebCaptureMetadata(baseB,meta));
  assert.throws(()=>preparePrivateWebManifest(transplanted,options),/disagree/);
});
test('fallback/Dojo identity confusion and incomplete capture evidence fail closed',()=>{
  for(const mutation of [
    {mode:'CONTAINERS_COLLIDER_PROXY_NOT_MCD_RUNTIME'},
    {geometryProvenance:'BROWSER_TELEMETRY_NOT_SAME_FRAME_COUNTERS'},
    {captureMethod:'TO_BLOB_ASYNC'},
    {nativeCameraMatched:true},
    {generatedManifest:{nativeGeometry:true,drawCalls:0,triangles:49820}},
    {scene:{id:'Containers',buildIndex:28}},
    {nativeScene:{source:{scenePath:'Assets/Scenes/Fixture.unity',sceneBuildIndex:28}}},
    {webCommit:'UNRECORDED'},
    {activeScreen:'menu'},
    {camera:{status:'RENDERED_FRAME_POSE_ONLY',pose:camera}},
  ]){
    assert.throws(()=>preparePrivateWebManifest(signed(undefined,mutation),options));
  }
});
test('CLI writes local Web manifest only next to captured PNG and never overwrites evidence',()=>{
  const dir=mkdtempSync(join(tmpdir(),'sh15-web-manifest-'));
  const input=join(dir,'web.png'),out=join(dir,'web.json');
  writeFileSync(input,signed());
  const argv=['scripts/visual-web-manifest.mjs','--png',input,'--scene','SHRL_Dojo2',
    '--build-index','10','--state-id','PRIVATE_NATIVE_STATE','--out',out];
  const result=spawnSync(process.execPath,argv,{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.equal(JSON.parse(result.stdout).nativeFrameAuthenticated,false);
  assert.equal(JSON.parse(readFileSync(out,'utf8')).scene.stateId,'PRIVATE_NATIVE_STATE');
  if(process.platform!=='win32')assert.equal(statSync(out).mode&0o777,0o600);
  const again=spawnSync(process.execPath,argv,{encoding:'utf8'});
  assert.equal(again.status,2);
  assert.match(again.stderr,/EEXIST/);
});
