/**
 * Source-neutral scene graph; matrix math uses column-major 4x4 arrays.
 * Unity reference identities are (owner, path_id), never names or path_id alone.
 * No Unity data, game geometry or proprietary materials are embedded here.
 */
const EPSILON = 1e-12;
const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const point = (x = 0, y = 0, z = 0) => ({ x, y, z });

function finiteVector(value, keys, label, defaults) {
  const v = value ?? defaults;
  if (!v || keys.some((key) => typeof v[key] !== 'number' || !Number.isFinite(v[key]))) {
    throw new TypeError(label + ' requires finite ' + keys.join(', ') + ' components');
  }
  return v;
}

export function unityObjectKey(owner, pathId) {
  if (typeof owner !== 'string' || !owner.length) throw new TypeError('Unity owner must be a nonempty string');
  if (typeof pathId === 'number' && !Number.isSafeInteger(pathId)) {
    throw new TypeError('Unsafe Unity path_id: supply the exact decimal string');
  }
  if (!['string', 'number', 'bigint'].includes(typeof pathId)) {
    throw new TypeError('Unity path_id must be an integer');
  }
  const id = String(pathId);
  if (!/^-?\d+$/.test(id)) throw new TypeError('Unity path_id must be an integer');
  // The same serialized integer may arrive as a number, bigint or decimal
  // string. Canonicalize textually to keep 64-bit+ IDs exact across runtimes.
  const negative = id[0] === '-';
  const digits = (negative ? id.slice(1) : id).replace(/^0+/, '') || '0';
  return JSON.stringify([owner, negative && digits !== '0' ? '-' + digits : digits]);
}

export function multiplyMatrices(a, b) {
  if (a.length !== 16 || b.length !== 16) throw new TypeError('Expected 4x4 matrices');
  const output = Array(16).fill(0);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 4; k++) output[col * 4 + row] += a[k * 4 + row] * b[col * 4 + k];
    }
  }
  return output;
}

export function composeLocalMatrix(transform = {}) {
  const p = finiteVector(transform.position, ['x', 'y', 'z'], 'position', point());
  const s = finiteVector(transform.scale, ['x', 'y', 'z'], 'scale', point(1, 1, 1));
  const q = finiteVector(transform.rotation, ['x', 'y', 'z', 'w'], 'rotation', { x: 0, y: 0, z: 0, w: 1 });
  const length = Math.hypot(q.x, q.y, q.z, q.w);
  if (length < EPSILON) throw new TypeError('Rotation quaternion cannot be zero');
  const [x, y, z, w] = [q.x / length, q.y / length, q.z / length, q.w / length];
  const xx = x*x, yy = y*y, zz = z*z, xy = x*y, xz = x*z, yz = y*z;
  const wx = w*x, wy = w*y, wz = w*z;
  return [
    (1-2*(yy+zz))*s.x, 2*(xy+wz)*s.x, 2*(xz-wy)*s.x, 0,
    2*(xy-wz)*s.y, (1-2*(xx+zz))*s.y, 2*(yz+wx)*s.y, 0,
    2*(xz+wy)*s.z, 2*(yz-wx)*s.z, (1-2*(xx+yy))*s.z, 0,
    p.x, p.y, p.z, 1,
  ];
}

/** Reflect Z on both sides: M_web = diag(1,1,-1,1) M_source diag(1,1,-1,1). */
export function mirrorZ(matrix) {
  if (matrix.length !== 16) throw new TypeError('Expected 4x4 matrix');
  return matrix.map((value, i) => value * (i % 4 === 2 ? -1 : 1) * (Math.floor(i / 4) === 2 ? -1 : 1));
}

/** Bounding box of a transformed generated box, including rotation, shear and negative scales. */
export function boxBounds(matrix, size) {
  const dimensions = finiteVector(size, ['x', 'y', 'z'], 'box size');
  if ([dimensions.x, dimensions.y, dimensions.z].some((v) => v < 0)) throw new RangeError('Box size must be nonnegative');
  const half = [dimensions.x / 2, dimensions.y / 2, dimensions.z / 2];
  const center = point(matrix[12], matrix[13], matrix[14]);
  const h = [0, 1, 2].map((row) => half.reduce((sum, extent, axis) => sum + Math.abs(matrix[axis * 4 + row]) * extent, 0));
  return { center, halfExtents: point(...h), radius: Math.hypot(...h) };
}

/**
 * Normalized nodes: {id, parentId?, transform?, primitive?:{kind:'box',size}, material?}.
 * Input order is irrelevant to parent resolution. No original Unity objects are shipped.
 */
export function buildSceneGraph(nodes, { coordinates = 'web' } = {}) {
  if (!Array.isArray(nodes) || nodes.length > 100_000) throw new TypeError('Expected at most 100000 scene nodes');
  if (!['web', 'unity'].includes(coordinates)) throw new TypeError('Invalid coordinate system');
  const byId = new Map();
  for (const node of nodes) {
    if (!node || typeof node.id !== 'string' || !node.id.length || byId.has(node.id)) {
      throw new TypeError('Scene nodes need distinct nonempty string IDs');
    }
    byId.set(node.id, node);
  }
  const resolved = new Map(), visiting = new Set();
  function visit(id, depth = 0) {
    if (resolved.has(id)) return resolved.get(id);
    if (!byId.has(id)) throw new Error('Missing scene parent: ' + id);
    if (visiting.has(id)) throw new Error('Cycle in scene hierarchy at ' + id);
    if (depth > 2048) throw new Error('Scene hierarchy exceeds supported depth');
    visiting.add(id);
    try {
      const node = byId.get(id);
      const parent = node.parentId == null ? null : visit(node.parentId, depth + 1);
      const sourceMatrix = multiplyMatrices(parent?.sourceMatrix ?? identity(), composeLocalMatrix(node.transform));
      const worldMatrix = coordinates === 'unity' ? mirrorZ(sourceMatrix) : sourceMatrix;
      let bounds = null;
      if (node.primitive != null) {
        if (node.primitive.kind !== 'box') throw new TypeError('Unsupported generated primitive at ' + id);
        bounds = boxBounds(worldMatrix, node.primitive.size);
      }
      const result = {
        id, parentId: node.parentId ?? null, sourceMatrix, worldMatrix, bounds,
        primitive: node.primitive ?? null, material: node.material ?? 'chalk',
        visible: node.visible !== false && (parent?.visible ?? true),
      };
      resolved.set(id, result);
      return result;
    } finally { visiting.delete(id); }
  }
  return nodes.map(({ id }) => visit(id));
}
