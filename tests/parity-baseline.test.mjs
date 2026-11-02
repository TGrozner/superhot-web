import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEVELS, buildStaticGeometry } from '../src/levels.js';
import { cameraAxes } from '../src/math.js';
import { createParityReport } from '../scripts/parity-report.mjs';

const report = createParityReport();
const scenarios = new Map(report.scenarios.map((scenario) => [scenario.id, scenario]));
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

test('report is deterministic, uniquely keyed, and makes no native-parity claims', () => {
  assert.deepEqual(report, createParityReport());
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.scope, 'WEB_PROTOTYPE_ONLY');
  assert.equal(report.nativeComparison, 'NOT_RUN');
  assert.equal(scenarios.size, report.scenarios.length);
  assert.ok(scenarios.size >= 9);
  for (const scenario of report.scenarios) {
    assert.match(scenario.id, /^[a-z0-9.-]+$/);
    assert.equal(scenario.nativeEvidence, null);
    assert.equal(scenario.parityVerdict, 'UNASSESSED');
    assert.ok('webResult' in scenario);
  }
});

test('the camera baselines use an orthonormal frame', () => {
  for (const id of ['camera.zero', 'camera.positive-yaw']) {
    const { webResult } = scenarios.get(id);
    const axes = Object.values(webResult);
    for (const axis of axes) {
      assert.ok(near(Math.hypot(axis.x, axis.y, axis.z), 1));
    }
    for (let i = 0; i < axes.length; i++) {
      for (let j = i + 1; j < axes.length; j++) {
        assert.ok(near(axes[i].x * axes[j].x + axes[i].y * axes[j].y + axes[i].z * axes[j].z, 0));
      }
    }
  }
  assert.deepEqual(scenarios.get('camera.zero').webResult, cameraAxes(0, 0));
});

test('collision baselines distinguish a hit, miss, occlusion, and walk pushout', () => {
  assert.ok(near(scenarios.get('collision.sphere-hit').webResult.fraction, 0.4));
  assert.equal(scenarios.get('collision.sphere-miss').webResult.fraction, null);
  const impact = scenarios.get('collision.wall-before-target').webResult;
  assert.ok(near(impact.wallFraction, 0.4));
  assert.ok(near(impact.targetFraction, 0.7));
  assert.equal(impact.occluded, true);
  const pushed = scenarios.get('collision.walk-pushout').webResult;
  assert.ok(near(pushed.x, 1.4));
  assert.ok(near(pushed.y, 1.6));
});

test('scene spawn geometry remains valid for the WEB prototype', () => {
  assert.equal(LEVELS.length, report.scenarios.filter((s) => s.domain === 'scene').length);
  for (const [index, level] of LEVELS.entries()) {
    const scene = scenarios.get(`scene.${index + 1}.structure`);
    assert.ok(scene, 'missing scene snapshot');
    assert.equal(scene.webResult.authoredObstacleCount, level.obstacles.length);
    assert.equal(scene.webResult.enemySpawnCount, level.enemies.length);
    const geometry = buildStaticGeometry(level);
    assert.equal(scene.webResult.renderedBoxCount, geometry.length);
    assert.equal(scene.webResult.solidBoxCount, geometry.filter((box) => box.solid).length);
    for (const box of geometry) {
      for (const key of ['x', 'y', 'z', 'w', 'h', 'd']) {
        assert.ok(Number.isFinite(box[key]), `${level.name} invalid ${key}`);
      }
      assert.ok(box.w > 0 && box.h > 0 && box.d > 0);
      if (box.solid) {
        const blocked = Math.abs(level.spawn.x - box.x) < box.w / 2 + 0.34 &&
          Math.abs(level.spawn.z - box.z) < box.d / 2 + 0.34;
        assert.equal(blocked, false, `${level.name} spawn intersects ${JSON.stringify(box)}`);
      }
    }
  }
});

test('CLI emits a parseable snapshot equivalent to the module API', () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const stdout = execFileSync(process.execPath, [resolve(root, 'scripts/parity-report.mjs')], {
    cwd: root,
    encoding: 'utf8',
  });
  // JSON deliberately normalizes negative zero; compare the serialized wire format.
  assert.deepEqual(JSON.parse(stdout), JSON.parse(JSON.stringify(report)));
});
