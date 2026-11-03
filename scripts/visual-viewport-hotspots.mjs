#!/usr/bin/env node
/**
 * SH-15: source-neutral screen-space hotspot map for an ALREADY registered
 * MCD/Web PNG pair. Unlike source-object masks, this sees unmasked pixels
 * (floor, lighting, HUD-free WebGL canvas). Does not identify root causes.
 * Never exports an image, native IDs, screenshots, pixel samples or paths.
 *
 * node scripts/visual-viewport-hotspots.mjs --native PRIVATE/native.json
 *   --web PRIVATE/web.json [--cols 12 --rows 8] [--out PRIVATE/hotspots.json]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, registration } from './visual-compare.mjs';

const MAX_BYTES = 64 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 1024 * 1024;
const DEFAULT_THRESHOLD_255 = 32;

function fail(message) { throw new Error('SH-15 viewport hotspots: ' + message); }
function readManifest(path) {
  const bytes = readFileSync(resolve(path));
  if (bytes.length > MAX_MANIFEST_BYTES) fail('Capture manifest exceeds 1 MiB');
  return JSON.parse(bytes.toString('utf8'));
}
function readImage(manifestPath, capture) {
  const path = resolve(dirname(resolve(manifestPath)), capture.png);
  const bytes = readFileSync(path);
  if (bytes.length > MAX_BYTES) fail('PNG exceeds 64 MiB');
  const result = decodePng(bytes);
  if (result.width !== capture.viewport[0] || result.height !== capture.viewport[1]) {
    fail('Saved PNG dimensions differ from registered viewport');
  }
  return result;
}
function imagePath(manifestPath, capture) {
  return resolve(dirname(resolve(manifestPath)), capture.png);
}
const validDimension = n => Number.isSafeInteger(n) && n >= 1 && n <= 32;

/**
 * Pure screen-space measurement. Every pixel belongs to exactly one tile;
 * summing screenWeightedRgbMae01 exactly reproduces full-frame RGB MAE01.
 * No object-level, material, native execution or camera authenticity inferred.
 */
export function measureViewportHotspots(nativeImage, webImage, { cols = 12, rows = 8 } = {}) {
  const { width, height } = nativeImage ?? {};
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width < 1 || height < 1 || width * height > 8_000_000 ||
      width !== webImage?.width || height !== webImage?.height ||
      nativeImage.rgb?.length !== width * height * 3 ||
      webImage.rgb?.length !== width * height * 3) {
    fail('Two identically-sized, bounded RGB frames are required');
  }
  if (!validDimension(cols) || !validDimension(rows) || cols > width || rows > height) {
    fail('Grid must have 1..32 columns/rows, no more than viewport dimensions');
  }
  const tiles = [];
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const left = Math.ceil(col * width / cols), right = Math.ceil((col + 1) * width / cols);
    const top = Math.ceil(row * height / rows), bottom = Math.ceil((row + 1) * height / rows);
    tiles.push({ row, col, rectPx: { left, top, width: right - left, height: bottom - top },
      pixels: 0, absoluteRgbSum: 0, affectedPixels: 0, maxChannelError255: 0 });
  }
  const totalPixels = width * height;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const col = Math.min(cols - 1, Math.floor(x * cols / width));
    const row = Math.min(rows - 1, Math.floor(y * rows / height));
    const tile = tiles[row * cols + col];
    const p = (y * width + x) * 3;
    let maxDelta = 0;
    for (let k = 0; k < 3; k++) {
      const diff = Math.abs(nativeImage.rgb[p + k] - webImage.rgb[p + k]);
      tile.absoluteRgbSum += diff;
      maxDelta = Math.max(maxDelta, diff);
    }
    tile.pixels++;
    if (maxDelta >= DEFAULT_THRESHOLD_255) tile.affectedPixels++;
    tile.maxChannelError255 = Math.max(tile.maxChannelError255, maxDelta);
  }
  let totalAbsoluteRgb = 0, totalAffected = 0;
  for (const tile of tiles) {
    if (tile.pixels !== tile.rectPx.width * tile.rectPx.height) {
      fail('Internal tile coverage mismatch');
    }
    totalAbsoluteRgb += tile.absoluteRgbSum;
    totalAffected += tile.affectedPixels;
    tile.rgbMae01 = tile.absoluteRgbSum / (3 * 255 * tile.pixels);
    tile.screenWeightedRgbMae01 = tile.absoluteRgbSum / (3 * 255 * totalPixels);
    tile.affectedFraction = tile.affectedPixels / tile.pixels;
    delete tile.absoluteRgbSum;
  }
  const ranked = (key) => [...tiles].filter(tile => tile[key] > 0)
    .sort((a, b) => b[key] - a[key] || a.row - b.row || a.col - b.col)
    .slice(0, 3)
    .map(tile => ({
      row: tile.row, col: tile.col, rectPx: tile.rectPx, value: tile[key],
    }));
  return {
    viewport: [width, height], grid: [cols, rows],
    changedPixelThresholdMaxChannel255: DEFAULT_THRESHOLD_255,
    fullFrameRgbMae01: totalAbsoluteRgb / (3 * 255 * totalPixels),
    fullFrameAffectedPixels: totalAffected,
    tiles,
    topScreenWeightedRgbHotspots: ranked('screenWeightedRgbMae01'),
    topLocalRgbHotspots: ranked('rgbMae01'),
    topChangedAreaHotspots: ranked('affectedPixels'),
  };
}

