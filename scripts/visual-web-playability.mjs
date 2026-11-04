/**
 * SH-15 / FRAME//BREAK — opt-in visual QA for the ACTUAL Web Dojo.
 * Browser-only: reads the rendered-frame receipt and on-screen DOM boxes.
 * Never reads MCD, guesses VRAM, modifies gameplay or uploads anything.
 *
 * On GitHub Pages DevTools:
 * const { installWebVisualQa } = await import('./scripts/visual-web-playability.mjs');
 * const qa = installWebVisualQa();  // qa.stop() removes all diagnostics.
 */

/** @typedef {{id:string,left:number,top:number,width:number,height:number,textBounds?:{left:number,top:number,width:number,height:number}}} VisibleBox */
const BANNERS = ['stage-banner', 'chain-banner', 'dodge-banner', 'pickup-prompt'];
// Static controls paint after #pickup-prompt inside #hud; unlike feedback
// collisions, a geometric overlap matters only when the PROMPT TEXT is hit.
const HUD_OCCLUDERS = ['hint-bar'];
const INTERSECTION_FRACTION = 0.12;

function boxIntersectionFraction(a, b) {
  const width = Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
  const smaller = Math.min(a.width * a.height, b.width * b.height);
  return smaller > 0 ? width * height / smaller : 0;
}

/**
 * A nowrap label can paint past the narrower CSS box. For overlap checks,
 * include the measured DOM Range ink, not just the background rectangle.
 */
function paintedBounds(box) {
  const ink=box.textBounds;
  const hasInk=ink && [ink.left,ink.top,ink.width,ink.height].every(Number.isFinite) &&
    ink.width>0 && ink.height>0;
  if (!hasInk) return box;
  const left=Math.min(box.left,ink.left), top=Math.min(box.top,ink.top);
  return {
    left, top,
    width:Math.max(box.left+box.width,ink.left+ink.width)-left,
    height:Math.max(box.top+box.height,ink.top+ink.height)-top,
  };
}

/**
 * Evaluates actual Web frame counters and DOM rectangle collisions.
 * No RGB or VRAM measurements: WebGL does not expose total allocated VRAM.
 * 33.3ms is an explicitly WEB-authored 30 FPS readability warning, not MCD.
 * @param {{frame:object|null, metrics:object|null, boxes:VisibleBox[], width:number,
 *   height:number, frameBudgetMs?:number, combatStarted?:boolean}} observation
 */
