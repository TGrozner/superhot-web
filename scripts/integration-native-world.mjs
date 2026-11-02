import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const NATIVE_MODE = 'CONTAINERS_ORIGINAL_GEOMETRY_WEB_GAMEPLAY';

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

/**
 * A source-side draw budget constructed from the ALREADY DECODED private
 * scene package. It never touches original assets, binary data or images.
 * This is a candidate Web submission budget, not native runtime visibility.
 */
export function summarizePreparedNativeWorld(prepared) {
  if (!(prepared?.meshes instanceof Map) || !(prepared?.textures instanceof Map) ||
      !Array.isArray(prepared.instances) || !prepared.camera ||
      !Array.isArray(prepared.colliders) || !prepared.anchors) {
    throw new TypeError('Expected prepareNativeScene() output, not an inferred scene count');
  }
  let indexedDraws = 0;
  let triangles = 0;
  for (const instance of prepared.instances) {
    if (!prepared.meshes.has(instance.meshId) || !Array.isArray(instance.draws) || !instance.draws.length) {
      throw new RangeError('Prepared native world has an unresolved drawable instance');
    }
    for (const draw of instance.draws) {
      const range = draw?.range;
      if (!range || !nonNegativeInteger(range.firstIndex) ||
          !Number.isSafeInteger(range.indexCount) || range.indexCount <= 0 ||
          range.indexCount % 3 || !prepared.meshes.has(draw.meshId)) {
        throw new RangeError('Prepared native world has an invalid indexed draw range');
      }
      indexedDraws++;
      triangles += range.indexCount / 3;
      if (!Number.isSafeInteger(triangles)) throw new RangeError('Native world draw budget exceeds safe integer');
    }
  }
  const colliders = prepared.colliders.filter(c => c?.isTrigger !== true).length;
  const triggers = prepared.colliders.length - colliders;
  return Object.freeze({
    kind: 'PREPARED_OWNER_LOCAL_SOURCE_WEB_BUDGET_NOT_NATIVE_RUNTIME_DRAW',
    meshes: prepared.meshes.size,
    instances: prepared.instances.length,
    textures: prepared.textures.size,
    indexedDraws,
    triangles,
    nonTriggerColliders: colliders,
    triggerColliders: triggers,
    authorPlayerAnchors: prepared.anchors.player?.length ?? 0,
    authorEnemyAnchors: prepared.anchors.enemy?.length ?? 0,
    sourceCameraPresent: Boolean(prepared.camera),
    sourcePistolPresent: Boolean(prepared.pistol?.instance && prepared.pistol?.mesh),
    nativeExecutionObserved: false,
    nativeParityVerdict: 'UNASSESSED',
  });
}

/**
 * Separate 1-second app telemetry from the same-rendered-frame snapshot.
 * This function accepts copied metrics: it cannot attest they came from a
 * genuine Chromium GPU frame. NO bitmap or original native game pixels here.
 */
