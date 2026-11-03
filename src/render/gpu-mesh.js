import { MESH_VERTEX_STRIDE, meshModelMatrices } from './mesh-format.js';

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
  const batches = new Set();
  return {
    vao, indexCount: mesh.indexCount, triangleCount: mesh.triangleCount,
    uvAttributeBound: uv >= 0,
    indexType: type, bounds: mesh.bounds,

    /**
     * Opt-in WebGL2 instancing for RIGID copies of one indexed mesh. Same
     * material, shader, depth state and winding required; living/dead actors
     * with different bone palettes stay on SH-14's animated skin pass.
     *
     * Instanced shader: aPosition/aNormal/[aUV] plus
     * aInstanceModel0..3 (vec4 columns), aInstanceNormal0..2 (vec3 columns).
     * Instance stride: 16+9 float32 = 100 bytes, column-major model and
     * inverse-transpose normal. SH-05 owns the matching shader and draw order.
     *
     * @param {WebGLProgram} instancedProgram Linked instance-aware shader.
     * @param {{capacity?:number,requireUV?:boolean}} [options]
     */
    createInstancedBatch(instancedProgram, { capacity = 128, requireUV: instanceRequireUV = false } = {}) {
      if (disposed) throw new Error('Cannot instance a disposed mesh');
      if (!instancedProgram) throw new TypeError('Instancing requires a linked shader');
      if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 8192) {
        throw new RangeError('Instance capacity must be within 1..8192');
      }
      if (typeof instanceRequireUV !== 'boolean') throw new TypeError('requireUV must be boolean');
      if (typeof gl.drawElementsInstanced !== 'function' ||
          typeof gl.vertexAttribDivisor !== 'function' ||
          typeof gl.bufferSubData !== 'function') {
        throw new Error('WebGL2 instanced drawing and dynamic buffer uploads are required');
      }
      const attrNames = ['aPosition', 'aNormal', 'aUV',
        'aInstanceModel0', 'aInstanceModel1', 'aInstanceModel2', 'aInstanceModel3',
        'aInstanceNormal0', 'aInstanceNormal1', 'aInstanceNormal2'];
      const locations = attrNames.map(name => gl.getAttribLocation(instancedProgram, name));
      const required = [0, 1, 3, 4, 5, 6, 7, 8, 9];
      if (instanceRequireUV) required.push(2);
      for (const index of required) {
        if (locations[index] < 0) throw new Error('Instanced shader must expose ' + attrNames[index]);
      }
      const active = locations.filter(location => location >= 0);
      if (new Set(active).size !== active.length) {
        throw new Error('Instanced shader has overlapping attribute locations');
      }
      const savedVao = gl.getParameter(gl.VERTEX_ARRAY_BINDING);
      const savedArray = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
      const batchVao = gl.createVertexArray(), instanceBuffer = gl.createBuffer();
      if (!batchVao || !instanceBuffer) {
        if (batchVao) gl.deleteVertexArray(batchVao);
        if (instanceBuffer) gl.deleteBuffer(instanceBuffer);
        throw new Error('WebGL2 could not allocate instance buffers');
      }
      try {
        gl.bindVertexArray(batchVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
        for (const [index, size, offset] of [[0,3,0],[1,3,12],[2,2,24]]) {
          if (locations[index] < 0) continue;
          gl.enableVertexAttribArray(locations[index]);
          gl.vertexAttribPointer(locations[index], size, gl.FLOAT, false, MESH_VERTEX_STRIDE, offset);
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, capacity * 100, gl.DYNAMIC_DRAW);
        for (let col = 0; col < 7; col++) {
          const location = locations[3 + col];
          gl.enableVertexAttribArray(location);
          gl.vertexAttribPointer(location, col < 4 ? 4 : 3, gl.FLOAT, false,
            100, col < 4 ? col * 16 : 64 + (col - 4) * 12);
          gl.vertexAttribDivisor(location, 1);
        }
      } catch (error) {
        gl.deleteVertexArray(batchVao);
        gl.deleteBuffer(instanceBuffer);
        throw error;
      } finally {
        gl.bindVertexArray(savedVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, savedArray);
      }
      // Keep the last committed GPU payload separate from the next validated set.
      // A repeated static set can skip bufferSubData entirely; a single moved
      // rigid body uploads just its 100-byte record rather than all instances.
      const staging = new Float32Array(capacity * 25);
      const pending = new Float32Array(capacity * 25);
      let count = 0, mirrored = false, batchDisposed = false;
      const batch = {
        get instanceCount() { return count; },
        get mirrored() { return mirrored; },
        /**
         * Upload only when transforms change, so static groups cost one GPU
         * upload over their lifetime. Reject mixed handedness before upload.
         * @param {ReadonlyArray<ReadonlyArray<number>|Float32Array>} matrices
         */
        setMatrices(matrices) {
          if (batchDisposed || disposed) throw new Error('Cannot update a disposed instance batch');
          if (!Array.isArray(matrices) || matrices.length > capacity) {
            throw new RangeError('Instance matrices exceed capacity');
          }
          let nextMirror = false;
          let firstDirty = matrices.length, lastDirty = -1;
          for (let i = 0; i < matrices.length; i++) {
            const item = meshModelMatrices(matrices[i]);
            if (i && nextMirror !== item.mirrored) {
              throw new RangeError('Mixed mirrored instances require separate batches');
            }
            if (!i) nextMirror = item.mirrored;
            const start = i * 25;
            pending.set(item.model, start);
            pending.set(item.normal, start + 16);
            let changed = i >= count;
            if (!changed) {
              for (let component = 0; component < 25; component++) {
                if (!Object.is(pending[start + component], staging[start + component])) {
                  changed = true;
                  break;
                }
              }
            }
            if (changed) {
              firstDirty = Math.min(firstDirty, i);
              lastDirty = i;
            }
          }
          // One contiguous upload per changed run avoids per-instance GL call
          // overhead. Shrinking a batch or replaying identical transforms
          // requires no transfer. Growing it always uploads the new records.
          if (lastDirty >= firstDirty) {
            const previous = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
            try {
              gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
              gl.bufferSubData(gl.ARRAY_BUFFER, firstDirty * 100,
                pending.subarray(firstDirty * 25, (lastDirty + 1) * 25));
            } finally {
              gl.bindBuffer(gl.ARRAY_BUFFER, previous);
            }
          }
          staging.set(pending.subarray(0, matrices.length * 25));
          count = matrices.length;
          mirrored = nextMirror;
          return batch;
        },
        draw(range = null) {
          if (batchDisposed || disposed) throw new Error('Cannot draw a disposed instance batch');
          if (!count) return { drawCalls: 0, instances: 0, triangles: 0 };
          const firstIndex = range?.firstIndex ?? 0, indexCount = range?.indexCount ?? mesh.indexCount;
          if (!Number.isSafeInteger(firstIndex) || !Number.isSafeInteger(indexCount) ||
              firstIndex < 0 || indexCount <= 0 || indexCount % 3 !== 0 ||
              firstIndex + indexCount > mesh.indexCount) {
            throw new RangeError('Invalid instanced triangle draw range');
          }
          gl.bindVertexArray(batchVao);
          gl.drawElementsInstanced(gl.TRIANGLES, indexCount, type,
            firstIndex * (type === gl.UNSIGNED_INT ? 4 : 2), count);
          return { drawCalls: 1, instances: count, triangles: count * indexCount / 3 };
        },
        dispose() {
          if (batchDisposed) return;
          batchDisposed = true;
          batches.delete(batch);
          gl.deleteVertexArray(batchVao);
          gl.deleteBuffer(instanceBuffer);
        },
      };
      batches.add(batch);
      return batch;
    },
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
      for (const batch of batches) batch.dispose();
      gl.deleteVertexArray(vao);
      gl.deleteBuffer(vbo);
      gl.deleteBuffer(ebo);
    },
  };
}
