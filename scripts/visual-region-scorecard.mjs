#!/usr/bin/env node
/**
 * SH-15: locally quantify WHERE registered native/Web screenshots differ.
 *
 * This does NOT acquire native images, invent an active MCD camera, or
 * authenticate a user-declared native capture. Images and object IDs remain
 * private: stdout/JSON only contain aggregated zone metrics.
 *
 * Usage:
 * node scripts/visual-region-scorecard.mjs --native PRIVATE/native.json
 *   --web PRIVATE/web.json --regions PRIVATE/regions.json [--out PRIVATE/report.json]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compareFiles, decodePng, registration,
  silhouetteMetrics, pixelMetrics,
} from './visual-compare.mjs';

const MAX_REGIONS = 32;
const CLASSES = new Set([
  'actor', 'cargo', 'floor', 'architecture', 'background', 'shadow', 'lighting',
]);
const MAX_PIXELS = 8_000_000;
// Source/world-matrix difference larger than numerical export noise is a pose
// mismatch: color error must not be attributed to a material in that case.
const SOURCE_POSE_MATRIX_TOLERANCE = 1e-3;
const MIN_MATERIAL_SHARED_AREA_FRACTION = 0.5;

function invalid(message) { throw new Error('SH-15 region scorecard: ' + message); }
function jsonFile(path, label) {
  const bytes = readFileSync(resolve(path));
  if (bytes.length > 1024 * 1024) invalid(label + ' JSON exceeds 1 MiB');
  return JSON.parse(bytes.toString('utf8'));
}
function checkViewport(image, viewport, name) {
  if (image.width !== viewport[0] || image.height !== viewport[1] ||
      image.width * image.height > MAX_PIXELS) {
    invalid(name + ' dimensions differ from registered viewport');
  }
}
function localPng(manifestPath, path, viewport, label) {
  if (typeof path !== 'string' || !path.endsWith('.png') || path.length > 1024) {
    invalid(label + ' must be a private PNG path');
  }
  const file = readFileSync(resolve(dirname(resolve(manifestPath)), path));
  if (file.length > 64 * 1024 * 1024) invalid(label + ' PNG exceeds 64 MiB');
  const image = decodePng(file);
  checkViewport(image, viewport, label);
  return image;
}
function requireRegions(document) {
  if (!document || document.schemaVersion !== 1 ||
      !Array.isArray(document.regions) ||
      document.regions.length < 1 || document.regions.length > MAX_REGIONS) {
    invalid('schemaVersion 1 and 1..32 explicit matched mask regions required');
  }
  const names = new Set();
  for (const region of document.regions) {
    if (!region || !CLASSES.has(region.kind) ||
        !Number.isSafeInteger(region.slot) || region.slot < 0 || region.slot > 99 ||
        typeof region.nativeMask !== 'string' ||
        typeof region.webMask !== 'string') {
      invalid('Each region needs known kind, slot and two explicit mask PNGs');
    }
    const key = region.kind + ':' + region.slot;
    if (names.has(key)) invalid('Duplicate region kind/slot');
    names.add(key);
    if (region.kind !== 'background' && region.kind !== 'lighting' &&
        (typeof region.sourceObjectId !== 'string' || !region.sourceObjectId)) {
      invalid('Foreground source-matched region requires private sourceObjectId');
    }
    if (region.sourceObjectId !== undefined && region.sourceObjectId !== null &&
        (typeof region.sourceObjectId !== 'string' || !region.sourceObjectId)) {
      invalid('Invalid sourceObjectId');
    }
  }
}
function requireSourceMatch(region, native, web) {
  if (!region.sourceObjectId) return { paired: false, translationErrorWorldUnits: null,
    maxNonTranslationCoefficientDelta: null, poseAligned: null };
  const a = native.objects.find(object => object.id === region.sourceObjectId);
  const b = web.objects.find(object => object.id === region.sourceObjectId);
  if (!a || !b) invalid('Region sourceObjectId is not paired in both capture manifests');
  const translationErrorWorldUnits = Math.hypot(
    a.worldMatrix[12] - b.worldMatrix[12],
    a.worldMatrix[13] - b.worldMatrix[13],
    a.worldMatrix[14] - b.worldMatrix[14],
  );
  if (!Number.isFinite(translationErrorWorldUnits)) invalid('Invalid matched source translation');
  let maxNonTranslationCoefficientDelta = 0;
  for (const i of [0,1,2,3,4,5,6,7,8,9,10,11,15]) {
    maxNonTranslationCoefficientDelta = Math.max(maxNonTranslationCoefficientDelta,
      Math.abs(a.worldMatrix[i] - b.worldMatrix[i]));
  }
  const poseAligned = translationErrorWorldUnits <= SOURCE_POSE_MATRIX_TOLERANCE &&
    maxNonTranslationCoefficientDelta <= SOURCE_POSE_MATRIX_TOLERANCE;
  return { paired: true, translationErrorWorldUnits,
    maxNonTranslationCoefficientDelta, poseAligned };
}
function checkGrayscaleMask(mask, name) {
  for (let p = 0; p < mask.rgb.length; p += 3) {
    if (mask.rgb[p] !== mask.rgb[p + 1] || mask.rgb[p] !== mask.rgb[p + 2]) {
      invalid(name + ' must be a grayscale mask, not a color screenshot');
    }
  }
}
function compactPixelMetrics(a, b, indexes) {
  if (!indexes.length) return null;
  const n = new Uint8Array(indexes.length * 3);
  const w = new Uint8Array(indexes.length * 3);
  for (let i = 0; i < indexes.length; i++) {
    const source = indexes[i] * 3, target = i * 3;
    n.set(a.rgb.subarray(source, source + 3), target);
    w.set(b.rgb.subarray(source, source + 3), target);
  }
  const m = pixelMetrics({ width: indexes.length, height: 1, rgb: n },
    { width: indexes.length, height: 1, rgb: w });
  return {
    pixels: m.pixels, rgbMae01: m.rgbMae01, rgbRmse01: m.rgbRmse01,
    perChannelMae01: m.perChannelMae01,
    meanAbsoluteLinearLuminanceDelta01: m.meanAbsoluteLinearLuminanceDelta01,
    p95MaxChannelError255: m.p95MaxChannelError255,
  };
}

/**
 * Only measure user-defined AND source-registered regions. RGB on the
 * intersection separates material/color error from boundary mismatch;
 * union RGB includes missing silhouette/background and is reported separately.
 * Masks are explicit grayscale 8-bit PNGs, threshold >=128. No fake segmentation.
 */