/** Fail closed on scene, state, camera, projection or viewport mismatch BEFORE
 * touching image bytes. Native evidence remains owner-attested, not verified.
 */
export function scoreViewportHotspots(nativePath, webPath, options = {}) {
  const native = readManifest(nativePath), web = readManifest(webPath);
  const alignment = registration(native, web);
  const report = {
    schemaVersion: 1,
    status: alignment.blockers.length
      ? 'UNREGISTERED_NO_VIEWPORT_METRICS' : 'PAIRED_VIEWPORT_NOT_PARITY_VERIFIED',
    evidenceClass: alignment.evidenceClass,
    blockers: alignment.blockers,
    nativeWebPairVerifiedOneToOne: false,
    nativeExecutionAndFrameState: 'USER_ATTESTED_NOT_INDEPENDENTLY_VERIFIED',
    method: 'NONOVERLAPPING_SCREEN_TILES_RGB_SRGB_ABSOLUTE_DIFFERENCE',
    measurements: null,
    limitations: [
      'Registered active native camera and identical rendered scene/pose/time remain independently unverified',
      'WebGL readPixels excludes HTML HUD; full-screen compositing needs separate synchronized evidence',
      'Tiles localize pixel disagreement but cannot assign source objects, occlusion, lighting or causal attribution',
      'Color-space, exposure, anti-aliasing and temporal mismatches can dominate tile scores',
      'No native 1:1 or gameplay parity inference',
    ],
  };
  if (alignment.blockers.length) return report;
  if (imagePath(nativePath, native.capture) === imagePath(webPath, web.capture)) {
    fail('Native and Web images must reference distinct files');
  }
  report.measurements = measureViewportHotspots(
    readImage(nativePath, native.capture), readImage(webPath, web.capture), options);
  return report;
}

function cli(argv) {
  if (argv.includes('--help')) {
    process.stdout.write('Usage: --native PRIVATE/native.json --web PRIVATE/web.json [--cols N --rows N] [--out PRIVATE/hotspots.json]\n');
    return 0;
  }
  if (argv.length < 4 || argv.length > 10 || argv.length % 2) fail('Invalid CLI options');
  const args = new Map();
  for (let i = 0; i < argv.length; i += 2) {
    if (!['--native', '--web', '--cols', '--rows', '--out'].includes(argv[i]) ||
        args.has(argv[i]) || !argv[i + 1]) fail('Invalid or repeated CLI option');
    args.set(argv[i], argv[i + 1]);
  }
  if (!args.has('--native') || !args.has('--web')) fail('Native and Web manifests required');
  const options = {};
  for (const [flag, key] of [['--cols', 'cols'], ['--rows', 'rows']]) {
    if (args.has(flag)) {
      if (!/^\d+$/.test(args.get(flag))) fail(flag + ' must be an integer');
      options[key] = Number(args.get(flag));
    }
  }
  const report = scoreViewportHotspots(args.get('--native'), args.get('--web'), options);
  const data = JSON.stringify(report, null, 2) + '\n';
  if (args.has('--out')) {
    writeFileSync(resolve(args.get('--out')), data, { flag: 'wx', mode: 0o600 });
  } else process.stdout.write(data);
  return report.blockers.length ? 2 : 0;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = cli(process.argv.slice(2)); }
  catch (error) {
    process.stderr.write((error.code === 'ENOENT' ? 'Missing private input' : error.message) + '\n');
    process.exitCode = 2;
  }
}
