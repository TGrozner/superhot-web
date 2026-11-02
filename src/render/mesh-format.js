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


/**
 * Decode an EXPLICIT, source-neutral, already-authorized binary mesh layout.
 *
 * Not a Unity asset-file decoder: the scene owner must resolve/verify any
 * native stream, compression, coordinates, channel declarations and provenance
 * privately. Reject unknown formats, missing payloads and compressed data.
 * No source bytes are bundled in this module.
 */
const SOURCE_COMPONENT_BYTES = Object.freeze({
  float32: 4, float16: 2, snorm8: 1, unorm8: 1, snorm16: 2, unorm16: 2,
});

function requireSourceInteger(value, label, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(label + ' must be an integer in ' + min + '..' + max);
  }
  return value;
}

function binarySourceBytes(value, label) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new TypeError(label + ' must be Uint8Array, Buffer or ArrayBuffer, not inferred JSON/hex/base64');
}

function halfSourceFloat(raw) {
  const sign = raw & 0x8000 ? -1 : 1;
  const exponent = (raw >>> 10) & 31, fraction = raw & 1023;
  if (exponent === 31) return fraction ? NaN : sign * Infinity;
  if (exponent === 0) return sign * 2 ** -14 * fraction / 1024;
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}

function readSourceComponent(view, byteOffset, format) {
  switch (format) {
    case 'float32': return view.getFloat32(byteOffset, true);
    case 'float16': return halfSourceFloat(view.getUint16(byteOffset, true));
    case 'snorm8': return Math.max(-1, view.getInt8(byteOffset) / 127);
    case 'unorm8': return view.getUint8(byteOffset) / 255;
    case 'snorm16': return Math.max(-1, view.getInt16(byteOffset, true) / 32767);
    case 'unorm16': return view.getUint16(byteOffset, true) / 65535;
    default: throw new TypeError('Unsupported source component format: ' + String(format));
  }
}

/**
 * Strict source-neutral boundary between a PRIVATE verified native extractor and
 * public WebGL2 uploadIndexedMesh(). All geometry bytes supplied by caller.
 *
 * Payload:
 * {
 *   coordinateSpace: 'web-rh', byteOrder: 'little', compression: 'none', sourceWinding: 'ccw'|'cw',
 *   vertexCount, streams: [{ bytes: Uint8Array, strideBytes, byteOffset? }],
 *   attributes: {
 *     position: { stream, offsetBytes, format },
 *     normal:   { stream, offsetBytes, format },
 *     uv0:      { stream, offsetBytes, format }
 *   },
 *   indexBufferBytes: Uint8Array, indexFormat: 'uint16'|'uint32',
 *   submeshes: [{ firstByte, indexCount, baseVertex, materialSlot,
 *                 topology: 'triangles', firstVertex?, vertexCount? }],
 *   worldMatrix?: column-major WEB affine 4x4
 * }
 *
 * Native Unity m_CompressedMesh / m_StreamData path alone cannot be supplied:
 * streams must contain *decoded bytes*, obtained by an authorized converter.
 * Source->Web axis/handedness conversion occurs BEFORE this function.
 */