export function measureRegisteredRegion(nativeImage, webImage, nativeMask, webMask) {
  const viewport = [nativeImage.width, nativeImage.height];
  for (const [name, image] of [
    ['Web screenshot', webImage], ['native mask', nativeMask], ['Web mask', webMask],
  ]) checkViewport(image, viewport, name);
  checkGrayscaleMask(nativeMask, 'native mask');
  checkGrayscaleMask(webMask, 'Web mask');
  const shape = silhouetteMetrics(nativeMask, webMask, 128);
  // A missing actor/light is itself a large visible difference, not an error.
  // Only a region absent on BOTH captures is not a measurable visual region.
  if (!shape.nativeArea && !shape.webArea) invalid('Both masks have no visible pixels');
  const visibilityStatus = !shape.webArea ? 'NATIVE_ONLY_VISIBLE'
    : !shape.nativeArea ? 'WEB_ONLY_VISIBLE' : 'BOTH_VISIBLE';
  const intersection = [], union = [];
  // Screen-space extents catch a shifted hand/katana whose high IoU or
  // centroid could otherwise conceal a visibly misplaced silhouette edge.
  // Pixel coordinates are inclusive, top-left origin, NOT Unity world units.
  const nb = {left:viewport[0],top:viewport[1],right:-1,bottom:-1};
  const wb = {left:viewport[0],top:viewport[1],right:-1,bottom:-1};
  for (let y = 0; y < viewport[1]; y++) {
    for (let x = 0; x < viewport[0]; x++) {
      const p = y * viewport[0] + x;
      const n = nativeMask.rgb[3 * p] >= 128;
      const w = webMask.rgb[3 * p] >= 128;
      if (n) {
        nb.left=Math.min(nb.left,x); nb.top=Math.min(nb.top,y);
        nb.right=Math.max(nb.right,x); nb.bottom=Math.max(nb.bottom,y);
      }
      if (w) {
        wb.left=Math.min(wb.left,x); wb.top=Math.min(wb.top,y);
        wb.right=Math.max(wb.right,x); wb.bottom=Math.max(wb.bottom,y);
      }
      if (n && w) intersection.push(p);
      if (n || w) union.push(p);
    }
  }
  const bounds = b => b.right < 0 ? null : ({
    left:b.left,top:b.top,right:b.right,bottom:b.bottom,
    width:b.right-b.left+1,height:b.bottom-b.top+1,
  });
  const nativeBoundingBox=bounds(nb), webBoundingBox=bounds(wb);
  const bothBounds=!!nativeBoundingBox && !!webBoundingBox;
  const boundingBoxIntersectionPixels=bothBounds
    ? Math.max(0,Math.min(nb.right,wb.right)-Math.max(nb.left,wb.left)+1)
      * Math.max(0,Math.min(nb.bottom,wb.bottom)-Math.max(nb.top,wb.top)+1)
    : 0;
  const boundingBoxUnionPixels=bothBounds
    ? nativeBoundingBox.width*nativeBoundingBox.height
      +webBoundingBox.width*webBoundingBox.height-boundingBoxIntersectionPixels
    : null;
  return {
    nativeBoundingBox,webBoundingBox,
    boundingBoxIou:bothBounds
      ? boundingBoxIntersectionPixels/boundingBoxUnionPixels : null,
    maxBoundingEdgeDeltaPx:bothBounds
      ? Math.max(Math.abs(nb.left-wb.left),Math.abs(nb.top-wb.top),
        Math.abs(nb.right-wb.right),Math.abs(nb.bottom-wb.bottom)) : null,
    boundingBoxCenterDistancePx:bothBounds
      ? Math.hypot((nb.left+nb.right-wb.left-wb.right)/2,
        (nb.top+nb.bottom-wb.top-wb.bottom)/2) : null,
    maskThreshold: 128,
    visibilityStatus,
    nativeAreaPixels: shape.nativeArea,
    webAreaPixels: shape.webArea,
    intersectionPixels: shape.intersection,
    unionPixels: shape.union,
    symmetricDifferencePixels: shape.union - shape.intersection,
    sharedFractionOfSmallerMask: Math.min(shape.nativeArea, shape.webArea) > 0
      ? shape.intersection / Math.min(shape.nativeArea, shape.webArea) : 0,
    silhouetteIou: shape.iou,
    centroidDistancePx: shape.centroidDistancePx,
    materialIntersection: compactPixelMetrics(nativeImage, webImage, intersection),
    silhouetteUnion: compactPixelMetrics(nativeImage, webImage, union),
  };
}
function rank(results, measure, descending = true) {
  return results.filter(x => measure(x) !== null)
    .sort((a, b) => descending ? measure(b) - measure(a) : measure(a) - measure(b))
    .slice(0, 3)
    .map(r => ({ kind: r.kind, slot: r.slot, value: measure(r) }));
}

