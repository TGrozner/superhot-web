import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { assessDojoPixelPairs, decodeDojoPng, measureDojoRoi,
  DOJO_PIXEL_STATUS } from '../scripts/acceptance-dojo-pixels.mjs';

// Synthetic in-memory PNGs only: no screenshot, original-game asset or native ref.
const crcTable=Uint32Array.from({length:256},(_,n)=>{
  let c=n;for(let j=0;j<8;j++)c=(c&1)?0xedb88320^(c>>>1):(c>>>1);
  return c>>>0;
});
function chunk(name,data) {
  const label=Buffer.from(name,'ascii');
  const crcBytes=Buffer.concat([label,data]);
  let crc=0xffffffff;
  for(const b of crcBytes)crc=crcTable[(crc^b)&255]^(crc>>>8);
  const head=Buffer.alloc(4),tail=Buffer.alloc(4);
  head.writeUInt32BE(data.length);tail.writeUInt32BE((crc^0xffffffff)>>>0);
  return Buffer.concat([head,label,data,tail]);
}
function png(w,h,pixels,{alpha=false}={}) {
  const header=Buffer.alloc(13);
  header.writeUInt32BE(w,0);header.writeUInt32BE(h,4);
  header[8]=8;header[9]=alpha?6:2;
  const rows=[];
  for(let y=0;y<h;y++) {
    const row=Buffer.from([0,...pixels.slice(y*w*(alpha?4:3),(y+1)*w*(alpha?4:3))]);
    rows.push(row);
  }
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.concat(rows))),chunk('IEND',Buffer.alloc(0))]);
}
const image=(level)=>png(4,4,Array.from({length:4*4},()=>[level,level,level]).flat());
const manifest=()=>({schemaVersion:1,target:{game:'SUPERHOT: MIND CONTROL DELETE',
  scene:'SHRL_Dojo2',sceneBuildIndex:10,serializedOwner:'level10'},
  rois:[{id:'door',x:0,y:0,width:4,height:4}],
  pairs:[{id:'before',webFrameId:10,webPng:'w-off.png',nativePng:'n-off.png',
    webProvenance:'owner-local-browser',nativeProvenance:'owner-authorized-native',
    cameraMatch:'unknown',timeMatch:'unknown'},
    {id:'after',webFrameId:20,webPng:'w-on.png',nativePng:'n-on.png',
      webProvenance:'owner-local-browser',nativeProvenance:'owner-authorized-native',
      cameraMatch:'owner-declared-matched',timeMatch:'owner-declared-matched'}]});
const imgs=new Map([['w-off.png',image(20)],['n-off.png',image(20)],
  ['w-on.png',image(20)],['n-on.png',image(220)]]);
const load=(name)=>{if(!imgs.has(name))throw new Error('missing '+name);return imgs.get(name);};

test('SH10 actually decodes PNG bytes, computes color/lighting deltas and NEVER infers native 1:1',()=>{
  const a=decodeDojoPng(image(20));assert.equal(a.width,4);
  assert.equal(a.rgb.length,4*4*3);
  const result=assessDojoPixelPairs(manifest(),load);
  assert.equal(result.status,DOJO_PIXEL_STATUS.MEASURED);
  assert.equal(result.referenceAuthenticated,false);
  assert.equal(result.nativeParityVerdict,'UNKNOWN');
  assert.equal(result.cameraMatching,'UNKNOWN');
  assert.equal(result.pairs[0].regions.door.rgbMae,0);
  assert.equal(result.pairs[1].regions.door.rgbMae,200);
  assert.ok(result.temporal.door.differentialLuminanceError>=199);
});

test('SH10 missing reference is INCOMPLETE, not a passing pixel comparison',()=>{
  const report=assessDojoPixelPairs(manifest(),(name)=>{
    if(name==='n-on.png')throw new Error('private reference missing');
    return load(name);
  });
  assert.equal(report.status,DOJO_PIXEL_STATUS.INCOMPLETE);
  assert.equal(report.nativeParityVerdict,'UNKNOWN');
  assert.equal(report.pairs,undefined);
});

test('SH10 wrong build, fake provenance, stale/reversed frames and ROI overflow fail closed',()=>{
  for(const edit of [m=>m.target.sceneBuildIndex=28,
    m=>m.pairs[0].nativeProvenance='unlicensed',
    m=>m.pairs[1].webFrameId=9,
    m=>m.rois[0].width=9]) {
    const m=manifest();edit(m);
    assert.notEqual(assessDojoPixelPairs(m,load).status,DOJO_PIXEL_STATUS.MEASURED);
  }
});

test('SH10 PNG RGBA transparency, wrong color type and corrupt IDAT fail closed',()=>{
  const transparent=png(1,1,[20,20,20,0],{alpha:true});
  assert.throws(()=>decodeDojoPng(transparent),/non-opaque/);
  const badType=Buffer.from(image(20));badType[25]=3;
  assert.throws(()=>decodeDojoPng(badType),/PNG/);
  const corrupt=Buffer.from(image(20));corrupt[55]^=0xff;
  assert.throws(()=>decodeDojoPng(corrupt));
});

test('SH10 edge/camera proxies are nullable when flat, no fictitious silhouette or camera match',()=>{
  const a=decodeDojoPng(image(20));
  const report=measureDojoRoi(a,a,{x:0,y:0,width:4,height:4});
  assert.equal(report.edgeIoU,null);
  assert.equal(report.edgeCentroidDriftPx,null);
  assert.match(report.shapeSemantics,/NOT_INSTANCE_MASK/);
  const m=manifest();m.pairs[0].cameraMatch='owner-declared-matched';
  const measured=assessDojoPixelPairs(m,load);
  assert.equal(measured.cameraMatching,'OWNER_DECLARED_NOT_INDEPENDENTLY_VERIFIED');
  assert.equal(measured.cameraIndependentlyVerified,false);
});
