import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { applyNativeWorldBaseState } from '../src/render/native-world-pass.js';
import { createNativeSceneMaterialPacket } from '../src/render/native-material.js';

const source = readFileSync(new URL('../src/render/native-world-pass.js', import.meta.url), 'utf8');

test('native concrete seam and diffuse use world normal independently of camera', () => {
  const fragment = source.split('const fragment = `')[1]?.split('`;')[0];
  assert.ok(fragment, 'actual world-pass fragment shader source required');
  assert.match(fragment, /vec3 worldNormal = uHasNormals == 1 \? normalize\(vNormal\)/);
  assert.match(fragment, /vec3 reflectionNormal = worldNormal/);
  assert.match(fragment, /if \(dot\(reflectionNormal, uCamera - vWorld\) < 0\.0\) reflectionNormal = -reflectionNormal/);
  assert.match(fragment, /reflect\(normalize\(vWorld - uCamera\), reflectionNormal\)/);
  assert.match(fragment, /vSeam, vSeamOverride, worldNormal\.y, uMainTexIsZacieki\)/);
  assert.match(fragment, /max\(dot\(worldNormal, normalize\(vec3\(-0\.55, 0\.9, 0\.42\)\)\), 0\.0\)/);
  assert.doesNotMatch(fragment, /vSeam, vSeamOverride, reflectionNormal\.y/);
  assert.doesNotMatch(fragment, /max\(dot\(reflectionNormal/);
});

test('native opaque concrete shader does not leak serialized _Alpha into framebuffer opacity', () => {
  assert.match(source, /outColor = vec4\(rgb, uMode == 2 \? 1\.0 : uColor\.a \* albedo\.a\)/);
  assert.match(source, /gl\.colorMask\(true, true, true, !material\.reflection\)/);
});

test('source-qualified Concrete uses opaque LEQUAL state; unknown material restores renderer state', () => {
  const material = {
    source: { identity: 'resources.assets::3' },
    shader: { source: 'globalgamemanagers.assets::25' },
    keywords: ['_STRIPESONOFF_ON'],
    colors: { _Color: [1, 1, 1, 1] },
    floats: { _DIFFUSE: 0.5 },
    textures: { _MainTex: {
      sourceTexture: 'resources.assets::248',
      textureId: 'concrete-fixture',
      scale: [0.1, 0.1], offset: [0, 0],
    } },
  };
  const packet = createNativeSceneMaterialPacket(material, {
    renderCategory: 'world', meshHasUv0: true,
  });
  assert.equal(packet.family, 'concrete-2019-main');
  const gl = {
    BLEND: 3042, LEQUAL: 515, LESS: 513,
    enabled: true, depth: 513, write: false,
    disable(feature) { assert.equal(feature, this.BLEND); this.enabled = false; },
    enable(feature) { assert.equal(feature, this.BLEND); this.enabled = true; },
    depthFunc(value) { this.depth = value; },
    depthMask(value) { this.write = value; },
  };
  const original = { blend: true, depthFunc: gl.LESS, depthMask: false };
  assert.equal(applyNativeWorldBaseState(gl, packet.pass, original), true);
  assert.deepEqual([gl.enabled, gl.depth, gl.write], [false, gl.LEQUAL, true]);

  assert.equal(applyNativeWorldBaseState(gl, null, original), false);
  assert.deepEqual([gl.enabled, gl.depth, gl.write], [true, gl.LESS, false]);

  assert.equal(applyNativeWorldBaseState(gl, { alphaMode: 'opaque',
    base: { ...packet.pass.base, destinationBlend: 'one' } }, original), false);
  assert.deepEqual([gl.enabled, gl.depth, gl.write], [true, gl.LESS, false]);

  const originallyUnblended = { blend: false, depthFunc: gl.LESS, depthMask: true };
  assert.equal(applyNativeWorldBaseState(gl, null, originallyUnblended), false);
  assert.deepEqual([gl.enabled, gl.depth, gl.write], [false, gl.LESS, true]);
});

test('actual native-world draw path selects and restores compiled-pass depth and blend state', () => {
  assert.match(source, /applyNativeWorldBaseState\(gl, material\.packet\.pass, inheritedState\)/);
  assert.match(source, /blend: gl\.isEnabled\(gl\.BLEND\)/);
  assert.match(source, /depthFunc: gl\.getParameter\(gl\.DEPTH_FUNC\)/);
  assert.match(source, /depthMask: gl\.getParameter\(gl\.DEPTH_WRITEMASK\)/);
  assert.match(source, /gl\.depthFunc\(inheritedState\.depthFunc\)/);
  assert.match(source, /gl\.depthMask\(inheritedState\.depthMask\)/);
});
