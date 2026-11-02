/**
 * Original, engine-neutral indexed geometry. All positions/normals use the Web
 * scene's coordinate space; Unity->Web conversion belongs to the scene owner.
 * Vertex layout: float32 [px,py,pz, nx,ny,nz, u,v], stride 32 bytes.
 */
export const MESH_VERTEX_STRIDE = 32;
const MAX_VERTICES = 1_000_000;
const FLOAT_MAX = 3.4028234663852886e38;

function numericArray(value, label, width, requiredLength = null) {
  if (!Array.isArray(value) && !(ArrayBuffer.isView(value) && !(value instanceof DataView))) {
    throw new TypeError(`${label} must be an array or numeric TypedArray`);
  }
  if (value.length % width !== 0 || (requiredLength !== null && value.length !== requiredLength)) {
    throw new RangeError(`${label} has an invalid component count`);
  }
  const result = new Float32Array(value.length);
  for (let i = 0; i < value.length; i++) {
    const number = value[i];
    if (typeof number !== 'number' || !Number.isFinite(number) || Math.abs(number) > FLOAT_MAX) {
      throw new RangeError(`${label}[${i}] must fit finite float32`);
    }
    result[i] = number;
  }
  return result;
}

/** Convert separated attribute arrays to a checked WebGL2-ready interleaved mesh. */
export function defineIndexedMesh({ positions, normals, uvs, indices } = {}) {
  const p = numericArray(positions, 'positions', 3);
  const count = p.length / 3;
  if (count < 3 || count > MAX_VERTICES) throw new RangeError('Mesh vertex count outside 3..1000000');
  const n = numericArray(normals, 'normals', 3, p.length);
  const t = numericArray(uvs, 'uvs', 2, count * 2);
  if (!Array.isArray(indices) && !(indices instanceof Uint16Array) && !(indices instanceof Uint32Array)) {
    throw new TypeError('indices must be an array, Uint16Array or Uint32Array');
  }
  if (indices.length < 3 || indices.length % 3 !== 0 || indices.length > 6_000_000) {
    throw new RangeError('indices must contain complete triangles');
  }
  const typedIndices = count <= 65536 ? new Uint16Array(indices.length) : new Uint32Array(indices.length);
  for (let i = 0; i < indices.length; i++) {
    const value = indices[i];
    if (!Number.isSafeInteger(value) || value < 0 || value >= count) {
      throw new RangeError(`indices[${i}] is outside the vertex buffer`);
    }
    typedIndices[i] = value;
  }
  const vertices = new Float32Array(count * 8);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < count; i++) {
    for (let a = 0; a < 3; a++) {
      const value = p[3 * i + a];
      vertices[8 * i + a] = value;
      vertices[8 * i + 3 + a] = n[3 * i + a];
      min[a] = Math.min(min[a], value);
      max[a] = Math.max(max[a], value);
    }
    vertices[8 * i + 6] = t[2 * i];
    vertices[8 * i + 7] = t[2 * i + 1];
  }
  const center = min.map((v, i) => v / 2 + max[i] / 2);
  let radius = 0;
  for (let i = 0; i < count; i++) {
    radius = Math.max(radius, Math.hypot(
      vertices[8 * i] - center[0],
      vertices[8 * i + 1] - center[1],
      vertices[8 * i + 2] - center[2],
    ));
  }
  return {
    vertices, indices: typedIndices,
    vertexCount: count, indexCount: typedIndices.length, triangleCount: typedIndices.length / 3,
    bounds: { min, max, center, radius },
    strideBytes: MESH_VERTEX_STRIDE,
  };
}

/** Procedural non-box cylinder with smooth side and flat cap normals. No game assets. */
export function makeCylinderMesh({ radius = 0.5, height = 1, segments = 24 } = {}) {
  if (!Number.isFinite(radius) || radius <= 0 || !Number.isFinite(height) || height <= 0 ||
      !Number.isSafeInteger(segments) || segments < 3 || segments > 4096) {
    throw new RangeError('Cylinder requires positive radius/height and 3..4096 segments');
  }
  const positions = [], normals = [], uvs = [], indices = [];
  function vertex(x, y, z, nx, ny, nz, u, v) {
    positions.push(x, y, z);
    normals.push(nx, ny, nz);
    uvs.push(u, v);
    return positions.length / 3 - 1;
  }
  for (let i = 0; i <= segments; i++) {
    const angle = 2 * Math.PI * i / segments;
    const [x, z] = [Math.cos(angle), Math.sin(angle)];
    vertex(radius * x, -height / 2, radius * z, x, 0, z, i / segments, 0);
    vertex(radius * x, height / 2, radius * z, x, 0, z, i / segments, 1);
  }
  for (let i = 0; i < segments; i++) {
    const j = 2 * i;
    // Outward-facing CCW triangles in right-handed coordinates.
    indices.push(j, j + 1, j + 2, j + 1, j + 3, j + 2);
  }
  for (const [y, ny] of [[height / 2, 1], [-height / 2, -1]]) {
    const center = vertex(0, y, 0, 0, ny, 0, 0.5, 0.5);
    const ring = [];
    for (let i = 0; i < segments; i++) {
      const a = 2 * Math.PI * i / segments;
      const x = Math.cos(a), z = Math.sin(a);
      ring.push(vertex(radius * x, y, radius * z, 0, ny, 0, 0.5 + x * 0.5, 0.5 + z * 0.5));
    }
    for (let i = 0; i < segments; i++) {
      const a = ring[i], b = ring[(i + 1) % segments];
      if (ny > 0) indices.push(center, b, a);
      else indices.push(center, a, b);
    }
  }
  return defineIndexedMesh({ positions, normals, uvs, indices });
}

/** Strict column-major affine model and inverse-transpose normal matrices. */
export function meshModelMatrices(worldMatrix) {
  if ((!Array.isArray(worldMatrix) && !ArrayBuffer.isView(worldMatrix)) || worldMatrix.length !== 16 ||
      Array.from(worldMatrix).some((v) => typeof v !== 'number' || !Number.isFinite(v)) ||
      worldMatrix[3] !== 0 || worldMatrix[7] !== 0 || worldMatrix[11] !== 0 || worldMatrix[15] !== 1) {
    throw new TypeError('Expected finite column-major affine 4x4 world matrix');
  }
  const model = new Float32Array(worldMatrix);
  if (Array.from(model).some((v) => !Number.isFinite(v))) {
    throw new RangeError('Model matrix exceeds float32');
  }
  const a = [worldMatrix[0], worldMatrix[1], worldMatrix[2]];
  const b = [worldMatrix[4], worldMatrix[5], worldMatrix[6]];
  const c = [worldMatrix[8], worldMatrix[9], worldMatrix[10]];
  const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const n0 = cross(b, c), n1 = cross(c, a), n2 = cross(a, b);
  const det = a[0] * n0[0] + a[1] * n0[1] + a[2] * n0[2];
  if (!Number.isFinite(det) || Math.abs(det) < 1e-30) {
    throw new RangeError('Singular/unstable affine normal matrix');
  }
  const normal = new Float32Array([...n0, ...n1, ...n2].map((x) => x / det));
  if (Array.from(normal).some((v) => !Number.isFinite(v))) {
    throw new RangeError('Normal matrix exceeds float32');
  }
  return { model, normal, mirrored: det < 0 };
}
