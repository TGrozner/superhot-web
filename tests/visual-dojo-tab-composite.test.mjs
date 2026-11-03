import test from 'node:test';
import assert from 'node:assert/strict';
import {
  requireDojoTabCompositeEvidence, requireBrowserTabTrack,
  captureDojoFullTab, installDojoFullTabCaptureButton,
} from '../scripts/visual-dojo-tab-composite.mjs';

// Synthetic provenance only: no Chromium, original MCD, native capture or OS APIs.
const cam={x:1,y:2,z:3,yaw:0.5,pitch:-0.25};
const viewport=[1920,1080],identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const source={sceneBuildIndex:10,scenePath:'Assets/Scenes/SHRL_Dojo2.unity',serializedOwner:'level10'};
const metrics={
  browserMeasured:true,mode:'NATIVE_ORIGINAL_GEOMETRY_WEB_GAMEPLAY',
  nativeScene:{source,meshes:68,instances:360,textures:17},
  generatedManifest:{drawCalls:360,triangles:185037,nativeGeometry:true,nativeMaterialParity:false},
  totalWebGLDrawCalls:371,
};
function report() {
  return {
    mode:metrics.mode,nativeScene:metrics.nativeScene,
    activeScreen:'playing',viewport,frameId:12,
    worldClock:0.3,camera:{status:'RENDERED_FRAME_POSE_AND_PROJECTION_ONLY',pose:cam},
    projection:{verticalScale:1.58,near:0.045,far:120,aspect:16/9,viewProjection:identity},
  };
}
function documentRef(hidden=true) {
  return {getElementById:id=>id==='scene-controls'?{hidden}:null};
}
function frame() {
  return {frameId:12,activeScreen:'playing',camera:cam,worldClock:0.3,
    nativeScene:metrics.nativeScene,
    projection:{verticalScale:1.58,near:0.045,far:120,aspect:16/9,viewProjection:identity}};
}
function setup(hidden) {
  let permissionCalls=0;
  const canvas={width:1920,height:1080,getContext:()=>({})};
  const doc={...documentRef(hidden),getElementById:id=>id==='scene'?canvas:
    id==='scene-controls'?{hidden}:null};
  const windowRef={
    devicePixelRatio:1,__superhotSceneMetrics:metrics,
    __superhotGetRenderedFrameSnapshot:frame,
    navigator:{mediaDevices:{getDisplayMedia:()=>{permissionCalls++;
      return Promise.reject(new Error('Synthetic permission denied'));}}},
  };
  return {documentRef:doc,windowRef,permissionCalls:()=>permissionCalls};
}

test('candidate requires actual Dojo/build10 source, not source proxy or inactive preview',()=>{
  const verified=requireDojoTabCompositeEvidence(report(),documentRef());
  assert.equal(verified.scene.id,'SHRL_Dojo2');
  assert.equal(verified.sourceVerification,'WEB_SCENE_IDENTITY_ONLY_NOT_NATIVE_EXECUTION');
  assert.deepEqual(verified.viewport,viewport);
  assert.throws(()=>requireDojoTabCompositeEvidence(report(),documentRef(false)),/pre-Start/);
  assert.throws(()=>requireDojoTabCompositeEvidence(
    {...report(),nativeScene:{source:{...source,sceneBuildIndex:28}}},documentRef()),/Dojo2/);
  assert.throws(()=>requireDojoTabCompositeEvidence(
    {...report(),activeScreen:'menu'},documentRef()),/Dojo2/);
  assert.throws(()=>requireDojoTabCompositeEvidence(
    {...report(),mode:'CONTAINERS_COLLIDER_PROXY_NOT_MCD_RUNTIME'},documentRef()),/Dojo2/);
});

test('tab source must be browser only and exactly 1920x1080 without resampling',()=>{
  const track={kind:'video',readyState:'live',getSettings:()=>({displaySurface:'browser'})};
  const video={videoWidth:1920,videoHeight:1080};
  assert.match(requireBrowserTabTrack(track,video,viewport),/SAME_TAB_NOT_MACHINE_VERIFIED/);
  assert.throws(()=>requireBrowserTabTrack({...track,getSettings:()=>({displaySurface:'window'})},video,viewport),/browser tab/);
  assert.throws(()=>requireBrowserTabTrack({...track,readyState:'ended'},video,viewport),/browser tab/);
  assert.throws(()=>requireBrowserTabTrack(track,{videoWidth:1280,videoHeight:720},viewport),/no scaling/);
});

test('preview and wrong expected camera are rejected BEFORE browser media permission',async()=>{
  const preview=setup(false);
  await assert.rejects(captureDojoFullTab({...preview,expectedCamera:cam}),/pre-Start/);
  assert.equal(preview.permissionCalls(),0);
  const ready=setup(true);
  await assert.rejects(captureDojoFullTab({...ready,expectedCamera:{...cam,x:999}}),/differs/);
  assert.equal(ready.permissionCalls(),0);
  await assert.rejects(captureDojoFullTab({...ready,expectedCamera:cam}),/Synthetic permission denied/);
  assert.equal(ready.permissionCalls(),1);
});

test('temporary capture control does not request permission until owner clicks it',()=>{
  let added=null,handler=null;
  const documentRef={
    body:{append:node=>{added=node;}},
    createElement:()=>({
      setAttribute(){},addEventListener:(type,fn)=>{handler={type,fn};},
    }),
  };
  const button=installDojoFullTabCaptureButton({documentRef,windowRef:{},expectedCamera:cam});
  assert.equal(added,button);
  assert.equal(button.type,'button');
  assert.match(button.textContent,/capture privée/);
  assert.equal(handler.type,'click');
  assert.equal(typeof handler.fn,'function');
});
