/**
 * SH-15 private-user browser capture. No network calls or game assets shipped.
 * Captures only the WebGL canvas, never authenticates a native MCD frame.
 */
import { collectDojoVisibleComposition } from './integration-dojo-visible.mjs';

const SIGNATURE = Uint8Array.of(137,80,78,71,13,10,26,10);
const KEY = 'SH15Capture';
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const TABLE = Uint32Array.from({length:256},(_,i)=>{
  let v=i;for(let k=0;k<8;k++)v=v&1?0xedb88320^(v>>>1):v>>>1;return v>>>0;
});
function crc(bytes){let v=0xffffffff;for(const x of bytes)v=TABLE[(v^x)&255]^(v>>>8);return(v^0xffffffff)>>>0;}
function get32(bytes,i){return new DataView(bytes.buffer,bytes.byteOffset+i,4).getUint32(0,false);}
function put32(bytes,i,value){new DataView(bytes.buffer,bytes.byteOffset+i,4).setUint32(0,value,false);}
function scanPng(bytes){
  if(!(bytes instanceof Uint8Array)||bytes.length<45||bytes.length>32*1024*1024||
      SIGNATURE.some((v,i)=>bytes[i]!==v))throw new Error('Invalid/oversized PNG');
  let at=8;const found=[];
  while(at+12<=bytes.length){
    const length=get32(bytes,at);
    if(length>bytes.length-at-12)throw new Error('Truncated PNG chunk');
    const type=String.fromCharCode(...bytes.subarray(at+4,at+8));
    const data=bytes.subarray(at+8,at+8+length);
    if(crc(bytes.subarray(at+4,at+8+length))!==get32(bytes,at+8+length))throw new Error('PNG CRC mismatch');
    if(!found.length&&(type!=='IHDR'||length!==13))throw new Error('PNG missing IHDR');
    found.push({type,data,offset:at});
    at+=length+12;
    if(type==='IEND'){
      if(length||at!==bytes.length)throw new Error('Invalid PNG IEND');
      return found;
    }
  }
  throw new Error('PNG missing IEND');
}
function embeddedText(part){return part.type==='tEXt'&&decoder.decode(part.data.subarray(0,KEY.length+1))===KEY+'\0';}
function validMetadata(meta){
  if(!meta||meta.schemaVersion!==1||meta.origin!=='web'||
      meta.status!=='WEB_ONLY_CAPTURE_NATIVE_PAIR_MISSING'){
    throw new Error('Invalid SH-15 Web-only capture metadata');
  }
}
export function embedWebCaptureMetadata(bytes,meta){
  validMetadata(meta);
  const parts=scanPng(bytes);
  if(parts.some(embeddedText))throw new Error('SH-15 capture metadata already present');
  const payload=encoder.encode(KEY+'\0'+JSON.stringify(meta));
  if(payload.length>16384)throw new Error('Capture metadata too large');
  const chunk=new Uint8Array(payload.length+12);
  put32(chunk,0,payload.length);chunk.set(encoder.encode('tEXt'),4);chunk.set(payload,8);
  put32(chunk,8+payload.length,crc(chunk.subarray(4,8+payload.length)));
  const end=parts.at(-1).offset;
  const output=new Uint8Array(bytes.length+chunk.length);
  output.set(bytes.subarray(0,end));output.set(chunk,end);output.set(bytes.subarray(end),end+chunk.length);
  return output;
}
export function readWebCaptureMetadata(bytes){
  const parts=scanPng(bytes);
  const matches=parts.filter(embeddedText);
  if(matches.length!==1)throw new Error('Exactly one SH-15 metadata chunk required');
  const metadata=JSON.parse(decoder.decode(matches[0].data.subarray(KEY.length+1)));
  validMetadata(metadata);
  return {metadata,width:get32(parts[0].data,0),height:get32(parts[0].data,4)};
}
function cameraPose(camera){
  const keys=['x','y','z','yaw','pitch'];
  if(!camera||keys.some(key=>!Number.isFinite(camera[key]))){
    throw new Error('An explicit finite camera pose {x,y,z,yaw,pitch} is required');
  }
  return Object.fromEntries(keys.map(key=>[key,camera[key]]));
}
function renderedProjection(projection){
  if(!projection||['verticalScale','near','far','aspect'].some(key=>
      !Number.isFinite(projection[key])||projection[key]<=0)||projection.far<=projection.near||
      !Array.isArray(projection.viewProjection)||projection.viewProjection.length!==16||
      !projection.viewProjection.every(Number.isFinite)){
    throw new Error('Finite rendered projection and 16-value viewProjection required');
  }
  return Object.fromEntries(['verticalScale','near','far','aspect','viewProjection'].map(key=>
    [key,key==='viewProjection'?[...projection[key]]:projection[key]]));
}
function renderedEnemyPose(enemy){
  if(enemy==null)return null;
  const pose={};
  for(const key of ['clip','sampledTime','skinned','nativeClipSampled','runtimeEnemyInstanceVerified']){
    if(enemy[key]!==undefined)pose[key]=enemy[key];
  }
  if(pose.clip!==undefined&&(typeof pose.clip!=='string'||pose.clip.length>256)||
      pose.sampledTime!==undefined&&!Number.isFinite(pose.sampledTime)||
      ['skinned','nativeClipSampled','runtimeEnemyInstanceVerified'].some(key=>
        pose[key]!==undefined&&typeof pose[key]!=='boolean')){
    throw new Error('Invalid rendered enemy pose provenance');
  }
  return pose;
}
function requireRenderedFrame(frame,expectedCamera,expectedScreen){
  const expected=cameraPose(expectedCamera);
  if(!frame||!Number.isSafeInteger(frame.frameId)||frame.frameId<1){
    throw new Error('Same-rendered-frame camera evidence unavailable');
  }
  if(!['menu','playing','paused'].includes(expectedScreen)||frame.activeScreen!==expectedScreen){
    throw new Error(`Expected ${expectedScreen} rendered phase (static menu by default)`);
  }
  const pose=cameraPose(frame.camera);
  if(Object.keys(expected).some(key=>pose[key]!==expected[key])){
    throw new Error('Rendered camera differs from expected source scene camera pose');
  }
  const projection=renderedProjection(frame.projection);
  if(frame.worldClock!==undefined&&(!Number.isFinite(frame.worldClock)||frame.worldClock<0)){
    throw new Error('Invalid rendered worldClock');
  }
  return {
    frameId:frame.frameId,activeScreen:frame.activeScreen,projection,
    camera:{status:'RENDERED_FRAME_POSE_AND_PROJECTION_ONLY',pose,viewMatrix:null,projectionMatrix:null},
    worldClock:frame.worldClock??null,
    nativeEnemyPose:renderedEnemyPose(frame.nativeEnemy),
    nativeEnemyPoseProvenance:frame.nativeEnemy==null?'RENDERED_ENEMY_POSE_UNAVAILABLE':
      'LAST_RENDERED_ENEMY_DRAW_NOT_ALL_ACTORS',
    worldPoseProvenance:frame.worldClock===undefined?'RENDERED_WORLD_CLOCK_UNAVAILABLE':
      'WEB_RENDERED_WORLD_CLOCK_NOT_NATIVE_FRAME_MATCH',
  };
}
export function requireContainersWebEvidence({metrics,frame,expectedCamera,expectedScreen='menu',width,height,dpr,strictViewport=true}){
  if(!Number.isSafeInteger(width)||width<=0||!Number.isSafeInteger(height)||height<=0)throw new Error('Invalid canvas size');
  if(strictViewport&&(width!==1920||height!==1080||dpr!==1))throw new Error('Require 1920x1080 canvas and DPR1 without resizing');
  if(metrics?.browserMeasured!==true){
    throw new Error('Measured source scene telemetry unavailable');
  }
  const generated=frame?.generatedManifest??metrics.generatedManifest;
  let geometry;
  if(metrics.mode==='NATIVE_ORIGINAL_GEOMETRY_WEB_GAMEPLAY'){
    const nativeScene=frame?.nativeScene??metrics.nativeScene;
    const total=frame?.totalWebGLDrawCalls??metrics.totalWebGLDrawCalls;
    if(!nativeScene||['meshes','instances','textures'].some(key=>
        !Number.isSafeInteger(nativeScene[key])||nativeScene[key]<=0)||
        !Number.isSafeInteger(nativeScene.source?.sceneBuildIndex)||nativeScene.source.sceneBuildIndex<0||
        typeof nativeScene.source?.scenePath!=='string'||typeof nativeScene.source?.serializedOwner!=='string'||
        generated?.nativeGeometry!==true||!Number.isSafeInteger(generated.drawCalls)||generated.drawCalls<=0||
        !Number.isSafeInteger(generated.triangles)||generated.triangles<=0||
        !Number.isSafeInteger(total)||total<generated.drawCalls){
      throw new Error('Need loaded native scene and measured native world draws/triangles');
    }
    geometry={
      nativeScene:{source:nativeScene.source,
        ...Object.fromEntries(['meshes','instances','textures'].map(key=>[key,nativeScene[key]]))},
      generatedManifest:{drawCalls:generated.drawCalls,triangles:generated.triangles,
        nativeGeometry:true,nativeMaterialParity:false},
      totalWebGLDrawCalls:total,
    };
  }else if(metrics.mode==='CONTAINERS_COLLIDER_PROXY_NOT_MCD_RUNTIME'){
    if(metrics.locallyLoadedSourceGroups!==2||generated?.sourceQualifiedMesh6DrawPackets!==3||
        generated?.privateIndexedDraws!==4||!(metrics.totalWebGLDrawCalls>=4)){
      throw new Error('Need 2 File groups, 3 Mesh6 packets and 4 indexed draws');
    }
    geometry={locallyLoadedSourceGroups:2,mesh6DrawPackets:3,privateIndexedDraws:4,
      totalWebGLDrawCalls:metrics.totalWebGLDrawCalls};
  }else{
    throw new Error('Measured source scene telemetry unavailable');
  }
  const rendered=requireRenderedFrame(frame,expectedCamera,expectedScreen);
  if(Math.abs(rendered.projection.aspect-width/height)>1e-6){
    throw new Error('Rendered projection aspect differs from canvas');
  }
  return {
    viewport:[width,height],dpr,...rendered,mode:metrics.mode,...geometry,
    geometryProvenance:frame.generatedManifest&&frame.totalWebGLDrawCalls!==undefined?
      'RENDERED_FRAME_COUNTERS':'BROWSER_TELEMETRY_NOT_SAME_FRAME_COUNTERS',
    p95FrameMs:Number.isFinite(metrics.p95FrameMs)?metrics.p95FrameMs:null,
    nativeCameraMatched:false,nativeWorldPoseMatched:false,pixelComparisonPerformed:false,
  };
}
/**
 * Pair an already-captured WebGL frame with the DOM that is live in the SAME
 * render callback. The HUD/crosshair are DOM siblings of canvas#scene:
 * this is observability, not a screenshot of the composited viewport.
 * Does not read local assets, fetch files or export private scene data.
 */
