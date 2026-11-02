#!/usr/bin/env node
// SH-15: privacy-preserving, opt-in comparison of two aligned PNG captures.
// No image, native paths, object IDs or original assets enter the report.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const PNG_MAGIC = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_PIXELS = 8_000_000;
const PNG_TYPES = new Map([[0, 1], [2, 3], [4, 2], [6, 4]]);

function fail(message) { throw new Error(message); }
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Read ordinary non-interlaced 8-bit grayscale/RGB/RGBA PNGs. Alpha must be opaque.
export function decodePng(bytes) {
  if (!Buffer.isBuffer(bytes) || !bytes.subarray(0, 8).equals(PNG_MAGIC)) fail('Not a PNG');
  let offset = 8, width, height, channels, seenHeader = false, seenEnd = false;
  const idats = [];
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) fail('Truncated PNG chunk');
    const size = bytes.readUInt32BE(offset);
    if (size > bytes.length - offset - 12) fail('Invalid PNG chunk length');
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + size);
    const checked = bytes.subarray(offset + 4, offset + 8 + size);
    if (crc32(checked) !== bytes.readUInt32BE(offset + size + 8)) fail('PNG CRC mismatch');
    offset += size + 12;
    if (!seenHeader && type !== 'IHDR') fail('PNG must start with IHDR');
    if (type === 'IHDR') {
      if (seenHeader || size !== 13) fail('Invalid PNG header');
      seenHeader = true;
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      const depth = data[8], color = data[9];
      channels = PNG_TYPES.get(color);
      if (!width || !height || width * height > MAX_PIXELS || !channels || depth !== 8 ||
          data[10] !== 0 || data[11] !== 0 || data[12] !== 0) {
        fail('PNG must be <= 8M pixels, 8-bit RGB/RGBA/gray, non-interlaced');
      }
    } else if (type === 'IDAT') idats.push(data);
    else if (type === 'IEND') {
      if (size !== 0 || offset !== bytes.length) fail('Invalid PNG end');
      seenEnd = true; break;
    } else if ((type.charCodeAt(0) & 32) === 0) {
      fail('Unsupported critical PNG chunk');
    }
  }
  if (!seenHeader || !seenEnd || !idats.length) fail('Incomplete PNG');
  const stride = width * channels, expected = (stride + 1) * height;
  let raw;
  try { raw = inflateSync(Buffer.concat(idats), { maxOutputLength: expected }); }
  catch { fail('PNG inflate failed or exceeded expected dimensions'); }
  if (raw.length !== expected) fail('PNG scanline size mismatch');
  const rgb = new Uint8Array(width * height * 3);
  let prev = Buffer.alloc(stride), current = Buffer.alloc(stride), pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    if (filter > 4) fail('Unsupported PNG row filter');
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? current[x - channels] : 0;
      const up = prev[x];
      const upperLeft = x >= channels ? prev[x - channels] : 0;
      let prediction = 0;
      if (filter === 1) prediction = left;
      if (filter === 2) prediction = up;
      if (filter === 3) prediction = (left + up) >>> 1;
      if (filter === 4) {
        const p = left + up - upperLeft;
        const a = Math.abs(p - left), b = Math.abs(p - up), c = Math.abs(p - upperLeft);
        prediction = a <= b && a <= c ? left : b <= c ? up : upperLeft;
      }
      current[x] = (raw[pos++] + prediction) & 255;
    }
    for (let x = 0; x < width; x++) {
      const src = x * channels, dst = (y * width + x) * 3;
      if (channels === 2 || channels === 4) {
        if (current[src + channels - 1] !== 255) fail('Transparent PNG requires compositing before comparison');
      }
      if (channels <= 2) rgb.fill(current[src], dst, dst + 3);
      else rgb.set(current.subarray(src, src + 3), dst);
    }
    [prev, current] = [current, prev];
  }
  return { width, height, rgb };
}

