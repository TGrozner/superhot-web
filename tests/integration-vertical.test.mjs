import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { auditVerticalIntegration, scanImportReachability, assessContainersBrowserMetrics } from '../scripts/integration-vertical.mjs';

const fixture = (files, run) => {
  const root = mkdtempSync(join(tmpdir(), 'sh16-vertical-'));
  for (const [name, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), contents);
  }
  return Promise.resolve().then(() => run(root)).finally(() => rmSync(root, { recursive: true, force: true }));
};

test('SH16 finds static module dependency chains but does not equate existing files with integration', async () => {
  await fixture({
    'src/main.js': "import { start } from './levels.js';\nstart();\n",
    'src/levels.js': "export { make } from './scenes/graph.js';\nexport function start() {}\n",
    'src/scenes/graph.js': 'export function make() {}\n',
    'src/combat/shot-phases.js': 'export const shot = true;\n',
  }, (root) => {
    const graph = scanImportReachability(root);
    assert.deepEqual(graph.reachable, ['src/levels.js', 'src/main.js', 'src/scenes/graph.js']);
    assert.deepEqual(graph.missing, []);
    assert.ok(!graph.reachable.includes('src/combat/shot-phases.js'));
  });
});

test('SH16 reports a candidate module missing from main rather than claiming native scene parity', async () => {
  await fixture({
    'src/main.js': "import './levels.js';\n",
    'src/levels.js': 'export const a = 1;\n',
  }, async (root) => {
    const r = await auditVerticalIntegration(root);
    assert.equal(r.nativeParityVerdict, 'UNASSESSED');
    assert.equal(r.browserGpuTested, false);
    assert.equal(r.cargoCpuProbe.status, 'NO_CANDIDATE_MODULE');
    assert.equal(r.modules.cargo.present, false);
    assert.equal(r.modules.cargo.staticImportReachable, false);
    assert.ok(r.blockers.some((b) => b.owner === 'SH-04/SH-11'));
    assert.ok(r.blockers.some((b) => b.owner === 'SH-05/SH-15'));
  });
});

test('SH16 current checkout remains UNASSESSED independent of green Web tests', async () => {
  const r = await auditVerticalIntegration();
  assert.equal(r.schemaVersion, 2);
  assert.equal(r.target, 'Containers/build28');
  assert.equal(r.entrypoint, 'src/main.js');
  assert.equal(r.nativeParityVerdict, 'UNASSESSED');
  assert.equal(r.nativeExecutionObserved, false);
  assert.equal(r.browserGpuTested, false);
  assert.equal(r.browserCaptureCompared, false);
  assert.equal(r.flags.affineBoxRendererDeclared, true);
  assert.equal(r.flags.legacyCollisionSourceDetected, true);
  assert.equal(r.flags.containersPreviewWired, true);
  assert.equal(r.flags.localObjPreviewWired, true);
  assert.equal(r.flags.containersPreviewCollidersExplicitlyCleared, true);
  assert.equal(r.flags.containersPreviewEnemiesExplicitlyCleared, true);
  assert.equal(r.cargoCpuProbe.sourceHullProxyAdapters, 5);
  assert.equal(r.cargoCpuProbe.staticLegacySpawnRisk.outsideLegacyZ, true);
  assert.deepEqual(r.legacyMovementClamp, {x:[-14.9, 14.9],z:[-33.8, 21.8]});
  assert.equal(r.sourceQualifiedMeshGroupsKnown, 2);
  assert.equal(r.userSelectedPrivateMeshesObserved, null);
  assert.ok(r.staticImportGraph.moduleCount >= 3);
});

test('SH16 distinguishes source-group upload path from a real measured browser session', () => {
  assert.deepEqual(assessContainersBrowserMetrics(), {
    status: 'NOT_OBSERVED', nativeParityVerdict: 'UNASSESSED',
  });
  assert.equal(assessContainersBrowserMetrics({
    mode: 'SYNTHETIC_NOT_MCD', browserMeasured: true,
  }).status, 'INVALID_OR_NOT_CONTAINERS');
  const partial = assessContainersBrowserMetrics({
    mode: 'CONTAINERS_COLLIDER_PROXY_NOT_MCD_RUNTIME', browserMeasured: true,
    locallyLoadedSourceGroups: 0,
    generatedManifest: { privateIndexedDraws: 0, hiddenByPrivateMesh: 0 },
    totalWebGLDrawCalls: 16, p95FrameMs: 16.7,
  });
  assert.equal(partial.status, 'GENERATED_OR_PARTIAL_PROXY_ONLY');
  const observed = assessContainersBrowserMetrics({
    mode: 'CONTAINERS_COLLIDER_PROXY_NOT_MCD_RUNTIME', browserMeasured: true,
    locallyLoadedSourceGroups: 2,
    generatedManifest: { privateIndexedDraws: 2, hiddenByPrivateMesh: 18 },
    totalWebGLDrawCalls: 30, p95FrameMs: 16.7,
  });
  assert.equal(observed.status, 'APP_REPORTED_INDEXED_MESH_DRAWS');
  assert.equal(observed.sourceMatchedHullFraction, '2/5');
  assert.equal(observed.browserScreenshotCaptured, false);
  assert.equal(observed.nativeParityVerdict, 'UNASSESSED');
  assert.equal(assessContainersBrowserMetrics({
    mode: 'CONTAINERS_COLLIDER_PROXY_NOT_MCD_RUNTIME', browserMeasured: true,
    locallyLoadedSourceGroups: 1,
    generatedManifest: { privateIndexedDraws: 2, hiddenByPrivateMesh: 12 },
    totalWebGLDrawCalls: 3, p95FrameMs: 16.7,
  }).status, 'INVALID_COUNTERS');
});