export function assessNativeWorldBrowserFrame({ metrics, frame, sourceBudget = null } = {}) {
  if (metrics == null || frame == null) {
    return { status: 'NOT_OBSERVED', nativeParityVerdict: 'UNASSESSED' };
  }
  if (metrics.mode !== NATIVE_MODE) {
    return { status: 'NOT_NATIVE_WORLD_MODE', nativeParityVerdict: 'UNASSESSED' };
  }
  const scene = frame.nativeScene;
  const world = frame.generatedManifest;
  const threeKeys = ['meshes','instances','textures'];
  const countersValid = metrics.browserMeasured === true &&
    Number.isSafeInteger(frame.frameId) && frame.frameId >= 1 &&
    ['playing','menu','paused'].includes(frame.activeScreen) &&
    scene && threeKeys.every(key => Number.isSafeInteger(scene[key]) && scene[key] > 0) &&
    world?.nativeGeometry === true &&
    Number.isSafeInteger(world.drawCalls) && world.drawCalls > 0 &&
    Number.isSafeInteger(world.triangles) && world.triangles > 0 &&
    nonNegativeInteger(frame.totalWebGLDrawCalls) &&
    frame.totalWebGLDrawCalls >= world.drawCalls;
  if (!countersValid) return { status: 'INVALID_FRAME_OR_SOURCE_DRAW_COUNTERS', nativeParityVerdict: 'UNASSESSED' };
  const asynchronousScene = metrics.nativeScene;
  if (asynchronousScene &&
      threeKeys.some(key => asynchronousScene[key] !== scene[key])) {
    return { status: 'STALE_OR_CONTRADICTORY_SCENE_TELEMETRY', nativeParityVerdict: 'UNASSESSED' };
  }
  if (sourceBudget) {
    if (sourceBudget.kind !== 'PREPARED_OWNER_LOCAL_SOURCE_WEB_BUDGET_NOT_NATIVE_RUNTIME_DRAW' ||
        threeKeys.some(key => sourceBudget[key] !== scene[key]) ||
        sourceBudget.indexedDraws !== world.drawCalls ||
        sourceBudget.triangles !== world.triangles) {
      return { status: 'PREPARED_SOURCE_WEB_DRAW_BUDGET_MISMATCH', nativeParityVerdict: 'UNASSESSED' };
    }
  }
  const actor = frame.nativeEnemy;
  const skinnedLastActor = actor?.skinned === true && nonNegativeInteger(actor.drawCalls) &&
    actor.drawCalls > 0;
  // Never upgrade an app's Web target-health transitions into native MCD
  // Bullet/Animator/AI proof. The last character draw isn't all actors.
  const reportedWebTargetHit = Array.isArray(metrics.enemies) &&
    metrics.enemies.some(enemy => enemy?.alive === false);
  return Object.freeze({
    status: 'APP_REPORTED_NATIVE_SOURCE_WEB_WORLD_SUBMISSION_NO_PIXEL_PARITY',
    worldGeometry: {
      meshes: scene.meshes, instances: scene.instances, textures: scene.textures,
      indexedDraws: world.drawCalls, triangles: world.triangles,
      totalWebGLDrawCalls: frame.totalWebGLDrawCalls,
    },
    lastDrawnCharacter: skinnedLastActor
      ? { status: 'LAST_ACTOR_SKINNED_GPU_SUBMISSION', clip: actor.clip ?? null,
          sampledTime: Number.isFinite(actor.sampledTime) ? actor.sampledTime : null }
      : { status: 'LAST_ACTOR_NOT_PROVEN_SKINNED' },
    combat: reportedWebTargetHit ? 'WEB_TARGET_DEFEAT_STATE_ONLY' : 'NATIVE_COMBAT_NOT_PROVEN',
    frameId: frame.frameId,
    frameWorldClock: Number.isFinite(frame.worldClock) ? frame.worldClock : null,
    p95FrameMsFromAsyncTelemetry: Number.isFinite(metrics.p95FrameMs) ? metrics.p95FrameMs : null,
    browserScreenshotCaptured: false,
    nativeMatchedPixelComparisonPerformed: false,
    nativeCameraPoseMatched: false,
    nativeCombatParityVerified: false,
    nativePhysicsParityVerified: false,
    originalShaderParityVerified: false,
    actualGpuPixelsIndependentlyInspected: false,
    nativeParityVerdict: 'UNASSESSED',
  });
}

/**
 * SH-04 private primary metadata #115/#116/#118, already reviewed:
 * these are serialized GO↔MeshFilter/MeshRenderer↔BoxCollider candidates,
 * not proof that either elevated platform is active or visible in native MCD.
 * All ids here are metadata (not vertices, native code or source assets).
 */
export const CONTAINERS_RAISED_PLATFORM_REFERENCES = Object.freeze([
  Object.freeze({ goPathId: 379, meshPathId: 7, submesh: 34, colliderPathId: 15807, indexCount: 36 }),
  Object.freeze({ goPathId: 392, meshPathId: 6, submesh: 25, colliderPathId: 15811, indexCount: 36 }),
]);

