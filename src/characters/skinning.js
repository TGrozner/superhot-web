import { defineIndexedMesh, meshModelMatrices } from '../render/mesh-format.js';
import { multiplyMatrices } from '../scenes/graph.js';

const MAX_BONES = 256;
const INFLUENCES_PER_VERTEX = 4;

function numericBuffer(value, length, label) {
  if ((!Array.isArray(value) && !(ArrayBuffer.isView(value) && !(value instanceof DataView))) ||
      value.length !== length) {
    throw new TypeError(label + ' must have exactly ' + length + ' scalar components');
  }
  return value;
}

function checkedMatrix(value, label) {
  if ((!Array.isArray(value) && !(ArrayBuffer.isView(value) && !(value instanceof DataView))) ||
      value.length !== 16 || Array.from(value).some(v => typeof v !== 'number' || !Number.isFinite(v)) ||
      value[3] !== 0 || value[7] !== 0 || value[11] !== 0 || value[15] !== 1) {
    throw new TypeError(label + ' requires finite column-major affine 4x4 in Web mesh-local space');
  }
  meshModelMatrices(value); // Reject singular / overflowing matrices.
  return new Float32Array(value);
}

/**
 * A SOURCE-NEUTRAL linear blend skinning binding for any SH-12 indexed mesh.
 *
 * This does not extract a Unity rig. It requires the caller to supply the
 * EXACT matching bone order, inverse bind matrices, and 4 weighted influences
 * per vertex. No fallback pose or invented influence map is permitted.
 *
 * All bind, pose and mesh coordinates must ALREADY share Web RH mesh-local
 * convention. The root model-to-world is applied afterwards by SH-05.
 */
export function createIndexedSkinBinding({
  mesh, boneIds, inverseBindMatrices, boneIndices, boneWeights,
} = {}) {
  if (!mesh || !(mesh.vertices instanceof Float32Array) ||
      !(mesh.indices instanceof Uint16Array || mesh.indices instanceof Uint32Array) ||
      !Number.isSafeInteger(mesh.vertexCount) || mesh.vertexCount < 3 ||
      mesh.vertices.length !== mesh.vertexCount * 8 ||
      mesh.indexCount !== mesh.indices.length || mesh.strideBytes !== 32) {
    throw new TypeError('Skinning requires a canonical SH-12 indexed mesh');
  }
  if (!Array.isArray(boneIds) || boneIds.length < 1 || boneIds.length > MAX_BONES ||
      boneIds.some(id => typeof id !== 'string' || !id.length) ||
      new Set(boneIds).size !== boneIds.length ||
      !Array.isArray(inverseBindMatrices) || inverseBindMatrices.length !== boneIds.length) {
    throw new TypeError('Bone IDs and inverse bind matrices require identical ordered counts');
  }
  const expected = mesh.vertexCount * INFLUENCES_PER_VERTEX;
  numericBuffer(boneIndices, expected, 'boneIndices');
  numericBuffer(boneWeights, expected, 'boneWeights');
  const checkedIndices = new Uint16Array(expected);
  const checkedWeights = new Float32Array(expected);
  for (let vertex = 0; vertex < mesh.vertexCount; vertex++) {
    let sum = 0;
    for (let slot = 0; slot < INFLUENCES_PER_VERTEX; slot++) {
      const i = vertex * INFLUENCES_PER_VERTEX + slot;
      const index = boneIndices[i], weight = boneWeights[i];
      if (!Number.isSafeInteger(index) || index < 0 || index >= boneIds.length ||
          typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0 || weight > 1) {
        throw new RangeError('Invalid skin bone index/weight at vertex ' + vertex);
      }
      checkedIndices[i] = index;
      checkedWeights[i] = weight;
      sum += weight;
    }
    if (Math.abs(sum - 1) > 1e-5) {
      throw new RangeError('Skin influences must total 1 at vertex ' + vertex);
    }
  }
  // A copied, verified packet is necessary so the pose solver cannot pick up
  // a later reordered bone table. This is not a source authenticity check.
  const checkedInverseBinds = inverseBindMatrices.map((m, i) =>
    checkedMatrix(m, 'inverseBindMatrices[' + i + ']'));
  return {
    mesh, boneIds: [...boneIds], inverseBindMatrices: checkedInverseBinds,
    boneIndices: checkedIndices, boneWeights: checkedWeights,
    influenceSlots: INFLUENCES_PER_VERTEX,
    nativeSkinVerified: false, nativePoseVerified: false,
    provenance: 'caller-supplied-source-neutral-binding',
  };
}

/**
 * Pure CPU deform of a source-neutral indexed mesh.
 *
 * poseByBoneId is a Map or own-key object containing caller-supplied
 * HIERARCHY-GLOBAL bone transforms expressed in mesh-local/root space. It
 * does not accept sampled local transforms or model-to-world matrices: callers
 * compose parentGlobal * local first, then apply root model-to-world once
 * after skinning. SH-06 owns animation sampling and hierarchy composition;
 * SH-03 owns collision/hit policy.
 *
 * Palette_i = globalPoseMeshLocal_i * inverseBindMeshLocal_i.
 * The returned SH-12 mesh can be uploaded/drawn with the existing indexed
 * render pipeline (a later dynamic GPU-buffer update is an integration choice).
 */
