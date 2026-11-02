import test from 'node:test';
import assert from 'node:assert/strict';
import {
  summarizePreparedNativeWorld,
  assessNativeWorldBrowserFrame,
  assessNativeElevatedPlatformBindings, projectPreparedColliderRoi,
  assessPreparedColliderActivation, assessNativeWorldEncounterTrace,
} from '../scripts/integration-native-world.mjs';

const sampleSource = () => ({
  meshes: new Map([['mesh-a', {}], ['mesh-b', {}]]),
  textures: new Map([['texture-a', {}]]),
  instances: [
    { meshId: 'mesh-a', draws: [{ meshId: 'mesh-a', range: { firstIndex: 0, indexCount: 3 } }] },
    { meshId: 'mesh-b', draws: [{ meshId: 'mesh-b', range: { firstIndex: 6, indexCount: 6 } }] },
  ],
  camera: { projection: { verticalFov: 60 } },
  pistol: { instance: {}, mesh: {} },
  anchors: { player: [{}], enemy: [{},{}] },
  colliders: [{ isTrigger: false }, { isTrigger: true }, { isTrigger: false }],
});

function syntheticBrowserEvidence() {
  return {
    metrics: {
      mode: 'NATIVE_ORIGINAL_GEOMETRY_WEB_GAMEPLAY',
      browserMeasured: true,
      nativeScene: { meshes: 2, instances: 2, textures: 1 },
      p95FrameMs: 16.5, enemies: [{ alive: false }],
    },
    frame: {
      frameId: 15, activeScreen: 'playing', worldClock: 2.1,
      nativeScene: { meshes: 2, instances: 2, textures: 1 },
      generatedManifest: {
        nativeGeometry: true, drawCalls: 2, triangles: 3, nativeMaterialParity: false,
      },
      totalWebGLDrawCalls: 4,
      nativeEnemy: { skinned: true, drawCalls: 1, clip: 'walk', sampledTime: .25 },
    },
  };
}

test('native world integration budget is derived from prepared source draw ranges, not hardcoded screenshot numbers', () => {
  const source = summarizePreparedNativeWorld(sampleSource());
  assert.equal(source.kind, 'PREPARED_OWNER_LOCAL_SOURCE_WEB_BUDGET_NOT_NATIVE_RUNTIME_DRAW');
  assert.deepEqual({
    meshes: source.meshes, instances: source.instances, textures: source.textures,
    indexedDraws: source.indexedDraws, triangles: source.triangles,
    nonTriggerColliders: source.nonTriggerColliders, triggerColliders: source.triggerColliders,
    authorEnemyAnchors: source.authorEnemyAnchors,
  }, {
    meshes: 2, instances: 2, textures: 1, indexedDraws: 2, triangles: 3,
    nonTriggerColliders: 2, triggerColliders: 1, authorEnemyAnchors: 2,
  });
  assert.equal(source.nativeExecutionObserved, false);
  assert.equal(source.nativeParityVerdict, 'UNASSESSED');
});

test('native world integration budget fails on missing indexed mesh or invalid triangle range', () => {
  const missing = sampleSource();
  missing.instances[0].meshId = 'absent';
  assert.throws(() => summarizePreparedNativeWorld(missing), /unresolved drawable/);
  const broken = sampleSource();
  broken.instances[1].draws[0].range.indexCount = 5;
  assert.throws(() => summarizePreparedNativeWorld(broken), /invalid indexed draw/);
});

test('SH16 separates exact same-frame source counters from independent pixel/native evidence', () => {
  const evidence = syntheticBrowserEvidence();
  const assessed = assessNativeWorldBrowserFrame({
    ...evidence, sourceBudget: summarizePreparedNativeWorld(sampleSource()),
  });
  assert.equal(assessed.status, 'APP_REPORTED_NATIVE_SOURCE_WEB_WORLD_SUBMISSION_NO_PIXEL_PARITY');
  assert.equal(assessed.worldGeometry.indexedDraws, 2);
  assert.equal(assessed.worldGeometry.triangles, 3);
  assert.equal(assessed.lastDrawnCharacter.status, 'LAST_ACTOR_SKINNED_GPU_SUBMISSION');
  assert.equal(assessed.lastDrawnCharacter.clip, 'walk');
  assert.equal(assessed.combat, 'WEB_TARGET_DEFEAT_STATE_ONLY');
  assert.equal(assessed.nativeMatchedPixelComparisonPerformed, false);
  assert.equal(assessed.actualGpuPixelsIndependentlyInspected, false);
  assert.equal(assessed.nativeParityVerdict, 'UNASSESSED');
});