/**
 * Project an actual prepared Web collider AABB, NOT its mesh silhouette,
 * using the completed Web frame's own ViewProjection. The rectangle is
 * useful for prioritizing a screenshot ROI, never a native pixel measurement.
 * If any AABB corner is behind the near plane, refuse a projected ROI rather
 * than return a misleading giant/negative bounding box.
 */
export function projectPreparedColliderRoi({ collider, frame, viewport } = {}) {
  const worldAabb = collider?.worldAabb;
  const lo = worldAabb?.min, hi = worldAabb?.max;
  const vp = frame?.projection?.viewProjection;
  const { width, height } = viewport ?? {};
  if (!Array.isArray(vp) || vp.length !== 16 ||
      vp.some(v => !Number.isFinite(v)) ||
      !Number.isSafeInteger(width) || width < 1 ||
      !Number.isSafeInteger(height) || height < 1 ||
      !Array.isArray(lo) || !Array.isArray(hi) || lo.length !== 3 || hi.length !== 3 ||
      lo.some((v, i) => !Number.isFinite(v) || !Number.isFinite(hi[i]) || hi[i] <= v)) {
    return { status: 'VIEW_PROJECTION_VIEWPORT_OR_WORLD_AABB_MISSING' };
  }
  if (!Number.isFinite(frame.projection.aspect) ||
      Math.abs(frame.projection.aspect - width / height) > 1e-5) {
    return { status: 'WEB_FRAME_PROJECTION_VIEWPORT_ASPECT_MISMATCH' };
  }
  const corners = [];
  let farClipped = false;
  for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) {
    for (const z of [lo[2], hi[2]]) {
      const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
      const cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
      const cz = vp[2] * x + vp[6] * y + vp[10] * z + vp[14];
      const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
      if (cw <= 0 || cz < -cw || ![cx, cy, cz, cw].every(Number.isFinite)) {
        return { status: 'AABB_CROSSES_NEAR_PLANE_OR_BEHIND_CAMERA' };
      }
      if (cz > cw) farClipped = true;
      corners.push([width * (cx / cw + 1) / 2, height * (1 - cy / cw) / 2]);
    }
  }
  if (farClipped) return { status: 'AABB_CROSSES_FAR_PLANE_ROI_UNRELIABLE' };
  const minX = Math.max(0, Math.min(...corners.map(p => p[0])));
  const maxX = Math.min(width, Math.max(...corners.map(p => p[0])));
  const minY = Math.max(0, Math.min(...corners.map(p => p[1])));
  const maxY = Math.min(height, Math.max(...corners.map(p => p[1])));
  if (!(maxX > minX && maxY > minY)) {
    return { status: 'AABB_OUTSIDE_VIEWPORT', viewport: { width, height } };
  }
  const area = (maxX - minX) * (maxY - minY);
  return {
    status: 'WEB_COLLIDER_AABB_PROJECTED_ROI_NOT_MESH_OR_PIXEL_PROOF',
    rectPx: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
    viewportCoverageUpperBound: area / (width * height),
    viewport: { width, height },
  };
}

/**
 * Caller MUST supply both actual local-package instance IDs and collider IDs
 * for GO379/392; never guess them from names, indices or fallback Z-mirrored
 * proxy centers. A missing world-pass instance is distinct from a present
 * invisible/non-trigger collider. Ranges correspond to source mesh submeshes.
 * The prepared world-pass draws all packets but has NO per-instance browser
 * draw receipts: this is a candidate GPU draw, not an observed one.
 */
