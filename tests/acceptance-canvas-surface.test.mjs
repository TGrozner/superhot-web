/** Synthetic browser geometry fixtures; never MCD/native capture proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasCaptureSurfaceEvidence, WEB_CANVAS_SURFACE_STATUS } from '../scripts/acceptance-canvas-surface.mjs';

const fixture = () => ({
  viewport: { width: 1280, height: 720, dpr: 1 },
  rect: { x: 0, y: 0, width: 1280, height: 720 },
  gl: { drawingBufferWidth: 1280, drawingBufferHeight: 720, viewport: [0, 0, 1280, 720] },
  page: { innerWidth: 1280, innerHeight: 720, visualScale: 1 },
  cssTransform: 'none',
  uiIsolation: { mode: 'UI_SIBLINGS_VISIBILITY_HIDDEN', layerCount: 9, hiddenLayers: 9, canvasVisible: true },
});
const probe = (change, image = { width: 1280, height: 720 }) => {
  const v = fixture(); change(v);
  return canvasCaptureSurfaceEvidence(v, image);
};

test('clean canvas-only capture geometry is diagnostic, never native parity', () => {
  const x = probe(() => {});
  assert.equal(x.status, WEB_CANVAS_SURFACE_STATUS);
  assert.equal(x.nativeParityCertified, false);
  assert.equal(x.independentGpuReadback, false);
});
test('visible HUD or controls make screenshot invalid for material comparison', () => {
  const x = probe(v => { v.uiIsolation.hiddenLayers = 8; });
  assert.ok(x.reasons.includes('WEB_DOM_OVERLAY_CONTAMINATION_UNVERIFIED'));
});
test('CSS-scaled canvas cannot be silently labeled raw native-compatible pixels', () => {
  const x = probe(v => { v.rect.width = 1200; });
  assert.ok(x.reasons.includes('WEB_CANVAS_CSS_CAPTURE_GEOMETRY_MISMATCH'));
});
test('WebGL drawing buffer differing from canvas is rejected', () => {
  const x = probe(v => { v.gl.drawingBufferWidth = 640; });
  assert.ok(x.reasons.includes('WEB_GL_DRAWING_BUFFER_MISMATCH'));
});
test('cropped or stale GL viewport rejected independently of canvas size', () => {
  const x = probe(v => { v.gl.viewport = [0, 0, 1000, 720]; });
  assert.ok(x.reasons.includes('WEB_GL_VIEWPORT_MISMATCH'));
});
test('screenshot decoded dimensions must match actual canvas pixels', () => {
  const x = probe(() => {}, { width: 1280, height: 719 });
  assert.ok(x.reasons.includes('WEB_SCREENSHOT_PIXEL_DIMENSIONS_MISMATCH'));
});
test('canvas offscreen or cut by viewport is invalid', () => {
  const x = probe(v => { v.rect.y = 25; });
  assert.ok(x.reasons.includes('WEB_CANVAS_CSS_CAPTURE_GEOMETRY_MISMATCH'));
});
test('browser zoom or canvas transform disqualifies pixel correspondence', () => {
  for (const change of [
    v => { v.page.visualScale = 1.25; },
    v => { v.cssTransform = 'matrix(1, 0, 0, 1, 0, 0)'; },
    v => { v.viewport.dpr = 2; },
  ]) {
    assert.equal(probe(change).status, 'WEB_CANVAS_CAPTURE_UNVERIFIED');
  }
});
test('a claim of hidden overlays without observed children does not pass', () => {
  const x = probe(v => { v.uiIsolation.layerCount = 0; v.uiIsolation.hiddenLayers = 0; });
  assert.ok(x.reasons.includes('WEB_DOM_OVERLAY_CONTAMINATION_UNVERIFIED'));
});

test('no successful verdict can be manufactured by absent evidence', () => {
  for (const state of [null, {}, { viewport: { width: 1280, height: 720, dpr: 1 } }]) {
    assert.equal(canvasCaptureSurfaceEvidence(state).status, 'WEB_CANVAS_CAPTURE_UNVERIFIED');
  }
});
