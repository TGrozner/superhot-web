import test from 'node:test';
import assert from 'node:assert/strict';
import { defineIndexedMesh, makeCylinderMesh } from '../src/render/mesh-format.js';
import { uploadIndexedMesh } from '../src/render/gpu-mesh.js';

function fakeWebGL2({ missingNormal = false } = {}) {
  const log = [];
  let serial = 0, vao = 'oldVAO', arrayBuffer = 'oldArrayBuffer';
  const gl = {
    STATIC_DRAW: 35044, ARRAY_BUFFER: 34962, ELEMENT_ARRAY_BUFFER: 34963,
    ARRAY_BUFFER_BINDING: 34964, VERTEX_ARRAY_BINDING: 34229,
    FLOAT: 5126, UNSIGNED_SHORT: 5123, UNSIGNED_INT: 5125, TRIANGLES: 4,
    getParameter(p) { return p === this.VERTEX_ARRAY_BINDING ? vao : p === this.ARRAY_BUFFER_BINDING ? arrayBuffer : null; },
    getAttribLocation(_program, name) { return { aPosition: 0, aNormal: missingNormal ? -1 : 1, aUV: 2 }[name] ?? -1; },
    createVertexArray() { return `vao${++serial}`; },
    createBuffer() { return `buffer${++serial}`; },
    bindVertexArray(value) { vao = value; log.push(['bindVAO', value]); },
    bindBuffer(kind, value) { if (kind === this.ARRAY_BUFFER) arrayBuffer = value; log.push(['bindBuffer', kind, value]); },
    bufferData(kind, value, usage) { log.push(['bufferData', kind, value.constructor.name, value.length, usage]); },
    enableVertexAttribArray(i) { log.push(['enable', i]); },
    vertexAttribPointer(...args) { log.push(['attrib', ...args]); },
    drawElements(...args) { log.push(['drawElements', ...args]); },
    deleteVertexArray(value) { log.push(['deleteVAO', value]); },
    deleteBuffer(value) { log.push(['deleteBuffer', value]); },
  };
  return { gl, log };
}

test('uploads a cylinder once, records correct VAO layout, draws indexed triangles', () => {
  const { gl, log } = fakeWebGL2();
  const mesh = makeCylinderMesh({ segments: 12 });
  const gpu = uploadIndexedMesh(gl, 'program', mesh);
  assert.ok(log.some(([op, kind, typed]) => op === 'bufferData' && kind === gl.ELEMENT_ARRAY_BUFFER && typed === 'Uint16Array'));
  assert.ok(log.some((item) => JSON.stringify(item) === JSON.stringify(['attrib', 0, 3, gl.FLOAT, false, 32, 0])));
  assert.ok(log.some((item) => JSON.stringify(item) === JSON.stringify(['attrib', 1, 3, gl.FLOAT, false, 32, 12])));
  assert.ok(log.some((item) => JSON.stringify(item) === JSON.stringify(['attrib', 2, 2, gl.FLOAT, false, 32, 24])));
  assert.deepEqual(log.slice(-2), [['bindVAO', 'oldVAO'], ['bindBuffer', gl.ARRAY_BUFFER, 'oldArrayBuffer']]);
  gpu.draw();
  assert.deepEqual(log.at(-1), ['drawElements', gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_SHORT, 0]);
  gpu.dispose(); gpu.dispose();
  assert.equal(log.filter(([op]) => op === 'deleteVAO').length, 1);
  assert.throws(() => gpu.draw(), /disposed/);
});

test('supports uint32 index buffer when there are more than 65536 vertices', () => {
  const count = 65_537;
  const m = defineIndexedMesh({
    positions: new Float32Array(count * 3), normals: new Float32Array(count * 3),
    uvs: new Float32Array(count * 2), indices: [0, 65536, 42],
  });
  assert.ok(m.indices instanceof Uint32Array);
  const { gl, log } = fakeWebGL2();
  const gpu = uploadIndexedMesh(gl, 'program', m);
  gpu.draw();
  assert.equal(log.at(-1)[3], gl.UNSIGNED_INT);
});

test('fails clearly when the active shader lacks required normal attribute', () => {
  const { gl, log } = fakeWebGL2({ missingNormal: true });
  assert.throws(() => uploadIndexedMesh(gl, 'program', makeCylinderMesh()), /aNormal/);
  assert.equal(log.length, 0, 'no partial GPU allocation');
});
