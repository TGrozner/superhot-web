import { defineIndexedMesh } from '../render/mesh-format.js';

/**
 * User-supplied OBJ parser for a single group. No network, disk paths,
 * commercial meshes, or game data are included in this module.
 *
 * UnityPy conversion produces left/right-axis-mirrored exports in the private
 * corpus. Reflecting OBJ X and Z once each gives this Web preview's axes.
 * This is a preview conversion, NOT proof of original Unity runtime render.
 */
export function parseLocalObjGroup(text, { groupIndex, expectedTriangles, expectedCenter } = {}) {
  if (typeof text !== 'string' || text.length > 32 * 1024 * 1024) {
    throw new RangeError('OBJ text must be provided and smaller than 32 MiB');
  }
  if (!Number.isSafeInteger(groupIndex) || groupIndex < 0 || groupIndex > 4096) {
    throw new RangeError('Invalid OBJ group index');
  }
  const vertices = [], normals = [], textureCoordinates = [];
  const outputPositions = [], outputNormals = [], outputUvs = [], indices = [];
  const mapped = new Map();
  let selected = false, found = false, selectedGroup = '';
  const target = '_' + groupIndex;
  const floatParts = (parts, count, label) => {
    if (parts.length < count + 1) throw new Error('Invalid OBJ ' + label);
    const values = parts.slice(1, count + 1).map(Number);
    if (values.some(v => !Number.isFinite(v))) throw new Error('Non-finite OBJ ' + label);
    return values;
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('g ')) {
      const name = line.slice(2).trim();
      selected = name.endsWith(target) && !/\S_\d+\S/.test(name.slice(name.lastIndexOf('_')));
      if (selected) { found = true; selectedGroup = name; }
      continue;
    }
    if (!/^(v |vt |vn |f )/.test(line)) continue;
    const parts = line.split(/\s+/);
    switch (parts[0]) {
      case 'v':
        vertices.push(floatParts(parts, 3, 'position'));
        break;
      case 'vt':
        textureCoordinates.push(floatParts(parts, 2, 'UV'));
        break;
      case 'vn':
        normals.push(floatParts(parts, 3, 'normal'));
        break;
      case 'f': {
        if (!selected) break;
        if (parts.length !== 4) throw new Error('Only triangular OBJ faces are supported');
        for (const key of parts.slice(1)) {
          let index = mapped.get(key);
          if (index === undefined) {
            const refs = key.split('/');
            if (refs.length !== 3 || refs.some(ref => !/^\d+$/.test(ref))) {
              throw new Error('OBJ face requires positive position/UV/normal references');
            }
            const [v, vt, vn] = refs.map(ref => Number(ref) - 1);
            const p = vertices[v], uv = textureCoordinates[vt], n = normals[vn];
            if (!p || !uv || !n) throw new RangeError('OBJ face references missing attributes');
            index = outputPositions.length / 3;
            mapped.set(key, index);
            // Two reflections: the OBJ's authored winding is preserved.
            outputPositions.push(-p[0], p[1], -p[2]);
            outputNormals.push(-n[0], n[1], -n[2]);
            outputUvs.push(uv[0], uv[1]);
          }
          indices.push(index);
        }
        break;
      }
      default: break;
    }
  }
  if (!found || !indices.length) throw new Error('Requested OBJ group not found or empty: ' + groupIndex);
  const mesh = defineIndexedMesh({
    positions: outputPositions, normals: outputNormals, uvs: outputUvs, indices,
  });
  if (expectedTriangles !== undefined && mesh.triangleCount !== expectedTriangles) {
    throw new Error('OBJ group triangle count differs from indexed Unity evidence');
  }
  if (expectedCenter !== undefined) {
    if (!Array.isArray(expectedCenter) || expectedCenter.length !== 3 ||
        expectedCenter.some((c, i) => !Number.isFinite(c) || Math.abs(mesh.bounds.center[i] - c) > 0.05)) {
      throw new Error('OBJ group bounds do not match the selected Containers instance');
    }
  }
  return { mesh, group: selectedGroup, triangles: mesh.triangleCount };
}

/**
 * Read only a locally selected File. The browser never uploads it.
 * gzip support is a standard browser DecompressionStream capability.
 */
export async function readLocalObjFile(file) {
  if (!file || typeof file.name !== 'string' || !/\.obj(?:\.gz)?$/i.test(file.name)) {
    throw new TypeError('Choose a local .obj or .obj.gz file');
  }
  if (file.size > 16 * 1024 * 1024) throw new RangeError('OBJ file exceeds 16 MiB');
  if (/\.gz$/i.test(file.name)) {
    if (typeof DecompressionStream !== 'function') {
      throw new Error('This browser cannot decompress gzip; provide a plain .obj file');
    }
    return await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).text();
  }
  return await file.text();
}
