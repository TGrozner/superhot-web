#!/usr/bin/env node
/**
 * SH-15: source-qualified Containers coordinate-frame preflight.
 *
 * Two different Web views of the SAME Unity source object currently coexist:
 * generated fallback uses H_Z M_Unity H_Z; private scene package uses
 * H_X M_Unity H_X. H_X=diag(-1,1,1,1), H_Z=diag(1,1,-1,1).
 *
 * For a POINT: p_package = R p_fallback.
 * For a COMPLETE matrix: M_package = R M_fallback R.
 * R=H_X H_Z=diag(-1,1,-1,1), a proper 180-degree Y rotation.
 *
 * No native bytes, images, GameObject identifiers or camera claims are output.
 * The source identity of each input pair must be qualified by its owner; this
 * module cannot independently authenticate Unity provenance or execution.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FALLBACK_TO_PACKAGE_AXES = Object.freeze([-1, 1, -1, 1]);
const SOURCE_CONTRACT = 'CONTAINERS_FALLBACK_Z_TO_PACKAGE_X';

function finiteVector(value, count, name) {
  if (!Array.isArray(value) || value.length !== count ||
      value.some(v => typeof v !== 'number' || !Number.isFinite(v))) {
    throw new TypeError(name + ' requires ' + count + ' finite numeric components');
  }
  return value;
}
function finiteMatrix(value, name) {
  const m = finiteVector(value, 16, name);
  if (m[3] !== 0 || m[7] !== 0 || m[11] !== 0 || m[15] !== 1) {
    throw new RangeError(name + ' must be a column-major affine 4x4 matrix');
  }
  return m;
}
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
function p95(sorted) {
  return sorted.length ? sorted[Math.ceil(sorted.length * 0.95) - 1] : null;
}

/** Convert a source-matched Z-reflected fallback POINT to package X-reflection. */
export function fallbackPointToPackage(point) {
  const p = finiteVector(point, 3, 'fallback point');
  return [-p[0], p[1], -p[2]];
}

/** Only for a genuine complete source-derived matrix; NEVER reconstruct from a proxy AABB. */
export function fallbackMatrixToPackage(worldMatrix) {
  const matrix = finiteMatrix(worldMatrix, 'fallback world matrix');
  const R = FALLBACK_TO_PACKAGE_AXES;
  const out = matrix.map((v, index) => {
    const row = index % 4, col = Math.floor(index / 4);
    return v * R[row] * R[col];
  });
  return out;
}

/**
 * Input only: {
 *   schemaVersion:1, contract:'CONTAINERS_FALLBACK_Z_TO_PACKAGE_X',
 *   pairs:[{
 *     sourceKey:'owner-qualified same serialized Unity object (private)',
 *     kind:'serialized-object'|'executed-camera',
 *     fallback:{coordinates:'fallback-z-reflected',position:[x,y,z],
 *               worldMatrix?:[16]},
 *     package:{coordinates:'package-x-reflected',position:[x,y,z],
 *              worldMatrix?:[16]},
 *     matrixSource:'complete-serialized-transform' // required if matrices
 *   }]
 * }
 * The output intentionally omits all source keys, positions and matrices.
 * It measures FRAME ALIGNMENT, not the original game's rendered pixels.
 */
