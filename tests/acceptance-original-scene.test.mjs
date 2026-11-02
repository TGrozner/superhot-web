import test from 'node:test';
import assert from 'node:assert/strict';
import { originalSceneDrawEvidence, renderedOriginalSceneEvidence, CONTAINERS_BUILD28_SOURCE } from '../scripts/acceptance-live-capture.mjs';

// Diagnostic fixtures of the CURRENT public Web telemetry, not executed MCD.
// Never put a deliberately red native/Web gate into ordinary Node CI.
const fullSourceWeb = () => ({
  mode: 'NATIVE_ORIGINAL_GEOMETRY_WEB_GAMEPLAY',
  matchedNativeScene: false, activeScreen: 'playing', browserMeasured: true,
  nativeScene: { source: CONTAINERS_BUILD28_SOURCE, meshes: 68, instances: 360, textures: 17 },
  generatedManifest: { drawCalls: 360, triangles: 185037,
    nativeGeometry: true, nativeMaterialParity: false },
  totalWebGLDrawCalls: 363, samples: 60, p95FrameMs: 16,
  nativeMaterialShaderMatch: false, nativeLightingMatch: false,
  localNativeEnemy: { owner: 'sharedassets0.assets', variant: 'merged',
    meshPathId: 284, triangles: 2254 },
  nativeEnemyIndexedDrawCalls: 1, skinAnimationVerified: true,
  nativeEnemySpawnVerified: false, nativeSkin: { availableClips: ['idle', 'walk', 'hit'] },
});

test('current full source scene is a browser draw receipt, NEVER a native parity verdict', () => {
  const result = originalSceneDrawEvidence(fullSourceWeb(), { requireSkin: true });
  assert.equal(result.status, 'WEB_APP_REPORTED_FULL_SOURCE_SCENE_AND_SKIN_NOT_MCD_PARITY');
  assert.equal(result.nativeParityCertified, false);
  assert.equal(result.independentGpuReadback, false);
  assert.deepEqual(result.reasons, []);
});

test('fallback, unbound or incomplete source packages cannot pass original-scene gate', () => {
  const stats = fullSourceWeb();
  const check = patch => originalSceneDrawEvidence({ ...stats, ...patch }).reasons;
  assert.ok(check({ mode: 'CONTAINERS_COLLIDER_PROXY_NOT_MCD_RUNTIME' })
    .includes('ORIGINAL_SOURCE_SCENE_WEB_MODE_UNVERIFIED'));
  assert.ok(check({ matchedNativeScene: true })
    .includes('NATIVE_SCENE_NOT_PROVEN_FLAG_MISSING'));
  assert.ok(check({ nativeScene: { source: CONTAINERS_BUILD28_SOURCE, meshes: 68, instances: 359, textures: 17 } })
    .includes('FULL_LOCAL_SCENE_PACKAGE_UNVERIFIED'));
  assert.ok(check({ nativeScene: null }).includes('FULL_LOCAL_SCENE_PACKAGE_UNVERIFIED'));
});


test('Dojo/build10 with identical counters must not masquerade as Containers/build28', () => {
  const baseline = fullSourceWeb();
  const sameBudgetDojo = {
    ...baseline.nativeScene,
    source: { sceneBuildIndex: 10, scenePath: 'Assets/Scenes/SHRL/SHRL_Dojo2/SHRL_Dojo2.unity', serializedOwner: 'level10' },
  };
  const check = scene => originalSceneDrawEvidence({ ...baseline, nativeScene: scene }).reasons;
  assert.deepEqual(check(baseline.nativeScene), []);
  assert.ok(check(sameBudgetDojo).includes('CONTAINERS_BUILD28_SOURCE_IDENTITY_UNVERIFIED'));
  assert.ok(check({ ...baseline.nativeScene, source: null })
    .includes('CONTAINERS_BUILD28_SOURCE_IDENTITY_UNVERIFIED'));
  assert.ok(check({ ...baseline.nativeScene,
    source: { ...CONTAINERS_BUILD28_SOURCE, scenePath: 'Assets/Scenes/SHRL/Other.unity' } })
    .includes('CONTAINERS_BUILD28_SOURCE_IDENTITY_UNVERIFIED'));
  assert.ok(originalSceneDrawEvidence({ ...baseline, mode: 'CONTAINERS_ORIGINAL_GEOMETRY_WEB_GAMEPLAY' })
    .reasons.includes('ORIGINAL_SOURCE_SCENE_WEB_MODE_UNVERIFIED'));
  assert.equal(originalSceneDrawEvidence({ ...baseline, nativeScene: sameBudgetDojo }).nativeParityCertified, false);
});

