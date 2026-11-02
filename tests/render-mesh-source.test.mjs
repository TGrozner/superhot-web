import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeIndexedMeshPayload } from '../src/render/mesh-format.js';
import { uploadIndexedMesh } from '../src/render/gpu-mesh.js';

// Entirely synthetic non-box sample: TWO triangles, separate vertex channels,
// packed snorm8 normals, float16 UVs, baseVertex + per-material submesh ranges.
// No original MCD bytes/assets or original stream layout in this fixture.
function samplePayload({ indexFormat = 'uint16', sourceWinding = 'ccw' } = {}) {
  const positions = [[0, 0, 0], [2, 0, 0], [0, 1, 0],
    [5, 0, 0], [8, 0, 0], [5, 1, 0]];
  const stream0 = new Uint8Array(16 * 6);
  const stream1 = new Uint8Array(4 * 6);
  const a = new DataView(stream0.buffer), b = new DataView(stream1.buffer);
  for (let v = 0; v < positions.length; v++) {
    for (let c = 0; c < 3; c++) a.setFloat32(v * 16 + c * 4, positions[v][c], true);
    a.setInt8(v * 16 + 12, 0);
    a.setInt8(v * 16 + 13, 0);
    a.setInt8(v * 16 + 14, 127);
    b.setUint16(v * 4, v % 3 === 1 ? 0x3c00 : 0, true); // U=1 on vertex 1
    b.setUint16(v * 4 + 2, v % 3 === 2 ? 0x3c00 : 0, true); // V=1 on vertex 2
  }
  const indexWidth = indexFormat === 'uint16' ? 2 : 4;
  const indexBufferBytes = new Uint8Array(6 * indexWidth);
  const indexView = new DataView(indexBufferBytes.buffer);
  for (let i = 0; i < 6; i++) {
    if (indexWidth === 2) indexView.setUint16(i * indexWidth, i % 3, true);
    else indexView.setUint32(i * indexWidth, i % 3, true);
  }
  return {
    coordinateSpace: 'web-rh', byteOrder: 'little',
    compression: 'none', sourceWinding, vertexCount: 6,
    streams: [{ bytes: stream0, strideBytes: 16 }, { bytes: stream1, strideBytes: 4 }],
    attributes: {
      position: { stream: 0, offsetBytes: 0, format: 'float32' },
      normal: { stream: 0, offsetBytes: 12, format: 'snorm8' },
      uv0: { stream: 1, offsetBytes: 0, format: 'float16' },
    },
    indexBufferBytes, indexFormat,
    submeshes: [
      { firstByte: 0, indexCount: 3, baseVertex: 0, firstVertex: 0,
        vertexCount: 3, materialSlot: 4, topology: 'triangles' },
      { firstByte: 3 * indexWidth, indexCount: 3, baseVertex: 3, firstVertex: 3,
        vertexCount: 3, materialSlot: 1, topology: 'triangles' },
    ],
    worldMatrix: [-2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 3, 0, 7, 0, 0, 1],
  };
}