export function decodeIndexedMeshPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError('Expected explicit decoded mesh payload object');
  }
  if (payload.compression !== 'none') {
    throw new Error('Compressed/unknown source mesh: first prove and decode a real vertex stream');
  }
  if (payload.coordinateSpace !== 'web-rh') {
    throw new Error('Coordinate conversion not proved: payload must be web-rh');
  }
  if (payload.byteOrder !== 'little') {
    throw new Error('Source byte order must be explicit little-endian');
  }
  if (payload.sourceWinding !== 'ccw' && payload.sourceWinding !== 'cw') {
    throw new Error('Source triangle winding must be explicitly ccw or cw after conversion');
  }
  const vertexCount = requireSourceInteger(payload.vertexCount, 'vertexCount', 3, MAX_VERTICES);
  if (!Array.isArray(payload.streams) || !payload.streams.length || payload.streams.length > 16) {
    throw new TypeError('Explicit vertex streams are required (at most 16)');
  }
  const streams = payload.streams.map((source, index) => {
    if (!source || typeof source !== 'object') throw new TypeError('Invalid stream ' + index);
    const bytes = binarySourceBytes(source.bytes, 'streams[' + index + '].bytes');
    const strideBytes = requireSourceInteger(source.strideBytes, 'strideBytes', 1, 4096);
    const byteOffset = requireSourceInteger(source.byteOffset ?? 0, 'stream byteOffset');
    if (byteOffset + vertexCount * strideBytes > bytes.byteLength || bytes.byteLength > 128 * 1024 * 1024) {
      throw new RangeError('Vertex stream is truncated or oversized: stream ' + index);
    }
    return { view: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), strideBytes, byteOffset };
  });
  const attributes = payload.attributes;
  if (!attributes || typeof attributes !== 'object') {
    throw new TypeError('Explicit source channel layout is required');
  }
  function channel(name, components) {
    const spec = attributes[name];
    if (!spec || typeof spec !== 'object') throw new TypeError('Missing source channel: ' + name);
    const streamIndex = requireSourceInteger(spec.stream, name + '.stream', 0, streams.length - 1);
    const stream = streams[streamIndex];
    const offsetBytes = requireSourceInteger(spec.offsetBytes, name + '.offsetBytes');
    const componentWidth = SOURCE_COMPONENT_BYTES[spec.format];
    if (!componentWidth) throw new TypeError('Unsupported ' + name + ' source format: ' + String(spec.format));
    if (offsetBytes + components * componentWidth > stream.strideBytes) {
      throw new RangeError(name + ' exceeds its declared vertex stride');
    }
    const values = new Float32Array(vertexCount * components);
    for (let v = 0; v < vertexCount; v++) {
      for (let c = 0; c < components; c++) {
        const at = stream.byteOffset + v * stream.strideBytes + offsetBytes + c * componentWidth;
        const value = readSourceComponent(stream.view, at, spec.format);
        if (!Number.isFinite(value) || Math.abs(value) > FLOAT_MAX) {
          throw new RangeError(name + ' contains a non-finite/unrepresentable vertex component');
        }
        values[v * components + c] = value;
      }
    }
    return values;
  }
  const positions = channel('position', 3);
  const normals = channel('normal', 3);
  const uvs = channel('uv0', 2);

  const indexBytes = binarySourceBytes(payload.indexBufferBytes, 'indexBufferBytes');
  if (payload.indexFormat !== 'uint16' && payload.indexFormat !== 'uint32') {
    throw new TypeError('indexFormat must be explicit uint16 or uint32');
  }
  const indexWidth = payload.indexFormat === 'uint32' ? 4 : 2;
  if (indexBytes.byteLength > 24 * 1024 * 1024 || indexBytes.byteLength % indexWidth !== 0) {
    throw new RangeError('Invalid index buffer byte length/alignment');
  }
  const indexView = new DataView(indexBytes.buffer, indexBytes.byteOffset, indexBytes.byteLength);
  if (!Array.isArray(payload.submeshes) || !payload.submeshes.length || payload.submeshes.length > 1024) {
    throw new TypeError('At least one explicit triangle submesh is required');
  }
  const indices = [], drawRanges = [];
  for (let slot = 0; slot < payload.submeshes.length; slot++) {
    const sub = payload.submeshes[slot];
    if (!sub || sub.topology !== 'triangles') {
      throw new Error('Non-triangle/unknown submesh topology is unsupported');
    }
    const firstByte = requireSourceInteger(sub.firstByte, 'submesh firstByte');
    const indexCount = requireSourceInteger(sub.indexCount, 'submesh indexCount', 3, 6_000_000);
    const baseVertex = requireSourceInteger(sub.baseVertex, 'submesh baseVertex', -MAX_VERTICES, MAX_VERTICES);
    const materialSlot = requireSourceInteger(sub.materialSlot, 'submesh materialSlot', 0, 1023);
    if (firstByte % indexWidth !== 0 || indexCount % 3 !== 0 ||
        firstByte + indexCount * indexWidth > indexBytes.byteLength ||
        indices.length + indexCount > 6_000_000) {
      throw new RangeError('Submesh index range, topology or alignment is invalid');
    }
    const hasVertexRange = sub.firstVertex !== undefined || sub.vertexCount !== undefined;
    let firstVertex = 0, lastVertex = vertexCount;
    if (hasVertexRange) {
      firstVertex = requireSourceInteger(sub.firstVertex, 'submesh firstVertex', 0, vertexCount);
      const sourceVertexCount = requireSourceInteger(sub.vertexCount, 'submesh vertexCount', 1, vertexCount);
      lastVertex = firstVertex + sourceVertexCount;
      if (lastVertex > vertexCount) throw new RangeError('Submesh vertex range exceeds source mesh');
    }
    const firstIndex = indices.length;
    for (let i = 0; i < indexCount; i += 3) {
      const triangle = [];
      for (let j = 0; j < 3; j++) {
        const at = firstByte + (i + j) * indexWidth;
        const rawIndex = indexWidth === 2 ? indexView.getUint16(at, true) : indexView.getUint32(at, true);
        const resolved = rawIndex + baseVertex;
        if (!Number.isSafeInteger(resolved) || resolved < firstVertex || resolved >= lastVertex) {
          throw new RangeError('Index violates source/global submesh vertex range');
        }
        triangle.push(resolved);
      }
      if (payload.sourceWinding === 'cw') [triangle[1], triangle[2]] = [triangle[2], triangle[1]];
      indices.push(...triangle);
    }
    drawRanges.push({ firstIndex, indexCount, materialSlot });
  }
  const mesh = defineIndexedMesh({ positions, normals, uvs, indices });
  return {
    mesh, drawRanges, sourceVertexCount: vertexCount,
    windingFlipped: payload.sourceWinding === 'cw',
    world: payload.worldMatrix === undefined ? null : meshModelMatrices(payload.worldMatrix),
  };
}


