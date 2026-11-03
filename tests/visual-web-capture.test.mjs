import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { webcrypto } from 'node:crypto';
import {
  embedWebCaptureMetadata, readWebCaptureMetadata,
  requireContainersWebEvidence, readRenderedWebglRgba, captureContainersWeb,
  captureDojoCompositionAtFrame, requireDojoStartedVisualFrame,
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
const nativeMetrics={
  browserMeasured:true,mode:'NATIVE_ORIGINAL_GEOMETRY_WEB_GAMEPLAY',
  nativeScene:{source:{sceneBuildIndex:10,scenePath:'Assets/Scenes/Fixture.unity',serializedOwner:'level10'},
    meshes:68,instances:360,textures:17},
  generatedManifest:{drawCalls:360,triangles:185037,nativeGeometry:true,nativeMaterialParity:false},
  totalWebGLDrawCalls:371,p95FrameMs:17.5,
};
const expectedCamera={x:1,y:2,z:3,yaw:0.5,pitch:-0.25};
const projection={
  verticalScale:1.58,near:0.045,far:120,aspect:16/9,
  viewProjection:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],
};
const frame={frameId:1,activeScreen:'menu',camera:expectedCamera,projection,worldClock:1.25};
const input={metrics,frame,expectedCamera,width:1920,height:1080,dpr:1};
const metadata={
  schemaVersion:1,origin:'web',status:'WEB_ONLY_CAPTURE_NATIVE_PAIR_MISSING',
  camera:{status:'RENDERED_FRAME_POSE_ONLY',pose:expectedCamera},
};
test('real public preview counter contract uses 2 local files, 3 Mesh6 instances, 4 indexed draws',()=>{
  const x=requireContainersWebEvidence(input);
  assert.equal(x.privateIndexedDraws,4);
  assert.equal(x.totalWebGLDrawCalls,61);
  assert.equal(x.nativeCameraMatched,false);
  assert.deepEqual(x.viewport,[1920,1080]);
});
test('default-root native world accepts real draw counters without manual File groups',()=>{
  const report=requireContainersWebEvidence({...input,metrics:nativeMetrics});
  assert.deepEqual(report.nativeScene,nativeMetrics.nativeScene);
  assert.deepEqual(report.generatedManifest,nativeMetrics.generatedManifest);
  assert.equal(report.totalWebGLDrawCalls,371);
  assert.equal(report.privateIndexedDraws,undefined);
  assert.deepEqual(report.projection,projection);
  assert.notEqual(report.projection.viewProjection,projection.viewProjection);
  assert.equal(report.worldClock,1.25);
  assert.equal(report.nativeWorldPoseMatched,false);
  assert.equal(report.geometryProvenance,'BROWSER_TELEMETRY_NOT_SAME_FRAME_COUNTERS');
});
test('native root rejects missing or contradictory draw evidence, not arbitrary fixed counts',()=>{
  for(const changes of [
    {nativeScene:null},{nativeScene:{meshes:0,instances:360,textures:17}},
    {generatedManifest:{...nativeMetrics.generatedManifest,drawCalls:0}},
    {generatedManifest:{...nativeMetrics.generatedManifest,triangles:NaN}},
    {generatedManifest:{...nativeMetrics.generatedManifest,nativeGeometry:false}},
    {totalWebGLDrawCalls:359},
  ]) assert.throws(()=>requireContainersWebEvidence({...input,metrics:{...nativeMetrics,...changes}}),/native world/);
  const other={...nativeMetrics,nativeScene:{...nativeMetrics.nativeScene,meshes:3,instances:8,textures:2},
    generatedManifest:{...nativeMetrics.generatedManifest,drawCalls:9,triangles:120},totalWebGLDrawCalls:10};
  assert.equal(requireContainersWebEvidence({...input,metrics:other}).generatedManifest.drawCalls,9);
});
test('same-frame native counters take precedence over telemetry',()=>{
  const report=requireContainersWebEvidence({...input,metrics:nativeMetrics,frame:{
    ...frame,generatedManifest:{...nativeMetrics.generatedManifest,drawCalls:350},
    totalWebGLDrawCalls:355,nativeScene:nativeMetrics.nativeScene,
  }});
  assert.equal(report.generatedManifest.drawCalls,350);
  assert.equal(report.totalWebGLDrawCalls,355);
  assert.equal(report.geometryProvenance,'RENDERED_FRAME_COUNTERS');
});
test('projection and world-clock evidence must be finite and match canvas aspect',()=>{
  for(const change of [{projection:null},{projection:{...projection,aspect:1}},
    {projection:{...projection,viewProjection:[1]}},{worldClock:NaN}]){
    assert.throws(()=>requireContainersWebEvidence({...input,frame:{...frame,...change}}),
      /projection|worldClock/);
  }
});
test('native sampled clip provenance belongs to capture frame, not later telemetry',()=>{
  const nativeEnemy={clip:'idle',sampledTime:1.25,skinned:true,nativeClipSampled:true,
    runtimeEnemyInstanceVerified:false,sourcePath:'private-source'};
  const report=requireContainersWebEvidence({...input,metrics:{...nativeMetrics,nativeEnemy:{clip:'walk'}},
    frame:{...frame,nativeEnemy}});
  nativeEnemy.sampledTime=9;
  assert.deepEqual(report.nativeEnemyPose,{clip:'idle',sampledTime:1.25,skinned:true,
    nativeClipSampled:true,runtimeEnemyInstanceVerified:false});
  assert.equal(report.nativeWorldPoseMatched,false);
  assert.equal(requireContainersWebEvidence({...input,metrics:{...nativeMetrics,nativeEnemy}}).nativeEnemyPose,null);
});
test('browser visual gate rejects wrong rendered phase, mismatched viewport and false mesh metrics',()=>{
  assert.throws(()=>requireContainersWebEvidence({...input,dpr:2}),/DPR1/);
  assert.throws(()=>requireContainersWebEvidence({...input,width:1919}),/1920/);
  assert.throws(()=>requireContainersWebEvidence({...input,frame:{...frame,activeScreen:'playing'}}),/static menu/);
  assert.throws(()=>requireContainersWebEvidence({...input,metrics:{
    ...metrics,generatedManifest:{...metrics.generatedManifest,privateIndexedDraws:2},
  }}),/4 indexed/);
  assert.throws(()=>requireContainersWebEvidence({...input,metrics:{...metrics,browserMeasured:false}}),/Measured/);
});
test('menu telemetry alone cannot qualify an alternate camera or missing rendered evidence',()=>{
  const staleMetrics={...metrics,camera:expectedCamera};
  assert.throws(()=>requireContainersWebEvidence({...input,metrics:staleMetrics,frame:null}),/Same-rendered-frame/);
  assert.throws(()=>requireContainersWebEvidence({...input,expectedCamera:undefined}),/explicit finite camera pose/);
  for(const key of ['x','y','z','yaw','pitch']){
    assert.throws(()=>requireContainersWebEvidence({...input,metrics:staleMetrics,frame:{
      ...frame,camera:{...expectedCamera,[key]:expectedCamera[key]+0.000001},
    }}),/differs from expected/);
    assert.throws(()=>requireContainersWebEvidence({...input,expectedCamera:{
      ...expectedCamera,[key]:NaN,
    }}),/finite camera pose/);
  }
});
test('rendered pose and phase are detached, whitelisted evidence, not stale metrics',()=>{
  const current={...frame,camera:{...expectedCamera,sourcePath:'private-source'}};
  const report=requireContainersWebEvidence({...input,frame:current,metrics:{
    ...metrics,activeScreen:'playing',camera:{...expectedCamera,x:99},
  }});
  current.camera.x=99;
  assert.equal(report.activeScreen,'menu');
  assert.equal(report.frameId,1);
  assert.deepEqual(report.camera.pose,expectedCamera);
  assert.equal(report.camera.viewMatrix,null);
  assert.equal(report.camera.projectionMatrix,null);
});
test('Web-only metadata embeds in PNG ancillary tEXt without altering pixels or dimensions',()=>{
  const source=png(17,11);
  const marked=embedWebCaptureMetadata(source,metadata);
  assert.equal(marked.length>source.length,true);
  const parsed=readWebCaptureMetadata(marked);
  assert.deepEqual([parsed.width,parsed.height],[17,11]);
  assert.deepEqual(parsed.metadata.camera,metadata.camera);
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
function fakeBrowser({
  blank=false,beforeFrame,beforeEncodeComplete,sceneMetrics=nativeMetrics,
  gpuError=0,bufferMismatch=false,boundFramebuffer=false,initialFrame=frame,
  sceneControlsHidden=true,
}={}){
  const original=png(1920,1080);
  const requested=[];
  let encodedBlob,encodedFrames=0,pixelReads=0;
  let currentFrame={...initialFrame,camera:{...expectedCamera}};
  const setFrame=value=>{currentFrame=value;};
  const gl={
    FRAMEBUFFER_BINDING:0x8ca6,RGBA:0x1908,UNSIGNED_BYTE:0x1401,NO_ERROR:0,
    drawingBufferWidth:bufferMismatch?1919:1920,drawingBufferHeight:1080,
    getParameter(key){
      assert.equal(key,this.FRAMEBUFFER_BINDING);
      return boundFramebuffer?{}:null;
    },
    readPixels(x,y,width,height,format,type,dst){
      assert.deepEqual([x,y,width,height,format,type],[0,0,1920,1080,this.RGBA,this.UNSIGNED_BYTE]);
      pixelReads++;
      for(let yy=0;yy<height;yy++)for(let xx=0;xx<width;xx++){
        const at=4*(yy*width+xx);
        dst[at]=blank?0:xx%256;
        dst[at+1]=blank?0:yy%256;
        dst[at+2]=blank?0:(xx+yy)%256;
        dst[at+3]=255;
      }
    },
    getError(){return gpuError;},
  };
  const canvas={width:1920,height:1080,getContext(type){
    assert.equal(type,'webgl2');return gl;
  }};
  const sceneControls={hidden:sceneControlsHidden};
  const doc={
    body:{append(){}},
    getElementById(id){return id==='scene'?canvas:id==='scene-controls'?sceneControls:null;},
    createElement(name){
      if(name==='a')return{click(){requested.push({filename:this.download,blob:encodedBlob});},remove(){}};
      if(name==='canvas')return{
        width:0,height:0,
        getContext(type){assert.equal(type,'2d');return{
          createImageData(w,h){return{data:new Uint8ClampedArray(w*h*4)};},
          putImageData(){},
        };},
        toBlob(callback,type){
          assert.equal(type,'image/png');encodedFrames++;
          beforeEncodeComplete?.(setFrame);
          callback(new Blob([original],{type}));
        },
      };
      throw new Error('Unexpected element '+name);
    },
  };
  const win={
    location:{search:''},devicePixelRatio:1,
    __superhotSceneMetrics:{...sceneMetrics,camera:expectedCamera},crypto:webcrypto,
    __superhotGetRenderedFrameSnapshot:()=>currentFrame,
    requestAnimationFrame(callback){
      if(beforeFrame)beforeFrame(setFrame);
      else setFrame({...currentFrame,frameId:currentFrame.frameId+1});
      callback();
    },
    URL:{createObjectURL(blob){encodedBlob=blob;return'blob:local';},revokeObjectURL(){}},
    setTimeout(callback){callback();},
  };
  return{windowRef:win,documentRef:doc,expectedCamera,requested,sceneControls,
    getEncodedFrames:()=>encodedFrames,getPixelReads:()=>pixelReads};
}
test('synchronous WebGL2 readPixels vertically flips rows and rejects unreadable buffers',()=>{
  const gl={
    drawingBufferWidth:2,drawingBufferHeight:2,
    FRAMEBUFFER_BINDING:0x8ca6,RGBA:0x1908,UNSIGNED_BYTE:0x1401,NO_ERROR:0,
    getParameter(){return null;},getError(){return 0;},
    readPixels(x,y,w,h,format,type,dst){
      assert.deepEqual([w,h,format,type],[2,2,this.RGBA,this.UNSIGNED_BYTE]);
      dst.set([10,0,0,255,20,0,0,255,30,0,0,255,40,0,0,255]);
    },
  };
  const canvas={width:2,height:2,getContext:()=>gl};
  const rgba=readRenderedWebglRgba(canvas);
  assert.equal(rgba.length,16);
  assert.deepEqual(Array.from(rgba.filter((_,i)=>i%4===0)),[30,40,10,20]);
  gl.drawingBufferWidth=1;
  assert.throws(()=>readRenderedWebglRgba(canvas),/dimensions differ/);
  gl.drawingBufferWidth=2;gl.getParameter=()=>({});
  assert.throws(()=>readRenderedWebglRgba(canvas),/default WebGL framebuffer/);
});
test('capture records the rendered pose in PNG and reports only an intended download request',async()=>{
  const mock=fakeBrowser({
    beforeFrame:set=>set({...frame,frameId:2,camera:{...expectedCamera,sourcePath:'private-source'}}),
    beforeEncodeComplete:set=>set({...frame,frameId:3,worldClock:2.5}),
  });
  const report=await captureContainersWeb({...mock,webCommit:'abcdef0'});
  assert.equal(report.status,'WEB_ONLY_CAPTURE_NATIVE_PAIR_MISSING');
  assert.equal(report.downloadRequested,true);
  assert.equal('downloadedLocally' in report,false);
  assert.equal(report.generatedManifest.drawCalls,360);
  assert.equal(report.frameId,2);
  assert.equal(report.worldClock,1.25);
  assert.equal(report.cameraStatus,'RENDERED_FRAME_POSE_AND_PROJECTION_ONLY');
  assert.match(report.rawCanvasSha256,/^[0-9a-f]{64}$/);
  assert.match(report.rawFrameRgbaSha256,/^[0-9a-f]{64}$/);
  assert.equal(report.captureMethod,'WEBGL2_READ_PIXELS_SYNCHRONOUS_COMPLETED_FRAME');
  assert.equal(mock.getPixelReads(),1);
  assert.equal(mock.requested.length,1);
  assert.equal(mock.requested[0].filename,report.intendedFilename);
  const bytes=new Uint8Array(await mock.requested[0].blob.arrayBuffer());
  const embeddedMetadata=readWebCaptureMetadata(bytes).metadata;
  assert.equal(embeddedMetadata.frameId,2);
  assert.deepEqual(embeddedMetadata.camera.pose,expectedCamera);
  assert.equal(embeddedMetadata.activeScreen,'menu');
  assert.deepEqual(embeddedMetadata.projection,projection);
  assert.deepEqual(embeddedMetadata.nativeScene,nativeMetrics.nativeScene);
  assert.equal(embeddedMetadata.worldClock,1.25);
  assert.equal(embeddedMetadata.captureMethod,report.captureMethod);
  assert.equal(embeddedMetadata.rawFrameRgbaSha256,report.rawFrameRgbaSha256);
  assert.equal(embeddedMetadata.nativeWorldPoseMatched,false);
  assert.equal(embeddedMetadata.worldPoseProvenance,'WEB_RENDERED_WORLD_CLOCK_NOT_NATIVE_FRAME_MATCH');
  assert.equal(JSON.stringify(embeddedMetadata).includes('private-source'),false);
});
test('download disabled reports no request or saved-file claim',async()=>{
  const mock=fakeBrowser();
  const report=await captureContainersWeb({...mock,download:false});
  assert.equal(report.downloadRequested,false);
  assert.equal('downloadedLocally' in report,false);
  assert.equal(mock.requested.length,0);
});
test('capture refuses one-second metrics without a synchronous rendered snapshot API',async()=>{
  const mock=fakeBrowser();
  delete mock.windowRef.__superhotGetRenderedFrameSnapshot;
  await assert.rejects(captureContainersWeb({...mock}),/Same-rendered-frame/);
  assert.equal(mock.getEncodedFrames(),0);
  assert.equal(mock.requested.length,0);
});
test('menu camera changing before capture is refused despite unchanged green metrics',async()=>{
  const mock=fakeBrowser({beforeFrame:set=>set({
    ...frame,frameId:2,camera:{...expectedCamera,yaw:1},
  })});
  await assert.rejects(captureContainersWeb({...mock}),/differs from expected/);
  assert.equal(mock.getEncodedFrames(),0);
  assert.equal(mock.requested.length,0);
});
test('GPU readback freezes the pixels before later asynchronous camera changes',async()=>{
  for(const changed of [
    {...frame,frameId:3,camera:{...expectedCamera,x:99}},
    {...frame,frameId:3,activeScreen:'playing'},
  ]){
    const mock=fakeBrowser({beforeEncodeComplete:set=>set(changed)});
    const receipt=await captureContainersWeb({...mock});
    assert.equal(receipt.frameId,2);
    assert.equal(mock.getPixelReads(),1);
    assert.equal(mock.getEncodedFrames(),1);
    assert.equal(mock.requested.length,1);
  }
});
test('capture refuses stale frames, WebGL errors, and offscreen framebuffer bindings',async()=>{
  const stale=fakeBrowser({beforeFrame:set=>set({...frame,frameId:1})});
  await assert.rejects(captureContainersWeb({...stale}),/No new completed Web render/);
  assert.equal(stale.getPixelReads(),0);
  for(const opts of [{gpuError:1282},{bufferMismatch:true},{boundFramebuffer:true}]){
    const mock=fakeBrowser(opts);
    await assert.rejects(captureContainersWeb({...mock}),/readPixels failed|dimensions differ|default WebGL framebuffer/);
    assert.equal(mock.requested.length,0);
  }
});
test('blank WebGL buffer blocks screenshot even when counters are green',async()=>{
  const mock=fakeBrowser({blank:true});
  await assert.rejects(captureContainersWeb({...mock}),/blank\/uniform/);
  assert.equal(mock.requested.length,0);
});

const dojoSceneSource = {
  sceneBuildIndex:10,scenePath:'Assets/Scenes/SHRL/SHRL_Dojo2.unity',
  serializedOwner:'level10',
};
const dojoSceneMetrics = {
  ...nativeMetrics,
  nativeScene:{...nativeMetrics.nativeScene,source:dojoSceneSource},
};
function dojoVisibleWindow(current) {
  const displayed = (classes=[]) => ({
    hidden:false,closest:()=>null,
    classList:{contains:name=>classes.includes(name)},
    style:{maskImage:'url("/local-assets/sceneHud_123.png")'},
  });
  const elements = {
    hud:displayed(['native-hud']),
    crosshair:displayed(['native-crosshair']),
    health:{...displayed(),querySelectorAll:()=>[{}, {}, {}]},
    scene:{width:1920,height:1080},
  };
  return {
    __superhotGetRenderedFrameSnapshot:()=>current,
    document:{getElementById:name=>elements[name]??null},
    getComputedStyle:()=>({display:'block',visibility:'visible'}),
  };
}
test('Dojo same-frame DOM receipt shows visible HUD and source-sampled hands, but never compositor pixels',()=>{
  const frameNow={
    ...frame,frameId:42,activeScreen:'playing',
    nativeScene:dojoSceneMetrics.nativeScene,
    nativeHands:{handsDrawCalls:2,handsTriangles:1040,sourcePoseSampled:true},
  };
  const win=dojoVisibleWindow(frameNow);
  const receipt=captureDojoCompositionAtFrame(win,{
    ...frameNow,nativeScene:dojoSceneMetrics.nativeScene,
  });
  assert.equal(receipt.status,'DOJO_HUD_DOM_AND_HANDS_APP_REPORTED_NO_PIXEL_PROOF');
  assert.equal(receipt.hud.sourceCrosshairMaskId,'sceneHud_123');
  assert.equal(receipt.hud.heartElements,3);
  assert.equal(receipt.hands.appReportedIndexedDrawCalls,2);
  assert.equal(receipt.hands.appReportedSourcePoseSampled,true);
  assert.equal(receipt.webglCanvasIncludesDomOverlay,false);
  assert.equal(receipt.fullViewportScreenshotCaptured,false);
  assert.equal(receipt.nativeParityVerdict,'UNASSESSED');
  assert.equal(JSON.stringify(receipt).includes('/local-assets/'),false);
});
test('Dojo DOM receipt rejects different frame IDs and ignores other scenes',()=>{
  const frameNow={...frame,frameId:42,activeScreen:'playing',
    nativeScene:dojoSceneMetrics.nativeScene};
  const win=dojoVisibleWindow(frameNow);
  assert.throws(()=>captureDojoCompositionAtFrame(win,{...frameNow,frameId:43}),
    /does not match captured WebGL frame/);
  assert.equal(captureDojoCompositionAtFrame(win,{
    ...frameNow,nativeScene:{source:{...dojoSceneSource,sceneBuildIndex:28}},
  }),null);
  frameNow.nativeHands=null;
  const report=captureDojoCompositionAtFrame(win,frameNow);
  assert.equal(report.status,'DOJO_HUD_DOM_PRESENT_HANDS_GPU_UNOBSERVED');
});
test('Dojo WebGL PNG embeds same-render DOM status without claiming HUD pixels',async()=>{
  const current={...frame,activeScreen:'playing',frameId:1,
    nativeScene:dojoSceneMetrics.nativeScene};
  const mock=fakeBrowser({sceneMetrics:dojoSceneMetrics,initialFrame:current});
  const receipt=await captureContainersWeb({...mock,expectedScreen:'playing',webCommit:'abcdef0'});
  assert.equal(receipt.frameId,2);
  assert.equal(receipt.dojoStartUiGuard,'DOJO_START_UI_GUARD_ONLY_NOT_NATIVE_PARITY');
  assert.equal(receipt.domComposition.status,'SOURCE_HUD_DOM_NOT_ACTIVE');
  assert.equal(receipt.domComposition.fullViewportScreenshotCaptured,false);
  const pngBytes=new Uint8Array(await mock.requested[0].blob.arrayBuffer());
  const embedded=readWebCaptureMetadata(pngBytes).metadata;
  assert.equal(embedded.domComposition.status,receipt.domComposition.status);
  assert.equal(embedded.domComposition.webglCanvasIncludesDomOverlay,false);
  assert.equal(embedded.dojoStartUiGuard,'DOJO_START_UI_GUARD_ONLY_NOT_NATIVE_PARITY');
  assert.match(embedded.limitations.join(' '),/WebGL readPixels excludes DOM HUD/);
});
test('Dojo visual capture refuses pre-Start preview despite playing screen and valid source metrics',async()=>{
  const current={...frame,activeScreen:'playing',frameId:1,
    nativeScene:dojoSceneMetrics.nativeScene};
  const mock=fakeBrowser({sceneMetrics:dojoSceneMetrics,initialFrame:current,
    sceneControlsHidden:false});
  await assert.rejects(captureContainersWeb({...mock,expectedScreen:'playing'}),
    /pre-Start preview/);
  assert.equal(mock.getPixelReads(),0);
  assert.equal(mock.requested.length,0);
  assert.equal(mock.getEncodedFrames(),0);
});
test('Dojo visual capture rechecks Start gate in GPU callback to reject changed UI',async()=>{
  const current={...frame,activeScreen:'playing',frameId:1,
    nativeScene:dojoSceneMetrics.nativeScene};
  let mock;
  mock=fakeBrowser({sceneMetrics:dojoSceneMetrics,initialFrame:current,
    beforeFrame:set=>{
      set({...current,frameId:2});
      mock.sceneControls.hidden=false;
    }});
  await assert.rejects(captureContainersWeb({...mock,expectedScreen:'playing'}),
    /pre-Start preview/);
  assert.equal(mock.getPixelReads(),0);
  assert.equal(mock.requested.length,0);
});
test('Dojo screenshot Start gate is only a UI witness and leaves non-Dojo captures unchanged',()=>{
  const current={...frame,activeScreen:'playing',frameId:1,
    nativeScene:dojoSceneMetrics.nativeScene};
  const report={nativeScene:current.nativeScene};
  assert.equal(requireDojoStartedVisualFrame({getElementById:()=>({hidden:true})},report),
    'DOJO_START_UI_GUARD_ONLY_NOT_NATIVE_PARITY');
  assert.throws(()=>requireDojoStartedVisualFrame({getElementById:()=>null},report),
    /pre-Start preview/);
  assert.equal(requireDojoStartedVisualFrame({getElementById:()=>null},
    {nativeScene:nativeMetrics.nativeScene}),null);
  assert.equal(requireDojoStartedVisualFrame({getElementById:()=>null},report,'menu'),null);
});

test('captures a sparse two-tone Dojo-like WebGL silhouette instead of rejecting a valid frame',()=>{
  let showSinglePixel=true;
  const gl={
    FRAMEBUFFER_BINDING:0x8ca6,RGBA:0x1908,UNSIGNED_BYTE:0x1401,NO_ERROR:0,
    drawingBufferWidth:8,drawingBufferHeight:8,
    getParameter(){return null;},getError(){return 0;},
    readPixels(_x,_y,_w,_h,_format,_type,dst){
      dst.fill(0);
      for(let i=3;i<dst.length;i+=4)dst[i]=255;
      if(showSinglePixel)dst[4*(4*8+7)]=255;
    },
  };
  const canvas={width:8,height:8,getContext:()=>gl};
  const rgba=readRenderedWebglRgba(canvas);
  // readPixels is bottom-up; the exported pixels must be top-down.
  assert.equal(rgba[4*(3*8+7)],255);
  assert.equal(rgba[4*(3*8+6)],0);
  showSinglePixel=false;
  assert.throws(()=>readRenderedWebglRgba(canvas),/blank\/uniform/);
});
