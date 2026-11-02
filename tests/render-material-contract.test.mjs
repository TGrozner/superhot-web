import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGeneratedMaterial,createSerializedMaterialSlot,materialDrawPacket,
  transformLightmapUV,
} from '../src/render/material-model.js';
import {
  createUnresolvedNativeLighting,createGeneratedLighting,lightingUniformPacket,
  sampleGeneratedLighting,srgbToLinear,linearToSrgb,
} from '../src/render/lighting-model.js';

// Intentional SYNTHETIC fixture, not an extracted MCD asset or property record.
const nativeSlot=()=>createSerializedMaterialSlot({
  id:'synthetic-slot',owner:'test-fixture',rendererPathId:123,
  materialReference:{fileId:2,pathId:99},slot:0,
  rendererEnabled:true,castShadows:1,receiveShadows:true,
  lightmapIndex:0,lightmapTilingOffset:[.25,.5,.1,-.2],
  evidence:'private:synthetic-fixture',
});
const fallback=()=>createGeneratedMaterial({id:'generated-white',color:'#ffffff'});
const input=()=>({
  id:'test',owner:'fixture',rendererPathId:1,
  materialReference:{fileId:2,pathId:99},
  rendererEnabled:true,castShadows:1,receiveShadows:true,
  evidence:'private:synthetic-fixture',
});

test('Web material: sRGB RGBA and explicit provenance',()=>{
  const m=createGeneratedMaterial({id:'paint',color:'#804020',alpha:.5});
  const p=materialDrawPacket(m);
  assert.deepEqual(p.color.slice(0,3).map(x=>Math.round(x*255)),[128,64,32]);
  assert.equal(p.color[3],.5);
  assert.equal(p.colorEncoding,'srgb');
  assert.equal(p.colorProvenance,'generated-web');
  assert.equal(p.fallbackUsed,false);
});

test('original reference does not imply known RGB, shader or texture',()=>{
  const m=nativeSlot();
  assert.deepEqual(m.materialReference,{fileId:2,pathId:99});
  assert.equal(m.status,'material-reference-unresolved');
  assert.equal(m.rgba,null);
  assert.equal(m.shader,null);
  assert.equal(m.textures,null);
  assert.throws(()=>materialDrawPacket(m),/explicit generated fallback required/);
});

test('explicit substitute keeps native renderer flags but is marked generated',()=>{
  const p=materialDrawPacket(nativeSlot(),{fallback:fallback()});
  assert.equal(p.colorProvenance,'generated-fallback-not-mcd');
  assert.equal(p.fallbackUsed,true);
  assert.equal(p.serializedRenderer.castShadowsMode,1);
  assert.equal(p.serializedRenderer.receiveShadows,true);
  assert.equal(p.serializedRenderer.enabled,true);
  assert.equal(p.lightmap.index,0);
  assert.equal(p.lightmap.textureResolved,false);
  assert.equal(p.lightmapSamplingEnabled,false);
});

test('lightmap UV2 transform preserves serialized atlas ST, never samples a texture',()=>{
  const l=nativeSlot().lightmap;
  const uv=transformLightmapUV([.5,.25],l);
  assert.ok(Math.abs(uv[0]-.225)<1e-12);
  assert.ok(Math.abs(uv[1]+.075)<1e-12);
});

test('bad renderer metadata and implicit fallback are rejected',()=>{
  assert.throws(()=>createGeneratedMaterial({id:'bad',color:'#fff'}),/#RRGGBB/);
  assert.throws(()=>createSerializedMaterialSlot({...input(),materialReference:{fileId:-1,pathId:2}}),/integer/);
  assert.throws(()=>createSerializedMaterialSlot({...input(),lightmapIndex:0}),/provided together/);
  assert.throws(()=>createSerializedMaterialSlot({...input(),rendererEnabled:1}),/boolean/);
  assert.throws(()=>materialDrawPacket(nativeSlot(),{fallback:{provenance:'unity-serialized'}}),/explicitly generated/);
});

test('lighting packet mirrors OLD Web shader, not native scene settings',()=>{
  const p=lightingUniformPacket(createGeneratedLighting());
  assert.equal(p.ambient,.64);
  assert.equal(p.diffuse,.36);
  assert.deepEqual(p.fogColor,[.927,.948,.966]);
  assert.equal(p.fogStart,14);
  assert.equal(p.fogEnd,70);
  assert.equal(p.fogStrength,.72);
  assert.equal(p.exposure,1);
  assert.equal(p.colorSpaceMode,0);
  assert.equal(p.source,'generated-web');
});

test('native lighting unknown remains unavailable',()=>{
  const p=createUnresolvedNativeLighting({scene:'ContainerPort',evidence:'private:pending-proof'});
  assert.equal(p.fog,null);
  assert.equal(p.exposure,null);
  assert.throws(()=>lightingUniformPacket(p),/Unresolved native lighting/);
  assert.throws(()=>sampleGeneratedLighting(p,{}),/Unresolved native lighting/);
});

test('lighting front-facing receives more diffuse than rear-facing',()=>{
  const l=createGeneratedLighting({fogStrength:0});
  const args={color:[1,1,1,1],position:[0,0,0],cameraPosition:[0,0,0]};
  const front=sampleGeneratedLighting(l,{...args,normal:[0,1,0]});
  const rear=sampleGeneratedLighting(l,{...args,normal:[0,-1,0]});
  assert.ok(front[0]>rear[0]);
  assert.equal(rear[0],.64);
});

test('generated fog reaches 0.72 blend at far distance and preserves alpha',()=>{
  const l=createGeneratedLighting({ambient:1,diffuse:0});
  const p=sampleGeneratedLighting(l,{
    color:[0,0,0,.33],normal:[0,1,0],
    position:[0,0,70],cameraPosition:[0,0,0],
  });
  assert.ok(Math.abs(p[0]-.927*.72)<1e-12);
  assert.ok(Math.abs(p[1]-.948*.72)<1e-12);
  assert.equal(p[3],.33);
});

test('linear-srgb experiment changes output; sRGB encoding roundtrips',()=>{
  for(const x of [0,.02,.5,.8,1]){
    assert.ok(Math.abs(linearToSrgb(srgbToLinear(x))-x)<1e-12);
  }
  const args={color:[.5,.5,.5,1],normal:[0,-1,0],position:[0,0,0],cameraPosition:[0,0,0]};
  const legacy=sampleGeneratedLighting(createGeneratedLighting({fogStrength:0}),args);
  const linear=sampleGeneratedLighting(createGeneratedLighting({fogStrength:0,colorSpace:'linear-srgb'}),args);
  assert.notEqual(legacy[0],linear[0]);
});

test('bad fog, exposure, zero vector and color-space fail closed',()=>{
  assert.throws(()=>createGeneratedLighting({direction:[0,0,0]}),/Zero or invalid/);
  assert.throws(()=>createGeneratedLighting({fogEnd:14}),/fogEnd/);
  assert.throws(()=>createGeneratedLighting({exposure:0}),/exposure/);
  assert.throws(()=>createGeneratedLighting({colorSpace:'unknown'}),/Unsupported/);
});
