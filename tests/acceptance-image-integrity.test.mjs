/**
 * SH-10 — executable pixel-pair integrity contract.
 * PNGs and manifests below are SYNTHETIC unit fixtures, never MCD evidence.
 * In particular, a fictional operator-attested manifest is NOT a native run.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { compare } from '../scripts/acceptance-live-capture.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
function crc32(bytes){
  let crc=0xffffffff;
  for(const b of bytes){
    crc^=b;
    for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  return (crc^0xffffffff)>>>0;
}
function pngChunk(type,payload){
  const name=Buffer.from(type),size=Buffer.alloc(4),sum=Buffer.alloc(4);
  size.writeUInt32BE(payload.length,0);
  sum.writeUInt32BE(crc32(Buffer.concat([name,payload])),0);
  return Buffer.concat([size,name,payload,sum]);
}
function syntheticPng(shift){
  const width=16,height=16,ihdr=Buffer.alloc(13);
  ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=2;
  const data=[];
  for(let y=0;y<height;y++){
    const row=Buffer.alloc(1+width*3,255);row[0]=0;
    for(let x=0;x<width;x++){
      const v=(x>=3+shift && x<10+shift && y>=4 && y<12)?25:245;
      row[1+x*3]=v;row[2+x*3]=v;row[3+x*3]=v;
    }
    data.push(row);
  }
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    pngChunk('IHDR',ihdr),
    pngChunk('IDAT',deflateSync(Buffer.concat(data))),
    pngChunk('IEND',Buffer.alloc(0)),
  ]);
}
const limits={
  positionPx:0,shapeEdgeF1:1,chromaL1:0,luminanceDelta:0,temporalLuma:0,
  timingMs:0,cameraPosition:0,cameraAngle:0,cameraFov:0,
  projectionNear:0,projectionFar:0,projectionAspect:0,
};
function fixture(){
  const dir=mkdtempSync(join(tmpdir(),'sh10-paired-png-'));
  const webDir=join(dir,'web'),nativeDir=join(dir,'native');
  mkdirSync(webDir);mkdirSync(nativeDir);
  const pngs=[syntheticPng(0),syntheticPng(1)];
  const frames=pngs.map((bytes,i)=>({
    file:i?'after-keyw.png':'idle.png',tMs:i?365:10,
    phase:'displayed-frame-window',sha256:sha256(bytes),
  }));
  for(const folder of [webDir,nativeDir])
    frames.forEach((f,i)=>writeFileSync(join(folder,f.file),pngs[i]));
  const base={
    schemaVersion:1,scene:{key:'MCD-CONTAINERS-UNIT-FIXTURE',binding:'ACTIVE_SCENE_PROVEN'},
    camera:{source:'RUNTIME_OBSERVED',x:1,y:2,z:3,yaw:0,pitch:0,fovYDegrees:60},
    coordinateFrameId:'same-camera-coordinates',initialStateId:'matching-state',
    stimulusId:'IDLE_THEN_KEYW_300MS',timeScale:0.5,
    viewport:{width:16,height:16,dpr:1},
  };
  // SYNTHETIC runtime-labeled camera metadata solely for testing the
  // validator; real MCD frame-specific observations remain unavailable.
  const camera={x:1,y:2,z:3,yaw:0,pitch:0};
  const projection={verticalScale:Math.sqrt(3),near:.1,far:100,aspect:1};
  const web={...base,captureKind:'ACTUAL_BROWSER_CDP_PNG',
    captureSurface:'GAMEPLAY_ONLY_NO_UI',
    webRenderedFrameBracketsObserved:true,
    frames:frames.map((f,i)=>({...f,captureSurface:'GAMEPLAY_ONLY_NO_UI',
      canvasSurfaceBefore:'WEB_BROWSER_REPORTED_CANVAS_ONLY_NOT_NATIVE_PARITY',
      canvasSurfaceAfter:'WEB_BROWSER_REPORTED_CANVAS_ONLY_NOT_NATIVE_PARITY',renderFrameIdBefore:i?24:10,
      renderFrameIdAfter:i?25:11,renderedCameraBefore:{...camera},
      renderedCameraAfter:{...camera},renderedProjectionBefore:{...projection},
      renderedProjectionAfter:{...projection}}))};
  const native={...base,captureKind:'OPERATOR_ATTESTED_NATIVE_MCD_PNG',
    captureSurface:'OPERATOR_ATTESTED_GAMEPLAY_NO_HUD',
    game:'SUPERHOT: MIND CONTROL DELETE',build:'20299547',
    observationId:'SYNTHETIC_UNIT_FIXTURE_NOT_NATIVE',
    frames:frames.map(f=>({...f,captureSurface:'OPERATOR_ATTESTED_GAMEPLAY_NO_HUD',
      camera:{...camera,source:'RUNTIME_OBSERVED'},
      projection:{...projection,source:'RUNTIME_OBSERVED'}})),
    regions:[{id:'visible-object',rect:[0,0,1,1]}]};
  const webPath=join(webDir,'web-capture.json'),nativePath=join(nativeDir,'native-capture.json');
  writeFileSync(webPath,JSON.stringify(web));writeFileSync(nativePath,JSON.stringify(native));
  return {dir,webDir,nativeDir,web,native,webPath,nativePath};
}
const run=f=>compare(f.web,f.native,{webPath:f.webPath,nativePath:f.nativePath,thresholds:limits});

test('matched fixture pixels are scored but NEVER certified as 1:1/native evidence',()=>{
  const f=fixture();
  try{
    const result=run(f);
    assert.equal(result.status,'OPERATOR_THRESHOLDS_MET_NOT_CERTIFIED');
    assert.equal(result.nativeParityCertified,false);
    assert.equal(result.regions.length,1);
    assert.equal(result.regions[0].frames[0].shapeEdgeF1,1);
    assert.equal(result.regions[0].frames[0].positionPx,0);
    assert.equal(result.regions[0].temporalError,0);
  }finally{rmSync(f.dir,{recursive:true,force:true});}
});
test('a changed PNG does not pass on labels alone: SHA-256 mismatch is INCONNU',()=>{
  const f=fixture();
  try{
    writeFileSync(join(f.webDir,'after-keyw.png'),syntheticPng(3));
    const result=run(f);
    assert.equal(result.status,'INCONNU');
    assert.ok(result.reasons.includes('PNG_HASH_MISMATCH'));
    assert.equal(result.nativeParityCertified,false);
  }finally{rmSync(f.dir,{recursive:true,force:true});}
});
test('missing hashes, unsafe filenames and invalid regions reject before pixel comparison',()=>{
  const f=fixture();
  try{
    const missingHash={...f.native,frames:f.native.frames.map(x=>({...x}))};
    delete missingHash.frames[1].sha256;
    assert.ok(compare(f.web,missingHash,{webPath:f.webPath,nativePath:f.nativePath,
      thresholds:limits}).reasons.includes('FRAMES_UNPAIRED'));
    const unsafe={...f.native,frames:f.native.frames.map(x=>({...x}))};
    unsafe.frames[0].file='../other.png';
    assert.ok(compare(f.web,unsafe,{webPath:f.webPath,nativePath:f.nativePath,
      thresholds:limits}).reasons.includes('FRAMES_UNPAIRED'));
    const badROI={...f.native,regions:[{id:'visible-object',rect:[0,0,2,1]}]};
    assert.ok(compare(f.web,badROI,{webPath:f.webPath,nativePath:f.nativePath,
      thresholds:limits}).reasons.includes('ROI_UNKNOWN'));
  }finally{rmSync(f.dir,{recursive:true,force:true});}
});
test('unobserved PNG and unverified rendered-frame brackets remain INCONNU',()=>{
  const f=fixture();
  try{
    const badWeb={...f.web,webRenderedFrameBracketsObserved:false};
    assert.ok(compare(badWeb,f.native,{webPath:f.webPath,nativePath:f.nativePath,
      thresholds:limits}).reasons.includes('WEB_FRAME_BRACKETS_UNVERIFIED'));
    const missing={...f.native,frames:f.native.frames.map(x=>({...x}))};
    missing.frames[0].file='unavailable.png';
    assert.ok(compare(f.web,missing,{webPath:f.webPath,nativePath:f.nativePath,
      thresholds:limits}).reasons.includes('PNG_FILE_MISSING'));
  }finally{rmSync(f.dir,{recursive:true,force:true});}
});

test('second-frame native camera mismatch cannot become a renderer pixel delta',()=>{
  const f=fixture();
  try{
    const altered={...f.native,frames:f.native.frames.map(x=>({...x,camera:{...x.camera}}))};
    altered.frames[1].camera.x+=0.2;
    const result=compare(f.web,altered,{webPath:f.webPath,nativePath:f.nativePath,thresholds:limits});
    assert.equal(result.status,'NON_COMPARABLE_CAMERA_POSE');
    assert.equal(result.regions.length,0);
    assert.ok(result.frameAlignment.exceeded.includes('FRAME_1_CAMERAPOSITION_OUT_OF_TOLERANCE'));
  }finally{rmSync(f.dir,{recursive:true,force:true});}
});
test('native serialized camera projection is not a frame observation',()=>{
  const f=fixture();
  try{
    const altered={...f.native,frames:f.native.frames.map(x=>({...x,projection:{...x.projection}}))};
    altered.frames[0].projection.source='SERIALIZED_ONLY';
    const result=compare(f.web,altered,{webPath:f.webPath,nativePath:f.nativePath,thresholds:limits});
    assert.equal(result.status,'INCONNU');
    assert.ok(result.reasons.includes('NATIVE_FRAME_0_PROJECTION_UNOBSERVED'));
    assert.equal(result.regions.length,0);
  }finally{rmSync(f.dir,{recursive:true,force:true});}
});
