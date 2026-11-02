import test from 'node:test';
import assert from 'node:assert/strict';
import {
  blackCrystalReflectionLevel,
  blackCrystalReflectionUv,
  createNativeSceneMaterialPacket,
} from '../src/render/native-material.js';

const keywordByIdentity = Object.freeze({
  'resources.assets::3': '_STRIPESONOFF_ON',
  'sharedassets0.assets::9': '_USEGRADIENTMAP_ON',
  'sharedassets0.assets::13': '_ALLOWLOCALFOG_ON',
  'sharedassets0.assets::16': '_ALLOWLOCALFOG_ON',
});

const material = ({ identity, shader, textures = {}, colors = {}, floats = {} }) => ({
  source: { identity },
  shader: { source: shader },
  keywords: keywordByIdentity[identity] ? [keywordByIdentity[identity]] : [],
  renderQueue: -1,
  textures,
  colors,
  floats,
});

test('Concrete packet preserves point-mip sampler, sRGB intent, UV ST and opaque alpha', () => {
  const packet = createNativeSceneMaterialPacket(material({
    identity: 'resources.assets::3',
    shader: 'globalgamemanagers.assets::25',
    textures: {
      _MainTex: {
        textureId: 'sceneTexture_011', sourceTexture: 'resources.assets::248',
        scale: [0.10000000149011612, 0.10000000149011612], offset: [0, 0],
      },
    },
    colors: { _Color: [1, 1, 1, 1] },
    floats: { _Alpha: 0.25, _DIFFUSE: 0.5 },
  }), { renderCategory: 'world', meshHasUv0: true });

  assert.equal(packet.family, 'concrete-2019-main');
  assert.equal(packet.pass.alphaMode, 'opaque');
  assert.equal(packet.pass.materialAlphaIsOpacity, false);
  assert.equal(packet.pass.base.colorWrite, 'rgba');
  assert.equal(packet.pass.additive.depthWrite, true);
  assert.deepEqual(packet.texture.serializedUvTransform, [0.10000000149011612, 0.10000000149011612, 0, 0]);
  assert.equal(packet.texture.nativeSampler.minFilter, 'NEAREST_MIPMAP_NEAREST');
  assert.equal(packet.texture.packageSampler.minFilter, 'NEAREST');
  assert.equal(packet.texture.colorTransfer, 'srgb');
  assert.equal(packet.texture.sample, true);
});

test('UV0 absence suppresses concrete sampling but never reinterprets Black Crystal reflection as diffuse', () => {
  const concrete = material({
    identity: 'resources.assets::3', shader: 'globalgamemanagers.assets::25',
    textures: { _MainTex: { sourceTexture: 'resources.assets::248', scale: [.1, .1], offset: [0, 0] } },
  });
  assert.equal(createNativeSceneMaterialPacket(concrete, {
    renderCategory: 'world', meshHasUv0: false,
  }).texture.sample, false);

  const black = createNativeSceneMaterialPacket(material({
    identity: 'sharedassets0.assets::9', shader: 'globalgamemanagers.assets::12',
    textures: { _Cube2d: { textureId: 'sceneTexture_012', sourceTexture: 'sharedassets0.assets::27', scale: [1, 1], offset: [0, 0] } },
  }), { renderCategory: 'world', meshHasUv0: false });
  assert.equal(black.texture.semantic, 'reflection-lookup');
  assert.equal(black.texture.diffuse, false);
  assert.equal(black.texture.requiresUv0, false);
  assert.equal(black.texture.sample, true);
  assert.equal(black.texture.nativeSampler.minFilter, 'LINEAR_MIPMAP_NEAREST');
  assert.equal(black.texture.packageSampler.minFilter, 'LINEAR');
  assert.equal(black.pass.base.colorWrite, 'rgb');
  assert.equal(black.pass.additive.destinationBlend, 'one');
});

test('Black Crystal lookup helpers preserve compiled dominant-axis addressing and fourth power', () => {
  assert.deepEqual(blackCrystalReflectionUv([2, 1, .5]), [.625, .25]);
  assert.deepEqual(blackCrystalReflectionUv([.25, -2, .5]), [.5625, .375]);
  assert.deepEqual(blackCrystalReflectionUv([.25, .5, -2]), [.5625, .375]);
  assert.equal(blackCrystalReflectionLevel(.5), .0625);
});

