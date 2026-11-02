import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEntireObjIntoIndexedMesh } from '../src/render/mesh-format.js';
import { uploadIndexedMesh } from '../src/render/gpu-mesh.js';

// Entirely original synthetic asymmetric noncuboid. Its coordinates/faces
// are NOT from MCD, EnemyMerged, Unity assets, or the private research corpus.
const WEDGE_WITHOUT_GROUP = [
  '# generated static wedge, intentionally without OBJ g or usemtl',
  'o synthetic-asymmetric-wedge',
  'v 1 0 -3', 'v 3 0 -3', 'v 1 2 -3',
  'v 1 0 -4', 'v 3 1 -4', 'v 1 2 -4',
  'vt 0 0', 'vt 1 0', 'vt 0 1', 'vt 0.25 0.75',
  'vn 0 0 1', 'vn 1 0 0',
  'f 1/1/1 2/2/1 3/3/1',
  'f -6/4/2 -3/2/2 -1/3/2',
].join('\n');

const sourceChecks = {
  axisSigns: [-1, 1, -1], winding: 'keep',
  expectedSourcePositionCount: 6, expectedTriangles: 2, expectedPositionRefs: 5,
  expectedBounds: { min: [-3, 0, 3], max: [-1, 2, 4], tolerance: 1e-6 },
};