export function captureDojoCompositionAtFrame(windowRef, rendered) {
  const source = rendered?.nativeScene?.source;
  const scenePath = String(source?.scenePath ?? '').replaceAll(String.fromCharCode(92), '/');
  if (source?.sceneBuildIndex !== 10 || source?.serializedOwner !== 'level10' ||
      !scenePath.endsWith('/SHRL_Dojo2.unity')) return null;
  const observed = collectDojoVisibleComposition(windowRef);
  if (observed.frameId !== rendered.frameId ||
      observed.activeScreen !== rendered.activeScreen) {
    throw new Error('Dojo HUD/DOM receipt does not match captured WebGL frame');
  }
  return {
    status: observed.status,
    hud: {
      sourceClassesActive: observed.hud.sourceClassesActive,
      overlayVisible: observed.hud.overlayVisible,
      crosshairElementVisible: observed.hud.crosshairElementVisible,
      sourceCrosshairMaskId: observed.hud.sourceCrosshairMaskId,
      heartElements: observed.hud.heartElements,
      canvasWidth: observed.hud.canvasWidth,
      canvasHeight: observed.hud.canvasHeight,
    },
    hands: {
      appReportedIndexedDrawCalls: observed.hands.appReportedIndexedDrawCalls,
      appReportedTriangles: observed.hands.appReportedTriangles,
      appReportedSourcePoseSampled: observed.hands.appReportedSourcePoseSampled,
    },
    evidence: 'SAME_RENDER_CALLBACK_DOM_STATE_NOT_COMPOSITED_PIXELS',
    webglCanvasIncludesDomOverlay: false,
    fullViewportScreenshotCaptured: false,
    nativeParityVerdict: 'UNASSESSED',
  };
}

