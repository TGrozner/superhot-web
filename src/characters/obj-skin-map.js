/**
 * SH-14 / source-neutral OBJ -> indexed skin-slot correspondence.
 *
 * SH-12's OBJ decoder creates GPU vertices by FIRST face-corner encounter,
 * not by OBJ 'v' declaration order. Original per-position bone weights MUST
 * be explicitly remapped before entering createIndexedSkinBinding().
 *
 * No source assets, Unity blob decoder, animation, generated rig or network.
 */
const MAX_SOURCE_VERTICES = 1_000_000;
const INFLUENCES = 4;

function requireArray(value, label) {
  if (!Array.isArray(value) &&
      !(ArrayBuffer.isView(value) && !(value instanceof DataView))) {
    throw new TypeError(label + ' requires numeric array or TypedArray');
  }
  return value;
}

function requireIndex(value, count, label) {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new TypeError(label + ' requires positive absolute OBJ index');
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > count) {
    throw new RangeError(label + ' references an unavailable OBJ declaration');
  }
  return number - 1;
}

function sourceVector(parts, op, line) {
  const width = op === 'vt' ? 2 : 3;
  if (parts.length !== width + 1) {
    throw new TypeError('OBJ line ' + line + ': expected ' + width + ' ' + op + ' components');
  }
  const values = parts.slice(1).map(Number);
  if (values.some(v => !Number.isFinite(v))) {
    throw new RangeError('OBJ line ' + line + ': non-finite ' + op + ' component');
  }
  return values;
}

/**
 * Build the EXACT source-OBJ-v -> SH-12 GPU-vertex permutation for one OBJ group.
 *
 * Caller supplies the already-decoded SH-12 mesh and original OBJ text (local
 * browser File only). Both are checked corner-by-corner: face indices, positions,
 * normals and UVs after the explicit axis mapping. A future SH-12 topology or
 * ordering change therefore fails instead of silently skinning wrong vertices.
 *
 * This proves the indexed OBJ-to-GPU correspondence, NOT that Unity's original
 * Mesh.m_VertexData order equals this export's OBJ 'v' declaration order.
 * That upstream native correspondence must be proven separately.
 */
export function createObjSkinVertexMap({
  objText, mesh, groupName, sourcePositionCount,
  axisSigns = [-1, 1, -1], winding = 'keep',
} = {}) {
  if (typeof objText !== 'string' || !objText.length ||
      objText.length > 32 * 1024 * 1024) {
    throw new TypeError('Local OBJ text must contain 1..33554432 characters');
  }
  if (typeof groupName !== 'string' || !groupName.length ||
      groupName.trim() !== groupName || /[\r\n\t]/.test(groupName)) {
    throw new TypeError('Exact one-group OBJ label required');
  }
  if (!Number.isSafeInteger(sourcePositionCount) ||
      sourcePositionCount < 3 || sourcePositionCount > MAX_SOURCE_VERTICES) {
    throw new RangeError('Explicit independently qualified sourcePositionCount required');
  }
  if (!Array.isArray(axisSigns) || axisSigns.length !== 3 ||
      !axisSigns.every(x => x === -1 || x === 1) ||
      !['keep', 'flip'].includes(winding)) {
    throw new TypeError('Explicit Web coordinate signs and face winding required');
  }
  if (!mesh || !(mesh.vertices instanceof Float32Array) ||
      !(mesh.indices instanceof Uint16Array || mesh.indices instanceof Uint32Array) ||
      mesh.strideBytes !== 32 || mesh.vertices.length !== mesh.vertexCount * 8 ||
      mesh.indexCount !== mesh.indices.length || !Number.isSafeInteger(mesh.vertexCount) ||
      mesh.vertexCount < 3) {
    throw new TypeError('Expected canonical SH-12 indexed triangle mesh');
  }
  const positions = [], normals = [], uvs = [], selectedFaces = [];
  let active = false, selectedSeen = false;
  for (const [lineIndex, raw] of objText.split(/\r?\n/).entries()) {
    const text = raw.split('#', 1)[0].trim();
    if (!text) continue;
    const parts = text.split(/\s+/), op = parts[0], line = lineIndex + 1;
    if (op === 'v' || op === 'vn' || op === 'vt') {
      const target = op === 'v' ? positions : op === 'vn' ? normals : uvs;
      if (target.length >= MAX_SOURCE_VERTICES) {
        throw new RangeError('OBJ attribute declaration table too large');
      }
      target.push(sourceVector(parts, op, line));
    } else if (op === 'g') {
      if (parts.length < 2) throw new TypeError('OBJ group without name');
      active = parts.slice(1).join(' ') === groupName;
      if (active) {
        if (selectedSeen) throw new Error('Selected OBJ group declared twice');
        selectedSeen = true;
      }
    } else if (op === 'f' && active) {
      if (parts.length !== 4) throw new TypeError('OBJ skin map requires triangular v/vt/vn faces');
      const face = parts.slice(1).map(corner => {
        const tokens = corner.split('/');
        if (tokens.length !== 3) {
          throw new TypeError('OBJ skin map requires explicit position/UV/normal indices');
        }
        return [
          requireIndex(tokens[0], positions.length, 'OBJ position'),
          requireIndex(tokens[1], uvs.length, 'OBJ UV'),
          requireIndex(tokens[2], normals.length, 'OBJ normal'),
        ];
      });
      selectedFaces.push(winding === 'flip' ? [face[0], face[2], face[1]] : face);
    }
  }
  if (positions.length !== sourcePositionCount) {
    throw new RangeError('OBJ position declaration count differs from source evidence');
  }
  if (!selectedSeen || !selectedFaces.length) throw new Error('Exact selected OBJ group missing or empty');
  if (selectedFaces.length * 3 !== mesh.indexCount) {
    throw new RangeError('Selected OBJ triangle count differs from supplied SH-12 mesh');
  }

  const gpuByCorner = new Map(), sourceForGpu = [];
  const references = new Set();
  let offset = 0;
  for (const face of selectedFaces) {
    for (const [pi, ti, ni] of face) {
      const key = pi + '/' + ti + '/' + ni;
      let gpu = gpuByCorner.get(key);
      if (gpu === undefined) {
        gpu = sourceForGpu.length;
        gpuByCorner.set(key, gpu);
        sourceForGpu.push(pi);
        const floats = [
          positions[pi][0] * axisSigns[0],
          positions[pi][1] * axisSigns[1],
          positions[pi][2] * axisSigns[2],
          normals[ni][0] * axisSigns[0],
          normals[ni][1] * axisSigns[1],
          normals[ni][2] * axisSigns[2],
          uvs[ti][0], uvs[ti][1],
        ];
        for (let component = 0; component < 8; component++) {
          // SH-12 stores float32. The direct f32 equality also checks correct
          // coordinate conversion, normal and UV tuple, not just position.
          if (!Object.is(mesh.vertices[gpu * 8 + component], Math.fround(floats[component])) &&
              mesh.vertices[gpu * 8 + component] !== Math.fround(floats[component])) {
            throw new Error('SH-12 GPU vertex attribute order/content mismatch at vertex ' + gpu);
          }
        }
      }
      references.add(pi);
      if (mesh.indices[offset] !== gpu) {
        throw new Error('SH-12 indexed face-corner ordering differs from original OBJ');
      }
      offset++;
    }
  }
  if (sourceForGpu.length !== mesh.vertexCount) {
    throw new RangeError('SH-12 GPU vertex cardinality differs from OBJ face-corner map');
  }
  const distinct = references.size;
  const identityGpuVertices = sourceForGpu.reduce((sum, id, i) => sum + Number(id === i), 0);
  return {
    sourceVertexForGpu: new Uint32Array(sourceForGpu),
    sourcePositionCount,
    gpuVertexCount: mesh.vertexCount,
    selectedTriangles: selectedFaces.length,
    referencedSourcePositions: distinct,
    repeatedPositionsInGpu: mesh.vertexCount - distinct,
    identityGpuVertices,
    reorderedGpuVertices: mesh.vertexCount - identityGpuVertices,
    sourceGeometryToGpuMappingVerified: true,
    nativeUnityVertexOrderVerified: false,
  };
}