test('ungrouped entire OBJ produces one source-neutral indexed range and seam splits', () => {
  const out = parseEntireObjIntoIndexedMesh(WEDGE_WITHOUT_GROUP, sourceChecks);
  assert.equal(out.sourcePositionCount, 6);
  assert.equal(out.sourcePositionRefs, 5);
  assert.equal(out.mesh.vertexCount, 6, 'one position is duplicated for UV/normal seam');
  assert.equal(out.mesh.triangleCount, 2);
  assert.equal(out.mesh.strideBytes, 32);
  assert.deepEqual(Array.from(out.mesh.indices), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(out.drawRanges, [{ firstIndex: 0, indexCount: 6, groupName: null }]);
  assert.deepEqual(out.mesh.bounds.min, [-3, 0, 3]);
  assert.deepEqual(out.mesh.bounds.max, [-1, 2, 4]);
  assert.equal(out.geometryProvenance, 'locally-provided-entire-obj-not-native-runtime-proof');
  assert.equal(out.materialBindingsResolved, false);
  assert.equal(out.skinningAvailable, false);
});

test('relative v/vt/vn and positive one-based references preserve actual triangles', () => {
  const positive = WEDGE_WITHOUT_GROUP.replace(
    'f -6/4/2 -3/2/2 -1/3/2', 'f 1/4/2 4/2/2 6/3/2',
  );
  const a = parseEntireObjIntoIndexedMesh(WEDGE_WITHOUT_GROUP);
  const b = parseEntireObjIntoIndexedMesh(positive);
  assert.deepEqual(Array.from(a.mesh.vertices), Array.from(b.mesh.vertices));
  assert.deepEqual(Array.from(a.mesh.indices), Array.from(b.mesh.indices));
});

test('axis conversion and explicit winding give noncuboid Web geometry, not source pose', () => {
  const out = parseEntireObjIntoIndexedMesh(WEDGE_WITHOUT_GROUP, sourceChecks);
  const v = out.mesh.vertices;
  assert.deepEqual(Array.from(v.slice(0, 8)), [-1, 0, 3, 0, 0, -1, 0, 0]);
  assert.equal(v[3 * 8 + 3], -1, 'X normal converted with position at seam');
  assert.ok(Math.abs(v[3 * 8 + 6] - 0.25) < 1e-7, 'UV seam stays distinct');
  assert.equal(out.windingFlipped, false);
  assert.throws(() => parseEntireObjIntoIndexedMesh(WEDGE_WITHOUT_GROUP,
    { axisSigns: [-1, 1, -1] }), /explicit winding/);
  const flipped = parseEntireObjIntoIndexedMesh(WEDGE_WITHOUT_GROUP,
    { axisSigns: [-1, 1, 1], winding: 'flip' });
  assert.deepEqual(Array.from(flipped.mesh.indices), [0, 1, 2, 3, 4, 5]);
  assert.equal(flipped.windingFlipped, true);
  assert.deepEqual(Array.from(flipped.mesh.vertices.slice(8, 11)), [-1, 2, -3]);
});

test('entire OBJ retains contiguous group run boundaries without requiring names', () => {
  const withGroups = WEDGE_WITHOUT_GROUP
    .replace('f -6/4/2 -3/2/2 -1/3/2',
      'g Generated noncuboid EnemyLike Mesh A\nusemtl diagnostic-only\nf -6/4/2 -3/2/2 -1/3/2');
  const out = parseEntireObjIntoIndexedMesh(withGroups, sourceChecks);
  assert.deepEqual(out.drawRanges, [
    { firstIndex: 0, indexCount: 3, groupName: null },
    { firstIndex: 3, indexCount: 3, groupName: 'Generated noncuboid EnemyLike Mesh A' },
  ]);
  assert.ok(out.drawRanges.every(r => !Object.hasOwn(r, 'materialSlot')));
});

test('independently expected source vertex count and bounds gate without inventing native data', () => {
  for (const overrides of [
    { expectedSourcePositionCount: 5237 },
    { expectedTriangles: 3 },
    { expectedPositionRefs: 6 },
    { expectedBounds: { min: [-4, 0, 3], max: [-1, 2, 4], tolerance: 0.01 } },
  ]) {
    assert.throws(() => parseEntireObjIntoIndexedMesh(WEDGE_WITHOUT_GROUP,
      { ...sourceChecks, ...overrides }), /count|triangles|position refs|bounds/);
  }
});

test('invalid or incomplete source faces never become plausible native-looking geometry', () => {
  assert.throws(() => parseEntireObjIntoIndexedMesh(WEDGE_WITHOUT_GROUP.replace(
    'f 1/1/1 2/2/1 3/3/1', 'f 1//1 2/2/1 3/3/1')), /v\/vt\/vn/);
  assert.throws(() => parseEntireObjIntoIndexedMesh(WEDGE_WITHOUT_GROUP.replace(
    'f 1/1/1 2/2/1 3/3/1', 'f 1/1/1 2/2/1 3/3/1 4/1/1')), /triangular/);
  assert.throws(() => parseEntireObjIntoIndexedMesh(WEDGE_WITHOUT_GROUP.replace(
    'f 1/1/1 2/2/1 3/3/1', 'f 100/1/1 2/2/1 3/3/1')), /position/);
  assert.throws(() => parseEntireObjIntoIndexedMesh(WEDGE_WITHOUT_GROUP.replace(
    'f 1/1/1 2/2/1 3/3/1', 'f 0/1/1 2/2/1 3/3/1')), /nonzero OBJ index/);
  assert.throws(() => parseEntireObjIntoIndexedMesh('v 0 0 0\nvt 0 0\nvn 0 0 1'), /no triangular faces/);
});

test('whole OBJ optional transform uses inverse-transpose normals, no implicit skinning', () => {
  const out = parseEntireObjIntoIndexedMesh(WEDGE_WITHOUT_GROUP, {
    worldMatrix: [-2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 3, 0, 2, 1, 0, 1],
  });
  assert.equal(out.world.mirrored, true);
  assert.equal(out.world.model[12], 2);
  assert.equal(out.world.normal[0], -0.5);
  assert.ok(Math.abs(out.world.normal[8] - 1 / 3) < 1e-6);
  assert.equal(out.skinningAvailable, false);
});

test('index ranges feed existing WebGL2 drawElements without material or group guessing', () => {
  const obj = WEDGE_WITHOUT_GROUP.replace(
    'f -6/4/2 -3/2/2 -1/3/2',
    'g Generated second noncuboid part\nf -6/4/2 -3/2/2 -1/3/2',
  );
  const out = parseEntireObjIntoIndexedMesh(obj);
  const draws = [], pointers = [];
  const gl = {
    STATIC_DRAW: 35044, ARRAY_BUFFER: 34962, ELEMENT_ARRAY_BUFFER: 34963,
    VERTEX_ARRAY_BINDING: 34229, ARRAY_BUFFER_BINDING: 34964,
    FLOAT: 5126, TRIANGLES: 4, UNSIGNED_SHORT: 5123, UNSIGNED_INT: 5125,
    getAttribLocation: (_program, name) => ({aPosition:0, aNormal:1, aUV:2})[name] ?? -1,
    getParameter: () => null,
    createVertexArray: () => ({}), createBuffer: () => ({}),
    bindVertexArray: () => {}, bindBuffer: () => {}, bufferData: () => {},
    enableVertexAttribArray: () => {}, vertexAttribPointer: (...p) => pointers.push(p),
    drawElements: (...d) => draws.push(d),
    deleteVertexArray: () => {}, deleteBuffer: () => {},
  };
  const gpu = uploadIndexedMesh(gl, {}, out.mesh);
  for (const range of out.drawRanges) gpu.draw(range);
  assert.deepEqual(draws, [
    [gl.TRIANGLES, 3, gl.UNSIGNED_SHORT, 0],
    [gl.TRIANGLES, 3, gl.UNSIGNED_SHORT, 6],
  ]);
  assert.equal(pointers.length, 3, 'positions, normals, uv0 bound as float32');
  assert.deepEqual(pointers.map(p => p[5]), [0, 12, 24], 'interleaved byte offsets');
  gpu.dispose();
});
