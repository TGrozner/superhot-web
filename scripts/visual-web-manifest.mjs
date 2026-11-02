#!/usr/bin/env node
/**
 * SH-15: turn an actually downloaded, SAME-FRAME WebGL2 screenshot into the
 * *Web half* of a private visual-compare manifest. This never creates a native
 * observation and never guesses the camera, state or source object identities.
 * No MCD assets, captures or binary data are included in the repository.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng } from './visual-compare.mjs';
import { readWebCaptureMetadata } from './visual-web-capture.mjs';

const SIGNATURE = Buffer.from([137,80,78,71,13,10,26,10]);
const SH15_KEY = Buffer.from('SH15Capture\0', 'ascii');
const SHA = /^[0-9a-f]{64}$/i;
const COMMIT = /^[0-9a-f]{7,40}$/i;

function requireValue(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > 256) {
    throw new TypeError(label + ' must be a nonempty, bounded string');
  }
  return value;
}
const finite = value => typeof value === 'number' && Number.isFinite(value);
function dot(axis, point) { return axis[0]*point[0] + axis[1]*point[1] + axis[2]*point[2]; }
function multiply4(a, b) {
  const result = new Array(16).fill(0);
  for (let col=0;col<4;col++) for (let row=0;row<4;row++) {
    for (let k=0;k<4;k++) result[col*4+row] += a[k*4+row]*b[col*4+k];
  }
  return result;
}

/** Derive the two matrices actually represented by SH-05's same-frame packet.
 * This derivation is accepted only when their product reproduces the recorded
 * float32 GPU viewProjection. It is NOT an executed native camera.
 */
export function matricesFromWebFrame(camera, projection) {
  if (!camera || ['x','y','z','yaw','pitch'].some(k=>!finite(camera[k])) ||
      !projection || ['verticalScale','near','far','aspect'].some(k=>
        !finite(projection[k]) || projection[k] <= 0) ||
      projection.far <= projection.near ||
      !Array.isArray(projection.viewProjection) || projection.viewProjection.length !== 16 ||
      projection.viewProjection.some(x=>!finite(x))) {
    throw new TypeError('Complete finite Web rendered camera/projection packet required');
  }
  const {yaw,pitch} = camera;
  const sy=Math.sin(yaw), cy=Math.cos(yaw), sp=Math.sin(pitch), cp=Math.cos(pitch);
  const right=[cy,0,sy], up=[-sy*sp,cp,cy*sp], forward=[sy*cp,sp,-cy*cp];
  const pos=[camera.x,camera.y,camera.z];
  const viewMatrix=[
    right[0],up[0],forward[0],0,
    right[1],up[1],forward[1],0,
    right[2],up[2],forward[2],0,
    -dot(right,pos),-dot(up,pos),-dot(forward,pos),1,
  ];
  const {verticalScale:f,aspect,near,far}=projection;
  const depth=(far+near)/(far-near), offset=-2*far*near/(far-near);
  const projectionMatrix=[
    f/aspect,0,0,0,
    0,f,0,0,
    0,0,depth,1,
    0,0,offset,0,
  ];
  const reconstructed=multiply4(projectionMatrix,viewMatrix);
  const actual=projection.viewProjection;
  let maxAbsoluteDelta=0;
  for (let i=0;i<16;i++) {
    const delta=Math.abs(Math.fround(reconstructed[i])-actual[i]);
    maxAbsoluteDelta=Math.max(maxAbsoluteDelta,delta);
    const tolerance=Math.max(3e-5,5e-6*Math.max(1,Math.abs(actual[i])));
    if (delta>tolerance) {
      throw new Error('Recorded GPU viewProjection disagrees with Web pose/FOV/clip; comparison blocked');
    }
  }
  return {viewMatrix,projectionMatrix,maxViewProjectionCoefficientDelta:maxAbsoluteDelta};
}

/** Remove SH15 tEXt from PNG and prove the saved pixels belong to its receipt.
 * Never hash the final tagged PNG as if it were the original raw canvas PNG.
 */
