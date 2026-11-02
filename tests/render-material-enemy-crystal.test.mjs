import test from 'node:test';
import assert from 'node:assert/strict';
import {
  enemyRedCrystalMaterialBinding,
  enemyRedCrystalDiagnosticWebPacket,
  containersBuild28CargoMaterialBinding,
} from '../src/render/material-model.js';

test('real source SkinnedMeshRenderer4748 binds EnemyMerged geometry, material13 and shader28', () => {
  const b=enemyRedCrystalMaterialBinding(4748);
  assert.equal(b.sourceOwner,'sharedassets0.assets');
  assert.equal(b.rendererEnabled,true);
  assert.deepEqual(
    [b.mesh.pathId,b.mesh.objGroup,b.mesh.sourceVertexCount,b.mesh.sourceTriangleCount],
    [284,'EnemyMerged_0',5237,2254],
  );
  assert.deepEqual(
    [b.rootBonePathId,b.boneCount,b.materialSlot,b.lightmapIndexSerialized],
    [2257,60,0,65535],
  );
  assert.deepEqual(b.materialSource.material.rendererReference,{fileId:0,pathId:13});
  assert.deepEqual(b.materialSource.shader.materialReference,{fileId:1,pathId:28});
  assert.equal(b.materialSource.shader.owner,'globalgamemanagers.assets');
  assert.equal(b.materialSource.shader.name,'XULM FULLFORWARD/Red Crystal');
  assert.equal(b.lightmapSamplingEnabled,false);
  assert.equal(b.runtimeScenePresenceVerified,false);
  assert.equal(b.mesh.poseProven,false);
});

test('headless mesh285 is a separate native mesh, same Material13 not cargo Concrete', () => {
  const b=enemyRedCrystalMaterialBinding(4749);
  assert.deepEqual(
    [b.mesh.pathId,b.mesh.objGroup,b.mesh.sourceVertexCount,b.mesh.sourceTriangleCount,b.boneCount],
    [285,'EnemyMergedHeadless_0',4895,2132,59],
  );
  assert.equal(b.materialSource,enemyRedCrystalMaterialBinding(4748).materialSource);
  assert.equal(b.materialSource.material.owner,'sharedassets0.assets');
  const cargo=containersBuild28CargoMaterialBinding(7837);
  assert.equal(cargo.material.materialAsset.owner,'resources.assets');
  assert.notEqual(cargo.material.materialAsset.name,b.materialSource.material.name);
});

test('Web preview diagnostic has source-derived red channels but explicitly unverified rendering', () => {
  for(const rendererId of [4748,4749]) {
    const p=enemyRedCrystalDiagnosticWebPacket(rendererId);
    assert.equal(p.colorHex,'#b80000');
    assert.deepEqual(p.color,[0.720588207244873,0,0,1]);
    assert.equal(p.colorProvenance,'native-serialized-color-parameter-web-diagnostic-NOT-MCD-fragments');
    assert.equal(p.colorEncoding,'display-srgb-diagnostic-assumption');
    assert.equal(p.fallbackUsed,true);
    assert.equal(p.shaderPassVerified,false);
    assert.equal(p.nativeRenderedColorKnown,false);
    assert.equal(p.lightmapSamplingEnabled,false);
    assert.equal(p.webAlphaOverride,'opaque-diagnostic-only-not-_Alpha-mapping');
    assert.equal(Object.isFrozen(p),true);
  }
});

test('Unity material _Alpha=0 and _ALLOWLOCALFOG_ON are not generic Web alpha/fog rules', () => {
  const src=enemyRedCrystalMaterialBinding(4748).materialSource;
  assert.equal(src.shaderInputs._Alpha,0);
  assert.equal(src.shaderInputs._AllowLocalFog,1);
  assert.equal(src.shaderInputs._FogDistance,5);
  assert.equal(src.shaderInputs._FogLength,7);
  assert.equal(src.shader.serializedKeyword,'_ALLOWLOCALFOG_ON');
  assert.equal(src.nativeSurfaceAlphaKnown,false);
  assert.equal(src.nativeLocalFogPixelsKnown,false);
  assert.equal(src.shader.actualPassAndVariantVerified,false);
  assert.equal(src.material.serializedTextureEnvironmentCount,0);
  assert.equal(enemyRedCrystalDiagnosticWebPacket(4748).color[3],1);
});

test('unproved enemy renderer identity cannot silently become a draw', () => {
  assert.throws(()=>enemyRedCrystalMaterialBinding(0),/integer/);
  assert.throws(()=>enemyRedCrystalMaterialBinding(7837),/No proved EnemyMerged/);
  assert.throws(()=>enemyRedCrystalDiagnosticWebPacket(9999),/No proved EnemyMerged/);
});