/**
 * Dojo can have activeScreen:'playing' before Start has armed its encounter:
 * main.js loads the level and calls setScreen('playing') on initial boot.
 * The scene-controls DOM guard is set hidden only after Start/reset. This
 * blocks a pre-Start *preview* from being mislabeled as a combat screenshot.
 * A DOM flag can be changed by the page; it is NOT independent native proof.
 */
export function requireDojoStartedVisualFrame(documentRef, report, expectedScreen='playing') {
  const source=report?.nativeScene?.source;
  const path=String(source?.scenePath ?? '').replaceAll(String.fromCharCode(92), '/');
  if (expectedScreen!=='playing' || source?.sceneBuildIndex!==10 ||
      source?.serializedOwner!=='level10' || !path.endsWith('/SHRL_Dojo2.unity')) {
    return null;
  }
  if (documentRef?.getElementById?.('scene-controls')?.hidden!==true) {
    throw new Error('Dojo visual capture refused: pre-Start preview or unverified combat UI');
  }
  return 'DOJO_START_UI_GUARD_ONLY_NOT_NATIVE_PARITY';
}

/**
 * Synchronously copies the default WebGL2 framebuffer AFTER the application's
 * render callback into JS-owned pixels. This avoids the canvas.toBlob() timing
 * ambiguity when preserveDrawingBuffer=false and gameplay keeps rendering.
 * The readback itself is evidence only of WEB pixels, never original MCD.
 * WebGL returns bottom-up rows; the PNG encoder expects top-down rows.
 */
