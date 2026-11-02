import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzePreviewCameraBoundary } from '../scripts/visual-camera-boundary.mjs';
import { CONTAINERS_BUILD28_DEMO_CAMERA } from '../src/scenes/containers-build28.js';

const source = [
  'if (moving) {',
  'state.camera.x = clamp(next.x, -14.9, 14.9);',
  'state.camera.z = clamp(next.z, -33.8, 21.8);',
  '}',
].join('\n');

test('actual generated demo camera predicts a 9.2-unit snap on first directional movement', () => {
  const result = analyzePreviewCameraBoundary(source, CONTAINERS_BUILD28_DEMO_CAMERA);
  assert.equal(result.status, 'FIRST_MOVEMENT_CAMERA_SNAP_PREDICTED_NOT_OBSERVED');
  assert.deepEqual(result.initial, { x: 11, z: 31 });
  assert.deepEqual(result.clamped, { x: 11, z: 21.8 });
  assert.deepEqual(result.signedDelta, { x: 0, z: -9.2 });
  assert.ok(Math.abs(result.predictedDisplacementWorldUnits - 9.2) < 1e-12);
  assert.match(result.evidenceClass, /STATIC_WEB_SOURCE/);
  assert.ok(result.notMeasured.some(item => item.includes('No browser frame')));
});

test('an in-bounds camera remains unchanged; negative and positive axis violations are explicit', () => {
  const okay = analyzePreviewCameraBoundary(source, { x: 10, z: 20 });
  assert.equal(okay.predictedDisplacementWorldUnits, 0);
  assert.equal(okay.status, 'INITIAL_CAMERA_WITHIN_LEGACY_MOVEMENT_BOUNDS');
  const outside = analyzePreviewCameraBoundary(source, { x: -25, z: -40 });
  assert.deepEqual(outside.signedDelta, { x: 10.1, z: 6.200000000000003 });
});

test('source shape and unknown clamps fail closed instead of inventing a displacement', () => {
  assert.throws(() => analyzePreviewCameraBoundary(source.replace('-33.8, 21.8', '21.8, -33.8')), /Invalid z/);
  assert.throws(() => analyzePreviewCameraBoundary(source + '\nstate.camera.z = clamp(next.z, -2, 20);'), /exactly one/);
  assert.throws(() => analyzePreviewCameraBoundary('state.camera.x = next.x'), /static movement clamp/);
  assert.throws(() => analyzePreviewCameraBoundary(source, { x: NaN, z: 31 }), /finite/);
});

test('currently checked-in shared entrypoint is analyzed read-only, never modified', () => {
  const text = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const actual = analyzePreviewCameraBoundary(text);
  assert.equal(actual.initial.z, CONTAINERS_BUILD28_DEMO_CAMERA.z);
  assert.equal(actual.status, 'FIRST_MOVEMENT_CAMERA_SNAP_PREDICTED_NOT_OBSERVED');
  assert.ok(Math.abs(actual.predictedDisplacementWorldUnits - 9.2) < 1e-12);
});
