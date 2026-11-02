#!/usr/bin/env node
// SH-15: inspect structural camera/projection differences before PNG registration.
// This is an analytic SOURCE-PARAMETER check, never a screenshot or parity test.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const NUMBER = '(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?';

function finitePositive(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new RangeError(name + ' must be a finite positive number');
  }
  return value;
}

function oneMatch(text, pattern, label) {
  const hits = [...text.matchAll(pattern)];
  if (hits.length !== 1) throw new Error('Expected one static GLSL ' + label + '; found ' + hits.length);
  return Number(hits[0][1]);
}

/**
 * Read SH-05's *current* Web vertex shader, not a copy of its parameters.
 * Fail closed if its projection becomes dynamic or a new shader format is used.
 */
export function readStaticWebProjection(rendererSource) {
  if (typeof rendererSource !== 'string') throw new TypeError('Renderer source text required');
  const tag = 'const vertexShaderSource';
  const start = rendererSource.indexOf(tag);
  if (start < 0 || rendererSource.indexOf(tag, start + tag.length) >= 0) {
    throw new Error('Unique vertex shader source block not found');
  }
  const tick = String.fromCharCode(96);
  const open = rendererSource.indexOf(tick, start + tag.length);
  const close = open < 0 ? -1 : rendererSource.indexOf(tick, open + 1);
  if (close < 0) throw new Error('Unterminated vertex shader source block');
  const glsl = rendererSource.slice(open + 1, close);
  if (!glsl.includes('gl_Position')) throw new Error('Vertex shader missing gl_Position');
  // Require exactly the perspective expression whose meaning is being audited.
  if (!/cam\.x\s*\*\s*f\s*\/\s*uProjection\.x/.test(glsl) ||
      !/cam\.y\s*\*\s*f/.test(glsl) ||
      !/cam\.z\s*\*\s*\(\s*far\s*\+\s*near\s*\)\s*\/\s*\(\s*far\s*-\s*near\s*\)/.test(glsl)) {
    throw new Error('Unrecognized Web perspective projection: audit manually');
  }
  const f = finitePositive(oneMatch(glsl,
    new RegExp('\\bfloat\\s+f\\s*=\\s*(' + NUMBER + ')\\s*;', 'g'), 'perspective scale'), 'f');
  const clipMatch = [...glsl.matchAll(new RegExp(
    '\\bfloat\\s+near\\s*=\\s*(' + NUMBER + ')\\s*,\\s*far\\s*=\\s*(' + NUMBER + ')\\s*;', 'g'))];
  if (clipMatch.length !== 1) throw new Error('Expected one static near/far pair');
  const near = finitePositive(Number(clipMatch[0][1]), 'near');
  const far = finitePositive(Number(clipMatch[0][2]), 'far');
  if (far <= near) throw new RangeError('Invalid Web near/far ordering');
  return { verticalScale: f, near, far, sourceClass: 'WEB_GLSL_STATIC' };
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
    status: mismatch ? 'SOURCE_PROJECTION_MISMATCH_NO_PIXEL_MEASUREMENT'
      : 'SOURCE_PROJECTION_EQUALITY_NO_PIXEL_MEASUREMENT',
    evidenceClass: 'SERIALIZED_PARAMETERS_VS_WEB_SHADER_ONLY',
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

export function runAuditFromSource(rendererSource, native, options = {}) {
  return analyzeStructuralFraming({
    native, web: readStaticWebProjection(rendererSource),
    viewportHeightPx: options.viewportHeightPx ?? 1080,
    referenceObjectHeight: options.referenceObjectHeight ?? 1,
    referenceDepth: options.referenceDepth ?? 10,
  });
}

function main(argv) {
  if (argv.includes('--help')) {
    process.stdout.write('Usage: node scripts/visual-framing.mjs --renderer src/renderer.js --native-vfov 60 --native-near 0.03 --native-far 1000 [--height 1080] [--reference-height 1] [--reference-depth 10]\n');
    return;
  }
  const allowed = new Set(['--renderer', '--native-vfov', '--native-near', '--native-far',
    '--height', '--reference-height', '--reference-depth']);
  const args = new Map();
  if (argv.length % 2) throw new Error('Every option must have a value');
  for (let i = 0; i < argv.length; i += 2) {
    if (!allowed.has(argv[i]) || args.has(argv[i]) || !argv[i + 1]) {
      throw new Error('Invalid or duplicate option ' + String(argv[i]));
    }
    args.set(argv[i], argv[i + 1]);
  }
  if (!['--renderer', '--native-vfov', '--native-near', '--native-far'].every(k => args.has(k))) {
    throw new Error('Missing explicit renderer or native camera metadata');
  }
  const report = runAuditFromSource(readFileSync(resolve(args.get('--renderer')), 'utf8'),
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
