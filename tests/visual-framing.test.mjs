import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  readRenderedWebProjection, analyzeStructuralFraming, runAuditFromFrame,
} from '../scripts/visual-framing.mjs';

// No native assets or captures: fully generated camera fixture.
const frame = {
  frameId: 42, activeScreen: 'playing',
  camera: { x: 1, y: 2, z: 3, yaw: 0.5, pitch: -0.25 },
  projection: {
    verticalScale: 1.58, near: 0.045, far: 120, aspect: 16 / 9,
    viewProjection: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  },
};
const native = {
  verticalFovDegrees: 60.0000267, near: 0.03, far: 1000,
};

test('completed Web frame projection is copied without reading renderer source', () => {
  const projection = readRenderedWebProjection(frame);
  assert.deepEqual(projection, frame.projection);
  assert.notEqual(projection.viewProjection, frame.projection.viewProjection);
});

test('rendered parameters predict wider Web FOV and smaller on-axis silhouettes, not image parity', () => {
  const r = runAuditFromFrame(frame, native, { viewportHeightPx: 1080 });
  assert.equal(r.evidenceClass, 'NATIVE_PARAMETERS_VS_WEB_RENDERED_FRAME');
  assert.equal(r.status, 'PROJECTION_MISMATCH_NO_PIXEL_MEASUREMENT');
  assert.deepEqual(r.renderedFrame, frame);
  assert.ok(Math.abs(r.web.verticalFovDegrees - 64.66037147) < 1e-6);
  assert.ok(Math.abs(r.signedWebMinusNativeFovDegrees - 4.66034477) < 1e-5);
  assert.ok(Math.abs(r.projectedWebToNativeSilhouetteSizeRatio - 0.912213916) < 1e-8);
  assert.ok(Math.abs(r.signedWebMinusNativeProjectedSizePercent + 8.77860838) < 1e-6);
  assert.ok(Math.abs(r.idealizedReference.signedWebMinusNativeHeightPx + 8.212) < 0.2);
  assert.equal(r.webMinusNativeNear, 0.015);
  assert.equal(r.webMinusNativeFar, -880);
  assert.ok(r.limitations.some(line => line.includes('not observed pixels')));
});

test('equal native/Web numeric projection does not claim pixel or runtime parity', () => {
  const near = 0.03, far = 1000, f = 1.58;
  const r = analyzeStructuralFraming({
    native: { verticalFovDegrees: Math.atan(1 / f) * 360 / Math.PI, near, far },
    web: { verticalScale: f, near, far }, viewportHeightPx: 720,
  });
  assert.equal(r.status, 'PROJECTION_EQUALITY_NO_PIXEL_MEASUREMENT');
  assert.equal(r.evidenceClass, 'CAMERA_PARAMETERS_ONLY');
});

test('missing or malformed completed-frame projection fails closed', () => {
  for (const invalid of [
    null, { ...frame, frameId: 0 }, { ...frame, activeScreen: 'unknown' },
    { ...frame, camera: { ...frame.camera, yaw: NaN } },
    { ...frame, projection: null },
    ...[
      { verticalScale: 0 }, { near: -1 }, { far: 0.01 }, { aspect: Infinity },
      { viewProjection: [1, 2] }, { viewProjection: [...Array(15).fill(0), NaN] },
    ].map(change => ({ ...frame, projection: { ...frame.projection, ...change } })),
  ]) assert.throws(() => readRenderedWebProjection(invalid));
});

test('invalid native data, near/far or reference depth are rejected', () => {
  const base = { native, web: readRenderedWebProjection(frame), viewportHeightPx: 1080 };
  assert.throws(() => analyzeStructuralFraming({ ...base, native: { ...native, near: 1100 } }), /Native far/);
  assert.throws(() => analyzeStructuralFraming({ ...base, referenceDepth: 0.01 }), /Reference depth/);
  assert.throws(() => analyzeStructuralFraming({ ...base, native: { ...native, verticalFovDegrees: 180 } }), /FOV/);
  assert.throws(() => analyzeStructuralFraming({ ...base, web: { verticalScale: 0, near: .045, far: 120 } }), /positive/);
  assert.throws(() => analyzeStructuralFraming({ ...base, viewportHeightPx: NaN }), /positive/);
});

test('CLI emits aggregate projections only; no native file, screenshot or paths', () => {
  const temp = mkdtempSync(join(tmpdir(), 'sh15-framing-'));
  try {
    const file = join(temp, 'generated-frame.json');
    writeFileSync(file, JSON.stringify(frame));
    const run = spawnSync(process.execPath, [
      'scripts/visual-framing.mjs', '--web-frame', file, '--native-vfov', '60.0000267',
      '--native-near', '0.03', '--native-far', '1000',
    ], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const report = JSON.parse(run.stdout);
    assert.equal(report.status, 'PROJECTION_MISMATCH_NO_PIXEL_MEASUREMENT');
    assert.deepEqual(report.renderedFrame.projection, frame.projection);
    assert.ok(!run.stdout.includes(file));
    assert.ok(!run.stdout.includes('.png'));
    const bad = spawnSync(process.execPath, [
      'scripts/visual-framing.mjs', '--renderer', file, '--native-vfov', '60',
    ], { encoding: 'utf8' });
    assert.equal(bad.status, 2);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
