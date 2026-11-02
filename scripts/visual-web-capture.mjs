/**
 * SH-15 private-user browser capture. No network calls or game assets shipped.
 * Captures only the WebGL canvas, never authenticates a native MCD frame.
 */
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
    throw new Error('Rendered camera differs from expected Containers camera pose');
  }
  return {
    frameId:frame.frameId,activeScreen:frame.activeScreen,
    camera:{status:'RENDERED_FRAME_POSE_ONLY',pose,viewMatrix:null,projectionMatrix:null},
  };
}
export function requireContainersWebEvidence({metrics,frame,expectedCamera,expectedScreen='menu',width,height,dpr,strictViewport=true}){
  if(!Number.isSafeInteger(width)||width<=0||!Number.isSafeInteger(height)||height<=0)throw new Error('Invalid canvas size');
  if(strictViewport&&(width!==1920||height!==1080||dpr!==1))throw new Error('Require 1920x1080 canvas and DPR1 without resizing');
  if(metrics?.browserMeasured!==true||metrics?.mode!=='CONTAINERS_COLLIDER_PROXY_NOT_MCD_RUNTIME'){
    throw new Error('Measured Containers telemetry unavailable');
  }
  const generated=metrics.generatedManifest;
  if(metrics.locallyLoadedSourceGroups!==2||generated?.sourceQualifiedMesh6DrawPackets!==3||
      generated?.privateIndexedDraws!==4||!(metrics.totalWebGLDrawCalls>=4)){
    throw new Error('Need 2 File groups, 3 Mesh6 packets and 4 indexed draws');
  }
  const rendered=requireRenderedFrame(frame,expectedCamera,expectedScreen);
  return {
    viewport:[width,height],dpr,...rendered,
    locallyLoadedSourceGroups:2,mesh6DrawPackets:3,privateIndexedDraws:4,
    totalWebGLDrawCalls:metrics.totalWebGLDrawCalls,
    p95FrameMs:Number.isFinite(metrics.p95FrameMs)?metrics.p95FrameMs:null,
    nativeCameraMatched:false,pixelComparisonPerformed:false,
  };
}
function sampleNotBlank(windowRef,documentRef,blob){
  return windowRef.createImageBitmap(blob).then(bitmap=>{
    try{
      const probe=documentRef.createElement('canvas');probe.width=64;probe.height=36;
      const ctx=probe.getContext('2d',{willReadFrequently:true});
      if(!ctx)throw new Error('2D screenshot probe unavailable');
      ctx.drawImage(bitmap,0,0,64,36);
      const pixels=ctx.getImageData(0,0,64,36).data;
      const distinct=new Set();
      for(let i=0;i<pixels.length;i+=4){
        distinct.add(pixels[i]+':'+pixels[i+1]+':'+pixels[i+2]);
        if(distinct.size>=4)break;
      }
      if(distinct.size<4)throw new Error('WebGL screenshot appears blank/uniform; no image proof');
    }finally{bitmap.close?.();}
  });
}
const toHex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
/**
 * In Chrome/Edge DevTools after loading both private OBJ files, import this
 * module and call captureContainersWeb({expectedCamera, expectedScreen:'playing', webCommit:'abcdef0'}).
 * expectedCamera must be the independently chosen Containers baseline pose
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
  if(!canvas||typeof canvas.toBlob!=='function')throw new Error('WebGL canvas #scene unavailable');
  const expected=cameraPose(expectedCamera);
  const getFrame=windowRef.__superhotGetRenderedFrameSnapshot;
  if(typeof getFrame!=='function')throw new Error('Same-rendered-frame camera evidence unavailable');
  const evidence=()=>requireContainersWebEvidence({
    metrics:windowRef.__superhotSceneMetrics,frame:getFrame(),expectedCamera:expected,expectedScreen,
    width:canvas.width,height:canvas.height,dpr:windowRef.devicePixelRatio,
    strictViewport,
  });
  evidence();
  if(webCommit!==null&&!/^[a-f0-9]{7,40}$/i.test(webCommit))throw new Error('Invalid Web commit SHA');
  let report;
  // Read the completed-render snapshot and request its canvas pixels in the
  // same synchronous callback; one-second telemetry cannot identify this view.
  const blob=await new Promise((resolve,reject)=>windowRef.requestAnimationFrame(()=>{
    try{
      report=evidence();
      canvas.toBlob(b=>{
        try{
          requireRenderedFrame(getFrame(),expected,expectedScreen);
          if(!b)throw new Error('WebGL screenshot unavailable');
          resolve(b);
        }catch(error){reject(error);}
      },'image/png');
    }catch(error){reject(error);}
  }));
  if(blob.type!=='image/png')throw new Error('Canvas did not encode PNG');
  if(typeof windowRef.createImageBitmap!=='function')throw new Error('createImageBitmap required for blank-frame guard');
  await sampleNotBlank(windowRef,documentRef,blob);
  const base=new Uint8Array(await blob.arrayBuffer());
  const parts=scanPng(base);
  if(get32(parts[0].data,0)!==report.viewport[0]||get32(parts[0].data,4)!==report.viewport[1]||
      canvas.width!==report.viewport[0]||canvas.height!==report.viewport[1]){
    throw new Error('Canvas resolution changed during capture');
  }
  const digest=await windowRef.crypto.subtle.digest('SHA-256',base);
  const capturedAt=new Date().toISOString();
  const metadata={
    schemaVersion:1,origin:'web',status:'WEB_ONLY_CAPTURE_NATIVE_PAIR_MISSING',
    source:'WEBGL_CANVAS_NOT_MCD',scene:{id:'Containers',buildIndex:28},
    capturedAt,webCommit:webCommit??'UNRECORDED',...report,rawCanvasSha256:toHex(digest),
    limitations:['No executed native MCD capture or paired active camera',
      'Geometry/materials/runtime still contain generated approximations',
      'No native/Web RGB, silhouette or 1:1 score computed'],
  };
  const marked=embedWebCaptureMetadata(base,metadata);
  const intendedFilename='containers-web-'+capturedAt.replace(/[:.]/g,'-')+'.png';
  if(download){
    const url=windowRef.URL.createObjectURL(new Blob([marked],{type:'image/png'}));
    try{
      const anchor=documentRef.createElement('a');anchor.href=url;
      anchor.download=intendedFilename;
      documentRef.body.append(anchor);anchor.click();anchor.remove();
    }finally{windowRef.setTimeout(()=>windowRef.URL.revokeObjectURL(url),60000);}
  }
  return{status:metadata.status,...report,rawCanvasSha256:metadata.rawCanvasSha256,
    screenshotBytes:marked.length,cameraStatus:metadata.camera.status,
    downloadRequested:Boolean(download),intendedFilename};
}