test('SH16 rejects injected or drifting frame counts instead of treating Node fixtures as GPU proof', () => {
  const base = syntheticBrowserEvidence();
  assert.equal(assessNativeWorldBrowserFrame({}).status, 'NOT_OBSERVED');
  assert.equal(assessNativeWorldBrowserFrame({
    metrics: { ...base.metrics, mode: 'CONTAINERS_COLLIDER_PROXY_NOT_MCD_RUNTIME' },
    frame: base.frame,
  }).status, 'NOT_NATIVE_WORLD_MODE');
  assert.equal(assessNativeWorldBrowserFrame({
    metrics: { ...base.metrics, browserMeasured: false }, frame: base.frame,
  }).status, 'INVALID_FRAME_OR_SOURCE_DRAW_COUNTERS');
  assert.equal(assessNativeWorldBrowserFrame({
    metrics: base.metrics,
    frame: { ...base.frame, generatedManifest: { ...base.frame.generatedManifest, drawCalls: 5 } },
  }).status, 'INVALID_FRAME_OR_SOURCE_DRAW_COUNTERS');
  assert.equal(assessNativeWorldBrowserFrame({
    metrics: { ...base.metrics, nativeScene: { meshes: 3, instances: 2, textures: 1 } },
    frame: base.frame,
  }).status, 'STALE_OR_CONTRADICTORY_SCENE_TELEMETRY');
  assert.equal(assessNativeWorldBrowserFrame({
    ...base, sourceBudget: { ...summarizePreparedNativeWorld(sampleSource()), triangles: 400 },
  }).status, 'PREPARED_SOURCE_WEB_DRAW_BUDGET_MISMATCH');
});

test('SH16 uses only the last rendered enemy as character evidence, never claims all actors or native hit proof', () => {
  const base = syntheticBrowserEvidence();
  const result = assessNativeWorldBrowserFrame({
    metrics: { ...base.metrics, enemies: [{ alive: true }] },
    frame: { ...base.frame, nativeEnemy: null },
  });
  assert.equal(result.lastDrawnCharacter.status, 'LAST_ACTOR_NOT_PROVEN_SKINNED');
  assert.equal(result.combat, 'NATIVE_COMBAT_NOT_PROVEN');
  assert.equal(result.browserScreenshotCaptured, false);
  assert.equal(result.nativePhysicsParityVerified, false);
});



function sourcePlatformFixture() {
  const m7 = { source: { pathId: 7 }, ranges: new Map([[34, { firstIndex: 0, indexCount: 36 }]]) };
  const m6 = { source: { pathId: 6 }, ranges: new Map([[25, { firstIndex: 0, indexCount: 36 }]]) };
  const first = { meshId: 'm7', source: { goPathId: 379 }, draws: [
    { meshId: 'm7', range: { firstIndex: 0, indexCount: 36 } },
  ] };
  const second = { meshId: 'm6', source: { goPathId: 392 }, draws: [
    { meshId: 'm6', range: { firstIndex: 0, indexCount: 36 } },
  ] };
  return {
    prepared: {
      meshes: new Map([['m7', m7], ['m6', m6]]),
      instanceMap: new Map([['i379', first], ['i392', second]]),
      colliders: [
        { id: 'c15807', pathId: 15807, goPathId: 379, isTrigger: false,
          worldAabb: { min: [-.4, -.3, .2], max: [-.1, .1, .4] } },
        { id: 'c15811', pathId: 15811, goPathId: 392, isTrigger: false,
          worldAabb: { min: [.1, -.2, .3], max: [.4, .2, .6] } },
      ],
    },
    bindings: [
      { goPathId: 379, instanceId: 'i379', colliderId: 'c15807' },
      { goPathId: 392, instanceId: 'i392', colliderId: 'c15811' },
    ],
    frame: { projection: { aspect: 16 / 9, viewProjection: [
      1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1,
    ] } },
    viewport: { width: 1920, height: 1080 },
  };
}