function matrix(value, name) {
  if (!Array.isArray(value) || value.length !== 16 || value.some(x => typeof x !== 'number' || !Number.isFinite(x))) {
    fail(`${name} requires 16 finite numeric elements`);
  }
}
function validateManifest(manifest, role) {
  if (!manifest || manifest.schemaVersion !== 1 || !['native', 'web', 'synthetic'].includes(manifest.origin)) {
    fail(`${role}: schemaVersion 1 and origin native/web/synthetic required`);
  }
  if (role === 'native' && !['native', 'synthetic'].includes(manifest.origin) ||
      role === 'web' && !['web', 'synthetic'].includes(manifest.origin)) fail(`${role}: wrong origin`);
  const { scene, camera, capture } = manifest;
  if (!scene || typeof scene.id !== 'string' || !scene.id || !Number.isInteger(scene.buildIndex) ||
      typeof scene.stateId !== 'string' || !scene.stateId) fail(`${role}: scene id/buildIndex/stateId required`);
  if (!camera || camera.convention !== 'column-major-world-to-camera' || camera.coordinateSpace !== 'matched-web' ||
      !camera.viewMatrix || !camera.projectionMatrix) fail(`${role}: explicit matched camera convention required`);
  matrix(camera.viewMatrix, 'viewMatrix'); matrix(camera.projectionMatrix, 'projectionMatrix');
  if (!capture || !Array.isArray(capture.viewport) || capture.viewport.length !== 2 ||
      capture.viewport.some(n => !Number.isInteger(n) || n < 1) ||
      capture.viewport[0] * capture.viewport[1] > MAX_PIXELS ||
      capture.colorSpace !== 'srgb' || capture.hud !== 'off' ||
      typeof capture.png !== 'string' || !capture.png.endsWith('.png') || !capture.png) {
    fail(`${role}: viewport, sRGB, HUD off and PNG path required`);
  }
  if (capture.mask !== undefined && (typeof capture.mask !== 'string' || !capture.mask.endsWith('.png'))) {
    fail(`${role}: mask must be a PNG path`);
  }
  if (!Array.isArray(manifest.objects)) fail(`${role}: objects array required (may be empty)`);
  const seen = new Set();
  for (const object of manifest.objects) {
    if (typeof object.id !== 'string' || !object.id || seen.has(object.id)) fail(`${role}: duplicate/invalid object ID`);
    matrix(object.worldMatrix, 'object.worldMatrix');
    seen.add(object.id);
  }
  if (manifest.origin === 'native' && (!manifest.evidence ||
      typeof manifest.evidence.captureId !== 'string' || !manifest.evidence.captureId ||
      typeof manifest.evidence.buildId !== 'string' || !manifest.evidence.buildId)) {
    fail('Native capture requires private captureId/buildId provenance');
  }
}

export function registration(native, web, tolerance = 1e-5) {
  validateManifest(native, 'native'); validateManifest(web, 'web');
  if (!(Number.isFinite(tolerance) && tolerance >= 0)) fail('Invalid registration tolerance');
  const blockers = [];
  if (native.scene.id !== web.scene.id || native.scene.buildIndex !== web.scene.buildIndex ||
      native.scene.stateId !== web.scene.stateId) blockers.push('SCENE_OR_STATE_MISMATCH');
  if (native.capture.viewport.some((v, i) => v !== web.capture.viewport[i])) blockers.push('VIEWPORT_MISMATCH');
  if (native.camera.viewMatrix.some((v, i) => Math.abs(v - web.camera.viewMatrix[i]) > tolerance)) {
    blockers.push('VIEW_MATRIX_MISMATCH');
  }
  if (native.camera.projectionMatrix.some((v, i) => Math.abs(v - web.camera.projectionMatrix[i]) > tolerance)) {
    blockers.push('PROJECTION_MATRIX_MISMATCH');
  }
  if (native.origin === 'synthetic' || web.origin === 'synthetic') return { blockers, evidenceClass: 'SYNTHETIC_ONLY' };
  return { blockers, evidenceClass: 'CAPTURE_PAIR_USER_ATTESTED' };
}

