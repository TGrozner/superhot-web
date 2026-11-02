/**
 * SH-16 — Dojo integration seam, not a second SH-10 playthrough validator.
 * Pure checks can run on hosted CI without the owner's private assets or PC.
 * Only SH-05 may wire runtime hooks; SH-10 owns complete-run acceptance.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessNativeWorldBrowserFrame } from './integration-native-world.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const UNPROVED = Object.freeze({
  browserActuallyExecutedHere: false,
  actualGpuPixelsInspected: false,
  nativeGameplayExecuted: false,
  nativePhysXContactProven: false,
  matchedNativeWebPixels: false,
  measuredVisibleDelta: null,
  nativeParityVerdict: 'UNASSESSED',
});
const budgetKind = 'PREPARED_OWNER_LOCAL_SOURCE_WEB_BUDGET_NOT_NATIVE_RUNTIME_DRAW';

const isDojo = source => source && typeof source === 'object' &&
  source.sceneBuildIndex === 10 && source.serializedOwner === 'level10' &&
  typeof source.scenePath === 'string' &&
  /(?:^|[\\/])SHRL_Dojo2\.unity$/i.test(source.scenePath);
const tuple = source => source && typeof source === 'object'
  ? JSON.stringify([source.sceneBuildIndex, source.scenePath, source.serializedOwner])
  : null;
const failed = (status, details = {}) => ({ status, ...details, ...UNPROVED });

/**
 * Compare source-world/render/actor/encounter *interfaces* in user-supplied
 * snapshots. Existing SH-16 assessor owns GPU-submission counter validation.
 * This does not inspect a bitmap and cannot attest provenance of JSON samples.
 */
export function assessDojoWorldActorSmoke({ expectedSource, sourceBudget, samples } = {}) {
  if (!isDojo(expectedSource)) return failed('EXPECTED_SOURCE_NOT_DOJO_BUILD10_LEVEL10');
  if (sourceBudget?.kind !== budgetKind) return failed('PREPARED_SOURCE_BUDGET_REQUIRED');
  if (!Array.isArray(samples) || samples.length < 2 || samples.length > 32) {
    return failed('TWO_TO_32_SAMPLED_WEB_FRAMES_REQUIRED');
  }

  let previousFrame = null;
  let actorsDrawn = 0, encounters = 0, liveEnemies = 0;
  const desired = tuple(expectedSource);
  for (let index = 0; index < samples.length; index++) {
    const { frame, metrics } = samples[index] ?? {};
    if (tuple(frame?.nativeScene?.source) !== desired) {
      return failed('RENDERED_FRAME_SOURCE_MISMATCH', { failingSample: index });
    }
    if (tuple(metrics?.nativeScene?.source) !== desired) {
      return failed('ASYNC_METRICS_SOURCE_MISMATCH', { failingSample: index });
    }
    const world = assessNativeWorldBrowserFrame({ frame, metrics, sourceBudget });
    if (world.status !== 'APP_REPORTED_NATIVE_SOURCE_WEB_WORLD_SUBMISSION_NO_PIXEL_PARITY') {
      return failed('SOURCE_WORLD_SUBMISSION_INVALID', {
        failingSample: index, failingGate: world.status,
      });
    }
    if (frame.activeScreen !== 'playing' || frame.gameplay?.nativeClock !== true) {
      return failed('NOT_PLAYING_SOURCE_WORLD_CLOCK', { failingSample: index });
    }
    if (!Number.isFinite(frame.worldClock) || frame.worldClock < 0 ||
        (previousFrame && (frame.frameId <= previousFrame.frameId ||
          frame.worldClock < previousFrame.worldClock))) {
      return failed('FRAME_OR_WORLD_CLOCK_REVERSED', { failingSample: index });
    }
    previousFrame = frame;

    if (world.lastDrawnCharacter.status === 'LAST_ACTOR_SKINNED_GPU_SUBMISSION') actorsDrawn++;
    const encounter = frame.gameplay.encounter;
    if (encounter && [6, 7].includes(encounter.killTarget) &&
        Number.isSafeInteger(encounter.killed) && encounter.killed >= 0 &&
        encounter.killed <= encounter.killTarget && Array.isArray(encounter.enemies)) {
      encounters++;
      if (encounter.enemies.some(enemy => enemy?.alive === true)) liveEnemies++;
    }
  }

  return {
    status: encounters === 0 ? 'DOJO_WORLD_SUBMITTED_ENCOUNTER_NOT_EXPOSED' :
      actorsDrawn === 0 ? 'DOJO_WORLD_SUBMITTED_NO_SKINNED_ACTOR_IN_SAMPLES' :
        liveEnemies === 0 ? 'DOJO_WORLD_AND_ACTOR_NO_LIVE_ENEMY_IN_SAMPLES' :
          'DOJO_WORLD_ACTOR_ENCOUNTER_APP_TELEMETRY_ONLY',
    scene: { sceneBuildIndex: 10, scenePath: expectedSource.scenePath, serializedOwner: 'level10' },
    samples: samples.length,
    lastFrameId: previousFrame.frameId,
    worldDrawCallsPerFrame: sourceBudget.indexedDraws,
    worldTrianglesPerFrame: sourceBudget.triangles,
    lastActorSkinnedSubmissionSamples: actorsDrawn,
    encounterSamples: encounters,
    livingEnemySamples: liveEnemies,
    shotToColliderToReactionProven: false,
    completeDojoRunProven: false,
    fullRunValidatorOwner: 'SH-10 / scripts/acceptance-dojo-playthrough.mjs',
    ...UNPROVED,
  };
}