/**
 * Transform authorized, already-decoded Wavefront OBJ text into the existing
 * indexed WebGL2 packet. The parser neither loads source files nor guesses
 * native materials, scene instance IDs, camera state or Unity->Web transforms.
 *
 * OBJ has separate indices for position, UV and normal at each triangle corner,
 * requiring GPU vertices to split at texture/normal seams.
 */
const OBJ_NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const OBJ_REF_PATTERN = /^-?[1-9]\d*$/;

function objFloat(token, label) {
  if (!OBJ_NUMBER_PATTERN.test(token ?? '')) throw new TypeError(label + ' must be decimal');
  const n = Number(token);
  if (!Number.isFinite(n) || Math.abs(n) > FLOAT_MAX) {
    throw new RangeError(label + ' must fit finite float32');
  }
  return n;
}

function objIndex(token, count, label) {
  if (!OBJ_REF_PATTERN.test(token ?? '')) throw new TypeError(label + ' requires a nonzero OBJ index');
  const raw = Number(token);
  if (!Number.isSafeInteger(raw)) throw new RangeError(label + ' exceeds safe integer');
  const index = raw > 0 ? raw - 1 : count + raw;
  if (index < 0 || index >= count) throw new RangeError(label + ' exceeds declared OBJ attributes');
  return index;
}

function assertObjBounds(actual, expected, label) {
  if (expected === undefined) return;
  if (!expected || typeof expected !== 'object' ||
      !Array.isArray(expected.min) || !Array.isArray(expected.max) ||
      expected.min.length !== 3 || expected.max.length !== 3 ||
      typeof expected.tolerance !== 'number' || !Number.isFinite(expected.tolerance) ||
      expected.tolerance < 0 || expected.tolerance > 1) {
    throw new TypeError(label + ' needs min/max[3] and finite tolerance 0..1');
  }
  for (const axis of [0, 1, 2]) {
    for (const field of ['min', 'max']) {
      if (typeof expected[field][axis] !== 'number' ||
          !Number.isFinite(expected[field][axis]) ||
          Math.abs(actual[field][axis] - expected[field][axis]) > expected.tolerance) {
        throw new RangeError(label + ' does not match verified OBJ bounds');
      }
    }
  }
}

