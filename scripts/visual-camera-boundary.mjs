#!/usr/bin/env node
// SH-15: source-only audit of an abrupt, perceptible preview camera displacement.
// This is NOT a browser screenshot or a claim about an active native MCD camera.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTAINERS_BUILD28_DEMO_CAMERA } from '../src/scenes/containers-build28.js';

const NUMBER = '(-?(?:\\d+(?:\\.\\d*)?|\\.\\d+))';

function clampRange(source, axis) {
  if (typeof source !== 'string') throw new TypeError('Web entrypoint text required');
  const regex = new RegExp(
    'state\\.camera\\.' + axis + '\\s*=\\s*clamp\\(next\\.' + axis +
      ',\\s*' + NUMBER + '\\s*,\\s*' + NUMBER + '\\s*\\)', 'g',
  );
  const matches = [...source.matchAll(regex)];
  if (matches.length !== 1) throw new Error('Expected exactly one static movement clamp for ' + axis);
  const min = Number(matches[0][1]), max = Number(matches[0][2]);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
    throw new RangeError('Invalid ' + axis + ' movement clamp');
  }
  return { min, max };
}

function finite(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(name + ' must be finite');
  }
  return value;
}

export function analyzePreviewCameraBoundary(source, camera = CONTAINERS_BUILD28_DEMO_CAMERA) {
  if (!camera || typeof camera !== 'object') throw new TypeError('Demo camera required');
  const bounds = { x: clampRange(source, 'x'), z: clampRange(source, 'z') };
  const initial = {
    x: finite(camera.x, 'camera.x'),
    z: finite(camera.z, 'camera.z'),
  };
  const clamped = Object.fromEntries(['x', 'z'].map(axis => [
    axis,
    Math.min(bounds[axis].max, Math.max(bounds[axis].min, initial[axis])),
  ]));
  const signedDelta = { x: clamped.x - initial.x, z: clamped.z - initial.z };
  const jumpDistance = Math.hypot(signedDelta.x, signedDelta.z);
  return {
    evidenceClass: 'STATIC_WEB_SOURCE_VS_GENERATED_DEMO_CAMERA_ONLY',
    status: jumpDistance ? 'FIRST_MOVEMENT_CAMERA_SNAP_PREDICTED_NOT_OBSERVED' :
      'INITIAL_CAMERA_WITHIN_LEGACY_MOVEMENT_BOUNDS',
    initial, bounds, clamped, signedDelta,
    predictedDisplacementWorldUnits: jumpDistance,
    notMeasured: [
      'No browser frame or actual movement executed',
      'Not an active MCD camera or a native/Web pixel difference',
      'Movement will also apply its requested step before the clamp',
    ],
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.includes('--help')) {
      process.stdout.write('Usage: node scripts/visual-camera-boundary.mjs [--main src/main.js]\n');
    } else {
      if (args.length !== 0 && (args.length !== 2 || args[0] !== '--main')) {
        throw new Error('Expected optional --main PATH only');
      }
      const source = readFileSync(resolve(args[1] ?? 'src/main.js'), 'utf8');
      process.stdout.write(JSON.stringify(analyzePreviewCameraBoundary(source), null, 2) + '\n');
    }
  } catch (error) {
    process.stderr.write('Source camera-boundary audit blocked: ' + error.message + '\n');
    process.exitCode = 2;
  }
}