test('SH16 two source elevated surfaces have independent world ranges, colliders, and projected screen ROI candidates', () => {
  const input = sourcePlatformFixture();
  const result = assessNativeElevatedPlatformBindings(input);
  assert.deepEqual(result.surfaces.map(s => s.goPathId), [379, 392]);
  assert.deepEqual(result.surfaces.map(s => s.submesh), [34, 25]);
  assert.deepEqual(result.surfaces.map(s => s.colliderPathId), [15807, 15811]);
  assert.equal(result.preparedCandidateDraws, 2);
  assert.equal(result.preparedCandidateTriangles, 24);
  for (const candidate of result.surfaces) {
    assert.equal(candidate.status, 'SOURCE_IDS_AND_PREPARED_WORLD_RANGE_LINKED_NO_GPU_PIXEL_PROOF');
    assert.equal(candidate.explicitNativePathIdsVerified, true);
    assert.equal(candidate.sourceWorldPassCandidateTriangles, 12);
    assert.equal(candidate.gpuDrawObserved, false);
    assert.equal(candidate.colliderRoi.status, 'WEB_COLLIDER_AABB_PROJECTED_ROI_NOT_MESH_OR_PIXEL_PROOF');
    assert.ok(candidate.colliderRoi.viewportCoverageUpperBound > 0);
    assert.ok(candidate.colliderRoi.viewportCoverageUpperBound < 1);
  }
  assert.equal(result.measuredNativePixelDelta, null);
  assert.equal(result.nativeParityVerdict, 'UNASSESSED');
});

test('SH16 refuses invisible or unbound raised platform GO rather than assuming collider == world-pass draw', () => {
  const x = sourcePlatformFixture();
  assert.deepEqual(
    assessNativeElevatedPlatformBindings({ prepared: x.prepared }).surfaces.map(s => s.status),
    ['OWNER_LOCAL_INSTANCE_AND_COLLIDER_SELECTOR_REQUIRED', 'OWNER_LOCAL_INSTANCE_AND_COLLIDER_SELECTOR_REQUIRED'],
  );
  x.bindings[0].instanceId = 'not-an-eligible-instance';
  const result = assessNativeElevatedPlatformBindings(x);
  assert.equal(result.surfaces[0].status, 'MISSING_ELIGIBLE_WORLD_PASS_INSTANCE');
  assert.equal(result.preparedCandidateDraws, 1);
});

test('SH16 strictly detects mismatched submesh 34/25 ranges and trigger-as-floor mistakes', () => {
  const x = sourcePlatformFixture();
  x.prepared.meshes.get('m7').ranges.get(34).indexCount = 33;
  x.prepared.colliders[1].isTrigger = true;
  const results = assessNativeElevatedPlatformBindings(x).surfaces;
  assert.equal(results[0].status, 'MISSING_OR_INVALID_SOURCE_SUBMESH_DRAW_RANGE');
  assert.equal(results[1].status, 'SOURCE_COLLIDER_IS_TRIGGER_NOT_FLOOR');
});

test('SH16 identifies owner-local packet associations without inventing native path IDs', () => {
  const x = sourcePlatformFixture();
  delete x.prepared.instanceMap.get('i379').source.goPathId;
  delete x.prepared.colliders[0].goPathId;
  const result = assessNativeElevatedPlatformBindings(x);
  assert.equal(result.surfaces[0].status, 'PREPARED_WORLD_RANGE_AND_COLLIDER_LINKED_SOURCE_IDS_UNATTESTED');
  assert.equal(result.surfaces[0].explicitNativePathIdsVerified, false);
  assert.equal(result.surfaces[1].explicitNativePathIdsVerified, true);
});