/**
 * Produces only reports; never writes, uploads or embeds native/Web images.
 * Native origin and active camera remain owner-attested, not verified by API.
 */
export function scoreVisualRegions(nativePath, webPath, regionsPath) {
  const native = jsonFile(nativePath, 'native manifest');
  const web = jsonFile(webPath, 'web manifest');
  const regions = jsonFile(regionsPath, 'regions');
  requireRegions(regions);
  const alignment = registration(native, web);
  const header = {
    schemaVersion: 1, status: alignment.blockers.length
      ? 'UNREGISTERED_NO_REGION_METRICS' : 'PAIRED_REGIONS_NOT_PARITY_VERIFIED',
    evidenceClass: alignment.evidenceClass,
    blockers: alignment.blockers,
    sourceIdentityAndNativeExecution: 'USER_ATTESTED_NOT_INDEPENDENTLY_VERIFIED',
    nativeWebPairVerifiedOneToOne: false,
    method: 'EXPLICIT_GRAYSCALE_MASKS_THRESHOLD_128_INTERSECTION_AND_UNION_RGB',
    regions: [], topMaterialColorDifferences: [], topSilhouetteDifferences: [],
    topUnionColorDifferences: [], topScreenWeightedUnionColorDifferences: [],
    topAbsoluteSilhouetteDifferences: [], topBoundingEdgeDifferences: [], sourcePoseMismatchCount: 0,
    sourcePoseMatrixTolerance: SOURCE_POSE_MATRIX_TOLERANCE,
    materialSharedAreaThreshold: MIN_MATERIAL_SHARED_AREA_FRACTION, global: null,
    limitations: [
      'Only regions declared by owner; unmasked geometry and occlusion remain unscored',
      'Captures and native execution are not independently authenticated',
      'Screenshots must have matching active camera, projection, scene and state',
      'A fully absent region on one side has IoU 0, null centroid/edge deltas, and no material-intersection RGB',
      'Bounding boxes measure top-left-origin inclusive pixel extents, not exact object contour distance',
      'Material RGB is excluded when source world matrices differ or masks share less than half the smaller silhouette',
      'Screen-weighted region ranks can overlap and must not be summed as global image error',
      'No 1:1 inference or overall gameplay acceptance',
    ],
  };
  if (alignment.blockers.length) return header;
  const global = compareFiles(nativePath, webPath);
  if (global.blockers.length || !global.pixel) invalid('Registered source PNGs are required');
  const n = localPng(nativePath, native.capture.png, native.capture.viewport, 'native image');
  const w = localPng(webPath, web.capture.png, web.capture.viewport, 'Web image');
  header.global = { ...global.pixel, matchedObjects: global.objects.matchedCount,
    missingObjectsInWeb: global.objects.missingInWeb };
  for (const region of regions.regions) {
    const source = requireSourceMatch(region, native, web);
    const nm = localPng(nativePath, region.nativeMask, native.capture.viewport, 'native region mask');
    const wm = localPng(webPath, region.webMask, web.capture.viewport, 'Web region mask');
    if (resolve(dirname(resolve(nativePath)), region.nativeMask) ===
        resolve(dirname(resolve(webPath)), region.webMask)) {
      invalid('Native and Web region masks must refer to different files');
    }
    const measured = measureRegisteredRegion(n, w, nm, wm);
    const materialMeasurementStatus = measured.visibilityStatus !== 'BOTH_VISIBLE'
      ? 'BLOCKED_MISSING_VISIBLE_SURFACE'
      : !measured.intersectionPixels
        ? 'NO_SHARED_SURFACE'
      : source.poseAligned === false
        ? 'BLOCKED_SOURCE_POSE_MISMATCH'
        : measured.sharedFractionOfSmallerMask < MIN_MATERIAL_SHARED_AREA_FRACTION
          ? 'BLOCKED_LOW_SHARED_SILHOUETTE_COVERAGE'
          : 'COMPARABLE_INTERSECTION_RGB';
    if (source.poseAligned === false) header.sourcePoseMismatchCount++;
    if (materialMeasurementStatus !== 'COMPARABLE_INTERSECTION_RGB') {
      measured.materialIntersection = null;
    }
    header.regions.push({
      kind: region.kind, slot: region.slot,
      sourceObjectPaired: source.paired,
      sourceTranslationDeltaWorldUnits: source.translationErrorWorldUnits,
      sourceMaxNonTranslationCoefficientDelta: source.maxNonTranslationCoefficientDelta,
      sourcePoseAligned: source.poseAligned,
      materialMeasurementStatus,
      screenWeightedUnionRgbMae01: measured.silhouetteUnion.rgbMae01 *
        measured.unionPixels / (n.width * n.height),
      ...measured,
    });
  }
  header.topMaterialColorDifferences = rank(header.regions,
    r => r.materialIntersection?.rgbMae01 ?? null);
  header.topSilhouetteDifferences = rank(header.regions, r => r.silhouetteIou, false);
  header.topUnionColorDifferences = rank(header.regions,
    r => r.silhouetteUnion.rgbMae01);
  // Pixel-weighted priorities answer a distinct practical question: what
  // actually occupies the most erroneous screen area? Ratios alone over-rank
  // tiny regions with severe relative error.
  header.topScreenWeightedUnionColorDifferences = rank(header.regions,
    r => r.screenWeightedUnionRgbMae01);
  header.topAbsoluteSilhouetteDifferences = rank(header.regions,
    r => r.symmetricDifferencePixels);
  header.topBoundingEdgeDifferences = rank(header.regions,
    r => r.maxBoundingEdgeDeltaPx);
  return header;
}
function cli(args) {
  const params = new Map();
  if (args.length < 6 || args.length > 8 || args.length % 2 !== 0) {
    invalid('Usage: --native N.json --web W.json --regions R.json [--out PRIVATE/report.json]');
  }
  for (let i = 0; i < args.length; i += 2) {
    if (!['--native', '--web', '--regions', '--out'].includes(args[i]) ||
        params.has(args[i]) || !args[i + 1]) invalid('Invalid/duplicate option');
    params.set(args[i], args[i + 1]);
  }
  if (!['--native', '--web', '--regions'].every(x => params.has(x))) invalid('Missing input');
  const report = scoreVisualRegions(params.get('--native'), params.get('--web'),
    params.get('--regions'));
  const json = JSON.stringify(report, null, 2) + '\n';
  if (params.has('--out')) {
    writeFileSync(resolve(params.get('--out')), json, { flag: 'wx', mode: 0o600 });
  } else process.stdout.write(json);
  if (report.blockers.length) process.exitCode = 2;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { cli(process.argv.slice(2)); }
  catch (error) {
    process.stderr.write(error.message + '\n');
    process.exitCode = 2;
  }
}