export function readRenderedWebglRgba(canvas) {
  const width=canvas?.width,height=canvas?.height;
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||
      width<=0||height<=0||width*height>8_000_000){
    throw new RangeError('Readback requires a bounded nonzero WebGL canvas');
  }
  const gl=canvas.getContext?.('webgl2');
  if(!gl||typeof gl.readPixels!=='function'||typeof gl.getError!=='function'){
    throw new Error('Live WebGL2 framebuffer readback required');
  }
  if(gl.drawingBufferWidth!==width||gl.drawingBufferHeight!==height){
    throw new Error('WebGL framebuffer dimensions differ from canvas');
  }
  if(gl.getParameter(gl.FRAMEBUFFER_BINDING)!==null){
    throw new Error('Expected the on-screen default WebGL framebuffer');
  }
  const raw=new Uint8Array(width*height*4);
  gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,raw);
  if(gl.getError()!==gl.NO_ERROR){
    throw new Error('WebGL readPixels failed; GPU screenshot is unverified');
  }
  const samples=new Set();
  for(let y=0;y<36&&samples.size<4;y++){
    const sy=Math.min(height-1,Math.floor((y+.5)*height/36));
    for(let x=0;x<64&&samples.size<4;x++){
      const sx=Math.min(width-1,Math.floor((x+.5)*width/64));
      const at=4*(sy*width+sx);
      samples.add(raw[at]+256*raw[at+1]+65536*raw[at+2]);
    }
  }
  if(samples.size<4)throw new Error('WebGL screenshot appears blank/uniform; no image proof');
  const rgba=new Uint8ClampedArray(raw.length);
  const rowBytes=width*4;
  for(let y=0;y<height;y++){
    rgba.set(raw.subarray((height-1-y)*rowBytes,(height-y)*rowBytes),y*rowBytes);
  }
  return rgba;
}
async function encodeFrozenFramePng(documentRef,rgba,width,height) {
  const imageCanvas=documentRef.createElement('canvas');
  imageCanvas.width=width;imageCanvas.height=height;
  const ctx=imageCanvas.getContext('2d',{alpha:false,willReadFrequently:false});
  if(!ctx||typeof ctx.createImageData!=='function'||typeof ctx.putImageData!=='function'){
    throw new Error('2D PNG encoder unavailable');
  }
  const image=ctx.createImageData(width,height);
  image.data.set(rgba);
  ctx.putImageData(image,0,0);
  return await new Promise((resolve,reject)=>imageCanvas.toBlob(blob=>
    blob?resolve(blob):reject(new Error('Frozen frame PNG encoding failed')),'image/png'));
}
const toHex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
/**
 * In Chrome/Edge DevTools on the default root (or the manual local preview),
 * import this module and call captureContainersWeb({expectedCamera, expectedScreen:'playing', webCommit:'abcdef0'}).
 * expectedCamera must be the independently chosen source-scene baseline pose
 * {x,y,z,yaw,pitch}, not a copy of whichever camera happens to be active.
 * The synchronous __superhotGetRenderedFrameSnapshot getter must describe the
 * last completed canvas render, with detached camera values and rendered phase.
 * Requests a local PNG download with SH15Capture metadata; does not verify a
 * saved file and never claims a native frame. No source assets are exported.
 */
