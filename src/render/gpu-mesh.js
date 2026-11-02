import { MESH_VERTEX_STRIDE } from './mesh-format.js';

/**
 * Upload a validated interleaved indexed mesh to WebGL2. Does not own shaders,
 * scene selection, material parameters or any of SH-05's renderer entry points.
 * The active program must expose aPosition and aNormal (vec3), optionally aUV.
 * For any UV0-textured pass, set requireUV:true: otherwise a shader which
 * optimized out/omitted aUV silently renders the mesh with no UV coordinates.
 * This validates attribute WIRING, not texture pixels, material or lighting.
 */
export function uploadIndexedMesh(gl, program, mesh, { usage = gl.STATIC_DRAW, requireUV = false } = {}) {
  if (!gl || !program || !mesh || !(mesh.vertices instanceof Float32Array) ||
      !(mesh.indices instanceof Uint16Array || mesh.indices instanceof Uint32Array) ||
      mesh.strideBytes !== MESH_VERTEX_STRIDE || mesh.vertices.length !== mesh.vertexCount * 8 ||
      mesh.indexCount !== mesh.indices.length) {
    throw new TypeError('Expected WebGL2 context, linked program and defineIndexedMesh result');
  }
  if (typeof requireUV !== 'boolean') throw new TypeError('requireUV must be a boolean');
  const pos = gl.getAttribLocation(program, 'aPosition');
  const norm = gl.getAttribLocation(program, 'aNormal');
  const uv = gl.getAttribLocation(program, 'aUV');
  if (pos < 0 || norm < 0) throw new Error('Mesh shader must expose aPosition and aNormal');
  if (requireUV && uv < 0) {
    throw new Error('Textured indexed mesh requires active aUV shader attribute (UV0)');
  }
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
    uvAttributeBound: uv >= 0,
    indexType: type, bounds: mesh.bounds,
    draw(range = null) {
      if (disposed) throw new Error('Cannot draw a disposed mesh');
      const firstIndex = range?.firstIndex ?? 0;
      const indexCount = range?.indexCount ?? mesh.indexCount;
      if (!Number.isSafeInteger(firstIndex) || !Number.isSafeInteger(indexCount) ||
          firstIndex < 0 || indexCount <= 0 || indexCount % 3 !== 0 ||
          firstIndex + indexCount > mesh.indexCount) {
        throw new RangeError('Invalid triangle draw range');
      }
      gl.bindVertexArray(vao);
      gl.drawElements(gl.TRIANGLES, indexCount, type, firstIndex * (type === gl.UNSIGNED_INT ? 4 : 2));
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