/**
 * Required descriptor:
 * {
 *   coordinateSpace: 'web-rh',
 *   axisSigns: [1|-1, 1|-1, 1|-1],  // independently proved OBJ->Web signs
 *   winding: 'keep'|'flip',         // explicit AFTER axisSigns
 *   groups: [{ name, materialSlot, expectedTriangles, expectedPositionRefs,
 *              expectedBounds?: { min:[x,y,z], max:[x,y,z], tolerance } }],
 *   worldMatrix?: column-major WEB affine 4x4
 * }
 *
 * No silent inference from group suffix, OBJ usemtl or filename. Source counts
 * are checked before GPU upload; quads/polygons or absent UV/normal fail.
 */
export function decodeIndexedObjPayload(objText, options) {
  if (typeof objText !== 'string' || objText.length === 0 ||
      objText.length > 32 * 1024 * 1024) {
    throw new TypeError('OBJ must be decoded text of 1..33554432 characters');
  }
  if (!options || typeof options !== 'object' || options.coordinateSpace !== 'web-rh') {
    throw new TypeError('Explicit target coordinateSpace web-rh is required');
  }
  const { axisSigns, winding, groups, worldMatrix } = options;
  if (!Array.isArray(axisSigns) || axisSigns.length !== 3 ||
      !axisSigns.every((n) => n === 1 || n === -1)) {
    throw new TypeError('Explicit axisSigns[3] (+1/-1) required, no guessed Unity conversion');
  }
  if (winding !== 'keep' && winding !== 'flip') {
    throw new TypeError('Explicit OBJ winding keep/flip required after axis mapping');
  }
  if (!Array.isArray(groups) || groups.length < 1 || groups.length > 1024) {
    throw new TypeError('Select 1..1024 verified OBJ groups');
  }
  const chosen = new Map();
  for (const spec of groups) {
    if (!spec || typeof spec.name !== 'string' || !spec.name ||
        spec.name !== spec.name.trim() || /[\r\n\t]/.test(spec.name) ||
        chosen.has(spec.name)) {
      throw new TypeError('OBJ group names must be unique exact exporter labels');
    }
    requireSourceInteger(spec.materialSlot, 'OBJ materialSlot', 0, 1023);
    requireSourceInteger(spec.expectedTriangles, 'OBJ expectedTriangles', 1, 2_000_000);
    requireSourceInteger(spec.expectedPositionRefs, 'OBJ expectedPositionRefs', 3, MAX_VERTICES);
    chosen.set(spec.name, { spec, faces: [], seen: false });
  }

  const srcPositions = [], srcNormals = [], srcUVs = [];
  let activeGroup = null;
  for (const [index, rawLine] of objText.split(/\r?\n/).entries()) {
    const line = rawLine.split('#', 1)[0].trim();
    if (!line) continue;
    const parts = line.split(/\s+/), op = parts[0];
    const label = 'OBJ line ' + (index + 1);
    if (op === 'v' || op === 'vn' || op === 'vt') {
      const components = op === 'vt' ? 2 : 3;
      if (parts.length !== components + 1 &&
          !(op === 'v' && parts.length === 5) &&
          !(op === 'vt' && parts.length === 4)) {
        throw new TypeError(label + ': invalid ' + op + ' width');
      }
      const values = parts.slice(1, components + 1).map((n, i) => objFloat(n, label + '[' + i + ']'));
      if (parts.length === components + 2) {
        const extra = objFloat(parts[components + 1], label + ' extra component');
        if ((op === 'v' && extra !== 1) || (op === 'vt' && extra !== 0)) {
          throw new Error(label + ': non-default homogeneous/UV component unsupported');
        }
      }
      const table = op === 'v' ? srcPositions : op === 'vn' ? srcNormals : srcUVs;
      if (table.length >= MAX_VERTICES) throw new RangeError('OBJ attribute table too large');
      table.push(values);
    } else if (op === 'g') {
      if (parts.length < 2) throw new Error(label + ': empty group declaration');
      // UnityPy exports a descriptive multiword label after g; treat the entire
      // exporter header as ONE exact group name, never infer a numeric suffix.
      activeGroup = parts.slice(1).join(' ');
      const selected = chosen.get(activeGroup);
      if (selected) {
        if (selected.seen) throw new Error(label + ': selected OBJ group reopened');
        selected.seen = true;
      }
    } else if (op === 'f') {
      const selected = chosen.get(activeGroup);
      if (!selected) continue;
      if (parts.length !== 4) throw new Error(label + ': only triangle faces supported');
      if (selected.faces.length >= 2_000_000) throw new RangeError('OBJ group too many triangles');
      selected.faces.push(parts.slice(1).map((corner) => {
        const fields = corner.split('/');
        if (fields.length !== 3 || fields.some((f) => !f)) {
          throw new Error(label + ': each face corner needs v/vt/vn');
        }
        return [
          objIndex(fields[0], srcPositions.length, label + ' position'),
          objIndex(fields[1], srcUVs.length, label + ' UV'),
          objIndex(fields[2], srcNormals.length, label + ' normal'),
        ];
      }));
    } else if (!['o', 's', 'usemtl', 'mtllib'].includes(op)) {
      throw new Error(label + ': unsupported OBJ record ' + op);
    }
  }

  const positions = [], normals = [], uvs = [], indices = [], drawRanges = [], groupEvidence = [];
  const corners = new Map();
  for (const { spec, faces, seen } of chosen.values()) {
    if (!seen || faces.length !== spec.expectedTriangles) {
      throw new RangeError('OBJ group ' + spec.name + ' missing or mismatched triangle count');
    }
    const firstIndex = indices.length, positionRefs = new Set();
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const face of faces) {
      for (const [pi, ti, ni] of (winding === 'flip' ? [face[0], face[2], face[1]] : face)) {
        positionRefs.add(pi);
        const key = pi + '/' + ti + '/' + ni;
        let gpuIndex = corners.get(key);
        if (gpuIndex === undefined) {
          gpuIndex = positions.length / 3;
          if (gpuIndex >= MAX_VERTICES) throw new RangeError('OBJ too many distinct GPU corner vertices');
          const p = srcPositions[pi], n = srcNormals[ni], uv = srcUVs[ti];
          for (let axis = 0; axis < 3; axis++) {
            positions.push(p[axis] * axisSigns[axis]);
            normals.push(n[axis] * axisSigns[axis]);
          }
          uvs.push(uv[0], uv[1]);
          corners.set(key, gpuIndex);
        }
        indices.push(gpuIndex);
        for (let axis = 0; axis < 3; axis++) {
          const value = srcPositions[pi][axis] * axisSigns[axis];
          min[axis] = Math.min(min[axis], value);
          max[axis] = Math.max(max[axis], value);
        }
      }
      if (indices.length > 6_000_000) throw new RangeError('OBJ index buffer too large');
    }
    if (positionRefs.size !== spec.expectedPositionRefs) {
      throw new RangeError('OBJ group ' + spec.name + ' distinct position refs differ');
    }
    assertObjBounds({ min, max }, spec.expectedBounds, 'OBJ group ' + spec.name);
    drawRanges.push({
      firstIndex, indexCount: indices.length - firstIndex,
      materialSlot: spec.materialSlot, groupName: spec.name,
    });
    groupEvidence.push({
      groupName: spec.name, triangleCount: faces.length,
      distinctPositionRefs: positionRefs.size, bounds: { min, max },
    });
  }
  return {
    mesh: defineIndexedMesh({ positions, normals, uvs, indices }),
    drawRanges, groupEvidence, windingFlipped: winding === 'flip',
    world: worldMatrix === undefined ? null : meshModelMatrices(worldMatrix),
  };
}