/**
 * Bounded lexical CI audit: confirms imports/calls still exist on main.
 * Does not claim those calls execute, nor that a private package is installed.
 */
export function auditDojoStaticWiring({ main, renderer, server } = {}) {
  if ([main, renderer, server].some(source => typeof source !== 'string')) {
    throw new TypeError('Three public source files required');
  }
  const checks = Object.freeze({
    defaultSourceMode: /containersPreviewEnabled\s*=\s*true/.test(main),
    allowlistedScenePackage: server.includes('scenePackage:') &&
      main.includes("localAssetFile('scenePackage')"),
    prepareAndBindSourceWorld: main.includes('prepareNativeScene(source)') &&
      main.includes('renderer.replaceNativeWorld(prepared, images)') &&
      main.includes('nativeScene = prepared'),
    sourceWorldGpuPath: main.includes('renderer.drawNativeWorld()') &&
      renderer.includes('function drawNativeWorld()'),
    skinnedEnemyDraw: main.includes('renderer.drawNativeSkin(') &&
      renderer.includes('function drawNativeSkin('),
    colliderAndProjectilePath: main.includes('prepareNativeCollision(nativeScene.colliders)') &&
      main.includes('nativeCollisionView(') && main.includes('nativeSphereHit('),
    enemyEncounterPath: main.includes('createNativeEncounter(') &&
      main.includes('advanceNativeEncounter(') && main.includes('readyForVictory('),
    shooterAndReactionPath: main.includes('consumeNativeEnemyShot(') &&
      main.includes('hitNativeBody('),
    victoryAndRestartPath: main.includes("setScreen(win ? 'win' : 'dead')") &&
      main.includes("$('again-button').addEventListener('click', start)"),
    browserTraceInputs: main.includes('window.__superhotGetRenderedFrameSnapshot') &&
      main.includes('window.__superhotSceneMetrics') &&
      main.includes('NATIVE_ORIGINAL_GEOMETRY_WEB_GAMEPLAY') &&
      main.includes('killTarget:nativeEncounter.killTarget,killed:nativeEncounter.killed'),
  });
  return {
    status: Object.values(checks).every(Boolean)
      ? 'DOJO_STATIC_WEB_INTERFACE_REACHABLE_NOT_EXECUTED'
      : 'DOJO_STATIC_WEB_INTERFACE_GAP',
    checks,
    liveDojoPackageInspected: false,
    nativeParityVerdict: 'UNASSESSED',
  };
}

export function auditDojoCheckout(root = ROOT) {
  const read = name => readFileSync(join(root, name), 'utf8');
  return auditDojoStaticWiring({
    main: read('src/main.js'),
    renderer: read('src/renderer.js'),
    server: read('server.mjs'),
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const report = auditDojoCheckout();
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    if (report.status !== 'DOJO_STATIC_WEB_INTERFACE_REACHABLE_NOT_EXECUTED') process.exitCode = 1;
  } catch (error) {
    process.stderr.write('DOJO_STATIC_WEB_INTERFACE_GAP: ' + error.message + '\n');
    process.exitCode = 1;
  }
}