export function auditContainersFramePairs(input, { tolerance = 1e-4 } = {}) {
  if (!input || input.schemaVersion !== 1 || input.contract !== SOURCE_CONTRACT ||
      !Array.isArray(input.pairs) || input.pairs.length === 0 || input.pairs.length > 2048) {
    throw new TypeError('Source-qualified Containers frame contract and 1..2048 pairs required');
  }
  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 1) {
    throw new RangeError('Invalid coordinate alignment tolerance');
  }
  const sourceKeys = new Set(), rawPoint = [], mappedPoint = [], matrices = [];
  let cameraPairs = 0;
  for (const pair of input.pairs) {
    if (!pair || typeof pair.sourceKey !== 'string' || !pair.sourceKey.trim() ||
        sourceKeys.has(pair.sourceKey)) {
      throw new TypeError('Each source pair needs a unique owner-qualified sourceKey');
    }
    sourceKeys.add(pair.sourceKey);
    if (pair.kind !== 'serialized-object' && pair.kind !== 'executed-camera') {
      throw new TypeError('Explicit serialized-object or executed-camera kind required');
    }
    if (pair.kind === 'executed-camera') cameraPairs++;
    if (pair.fallback?.coordinates !== 'fallback-z-reflected' ||
        pair.package?.coordinates !== 'package-x-reflected') {
      throw new Error('Mixed/unknown coordinate conventions: would invalidate visual registration');
    }
    const f = finiteVector(pair.fallback.position, 3, 'fallback.position');
    const p = finiteVector(pair.package.position, 3, 'package.position');
    rawPoint.push(distance(f, p));
    mappedPoint.push(distance(fallbackPointToPackage(f), p));
    const fm = pair.fallback.worldMatrix, pm = pair.package.worldMatrix;
    if ((fm === undefined) !== (pm === undefined)) {
      throw new Error('Incomplete world matrix pair; no implicit AABB-to-matrix conversion');
    }
    if (fm !== undefined) {
      if (pair.matrixSource !== 'complete-serialized-transform' &&
          pair.matrixSource !== 'executed-camera-transform') {
        throw new Error('Generated AABB/proxy cannot be treated as a complete Unity transform');
      }
      if (pair.kind === 'executed-camera' && pair.matrixSource !== 'executed-camera-transform') {
        throw new Error('Executed camera must have executed-camera-transform provenance');
      }
      const converted = fallbackMatrixToPackage(fm);
      finiteMatrix(pm, 'package.worldMatrix');
      // Translation and basis must match after R M R. Matrix compare is
      // source-space evidence only, never inferred from world AABB boxes.
      const deltas = converted.map((v, i) => Math.abs(v - pm[i]));
      matrices.push(Math.max(...deltas));
      const pointTranslation = [converted[12], converted[13], converted[14]];
      if (distance(pointTranslation, fallbackPointToPackage(f)) > tolerance) {
        throw new Error('Fallback matrix translation disagrees with its declared point');
      }
      if (distance([pm[12], pm[13], pm[14]], p) > tolerance) {
        throw new Error('Package matrix translation disagrees with its declared point');
      }
    } else if (pair.matrixSource !== undefined) {
      throw new Error('Matrix provenance declared without complete matrix pair');
    }
  }
  rawPoint.sort((a, b) => a - b);
  mappedPoint.sort((a, b) => a - b);
  matrices.sort((a, b) => a - b);
  const worst = Math.max(mappedPoint.at(-1), matrices.at(-1) ?? 0);
  return {
    schemaVersion: 1,
    status: worst <= tolerance
      ? 'SOURCE_POINT_FRAME_CONSISTENT_NOT_PIXEL_PARITY'
      : 'SOURCE_POINT_FRAME_MISMATCH_BLOCKS_PIXEL_REGISTRATION',
    evidenceClass: 'OWNER_SUPPLIED_SOURCE_PAIRS_NOT_EXECUTED_NATIVE_VERIFIED',
    contract: SOURCE_CONTRACT,
    pairCount: input.pairs.length,
    executedCameraPairsOwnerSupplied: cameraPairs,
    completeMatrixPairs: matrices.length,
    inputSpaces: ['fallback-z-reflected', 'package-x-reflected'],
    p95UnconvertedPositionDeltaWorldUnits: p95(rawPoint),
    p95ConvertedPositionDeltaWorldUnits: p95(mappedPoint),
    maxConvertedPositionDeltaWorldUnits: mappedPoint.at(-1),
    p95ConvertedMatrixCoefficientDelta: p95(matrices),
    toleranceWorldUnits: tolerance,
    pixelComparisonPerformed: false,
    nativeExecutedFrameAuthenticated: false,
    nativeWorldPoseMatched: false,
    oneToOneVerified: false,
    limitations: [
      'Owner-supplied source identities are not independently authenticated',
      'Fallback AABB proxies do not contain the original complete Unity rotations',
      'An executed native camera, matching state and real paired PNGs are separately required',
    ],
  };
}

export function readFrameAuditInput(path) {
  if (typeof path !== 'string' || !path) throw new TypeError('Private input path required');
  const text = readFileSync(path, 'utf8');
  if (Buffer.byteLength(text) > 1024 * 1024) {
    throw new RangeError('Coordinate pairs input exceeds 1 MiB');
  }
  return JSON.parse(text);
}

function cli(argv) {
  if (argv.length !== 2 || argv[0] !== '--pairs') {
    throw new Error('Usage: node scripts/visual-coordinate-frames.mjs --pairs /private/pairs.json');
  }
  const result = auditContainersFramePairs(readFrameAuditInput(argv[1]));
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (result.status !== 'SOURCE_POINT_FRAME_CONSISTENT_NOT_PIXEL_PARITY') process.exitCode = 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { cli(process.argv.slice(2)); }
  catch (error) { process.stderr.write('SH-15 frame preflight: ' + error.message + '\n'); process.exitCode = 2; }
}
