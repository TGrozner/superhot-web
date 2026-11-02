import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLocalObjGroup, readLocalObjFile } from '../src/preview/local-obj-group.js';

// Fully synthetic OBJ fixture: never ship game vertices or original assets.
const fixture = [
  'g generated root',
  'v -17 2 -14',
  'v -18 2 -14',
  'v -17 3 -14',
  'v 9 2 3',
  'vt 0 0', 'vt 1 0', 'vt 0 1',
  'vn 0 0 1',
  'g generated_46',
  'f 1/1/1 4/2/1 3/3/1',
  'g generated_47',
  'f 1/1/1 2/2/1 3/3/1',
].join('\n');

test('selected OBJ group is triangulated into source-neutral Web indexed buffers', () => {
  const { mesh, triangles, group } = parseLocalObjGroup(fixture, {
    groupIndex: 47, expectedTriangles: 1, expectedCenter: [17.5, 2.5, 14],
  });
  assert.equal(group, 'generated_47');
  assert.equal(triangles, 1);
  assert.equal(mesh.vertexCount, 3);
  assert.deepEqual(Array.from(mesh.indices), [0, 1, 2]);
  assert.deepEqual(Array.from(mesh.bounds.center), [17.5, 2.5, 14]);
  assert.deepEqual(Array.from(mesh.vertices.slice(0, 8)), [17, 2, 14, -0, 0, -1, 0, 0]);
});

test('group selector does not include neighboring OBJ faces', () => {
  assert.equal(parseLocalObjGroup(fixture, { groupIndex: 46 }).triangles, 1);
  assert.throws(() => parseLocalObjGroup(fixture, { groupIndex: 48 }), /not found/);
});

test('mesh provenance gates reject wrong triangle counts and spatial bounds', () => {
  assert.throws(() => parseLocalObjGroup(fixture, { groupIndex: 47, expectedTriangles: 2 }), /triangle count/);
  assert.throws(() => parseLocalObjGroup(fixture, { groupIndex: 47, expectedCenter: [0, 0, 0] }), /bounds/);
});

test('invalid OBJ face topology and references are not silently accepted', () => {
  assert.throws(() => parseLocalObjGroup(fixture.replace('f 1/1/1 2/2/1 3/3/1', 'f 1 2 3'), { groupIndex: 47 }), /requires positive/);
  assert.throws(() => parseLocalObjGroup(fixture.replace('f 1/1/1 2/2/1 3/3/1', 'f 1/1/1 2/2/1 3/3/1 4/1/1'), { groupIndex: 47 }), /triangular/);
});

test('local OBJ file loader rejects unsupported extensions and oversized files', async () => {
  await assert.rejects(readLocalObjFile({ name: 'payload.exe', size: 1 }), /Choose a local/);
  await assert.rejects(readLocalObjFile({ name: 'source.obj', size: 17 * 1024 * 1024 }), /exceeds/);
  assert.equal(await readLocalObjFile({ name: 'source.obj', size: 3, text: async () => fixture }), fixture);
});