export function verifyOriginalWebPngDigest(bytes, expectedDigest) {
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) {
    throw new TypeError('Saved PNG bytes required');
  }
  if (typeof expectedDigest !== 'string' || !SHA.test(expectedDigest)) {
    throw new TypeError('Embedded rawCanvasSha256 required');
  }
  const png=Buffer.from(bytes);
  if (png.length<45 || !png.subarray(0,8).equals(SIGNATURE)) {
    throw new Error('Invalid SH-15 PNG');
  }
  const markers=[];
  for (let at=8;at+12<=png.length;) {
    const size=png.readUInt32BE(at), end=at+size+12;
    if (end>png.length) throw new Error('Truncated SH-15 PNG');
    const type=png.toString('ascii',at+4,at+8);
    const data=png.subarray(at+8,at+8+size);
    if (type==='tEXt' && data.subarray(0,SH15_KEY.length).equals(SH15_KEY)) {
      markers.push({start:at,end});
    }
    at=end;
    if(type==='IEND') break;
  }
  if(markers.length!==1) throw new Error('Exactly one embedded SH-15 receipt required');
  const {start,end}=markers[0];
  const original=Buffer.concat([png.subarray(0,start),png.subarray(end)]);
  const actual=createHash('sha256').update(original).digest('hex');
  if(actual!==expectedDigest.toLowerCase()) {
    throw new Error('Saved PNG image bytes disagree with embedded same-frame SHA256');
  }
  return {originalPngSha256:actual};
}

/** All inputs are owner-private. Merely assigning stateId never proves native
 * frame synchronization; native MCD and SH-10 acceptance remain independent.
 */
