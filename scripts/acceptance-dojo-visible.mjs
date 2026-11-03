/**
 * SH-10 — actual Web-frame visual integration receipts for Dojo/build10.
 * No screenshots, original native pixels, binary assets or decompiled code.
 * A green report means Web metrics were sampled, never native visual parity.
 */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const DOJO_VISIBLE_STATUS=Object.freeze({
  OBSERVED:'WEB_RENDERED_VISUAL_HOOKS_SAMPLED_NOT_NATIVE_PARITY',
  GAP:'WEB_DOJO_WARNING_ACTIVE_WITHOUT_RENDERED_SPOTLIGHT',
  INCOMPLETE:'WEB_RENDERED_VISUAL_HOOKS_NOT_OBSERVED',
  INVALID:'WEB_RENDERED_VISUAL_HOOKS_INVALID',
});

const count=x=>Number.isSafeInteger(x)&&x>=0;
const dojo=f=>f?.nativeScene?.source?.sceneBuildIndex===10 &&
  f.nativeScene.source.serializedOwner==='level10' &&
  /(?:^|[\\/])SHRL_Dojo2\.unity$/i.test(f.nativeScene.source.scenePath??'');
const visualFields=['worldDrawCalls','handsDrawCalls','handsTriangles',
  'warningActiveEnvelopes','warningRenderedSpotlights'];
const boolFields=['handsSourcePoseSampled','katanaSocketApplied'];
const warningValues=new Set([
  'not-loaded','source-warning-catalog-rejected','triggered',
  'missing-verified-spawn-go','spawn-go-not-bound-in-source',
  'source-door-not-in-private-catalog','source-controller-rejected',
  'missing-private-door-catalog','not-dojo-build10-source',
]);
const readinessValues=new Set([
  'source-catalog-present','missing-private-door-catalog',
  'not-dojo-build10-source','unavailable',
]);

/** Diagnose one real, owner-supplied Web trace without asserting a native comparison. */
export function assessDojoVisibleIntegrations(trace) {
  const issues=[];
  const observed={
    sampledPlayingFrames:0,worldMeshDrawFrames:0,
    handsDrawnFrames:0,handsSourcePoseFrames:0,katanaSocketFrames:0,
    warningCatalogReadyFrames:0,warningTriggeredStatusFrames:0,
    warningActiveFrames:0,warningSpotlightFrames:0,
    warningActiveWithoutSpotlightFrames:0,
    firstWarningGapFrameId:null,maxHandsTriangles:0,
  };
  const report=status=>({
    status,source:'OWNER_SUPPLIED_WEB_FRAME_METADATA_UNAUTHENTICATED',
    ...{nativeReferenceMatched:false,pixelComparisonPerformed:false,nativeParityVerdict:'UNKNOWN'},
    observed,issues,
  });
  if(trace?.schemaVersion!==2 ||
     trace?.captureKind!=='SH10_DOJO_OWNER_BROWSER_V2' ||
     !Array.isArray(trace.frames) || !trace.frames.length || trace.frames.length>50000) {
    issues.push('invalid bounded Dojo browser trace schema');
    return report(DOJO_VISIBLE_STATUS.INVALID);
  }
  let last=-1,hasVisual=false;
  for(let i=0;i<trace.frames.length;i++) {
    const frame=trace.frames[i];
    if(!Number.isSafeInteger(frame?.frameId)||frame.frameId<=last||!dojo(frame)) {
      issues.push('invalid source/chronology at sample '+i);
      return report(DOJO_VISIBLE_STATUS.INVALID);
    }
    last=frame.frameId;
    const v=frame.gameplay?.visual;
    if(v==null) continue; // Older owner recorder: absent, never inferred as zero.
    if(typeof v!=='object'||Array.isArray(v) ||
      visualFields.some(key=>v[key]!=null&&!count(v[key])) ||
      boolFields.some(key=>v[key]!=null&&typeof v[key]!=='boolean') ||
      (v.warningReadiness!=null&&!readinessValues.has(v.warningReadiness)) ||
      (v.warningEventStatus!=null&&!warningValues.has(v.warningEventStatus))) {
      issues.push('invalid bounded visual metadata at frame '+frame.frameId);
      return report(DOJO_VISIBLE_STATUS.INVALID);
    }
    if(frame.activeScreen!=='playing') continue;
    hasVisual=true;
    observed.sampledPlayingFrames++;
    if(v.worldDrawCalls>0) observed.worldMeshDrawFrames++;
    if(v.handsDrawCalls>0) observed.handsDrawnFrames++;
    if(v.handsSourcePoseSampled===true&&v.handsDrawCalls>0) observed.handsSourcePoseFrames++;
    if(v.katanaSocketApplied===true&&v.handsDrawCalls>0) observed.katanaSocketFrames++;
    if(count(v.handsTriangles)) observed.maxHandsTriangles=Math.max(
      observed.maxHandsTriangles,v.handsTriangles);
    if(v.warningReadiness==='source-catalog-present') observed.warningCatalogReadyFrames++;
    if(v.warningEventStatus==='triggered') observed.warningTriggeredStatusFrames++;
    if(v.warningActiveEnvelopes>0) {
      observed.warningActiveFrames++;
      if(v.warningRenderedSpotlights===0) {
        observed.warningActiveWithoutSpotlightFrames++;
        observed.firstWarningGapFrameId??=frame.frameId;
      }
    }
    if(v.warningRenderedSpotlights>0) observed.warningSpotlightFrames++;
  }
  if(!hasVisual||!observed.worldMeshDrawFrames) {
    issues.push('no playing frame with Dojo native-world GPU draw receipt');
    return report(DOJO_VISIBLE_STATUS.INCOMPLETE);
  }
  if(observed.warningActiveWithoutSpotlightFrames) {
    issues.push('source warning envelope active while Web reports zero spotlight draws; source cookie/world transform may still be missing');
    return report(DOJO_VISIBLE_STATUS.GAP);
  }
  if(!observed.handsDrawnFrames) {
    issues.push('hands/katana draw not witnessed; the captured run may have used only a pistol');
  }
  if(!observed.warningActiveFrames) {
    issues.push('door warning not active in sampled frames; no lighting verdict');
  }
  return report(DOJO_VISIBLE_STATUS.OBSERVED);
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const index=process.argv.indexOf('--trace');
  if(index<0||!process.argv[index+1]) {
    process.stderr.write('Usage: node scripts/acceptance-dojo-visible.mjs --trace private/dojo-full-run.json\n');
    process.exitCode=2;
  } else try {
    const report=assessDojoVisibleIntegrations(JSON.parse(readFileSync(process.argv[index+1],'utf8')));
    process.stdout.write(JSON.stringify(report,null,2)+'\n');
    if(report.status===DOJO_VISIBLE_STATUS.GAP) process.exitCode=1;
    else if(report.status!==DOJO_VISIBLE_STATUS.OBSERVED) process.exitCode=2;
  } catch(error) {
    process.stderr.write('Dojo visible integration report unavailable: '+error.message+'\n');
    process.exitCode=2;
  }
}
