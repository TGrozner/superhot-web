import test from 'node:test';
import assert from 'node:assert/strict';
import {
  auditIndexedMeshOrientation, defineIndexedMesh, parseObjGroupsIntoIndexedMesh,
} from '../src/render/mesh-format.js';
import { uploadIndexedMesh } from '../src/render/gpu-mesh.js';

// Two sloping non-cubic wedge faces with their actual geometric source normal.
// All input vertices are generated in this test; no game mesh or texture bytes.
const unitNormal = [0, -Math.SQRT1_2, Math.SQRT1_2];
const wedge = () => defineIndexedMesh({
  positions: [0, 0, 0, 2, 0, 0, 0, 1, 1, 2, 1, 1],
  normals: Array.from({ length: 4 }, () => unitNormal).flat(),
  uvs: [0, 0, 1, 0, 0, 1, 1, 1],
  indices: [0, 1, 2, 1, 3, 2],
});

// Exact fake exporter syntax (multiword g + UnityPy-like suffix) but ZERO
// original-game content. This is NOT an MCD mesh or native material fixture.
const syntheticObj = [
  'o generated-sloped-wedge',
  'v 0 0 0', 'v 2 0 0', 'v 0 1 1', 'v 2 1 1',
  'vt 0 0', 'vt 1 0', 'vt 0 1', 'vt 1 1',
  'vn 0 -0.7071067811865475 0.7071067811865475',
  'g Generated sloping wedge 2_24',
  'f 1/1/1 2/2/1 3/3/1',
  'g Generated sloping wedge 2_47',
  'f -3/2/1 -1/4/1 -2/3/1',
].join('\n');

test('asymmetric noncuboid wedge has two aligned source face normals in distinct draw ranges', () => {
  const mesh = wedge();
  const vBefore = Array.from(mesh.vertices), iBefore = Array.from(mesh.indices);
  const report = auditIndexedMeshOrientation(mesh, {
    drawRanges: [
      { groupName: 'synthetic-24', firstIndex: 0, indexCount: 3 },
      { groupName: 'synthetic-47', firstIndex: 3, indexCount: 3 },
    ],
  });
  assert.equal(report.triangles, 2);
  assert.equal(report.aligned, 2);
  assert.equal(report.opposed, 0);
  assert.equal(report.compared, 2);
  assert.equal(report.ranges[0].groupName, 'synthetic-24');
  assert.equal(report.ranges[1].firstIndex, 3);
  assert.ok(report.meanSignedCosine > 0.99999);
  assert.equal(report.nativeShadingOrPixelParityProven, false);
  assert.deepEqual(Array.from(mesh.vertices), vBefore, 'audit must never mutate positions/normals/UV');
  assert.deepEqual(Array.from(mesh.indices), iBefore, 'audit must never repair winding');
});

test('single source axis reflection requires explicit triangle flip to keep normals aligned', () => {
  const options = { axisSigns: [-1, 1, 1], winding: 'keep' };
  const bad = parseObjGroupsIntoIndexedMesh(syntheticObj, ['2_24', '2_47'], options);
  const badReport = auditIndexedMeshOrientation(bad.mesh, { drawRanges: bad.drawRanges });
  assert.equal(badReport.aligned, 0);
  assert.equal(badReport.opposed, 2);
  assert.deepEqual(badReport.ranges.map(x => x.opposed), [1, 1]);
  const corrected = parseObjGroupsIntoIndexedMesh(syntheticObj, ['2_24', '2_47'],
    { ...options, winding: 'flip' });
  const goodReport = auditIndexedMeshOrientation(corrected.mesh, {
    drawRanges: corrected.drawRanges,
  });
  assert.equal(goodReport.aligned, 2);
  assert.equal(goodReport.opposed, 0);
  assert.deepEqual(goodReport.ranges.map(x => x.aligned), [1, 1]);
});

test('double axis reflection keeps OBJ face orientation and source normals', () => {
  const obj = parseObjGroupsIntoIndexedMesh(syntheticObj, ['2_24', '2_47'], {
    axisSigns: [-1, 1, -1], winding: 'keep',
  });
  const r = auditIndexedMeshOrientation(obj.mesh, { drawRanges: obj.drawRanges });
  assert.equal(r.aligned, 2);
  assert.equal(r.worldTriangleWindingReversed, false);
});

