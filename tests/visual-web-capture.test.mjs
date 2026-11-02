import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { webcrypto } from 'node:crypto';
import {
  embedWebCaptureMetadata, readWebCaptureMetadata,
  requireContainersWebEvidence, captureContainersWeb,
} from '../scripts/visual-web-capture.mjs';

// Synthetic, never native-game, test image and telemetry.
const PNG_MAGIC=Buffer.from([137,80,78,71,13,10,26,10]);
function crc32(bytes){
  let c=0xffffffff;
  for(const x of bytes){c^=x;for(let i=0;i<8;i++)c=(c>>>1)^(c&1?0xedb88320:0);}
  return(c^0xffffffff)>>>0;
}
function chunk(type,data){
  const start=Buffer.alloc(8);start.writeUInt32BE(data.length,0);start.write(type,4);
  const checksum=Buffer.alloc(4);checksum.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type),data])));
  return Buffer.concat([start,data,checksum]);
}
function png(width=2,height=2){
  const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);
  header[8]=8;header[9]=2;
  const uncompressed=Buffer.alloc(height*(1+width*3)); // opaque RGB black, filter 0
  return Buffer.concat([PNG_MAGIC,chunk('IHDR',header),chunk('IDAT',deflateSync(uncompressed)),chunk('IEND',Buffer.alloc(0))]);
}
const metrics={
  browserMeasured:true, mode:'CONTAINERS_COLLIDER_PROXY_NOT_MCD_RUNTIME', activeScreen:'menu',
  locallyLoadedSourceGroups:2,generatedManifest:{
    sourceQualifiedMesh6DrawPackets:3,privateIndexedDraws:4,sourceConvertedApproximationOnly:true,
  },totalWebGLDrawCalls:61,p95FrameMs:17.5,
};
const input={metrics,width:1920,height:1080,dpr:1,scene:'containers'};
const metadata={
  schemaVersion:1,origin:'web',status:'WEB_ONLY_CAPTURE_NATIVE_PAIR_MISSING',
  camera:{status:'ACTIVE_CAMERA_VIEW_PROJECTION_NOT_EXPOSED'},
};
test('real public preview counter contract uses 2 local files, 3 Mesh6 instances, 4 indexed draws',()=>{
  const x=requireContainersWebEvidence(input);
  assert.equal(x.privateIndexedDraws,4);
  assert.equal(x.totalWebGLDrawCalls,61);
  assert.equal(x.nativeCameraMatched,false);
  assert.deepEqual(x.viewport,[1920,1080]);
});
test('browser visual gate rejects wrong route, moving screen, mismatched viewport and false mesh metrics',()=>{
  assert.throws(()=>requireContainersWebEvidence({...input,scene:'synthetic'}),/containers/);
  assert.throws(()=>requireContainersWebEvidence({...input,dpr:2}),/DPR1/);
  assert.throws(()=>requireContainersWebEvidence({...input,width:1919}),/1920/);
  assert.throws(()=>requireContainersWebEvidence({...input,metrics:{...metrics,activeScreen:'playing'}}),/static menu/);
  assert.throws(()=>requireContainersWebEvidence({...input,metrics:{
    ...metrics,generatedManifest:{...metrics.generatedManifest,privateIndexedDraws:2},
  }}),/4 indexed/);
  assert.throws(()=>requireContainersWebEvidence({...input,metrics:{...metrics,browserMeasured:false}}),/Measured/);
});
test('Web-only metadata embeds in PNG ancillary tEXt without altering pixels or dimensions',()=>{
  const source=png(17,11);
  const marked=embedWebCaptureMetadata(source,metadata);
  assert.equal(marked.length>source.length,true);
  const parsed=readWebCaptureMetadata(marked);
  assert.deepEqual([parsed.width,parsed.height],[17,11]);
  assert.equal(parsed.metadata.camera.status,'ACTIVE_CAMERA_VIEW_PROJECTION_NOT_EXPOSED');
  assert.deepEqual(Array.from(marked.subarray(0,33)),Array.from(source.subarray(0,33)));
  assert.throws(()=>embedWebCaptureMetadata(marked,metadata),/already/);
  assert.throws(()=>readWebCaptureMetadata(source),/Exactly one/);
});
test('corrupted PNG bytes or false native parity metadata are refused',()=>{
  const base=png();const marked=embedWebCaptureMetadata(base,metadata);
  const bad=Buffer.from(marked);bad[45]^=1;
  assert.throws(()=>readWebCaptureMetadata(bad),/CRC mismatch/);
  assert.throws(()=>embedWebCaptureMetadata(base,{...metadata,status:'PARITY_VERIFIED'}),/Invalid SH-15/);
});
function fakeBrowser({blank=false}={}){
  const original=png(1920,1080);
  let downloads=0;
  const canvas={width:1920,height:1080,toBlob(callback,type){assert.equal(type,'image/png');callback(new Blob([original],{type}));}};
  const doc={
    body:{append(a){assert.equal(a.href,'blob:local');}},
    getElementById(id){return id==='scene'?canvas:null;},
    createElement(name){
      if(name==='a')return{click(){downloads++;},remove(){}};
      if(name==='canvas')return{getContext(type){
        assert.equal(type,'2d');
        const samples=new Uint8ClampedArray(64*36*4);
        for(let i=0;i<samples.length;i+=4){
          const color=blank?0:(i/4)%16;
          samples[i]=color;samples[i+1]=color;samples[i+2]=color;samples[i+3]=255;
        }
        return{drawImage(){},getImageData(){return{data:samples};}};
      }};
      throw new Error('Unexpected element '+name);
    },
  };
  const win={
    location:{search:'?scene=containers'},devicePixelRatio:1,
    __superhotSceneMetrics:metrics,crypto:webcrypto,
    requestAnimationFrame(callback){callback();},
    createImageBitmap:async()=>({close(){}}),
    URL:{createObjectURL(){return'blob:local';},revokeObjectURL(){}},
    setTimeout(callback){callback();},
  };
  return{windowRef:win,documentRef:doc,getDownloads:()=>downloads};
}
test('mocked canvas capture exports one local PNG, sha256 and explicit non-native status',async()=>{
  const mock=fakeBrowser();
  const report=await captureContainersWeb({...mock,webCommit:'abcdef0'});
  assert.equal(report.status,'WEB_ONLY_CAPTURE_NATIVE_PAIR_MISSING');
  assert.equal(report.downloadedLocally,true);
  assert.equal(report.privateIndexedDraws,4);
  assert.equal(report.cameraStatus,'ACTIVE_CAMERA_VIEW_PROJECTION_NOT_EXPOSED');
  assert.match(report.rawCanvasSha256,/^[0-9a-f]{64}$/);
  assert.equal(mock.getDownloads(),1);
});
test('blank WebGL buffer blocks screenshot even when counters are green',async()=>{
  const mock=fakeBrowser({blank:true});
  await assert.rejects(captureContainersWeb({...mock}),/blank\/uniform/);
  assert.equal(mock.getDownloads(),0);
});
