import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessDojoWorldActorSmoke, auditDojoStaticWiring, auditDojoCheckout,
} from '../scripts/integration-dojo-smoke.mjs';

const SOURCE = Object.freeze({
  sceneBuildIndex: 10,
  scenePath: 'Assets/Scenes/SHRL_Dojo2.unity',
  serializedOwner: 'level10',
});
const BUDGET = Object.freeze({
  kind: 'PREPARED_OWNER_LOCAL_SOURCE_WEB_BUDGET_NOT_NATIVE_RUNTIME_DRAW',
  meshes: 2, instances: 3, textures: 4, indexedDraws: 5, triangles: 21,
});

function sample(id, overrides = {}) {
  const nativeScene = { source: SOURCE, meshes: 2, instances: 3, textures: 4 };
  const frame = {
    frameId: id, activeScreen: 'playing', worldClock: id / 10,
    nativeScene,
    generatedManifest: { nativeGeometry: true, drawCalls: 5, triangles: 21 },
    totalWebGLDrawCalls: 8,
    nativeEnemy: { skinned: true, drawCalls: 1, clip: 'walk', sampledTime: .4 },
    gameplay: {
      nativeClock: true,
      encounter: { killTarget: 6, killed: 0, enemies: [{ alive: true, id: 12 }] },
    },
  };
  const metrics = {
    mode: 'NATIVE_ORIGINAL_GEOMETRY_WEB_GAMEPLAY', browserMeasured: true,
    nativeScene,
  };
  return { frame: { ...frame, ...overrides.frame },
    metrics: { ...metrics, ...overrides.metrics } };
}

const good = () => ({
  expectedSource: SOURCE, sourceBudget: BUDGET, samples: [sample(10), sample(11)],
});

test('SH16 Dojo real public checkout exposes world, actor, collision, encounter and trace hooks (static only)', () => {
  const report = auditDojoCheckout();
  assert.equal(report.status, 'DOJO_STATIC_WEB_INTERFACE_REACHABLE_NOT_EXECUTED');
  assert.ok(Object.values(report.checks).every(Boolean));
  assert.equal(report.liveDojoPackageInspected, false);
});

test('SH16 static audit fails if a world rendering hook is lost', () => {
  const report = auditDojoStaticWiring({ main: 'renderer.drawNativeWorld()', renderer: '', server: '' });
  assert.equal(report.status, 'DOJO_STATIC_WEB_INTERFACE_GAP');
  assert.equal(report.checks.sourceWorldGpuPath, false);
  assert.equal(report.checks.allowlistedScenePackage, false);
});

test('SH16 static audit refuses absent checkout source inputs', () => {
  assert.throws(() => auditDojoStaticWiring({ main: '', renderer: '' }), TypeError);
});

test('SH16 joins exact Dojo source with source-budgeted Web world, skinned actor and encounter', () => {
  const report = assessDojoWorldActorSmoke(good());
  assert.equal(report.status, 'DOJO_WORLD_ACTOR_ENCOUNTER_APP_TELEMETRY_ONLY');
  assert.equal(report.worldDrawCallsPerFrame, 5);
  assert.equal(report.lastActorSkinnedSubmissionSamples, 2);
  assert.equal(report.encounterSamples, 2);
  assert.equal(report.browserActuallyExecutedHere, false);
  assert.equal(report.actualGpuPixelsInspected, false);
  assert.equal(report.measuredVisibleDelta, null);
  assert.equal(report.nativeParityVerdict, 'UNASSESSED');
  assert.equal(report.completeDojoRunProven, false);
  assert.equal(report.shotToColliderToReactionProven, false);
});

test('SH16 refuses Containers or arbitrary build10 scene as Dojo', () => {
  for (const changed of [
    { sceneBuildIndex: 28 },
    { serializedOwner: 'level28' },
    { scenePath: 'Assets/Scenes/SHRL_ContainerPort.unity' },
    { scenePath: 'Assets/Scenes/SHRL_Dojo2_test.unity' },
  ]) {
    const gate = assessDojoWorldActorSmoke({ ...good(),
      expectedSource: { ...SOURCE, ...changed } });
    assert.equal(gate.status, 'EXPECTED_SOURCE_NOT_DOJO_BUILD10_LEVEL10');
  }
});

test('SH16 requires source budget and bounded samples, no faux browser success', () => {
  assert.equal(assessDojoWorldActorSmoke({ ...good(), sourceBudget: null }).status,
    'PREPARED_SOURCE_BUDGET_REQUIRED');
  for (const samples of [[], [sample(10)], Array.from({ length: 33 }, (_, i) => sample(i + 1))]) {
    assert.equal(assessDojoWorldActorSmoke({ ...good(), samples }).status,
      'TWO_TO_32_SAMPLED_WEB_FRAMES_REQUIRED');
  }
});