export function skinIndexedCharacter(binding, poseByBoneId) {
  if (!binding || !Array.isArray(binding.boneIds) || !binding.mesh) {
    throw new TypeError('Expected createIndexedSkinBinding result');
  }
  if (!(poseByBoneId instanceof Map) &&
      (!poseByBoneId || typeof poseByBoneId !== 'object' || Array.isArray(poseByBoneId))) {
    throw new TypeError('Pose must be boneId -> Web mesh-local matrix mapping');
  }
  const lookup = (id) => poseByBoneId instanceof Map
    ? poseByBoneId.get(id)
    : Object.hasOwn(poseByBoneId, id) ? poseByBoneId[id] : undefined;
  const palette = binding.boneIds.map((id, i) => {
    const matrix = lookup(id);
    if (!matrix) throw new Error('Missing hierarchy-global mesh-local pose for bone: ' + id);
    const posedBone = checkedMatrix(matrix, 'pose bone ' + id);
    return multiplyMatrices(posedBone, binding.inverseBindMatrices[i]);
  });
  const source = binding.mesh;
  const positions = new Float32Array(source.vertexCount * 3);
  const normals = new Float32Array(source.vertexCount * 3);
  const uvs = new Float32Array(source.vertexCount * 2);
  for (let v = 0; v < source.vertexCount; v++) {
    const a = v * 8, b = v * 3;
    const x = source.vertices[a], y = source.vertices[a + 1], z = source.vertices[a + 2];
    const nx = source.vertices[a + 3], ny = source.vertices[a + 4], nz = source.vertices[a + 5];
    let px = 0, py = 0, pz = 0;
    let m0 = 0, m1 = 0, m2 = 0, m4 = 0, m5 = 0, m6 = 0, m8 = 0, m9 = 0, m10 = 0;
    for (let slot = 0; slot < INFLUENCES_PER_VERTEX; slot++) {
      const at = v * INFLUENCES_PER_VERTEX + slot;
      const weight = binding.boneWeights[at];
      if (weight === 0) continue;
      const m = palette[binding.boneIndices[at]];
      px += weight * (m[0] * x + m[4] * y + m[8] * z + m[12]);
      py += weight * (m[1] * x + m[5] * y + m[9] * z + m[13]);
      pz += weight * (m[2] * x + m[6] * y + m[10] * z + m[14]);
      m0 += weight*m[0]; m1 += weight*m[1]; m2 += weight*m[2];
      m4 += weight*m[4]; m5 += weight*m[5]; m6 += weight*m[6];
      m8 += weight*m[8]; m9 += weight*m[9]; m10 += weight*m[10];
    }
    // The position deformation at this vertex is the weighted matrix. Its
    // inverse-transpose—not a weighted sum of per-bone normal matrices—is the
    // corresponding normal transform under nonuniform scale.
    const c0x = m5*m10 - m6*m9, c0y = m6*m8 - m4*m10, c0z = m4*m9 - m5*m8;
    const c1x = m9*m2 - m10*m1, c1y = m10*m0 - m8*m2, c1z = m8*m1 - m9*m0;
    const c2x = m1*m6 - m2*m5, c2y = m2*m4 - m0*m6, c2z = m0*m5 - m1*m4;
    const determinant = m0*c0x + m1*c0y + m2*c0z;
    if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-30 ||
        !Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz)) {
      throw new RangeError('Degenerate or overflowing deformed vertex ' + v);
    }
    const nnx = (c0x*nx + c1x*ny + c2x*nz) / determinant;
    const nny = (c0y*nx + c1y*ny + c2y*nz) / determinant;
    const nnz = (c0z*nx + c1z*ny + c2z*nz) / determinant;
    const normalLength = Math.hypot(nnx, nny, nnz);
    if (!Number.isFinite(normalLength) || normalLength < 1e-12) {
      throw new RangeError('Degenerate or overflowing deformed vertex ' + v);
    }
    positions[b] = px; positions[b + 1] = py; positions[b + 2] = pz;
    normals[b] = nnx / normalLength;
    normals[b + 1] = nny / normalLength;
    normals[b + 2] = nnz / normalLength;
    uvs[v * 2] = source.vertices[a + 6];
    uvs[v * 2 + 1] = source.vertices[a + 7];
  }
  const mesh = defineIndexedMesh({ positions, normals, uvs, indices: source.indices });
  return {
    mesh, deformedBounds: mesh.bounds,
    geometryProvenance: 'caller-supplied-skinning-inputs-not-native-qualified',
    skinned: true,
    nativeBoneWeightsVerified: false,
    nativePoseVerified: false,
    runtimeEnemyInstanceVerified: false,
  };
}
