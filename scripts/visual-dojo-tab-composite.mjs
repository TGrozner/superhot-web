/**
 * SH-15: opt-in, PRIVATE full-tab DOM + WebGL composite screenshot for Dojo.
 *
 * Must be invoked by a user click. The user must choose this browser TAB in
 * Chrome/Edge's capture chooser. There is no upload, fetch, telemetry, or
 * native/game execution. A tab capture is NOT synchronized with WebGL or MCD.
 * The receipt intentionally cannot be used as a 1:1 native comparison.
 */
import {
  requireContainersWebEvidence, requireDojoStartedVisualFrame,
  embedWebCaptureMetadata,
} from './visual-web-capture.mjs';

const TARGET = 'SHRL_Dojo2.unity';

function fail(message) { throw new Error('SH-15 tab composite: ' + message); }

export function requireDojoTabCompositeEvidence(report, documentRef) {
  const source = report?.nativeScene?.source;
  if (report?.mode !== 'NATIVE_ORIGINAL_GEOMETRY_WEB_GAMEPLAY' ||
      report?.activeScreen !== 'playing' ||
      source?.sceneBuildIndex !== 10 ||
      source?.serializedOwner !== 'level10' ||
      !String(source?.scenePath ?? '').replaceAll('\\', '/').endsWith('/' + TARGET)) {
    fail('Need measured, started SHRL_Dojo2/build10, not a generated preview');
  }
  requireDojoStartedVisualFrame(documentRef, report, 'playing');
  return {
    scene: {id:'SHRL_Dojo2',buildIndex:10,serializedOwner:'level10'},
    viewport: [...report.viewport],
    frameId: report.frameId,
    camera: report.camera,
    projection: report.projection,
    worldClock: report.worldClock,
    sourceVerification: 'WEB_SCENE_IDENTITY_ONLY_NOT_NATIVE_EXECUTION',
  };
}

export function requireBrowserTabTrack(track, video, viewport) {
  if (!track || track.kind !== 'video' || track.readyState !== 'live' ||
      typeof track.getSettings !== 'function' ||
      track.getSettings().displaySurface !== 'browser') {
    fail('Choose a browser tab, not a window or desktop');
  }
  if (!Array.isArray(viewport) || video?.videoWidth !== viewport[0] ||
      video?.videoHeight !== viewport[1]) {
    fail('Tab video differs from exact WebGL viewport: no scaling permitted');
  }
  // Browsers cannot attest which tab the user selected. Same-sized other tabs
  // are still possible; the operator must examine the PRIVATE saved PNG.
  return 'USER_SELECTED_BROWSER_TAB_SAME_TAB_NOT_MACHINE_VERIFIED';
}

function liveSnapshot(windowRef, documentRef, canvas, expectedCamera) {
  const getter = windowRef.__superhotGetRenderedFrameSnapshot;
  if (typeof getter !== 'function') fail('Rendered frame getter unavailable');
  const report = requireContainersWebEvidence({
    metrics: windowRef.__superhotSceneMetrics,
    frame: getter(), expectedCamera, expectedScreen:'playing',
    width:canvas.width, height:canvas.height,
    dpr:windowRef.devicePixelRatio, strictViewport:true,
  });
  return requireDojoTabCompositeEvidence(report, documentRef);
}

function freshVideoFrame(video, windowRef) {
  if (typeof video.requestVideoFrameCallback !== 'function') {
    fail('Browser requestVideoFrameCallback required: cannot sample a stale tab video');
  }
  return new Promise((resolve, reject) => {
    const timer=windowRef.setTimeout(() => reject(new Error('Tab capture produced no video frame')), 5000);
    video.requestVideoFrameCallback((_now, info) => {
      windowRef.clearTimeout(timer);
      resolve({presentedFrames:info.presentedFrames,mediaTime:info.mediaTime});
    });
  });
}
function imageBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(
    blob => blob && blob.type === 'image/png' ? resolve(blob) :
      reject(new Error('Private browser composite PNG encoding failed')), 'image/png'));
}
const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,'0')).join('');

/**
 * Permission and chooser are user-initiated. Call only from a trusted click.
 * Returns receipt metadata; the PNG itself is downloaded locally when enabled.
 * Does NOT promise screenshot/DOM/GPU/native same-frame synchronization.
 */
