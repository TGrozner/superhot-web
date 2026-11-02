import test from 'node:test';
import assert from 'node:assert/strict';
import { parseObjGroupsIntoIndexedMesh } from '../src/render/mesh-format.js';
import { uploadIndexedMesh } from '../src/render/gpu-mesh.js';

// ORIGINAL/GENERATED asymmetric wedge: never MCD mesh bytes, positions or source.
const SYNTHETIC_WEDGE_OBJ = [
  '# generated OBJ-only fixture with two non-cubic groups',
  'o generated-wedge',
  'v 1 0 -3', 'v 3 0 -3', 'v 1 2 -3',
  'v 1 0 -4', 'v 3 1 -4', 'v 1 2 -4',
  'vt 0 0', 'vt 1 0', 'vt 0 1', 'vt .25 .75',
  'vn 0 0 1', 'vn 1 0 0',
  'g Generated asymmetric wedge 2_24',
  'f 1/1/1 2/2/1 3/3/1',
  'f 1/4/2 4/2/2 6/3/2',
  'g Generated asymmetric wedge 2_47',
  'f -3/1/1 -2/2/1 -1/3/1',
].join('\n');

const conversion = {
  axisSigns: [-1, 1, -1],
  winding: 'keep',
  expectedGroups: {
    '2_24': {
      expectedTriangles: 2, expectedPositionRefs: 5,
      expectedBounds: { min: [-3, 0, 3], max: [-1, 2, 4], tolerance: 1e-6 },
    },
    '2_47': {
      expectedTriangles: 1, expectedPositionRefs: 3,
      expectedBounds: { min: [-3, 0, 4], max: [-1, 2, 4], tolerance: 1e-6 },
    },
  },
};

const conversionFor = (...names) => ({
  ...conversion,
  expectedGroups: Object.fromEntries(names.map(name => [name, conversion.expectedGroups[name]])),
});

test('short terminal tokens resolve two unique descriptive OBJ groups into indexed ranges', () => {
  const result = parseObjGroupsIntoIndexedMesh(
    SYNTHETIC_WEDGE_OBJ, ['2_24', '2_47'], conversion,
  );
  assert.equal(result.mesh.triangleCount, 3);
  assert.equal(result.mesh.vertexCount, 9);
  assert.equal(result.mesh.strideBytes, 32);
  assert.deepEqual(result.drawRanges, [
    { firstIndex: 0, indexCount: 6, groupName: 'Generated asymmetric wedge 2_24', selector: '2_24' },
    { firstIndex: 6, indexCount: 3, groupName: 'Generated asymmetric wedge 2_47', selector: '2_47' },
  ]);
  assert.deepEqual(result.groupEvidence.map(p => [p.selector, p.distinctPositionRefs]),
    [['2_24', 5], ['2_47', 3]]);
  assert.deepEqual(result.groupEvidence[0].bounds, { min: [-3, 0, 3], max: [-1, 2, 4] });
  assert.deepEqual(result.groupEvidence[0].independentChecks,
    { triangles: true, positionRefs: true, bounds: true });
  assert.equal(result.materialBindingsResolved, false);
  assert.equal(Object.hasOwn(result.drawRanges[0], 'materialSlot'), false);
});

test('Web RH double reflection keeps winding and normals aligned on a non-cubic triangle', () => {
  const { mesh, windingFlipped } = parseObjGroupsIntoIndexedMesh(
    SYNTHETIC_WEDGE_OBJ, ['2_24'], conversionFor('2_24'),
  );
  assert.equal(windingFlipped, false);
  const vec = i => Array.from(mesh.vertices.slice(mesh.indices[i] * 8, mesh.indices[i] * 8 + 3));
  const [a, b, c] = [vec(0), vec(1), vec(2)];
  const crossZ = (b[0] - a[0]) * (c[1] - a[1]) -
    (b[1] - a[1]) * (c[0] - a[0]);
  assert.ok(crossZ < 0, '2 reflections preserve actual face winding');
  assert.equal(mesh.vertices[5], -1, 'Z normal reflected with positions');
  assert.deepEqual(a, [-1, 0, 3]);
  // v1 is split because the second face uses a different UV/normal.
  assert.equal(mesh.vertices[3 * 8 + 6], 0.25);
  assert.equal(mesh.vertices[3 * 8 + 3], -1);
});

test('positive one-based and per-face relative negative indices produce same corners', () => {
  const positive = SYNTHETIC_WEDGE_OBJ.replace(
    'f -3/1/1 -2/2/1 -1/3/1', 'f 4/1/1 5/2/1 6/3/1',
  );
  const first = parseObjGroupsIntoIndexedMesh(SYNTHETIC_WEDGE_OBJ, ['2_24', '2_47'], conversion);
  const second = parseObjGroupsIntoIndexedMesh(positive, ['2_24', '2_47'], conversion);
  assert.deepEqual(Array.from(first.mesh.indices), Array.from(second.mesh.indices));
  assert.deepEqual(Array.from(first.mesh.vertices), Array.from(second.mesh.vertices));
});