test('SH16 ROI is based on the actual Web view-projection and refuses near-clipped AABBs', () => {
  const x = sourcePlatformFixture();
  const roi = projectPreparedColliderRoi({
    collider: x.prepared.colliders[0], frame: x.frame, viewport: x.viewport,
  });
  assert.ok(roi.rectPx.width > 0 && roi.rectPx.height > 0);
  const cameraBehind = sourcePlatformFixture();
  cameraBehind.frame.projection.viewProjection[15] = -1;
  assert.equal(projectPreparedColliderRoi({
    collider: cameraBehind.prepared.colliders[0], frame: cameraBehind.frame, viewport: x.viewport,
  }).status, 'AABB_CROSSES_NEAR_PLANE_OR_BEHIND_CAMERA');
  assert.equal(projectPreparedColliderRoi({
    collider: x.prepared.colliders[0], frame: {}, viewport: x.viewport,
  }).status, 'VIEW_PROJECTION_VIEWPORT_OR_WORLD_AABB_MISSING');
  const wrongAspect = sourcePlatformFixture();
  wrongAspect.frame.projection.aspect = 1;
  assert.equal(projectPreparedColliderRoi({
    collider: wrongAspect.prepared.colliders[0], frame: wrongAspect.frame, viewport: x.viewport,
  }).status, 'WEB_FRAME_PROJECTION_VIEWPORT_ASPECT_MISMATCH');
  const farClipped = sourcePlatformFixture();
  farClipped.frame.projection.viewProjection[10] = 10;
  assert.equal(projectPreparedColliderRoi({
    collider: farClipped.prepared.colliders[0], frame: farClipped.frame, viewport: x.viewport,
  }).status, 'AABB_CROSSES_FAR_PLANE_ROI_UNRELIABLE');
});

test('SH16 flags source-disabled non-trigger as potential invisible Web wall, not executed PhysX proof', () => {
  const prepared = { colliders: [
    { id: 'active', isTrigger: false, initial: { enabled: true, activeInHierarchy: true } },
    { id: 'disabled', isTrigger: false, initial: { enabled: true, activeInHierarchy: true } },
    { id: 'trigger', isTrigger: true },
  ] };
  const qualifiedSourceStates = new Map([
    ['active', { componentEnabled: true, hierarchyActive: true }],
    ['disabled', { componentEnabled: false, hierarchyActive: true }],
  ]);
  const r = assessPreparedColliderActivation({ prepared, qualifiedSourceStates });
  assert.equal(r.webNonTriggerSolids, 2);
  assert.equal(r.triggersExcludedByWeb, 1);
  assert.equal(r.sourceQualifiedActiveSolids, 1);
  assert.equal(r.sourceQualifiedInactiveSolidsStillInWeb, 1);
  assert.equal(r.sourceActivationUnknownWebSolids, 0);
  assert.equal(r.status, 'SERIALIZED_INACTIVE_COLLIDERS_INCLUDED_AS_WEB_SOLIDS_POTENTIAL_INVISIBLE_WALL');
  assert.equal(r.browserWebContactActuallyObserved, false);
  assert.equal(r.originalPhysXContactActuallyObserved, false);
  assert.equal(r.nativeParityVerdict, 'UNASSESSED');
});

test('SH16 excludes disabled components and inactive hierarchies from Web solids', () => {
  const prepared = { colliders: [
    { id: 'active', isTrigger: false, initial: { enabled: true, activeInHierarchy: true } },
    { id: 'disabled', isTrigger: false, initial: { enabled: false, activeInHierarchy: true } },
    { id: 'inactive', isTrigger: false, initial: { enabled: true, activeInHierarchy: false } },
  ] };
  const qualifiedSourceStates = new Map(prepared.colliders.map(collider => [
    collider.id,
    { componentEnabled: collider.initial.enabled, hierarchyActive: collider.initial.activeInHierarchy },
  ]));
  const report = assessPreparedColliderActivation({ prepared, qualifiedSourceStates });
  assert.equal(report.webNonTriggerSolids, 1);
  assert.equal(report.sourceQualifiedActiveSolids, 1);
  assert.equal(report.sourceQualifiedInactiveSolidsStillInWeb, 0);
  assert.equal(report.status, 'SUPPLIED_SERIALIZED_ACTIVATION_MATCHES_WEB_MEMBERSHIP_NOT_NATIVE_PHYSX');
});

