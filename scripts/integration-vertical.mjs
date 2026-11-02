import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const TARGET = 'Containers/build28';
const CARGO_MODULE = 'src/scenes/containers-build28.js';

const MODULES = Object.freeze({
  cargo: CARGO_MODULE,
  gpuMesh: 'src/render/gpu-mesh.js',
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

async function probeCargoModule(root) {
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
    return {
      status: 'WEB_CPU_DRAW_PACKET_PROBED',
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
  const modules = Object.fromEntries(Object.entries(MODULES).map(([key, path]) =>
    [key, { file: path, present: existsSync(join(root, path)), staticImportReachable: visited.has(path) }]));
  const characterRoot = join(root, 'src/characters');
  const characterPresent = existsSync(characterRoot);
  const characterReachable = graph.reachable.some((p) => p.startsWith('src/characters/'));
  const cargoProbe = await probeCargoModule(root);

  const scene = modules.cargo;
  const blockers = [];
  if (!scene.present) blockers.push({ owner: 'SH-04/SH-11', reason: 'Containers build28 scene candidate is absent on this checkout.' });
  else if (!scene.staticImportReachable) blockers.push({ owner: 'SH-05', reason: 'Cargo candidate exists, but no static import chain from src/main.js reaches it.' });
  if (!modules.gpuMesh.staticImportReachable) blockers.push({ owner: 'SH-12/SH-05', reason: 'No WebGL2 indexed-mesh pipeline is statically reachable from gameplay.' });
  if (!characterReachable) blockers.push({ owner: 'SH-14/SH-05', reason: 'No character rig module is statically reachable from gameplay.' });
  if (!modules.combat.staticImportReachable) blockers.push({ owner: 'SH-03/SH-05', reason: 'Native-bounded combat phase module is not statically reachable from gameplay.' });
  if (!modules.flow.staticImportReachable) blockers.push({ owner: 'SH-08/SH-05', reason: 'Containers source-bounded flow gates are not statically reachable from gameplay.' });
  blockers.push({ owner: 'SH-05/SH-15', reason: 'No browser capture, real GPU draw-call measurement or matched native-scene comparison is supplied by this Node audit.' });

  return {
    schemaVersion: 1,
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
      syntheticModeOnlyDetected: main.includes("get('scene') === 'synthetic'") && main.includes('SYNTHETIC_NOT_MCD'),
      affineBoxRendererDeclared: renderer.includes('function affineBox('),
      legacyCollisionSourceDetected: main.includes('state.solids = state.objects.filter'),
      cargoColliderWiringProven: false,
      legacyBoxShardEnemyDetected: main.includes('function drawEnemy(') && main.includes('renderer.shard('),
    },
    modules: { ...modules, characters: { present: characterPresent, staticImportReachable: characterReachable } },
    cargoCpuProbe: cargoProbe,
    blockers,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await auditVerticalIntegration();
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}