export async function captureDojoFullTab({
  windowRef=globalThis.window, documentRef=globalThis.document,
  expectedCamera, webCommit=null, download=true,
} = {}) {
  if (!windowRef || !documentRef) fail('A real browser is required');
  const canvas=documentRef.getElementById('scene');
  if (!canvas || typeof canvas.getContext !== 'function') fail('WebGL canvas missing');
  const before=liveSnapshot(windowRef, documentRef, canvas, expectedCamera);
  if (webCommit !== null && !/^[0-9a-f]{7,40}$/i.test(webCommit)) fail('Invalid Web commit');
  const media=windowRef.navigator?.mediaDevices;
  if (typeof media?.getDisplayMedia !== 'function') fail('Browser tab capture unavailable');
  // getDisplayMedia MUST be the first async browser permission action from the
  // user's click, not a background browser or automation request.
  const stream=await media.getDisplayMedia({
    video:{displaySurface:'browser'},audio:false,preferCurrentTab:true,
  });
  const video=documentRef.createElement('video');
  const track=stream.getVideoTracks()[0];
  try {
    // Browser tab surface identity cannot be inspected by JavaScript.
    if (track?.getSettings?.().displaySurface !== 'browser') {
      fail('User must select a browser tab');
    }
    video.srcObject=stream;
    video.muted=true;
    video.playsInline=true;
    await video.play();
    // First decoded frame may contain the browser chooser. Sample the next one.
    await freshVideoFrame(video,windowRef);
    const compositedFrame=await freshVideoFrame(video,windowRef);
    const provenance=requireBrowserTabTrack(track,video,before.viewport);
    const frameCanvas=documentRef.createElement('canvas');
    frameCanvas.width=before.viewport[0];frameCanvas.height=before.viewport[1];
    const ctx=frameCanvas.getContext('2d',{alpha:false});
    if (!ctx || typeof ctx.drawImage !== 'function') fail('Canvas2D video frame copying unavailable');
    // No compositor approximation: copied from the browser TAB capture video.
    ctx.drawImage(video,0,0,frameCanvas.width,frameCanvas.height);
    const after=liveSnapshot(windowRef,documentRef,canvas,expectedCamera);
    if (after.scene.id!==before.scene.id || after.frameId<before.frameId ||
        after.viewport.some((v,i)=>v!==before.viewport[i])) {
      fail('Scene identity or viewport changed while recording browser tab');
    }
    const raw=new Uint8Array(await (await imageBlob(frameCanvas)).arrayBuffer());
    const sha=hex(await windowRef.crypto.subtle.digest('SHA-256',raw));
    const metadata={
      schemaVersion:1,origin:'web',status:'WEB_ONLY_CAPTURE_NATIVE_PAIR_MISSING',
      captureMethod:'BROWSER_GET_DISPLAY_MEDIA_USER_SELECTED_TAB_COMPOSITE',
      capturedAt:new Date().toISOString(),webCommit:webCommit??'UNRECORDED',
      scene:before.scene,viewport:before.viewport,
      initialFrameId:before.frameId,finalFrameId:after.frameId,
      worldClockStart:before.worldClock,worldClockEnd:after.worldClock,
      camera:before.camera,projection:before.projection,
      browserTabSelection:provenance,videoFrame:compositedFrame,
      rawCompositePngSha256:sha,
      webglCanvasIncludesDomOverlay:false,
      browserTabVideoIncludesDomPotentially:true,
      sameTabVerified:false,nativeCameraMatched:false,
      nativeWorldPoseMatched:false,compositeSyncedToWebGLFrame:false,
      nativeWebPairVerifiedOneToOne:false,
      limitations:[
        'Operator must privately inspect PNG and verify the selected tab was this Dojo tab',
        'Screen capture video can lag the WebGL scene; frame IDs only bound app state',
        'Browser tab video color conversion and display scaling not independently certified',
        'Never compare this composite against WebGL-only MCD PNG for RGB/IoU',
        'No observed executed native MCD frame; no 1:1 parity assessment',
      ],
    };
    const png=embedWebCaptureMetadata(raw,metadata);
    if (download) {
      const objectUrl=windowRef.URL.createObjectURL(new Blob([png],{type:'image/png'}));
      try {
        const anchor=documentRef.createElement('a');
        anchor.href=objectUrl;
        anchor.download='dojo-web-tab-composite-'+metadata.capturedAt.replace(/[:.]/g,'-')+'.png';
        documentRef.body.append(anchor);anchor.click();anchor.remove();
      } finally {
        windowRef.setTimeout(()=>windowRef.URL.revokeObjectURL(objectUrl),60000);
      }
    }
    return {
      status:metadata.status,captureMethod:metadata.captureMethod,
      scene:metadata.scene,viewport:metadata.viewport,
      initialFrameId:before.frameId,finalFrameId:after.frameId,
      rawCompositePngSha256:sha,screenshotBytes:png.length,
      compositeSyncedToWebGLFrame:false,
      nativeWebPairVerifiedOneToOne:false,
      sameTabVerified:false,
    };
  } finally {
    for (const t of stream.getTracks()) t.stop();
    video.srcObject=null;
  }
}

/**
 * Temporary owner-local button; browser permissions cannot be obtained by
 * an unattended Node/CI script. Removes itself on successful local capture.
 */
export function installDojoFullTabCaptureButton({
  windowRef=globalThis.window,documentRef=globalThis.document,
  expectedCamera,webCommit=null,
} = {}) {
  if (!documentRef?.body) fail('Browser DOM required');
  const button=documentRef.createElement('button');
  button.textContent='SH-15 — capture privée de cet onglet';
  button.type='button';
  button.setAttribute('aria-label','Capture privée Dojo, choisir cet onglet');
  documentRef.body.append(button);
  button.addEventListener('click',() => {
    button.hidden=true;
    captureDojoFullTab({windowRef,documentRef,expectedCamera,webCommit})
      .then(receipt=>{button.remove();windowRef.console?.info?.('SH-15 local composite receipt',receipt);})
      .catch(error=>{button.hidden=false;windowRef.console?.error?.('SH-15 tab capture',error);});
  });
  return button;
}