test('reflecting only instance matrix reverses GPU front-face, not local source normals', () => {
  const r = auditIndexedMeshOrientation(wedge(), {
    worldMatrix: [-1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0.5, 0, 5, 0, 3, 1],
  });
  assert.equal(r.aligned, 2);
  assert.equal(r.opposed, 0);
  assert.equal(r.mirroredWorld, true);
  assert.equal(r.worldTriangleWindingReversed, true);
});

test('flipped OBJ normals are measured as opposed, never auto-repaired', () => {
  const m = wedge();
  for (let i = 0; i < m.vertexCount; i++) {
    for (let k = 3; k <= 5; k++) m.vertices[8 * i + k] *= -1;
  }
  const r = auditIndexedMeshOrientation(m);
  assert.equal(r.opposed, 2);
  assert.ok(r.meanSignedCosine < -0.99999);
});

test('degenerate geometry, absent normals and ambiguous smoothing are separate results', () => {
  const collinear = defineIndexedMesh({
    positions: [0, 0, 0, 1, 0, 0, 2, 0, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
    uvs: [0, 0, 0.5, 0, 1, 0],
    indices: [0, 1, 2],
  });
  assert.deepEqual(
    (({ degenerate, zeroNormal, compared }) => ({ degenerate, zeroNormal, compared }))
      (auditIndexedMeshOrientation(collinear)),
    { degenerate: 1, zeroNormal: 0, compared: 0 },
  );
  const empty = wedge();
  for (let i = 0; i < empty.vertexCount; i++) {
    empty.vertices.set([0, 0, 0], 8 * i + 3);
  }
  const missing = auditIndexedMeshOrientation(empty);
  assert.equal(missing.zeroNormal, 2);
  assert.equal(missing.meanSignedCosine, null);
  const perpendicular = wedge();
  for (let i = 0; i < perpendicular.vertexCount; i++) {
    perpendicular.vertices.set([1, 0, 0], 8 * i + 3);
  }
  assert.equal(auditIndexedMeshOrientation(perpendicular).ambiguous, 2);
});

test('invalid ranges and corrupt source normals fail before misleading orientation claims', () => {
  assert.throws(() => auditIndexedMeshOrientation(wedge(), {
    drawRanges: [{ firstIndex: 4, indexCount: 3 }],
  }), /draw range/);
  assert.throws(() => auditIndexedMeshOrientation(wedge(), {
    alignmentThreshold: 1,
  }), /alignmentThreshold/);
  assert.throws(() => auditIndexedMeshOrientation(wedge(), {
    worldMatrix: new Array(16).fill(0),
  }), /affine|Singular/);
  const corrupted = wedge();
  corrupted.vertices[3] = NaN;
  assert.throws(() => auditIndexedMeshOrientation(corrupted), /non-finite/);
  const badIndex = wedge();
  badIndex.indices[2] = 65535;
  assert.throws(() => auditIndexedMeshOrientation(badIndex), /out-of-range/);
});

test('per-group audit accompanies actual indexed drawElements offsets without changing the GPU API', () => {
  const { mesh, drawRanges } = parseObjGroupsIntoIndexedMesh(
    syntheticObj, ['2_24', '2_47'], { axisSigns: [-1, 1, -1], winding: 'keep' },
  );
  const audit = auditIndexedMeshOrientation(mesh, { drawRanges });
  assert.equal(audit.aligned, 2);
  const calls = [];
  const gl = {
    STATIC_DRAW: 35044, ARRAY_BUFFER: 34962, ELEMENT_ARRAY_BUFFER: 34963,
    VERTEX_ARRAY_BINDING: 34229, ARRAY_BUFFER_BINDING: 34964,
    FLOAT: 5126, TRIANGLES: 4, UNSIGNED_SHORT: 5123, UNSIGNED_INT: 5125,
    getAttribLocation: (_p, n) => ({ aPosition: 0, aNormal: 1, aUV: 2 })[n] ?? -1,
    getParameter: () => null,
    createVertexArray: () => ({}), createBuffer: () => ({}),
    bindVertexArray: () => {}, bindBuffer: () => {}, bufferData: () => {},
    enableVertexAttribArray: () => {}, vertexAttribPointer: () => {},
    drawElements: (...args) => calls.push(args),
    deleteVertexArray: () => {}, deleteBuffer: () => {},
  };
  const gpu = uploadIndexedMesh(gl, {}, mesh, { requireUV: true });
  for (const range of drawRanges) gpu.draw(range);
  assert.deepEqual(calls, [
    [gl.TRIANGLES, 3, gl.UNSIGNED_SHORT, 0],
    [gl.TRIANGLES, 3, gl.UNSIGNED_SHORT, 6],
  ]);
  gpu.dispose();
});