export async function captureContainersWeb({
  windowRef=globalThis.window,documentRef=globalThis.document,
  expectedCamera,expectedScreen='menu',webCommit=null,strictViewport=true,download=true,
}={}){
  if(!windowRef||!documentRef)throw new Error('Live browser required');
  const canvas=documentRef.getElementById('scene');
  if(!canvas||typeof canvas.getContext!=='function')throw new Error('WebGL canvas #scene unavailable');
  const expected=cameraPose(expectedCamera);
  const getFrame=windowRef.__superhotGetRenderedFrameSnapshot;
  if(typeof getFrame!=='function')throw new Error('Same-rendered-frame camera evidence unavailable');
  const evidence=()=>requireContainersWebEvidence({
    metrics:windowRef.__superhotSceneMetrics,frame:getFrame(),expectedCamera:expected,expectedScreen,
    width:canvas.width,height:canvas.height,dpr:windowRef.devicePixelRatio,
    strictViewport,
  });
  requireDojoStartedVisualFrame(documentRef,evidence(),expectedScreen);
  if(webCommit!==null&&!/^[a-f0-9]{7,40}$/i.test(webCommit))throw new Error('Invalid Web commit SHA');
  let report,domComposition=null,dojoStartUiGuard=null;
  const startingFrameId=getFrame().frameId;
  // SH-05 schedules its render rAF before DevTools calls this function. We
  // accept only a NEW completed frame, and synchronously read GPU pixels in
  // that SAME callback. The PNG is later encoded from this frozen copy, so
  // subsequent animation updates cannot change the recorded image.
  const rgba=await new Promise((resolve,reject)=>windowRef.requestAnimationFrame(()=>{
    try{
      report=evidence();
      dojoStartUiGuard=requireDojoStartedVisualFrame(documentRef,report,expectedScreen);
      if(report.frameId<=startingFrameId){
        throw new Error('No new completed Web render before framebuffer capture');
      }
      const pixels=readRenderedWebglRgba(canvas);
      const finalFrame=getFrame();
      if(finalFrame.frameId!==report.frameId||
          finalFrame.activeScreen!==report.activeScreen||
          finalFrame.worldClock!==report.worldClock){
        throw new Error('Web rendered frame changed during synchronous GPU readback');
      }
      domComposition=captureDojoCompositionAtFrame(windowRef,report);
      resolve(pixels);
    }catch(error){reject(error);}
  }));
  const rgbaDigest=await windowRef.crypto.subtle.digest('SHA-256',rgba.buffer);
  const blob=await encodeFrozenFramePng(documentRef,rgba,report.viewport[0],report.viewport[1]);
  if(blob.type!=='image/png')throw new Error('Frozen framebuffer did not encode PNG');
  const base=new Uint8Array(await blob.arrayBuffer());
  const parts=scanPng(base);
  if(get32(parts[0].data,0)!==report.viewport[0]||get32(parts[0].data,4)!==report.viewport[1]||
      canvas.width!==report.viewport[0]||canvas.height!==report.viewport[1]){
    throw new Error('Canvas resolution changed during capture');
  }
  const digest=await windowRef.crypto.subtle.digest('SHA-256',base);
  const capturedAt=new Date().toISOString();
  const sourceScene=report.nativeScene?.source;
  const scene=sourceScene?{
    id:sourceScene.scenePath.split('/').pop().replace(/\.unity$/i,''),
    buildIndex:sourceScene.sceneBuildIndex,scenePath:sourceScene.scenePath,
    serializedOwner:sourceScene.serializedOwner,
  }:{id:'Containers',buildIndex:28};
  const metadata={
    schemaVersion:1,origin:'web',status:'WEB_ONLY_CAPTURE_NATIVE_PAIR_MISSING',
    source:'WEBGL_CANVAS_NOT_MCD',scene,
    capturedAt,webCommit:webCommit??'UNRECORDED',...report,domComposition,dojoStartUiGuard,
    rawCanvasSha256:toHex(digest),
    rawFrameRgbaSha256:toHex(rgbaDigest),
    captureMethod:'WEBGL2_READ_PIXELS_SYNCHRONOUS_COMPLETED_FRAME',
    pixelEncoding:'RGBA8_DEFAULT_FRAMEBUFFER_TO_2D_SRGB_PNG',
    limitations:['No executed native MCD capture or paired active camera',
      'Web world clock/animation is not a matched native pose, even when the camera is fixed',
      'Original geometry does not establish native material, lighting or runtime parity',
      'WebGL readPixels excludes DOM HUD and crosshair; DOM receipt is not a compositor screenshot',
      'No native/Web RGB, silhouette or 1:1 score computed'],
  };
  const marked=embedWebCaptureMetadata(base,metadata);
  const intendedFilename='native-scene-web-'+capturedAt.replace(/[:.]/g,'-')+'.png';
  if(download){
    const url=windowRef.URL.createObjectURL(new Blob([marked],{type:'image/png'}));
    try{
      const anchor=documentRef.createElement('a');anchor.href=url;
      anchor.download=intendedFilename;
      documentRef.body.append(anchor);anchor.click();anchor.remove();
    }finally{windowRef.setTimeout(()=>windowRef.URL.revokeObjectURL(url),60000);}
  }
  return{status:metadata.status,...report,rawCanvasSha256:metadata.rawCanvasSha256,
    rawFrameRgbaSha256:metadata.rawFrameRgbaSha256,captureMethod:metadata.captureMethod,
    screenshotBytes:marked.length,cameraStatus:metadata.camera.status,
    downloadRequested:Boolean(download),intendedFilename,domComposition,dojoStartUiGuard};
}
