import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  readStaticWebProjection, analyzeStructuralFraming, runAuditFromSource,
} from '../scripts/visual-framing.mjs';

// No native assets or captures: fully generated camera fixture.
const shader = [
  'const vertexShaderSource = ' + String.fromCharCode(96),
  '#version 300 es',
  'void main() {',
  '  float f = 1.58;',
  '  float near = .045, far = 120.0;',
  '  gl_Position = vec4(cam.x * f / uProjection.x, cam.y * f,',
  '    cam.z * (far+near) / (far-near) - 2.0 * far * near / (far-near), cam.z);',
  '}',
  String.fromCharCode(96) + ';',
].join('\n');
const native = {
  verticalFovDegrees: 60.0000267, near: 0.03, far: 1000,
};

test('static WebGL2 projection constants are extracted from shader text', () => {
  assert.deepEqual(readStaticWebProjection(shader), {
    verticalScale: 1.58, near: 0.045, far: 120, sourceClass: 'WEB_GLSL_STATIC',
  });
});

test('measured source parameters predict wider Web FOV and smaller on-axis silhouettes, not image parity', () => {
  const r = runAuditFromSource(shader, native, { viewportHeightPx: 1080 });
  assert.equal(r.evidenceClass, 'SERIALIZED_PARAMETERS_VS_WEB_SHADER_ONLY');
  assert.equal(r.status, 'SOURCE_PROJECTION_MISMATCH_NO_PIXEL_MEASUREMENT');
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
  assert.equal(r.status, 'SOURCE_PROJECTION_EQUALITY_NO_PIXEL_MEASUREMENT');
  assert.equal(r.evidenceClass, 'SERIALIZED_PARAMETERS_VS_WEB_SHADER_ONLY');
});

test('source format must fail closed on dynamic GLSL or ambiguous constants', () => {
  assert.throws(() => readStaticWebProjection(shader.replace('float f = 1.58', 'float f = uFov')),
    /one static GLSL perspective scale/);
  assert.throws(() => readStaticWebProjection(shader.replace('  float f = 1.58;',
    '  float f = 1.58; float f = 1.58;')), /found 2/);
  assert.throws(() => readStaticWebProjection(shader.replace('cam.y * f', 'cam.y * 1.58')),
    /Unrecognized Web perspective/);
  assert.throws(() => readStaticWebProjection(''), /vertex shader/);
});

test('invalid native data, near/far or reference depth are rejected', () => {
  const base = { native, web: readStaticWebProjection(shader), viewportHeightPx: 1080 };
  assert.throws(() => analyzeStructuralFraming({ ...base, native: { ...native, near: 1100 } }), /Native far/);
  assert.throws(() => analyzeStructuralFraming({ ...base, referenceDepth: 0.01 }), /Reference depth/);
  assert.throws(() => analyzeStructuralFraming({ ...base, native: { ...native, verticalFovDegrees: 180 } }), /FOV/);
  assert.throws(() => analyzeStructuralFraming({ ...base, web: { verticalScale: 0, near: .045, far: 120 } }), /positive/);
  assert.throws(() => analyzeStructuralFraming({ ...base, viewportHeightPx: NaN }), /positive/);
});

test('CLI emits aggregate projections only; no native file, screenshot or paths', () => {
  const temp = mkdtempSync(join(tmpdir(), 'sh15-framing-'));
  try {
    const file = join(temp, 'generated-renderer.js');
    writeFileSync(file, shader);
    const run = spawnSync(process.execPath, [
      'scripts/visual-framing.mjs', '--renderer', file, '--native-vfov', '60.0000267',
      '--native-near', '0.03', '--native-far', '1000',
    ], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const report = JSON.parse(run.stdout);
    assert.equal(report.status, 'SOURCE_PROJECTION_MISMATCH_NO_PIXEL_MEASUREMENT');
    assert.ok(!run.stdout.includes(file));
    assert.ok(!run.stdout.includes('.png'));
    const bad = spawnSync(process.execPath, [
      'scripts/visual-framing.mjs', '--renderer', file, '--native-vfov', '60',
    ], { encoding: 'utf8' });
    assert.equal(bad.status, 2);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('current checked-in Web renderer can be inspected without browser access', () => {
  const src = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
  const projection = readStaticWebProjection(src);
  assert.ok(projection.verticalScale > 0 && projection.far > projection.near);
});
