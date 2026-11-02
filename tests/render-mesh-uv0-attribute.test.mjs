import test from 'node:test';
import assert from 'node:assert/strict';
import { defineIndexedMesh } from '../src/render/mesh-format.js';
import { uploadIndexedMesh } from '../src/render/gpu-mesh.js';

// Source-neutral asymmetric triangular wedge. No game asset/texture pixels.
const asymmetricWedge = defineIndexedMesh({
  positions: [0, 0, 0, 3, 0, 0, 0, 2, 1, 0, 0, 2],
  normals: [0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0],
  uvs: [0.1, 0.2, 0.9, 0.2, 0.1, 0.8, 0.8, 0.9],
  indices: [0, 1, 2, 0, 2, 3],
});

function mockedWebGL2({ activeUV }) {
  const calls = [];
  const gl = {
    STATIC_DRAW: 35044,
    ARRAY_BUFFER: 34962,
    ELEMENT_ARRAY_BUFFER: 34963,
    ARRAY_BUFFER_BINDING: 34964,
    VERTEX_ARRAY_BINDING: 34229,
    FLOAT: 5126,
    TRIANGLES: 4,
    UNSIGNED_SHORT: 5123,
    UNSIGNED_INT: 5125,
    getAttribLocation(_, name) {
      return ({ aPosition: 0, aNormal: 1, aUV: activeUV ? 2 : -1 })[name] ?? -1;
    },
    getParameter() { return null; },
    createVertexArray() { calls.push('create-vao'); return {}; },
    createBuffer() { calls.push('create-buffer'); return {}; },
    bindVertexArray() {},
    bindBuffer() {},
    bufferData(target, data) { calls.push(['buffer', target, data.length]); },
    enableVertexAttribArray(index) { calls.push(['enable', index]); },
    vertexAttribPointer(...args) { calls.push(['attribute', ...args]); },
    drawElements(...args) { calls.push(['draw', ...args]); },
    deleteVertexArray() {},
    deleteBuffer() {},
  };
  return { gl, calls };
}

test('textured real-WebGL2 contract binds UV0 at offset 24 for noncuboid mesh', () => {
  const { gl, calls } = mockedWebGL2({ activeUV: true });
  const gpu = uploadIndexedMesh(gl, {}, asymmetricWedge, { requireUV: true });
  assert.equal(gpu.uvAttributeBound, true);
  assert.ok(calls.some(x => Array.isArray(x) &&
    x[0] === 'attribute' && x[1] === 2 &&
    x[2] === 2 && x[3] === gl.FLOAT && x[5] === 32 && x[6] === 24));
  gpu.draw({ firstIndex: 3, indexCount: 3 });
  assert.deepEqual(calls.at(-1), ['draw', gl.TRIANGLES, 3, gl.UNSIGNED_SHORT, 6]);
  gpu.dispose();
});

test('source-textured pass fails before GPU allocation if aUV is optimized out or absent', () => {
  const { gl, calls } = mockedWebGL2({ activeUV: false });
  assert.throws(() => uploadIndexedMesh(gl, {}, asymmetricWedge, { requireUV: true }), /requires active aUV/);
  assert.deepEqual(calls, [], 'must not leak half-constructed WebGL buffers');
});

test('legacy untextured indexed meshes remain valid with no aUV and report it explicitly', () => {
  const { gl, calls } = mockedWebGL2({ activeUV: false });
  const gpu = uploadIndexedMesh(gl, {}, asymmetricWedge);
  assert.equal(gpu.uvAttributeBound, false);
  assert.equal(calls.some(x => Array.isArray(x) && x[0] === 'attribute' && x[1] === 2), false);
  gpu.draw();
  assert.deepEqual(calls.at(-1), ['draw', gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0]);
  gpu.dispose();
});

test('UV0 requirement cannot be silently disabled via string or falsy object', () => {
  const { gl, calls } = mockedWebGL2({ activeUV: true });
  assert.throws(() => uploadIndexedMesh(gl, {}, asymmetricWedge, { requireUV: 'false' }), /boolean/);
  assert.deepEqual(calls, []);
});