test('plain two-argument API preserves OBJ-local axes and labels, without claiming native space', () => {
  const result = parseObjGroupsIntoIndexedMesh(SYNTHETIC_WEDGE_OBJ, ['2_47']);
  assert.deepEqual(result.groupEvidence[0].bounds,
    { min: [1, 0, -4], max: [3, 2, -4] });
  assert.deepEqual(result.groupEvidence[0].independentChecks,
    { triangles: false, positionRefs: false, bounds: false });
  assert.equal(result.geometryProvenance, 'locally-provided-obj-text-not-native-runtime-proof');
});

test('caller-specified source gate rejects mismatched triangles, position refs and spatial bounds', () => {
  for (const wrong of [
    { expectedTriangles: 3 },
    { expectedPositionRefs: 4 },
    { expectedBounds: { min: [0, 0, 0], max: [1, 1, 1], tolerance: 1e-6 } },
  ]) {
    assert.throws(() => parseObjGroupsIntoIndexedMesh(
      SYNTHETIC_WEDGE_OBJ, ['2_24'], {
        ...conversion, expectedGroups: { '2_24': { ...conversion.expectedGroups['2_24'], ...wrong } },
      },
    ), /triangle count|position refs|bounds/);
  }
});

test('selected multiword label matches exactly, suffix ambiguity fails closed', () => {
  const label = 'Generated asymmetric wedge 2_47';
  const exact = parseObjGroupsIntoIndexedMesh(SYNTHETIC_WEDGE_OBJ, [label]);
  assert.equal(exact.drawRanges[0].groupName, label);
  const duplicated = SYNTHETIC_WEDGE_OBJ +
    '\ng Another independently generated wedge 2_47\nf 1/1/1 2/2/1 3/3/1';
  assert.throws(() => parseObjGroupsIntoIndexedMesh(duplicated, ['2_47']), /declared more than once/);
  assert.throws(() => parseObjGroupsIntoIndexedMesh(SYNTHETIC_WEDGE_OBJ,
    ['2_47', label]), /multiple selectors match/);
});

test('missing groups, repeated selectors and unsupported nontriangle faces fail closed', () => {
  assert.throws(() => parseObjGroupsIntoIndexedMesh(SYNTHETIC_WEDGE_OBJ, ['2_98']), /missing or empty/);
  assert.throws(() => parseObjGroupsIntoIndexedMesh(SYNTHETIC_WEDGE_OBJ, ['2_24', '2_24']), /unique/);
  assert.throws(() => parseObjGroupsIntoIndexedMesh(
    SYNTHETIC_WEDGE_OBJ.replace('f 1/1/1 2/2/1 3/3/1', 'f 1/1/1 2/2/1 3/3/1 4/1/1'), ['2_24'],
  ), /triangles only/);
  assert.throws(() => parseObjGroupsIntoIndexedMesh(
    SYNTHETIC_WEDGE_OBJ.replace('f -3/1/1 -2/2/1 -1/3/1', 'f 0/1/1 -2/2/1 -1/3/1'), ['2_47'],
  ), /nonzero OBJ index/);
});

test('nonidentity axis transform requires explicit winding, no inferred material or GO binding', () => {
  assert.throws(() => parseObjGroupsIntoIndexedMesh(
    SYNTHETIC_WEDGE_OBJ, ['2_24'], { axisSigns: [-1, 1, -1] },
  ), /explicit winding/);
  const flipped = parseObjGroupsIntoIndexedMesh(
    SYNTHETIC_WEDGE_OBJ, ['2_47'], { axisSigns: [-1, 1, 1], winding: 'flip' },
  );
  assert.equal(flipped.windingFlipped, true);
  assert.equal(flipped.materialBindingsResolved, false);
});

test('selected range is fed directly to indexed WebGL2 drawElements without source material assumptions', () => {
  const { mesh, drawRanges } = parseObjGroupsIntoIndexedMesh(
    SYNTHETIC_WEDGE_OBJ, ['2_24', '2_47'], conversion,
  );
  const calls = [];
  const gl = {
    STATIC_DRAW: 35044, ARRAY_BUFFER: 34962, ELEMENT_ARRAY_BUFFER: 34963,
    VERTEX_ARRAY_BINDING: 34229, ARRAY_BUFFER_BINDING: 34964,
    FLOAT: 5126, TRIANGLES: 4, UNSIGNED_SHORT: 5123, UNSIGNED_INT: 5125,
    getAttribLocation: (_p, name) => name === 'aPosition' ? 0 : name === 'aNormal' ? 1 : -1,
    getParameter: () => null,
    createVertexArray: () => ({}), createBuffer: () => ({}),
    bindVertexArray: () => {}, bindBuffer: () => {}, bufferData: () => {},
    enableVertexAttribArray: () => {}, vertexAttribPointer: () => {},
    drawElements: (...args) => calls.push(args),
    deleteVertexArray: () => {}, deleteBuffer: () => {},
  };
  const gpu = uploadIndexedMesh(gl, {}, mesh);
  for (const range of drawRanges) gpu.draw(range);
  assert.deepEqual(calls, [[gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0],
    [gl.TRIANGLES, 3, gl.UNSIGNED_SHORT, 12]]);
  gpu.dispose();
});