const lin = x => { const s = x / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const luma = (rgb, p) => 0.2126 * lin(rgb[p]) + 0.7152 * lin(rgb[p + 1]) + 0.0722 * lin(rgb[p + 2]);
const p95 = sorted => sorted.length ? sorted[Math.ceil(sorted.length * 0.95) - 1] : null;

export function pixelMetrics(native, web) {
  if (native.width !== web.width || native.height !== web.height) fail('PNG image dimensions differ');
  const pixels = native.width * native.height, len = pixels * 3;
  const channelAbs = [0, 0, 0], nativeSum = [0, 0, 0], webSum = [0, 0, 0];
  let absolute = 0, squared = 0, absoluteLuma = 0, signedLuma = 0;
  const maxChannelHist = new Uint32Array(256);
  for (let p = 0; p < len; p += 3) {
    let max = 0;
    for (let c = 0; c < 3; c++) {
      const a = native.rgb[p + c], b = web.rgb[p + c], delta = Math.abs(a - b);
      absolute += delta; squared += delta * delta; channelAbs[c] += delta;
      nativeSum[c] += a; webSum[c] += b; max = Math.max(max, delta);
    }
    maxChannelHist[max]++;
    const delta = luma(native.rgb, p) - luma(web.rgb, p);
    absoluteLuma += Math.abs(delta); signedLuma += delta;
  }
  let at = 0, percentile95 = 0;
  for (let i = 0; i < 256; i++) { at += maxChannelHist[i]; if (at >= Math.ceil(pixels * 0.95)) { percentile95 = i; break; } }
  return {
    pixels,
    rgbMae01: absolute / (len * 255), rgbRmse01: Math.sqrt(squared / len) / 255,
    perChannelMae01: channelAbs.map(x => x / (pixels * 255)),
    meanNativeRgb255: nativeSum.map(x => x / pixels), meanWebRgb255: webSum.map(x => x / pixels),
    meanAbsoluteLinearLuminanceDelta01: absoluteLuma / pixels,
    meanSignedLinearLuminanceDelta01: signedLuma / pixels,
    p95MaxChannelError255: percentile95,
  };
}

export function silhouetteMetrics(a, b, threshold = 128) {
  if (!a || !b) return null;
  if (a.width !== b.width || a.height !== b.height) fail('Silhouette masks dimensions differ');
  if (!(Number.isInteger(threshold) && threshold >= 0 && threshold <= 255)) fail('Invalid mask threshold');
  let intersection = 0, union = 0, nativeArea = 0, webArea = 0;
  let ax = 0, ay = 0, bx = 0, by = 0;
  for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
    const p = (y * a.width + x) * 3;
    const isA = a.rgb[p] >= threshold, isB = b.rgb[p] >= threshold;
    if (isA) { nativeArea++; ax += x; ay += y; }
    if (isB) { webArea++; bx += x; by += y; }
    if (isA && isB) intersection++;
    if (isA || isB) union++;
  }
  return {
    intersection, union, nativeArea, webArea,
    iou: union ? intersection / union : null,
    centroidDistancePx: nativeArea && webArea ? Math.hypot(ax / nativeArea - bx / webArea, ay / nativeArea - by / webArea) : null,
  };
}

export function objectMetrics(nativeObjects, webObjects) {
  const n = new Map(nativeObjects.map(o => [o.id, o.worldMatrix]));
  const w = new Map(webObjects.map(o => [o.id, o.worldMatrix]));
  const translation = [], basis = [];
  for (const [key, matrix] of n) {
    const other = w.get(key);
    if (!other) continue;
    translation.push(Math.hypot(matrix[12] - other[12], matrix[13] - other[13], matrix[14] - other[14]));
    let max = 0;
    for (const i of [0, 1, 2, 4, 5, 6, 8, 9, 10]) max = Math.max(max, Math.abs(matrix[i] - other[i]));
    basis.push(max);
  }
  translation.sort((a, b) => a - b); basis.sort((a, b) => a - b);
  return {
    nativeCount: n.size, webCount: w.size, matchedCount: translation.length,
    missingInWeb: [...n.keys()].filter(key => !w.has(key)).length,
    extraInWeb: [...w.keys()].filter(key => !n.has(key)).length,
    p95TranslationErrorWorldUnits: p95(translation),
    p95MaxBasisCoefficientError: p95(basis),
  };
}

