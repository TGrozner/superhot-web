#!/usr/bin/env node
// SH-15: inspect structural camera/projection differences before PNG registration.
// This is an analytic PARAMETER check, never a screenshot or native parity test.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function finitePositive(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new RangeError(name + ' must be a finite positive number');
  }
  return value;
}

/** Read a saved completed-render snapshot, never renderer source or stale telemetry. */
export function readRenderedWebProjection(frame) {
  if (!frame || !Number.isSafeInteger(frame.frameId) || frame.frameId < 1 ||
      !['menu', 'playing', 'paused'].includes(frame.activeScreen) ||
      !frame.camera || ['x', 'y', 'z', 'yaw', 'pitch'].some(key => !Number.isFinite(frame.camera[key]))) {
    throw new TypeError('Completed rendered frame with finite camera pose required');
  }
  const projection = frame.projection;
  if (!projection) throw new TypeError('Rendered frame projection required');
  const verticalScale = finitePositive(projection.verticalScale, 'projection.verticalScale');
  const near = finitePositive(projection.near, 'projection.near');
  const far = finitePositive(projection.far, 'projection.far');
  const aspect = finitePositive(projection.aspect, 'projection.aspect');
  if (far <= near) throw new RangeError('Web far must exceed near');
  if (!Array.isArray(projection.viewProjection) || projection.viewProjection.length !== 16 ||
      !projection.viewProjection.every(Number.isFinite)) {
    throw new TypeError('Rendered viewProjection must contain 16 finite numbers');
  }
  return { verticalScale, near, far, aspect, viewProjection: [...projection.viewProjection] };
}

/**
 * Projection center and orientation must already be identical. This cannot
 * establish pose, viewport, native camera activation, visibility or pixels.
 * FOV and near/far are comparable units; no native screenshot is read.
 */
export function analyzeStructuralFraming({
  native, web, viewportHeightPx, referenceObjectHeight = 1, referenceDepth = 10,
} = {}) {
  if (!native || !web) throw new TypeError('Native and Web camera descriptors required');
  const vfov = finitePositive(native.verticalFovDegrees, 'native.verticalFovDegrees');
  if (vfov >= 179) throw new RangeError('Native vertical FOV must be < 179 degrees');
  const nativeNear = finitePositive(native.near, 'native.near');
  const nativeFar = finitePositive(native.far, 'native.far');
  if (nativeFar <= nativeNear) throw new RangeError('Native far must exceed near');
  const webF = finitePositive(web.verticalScale, 'web.verticalScale');
  const webNear = finitePositive(web.near, 'web.near');
  const webFar = finitePositive(web.far, 'web.far');
  if (webFar <= webNear) throw new RangeError('Web far must exceed near');
  finitePositive(viewportHeightPx, 'viewportHeightPx');
  finitePositive(referenceObjectHeight, 'referenceObjectHeight');
  finitePositive(referenceDepth, 'referenceDepth');
  if (referenceDepth <= Math.max(nativeNear, webNear)) {
    throw new RangeError('Reference depth must exceed both near planes');
  }
  // No near-plane intersection, occlusion or object tilt in the simple model.
  const nativeF = 1 / Math.tan(vfov * Math.PI / 360);
  const webFov = Math.atan(1 / webF) * 360 / Math.PI;
  const nativeHeightPx = viewportHeightPx / 2 * nativeF * referenceObjectHeight / referenceDepth;
  const webHeightPx = viewportHeightPx / 2 * webF * referenceObjectHeight / referenceDepth;
  const scaleRatio = webF / nativeF;
  const mismatch = Math.abs(webF - nativeF) > 1e-5 ||
    Math.abs(nativeNear - webNear) > 1e-6 || Math.abs(nativeFar - webFar) > 1e-6;
  return {
    status: mismatch ? 'PROJECTION_MISMATCH_NO_PIXEL_MEASUREMENT'
      : 'PROJECTION_EQUALITY_NO_PIXEL_MEASUREMENT',
    evidenceClass: 'CAMERA_PARAMETERS_ONLY',
    native: { verticalFovDegrees: vfov, verticalScale: nativeF, near: nativeNear, far: nativeFar },
    web: { verticalFovDegrees: webFov, verticalScale: webF, near: webNear, far: webFar },
    signedWebMinusNativeFovDegrees: webFov - vfov,
    projectedWebToNativeSilhouetteSizeRatio: scaleRatio,
    signedWebMinusNativeProjectedSizePercent: (scaleRatio - 1) * 100,
    webMinusNativeNear: webNear - nativeNear,
    webMinusNativeFar: webFar - nativeFar,
    idealizedReference: {
      viewportHeightPx, objectHeightWorldUnits: referenceObjectHeight,
      depthWorldUnits: referenceDepth, nativeProjectedHeightPx: nativeHeightPx,
      webProjectedHeightPx: webHeightPx,
      signedWebMinusNativeHeightPx: webHeightPx - nativeHeightPx,
    },
    limitations: [
      'Predicted for the same camera center/pose, aspect ratio and an upright on-axis reference, not observed pixels.',
      'Serialized native camera values are not proof that this camera was active in an executed MCD frame.',
      'No native/Web image pair, matched frame, lighting/materials or 1:1 fidelity is validated.',
    ],
  };
}

