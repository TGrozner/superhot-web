/**
 * SH-16 — Dojo visible-composition receipt for the *running* Web page.
 *
 * Unlike canvas readPixels, this inspects the actual DOM HUD overlay plus the
 * same-frame app telemetry. It never downloads assets or takes screenshots.
 * This can run in a browser after SH-05 wires the scene; Node CI uses authored
 * mock objects and is NOT evidence that the owner's browser has run.
 */
const isDojo = source => source &&
  source.sceneBuildIndex === 10 && source.serializedOwner === 'level10' &&
  String(source.scenePath ?? '').replaceAll(String.fromCharCode(92), '/').endsWith('/SHRL_Dojo2.unity');

const unproved = Object.freeze({
  browserExecutionIndependentlyVerified: false,
  gpuPixelsInspected: false,
  browserScreenshotCaptured: false,
  nativeFrameCompared: false,
  measuredVisualDelta: null,
  nativeParityVerdict: 'UNASSESSED',
});

const nonnegative = value =>
  Number.isSafeInteger(value) && value >= 0 ? value : null;

function cssValue(node, field) {
  const value = node?.style?.[field];
  return typeof value === 'string' ? value : '';
}

function isVisible(node, getStyle) {
  if (!node || node.hidden || node.closest?.('[hidden]')) return false;
  const style = typeof getStyle === 'function' ? getStyle(node) : null;
  return style?.display !== 'none' && style?.visibility !== 'hidden';
}

/**
 * Presentation-only receipt. A green receipt proves neither GPU output nor
 * sprite decoding: the DOM may advertise masks while images failed to load.
 * Source hands require separate per-frame reports from SH-05's renderer.
 */
export function assessDojoVisibleComposition({ frame, dom } = {}) {
  const base = {
    scene: frame?.nativeScene?.source ?? null,
    activeScreen: frame?.activeScreen ?? null,
    frameId: nonnegative(frame?.frameId),
    hud: {
      sourceClassesActive: Boolean(dom?.nativeHud && dom?.nativeCrosshair),
      overlayVisible: Boolean(dom?.overlayVisible),
      crosshairElementVisible: Boolean(dom?.crosshairElementVisible),
      sourceCrosshairMaskId: typeof dom?.maskId === 'string' ? dom.maskId : null,
      heartElements: nonnegative(dom?.heartElements),
      canvasWidth: nonnegative(dom?.canvasWidth),
      canvasHeight: nonnegative(dom?.canvasHeight),
    },
    hands: {
      appReportedIndexedDrawCalls: nonnegative(frame?.nativeHands?.handsDrawCalls),
      appReportedTriangles: nonnegative(frame?.nativeHands?.handsTriangles),
      appReportedSourcePoseSampled: frame?.nativeHands?.sourcePoseSampled === true,
    },
    evidence: 'APP_REPORTED_FRAME_PLUS_LIVE_DOM_OBSERVATION_NOT_PIXELS',
    ...unproved,
  };
  const result = status => Object.freeze({ status, ...base });
  if (base.frameId === null) return result('MISSING_SAME_FRAME_RENDER_SNAPSHOT');
  if (!isDojo(base.scene)) return result('NOT_DOJO_BUILD10_LEVEL10');
  if (base.activeScreen !== 'playing') return result('DOJO_NOT_PLAYING');
  if (!base.hud.overlayVisible || !base.hud.sourceClassesActive ||
      !base.hud.crosshairElementVisible) return result('SOURCE_HUD_DOM_NOT_ACTIVE');
  if (!/^sceneHud_[0-9]{3}$/.test(base.hud.sourceCrosshairMaskId ?? '') ||
      base.hud.heartElements === null) return result('SOURCE_HUD_MASK_OR_HEART_DOM_MISSING');
  if (base.hands.appReportedIndexedDrawCalls > 0 &&
      base.hands.appReportedSourcePoseSampled &&
      base.hands.appReportedTriangles > 0) {
    return result('DOJO_HUD_DOM_AND_HANDS_APP_REPORTED_NO_PIXEL_PROOF');
  }
  return result('DOJO_HUD_DOM_PRESENT_HANDS_GPU_UNOBSERVED');
}

/**
 * Browser-only collector. HTML/CSS visible in the composite viewport, unlike
 * canvas readPixels. Can be invoked through a module import in DevTools after
 * integration. No page mutations, filesystem access or private asset reads.
 */
export function collectDojoVisibleComposition(win = globalThis.window) {
  const doc = win?.document;
  const frame = win?.__superhotGetRenderedFrameSnapshot?.() ?? null;
  const hud = doc?.getElementById?.('hud');
  const crosshair = doc?.getElementById?.('crosshair');
  const health = doc?.getElementById?.('health');
  const canvas = doc?.getElementById?.('scene');
  const mask = cssValue(crosshair, 'maskImage');
  const match = mask.includes('/local-assets/') ? mask.match(/sceneHud_[0-9]{3}/) : null;
  const getStyle = win?.getComputedStyle?.bind(win);
  return assessDojoVisibleComposition({
    frame,
    dom: {
      nativeHud: Boolean(hud?.classList?.contains('native-hud')),
      nativeCrosshair: Boolean(crosshair?.classList?.contains('native-crosshair')),
      overlayVisible: isVisible(hud, getStyle),
      crosshairElementVisible: isVisible(crosshair, getStyle),
      maskId: match?.[0] ?? null,
      heartElements: health?.querySelectorAll?.('i')?.length ?? null,
      canvasWidth: canvas?.width,
      canvasHeight: canvas?.height,
    },
  });
}