test('a loaded package alone is not a displayed source scene', () => {
  const stats = fullSourceWeb();
  const check = patch => originalSceneDrawEvidence({ ...stats, ...patch }).reasons;
  assert.ok(check({ generatedManifest: { drawCalls: 0, triangles: 185037,
    nativeGeometry: true, nativeMaterialParity: false } })
    .includes('SOURCE_WORLD_GPU_SUBMISSION_UNVERIFIED'));
  assert.ok(check({ totalWebGLDrawCalls: 0 })
    .includes('SOURCE_WORLD_DRAW_COUNTER_UNVERIFIED'));
  assert.ok(check({ nativeMaterialShaderMatch: true })
    .includes('MATERIAL_LIGHT_PROVENANCE_UNVERIFIED'));
  assert.ok(check({ p95FrameMs: null }).includes('BROWSER_FRAME_TIMING_UNVERIFIED'));
});

test('skinned enemy requirement excludes static proxy and native-spawn overclaims', () => {
  const stats = fullSourceWeb();
  const check = patch => originalSceneDrawEvidence({ ...stats, ...patch }, { requireSkin: true }).reasons;
  assert.ok(check({ skinAnimationVerified: false })
    .includes('SOURCE_SKINNED_WEB_DRAW_UNVERIFIED'));
  assert.ok(check({ nativeEnemyIndexedDrawCalls: 0 })
    .includes('SOURCE_SKINNED_WEB_DRAW_UNVERIFIED'));
  assert.ok(check({ nativeEnemySpawnVerified: true })
    .includes('NATIVE_ENEMY_SPAWN_NOT_PROVEN_FLAG_MISSING'));
  assert.ok(check({ localNativeEnemy: { ...stats.localNativeEnemy, meshPathId: 999 } })
    .includes('SOURCE_SKINNED_WEB_DRAW_UNVERIFIED'));
  assert.deepEqual(originalSceneDrawEvidence(stats).reasons, []);
});

test('both sides of each browser PNG need an actual rendered scene, camera and projection', () => {
  const frame = {
    frameId: 48, activeScreen: 'playing',
    camera: { x: 2, y: 1.6, z: 4, yaw: 0, pitch: -0.1 },
    nativeScene: { source: CONTAINERS_BUILD28_SOURCE, meshes: 68, instances: 360, textures: 17 },
    generatedManifest: { nativeGeometry: true, nativeMaterialParity: false,
      drawCalls: 360, triangles: 185037 },
    projection: { verticalScale: 1.732, near: 0.03, far: 1000, aspect: 16 / 9 },
    nativeEnemy: { skinned: true, nativeClipSampled: true,
      runtimeEnemyInstanceVerified: false, drawCalls: 1, materialParity: false },
  };
  const proof = renderedOriginalSceneEvidence(frame, { requireSkin: true });
  assert.deepEqual(proof.reasons, []);
  assert.equal(proof.nativeParityCertified, false);
  assert.equal(proof.independentGpuReadback, false);
  assert.ok(renderedOriginalSceneEvidence({ ...frame, nativeScene: { ...frame.nativeScene, source: { ...CONTAINERS_BUILD28_SOURCE, sceneBuildIndex: 10 } } })
    .reasons.includes('RENDERED_CONTAINERS_BUILD28_IDENTITY_UNVERIFIED'));
  assert.ok(renderedOriginalSceneEvidence({ ...frame, nativeScene: null })
    .reasons.includes('RENDERED_FULL_SOURCE_SCENE_UNVERIFIED'));
  assert.ok(renderedOriginalSceneEvidence({ ...frame, projection: null })
    .reasons.includes('RENDERED_PROJECTION_UNVERIFIED'));
  assert.ok(renderedOriginalSceneEvidence({ ...frame, camera: null })
    .reasons.includes('RENDERED_CAMERA_UNVERIFIED'));
  assert.ok(renderedOriginalSceneEvidence({ ...frame, nativeEnemy: null }, { requireSkin: true })
    .reasons.includes('RENDERED_ORIGINAL_SKIN_SUBMISSION_UNVERIFIED'));
});