test('SH16 refuses to infer source activation or native collision from absent fields', () => {
  const prepared = { colliders: [
    { id: 'platform379', isTrigger: false, initial: { enabled: true, activeInHierarchy: true } },
    { id: 'platform392', isTrigger: false, initial: { enabled: true, activeInHierarchy: true } },
  ] };
  const r = assessPreparedColliderActivation({ prepared });
  assert.equal(r.webNonTriggerSolids, 2);
  assert.equal(r.sourceActivationUnknownWebSolids, 2);
  assert.equal(r.sourceQualifiedInactiveSolidsStillInWeb, 0);
  assert.equal(r.status, 'SERIALIZED_COLLIDER_ACTIVATION_NOT_FULLY_QUALIFIED');
  assert.equal(r.originalPhysXContactActuallyObserved, false);
});

test('SH16 recognizes complete qualified active Web solids without upgrading to runtime native proof', () => {
  const prepared = { colliders: [
    { id: 15807, isTrigger: false, initial: { enabled: true, activeInHierarchy: true } },
    { id: 15811, isTrigger: false, initial: { enabled: true, activeInHierarchy: true } },
    { id: 99, isTrigger: true },
  ] };
  const qualifiedSourceStates = new Map([
    [15807, { componentEnabled: true, hierarchyActive: true }],
    [15811, { componentEnabled: true, hierarchyActive: true }],
  ]);
  const r = assessPreparedColliderActivation({ prepared, qualifiedSourceStates });
  assert.equal(r.sourceQualifiedActiveSolids, 2);
  assert.equal(r.sourceQualifiedInactiveSolidsStillInWeb, 0);
  assert.equal(r.status, 'SUPPLIED_SERIALIZED_ACTIVATION_MATCHES_WEB_MEMBERSHIP_NOT_NATIVE_PHYSX');
});

test('SH16 fails closed on unqualified, malformed or foreign source activation data', () => {
  const prepared = { colliders: [
    { id: 'a', isTrigger: false, initial: { enabled: true, activeInHierarchy: true } },
  ] };
  assert.throws(() => assessPreparedColliderActivation({
    prepared, qualifiedSourceStates: new Map([['a', { componentEnabled: true }]]),
  }), /booleans/);
  assert.throws(() => assessPreparedColliderActivation({
    prepared, qualifiedSourceStates: new Map([['b', { componentEnabled: true, hierarchyActive: true }]]),
  }), /not a prepared collider/);
  assert.throws(() => assessPreparedColliderActivation({
    prepared: { colliders: [{ id: 'a', isTrigger: 0 }] },
  }), /boolean isTrigger/);
  assert.throws(() => assessPreparedColliderActivation({
    prepared: { colliders: [prepared.colliders[0], prepared.colliders[0]] },
  }), /unique ID/);
});


function browserEncounterTraceFixture() {
  const earlier = syntheticBrowserEvidence();
  earlier.metrics.enemies = [{ alive: true }, { alive: true }];
  earlier.frame.frameId = 10;
  earlier.frame.worldClock = 1;
  earlier.frame.gameplay = { nativeClock: true, ammo: 5, weapon: true };
  const later = structuredClone(earlier);
  later.frame.frameId = 16;
  later.frame.worldClock = 1.3;
  later.frame.gameplay.ammo = 4;
  later.metrics.enemies[0].alive = false;
  return {
    samples: [earlier, later],
    sourceBudget: summarizePreparedNativeWorld(sampleSource()),
  };
}

test('SH16 vertical receipt requires actual prepared source budget, not hardcoded 68/360 counts', () => {
  const fixture = browserEncounterTraceFixture();
  assert.equal(assessNativeWorldEncounterTrace({
    samples: fixture.samples,
  }).status, 'EXACT_OWNER_LOCAL_SOURCE_BUDGET_REQUIRED');
  assert.equal(assessNativeWorldEncounterTrace({
    sourceBudget: fixture.sourceBudget, samples: [],
  }).status, 'REQUIRE_TWO_TO_64_CONSECUTIVE_BROWSER_SAMPLES');
});

