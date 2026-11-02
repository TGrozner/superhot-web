import { MESH_VERTEX_STRIDE } from './mesh-format.js';

/**
 * Upload a validated interleaved indexed mesh to WebGL2. Does not own shaders,
 * scene selection, material parameters or any of SH-05's renderer entry points.
 * The active program must expose aPosition and aNormal (vec3), optionally aUV.
 */
export function uploadIndexedMesh(gl, program, mesh, { usage = gl.STATIC_DRAW } = {}) {
  if (!gl || !program || !mesh || !(mesh.vertices instanceof Float32Array) ||
      !(mesh.indices instanceof Uint16Array || mesh.indices instanceof Uint32Array) ||
      mesh.strideBytes !== MESH_VERTEX_STRIDE || mesh.vertices.length !== mesh.vertexCount * 8 ||
      mesh.indexCount !== mesh.indices.length) {
    throw new TypeError('Expected WebGL2 context, linked program and defineIndexedMesh result');
  }
  const pos = gl.getAttribLocation(program, 'aPosition');
  const norm = gl.getAttribLocation(program, 'aNormal');
  const uv = gl.getAttribLocation(program, 'aUV');
  if (pos < 0 || norm < 0) throw new Error('Mesh shader must expose aPosition and aNormal');
  const oldVAO = gl.getParameter(gl.VERTEX_ARRAY_BINDING);
  const oldBuffer = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  const ebo = gl.createBuffer();
  if (!vao || !vbo || !ebo) {
    if (vao) gl.deleteVertexArray(vao);
    if (vbo) gl.deleteBuffer(vbo);
    if (ebo) gl.deleteBuffer(ebo);
    throw new Error('WebGL2 failed to allocate mesh buffers');
  }
  try {
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, usage);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, usage);
    for (const [location, size, offset] of [[pos, 3, 0], [norm, 3, 12], [uv, 2, 24]]) {
      if (location >= 0) {
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, size, gl.FLOAT, false, MESH_VERTEX_STRIDE, offset);
      }
    }
  } catch (error) {
    gl.deleteVertexArray(vao);
    gl.deleteBuffer(vbo);
    gl.deleteBuffer(ebo);
    throw error;
  } finally {
    gl.bindVertexArray(oldVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, oldBuffer);
  }
  const type = mesh.indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
  let disposed = false;
  return {
    vao, indexCount: mesh.indexCount, triangleCount: mesh.triangleCount,
    indexType: type, bounds: mesh.bounds,
    draw() {
      if (disposed) throw new Error('Cannot draw a disposed mesh');
      gl.bindVertexArray(vao);
      gl.drawElements(gl.TRIANGLES, mesh.indexCount, type, 0);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      gl.deleteVertexArray(vao);
      gl.deleteBuffer(vbo);
      gl.deleteBuffer(ebo);
    },
  };
}
