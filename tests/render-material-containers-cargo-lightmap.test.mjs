import test from 'node:test';
import assert from 'node:assert/strict';
import {
  containersBuild28CargoMaterialBinding,createGeneratedMaterial,
  materialDrawPacket,transformLightmapUV,
} from '../src/render/material-model.js';

// Only source metadata / IDs, NO original game mesh, shader or lightmap bytes.
const FIRST = Object.freeze({
  renderer:7837,go:336,mesh:6,submesh:47,
  st:[0.15870319306850433,0.15870319306850433,
    0.7985754013061523,-0.00025011622346937656],
});
const SECOND = Object.freeze({
  renderer:7940,go:459,mesh:7,submesh:48,
  st:[0.15870319306850433,0.15870319306850433,
    -0.00025011622346937656,0.6481873989105225],
});

test('two exact P0 renderer->mesh->submesh->material joins remain source-qualified',()=>{
  for(const expected of [FIRST,SECOND]){
    const b=containersBuild28CargoMaterialBinding(expected.renderer);
    assert.equal(b.scene,'Containers/build28');
    assert.equal(b.sourceOwner,'level28');
    assert.equal(b.gameObjectPathId,expected.go);
    assert.equal(b.rendererPathId,expected.renderer);
    assert.deepEqual([b.geometry.meshPathId,b.geometry.staticSubmesh,b.geometry.indexCount,b.geometry.triangleCount],
      [expected.mesh,expected.submesh,4638,1546]);
    assert.deepEqual(b.material.materialReference,{fileId:5,pathId:3});
    assert.equal(b.nativeMaterialOwner,null);
    assert.equal(b.material.status,'material-reference-unresolved');
    assert.equal(b.material.serializedRenderer.enabled,true);
    assert.equal(b.material.serializedRenderer.receiveShadows,true);
    assert.equal(b.material.serializedRenderer.castShadowsMode,1);
    assert.deepEqual(b.material.lightmap.tilingOffset,expected.st);
    assert.deepEqual(b.bakedLightmap.atlasReference,{fileId:9,pathId:2});
    assert.equal(b.bakedLightmap.sceneSettingsPathId,18622);
    assert.equal(b.bakedLightmap.samplingAuthorized,false);
    assert.equal(b.bakedLightmap.webObjUv2Ready,false);
  }
});

test('source UV2 ST maps each cargo to DIFFERENT regions of the same unresolved atlas',()=>{
  const uv=[0.25,0.75]; // synthetic UV2 coordinate, not sampled original data
  const a=containersBuild28CargoMaterialBinding(FIRST.renderer);
  const b=containersBuild28CargoMaterialBinding(SECOND.renderer);
  const first=transformLightmapUV(uv,a.material.lightmap);
  const second=transformLightmapUV(uv,b.material.lightmap);
  for(const [packet,st] of [[first,FIRST.st],[second,SECOND.st]]){
    assert.ok(Math.abs(packet[0]-(uv[0]*st[0]+st[2]))<1e-12);
    assert.ok(Math.abs(packet[1]-(uv[1]*st[1]+st[3]))<1e-12);
  }
  assert.ok(first[0]-second[0]>0.79);
  assert.ok(second[1]-first[1]>0.64);
});

test('without owner-resolved shader/texture, native cargo cannot produce an authentic draw packet',()=>{
  const native=containersBuild28CargoMaterialBinding(FIRST.renderer);
  assert.throws(()=>materialDrawPacket(native.material),/explicit generated fallback required/);
  const fallback=createGeneratedMaterial({id:'synthetic-visual-diagnostic',color:'#485761'});
  const result=materialDrawPacket(native.material,{fallback});
  assert.equal(result.fallbackUsed,true);
  assert.equal(result.colorProvenance,'generated-fallback-not-mcd');
  assert.equal(result.lightmapSamplingEnabled,false);
  assert.equal(result.serializedRenderer.rendererPathId,7837);
  assert.equal(result.lightmap.index,0);
});

test('no pathId3 collision or unknown renderer is auto-mapped to a cargo',()=>{
  for(const bad of [3,0,8272,7941,8123,8417]){
    assert.throws(()=>containersBuild28CargoMaterialBinding(bad));
  }
});