/**
 * Reorder genuine per-OBJ-position influence arrays into SH-12 GPU-vertex order.
 * A given 'v' reused under multiple UV/normal tuples inherits identical
 * influences on all corresponding GPU vertices.
 *
 * Calling code must FIRST establish an independent Unity->OBJ position-order
 * proof and actual native weights; this method does not invent either.
 */
export function remapObjPositionSkinInfluences(map, sourceBoneIndices, sourceBoneWeights) {
  if (!map || !(map.sourceVertexForGpu instanceof Uint32Array) ||
      map.sourceVertexForGpu.length !== map.gpuVertexCount ||
      !Number.isSafeInteger(map.sourcePositionCount) || map.sourcePositionCount < 3) {
    throw new TypeError('Expected createObjSkinVertexMap result');
  }
  const indices = requireArray(sourceBoneIndices, 'sourceBoneIndices');
  const weights = requireArray(sourceBoneWeights, 'sourceBoneWeights');
  const expected = map.sourcePositionCount * INFLUENCES;
  if (indices.length !== expected || weights.length !== expected) {
    throw new RangeError('Source skin arrays must have four influences per OBJ v declaration');
  }
  const gpuIndices = new Uint16Array(map.gpuVertexCount * INFLUENCES);
  const gpuWeights = new Float32Array(map.gpuVertexCount * INFLUENCES);
  for (let gpu = 0; gpu < map.gpuVertexCount; gpu++) {
    const source = map.sourceVertexForGpu[gpu];
    if (source >= map.sourcePositionCount) {
      throw new RangeError('OBJ skin map references missing source position');
    }
    for (let slot = 0; slot < INFLUENCES; slot++) {
      const from = source * INFLUENCES + slot;
      const to = gpu * INFLUENCES + slot;
      const index = indices[from], weight = weights[from];
      if (!Number.isSafeInteger(index) || index < 0 || index > 65535 ||
          typeof weight !== 'number' || !Number.isFinite(weight) ||
          weight < 0 || weight > 1) {
        throw new RangeError('Invalid source influence at position ' + source);
      }
      gpuIndices[to] = index;
      gpuWeights[to] = weight;
    }
  }
  return {
    boneIndices: gpuIndices, boneWeights: gpuWeights,
    gpuVertexCount: map.gpuVertexCount,
    nativeUnityVertexOrderVerified: false,
    nativeSkinWeightsVerified: false,
  };
}