export function assessWebVisualReadability({
  frame, metrics, boxes = [], width, height, frameBudgetMs = 33.3, combatStarted = true,
}) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 ||
      !Number.isFinite(frameBudgetMs) || frameBudgetMs <= 0 ||
      !Array.isArray(boxes)) throw new TypeError('Valid Web viewport and visible DOM boxes required');
  const playing = frame?.activeScreen === 'playing' && combatStarted === true;
  const scene = frame?.nativeScene?.source;
  const path = String(scene?.scenePath ?? '').replaceAll('\\', '/');
  const dojo = scene?.sceneBuildIndex === 10 && path.endsWith('/SHRL_Dojo2.unity');
  const warnings = [];
  if (!dojo) warnings.push({kind:'scene',detail:'Dojo/build10 not confirmed in rendered Web receipt'});
  if (frame?.activeScreen !== 'playing') warnings.push({kind:'screen',detail:'Game is not in playing state'});
  else if (!combatStarted) warnings.push({kind:'start',detail:'Dojo preview is visible, but combat was not started on the canvas'});
  const drawCalls = Number.isSafeInteger(frame?.totalWebGLDrawCalls) && frame.totalWebGLDrawCalls >= 0
    ? frame.totalWebGLDrawCalls : null;
  const p95FrameMs = Number.isFinite(metrics?.p95FrameMs) && metrics.p95FrameMs >= 0
    ? metrics.p95FrameMs : null;
  if (playing && dojo && p95FrameMs !== null && p95FrameMs > frameBudgetMs) {
    warnings.push({kind:'frametime',detail:'Measured p95 Web frame time exceeds QA budget'});
  }

  // These banners must remain independently legible. Crosshair, hit marker,
  // and HUD hearts are intentionally excluded from this collision test.
  const visible = boxes.filter(box => BANNERS.includes(box.id) &&
    [box.left,box.top,box.width,box.height].every(Number.isFinite) &&
    box.width > 0 && box.height > 0);
  for (const box of visible) {
    // getBoundingClientRect() only measures the CSS banner box. On a narrow
    // viewport, the white-space:nowrap chain label can paint OUTSIDE that box.
    // Range bounds measure its actual laid-out text, not a guessed font width.
    const text = box.textBounds;
    const hasTextBounds = text && [text.left,text.top,text.width,text.height].every(Number.isFinite) &&
      text.width > 0 && text.height > 0;
    const ink = hasTextBounds ? text : box;
    const left = Math.min(box.left, ink.left), top = Math.min(box.top, ink.top);
    const right = Math.max(box.left + box.width, ink.left + ink.width);
    const bottom = Math.max(box.top + box.height, ink.top + ink.height);
    const insideWidth = Math.max(0, Math.min(width, right) - Math.max(0, left));
    const insideHeight = Math.max(0, Math.min(height, bottom) - Math.max(0, top));
    const clippedInk = hasTextBounds && (
      ink.left < -2 || ink.top < -2 || ink.left + ink.width > width + 2 ||
      ink.top + ink.height > height + 2);
    if (insideWidth * insideHeight < (right-left) * (bottom-top) * 0.9 || clippedInk) {
      warnings.push({kind:'clipped-banner',ids:[box.id],
        detail:'Feedback banner or its rendered text extends outside viewport'});
    } else if (hasTextBounds && (
      ink.left < box.left - 2 || ink.top < box.top - 2 ||
      ink.left + ink.width > box.left + box.width + 2 ||
      ink.top + ink.height > box.top + box.height + 2)) {
      warnings.push({kind:'text-outside-banner',ids:[box.id],
        detail:'Rendered feedback text extends beyond its own readable background'});
    }
  }
  // #hint-bar is later in the DOM than #pickup-prompt and its translucent
  // background can obscure the E instruction in short browser viewports.
  // Test ink bounds rather than just backgrounds to avoid false alarms when
  // only the empty edges of the two elements intersect. This is a geometric
  // risk, NOT a screenshot/pixel occlusion measurement.
  const pickup = visible.find(box => box.id === 'pickup-prompt');
  const hint = boxes.find(box => box.id === 'hint-bar' &&
    [box.left,box.top,box.width,box.height].every(Number.isFinite) &&
    box.width > 0 && box.height > 0);
  if (pickup?.textBounds && hint) {
    const fraction = boxIntersectionFraction(pickup.textBounds, hint);
    if (fraction >= INTERSECTION_FRACTION) {
      warnings.push({kind:'pickup-text-in-controls',ids:['pickup-prompt','hint-bar'],
        overlapFraction:Math.round(fraction*1000)/1000,
        detail:'Pickup text intersects the later-painted control strip (geometric occlusion risk)'});
    }
  }
  for (let i = 0; i < visible.length; i++) for (let j = i + 1; j < visible.length; j++) {
    const a = visible[i], b = visible[j];
    if (a.id === b.id) continue;
    const fraction = boxIntersectionFraction(paintedBounds(a), paintedBounds(b));
    if (fraction >= INTERSECTION_FRACTION) {
      warnings.push({kind:'overlapping-feedback',ids:[a.id,b.id],
        overlapFraction:Math.round(fraction*1000)/1000,
        detail:'Two independently important feedback labels visibly overlap'});
    }
  }
  return {
    state: playing && dojo ? 'WEB_DOJO_VISIBLE_QA_NOT_BROWSER_VERIFIED' :
      frame?.activeScreen === 'playing' && !combatStarted ? 'WEB_PREVIEW_NOT_STARTED' : 'WEB_FRAME_NOT_READY',
    frameId: Number.isSafeInteger(frame?.frameId) ? frame.frameId : null,
    drawCalls, p95FrameMs, fpsAtP95: p95FrameMs > 0 ? 1000 / p95FrameMs : null,
    frameBudgetMs, overlayBoxesInspected: visible.length, warnings,
    vramBytes: null, vramStatus:'NOT_EXPOSED_BY_WEBGL2',
    browserScreenshotInspected:false,
  };
}

function readVisibleBoxes(windowRef, documentRef) {
  const boxes=[];
  for (const id of [...BANNERS,...HUD_OCCLUDERS]) {
    const element=documentRef.getElementById(id);
    if (!element || element.hidden) continue;
    const css=windowRef.getComputedStyle(element);
    if (css.display === 'none' || css.visibility === 'hidden' || Number(css.opacity) < 0.1) continue;
    const rect=element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const box={id,left:rect.left,top:rect.top,width:rect.width,height:rect.height};
      if (id !== 'hint-bar' && typeof documentRef.createRange === 'function' && element.textContent?.trim()) {
        const range=documentRef.createRange();
        range.selectNodeContents(element);
        const ink=range.getBoundingClientRect();
        if ([ink.left,ink.top,ink.width,ink.height].every(Number.isFinite) &&
            ink.width > 0 && ink.height > 0) {
          box.textBounds={left:ink.left,top:ink.top,width:ink.width,height:ink.height};
        }
      }
      boxes.push(box);
    }
  }
  return boxes;
}

/**
 * Installs an opt-in Web QA panel. Brief combat banners can disappear between
 * 1s metrics updates; sample their real DOM bounds more frequently while
 * keeping the readable panel update at 1Hz. No GPU readback or gameplay writes.
 *
 * transientWarnings counts samples (NOT distinct gameplay occurrences);
 * only warnings observed after the actual Dojo START boundary are retained.
 */
