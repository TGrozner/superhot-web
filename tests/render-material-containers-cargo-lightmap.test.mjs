import test from 'node:test';
import assert from 'node:assert/strict';
import {
  containersBuild28CargoMaterialBinding,containersBuild28ConcreteMaterialSource,createGeneratedMaterial,
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
    assert.equal(b.nativeMaterialOwner,'resources.assets');
    assert.equal(b.material.materialAsset.owner,'resources.assets');
    assert.equal(b.material.materialAsset.pathId,3);
    assert.equal(b.material.status,'material-identity-resolved-payload-unavailable');
    assert.equal(b.material.serializedRenderer.enabled,true);
    assert.equal(b.material.serializedRenderer.receiveShadows,true);
    assert.equal(b.material.serializedRenderer.castShadowsMode,1);
    assert.deepEqual(b.material.lightmap.tilingOffset,expected.st);
    assert.deepEqual(b.bakedLightmap.atlasReference,{fileId:9,pathId:2});
    assert.deepEqual(b.bakedLightmap.target,{owner:'sharedassets28.assets',pathId:2,name:'Lightmap-0_comp_light'});
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

test('resolved owner and shader/texture POINTERS do not permit an authentic shader draw',()=>{
  const native=containersBuild28CargoMaterialBinding(FIRST.renderer);
  assert.throws(()=>materialDrawPacket(native.material),/explicit generated fallback required/);
  const fallback=createGeneratedMaterial({id:'synthetic-visual-diagnostic',color:'#485761'});
  const result=materialDrawPacket(native.material,{fallback});
  assert.equal(result.fallbackUsed,true);
  assert.equal(result.colorProvenance,'generated-fallback-not-mcd');
  assert.equal(result.lightmapSamplingEnabled,false);
  assert.equal(result.serializedRenderer.rendererPathId,7837);
  assert.equal(result.lightmap.index,0);
  assert.equal(result.materialAsset.owner,'resources.assets');
  assert.equal(result.materialAsset.renderPayloadResolved,false);
});

test('all six exact Containers renderers resolve to the SAME native material; UV2 only 2/6',()=>{
  const others=[
    [461,7941,7,46],[673,8123,7,77],[839,8272,6,24],[1003,8417,6,32],
  ];
  for(const [go,renderer,mesh,group] of others){
    const b=containersBuild28CargoMaterialBinding(renderer);
    assert.equal(b.gameObjectPathId,go);
    assert.deepEqual([b.geometry.meshPathId,b.geometry.staticSubmesh,b.geometry.triangleCount],[mesh,group,1546]);
    assert.equal(b.material.materialAsset.owner,'resources.assets');
    assert.equal(b.material.materialAsset.pathId,3);
    assert.equal(b.material.lightmap,null); // no independent UV2 ST evidence for these four
    assert.equal(b.bakedLightmap,null);
    assert.throws(()=>materialDrawPacket(b.material),/explicit generated fallback required/);
  }
  for(const bad of [3,0,99999]){
    assert.throws(()=>containersBuild28CargoMaterialBinding(bad));
  }
});

test('Unity concrete shader/texture/lightmap owners and values are source-qualified METADATA',()=>{
  const src=containersBuild28ConcreteMaterialSource();
  assert.equal(src.material.owner,'resources.assets');
  assert.equal(src.material.pathId,3);
  assert.equal(src.shader.owner,'globalgamemanagers.assets');
  assert.equal(src.shader.pathId,25);
  assert.equal(src.shader.name,'XULM FULLFORWARD/Concrete 2019 MAIN');
  assert.equal(src.shader.serializedKeyword,'_STRIPESONOFF_ON');
  assert.equal(src.mainTexture.owner,'resources.assets');
  assert.equal(src.mainTexture.pathId,248);
  assert.equal(src.mainTexture.name,'doublebeton_diffuse-barcodezacieki');
  assert.deepEqual(src.mainTexture.uvScale,[0.10000000149011612,0.10000000149011612]);
  assert.deepEqual(src.mainTexture.uvOffset,[0,0]);
  assert.deepEqual(src.shaderProperties._Color,[1,1,1,1]);
  assert.equal(src.shaderProperties._Alpha,0.25);
  assert.equal(src.shaderProperties._DIFFUSE,0.5);
  assert.equal(src.shaderProperties._StripesOnOff,1);
  assert.deepEqual([src.lightmapTexture.targetOwner,src.lightmapTexture.targetPathId],['sharedassets28.assets',2]);
  assert.equal(src.shader.nativeShaderProgramDecoded,false);
  assert.equal(src.mainTexture.imagePixelsDecoded,false);
  assert.equal(src.lightmapTexture.imagePixelsDecoded,false);
  assert.equal(src.webShadingReady,false);
  const b=containersBuild28CargoMaterialBinding(7837);
  assert.equal(b.nativeMaterialMetadata,src);
  assert.equal(b.material.shader,null);
  assert.equal(b.material.rgba,null);
  assert.equal(b.material.textures,null);
});