test('Red Crystal remains opaque and textureless', () => {
  const packet = createNativeSceneMaterialPacket(material({
    identity: 'sharedassets0.assets::13', shader: 'globalgamemanagers.assets::28',
    colors: { _Color: [0.720588207244873, 0, 0, 1] },
    floats: { _AllowLocalFog: 1, _FogDistance: 5, _FogLength: 7 },
  }), { renderCategory: 'world' });
  assert.equal(packet.family, 'red-crystal');
  assert.equal(packet.texture, null);
  assert.equal(packet.pass.compiledBaseOutputAlpha, 1);
  assert.equal(packet.parameters._AllowLocalFog, 1);
});

test('Package classification, not material names, controls world-pass eligibility', () => {
  const red = material({ identity: 'sharedassets0.assets::13', shader: 'globalgamemanagers.assets::28' });
  const packet = createNativeSceneMaterialPacket(red, { renderCategory: 'technical_trigger_volume' });
  assert.equal(packet.worldPassEligible, false);
  assert.equal(packet.renderCategory, 'technical_trigger_volume');
  assert.throws(() => createNativeSceneMaterialPacket(red), /Unknown native render category/);
});

test('Source fence alpha cutoff remains a depth-writing non-blended pass', () => {
  const fence = material({
    identity: 'sharedassets3.assets::2', shader: 'globalgamemanagers.assets::22',
    textures: { _MainTex: {
      textureId: 'fence', sourceTexture: 'sharedassets3.assets::3',
      scale: [2, 3], offset: [.2, .4],
    } },
    floats: { _Cutoff: .15 },
  });
  const packet = createNativeSceneMaterialPacket(fence, { renderCategory: 'world', meshHasUv0: true });
  assert.equal(packet.pass.cutout, true);
  assert.equal(packet.pass.base.depthWrite, true);
  assert.equal(packet.pass.base.depthTest, 'less-equal');
  assert.equal(packet.pass.base.sourceBlend, 'one');
  assert.equal(packet.pass.base.destinationBlend, 'zero');
  assert.equal(packet.parameters._Cutoff, .15);
  assert.equal(packet.texture.textureId, 'fence');
  assert.deepEqual(packet.texture.serializedUvTransform, [2, 3, .2, .4]);
  assert.equal(packet.texture.sample, true);
  assert.equal(createNativeSceneMaterialPacket(fence,
    { renderCategory: 'world', meshHasUv0: false }).texture.sample, false);
});

test('Monitor packet supplies atlas dimensions, clock offsets and its exact texture', () => {
  const monitor = material({
    identity: 'sharedassets11.assets::3', shader: 'globalgamemanagers.assets::20',
    textures: { _MainTex: {
      textureId: 'monitor-atlas', sourceTexture: 'sharedassets11.assets::5',
      scale: [1, 1], offset: [0, 0],
    } },
    floats: { _NumX: 8, _NumY: 8, _PlaybackSpeed: 15, _TimeOffset: 2, _PositionOffset: .86 },
  });
  const packet = createNativeSceneMaterialPacket(monitor, { renderCategory: 'world', meshHasUv0: true });
  assert.equal(packet.texture.textureId, 'monitor-atlas');
  assert.equal(packet.texture.sample, true);
  assert.deepEqual(packet.parameters,
    { _NumX: 8, _NumY: 8, _PlaybackSpeed: 15, _TimeOffset: 2, _PositionOffset: .86 });
  assert.equal(packet.pass.compiledBaseOutputAlpha, 1);
  assert.equal(packet.pass.base.depthWrite, true);
  monitor.textures._MainTex.sourceTexture = 'sharedassets3.assets::3';
  assert.throws(() => createNativeSceneMaterialPacket(monitor,
    { renderCategory: 'world', meshHasUv0: true }));
});

test('Static hazard Red Crystal gets the same opaque textureless draw inputs as enemy Red Crystal', () => {
  const options = { renderCategory: 'world', meshHasUv0: true };
  const enemy = createNativeSceneMaterialPacket(material({
    identity: 'sharedassets0.assets::13', shader: 'globalgamemanagers.assets::28',
  }), options);
  const hazard = createNativeSceneMaterialPacket(material({
    identity: 'sharedassets0.assets::16', shader: 'globalgamemanagers.assets::28',
  }), options);
  assert.equal(hazard.family, enemy.family);
  assert.deepEqual(hazard.pass, enemy.pass);
  assert.equal(hazard.texture, null);
  assert.equal(hazard.worldPassEligible, true);
});