export function assessNativeElevatedPlatformBindings({ prepared, bindings = [], frame, viewport } = {}) {
  if (!(prepared?.instanceMap instanceof Map) || !(prepared.meshes instanceof Map) ||
      !Array.isArray(prepared.colliders) || !Array.isArray(bindings)) {
    throw new TypeError('Expected prepared native scene and explicit owner-local platform selectors');
  }
  const byGo = new Map();
  for (const binding of bindings) {
    if (!CONTAINERS_RAISED_PLATFORM_REFERENCES.some(ref => ref.goPathId === binding?.goPathId) ||
        byGo.has(binding.goPathId)) throw new RangeError('Unknown or duplicate elevated GO selector');
    byGo.set(binding.goPathId, binding);
  }
  const surfaces = CONTAINERS_RAISED_PLATFORM_REFERENCES.map(ref => {
    const binding = byGo.get(ref.goPathId);
    const base = { ...ref, nativeExecutionObserved: false, gpuDrawObserved: false, nativePhysicsContactObserved: false };
    if (!binding || typeof binding.instanceId !== 'string' ||
        !(typeof binding.colliderId === 'string' || (Number.isSafeInteger(binding.colliderId) && binding.colliderId >= 0))) {
      return { ...base, status: 'OWNER_LOCAL_INSTANCE_AND_COLLIDER_SELECTOR_REQUIRED' };
    }
    const instance = prepared.instanceMap.get(binding.instanceId);
    if (!instance) return { ...base, status: 'MISSING_ELIGIBLE_WORLD_PASS_INSTANCE' };
    const mesh = prepared.meshes.get(instance.meshId);
    const sourceRange = mesh?.ranges?.get(ref.submesh);
    const rangeValid = sourceRange?.indexCount === ref.indexCount &&
      instance.draws?.some(draw => draw.meshId === instance.meshId &&
        draw.range?.firstIndex === sourceRange.firstIndex &&
        draw.range.indexCount === sourceRange.indexCount);
    if (!rangeValid) return { ...base, status: 'MISSING_OR_INVALID_SOURCE_SUBMESH_DRAW_RANGE' };
    const collider = prepared.colliders.find(c => c?.id === binding.colliderId);
    if (!collider) return { ...base, status: 'MISSING_SOURCE_COLLIDER_IN_PREPARED_PACKAGE' };
    if (collider.isTrigger === true) return { ...base, status: 'SOURCE_COLLIDER_IS_TRIGGER_NOT_FLOOR' };
    const roi = projectPreparedColliderRoi({ collider, frame, viewport });
    // Raw source path IDs are optional; their absence is not a license to infer.
    const directIdentity = instance.source?.goPathId === ref.goPathId &&
      mesh.source?.pathId === ref.meshPathId &&
      collider.pathId === ref.colliderPathId &&
      collider.goPathId === ref.goPathId;
    return {
      ...base,
      status: directIdentity
        ? 'SOURCE_IDS_AND_PREPARED_WORLD_RANGE_LINKED_NO_GPU_PIXEL_PROOF'
        : 'PREPARED_WORLD_RANGE_AND_COLLIDER_LINKED_SOURCE_IDS_UNATTESTED',
      ownerLocalSelectorAccepted: true,
      explicitNativePathIdsVerified: directIdentity,
      sourceWorldPassCandidateDraws: 1,
      sourceWorldPassCandidateTriangles: ref.indexCount / 3,
      colliderRoi: roi,
      // SH-05 can inspect owner-local source metadata to close the above IDs;
      // SH-15 uses the ROI solely as a Web screenshot inspection candidate.
    };
  });
  return {
    evidence: 'LOCAL_PREPARED_SOURCE_AND_WEB_COLLIDER_AABB_ONLY',
    surfaces,
    preparedCandidateDraws: surfaces.filter(s => s.sourceWorldPassCandidateDraws === 1).length,
    preparedCandidateTriangles: surfaces.reduce((n, s) => n + (s.sourceWorldPassCandidateTriangles ?? 0), 0),
    measuredNativePixelDelta: null,
    nativeParityVerdict: 'UNASSESSED',
  };
}

