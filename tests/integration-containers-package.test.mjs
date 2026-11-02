import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import {
  inspectOwnerLocalContainersPackage,
} from '../scripts/integration-containers-package.mjs';
import { CONTAINERS_BUILD28_SERIALIZED_SOURCE } from
  '../scripts/integration-native-world.mjs';

// All bytes, geometry and scene packages here are synthetic. Never put MCD
// private JSON, binaries or native source into a public integration test.
const expected = { ...CONTAINERS_BUILD28_SERIALIZED_SOURCE };
const authoredPackage = source => ({ schemaVersion: 1, source });
function preparedFixture(source = expected) {
  return {
    source,
    meshes: new Map([['generated-mesh', {}]]),
    textures: new Map([['generated-texture', {}]]),
    instances: [{
      meshId: 'generated-mesh',
      draws: [{ meshId: 'generated-mesh', range: { firstIndex: 0, indexCount: 3 } }],
    }],
    camera: { projection: { verticalFovDegrees: 60 } },
    colliders: [{ isTrigger: false, id: 'generated-collider' }],
    anchors: { player: [{}], enemy: [{ worldMatrix: new Float32Array(16) }] },
    navigation: { settings: {} },
    gameplay: { player: {}, enemy: {}, spawner: {} },
  };
}
async function withPrivateFixture(fn, options = {}) {
  const temp = await mkdtemp(join(tmpdir(), 'sh16-containers-'));
  const privateDir = join(temp, 'private');
  try {
    await mkdir(privateDir);
    const manifest = options.manifest ?? {
      scenePackage: 'generated-scene.json.gz',
      enemyMerged: 'generated-enemy.obj.gz',
      enemyRig: 'generated-rig.json',
    };
    if (!options.noManifest) {
      await writeFile(join(privateDir, 'browser-assets.json'), JSON.stringify(manifest));
    }
    if (!options.noPackage) {
      await writeFile(join(privateDir, 'generated-scene.json.gz'),
        options.gzip ?? gzipSync(JSON.stringify(authoredPackage(options.source ?? expected))));
    }
    if (options.actor !== false) {
      await writeFile(join(privateDir, 'generated-enemy.obj.gz'), 'synthetic');
      await writeFile(join(privateDir, 'generated-rig.json'), '{}');
    }
    return await fn({ privateDir, temp });
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

test('SH16 owner-local Containers preflight detects genuine canonical source before Web execution', async () =>
  withPrivateFixture(async ({ privateDir }) => {
    let calls = 0;
    const report = await inspectOwnerLocalContainersPackage({
      privateDir, prepareScene: async pkg => {
        calls++;
        assert.deepEqual(pkg.source, expected);
        return preparedFixture(pkg.source);
      },
    });
    assert.equal(calls, 1);
    assert.equal(report.status, 'CONTAINERS_SOURCE_INPUTS_READY_FOR_BROWSER_SMOKE_NOT_RENDERED');
    assert.deepEqual(report.missingStructuralInputs, []);
    assert.deepEqual(report.sourceBudget, {
      meshes: 1, instances: 1, textures: 1, indexedDraws: 1, triangles: 1,
      nonTriggerColliders: 1, authorEnemyAnchors: 1,
    });
    assert.equal(report.nativeGameExecuted, false);
    assert.equal(report.browserWebglDrawObserved, false);
    assert.equal(report.browserProjectileContactObserved, false);
    assert.equal(report.nativeMatchedPixelsObserved, false);
    assert.equal(report.measuredVisualDelta, null);
    assert.equal(report.nativeParityVerdict, 'UNASSESSED');
    assert.equal(JSON.stringify(report).includes(privateDir), false);
  }));

test('SH16 refuses Dojo/build10 package even when local manifest and animations exist', async () =>
  withPrivateFixture(async ({ privateDir }) => {
    const report = await inspectOwnerLocalContainersPackage({
      privateDir,
      prepareScene: () => { throw new Error('must not parse or prepare wrong scene'); },
    });
    assert.equal(report.status, 'SCENE_PACKAGE_IS_NOT_SERIALIZED_CONTAINERS_BUILD28');
    assert.equal(report.observedBuildIndex, 10);
    assert.equal(report.expectedBuildIndex, 28);
    assert.equal(report.browserAssetSelectionMustChange, true);
    assert.equal(report.measuredVisualDelta, null);
  }, { source: { sceneBuildIndex: 10, scenePath: 'Assets/Scenes/SYNTHETIC_Dojo.unity', serializedOwner: 'synthetic' } }));

test('SH16 refuses a self-consistent fake build28 path and does not invoke the source parser', async () =>
  withPrivateFixture(async ({ privateDir }) => {
    const report = await inspectOwnerLocalContainersPackage({
      privateDir,
      prepareScene: () => { throw new Error('unexpected prepare'); },
    });
    assert.equal(report.status, 'SCENE_PACKAGE_IS_NOT_SERIALIZED_CONTAINERS_BUILD28');
    assert.equal(report.observedBuildIndex, 28);
  }, { source: { ...expected, scenePath: 'Assets/Scenes/SYNTHETIC_Container.unity' } }));

test('SH16 rejects missing or invalid manifest and absent source package without inventing scene', async () => {
  await withPrivateFixture(async ({ privateDir }) => {
    const report = await inspectOwnerLocalContainersPackage({ privateDir });
    assert.equal(report.status, 'PRIVATE_BROWSER_ASSETS_MANIFEST_UNAVAILABLE_OR_INVALID');
  }, { noManifest: true });
  await withPrivateFixture(async ({ privateDir }) => {
    const report = await inspectOwnerLocalContainersPackage({ privateDir });
    assert.equal(report.status, 'SCENE_PACKAGE_NOT_CONFIGURED');
  }, { manifest: {} });
  await withPrivateFixture(async ({ privateDir }) => {
    const report = await inspectOwnerLocalContainersPackage({ privateDir });
    assert.equal(report.status, 'SCENE_PACKAGE_NOT_A_PRIVATE_REGULAR_FILE');
  }, { noPackage: true });
});

test('SH16 rejects path traversal outside private root before reading source', async () =>
  withPrivateFixture(async ({ privateDir, temp }) => {
    await writeFile(join(temp, 'outside.json.gz'), gzipSync(JSON.stringify(authoredPackage(expected))));
    const report = await inspectOwnerLocalContainersPackage({ privateDir });
    assert.equal(report.status, 'SCENE_PACKAGE_NOT_A_PRIVATE_REGULAR_FILE');
    assert.equal(JSON.stringify(report).includes(temp), false);
  }, { manifest: { scenePackage: '../outside.json.gz' } }));

test('SH16 rejects corrupt gzip or missing JSON with no original bytes in error', async () =>
  withPrivateFixture(async ({ privateDir }) => {
    const report = await inspectOwnerLocalContainersPackage({ privateDir });
    assert.equal(report.status, 'SCENE_PACKAGE_GZIP_OR_JSON_INVALID');
    assert.equal(JSON.stringify(report).includes('original'), false);
  }, { gzip: Buffer.from('not gzip') }));

test('SH16 distinguishes missing animated actor assets from a source-geometry failure', async () =>
  withPrivateFixture(async ({ privateDir }) => {
    const report = await inspectOwnerLocalContainersPackage({
      privateDir, prepareScene: () => preparedFixture(),
    });
    assert.equal(report.status, 'CONTAINERS_PACKAGE_PREPARED_BUT_VERTICAL_INPUTS_MISSING');
    assert.deepEqual(report.missingStructuralInputs, ['localAnimatedEnemyAssetPair']);
    assert.equal(report.structuralInputs.worldMeshesAndIndexedDraws, true);
    assert.equal(report.structuralInputs.localAnimatedEnemyAssetPair, false);
    assert.equal(report.browserCharacterAnimationObserved, false);
  }, { actor: false }));

test('SH16 identifies broken source animation/gameplay inputs even if world draw budget is nonzero', async () =>
  withPrivateFixture(async ({ privateDir }) => {
    const report = await inspectOwnerLocalContainersPackage({
      privateDir, prepareScene: () => {
        const p = preparedFixture();
        p.navigation = null;
        p.anchors.enemy = [];
        p.colliders = [];
        return p;
      },
    });
    assert.equal(report.status, 'CONTAINERS_PACKAGE_PREPARED_BUT_VERTICAL_INPUTS_MISSING');
    assert.deepEqual(report.missingStructuralInputs, [
      'sourceCollisionDefinitions', 'sourceEnemyAnchors', 'sourceNavigationAndEncounterParameters',
    ]);
  }));

test('SH16 cross-checks prepared source identity, not just asserted gzip package name', async () =>
  withPrivateFixture(async ({ privateDir }) => {
    const report = await inspectOwnerLocalContainersPackage({
      privateDir, prepareScene: () => preparedFixture({ ...expected, serializedOwner: 'synthetic-owner' }),
    });
    assert.equal(report.status, 'PREPARED_SCENE_SOURCE_IDENTITY_DIFFERS_FROM_PACKAGE');
    assert.equal(report.browserWebglDrawObserved, false);
  }));

test('SH16 does not leak parser/asset paths or accept invalid draw batches as GPU proof', async () =>
  withPrivateFixture(async ({ privateDir }) => {
    const report = await inspectOwnerLocalContainersPackage({
      privateDir, prepareScene: () => {
        const p = preparedFixture();
        p.instances[0].draws[0].range.indexCount = 5;
        return p;
      },
    });
    assert.equal(report.status, 'CONTAINERS_SCENE_PREPARATION_OR_DRAW_BUDGET_INVALID');
    assert.equal(JSON.stringify(report).includes(privateDir), false);
    assert.equal(report.nativeMatchedPixelsObserved, false);
  }));
