import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessDojoVisibleComposition, collectDojoVisibleComposition,
} from '../scripts/integration-dojo-visible.mjs';

// Authored DOM/frame fixture; no native game capture, private PNG or engine.
const frame = () => ({
  frameId: 84, activeScreen: 'playing',
  nativeScene: { source: {
    sceneBuildIndex: 10, serializedOwner: 'level10',
    scenePath: 'Assets/Scenes/SHRL/SHRL_Dojo2.unity',
  } },
});
const dom = () => ({
  nativeHud: true, nativeCrosshair: true,
  overlayVisible: true, crosshairElementVisible: true,
  maskId: 'sceneHud_012', heartElements: 3,
  canvasWidth: 1920, canvasHeight: 1080,
});

test('source HUD DOM can be observed without pretending to capture rendered pixels', () => {
  const receipt = assessDojoVisibleComposition({ frame: frame(), dom: dom() });
  assert.equal(receipt.status, 'DOJO_HUD_DOM_PRESENT_HANDS_GPU_UNOBSERVED');
  assert.equal(receipt.frameId, 84);
  assert.equal(receipt.hud.sourceCrosshairMaskId, 'sceneHud_012');
  assert.equal(receipt.hud.heartElements, 3);
  assert.equal(receipt.hands.appReportedIndexedDrawCalls, null);
  assert.equal(receipt.nativeParityVerdict, 'UNASSESSED');
  assert.equal(receipt.gpuPixelsInspected, false);
  assert.equal(receipt.browserExecutionIndependentlyVerified, false);
  assert.equal(receipt.measuredVisualDelta, null);
});

test('rejects an absent rendered snapshot rather than believing DOM styling alone', () => {
  assert.equal(assessDojoVisibleComposition({ dom: dom() }).status,
    'MISSING_SAME_FRAME_RENDER_SNAPSHOT');
  assert.equal(assessDojoVisibleComposition({ frame: { ...frame(), frameId: -1 }, dom: dom() }).status,
    'MISSING_SAME_FRAME_RENDER_SNAPSHOT');
});

test('refuses Containers, altered path and foreign serialized owner', () => {
  for (const source of [
    { ...frame().nativeScene.source, sceneBuildIndex: 28 },
    { ...frame().nativeScene.source, serializedOwner: 'level28' },
    { ...frame().nativeScene.source, scenePath: 'Assets/Scenes/SHRL_Dojo2_fake.unity' },
  ]) {
    assert.equal(assessDojoVisibleComposition({
      frame: { ...frame(), nativeScene: { source } }, dom: dom(),
    }).status, 'NOT_DOJO_BUILD10_LEVEL10');
  }
});

test('accepts Windows-style scene hierarchy but rejects non-playing screens', () => {
  const valid = frame();
  valid.nativeScene.source.scenePath = 'Assets\\Scenes\\SHRL_Dojo2.unity';
  assert.equal(assessDojoVisibleComposition({ frame: valid, dom: dom() }).status,
    'DOJO_HUD_DOM_PRESENT_HANDS_GPU_UNOBSERVED');
  valid.activeScreen = 'paused';
  assert.equal(assessDojoVisibleComposition({ frame: valid, dom: dom() }).status,
    'DOJO_NOT_PLAYING');
});

test('inactive or CSS-hidden source HUD cannot pass a composite-viewport gate', () => {
  for (const changed of [
    { nativeHud: false }, { nativeCrosshair: false },
    { overlayVisible: false }, { crosshairElementVisible: false },
  ]) {
    assert.equal(assessDojoVisibleComposition({
      frame: frame(), dom: { ...dom(), ...changed },
    }).status, 'SOURCE_HUD_DOM_NOT_ACTIVE');
  }
});

test('source HUD requires a same-origin glyph mask reference and health DOM', () => {
  for (const changed of [
    { maskId: null }, { maskId: 'sceneTexture_001' },
    { maskId: 'sceneHud_1' }, { maskId: 'sceneHud_0010' },
    { heartElements: null },
  ]) {
    assert.equal(assessDojoVisibleComposition({
      frame: frame(), dom: { ...dom(), ...changed },
    }).status, 'SOURCE_HUD_MASK_OR_HEART_DOM_MISSING');
  }
});

test('future hands telemetry is only app-reported, never promoted to real GPU pixels', () => {
  const f = frame();
  f.nativeHands = { handsDrawCalls: 1, handsTriangles: 2150, sourcePoseSampled: true };
  const receipt = assessDojoVisibleComposition({ frame: f, dom: dom() });
  assert.equal(receipt.status, 'DOJO_HUD_DOM_AND_HANDS_APP_REPORTED_NO_PIXEL_PROOF');
  assert.equal(receipt.hands.appReportedIndexedDrawCalls, 1);
  assert.equal(receipt.nativeFrameCompared, false);
  f.nativeHands.sourcePoseSampled = false;
  assert.equal(assessDojoVisibleComposition({ frame: f, dom: dom() }).status,
    'DOJO_HUD_DOM_PRESENT_HANDS_GPU_UNOBSERVED');
});

test('browser collector reads live HUD style + frame hook without network or assets', () => {
  const hud = { classList: { contains: value => value === 'native-hud' } };
  const crosshair = {
    style: { maskImage: 'url("/local-assets/sceneHud_012")' },
    classList: { contains: value => value === 'native-crosshair' },
  };
  const health = { querySelectorAll: name => name === 'i' ? [{}, {}] : [] };
  const scene = { width: 1600, height: 900 };
  const elements = { hud, crosshair, health, scene };
  const fakeWindow = {
    document: { getElementById: id => elements[id] },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
    __superhotGetRenderedFrameSnapshot: () => frame(),
  };
  const receipt = collectDojoVisibleComposition(fakeWindow);
  assert.equal(receipt.status, 'DOJO_HUD_DOM_PRESENT_HANDS_GPU_UNOBSERVED');
  assert.equal(receipt.hud.heartElements, 2);
  assert.equal(receipt.hud.canvasWidth, 1600);
  assert.equal(receipt.hud.canvasHeight, 900);

  crosshair.style.maskImage = 'url("https://example.com/sceneHud_012")';
  assert.equal(collectDojoVisibleComposition(fakeWindow).status,
    'SOURCE_HUD_MASK_OR_HEART_DOM_MISSING');
  delete fakeWindow.__superhotGetRenderedFrameSnapshot;
  assert.equal(collectDojoVisibleComposition(fakeWindow).status,
    'MISSING_SAME_FRAME_RENDER_SNAPSHOT');
});