export function installWebVisualQa({
  windowRef=globalThis.window, documentRef=globalThis.document,
  refreshMs=1000, sampleMs=100, frameBudgetMs=33.3,
} = {}) {
  if (!windowRef || !documentRef?.body ||
      typeof windowRef.__superhotGetRenderedFrameSnapshot !== 'function' ||
      !Number.isFinite(refreshMs) || refreshMs < 500 ||
      !Number.isFinite(sampleMs) || sampleMs < 50 || sampleMs > refreshMs) {
    throw new Error('Live Dojo browser getter, refresh >=500ms and 50ms <= sample <= refresh required');
  }
  const panel=documentRef.createElement('aside');
  panel.setAttribute('aria-label','Web Dojo visual QA diagnostics');
  panel.style.cssText='position:fixed;right:8px;bottom:8px;z-index:2147483646;max-width:min(330px,75vw);padding:9px 12px;background:rgba(15,20,27,.93);color:#fff;border-left:4px solid #27c5de;font:12px/1.4 ui-monospace,monospace;white-space:pre-wrap;pointer-events:none;box-shadow:0 2px 12px #0006';
  documentRef.body.append(panel);
  let stopped=false, lastReport=null;
  const transient=new Map();
  let observedSamples=0;
  const sample=()=>{
    if(stopped)return;
    try {
      const frame=windowRef.__superhotGetRenderedFrameSnapshot();
      const current=assessWebVisualReadability({
        frame, metrics:windowRef.__superhotSceneMetrics,
        boxes:readVisibleBoxes(windowRef,documentRef),
        width:windowRef.innerWidth,height:windowRef.innerHeight,frameBudgetMs,
        // main.js sets this only after intentional START (or first canvas click).
        // activeScreen remains 'playing' during preview; do not count those DOM
        // frames as combat evidence, especially after input gating in #374.
        combatStarted: documentRef.getElementById('scene-controls')?.hidden === true,
      });
      if(current.state==='WEB_DOJO_VISIBLE_QA_NOT_BROWSER_VERIFIED') {
        observedSamples++;
        for(const w of current.warnings) {
          if(w.kind!=='overlapping-feedback' && w.kind!=='clipped-banner' &&
             w.kind!=='text-outside-banner' && w.kind!=='pickup-text-in-controls')continue;
          const key=w.kind+':'+w.ids.join('/');
          const previous=transient.get(key);
          transient.set(key,{
            kind:w.kind,ids:w.ids,
            samplesWithWarning:(previous?.samplesWithWarning??0)+1,
            peakOverlapFraction:Math.max(previous?.peakOverlapFraction??0,w.overlapFraction??0),
            firstFrameId:previous?.firstFrameId??current.frameId,
            lastFrameId:current.frameId,
          });
        }
      }
      const transientWarnings=[...transient.values()].sort(
        (a,b)=>b.samplesWithWarning-a.samplesWithWarning
          || b.peakOverlapFraction-a.peakOverlapFraction
      );
      lastReport={...current,observedSamples,transientWarnings};
    } catch(error) {
      panel.textContent='WEB QA ERROR: '+error.message;
    }
  };
  const render=()=>{
    if(stopped || !lastReport)return;
    const m=lastReport;
    const warn=m.warnings.filter(w=>w.kind!=='overlapping-feedback' && w.kind!=='clipped-banner')
      .slice(0,2).map(w=>'! '+w.kind);
    const seen=m.transientWarnings.slice(0,3).map(w=>
      '! '+w.kind+' '+w.ids.join('/')+' · '+w.samplesWithWarning+' samples'
    );
    panel.style.borderLeftColor=m.warnings.length || m.transientWarnings.length?'#ff506a':'#27c5de';
    panel.textContent=[
      'WEB DOJO · LIVE QA (opt-in)',
      'frame '+(m.frameId??'?')+' · draws '+(m.drawCalls??'?')+
        ' · p95 '+(m.p95FrameMs?.toFixed(1)??'?')+'ms',
      m.state==='WEB_PREVIEW_NOT_STARTED'?'Preview · click canvas to start':
        m.state==='WEB_FRAME_NOT_READY'?'Not started / wrong scene':'Web scene ready',
      ...warn, ...seen,
      'VRAM not measurable via WebGL2',
    ].join('\n');
  };
  sample();
  render();
  const sampleTimer=windowRef.setInterval(sample,sampleMs);
  const renderTimer=windowRef.setInterval(render,refreshMs);
  return Object.freeze({
    getReport:()=>lastReport && structuredClone(lastReport),
    stop:()=>{
      if(stopped)return;
      stopped=true;
      windowRef.clearInterval(sampleTimer);
      windowRef.clearInterval(renderTimer);
      panel.remove();
    },
  });
}
