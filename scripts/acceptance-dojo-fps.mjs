/**
 * SH-10 — opt-in, owner-browser Dojo FPS/GL submission profiler.
 * Samples browser requestAnimationFrame intervals. In-game number-row 7/8/9
 * changes the capture phase and 0 saves, without releasing pointer lock.
 * This is neither a GPU timer
 * nor a human-playthrough success, and no original/native assets are read.
 * Segments are operator-labelled; no benchmark is inferred from mock Node tests.
 */
const SOURCE = Object.freeze({sceneBuildIndex:10,serializedOwner:'level10'});
const LABELS = Object.freeze(['idle','combat','ragdolls']);
const LABEL_SET = new Set(LABELS);
/** Physical number-row keys, intentionally separate from Dojo route markers 1–6. */
export const DOJO_FPS_HOTKEYS = Object.freeze({
  Digit7:'idle', Digit8:'combat', Digit9:'ragdolls', Digit0:'save',
});
const nonneg = n => Number.isSafeInteger(n) && n >= 0;
const positive = n => Number.isFinite(n) && n > 0;
const bounded = (n, cap) => nonneg(n) && n <= cap;
const sourceMatches = s => s?.sceneBuildIndex === SOURCE.sceneBuildIndex &&
  s?.serializedOwner === SOURCE.serializedOwner &&
  /(?:^|[\\/])SHRL_Dojo2\.unity$/i.test(s.scenePath ?? '');
const nearestRank = (sorted, p) => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];

/**
 * @typedef {{label:'idle'|'combat'|'ragdolls', frameIntervalsMs:number[], skippedFrames:number,
 *   drawSamples:{total:number,world:number,ragdolls:number,livingEnemies:number}[]}} DojoFpsSegment
 * @typedef {{schemaVersion:1,captureKind:string,nativeScene:{source:object},
 *   viewport:{width:number,height:number,dpr:number},segments:DojoFpsSegment[]}} DojoFpsTrace
 */

/**
 * Validates an owner-supplied browser trace and derives timing statistics.
 * It cannot authenticate the JSON's origin or establish native/gameplay parity.
 * A complete trace means >=120 rAF deltas each in idle and combat, with exact
 * Dojo source identity. Values are never performance thresholds or a GPU timer.
 * @param {DojoFpsTrace} trace
 * @returns {object}
 */
