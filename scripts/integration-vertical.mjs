import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildContainersProxySolids, assessLegacySpawnBounds } from './integration-cargo-proxy.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const TARGET = 'Containers/build28';
const CARGO_MODULE = 'src/scenes/containers-build28.js';

const MODULES = Object.freeze({
  cargo: CARGO_MODULE,
  gpuMesh: 'src/render/gpu-mesh.js',
  localObj: 'src/preview/local-obj-group.js',
  materials: 'src/render/material-model.js',
  lighting: 'src/render/lighting-model.js',
  combat: 'src/combat/shot-phases.js',
  flow: 'src/flow/containers-gates.js',
  audio: 'src/sound/mcd-gun-cues.js',
  time: 'src/time.js',
  input: 'src/input.js',
});

const readIfPresent = (root, path) => {
  const absolute = join(root, path);
  return existsSync(absolute) ? readFileSync(absolute, 'utf8') : null;
};

/** Lexical static-import graph: evidence of a module reference, NOT of execution. */
export function scanImportReachability(root, entry = 'src/main.js') {
  const reachable = new Set();
  const missing = new Set();
  const pending = [entry];
  // A deliberately conservative scanner: only static import/export lines.
  const imports = /^\s*(?:import|export)\s+(?:[^'"\n;]*?\s+from\s+)?['"](\.{1,2}\/[^'"\n]+)['"]/gm;
  while (pending.length) {
    const path = pending.pop();
    if (reachable.has(path)) continue;
    const content = readIfPresent(root, path);
    if (content === null) { missing.add(path); continue; }
    reachable.add(path);
    imports.lastIndex = 0;
    for (const match of content.matchAll(imports)) {
      const specifier = match[1];
      const normalized = normalize(join(dirname(path), specifier));
      const rel = relative('.', normalized).split(sep).join('/');
      if (rel.startsWith('../') || rel.startsWith('/') || rel === '..') continue;
      pending.push(rel.endsWith('.js') || rel.endsWith('.mjs') ? rel : rel + '.js');
    }
  }
  return {
    reachable: [...reachable].sort(),
    missing: [...missing].sort(),
  };
}

async function probeCargoModule(root, legacyBounds) {
  if (!existsSync(join(root, CARGO_MODULE))) {
    return { status: 'NO_CANDIDATE_MODULE' };
  }
  try {
    const module = await import(pathToFileURL(resolve(root, CARGO_MODULE)).href);
    if (typeof module.createContainersBuild28DrawPlan !== 'function' ||
      !Array.isArray(module.CONTAINERS_BUILD28_HULLS)) {
      return { status: 'CANDIDATE_API_MISSING' };
    }
    const plan = module.createContainersBuild28DrawPlan(module.CONTAINERS_BUILD28_DEMO_CAMERA);
    const packets = plan?.packets;
    if (!Array.isArray(packets) || !packets.length || packets.some((p) =>
      !Array.isArray(p.legacyBoxArgs) || p.legacyBoxArgs.length !== 7 ||
      !p.legacyBoxArgs.slice(0, 6).every(Number.isFinite))) {
      return { status: 'DRAW_PACKET_PROBE_FAILED' };
    }
    const proxySolids = buildContainersProxySolids(module.CONTAINERS_BUILD28_HULLS);
    const spawnRisk = legacyBounds
      ? assessLegacySpawnBounds(module.CONTAINERS_BUILD28_DEMO_CAMERA, legacyBounds, proxySolids)
      : null;
    return {
      status: 'WEB_CPU_DRAW_PACKET_PROBED',
      sourceHullProxyAdapters: proxySolids.length,
      staticLegacySpawnRisk: spawnRisk,
      sourceType: 'ROUNDED_COLLIDER_PROXY_NOT_NATIVE_MESH',
      hulls: module.CONTAINERS_BUILD28_HULLS.length,
      visiblePackets: packets.length,
      affineRequired: plan.affineRequired,
      estimatedLegacyDrawCalls: plan.estimatedLegacyDrawCalls,
      actualGpuDrawCalls: null,
    };
  } catch (error) {
    return { status: 'CANDIDATE_IMPORT_FAILED', reason: String(error.message ?? error) };
  }
}

/**
 * SH-16 integration evidence. This intentionally cannot certify native parity,
 * active Unity instances, collision equivalence, or GPU/browser performance.
 */
export async function auditVerticalIntegration(root = ROOT) {
  const graph = scanImportReachability(root);
  const visited = new Set(graph.reachable);
  const main = readIfPresent(root, 'src/main.js') ?? '';
  const renderer = readIfPresent(root, 'src/renderer.js') ?? '';
  const levels = readIfPresent(root, 'src/levels.js') ?? '';
  const html = readIfPresent(root, 'index.html') ?? '';
  const bounds = Object.fromEntries(['x','z'].map(axis => {
    const match = main.match(new RegExp('state\\.camera\\.' + axis +
      '\\s*=\\s*clamp\\(next\\.' + axis + ',\\s*(-?[0-9.]+),\\s*(-?[0-9.]+)\\)'));
    return [axis, match ? [Number(match[1]), Number(match[2])] : null];
  }));
  const legacyBounds = bounds.x && bounds.z ? bounds : null;
  const modules = Object.fromEntries(Object.entries(MODULES).map(([key, path]) =>
    [key, { file: path, present: existsSync(join(root, path)), staticImportReachable: visited.has(path) }]));
  const characterRoot = join(root, 'src/characters');
  const characterPresent = existsSync(characterRoot);
  const characterReachable = graph.reachable.some((p) => p.startsWith('src/characters/'));
  const cargoProbe = await probeCargoModule(root, legacyBounds);
  const containersPreviewWired =
    main.includes("get('scene') === 'containers'") &&
    main.includes('drawContainersBuild28Preview(') &&
    levels.includes('createContainersBuild28DrawPlan(') &&
    modules.cargo.staticImportReachable;
  const localObjPreviewWired = containersPreviewWired &&
    modules.localObj.staticImportReachable &&
    modules.gpuMesh.staticImportReachable &&
    html.includes('id="private-mesh6"') && html.includes('id="private-mesh7"') &&
    main.includes('readLocalObjFile(') && main.includes('parseLocalObjGroup(') &&
    main.includes('renderer.replacePrivateMesh(') && main.includes('renderer.drawPrivateMesh(') &&
    renderer.includes('function replacePrivateMesh(') && renderer.includes('function drawPrivateMesh(');
  const loadLevel = main.slice(main.indexOf('function loadLevel('),
    main.indexOf('function resetGame('));
  const previewClearsColliders = /if\s*\(containersPreviewEnabled\)\s*\{[\s\S]*?state\.solids\s*=\s*\[\s*\]/.test(loadLevel);
  const previewClearsEnemies = /if\s*\(containersPreviewEnabled\)\s*\{[\s\S]*?state\.enemies\s*=\s*\[\s*\]/.test(loadLevel);

  const scene = modules.cargo;
  const blockers = [];
  if (!scene.present) blockers.push({ owner: 'SH-04/SH-11', reason: 'Containers build28 scene candidate is absent on this checkout.' });
  else if (!scene.staticImportReachable) blockers.push({ owner: 'SH-05', reason: 'Cargo candidate exists, but no static import chain from src/main.js reaches it.' });
  if (!modules.gpuMesh.staticImportReachable) blockers.push({ owner: 'SH-12/SH-05', reason: 'No WebGL2 indexed-mesh pipeline is statically reachable from gameplay.' });
  if (!containersPreviewWired) blockers.push({ owner: 'SH-04/SH-05', reason: 'The opt-in Containers route is not statically wired from entrypoint to cargo plan.' });
  if (!localObjPreviewWired) blockers.push({ owner: 'SH-11/SH-12/SH-05', reason: 'No end-to-end static local-OBJ File → mesh upload → WebGL2 draw path is present.' });
  if (previewClearsColliders) blockers.push({ owner: 'SH-05', reason: 'Containers preview explicitly clears state.solids; source-hull movement/projectile contacts are NOT active. Adapter: scripts/integration-cargo-proxy.mjs.' });
  if (previewClearsEnemies) blockers.push({ owner: 'SH-03/SH-05', reason: 'Containers preview explicitly clears state.enemies; no verified native character binding or combat.' });
  if (cargoProbe.staticLegacySpawnRisk?.cameraOutsideLegacyMovementBounds) blockers.push({ owner: 'SH-05', reason: 'Containers demo camera lies outside the inherited playable clamp; first movement can snap viewpoint.' });
  if (!characterReachable) blockers.push({ owner: 'SH-14/SH-05', reason: 'No character rig module is statically reachable from gameplay.' });
  if (!modules.combat.staticImportReachable) blockers.push({ owner: 'SH-03/SH-05', reason: 'Native-bounded combat phase module is not statically reachable from gameplay.' });
  if (!modules.flow.staticImportReachable) blockers.push({ owner: 'SH-08/SH-05', reason: 'Containers source-bounded flow gates are not statically reachable from gameplay.' });
  blockers.push({ owner: 'SH-05/SH-15', reason: 'No browser capture, real GPU draw-call measurement or matched native-scene comparison is supplied by this Node audit.' });

  return {
    schemaVersion: 2,
    target: TARGET,
    evidenceKind: 'WEB_SOURCE_IMPORT_GRAPH_AND_OPTIONAL_CPU_PACKET_PROBE',
    nativeParityVerdict: 'UNASSESSED',
    nativeExecutionObserved: false,
    nativeVisualAssetsUsed: false,
    browserGpuTested: false,
    browserCaptureCompared: false,
    entrypoint: 'src/main.js',
    staticImportGraph: { moduleCount: graph.reachable.length, missingRelativeImports: graph.missing },
    flags: {
      // Static source references, not executed browser/GPU evidence.
      containersPreviewWired,
      localObjPreviewWired,
      containersPreviewCollidersExplicitlyCleared: previewClearsColliders,
      containersPreviewEnemiesExplicitlyCleared: previewClearsEnemies,
      affineBoxRendererDeclared: renderer.includes('function affineBox('),
      legacyCollisionSourceDetected: main.includes('state.solids = state.objects.filter'),
      cargoColliderWiringProven: false,
      legacyBoxShardEnemyDetected: main.includes('function drawEnemy(') && main.includes('renderer.shard('),
    },
    modules: { ...modules, characters: { present: characterPresent, staticImportReachable: characterReachable } },
    cargoCpuProbe: cargoProbe,
    legacyMovementClamp: legacyBounds,
    sourceQualifiedMeshGroupsKnown: 2, // metadata from private #63/#68, not GPU loads
    userSelectedPrivateMeshesObserved: null,
    nativeOriginalMaterialsObserved: false,
    blockers,
  };
}

/**
 * Optional browser-telemetry assessment. The input MUST come from an actually
 * opened ?scene=containers session; a fabricated JSON sample is not evidence.
 * In-app counters do not prove that the browser displayed the expected pixels.
 */
export function assessContainersBrowserMetrics(metrics) {
  if (metrics == null) return { status: 'NOT_OBSERVED', nativeParityVerdict: 'UNASSESSED' };
  if (typeof metrics !== 'object' || Array.isArray(metrics) ||
      metrics.mode !== 'CONTAINERS_COLLIDER_PROXY_NOT_MCD_RUNTIME' ||
      metrics.browserMeasured !== true) {
    return { status: 'INVALID_OR_NOT_CONTAINERS', nativeParityVerdict: 'UNASSESSED' };
  }
  const groups = metrics.locallyLoadedSourceGroups;
  const draws = metrics.generatedManifest?.privateIndexedDraws;
  const proxyOmissions = metrics.generatedManifest?.hiddenByPrivateMesh;
  const calls = metrics.totalWebGLDrawCalls;
  const frameMs = metrics.p95FrameMs;
  const triple = metrics.generatedManifest?.sourceQualifiedMesh6DrawPackets;
  const validCounts = [groups, draws, proxyOmissions, calls].every(
    value => Number.isSafeInteger(value) && value >= 0);
  // The post-SH04 local Mesh6 group47 can legally reuse one GPU upload for
  // three nearly congruent, source-qualified placements. 2 loaded file groups
  // may therefore produce 4 indexed draw calls, NOT 4 independently loaded
  // source meshes. Legacy telemetry without this field remains supported.
  const newModel = triple !== undefined;
  const mesh7Draws = newModel ? draws - triple : null;
  const mappingValid = newModel
    ? (Number.isSafeInteger(triple) && (triple === 0 || triple === 3) &&
      (mesh7Draws === 0 || mesh7Draws === 1) &&
      groups === (triple > 0 ? 1 : 0) + mesh7Draws)
    : (draws <= 2 && draws <= groups);
  if (!validCounts || !Number.isFinite(frameMs) || frameMs <= 0 ||
      groups > 2 || draws > 4 || !mappingValid || calls < draws) {
    return { status: 'INVALID_COUNTERS', nativeParityVerdict: 'UNASSESSED' };
  }
  const matchedGeneratedHulls = newModel
    ? (triple > 0 ? 2 : 0) + mesh7Draws
    : draws;
  const sourceMeshesActive = groups > 0 && draws >= groups && proxyOmissions > 0;
  return {
    status: sourceMeshesActive ? 'APP_REPORTED_INDEXED_MESH_DRAWS' : 'GENERATED_OR_PARTIAL_PROXY_ONLY',
    reportedSourceGroups: groups,
    reportedPrivateIndexedDraws: draws,
    reportedSourceQualifiedMesh6DrawPackets: newModel ? triple : null,
    reportedProxyPacketsOmitted: proxyOmissions,
    reportedTotalWebGLDrawCalls: calls,
    reportedP95FrameMs: frameMs,
    sourceMatchedHullFraction: matchedGeneratedHulls + '/5',
    originalMaterialProven: false,
    physicalCollisionProven: false,
    browserScreenshotCaptured: false,
    nativeParityVerdict: 'UNASSESSED',
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await auditVerticalIntegration();
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}
