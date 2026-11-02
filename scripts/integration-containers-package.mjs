import { readFile, realpath, stat } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareNativeScene } from '../src/scenes/native-scene-local.js';
import {
  CONTAINERS_BUILD28_SERIALIZED_SOURCE, summarizePreparedNativeWorld,
} from './integration-native-world.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const LIMIT_COMPRESSED = 128 * 1024 * 1024;
const LIMIT_DECOMPRESSED = 384 * 1024 * 1024;
const ACTOR_VARIANTS = Object.freeze([
  Object.freeze(['enemyMerged', 'enemyRig']),
  Object.freeze(['enemyHeadless', 'enemyHeadlessRig']),
]);

const unobserved = () => ({
  evidenceKind: 'OWNER_LOCAL_SOURCE_PACKAGE_PREFLIGHT_NOT_BROWSER_EXECUTION',
  nativeGameExecuted: false,
  browserWebglDrawObserved: false,
  browserCharacterAnimationObserved: false,
  browserProjectileContactObserved: false,
  nativeMatchedPixelsObserved: false,
  measuredVisualDelta: null,
  nativeParityVerdict: 'UNASSESSED',
});

const sameSource = (a, b) => a?.sceneBuildIndex === b?.sceneBuildIndex &&
  a?.scenePath === b?.scenePath && a?.serializedOwner === b?.serializedOwner;

function fileIsInside(root, candidate) {
  const subpath = relative(root, candidate);
  return subpath !== '' && subpath !== '..' &&
    !subpath.startsWith('..' + sep) && !isAbsolute(subpath);
}

async function privateRegularFile(directory, name) {
  if (typeof name !== 'string' || !name.length || name.length > 4096) return null;
  try {
    const resolved = await realpath(resolve(directory, name));
    if (!fileIsInside(directory, resolved)) return null;
    if (!(await stat(resolved)).isFile()) return null;
    return resolved;
  } catch {
    return null;
  }
}

function requiredInputs(prepared, budget, actors) {
  return Object.freeze({
    worldMeshesAndIndexedDraws:
      budget.meshes > 0 && budget.instances > 0 &&
      budget.indexedDraws > 0 && budget.triangles > 0,
    sourceCamera: Boolean(prepared?.camera?.projection),
    sourceCollisionDefinitions:
      Array.isArray(prepared?.colliders) && budget.nonTriggerColliders > 0,
    sourceEnemyAnchors: budget.authorEnemyAnchors > 0,
    sourceNavigationAndEncounterParameters: Boolean(
      prepared?.navigation && prepared?.gameplay?.player &&
      prepared?.gameplay?.enemy && prepared?.gameplay?.spawner),
    localAnimatedEnemyAssetPair: actors.some(pair => pair.every(Boolean)),
  });
}

/**
 * A local disk-only gate that answers the immediate P0 question:
 * is SH-05's configured scenePackage actually Containers/build28, or Dojo?
 *
 * It does not launch MCD, a browser, Windows runner, or any corpus query.
 * File paths, original JSON, meshes, animations and captures are NEVER returned.
 *
 * prepareScene injection exists only for miniature authored integration fixtures.
 * Production uses the actual SH-04/SH-11 prepareNativeScene implementation.
 */