/**
 * Source-activation vs the ACTUAL Web main.js collider membership contract.
 *
 * SH-05 currently builds its movement and projectile Web AABBs with
 * nativeScene.colliders.filter(c => !c.isTrigger); this check ignores source
 * component enabled / hierarchy-active flags IF those are present in the
 * owner-local scene. We do not infer those fields from names or bounds.
 *
 * A source-qualified caller explicitly supplies per-collider serialized
 * flags after independently joining the owner's source snapshot; if those
 * fields are absent, the result is UNKNOWN, not "enabled". This helper
 * never performs a PhysX query or mutates the prepared scene.
 *
 * qualifiedSourceStates is Map<collider.id,
 *   { componentEnabled: boolean, hierarchyActive: boolean }>.
 */
export function assessPreparedColliderActivation({
  prepared, qualifiedSourceStates = new Map(),
} = {}) {
  if (!Array.isArray(prepared?.colliders) || !(qualifiedSourceStates instanceof Map)) {
    throw new TypeError('Prepared colliders and qualified source-activation Map required');
  }
  const ids = new Set();
  const report = {
    sourceColliderCount: prepared.colliders.length,
    webNonTriggerSolids: 0,
    triggersExcludedByWeb: 0,
    sourceQualifiedActiveSolids: 0,
    sourceQualifiedInactiveSolidsStillInWeb: 0,
    sourceActivationUnknownWebSolids: 0,
  };
  for (const collider of prepared.colliders) {
    const id = collider?.id;
    if (!(typeof id === 'string' && id.length > 0 ||
          Number.isSafeInteger(id) && id >= 0) || ids.has(id) ||
        typeof collider.isTrigger !== 'boolean') {
      throw new TypeError('Every prepared collider needs a unique ID and explicit boolean isTrigger');
    }
    ids.add(id);
    // Exact current shared-app membership filter. No assumption about PhysX.
    if (collider.isTrigger) {
      report.triggersExcludedByWeb++;
      continue;
    }
    report.webNonTriggerSolids++;
    if (!qualifiedSourceStates.has(id)) {
      report.sourceActivationUnknownWebSolids++;
      continue;
    }
    const flags = qualifiedSourceStates.get(id);
    if (!flags || typeof flags !== 'object' ||
        typeof flags.componentEnabled !== 'boolean' ||
        typeof flags.hierarchyActive !== 'boolean') {
      throw new TypeError('Qualified source state must explicitly carry componentEnabled and hierarchyActive booleans');
    }
    if (flags.componentEnabled && flags.hierarchyActive) {
      report.sourceQualifiedActiveSolids++;
    } else {
      report.sourceQualifiedInactiveSolidsStillInWeb++;
    }
  }
  for (const id of qualifiedSourceStates.keys()) {
    if (!ids.has(id)) throw new RangeError('Source activation selector is not a prepared collider ID');
  }
  const status = report.sourceQualifiedInactiveSolidsStillInWeb > 0
    ? 'SERIALIZED_INACTIVE_COLLIDERS_INCLUDED_AS_WEB_SOLIDS_POTENTIAL_INVISIBLE_WALL'
    : report.sourceActivationUnknownWebSolids > 0
      ? 'SERIALIZED_COLLIDER_ACTIVATION_NOT_FULLY_QUALIFIED'
      : 'SUPPLIED_SERIALIZED_ACTIVATION_MATCHES_WEB_MEMBERSHIP_NOT_NATIVE_PHYSX';
  return Object.freeze({
    ...report, status,
    evidence: 'PREPARED_OWNER_LOCAL_SERIALIZED_FLAGS_VS_WEB_STATIC_MEMBERSHIP',
    browserWebContactActuallyObserved: false,
    originalPhysXContactActuallyObserved: false,
    matchedNativeGameplayFrameObserved: false,
    nativeParityVerdict: 'UNASSESSED',
  });
}

