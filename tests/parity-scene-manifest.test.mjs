import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSyntheticManifest, drawGeneratedManifest } from '../src/levels.js';
import { boxModelMatrix, normalMatrixFromAffine } from '../src/renderer.js';
import { planSceneDraws, GENERATED_PALETTE } from '../src/visual/scene-plan.js';

const camera = { x: 0, y: 1.68, z: 12, yaw: 0, pitch: 0 };
const close = (a, b, message) => assert.ok(
  Number.isFinite(a) && Math.abs(a - b) < 1e-10,
  message ?? `Expected ${a} close to ${b}`,
);
const dot = (a, b) => a.reduce((sum, n, i) => sum + n * b[i], 0);
const column = (a, index) => a.slice(index * 3, index * 3 + 3);

test('SH05 fixture is explicitly synthetic and preserves parent-child affine transforms', () => {
  const graph = buildSyntheticManifest();
  assert.equal(graph.length, 7);
  assert.equal(graph.find((node) => node.id === 'demo-root').primitive, null);
  const lintel = graph.find((node) => node.id === 'demo-angled-lintel');
  assert.equal(lintel.parentId, 'demo-root');
  assert.ok([1, 2, 4, 6, 8, 9].some((i) => lintel.worldMatrix[i] !== 0));
  assert.equal(lintel.material, 'glass');
  for (const node of graph.filter((item) => item.primitive)) {
    assert.ok(Object.hasOwn(GENERATED_PALETTE, node.material));
    assert.equal(node.primitive.kind, 'box');
    assert.ok(node.bounds.radius > 0);
  }
  assert.ok(graph.find((node) => node.id === 'demo-floor-inlay').primitive);
});

test('SH05 GPU model preserves nonuniform scale, shear and translation', () => {
  const source = [
    2, 0, 0, 0,
    0.4, 3, 0, 0,
    0, 0.7, -4, 0,
    1, 2, -10, 1,
  ];
  const model = boxModelMatrix(source, { x: 2, y: 1, z: 0.5 });
  assert.deepEqual(model.slice(0, 3), [4, 0, 0]);
  assert.deepEqual(model.slice(4, 7), [0.4, 3, 0]);
  assert.deepEqual(model.slice(8, 11), [0, 0.35, -2]);
  assert.deepEqual(model.slice(12, 15), [1, 2, -10]);
  const normal = normalMatrixFromAffine(model);
  const tangents = [
    [model[0], model[1], model[2]],
    [model[4], model[5], model[6]],
    [model[8], model[9], model[10]],
  ];
  for (let axis = 0; axis < 3; axis++) {
    for (let other = 0; other < 3; other++) {
      close(dot(column(normal, axis), tangents[other]), axis === other ? 1 : 0);
    }
  }
});

test('SH05 normal transform respects reflections, not an incorrect legacy normal', () => {
  const source = [
    -2, 0, 0, 0,
    0, 3, 0, 0,
    0, 0, 4, 0,
    0, 0, -8, 1,
  ];
  const normal = normalMatrixFromAffine(source);
  close(normal[0], -0.5);
  close(normal[4], 1 / 3);
  close(normal[8], 0.25);
});

test('SH05 affine GPU rejects singular geometry instead of misrendering normals', () => {
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  assert.throws(() => boxModelMatrix(identity, { x: 1, y: 0, z: 1 }), /positive/);
  assert.throws(() => boxModelMatrix([...identity.slice(0, 8), 0, 0, 0, 0, ...identity.slice(12)] ,
    { x: 1, y: 1, z: 1 }) && normalMatrixFromAffine([
      1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
    ]), /Singular/);
});

test('SH05 actual render adapter dispatches affine and legacy box paths', () => {
  const graph = buildSyntheticManifest();
  const plan = planSceneDraws(graph, camera, { aspect: 16 / 9 });
  const legacy = [], affine = [];
  const renderer = {
    box: (...args) => legacy.push(args),
    affineBox: (...args) => affine.push(args),
  };
  const stats = drawGeneratedManifest(renderer, graph, camera, { aspect: 16 / 9 });
  assert.equal(stats.visible, plan.packets.length);
  assert.equal(stats.affineDraws, affine.length);
  assert.equal(stats.legacyDraws, legacy.length);
  assert.equal(stats.visible, stats.affineDraws + stats.legacyDraws);
  assert.equal(stats.objects, 6);
  assert.ok(stats.affineDraws >= 1);
  assert.ok(stats.legacyDraws >= 1);
  for (const [matrix, size, color] of affine) {
    assert.equal(matrix.length, 16);
    assert.ok(size.x > 0 && size.y > 0 && size.z > 0);
    assert.match(color, /^#[0-9a-f]{6}$/);
    const model = boxModelMatrix(matrix, size);
    assert.equal(normalMatrixFromAffine(model).length, 9);
  }
});

test('SH05 default path is opt-in only; no native MCD geometry published', async () => {
  const { readFileSync } = await import('node:fs');
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /get\('scene'\) === 'synthetic'/);
  assert.match(main, /syntheticManifestEnabled \? buildSyntheticManifest\(\) : null/);
  assert.match(main, /if \(syntheticManifest\) \{/);
  assert.match(main, /SYNTHETIC_NOT_MCD/);
  assert.match(main, /browserMeasured: true/);
});