test('decodes split streams, half UVs, signed normalized normals, baseVertex and material ranges', () => {
  const out = decodeIndexedMeshPayload(samplePayload());
  assert.deepEqual(Array.from(out.mesh.indices), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(out.drawRanges, [
    { firstIndex: 0, indexCount: 3, materialSlot: 4 },
    { firstIndex: 3, indexCount: 3, materialSlot: 1 },
  ]);
  assert.equal(out.mesh.vertexCount, 6);
  assert.equal(out.mesh.triangleCount, 2);
  assert.equal(out.mesh.vertices[8 + 6], 1);
  assert.equal(out.mesh.vertices[2 * 8 + 7], 1);
  assert.equal(out.mesh.vertices[5], 1); // snorm8 Z normal at vertex 0
  assert.deepEqual(out.mesh.bounds.max, [8, 1, 0]);
  assert.equal(out.world.mirrored, true);
  assert.equal(out.world.model[12], 7);
  assert.equal(out.windingFlipped, false);
});

test('normalizes declared CW triangle indices without inventing geometry', () => {
  const out = decodeIndexedMeshPayload(samplePayload({ sourceWinding: 'cw' }));
  assert.deepEqual(Array.from(out.mesh.indices), [0, 2, 1, 3, 5, 4]);
  assert.equal(out.windingFlipped, true);
});

test('supports byte-aligned uint32 source indices and submesh byte offsets', () => {
  const out = decodeIndexedMeshPayload(samplePayload({ indexFormat: 'uint32' }));
  assert.deepEqual(Array.from(out.mesh.indices), [0, 1, 2, 3, 4, 5]);
  assert.equal(out.drawRanges[1].firstIndex, 3);
});

test('refuses compressed, missing, external-only or ambiguous source payloads', () => {
  const fixture = samplePayload();
  assert.throws(() => decodeIndexedMeshPayload({ ...fixture, compression: 'unity-compressed' }), /Compressed/);
  assert.throws(() => decodeIndexedMeshPayload({ ...fixture, streams: [{ path: 'level28.resS' }] }), /bytes/);
  assert.throws(() => decodeIndexedMeshPayload({ ...fixture, byteOrder: undefined }), /byte order/);
  assert.throws(() => decodeIndexedMeshPayload({ ...fixture, coordinateSpace: 'unity-left-handed' }), /Coordinate conversion/);
  assert.throws(() => decodeIndexedMeshPayload({ ...fixture, sourceWinding: undefined }), /winding/);
  assert.throws(() => decodeIndexedMeshPayload({ ...fixture, attributes: {
    ...fixture.attributes, normal: undefined,
  } }), /Missing source channel/);
});

test('fails closed on truncated bytes, unsupported topology, invalid baseVertex and index alignment', () => {
  const fixture = samplePayload();
  assert.throws(() => decodeIndexedMeshPayload({ ...fixture,
    streams: [{ bytes: fixture.streams[0].bytes.subarray(0, 3), strideBytes: 16 }, fixture.streams[1]],
  }), /truncated/);
  assert.throws(() => decodeIndexedMeshPayload({ ...fixture, submeshes: [
    { ...fixture.submeshes[0], topology: 'lines' },
  ] }), /topology/);
  assert.throws(() => decodeIndexedMeshPayload({ ...fixture, submeshes: [
    { ...fixture.submeshes[0], baseVertex: 6 },
  ] }), /vertex range/);
  assert.throws(() => decodeIndexedMeshPayload({ ...fixture, submeshes: [
    { ...fixture.submeshes[0], firstByte: 1 },
  ] }), /alignment/);
});

test('GPU driver contract draws only requested material slot triangle offsets', () => {
  const calls = [];
  let vao = null, arrayBuffer = null, serial = 0;
  const gl = {
    STATIC_DRAW: 35044, ARRAY_BUFFER: 34962, ELEMENT_ARRAY_BUFFER: 34963,
    ARRAY_BUFFER_BINDING: 34964, VERTEX_ARRAY_BINDING: 34229, FLOAT: 5126,
    UNSIGNED_SHORT: 5123, UNSIGNED_INT: 5125, TRIANGLES: 4,
    getParameter(k) { return k === this.VERTEX_ARRAY_BINDING ? vao : arrayBuffer; },
    getAttribLocation(_, n) { return { aPosition: 0, aNormal: 1, aUV: 2 }[n] ?? -1; },
    createVertexArray() { return ++serial; }, createBuffer() { return ++serial; },
    bindVertexArray(v) { vao = v; }, bindBuffer(k, v) { if (k === this.ARRAY_BUFFER) arrayBuffer = v; },
    bufferData() {}, enableVertexAttribArray() {}, vertexAttribPointer() {},
    drawElements(...args) { calls.push(args); },
    deleteVertexArray() {}, deleteBuffer() {},
  };
  const { mesh, drawRanges } = decodeIndexedMeshPayload(samplePayload());
  const gpu = uploadIndexedMesh(gl, 'program', mesh);
  for (const range of drawRanges) gpu.draw(range);
  assert.deepEqual(calls, [[4, 3, 5123, 0], [4, 3, 5123, 6]]);
  assert.throws(() => gpu.draw({ firstIndex: 4, indexCount: 3 }), /range/);
  assert.throws(() => gpu.draw({ firstIndex: -1, indexCount: 3 }), /range/);
  gpu.dispose();
});
