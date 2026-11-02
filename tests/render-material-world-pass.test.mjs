import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

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
