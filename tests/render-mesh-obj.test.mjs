import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeIndexedObjPayload } from '../src/render/mesh-format.js';
import { uploadIndexedMesh } from '../src/render/gpu-mesh.js';

// Original synthetic NON-CUBIC wedge. No game geometry, assets or source paths.
const OBJ = [
  '# synthetic asymmetric wedge',
  'o independent_fixture',
  'v 1 0 0', 'v 3 0 0', 'v 1 2 0', 'v 2 0 1', 'v 0 2 1',
  'vt 0 0', 'vt 1 0', 'vt 0 1', 'vt 0.25 0.75',
  'vn 0 0 1', 'vn 1 0 0',
  'g wedge_a',
  'f 1/1/1 2/2/1 3/3/1',
  'f 1/4/2 4/2/2 5/3/2',
  'g wedge_b',
  'f -5/1/1 -4/2/1 -3/3/1',
].join('\n');

function fixture(overrides = {}) {
  return {
    coordinateSpace: 'web-rh', axisSigns: [-1, 1, 1], winding: 'flip',
    groups: [
      { name: 'wedge_a', materialSlot: 7, expectedTriangles: 2,
        expectedPositionRefs: 5,
        expectedBounds: { min: [-3, 0, 0], max: [0, 2, 1], tolerance: 1e-7 } },
      { name: 'wedge_b', materialSlot: 9, expectedTriangles: 1,
        expectedPositionRefs: 3,
        expectedBounds: { min: [-3, 0, 0], max: [-1, 2, 0], tolerance: 1e-7 } },
    ],
    ...overrides,
  };
}

test('source-qualified OBJ groups build indexed triangles with exact draw ranges', () => {
  const out = decodeIndexedObjPayload(OBJ, fixture());
  assert.equal(out.mesh.triangleCount, 3);
  assert.equal(out.mesh.vertexCount, 6);
  assert.deepEqual(Array.from(out.mesh.indices), [0, 1, 2, 3, 4, 5, 0, 1, 2]);
  assert.deepEqual(out.drawRanges, [
    { firstIndex: 0, indexCount: 6, materialSlot: 7, groupName: 'wedge_a' },
    { firstIndex: 6, indexCount: 3, materialSlot: 9, groupName: 'wedge_b' },
  ]);
  assert.equal(out.groupEvidence[0].distinctPositionRefs, 5);
  assert.equal(out.groupEvidence[0].triangleCount, 2);
  assert.deepEqual(out.groupEvidence[0].bounds, { min: [-3, 0, 0], max: [0, 2, 1] });
  assert.equal(out.windingFlipped, true);
});

test('mirror X + flip winding keeps winding outward; UV/normal seam splits vertex', () => {
  const { mesh } = decodeIndexedObjPayload(OBJ, fixture());
  const v = mesh.vertices, ids = mesh.indices;
  const p = (i) => Array.from(v.slice(ids[i] * 8, ids[i] * 8 + 3));
  const [a, b, c] = [p(0), p(1), p(2)];
  const crossZ = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  assert.ok(crossZ > 0, 'mirror-x + reverse returns outward +Z');
  assert.deepEqual(a, [-1, 0, 0]);
  assert.equal(v[3], 0);
  assert.equal(v[5], 1);
  assert.equal(v[3 * 8 + 3], -1, 'reflected X normal in second triangle');
  assert.equal(v[3 * 8 + 6], 0.25, 'v1 has distinct UV on second face');
  assert.equal(v[3 * 8 + 7], 0.75);
});

test('negative OBJ references and identity mapping work when explicitly requested', () => {
  const { mesh, windingFlipped } = decodeIndexedObjPayload(OBJ, fixture({
    axisSigns: [1, 1, 1], winding: 'keep',
    groups: [{ name: 'wedge_b', materialSlot: 3,
      expectedTriangles: 1, expectedPositionRefs: 3 }],
  }));
  assert.equal(mesh.vertices[0], 1);
  assert.equal(mesh.vertices[8], 3);
  assert.equal(windingFlipped, false);
  assert.deepEqual(Array.from(mesh.indices), [0, 1, 2]);
});

test('explicit affine matrix gets correctly mirrored normal matrix without auto scene TRS', () => {
  const out = decodeIndexedObjPayload(OBJ, fixture({
    worldMatrix: [-2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 3, 0, 7, 0, 0, 1],
  }));
  assert.equal(out.world.mirrored, true);
  assert.equal(out.world.model[12], 7);
  assert.equal(out.world.normal[0], -0.5);
  assert.equal(out.world.normal[8], 1 / 3);
});