/** Bounded code-read contract audit. Strings prove references, NOT execution. */
export function auditNativeWorldStaticWiring(root = ROOT) {
  const read = path => {
    const absolute = join(root, path);
    return existsSync(absolute) ? readFileSync(absolute, 'utf8') : '';
  };
  const main = read('src/main.js');
  const renderer = read('src/renderer.js');
  const scene = read('src/scenes/native-scene-local.js');
  const world = read('src/render/native-world-pass.js');
  const skin = read('src/characters/native-skin-pass.js');
  const server = read('server.mjs');
  const capture = read('scripts/visual-web-capture.mjs');
  const flags = Object.freeze({
    browserDefaultOriginalMode: main.includes('containersPreviewEnabled = true'),
    privateLocalScenePackageRead: main.includes("localAssetFile('scenePackage')") &&
      main.includes('prepareNativeScene(source)'),
    nativeWorldPrepared: scene.includes('export function prepareNativeScene('),
    nativeWorldUploadAndDraw: main.includes('renderer.replaceNativeWorld(prepared, images)') &&
      main.includes('renderer.drawNativeWorld()') &&
      renderer.includes('function replaceNativeWorld(') &&
      renderer.includes('function drawNativeWorld()'),
    worldDrawUsesSourceSubmeshRanges: world.includes('meshes.get(draw.meshId).draw(draw.range)'),
    skinnedActorRenderRouted: main.includes('renderer.drawNativeSkin(actorMatrix, clip, time)') &&
      renderer.includes('function drawNativeSkin(') &&
      skin.includes('export function createNativeSkinPass('),
    sourceCameraProjectionRouted: main.includes('projection: nativeScene?.camera.projection'),
    authoredCollidersWebAabbRouted: main.includes('nativeScene.colliders.filter(c => !c.isTrigger)') &&
      main.includes('c.worldAabb.min'),
    authoredEnemyAnchorsWebRouted: main.includes('nativeScene.anchors.enemy.map('),
    webCombatOnly: main.includes('Web encounter timing') && main.includes('not a native spawner replay'),
    privateAllowlistLoopback: server.includes("'/local-assets/'") &&
      server.includes('Same-origin access only'),
    sameRenderedFrameSnapshot: main.includes('window.__superhotGetRenderedFrameSnapshot') &&
      main.includes('frameId: ++renderedFrameId'),
    nativeSceneCaptureGate: capture.includes(NATIVE_MODE) &&
      capture.includes('frame?.generatedManifest??metrics.generatedManifest'),
    nativeCombatContractImportedIntoMain: /from\s+['"]\.\/combat\/shot-phases\.js['"]/.test(main),
  });
  const blockers = [];
  for (const [key, owner] of [
    ['privateLocalScenePackageRead','SH-05'],['nativeWorldPrepared','SH-04/SH-11'],
    ['nativeWorldUploadAndDraw','SH-05'],['worldDrawUsesSourceSubmeshRanges','SH-11/SH-12/SH-05'],
    ['skinnedActorRenderRouted','SH-14/SH-05'],['nativeSceneCaptureGate','SH-15'],
  ]) {
    if (!flags[key]) blockers.push({ owner, gate: key, reason: 'No complete static hookup found; browser execution unproven.' });
  }
  if (!flags.nativeCombatContractImportedIntoMain) blockers.push({
    owner: 'SH-03/SH-05', gate: 'sourceNativeCombat',
    reason: 'The native-bounded combat contract is not imported into shared gameplay; present combat remains a Web encounter.',
  });
  blockers.push({
    owner: 'SH-05/SH-15', gate: 'matchedContainersFrame',
    reason: 'No native GAMEPLAY Containers/build28 frame paired with one browser same-state PNG/active camera, original shader and lighting parity unproven.',
  });
  return {
    target: 'SUPERHOT MCD Containers/build28',
    evidenceKind: 'STATIC_CODE_REFERENCES_ONLY',
    flags, blockers,
    nativeParityVerdict: 'UNASSESSED',
    measuredBrowserPixelDelta: null,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  console.log(JSON.stringify(auditNativeWorldStaticWiring(), null, 2));
}