test('SH16 detects scene change in same-rendered frame before accepting unchanged Web geometry counts', () => {
  const data = good();
  data.samples[1].frame.nativeScene = { ...data.samples[1].frame.nativeScene,
    source: { ...SOURCE, sceneBuildIndex: 28 } };
  assert.equal(assessDojoWorldActorSmoke(data).status, 'RENDERED_FRAME_SOURCE_MISMATCH');
});

test('SH16 refuses stale one-second async metrics, even when rendered Web frame is Dojo', () => {
  const data = good();
  data.samples[1].metrics.nativeScene = { ...data.samples[1].metrics.nativeScene,
    source: { ...SOURCE, serializedOwner: 'level28' } };
  const result = assessDojoWorldActorSmoke(data);
  assert.equal(result.status, 'ASYNC_METRICS_SOURCE_MISMATCH');
  assert.equal(result.failingSample, 1);
});

test('SH16 rejects invented same-frame source world submissions and budget drift', () => {
  const data = good();
  data.samples[1].frame.generatedManifest = {
    ...data.samples[1].frame.generatedManifest, triangles: 22,
  };
  const result = assessDojoWorldActorSmoke(data);
  assert.equal(result.status, 'SOURCE_WORLD_SUBMISSION_INVALID');
  assert.equal(result.failingGate, 'PREPARED_SOURCE_WEB_DRAW_BUDGET_MISMATCH');
});

test('SH16 never upgrades non-browser telemetry to executed WebGL evidence', () => {
  const data = good();
  data.samples[1].metrics.browserMeasured = false;
  const result = assessDojoWorldActorSmoke(data);
  assert.equal(result.status, 'SOURCE_WORLD_SUBMISSION_INVALID');
  assert.equal(result.failingGate, 'INVALID_FRAME_OR_SOURCE_DRAW_COUNTERS');
});

test('SH16 distinguishes a source-world scene from an actually submitted skinned actor', () => {
  const data = good();
  data.samples.forEach(s => { s.frame.nativeEnemy = null; });
  const result = assessDojoWorldActorSmoke(data);
  assert.equal(result.status, 'DOJO_WORLD_SUBMITTED_NO_SKINNED_ACTOR_IN_SAMPLES');
  assert.equal(result.actualGpuPixelsInspected, false);
});

test('SH16 distinguishes source-world setup from an instantiated Dojo encounter', () => {
  const data = good();
  data.samples.forEach(s => { s.frame.gameplay.encounter = null; });
  const result = assessDojoWorldActorSmoke(data);
  assert.equal(result.status, 'DOJO_WORLD_SUBMITTED_ENCOUNTER_NOT_EXPOSED');
  assert.equal(result.completeDojoRunProven, false);
});

test('SH16 distinguishes rendered actors from a currently live enemy', () => {
  const data = good();
  data.samples.forEach(s => { s.frame.gameplay.encounter.enemies = [{ alive: false }]; });
  assert.equal(assessDojoWorldActorSmoke(data).status,
    'DOJO_WORLD_AND_ACTOR_NO_LIVE_ENEMY_IN_SAMPLES');
});

test('SH16 rejects world-clock reverse/reset and non-playing frames in a supposed same-run sample', () => {
  const data = good();
  data.samples[1].frame.worldClock = 0;
  assert.equal(assessDojoWorldActorSmoke(data).status, 'FRAME_OR_WORLD_CLOCK_REVERSED');
  data.samples[1].frame.worldClock = 1.2;
  data.samples[1].frame.activeScreen = 'win';
  assert.equal(assessDojoWorldActorSmoke(data).status, 'SOURCE_WORLD_SUBMISSION_INVALID');
  assert.equal(assessDojoWorldActorSmoke(data).failingGate,
    'INVALID_FRAME_OR_SOURCE_DRAW_COUNTERS');
});

test('SH16 treats synthetic source submissions as evidence candidates, never a native/Web pixel comparison', () => {
  const data = good();
  const before = JSON.stringify(data);
  const report = assessDojoWorldActorSmoke(data);
  assert.equal(JSON.stringify(data), before);
  assert.equal(report.nativeGameplayExecuted, false);
  assert.equal(report.matchedNativeWebPixels, false);
  assert.equal(report.nativePhysXContactProven, false);
});
