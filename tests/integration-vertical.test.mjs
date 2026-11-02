import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { auditVerticalIntegration, scanImportReachability } from '../scripts/integration-vertical.mjs';

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
  assert.equal(r.schemaVersion, 1);
  assert.equal(r.target, 'Containers/build28');
  assert.equal(r.entrypoint, 'src/main.js');
  assert.equal(r.nativeParityVerdict, 'UNASSESSED');
  assert.equal(r.nativeExecutionObserved, false);
  assert.equal(r.browserGpuTested, false);
  assert.equal(r.browserCaptureCompared, false);
  assert.equal(r.flags.affineBoxRendererDeclared, true);
  assert.equal(r.flags.legacyCollisionSourceDetected, true);
  assert.ok(r.staticImportGraph.moduleCount >= 3);
});