const loadPng = (manifestPath, filename, viewport) => {
  const image = decodePng(readFileSync(resolve(dirname(manifestPath), filename)));
  if (image.width !== viewport[0] || image.height !== viewport[1]) fail('PNG dimensions do not match declared viewport');
  return image;
};

// Compare only after matching scene, state, viewport, camera and projection.
export function compareFiles(nativePath, webPath) {
  const native = JSON.parse(readFileSync(nativePath, 'utf8'));
  const web = JSON.parse(readFileSync(webPath, 'utf8'));
  const { blockers, evidenceClass } = registration(native, web);
  const result = {
    schemaVersion: 1, status: blockers.length ? 'UNREGISTERED' : 'PAIRED_NOT_PARITY_VERIFIED',
    evidenceClass, sceneBuildIndex: native.scene.buildIndex, blockers,
    pixel: null, silhouette: null, objects: null,
    limitations: [
      'No native authenticity attestation beyond private manifest metadata',
      'No 1:1 or runtime/gameplay equivalence inferred from image metrics',
    ],
  };
  if (blockers.length) return result;
  if (resolve(dirname(nativePath), native.capture.png) === resolve(dirname(webPath), web.capture.png)) {
    fail('Native and Web captures must reference different image files');
  }
  if (native.capture.mask && web.capture.mask &&
      resolve(dirname(nativePath), native.capture.mask) === resolve(dirname(webPath), web.capture.mask)) {
    fail('Native and Web masks must reference different files');
  }
  const a = loadPng(nativePath, native.capture.png, native.capture.viewport);
  const b = loadPng(webPath, web.capture.png, web.capture.viewport);
  result.pixel = pixelMetrics(a, b);
  if (native.capture.mask && web.capture.mask) {
    const ma = loadPng(nativePath, native.capture.mask, native.capture.viewport);
    const mb = loadPng(webPath, web.capture.mask, web.capture.viewport);
    result.silhouette = silhouetteMetrics(ma, mb);
  } else result.limitations.push('Silhouette not measured: both explicit masks are required');
  result.objects = objectMetrics(native.objects, web.objects);
  if (!result.objects.matchedCount) result.limitations.push('No matched object transform pairs');
  return result;
}

function main(argv) {
  const args = new Map();
  if (argv.includes('--help')) {
    process.stdout.write('Usage: node scripts/visual-compare.mjs --native /private/native.json --web /private/web.json [--out /private/aggregate.json]\n');
    return 0;
  }
  for (let i = 0; i < argv.length; i += 2) {
    if (!['--native', '--web', '--out'].includes(argv[i]) || !argv[i + 1] || args.has(argv[i])) {
      fail('Expected --native, --web and optional --out');
    }
    args.set(argv[i], argv[i + 1]);
  }
  if (!args.has('--native') || !args.has('--web')) fail('Both capture manifests are required');
  const result = compareFiles(resolve(args.get('--native')), resolve(args.get('--web')));
  const json = `${JSON.stringify(result, null, 2)}\n`;
  if (args.has('--out')) writeFileSync(resolve(args.get('--out')), json, { flag: 'wx', mode: 0o600 });
  else process.stdout.write(json);
  return result.blockers.length ? 2 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (error) {
    const detail = error.code === 'ENOENT' ? 'Missing input file' : error.message;
    process.stderr.write(`Comparison rejected: ${detail}\n`);
    process.exitCode = 2;
  }
}
