import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/render/native-world-pass.js', import.meta.url), 'utf8');

test('native concrete seam evaluates normalized world-space normal', () => {
  assert.match(source, /vec3 n = uHasNormals == 1 \? normalize\(vNormal\)/);
  assert.match(source, /vSeam, vSeamOverride, n\.y, uMainTexIsZacieki\)/);
  assert.doesNotMatch(source, /vSeam, vSeamOverride, vNormal\.y, uMainTexIsZacieki\)/);
});

test('native opaque concrete shader does not leak serialized _Alpha into framebuffer opacity', () => {
  assert.match(source, /outColor = vec4\(rgb, uMode == 2 \? 1\.0 : uColor\.a \* albedo\.a\)/);
  assert.match(source, /gl\.colorMask\(true, true, true, !material\.reflection\)/);
});