export function assessDojoFpsCapture(trace) {
  const observations = {};
  const issues = [];
  const report = status => ({status,
    evidence:'UNAUTHENTICATED_OWNER_BROWSER_RAF_INTERVALS',
    sourceNativeExecuted:false, gpuTimestampQueriesPerformed:false,
    browserExecutionIndependentlyVerified:false, nativeParityVerdict:'UNKNOWN',
    observations, issues,
  });
  if (trace?.schemaVersion !== 1 || trace?.captureKind !== 'SH10_DOJO_FPS_BROWSER_V1' ||
      !sourceMatches(trace?.nativeScene?.source) ||
      !bounded(trace?.viewport?.width,16384) || !bounded(trace?.viewport?.height,16384) ||
      !trace.viewport.width || !trace.viewport.height ||
      !positive(trace.viewport.dpr) || trace.viewport.dpr > 8 ||
      !Array.isArray(trace.segments) || trace.segments.length > 12 || !trace.segments.length) {
    issues.push('invalid Dojo source, viewport or bounded performance trace schema');
    return report('WEB_DOJO_FPS_INVALID');
  }
  const gathered = Object.fromEntries(LABELS.map(label => [label,[]]));
  const drawSamples = Object.fromEntries(LABELS.map(label => [label,[]]));
  for (let i=0; i<trace.segments.length; i++) {
    const part = trace.segments[i];
    if (!LABEL_SET.has(part?.label) || !Array.isArray(part.frameIntervalsMs) ||
        part.frameIntervalsMs.length > 20000 ||
        part.frameIntervalsMs.some(n => !positive(n) || n > 60000) ||
        !bounded(part.skippedFrames,200000) ||
        !Array.isArray(part.drawSamples) || part.drawSamples.length > 1200 ||
        part.drawSamples.some(d => !bounded(d?.total,1000000) ||
          !bounded(d.world,1000000) || !bounded(d.ragdolls,10000) ||
          !bounded(d.livingEnemies,10000) || d.world > d.total)) {
      issues.push('invalid intervals/draw samples at segment ' + i);
      return report('WEB_DOJO_FPS_INVALID');
    }
    gathered[part.label].push(...part.frameIntervalsMs);
    drawSamples[part.label].push(...part.drawSamples);
    if (part.skippedFrames) issues.push(part.label + ': ' + part.skippedFrames + ' frames excluded (hidden or inactive)');
  }
  for(const label of LABELS) {
    const values=gathered[label];
    if (!values.length) continue;
    const sorted=[...values].sort((a,b)=>a-b);
    const draws=drawSamples[label];
    const p95=nearestRank(sorted,.95);
    observations[label]={
      frames:values.length,
      p50FrameMs:nearestRank(sorted,.5),p95FrameMs:p95,
      p99FrameMs:nearestRank(sorted,.99),fpsAtP95FrameMs:1000/p95,
      over33MsFrames:values.filter(n=>n>33.333).length,
      over50MsFrames:values.filter(n=>n>50).length,
      over100MsFrames:values.filter(n=>n>100).length,
      appReportedDrawSamples:draws.length,
      maxTotalWebGLDrawCalls:draws.length?Math.max(...draws.map(d=>d.total)):null,
      maxWorldDrawCalls:draws.length?Math.max(...draws.map(d=>d.world)):null,
      maxLiveEnemies:draws.length?Math.max(...draws.map(d=>d.livingEnemies)):null,
      maxActiveRagdolls:draws.length?Math.max(...draws.map(d=>d.ragdolls)):null,
    };
  }
  if(!observations.idle || observations.idle.frames<120 ||
      !observations.combat || observations.combat.frames<120) {
    issues.push('need at least 120 active visible rAF intervals in EACH operator-marked idle and combat phase');
    return report('WEB_DOJO_FPS_INCOMPLETE');
  }
  if (!observations.idle.appReportedDrawSamples || !observations.combat.appReportedDrawSamples) {
    issues.push('app-reported WebGL draw counts missing in idle/combat; frame timing only');
    return report('WEB_DOJO_FPS_INCOMPLETE');
  }
  return report('WEB_DOJO_FPS_SAMPLED_OWNER_MARKED_NOT_GPU_BENCHMARK');
}

/**
 * Start a read-only audit on the REAL browser page, armed after the Dojo starts.
 * The only hot-path operation is recording requestAnimationFrame timestamps.
 * Scene/GL metrics are read at most once per second, not per rendered frame.
 * The opt-in listener ignores key repeats, editable controls and inactive
 * gameplay; stop/save removes it, so it cannot leak into later sessions.
 * @param {{maxFramesPerSegment?:number}} options
 * @returns {{mark:(label:'idle'|'combat'|'ragdolls')=>void,stop:()=>DojoFpsTrace,
 *   save:(filename?:string)=>object}}
 */
