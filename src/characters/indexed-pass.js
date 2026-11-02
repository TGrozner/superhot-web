import { uploadIndexedMesh } from '../render/gpu-mesh.js';

export const DIAGNOSTIC_CHARACTER_PALETTE = Object.freeze({
  'generated-red': Object.freeze([.835, .12, .23, 1]),
  'generated-dark-red': Object.freeze([.58, .075, .16, 1]),
});
const requiredUniformNames = ['uUseAffine', 'uAffineModel', 'uAffineNormal', 'uColor'];
const rgbaValid = (rgba) => (Array.isArray(rgba) || ArrayBuffer.isView(rgba)) &&
  rgba.length === 4 && Array.from(rgba).every((v) => Number.isFinite(v) && v >= 0 && v <= 1);

/**
 * SH-14-only WebGL2 indexed mesh pass: uses SH-12 uploadIndexedMesh without
 * touching SH-05's shared renderer files. Vertex format is SH-12's
 * [position xyz, normal xyz, uv xy] (32B), one draw per posed rigid part.
 *
 * Renderer owner supplies its EXISTING linked program + uniform locations
 * within createRenderer(). No alternate canvas/context or duplicate shaders.
 */
export function createCharacterIndexedPass(gl, program, uniforms, meshes, {
  resolveColor = (key) => DIAGNOSTIC_CHARACTER_PALETTE[key],
} = {}) {
  if (!gl || !program || !uniforms || requiredUniformNames.some((n) => uniforms[n] == null) ||
      !meshes || typeof meshes !== 'object' || !Object.keys(meshes).length ||
      typeof resolveColor !== 'function') {
    throw new TypeError('Character pass requires WebGL2 program, affine/color uniforms, mesh map and color resolver');
  }
  const gpuMeshes = new Map();
  try {
    for (const [id, mesh] of Object.entries(meshes)) {
      if (typeof id !== 'string' || !id.length) throw new TypeError('Invalid character mesh id');
      gpuMeshes.set(id, uploadIndexedMesh(gl, program, mesh));
    }
  } catch (error) {
    for (const mesh of gpuMeshes.values()) mesh.dispose();
    throw error;
  }
  let disposed = false;
  function draw(packets) {
    if (disposed) throw new Error('Cannot draw a disposed character pass');
    if (!Array.isArray(packets) || packets.length > 128) throw new RangeError('Expected at most 128 character packets');
    const oldVao = gl.getParameter(gl.VERTEX_ARRAY_BINDING);
    const oldProgram = gl.getParameter(gl.CURRENT_PROGRAM);
    const culling = gl.isEnabled(gl.CULL_FACE);
    const oldWinding = culling ? gl.getParameter(gl.FRONT_FACE) : null;
    let drawCalls = 0, triangles = 0;
    try {
      gl.useProgram(program);
      for (const packet of packets) {
        const mesh = gpuMeshes.get(packet?.meshId);
        if (!mesh) throw new Error('Missing source-neutral character mesh: ' + String(packet?.meshId));
        if (!(packet.model instanceof Float32Array) || packet.model.length !== 16 ||
            !(packet.normal instanceof Float32Array) || packet.normal.length !== 9 ||
            !Array.from(packet.model).every(Number.isFinite) ||
            !Array.from(packet.normal).every(Number.isFinite) ||
            typeof packet.mirrored !== 'boolean') {
          throw new TypeError('Packet needs validated affine/normal matrices and mirrored flag');
        }
        const color = resolveColor(packet.materialKey, packet);
        if (!rgbaValid(color)) throw new Error('Character material is unqualified: ' + String(packet.materialKey));
        gl.uniform1i(uniforms.uUseAffine, 1);
        gl.uniformMatrix4fv(uniforms.uAffineModel, false, packet.model);
        gl.uniformMatrix3fv(uniforms.uAffineNormal, false, packet.normal);
        gl.uniform4f(uniforms.uColor, color[0], color[1], color[2], color[3]);
        // Reflected model matrices reverse outward triangle winding with culling.
        // SH-12 generated meshes use CCW winding in their local coordinate system.
        if (culling) gl.frontFace(packet.mirrored ? gl.CW : gl.CCW);
        mesh.draw();
        drawCalls++;
        triangles += mesh.triangleCount;
      }
    } finally {
      if (culling) gl.frontFace(oldWinding);
      gl.bindVertexArray(oldVao);
      gl.useProgram(oldProgram);
    }
    return { drawCalls, triangles, geometryProvenance: 'generated-only-until-source-qualified' };
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const mesh of gpuMeshes.values()) mesh.dispose();
    gpuMeshes.clear();
  }
  return Object.freeze({ draw, dispose, getMeshCount: () => gpuMeshes.size });
}
