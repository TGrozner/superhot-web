/**
 * SH-10: reject screenshot comparisons contaminated by DOM UI or CSS/GPU scaling.
 * This examines browser-observed geometry, not MCD/native pixels or a GPU readback.
 */
export const CANVAS_CAPTURE_SURFACE = 'GAMEPLAY_ONLY_NO_UI';
export const WEB_CANVAS_SURFACE_STATUS = 'WEB_BROWSER_REPORTED_CANVAS_ONLY_NOT_NATIVE_PARITY';

const positiveInteger = value => Number.isSafeInteger(value) && value > 0;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const samePixelDimension = (actual, expected) => finite(actual) && Math.abs(actual - expected) < 1e-3;

/** The optional PNG dimensions come from actual decoded screenshot bytes. */
export function canvasCaptureSurfaceEvidence(state, image = null) {
  const reasons = [];
  const viewport = state?.viewport;
  const rect = state?.rect;
  const gl = state?.gl;
  const page = state?.page;
  const ui = state?.uiIsolation;
  const w = viewport?.width, h = viewport?.height;
  if (!positiveInteger(w) || !positiveInteger(h) || viewport?.dpr !== 1)
    reasons.push('WEB_CANVAS_PIXEL_VIEWPORT_UNKNOWN');
  if (!positiveInteger(gl?.drawingBufferWidth) || !positiveInteger(gl?.drawingBufferHeight) ||
      gl.drawingBufferWidth !== w || gl.drawingBufferHeight !== h)
    reasons.push('WEB_GL_DRAWING_BUFFER_MISMATCH');
  if (!Array.isArray(gl?.viewport) || gl.viewport.length !== 4 ||
      !gl.viewport.every(Number.isSafeInteger) ||
      gl.viewport[0] !== 0 || gl.viewport[1] !== 0 ||
      gl.viewport[2] !== w || gl.viewport[3] !== h)
    reasons.push('WEB_GL_VIEWPORT_MISMATCH');
  if (![rect?.x, rect?.y, rect?.width, rect?.height].every(finite) ||
      rect.width <= 0 || rect.height <= 0 ||
      !samePixelDimension(rect.width, w) || !samePixelDimension(rect.height, h) ||
      rect.x < 0 || rect.y < 0 ||
      !positiveInteger(page?.innerWidth) || !positiveInteger(page?.innerHeight) ||
      rect.x + rect.width > page.innerWidth + 1e-3 ||
      rect.y + rect.height > page.innerHeight + 1e-3 ||
      page.visualScale !== 1 || state?.cssTransform !== 'none')
    reasons.push('WEB_CANVAS_CSS_CAPTURE_GEOMETRY_MISMATCH');
  if (ui?.mode !== 'UI_SIBLINGS_VISIBILITY_HIDDEN' ||
      !positiveInteger(ui.layerCount) || ui.hiddenLayers !== ui.layerCount ||
      ui.canvasVisible !== true)
    reasons.push('WEB_DOM_OVERLAY_CONTAMINATION_UNVERIFIED');
  if (image !== null && (!positiveInteger(image?.width) || !positiveInteger(image?.height) ||
      image.width !== w || image.height !== h))
    reasons.push('WEB_SCREENSHOT_PIXEL_DIMENSIONS_MISMATCH');
  return {
    status: reasons.length ? 'WEB_CANVAS_CAPTURE_UNVERIFIED' : WEB_CANVAS_SURFACE_STATUS,
    nativeParityCertified: false, independentGpuReadback: false, reasons,
  };
}

/** CDP-only page expressions. They never change the repository or runtime modules. */
export const beginCanvasOnlyIsolationExpression = `(() => {
  const canvas = document.getElementById('scene');
  const shell = document.getElementById('game-shell');
  if (!canvas || !shell || canvas.parentElement !== shell ||
      window.__sh10RestoreCanvasSiblings) return {ok:false,reason:'CANVAS_STRUCTURE_UNVERIFIED'};
  const layers = Array.from(shell.children).filter(el => el !== canvas);
  if (!layers.length) return {ok:false,reason:'CANVAS_OVERLAY_SIBLINGS_UNOBSERVED'};
  const prior = layers.map(el => ({el,value:el.style.getPropertyValue('visibility'),
    priority:el.style.getPropertyPriority('visibility')}));
  for (const {el} of prior) el.style.setProperty('visibility','hidden','important');
  window.__sh10RestoreCanvasSiblings = () => {
    for (const {el,value,priority} of prior) {
      if (value) el.style.setProperty('visibility',value,priority);
      else el.style.removeProperty('visibility');
    }
    delete window.__sh10RestoreCanvasSiblings;
  };
  return {ok:true,layerCount:layers.length};
})()`;

export const probeCanvasOnlyIsolationExpression = `(() => {
  const canvas = document.getElementById('scene');
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  const gl = canvas.getContext('webgl2');
  const layers = Array.from(canvas.parentElement?.children || []).filter(el => el !== canvas);
  const style = getComputedStyle(canvas);
  return {
    viewport:{width:canvas.width,height:canvas.height,dpr:devicePixelRatio},
    rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},
    page:{innerWidth:innerWidth,innerHeight:innerHeight,visualScale:visualViewport?.scale ?? null},
    cssTransform:style.transform,
    gl:gl?{drawingBufferWidth:gl.drawingBufferWidth,drawingBufferHeight:gl.drawingBufferHeight,
      viewport:Array.from(gl.getParameter(gl.VIEWPORT))}:null,
    uiIsolation:{mode:'UI_SIBLINGS_VISIBILITY_HIDDEN',layerCount:layers.length,
      hiddenLayers:layers.filter(el=>[el,...el.querySelectorAll('*')].every(node=>
        getComputedStyle(node).visibility==='hidden')).length,
      canvasVisible:style.visibility==='visible' && style.display!=='none'},
  };
})()`;

export const restoreCanvasOnlyIsolationExpression = `(() => {
  if (typeof window.__sh10RestoreCanvasSiblings !== 'function') return false;
  window.__sh10RestoreCanvasSiblings();return true;
})()`;