test('SH16 reports an app-only world→skinned actor→ammo→Web defeat candidate, NEVER a native collision', () => {
  const report = assessNativeWorldEncounterTrace(browserEncounterTraceFixture());
  assert.equal(report.status, 'WEB_WORLD_ACTOR_AMMO_AND_ASYNC_DEFEAT_SEQUENCE_ONLY');
  assert.equal(report.sourceWorld.trianglesPerFrame, 3);
  assert.equal(report.sourceWorld.drawCallsPerFrame, 2);
  assert.deepEqual(report.actor.lastActorSkinnedSubmissionSamples, [0, 1]);
  assert.deepEqual(report.webCombat.ammoDecreaseCandidateSamples, [1]);
  assert.deepEqual(report.webCombat.asyncAliveToDeadCandidates, [{ sample: 1, enemyIndex: 0 }]);
  assert.equal(report.actor.identityOfDamagedBodyPartKnown, false);
  assert.equal(report.webCombat.sameProjectileToBodyPartCausalityProven, false);
  assert.equal(report.matchedNativeGameplayPixels, false);
  assert.equal(report.nativeParityVerdict, 'UNASSESSED');
});

test('SH16 rejects late world-frame counter drift instead of conflating two scenes', () => {
  const fixture = browserEncounterTraceFixture();
  fixture.samples[1].frame.generatedManifest.triangles++;
  assert.equal(assessNativeWorldEncounterTrace(fixture).status, 'SOURCE_WORLD_FRAME_GATE_FAILED');
  const stable = browserEncounterTraceFixture();
  stable.samples[1].frame.nativeScene.instances = 3;
  assert.equal(assessNativeWorldEncounterTrace(stable).status, 'SOURCE_WORLD_FRAME_GATE_FAILED');
});

test('SH16 refuses reset, reversed chronology and out-of-game native clock samples', () => {
  const fixture = browserEncounterTraceFixture();
  fixture.samples[1].frame.frameId = 9;
  assert.equal(assessNativeWorldEncounterTrace(fixture).status, 'NON_MONOTONIC_FRAME_OR_WORLD_CLOCK');
  const reset = browserEncounterTraceFixture();
  reset.samples[1].frame.worldClock = 0;
  assert.equal(assessNativeWorldEncounterTrace(reset).status, 'NON_MONOTONIC_FRAME_OR_WORLD_CLOCK');
  const paused = browserEncounterTraceFixture();
  paused.samples[1].frame.gameplay.nativeClock = false;
  assert.equal(assessNativeWorldEncounterTrace(paused).status, 'PLAYING_NATIVE_CLOCK_AND_WEAPON_STATE_REQUIRED');
});

test('SH16 does not count throwing an empty gun or ammo reload as a native bullet hit', () => {
  const fixture = browserEncounterTraceFixture();
  fixture.samples[1].frame.gameplay.weapon = false;
  assert.equal(assessNativeWorldEncounterTrace(fixture).status, 'NO_AMMO_DECREASE_CANDIDATE');
  const reload = browserEncounterTraceFixture();
  reload.samples[1].frame.gameplay.ammo = 6;
  assert.equal(assessNativeWorldEncounterTrace(reload).status, 'NO_AMMO_DECREASE_CANDIDATE');
});

test('SH16 does not infer source-native damage from an isolated target death or unverified skin', () => {
  const fixture = browserEncounterTraceFixture();
  fixture.samples[1].metrics.enemies[0].alive = true;
  assert.equal(assessNativeWorldEncounterTrace(fixture).status, 'NO_ASYNC_WEB_ENEMY_DEFEAT_TRANSITION');
  const actor = browserEncounterTraceFixture();
  for (const sample of actor.samples) sample.frame.nativeEnemy = null;
  assert.equal(assessNativeWorldEncounterTrace(actor).status, 'NO_SKINNED_ACTOR_SUBMITTED_IN_WORLD_TRACE');
  const stale = browserEncounterTraceFixture();
  stale.samples[0].metrics.enemies[0].alive = false;
  assert.equal(assessNativeWorldEncounterTrace(stale).status, 'NO_ASYNC_WEB_ENEMY_DEFEAT_TRANSITION');
});