export function startDojoFpsCapture({maxFramesPerSegment=20000}={}) {
  if(typeof window==='undefined' || typeof document==='undefined' ||
      typeof window.requestAnimationFrame!=='function' ||
      !Number.isSafeInteger(maxFramesPerSegment) || maxFramesPerSegment<120 ||
      maxFramesPerSegment>20000) throw new Error('browser rAF and bounded frame capacity required');
  const source=window.__superhotGetRenderedFrameSnapshot?.()?.nativeScene?.source;
  if(!sourceMatches(source)) throw new Error('live SHRL_Dojo2/build10 scene required');
  const sceneControls=document.getElementById('scene-controls');
  const hud=document.getElementById('hud');
  if (!sceneControls || !hud) throw new Error('live Dojo UI hooks required');
  const viewport={width:window.innerWidth,height:window.innerHeight,dpr:window.devicePixelRatio};
  const segments=[];
  let active=null, lastTimestamp=null, frameHandle=null, stopped=false, lastDrawAt=-Infinity;
  const playing=()=> !document.hidden && !hud.hidden && sceneControls.hidden &&
    window.__superhotSceneMetrics?.mode==='NATIVE_ORIGINAL_GEOMETRY_WEB_GAMEPLAY';
  const loop=timestamp=>{
    if(stopped)return;
    const ready=playing();
    if(active) {
      if(ready && lastTimestamp!==null) {
        if(active.frameIntervalsMs.length<maxFramesPerSegment) {
          const delta=timestamp-lastTimestamp;
          if(positive(delta)) active.frameIntervalsMs.push(delta);
        } else active.skippedFrames++;
      } else if(!ready) active.skippedFrames++;
      if(ready && timestamp-lastDrawAt>=1000) {
        lastDrawAt=timestamp;
        const m=window.__superhotSceneMetrics;
        const total=m?.totalWebGLDrawCalls,world=m?.generatedManifest?.drawCalls;
        if(nonneg(total)&&nonneg(world)&&world<=total) {
          active.drawSamples.push({total,world,
            ragdolls:nonneg(m.activeRagdolls)?m.activeRagdolls:0,
            livingEnemies:Array.isArray(m.enemies)?m.enemies.filter(e=>e?.alive===true).length:0});
        }
      }
    }
    lastTimestamp=ready?timestamp:null;
    frameHandle=window.requestAnimationFrame(loop);
  };
  frameHandle=window.requestAnimationFrame(loop);
  const stop=()=>{
    if(!stopped) {
      stopped=true;
      window.cancelAnimationFrame(frameHandle);
      document.removeEventListener('keydown',onCaptureHotkey,true);
    }
    return {schemaVersion:1,captureKind:'SH10_DOJO_FPS_BROWSER_V1',
      nativeScene:{source:{sceneBuildIndex:source.sceneBuildIndex,
        scenePath:source.scenePath,serializedOwner:source.serializedOwner}},
      viewport,segments:segments.map(s=>({...s,
        frameIntervalsMs:[...s.frameIntervalsMs],drawSamples:s.drawSamples.map(d=>({...d}))}))};
  };
  const mark=label=>{
    if(stopped)throw new Error('Dojo FPS profiler already stopped');
    if(!LABEL_SET.has(label))throw new RangeError('unknown FPS segment label');
    if(segments.length>=12)throw new RangeError('maximum 12 segments');
    // A new phase never inherits an interval straddling the hotkey boundary.
    active={label,frameIntervalsMs:[],drawSamples:[],skippedFrames:0};
    segments.push(active);
    lastTimestamp=null;lastDrawAt=-Infinity;
  };
  const save=(filename='dojo-fps.json')=>{
    if(typeof filename!=='string'||!/^dojo-[a-z0-9_-]+\.json$/i.test(filename))
      throw new TypeError('filename must be dojo-*.json');
    const trace=stop();
    const blob=new Blob([JSON.stringify(trace)],{type:'application/json'});
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=filename;link.click();
    window.setTimeout(()=>URL.revokeObjectURL(url),5000);
    return {requestedDownload:true,segments:trace.segments.length,
      status:assessDojoFpsCapture(trace).status};
  };
  const onCaptureHotkey=event=>{
    if(stopped || event.repeat || event.isComposing || !playing()) return;
    const action=DOJO_FPS_HOTKEYS[event.code];
    if(!action || event.target?.isContentEditable ||
        ['INPUT','SELECT','TEXTAREA'].includes(event.target?.tagName)) return;
    // Do not turn held keys into dozens of segments or intercept game inputs.
    // Key 0 downloads under a genuine user gesture; no network upload.
    if(action!=='save' && segments.length>=12) return;
    event.preventDefault();
    if(action==='save') save();
    else mark(action);
  };
  document.addEventListener('keydown',onCaptureHotkey,true);
  return Object.freeze({mark,stop,save});
}