export async function inspectOwnerLocalContainersPackage({
  privateDir = resolve(ROOT, 'private'), prepareScene = prepareNativeScene,
} = {}) {
  const failure = (status, detail = {}) => ({ status, ...detail, ...unobserved() });
  let actualRoot;
  try {
    actualRoot = await realpath(privateDir);
    if (!(await stat(actualRoot)).isDirectory()) return failure('PRIVATE_ROOT_NOT_DIRECTORY');
  } catch {
    return failure('PRIVATE_ROOT_UNAVAILABLE');
  }

  let manifest;
  try {
    manifest = JSON.parse(await readFile(resolve(actualRoot, 'browser-assets.json'), 'utf8'));
  } catch {
    return failure('PRIVATE_BROWSER_ASSETS_MANIFEST_UNAVAILABLE_OR_INVALID');
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) ||
      typeof manifest.scenePackage !== 'string') {
    return failure('SCENE_PACKAGE_NOT_CONFIGURED');
  }

  // Resolve exactly as server.mjs does. Symlinks/traversal outside private/
  // are not allowed even when a path might otherwise exist.
  const sceneFile = await privateRegularFile(actualRoot, manifest.scenePackage);
  if (!sceneFile) return failure('SCENE_PACKAGE_NOT_A_PRIVATE_REGULAR_FILE');
  let compressed;
  try {
    const info = await stat(sceneFile);
    if (!info.size || info.size > LIMIT_COMPRESSED)
      return failure('SCENE_PACKAGE_COMPRESSED_SIZE_UNSUPPORTED');
    compressed = await readFile(sceneFile);
  } catch {
    return failure('SCENE_PACKAGE_READ_FAILED');
  }
  let sourcePackage;
  try {
    // Bounded inflate prevents accidental huge/corrupt owner-local payloads.
    const decoded = gunzipSync(compressed, { maxOutputLength: LIMIT_DECOMPRESSED });
    sourcePackage = JSON.parse(decoded.toString('utf8'));
  } catch {
    return failure('SCENE_PACKAGE_GZIP_OR_JSON_INVALID');
  }

  const expected = CONTAINERS_BUILD28_SERIALIZED_SOURCE;
  if (!sameSource(sourcePackage?.source, expected)) {
    const build = sourcePackage?.source?.sceneBuildIndex;
    return failure('SCENE_PACKAGE_IS_NOT_SERIALIZED_CONTAINERS_BUILD28', {
      observedBuildIndex: Number.isSafeInteger(build) ? build : null,
      expectedBuildIndex: expected.sceneBuildIndex,
      browserAssetSelectionMustChange: true,
    });
  }

  let prepared, budget;
  try {
    prepared = await prepareScene(sourcePackage);
    if (!sameSource(prepared?.source, expected)) {
      return failure('PREPARED_SCENE_SOURCE_IDENTITY_DIFFERS_FROM_PACKAGE');
    }
    budget = summarizePreparedNativeWorld(prepared);
  } catch {
    return failure('CONTAINERS_SCENE_PREPARATION_OR_DRAW_BUDGET_INVALID');
  }

  const actors = await Promise.all(ACTOR_VARIANTS.map(async keys =>
    Promise.all(keys.map(async key =>
      Boolean(await privateRegularFile(actualRoot, manifest[key]))))));
  const inputs = requiredInputs(prepared, budget, actors);
  const missing = Object.entries(inputs).filter(([, ok]) => !ok).map(([key]) => key);
  return {
    status: missing.length
      ? 'CONTAINERS_PACKAGE_PREPARED_BUT_VERTICAL_INPUTS_MISSING'
      : 'CONTAINERS_SOURCE_INPUTS_READY_FOR_BROWSER_SMOKE_NOT_RENDERED',
    independentlyQualifiedSerializedSource: { ...expected },
    originalSerializedSourceEvidence:
      'superhot-research#16/result.json sha256:bdbb4dbbef1a6984ede68c11443c77c40d12695d818a379d5f0efcfb9a3f9b8e',
    sourceBudget: {
      meshes: budget.meshes,
      instances: budget.instances,
      textures: budget.textures,
      indexedDraws: budget.indexedDraws,
      triangles: budget.triangles,
      nonTriggerColliders: budget.nonTriggerColliders,
      authorEnemyAnchors: budget.authorEnemyAnchors,
    },
    structuralInputs: inputs,
    missingStructuralInputs: missing,
    nextOwnerActions: [
      'SH-05: load exactly this configured private package in the actual browser via /local-assets/manifest',
      'SH-05: capture same rendered-frame source identity, indexed WebGL2 draw and actor receipts',
      'SH-05/SH-03: capture shotId to source collider/controller/bodypart and ordered reaction',
      'SH-15: pair saved Web readPixels with executed native same-scene/camera/phase PNG',
    ],
    ...unobserved(),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = process.argv.slice(2);
  if (arg.length > 2 || (arg.length && (arg[0] !== '--private-dir' || !arg[1]))) {
    console.error('Usage: node scripts/integration-containers-package.mjs [--private-dir PATH]');
    process.exitCode = 2;
  } else {
    const report = await inspectOwnerLocalContainersPackage({
      privateDir: arg.length ? resolve(arg[1]) : resolve(ROOT, 'private'),
    });
    console.log(JSON.stringify(report, null, 2));
    if (report.status !== 'CONTAINERS_SOURCE_INPUTS_READY_FOR_BROWSER_SMOKE_NOT_RENDERED')
      process.exitCode = 2;
  }
}