export function runAuditFromFrame(frame, native, options = {}) {
  const web = readRenderedWebProjection(frame);
  const report = analyzeStructuralFraming({
    native, web,
    viewportHeightPx: options.viewportHeightPx ?? 1080,
    referenceObjectHeight: options.referenceObjectHeight ?? 1,
    referenceDepth: options.referenceDepth ?? 10,
  });
  return {
    ...report,
    evidenceClass: 'NATIVE_PARAMETERS_VS_WEB_RENDERED_FRAME',
    renderedFrame: {
      frameId: frame.frameId, activeScreen: frame.activeScreen,
      camera: Object.fromEntries(['x', 'y', 'z', 'yaw', 'pitch'].map(key => [key, frame.camera[key]])),
      projection: web,
    },
  };
}

function main(argv) {
  if (argv.includes('--help')) {
    process.stdout.write('Usage: node scripts/visual-framing.mjs --web-frame private/frame.json --native-vfov 60 --native-near 0.03 --native-far 1000 [--height 1080] [--reference-height 1] [--reference-depth 10]\n');
    return;
  }
  const allowed = new Set(['--web-frame', '--native-vfov', '--native-near', '--native-far',
    '--height', '--reference-height', '--reference-depth']);
  const args = new Map();
  if (argv.length % 2) throw new Error('Every option must have a value');
  for (let i = 0; i < argv.length; i += 2) {
    if (!allowed.has(argv[i]) || args.has(argv[i]) || !argv[i + 1]) {
      throw new Error('Invalid or duplicate option ' + String(argv[i]));
    }
    args.set(argv[i], argv[i + 1]);
  }
  if (!['--web-frame', '--native-vfov', '--native-near', '--native-far'].every(k => args.has(k))) {
    throw new Error('Missing explicit Web rendered frame or native camera metadata');
  }
  const report = runAuditFromFrame(JSON.parse(readFileSync(resolve(args.get('--web-frame')), 'utf8')),
    {
      verticalFovDegrees: Number(args.get('--native-vfov')),
      near: Number(args.get('--native-near')),
      far: Number(args.get('--native-far')),
    },
    {
      viewportHeightPx: Number(args.get('--height') ?? 1080),
      referenceObjectHeight: Number(args.get('--reference-height') ?? 1),
      referenceDepth: Number(args.get('--reference-depth') ?? 10),
    });
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (error) {
    process.stderr.write('Framing audit refused: ' + error.message + '\n');
    process.exitCode = 2;
  }
}