export function preparePrivateWebManifest(bytes, {
  pngFilename, expectedScene, expectedBuildIndex, stateId,
}={}) {
  requireValue(pngFilename,'pngFilename');
  if(basename(pngFilename)!==pngFilename || !/\.png$/i.test(pngFilename)) {
    throw new Error('PNG must be beside its private manifest');
  }
  requireValue(expectedScene,'expectedScene');
  requireValue(stateId,'stateId');
  if(!Number.isSafeInteger(expectedBuildIndex)||expectedBuildIndex<0) {
    throw new TypeError('Independent expected scene buildIndex required');
  }
  const {metadata,width,height}=readWebCaptureMetadata(Buffer.from(bytes));
  if(metadata.captureMethod!=='WEBGL2_READ_PIXELS_SYNCHRONOUS_COMPLETED_FRAME' ||
     metadata.mode!=='NATIVE_ORIGINAL_GEOMETRY_WEB_GAMEPLAY' ||
     metadata.geometryProvenance!=='RENDERED_FRAME_COUNTERS' ||
     metadata.generatedManifest?.nativeGeometry!==true ||
     !Number.isSafeInteger(metadata.generatedManifest.drawCalls) ||
     metadata.generatedManifest.drawCalls<=0 ||
     !Number.isSafeInteger(metadata.generatedManifest.triangles) ||
     metadata.generatedManifest.triangles<=0 ||
     !Number.isSafeInteger(metadata.frameId)||metadata.frameId<1 ||
     metadata.nativeCameraMatched!==false ||
     metadata.nativeWorldPoseMatched!==false ||
     metadata.pixelComparisonPerformed!==false) {
    throw new Error('Genuine completed source-world Web-only frame required');
  }
  if(metadata.scene?.id!==expectedScene ||
     metadata.scene?.buildIndex!==expectedBuildIndex ||
     metadata.nativeScene?.source?.sceneBuildIndex!==expectedBuildIndex ||
     typeof metadata.nativeScene?.source?.scenePath!=='string') {
    throw new Error('Web screenshot scene differs from independently selected native scene');
  }
  if(!Array.isArray(metadata.viewport) || metadata.viewport[0]!==width ||
     metadata.viewport[1]!==height || width*height>8_000_000) {
    throw new Error('Embedded viewport differs from saved PNG dimensions');
  }
  if(!COMMIT.test(metadata.webCommit) ||
     typeof metadata.rawFrameRgbaSha256!=='string' ||
     !SHA.test(metadata.rawFrameRgbaSha256)) {
    throw new Error('Recorded Web commit and same-frame RGBA digest required');
  }
  if(metadata.pixelEncoding!=='RGBA8_DEFAULT_FRAMEBUFFER_TO_2D_SRGB_PNG' ||
     metadata.camera?.status!=='RENDERED_FRAME_POSE_AND_PROJECTION_ONLY' ||
     metadata.activeScreen!=='playing') {
    throw new Error('Web screenshot phase/pixel encoding/camera provenance is not comparable');
  }
  const {originalPngSha256}=verifyOriginalWebPngDigest(bytes,metadata.rawCanvasSha256);
  const decoded=decodePng(Buffer.from(bytes));
  if(decoded.width!==width||decoded.height!==height) {
    throw new Error('Invalid PNG image payload dimensions');
  }
  const {viewMatrix,projectionMatrix,maxViewProjectionCoefficientDelta}=
    matricesFromWebFrame(metadata.camera.pose,metadata.projection);
  return {
    manifest:{
      schemaVersion:1,origin:'web',
      scene:{id:metadata.scene.id,buildIndex:metadata.scene.buildIndex,stateId},
      camera:{convention:'column-major-world-to-camera',coordinateSpace:'matched-web',
        viewMatrix,projectionMatrix},
      capture:{viewport:[width,height],colorSpace:'srgb',hud:'off',png:pngFilename},
      objects:[], // Source-qualified owner-private transforms must be added separately.
      evidence:{
        class:'WEB_SCREENSHOT_ONLY_NOT_NATIVE_PAIRED',
        captureMethod:metadata.captureMethod,webCommit:metadata.webCommit,
        frameId:metadata.frameId,worldClock:metadata.worldClock,
        originalPngSha256,rawFrameRgbaSha256:metadata.rawFrameRgbaSha256,
        nativeCameraAuthenticated:false,nativeStateAuthenticated:false,
        stateIdOwnerSuppliedNotProven:true,
      },
    },
    receipt:{
      status:'WEB_CAPTURE_MANIFEST_PREPARED_NATIVE_PAIR_UNVERIFIED',
      sceneMatchedIndependently:true,sourceWorldRendered:true,
      pngDigestVerified:true,sourceObjectPairsProvided:false,
      viewport:[width,height],frameId:metadata.frameId,
      maxViewProjectionCoefficientDelta,
      nativeFrameAuthenticated:false,pixelComparisonPerformed:false,oneToOneVerified:false,
    },
  };
}

function cli(args) {
  if(args.includes('--help')){
    process.stdout.write('Usage: node scripts/visual-web-manifest.mjs --png PRIVATE/web.png --scene SHRL_Dojo2 --build-index 10 --state-id PRIVATE_NATIVE_MATCHED_STATE --out PRIVATE/web.json\n');
    return;
  }
  const flags=new Map();
  for(let i=0;i<args.length;i+=2){
    if(!['--png','--scene','--build-index','--state-id','--out'].includes(args[i])||
        !args[i+1]||flags.has(args[i])) throw new Error('Invalid/duplicate CLI option');
    flags.set(args[i],args[i+1]);
  }
  if(flags.size!==5) throw new Error('Require PNG, independent scene/build, state ID and private output');
  const png=resolve(flags.get('--png')), out=resolve(flags.get('--out'));
  if(dirname(png)!==dirname(out)) {
    throw new Error('Write private Web manifest next to its source PNG (no path aliasing)');
  }
  if(!/^\d+$/.test(flags.get('--build-index'))) throw new Error('Invalid expected build index');
  const {manifest,receipt}=preparePrivateWebManifest(readFileSync(png),{
    pngFilename:basename(png),expectedScene:flags.get('--scene'),
    expectedBuildIndex:Number(flags.get('--build-index')),stateId:flags.get('--state-id'),
  });
  writeFileSync(out,JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
  process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{cli(process.argv.slice(2));}
  catch(error){
    process.stderr.write('SH-15 local Web manifest rejected: '+error.message+'\n');
    process.exitCode=2;
  }
}