test('invalid/missing group, face count, unique source refs and bounds fail closed', () => {
  const first = fixture().groups[0];
  const select = (changed) => fixture({ groups: [{ ...first, ...changed }] });
  assert.throws(() => decodeIndexedObjPayload(OBJ, select({ name: 'absent' })), /triangle count/);
  assert.throws(() => decodeIndexedObjPayload(OBJ, select({ expectedTriangles: 3 })), /triangle count/);
  assert.throws(() => decodeIndexedObjPayload(OBJ, select({ expectedPositionRefs: 4 })), /distinct position/);
  assert.throws(() => decodeIndexedObjPayload(OBJ, select({
    expectedBounds: { min: [-4, 0, 0], max: [0, 2, 1], tolerance: 0.00001 },
  })), /bounds/);
});

test('quads, missing UV/normal, unsafe face references and reopened groups fail', () => {
  assert.throws(() => decodeIndexedObjPayload(OBJ.replace(
    '1/1/1 2/2/1 3/3/1', '1//1 2/2/1 3/3/1'), fixture()), /v\/vt\/vn/);
  assert.throws(() => decodeIndexedObjPayload(OBJ.replace(
    '1/1/1 2/2/1 3/3/1', '1/1/1 2/2/1 3/3/1 4/4/2'), fixture()), /triangle/);
  assert.throws(() => decodeIndexedObjPayload(OBJ.replace(
    '1/1/1 2/2/1 3/3/1', '999/1/1 2/2/1 3/3/1'), fixture()), /position/);
  assert.throws(() => decodeIndexedObjPayload(OBJ.replace(
    'g wedge_b', 'g wedge_a\ng wedge_b'), fixture()), /reopened/);
});

test('implicit axis, winding, material slot, group duplication cannot be guessed', () => {
  assert.throws(() => decodeIndexedObjPayload(OBJ, fixture({ winding: null })), /winding/);
  assert.throws(() => decodeIndexedObjPayload(OBJ, fixture({ axisSigns: [1, 0, 1] })), /axisSigns/);
  assert.throws(() => decodeIndexedObjPayload(OBJ, fixture({ coordinateSpace: 'unity' })), /coordinateSpace/);
  assert.throws(() => decodeIndexedObjPayload(OBJ, fixture({
    groups: [...fixture().groups, fixture().groups[0]],
  })), /unique/);
  assert.throws(() => decodeIndexedObjPayload(OBJ, fixture({
    groups: [{ name: 'wedge_a', expectedTriangles: 2, expectedPositionRefs: 5 }],
  })), /materialSlot/);
});

test('WebGL2 mock draws selected groups at correct byte offsets, not a native render', () => {
  const calls = [];
  let vao = null, arrayBuffer = null, serial = 0;
  const gl = {
    STATIC_DRAW: 35044, ARRAY_BUFFER: 34962, ELEMENT_ARRAY_BUFFER: 34963,
    ARRAY_BUFFER_BINDING: 34964, VERTEX_ARRAY_BINDING: 34229, FLOAT: 5126,
    UNSIGNED_SHORT: 5123, UNSIGNED_INT: 5125, TRIANGLES: 4,
    getParameter(k) { return k === this.VERTEX_ARRAY_BINDING ? vao : arrayBuffer; },
    getAttribLocation(_, n) { return { aPosition: 0, aNormal: 1, aUV: 2 }[n] ?? -1; },
    createVertexArray() { return ++serial; }, createBuffer() { return ++serial; },
    bindVertexArray(v) { vao = v; },
    bindBuffer(k, v) { if (k === this.ARRAY_BUFFER) arrayBuffer = v; },
    bufferData() {}, enableVertexAttribArray() {}, vertexAttribPointer() {},
    drawElements(...args) { calls.push(args); },
    deleteVertexArray() {}, deleteBuffer() {},
  };
  const { mesh, drawRanges } = decodeIndexedObjPayload(OBJ, fixture());
  const gpu = uploadIndexedMesh(gl, 'program', mesh);
  for (const range of drawRanges) gpu.draw(range);
  assert.deepEqual(calls, [[4, 6, 5123, 0], [4, 3, 5123, 12]]);
  gpu.dispose();
});
