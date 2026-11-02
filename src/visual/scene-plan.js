import { cameraAxes } from '../math.js';

/** Generated palette: semantic labels, NOT recovered Unity materials or shaders. */
export const GENERATED_PALETTE = Object.freeze({
  chalk: '#e6ecf0', porcelain: '#f6f8f9', steel: '#485761',
  glass: '#b9d9e3', red: '#d51e3b', shadow: '#202932',
});
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const finiteVec3 = (v) => v != null && ['x', 'y', 'z'].every((key) => Number.isFinite(v[key]));
// WebGL2 uniforms use float32: finite JS doubles can still become Infinity.
const finiteFloat32 = (value) => Number.isFinite(value) && Number.isFinite(Math.fround(value));
// WebGL2 shader operates on float32 uniforms: a finite uniform may still
// swallow a camera/mesh offset or collapse both generated box faces.
const AXES = ['x', 'y', 'z'];
const losesCameraOffset = (matrix, camera) => AXES.some((axis, i) =>
  matrix[12 + i] !== camera[axis] && Math.fround(matrix[12 + i]) === Math.fround(camera[axis]));
const collapsesLegacyAxis = (position, length) => {
  if (!(length > 0)) return false; // Deliberately degenerate generated box.
  const center = Math.fround(position), half = Math.fround(length / 2);
  return Math.fround(center - half) === Math.fround(center + half);
};

/** Conservative sphere/frustum test: only definitely invisible objects are culled. */
export function isBoundsVisible(bounds, camera, {
  aspect = 16 / 9, focalLength = 1.58, near = 0.045, far = 120,
} = {}) {
  if (![aspect, focalLength, near, far].every(Number.isFinite) ||
    !(aspect > 0) || !(focalLength > 0) || !(near >= 0) || !(far > near)) {
    throw new RangeError('Invalid perspective projection');
  }
  if (!finiteVec3(camera) || !Number.isFinite(camera.yaw) || !Number.isFinite(camera.pitch)) {
    throw new TypeError('Scene camera requires finite position and angles');
  }
  if (!bounds || !finiteVec3(bounds.center)) {
    throw new TypeError('Scene bounds center requires finite coordinates');
  }
  const radius = bounds.radius;
  if (!Number.isFinite(radius) || radius < 0) throw new TypeError('Invalid bounding sphere');
  const axes = cameraAxes(camera.yaw, camera.pitch);
  const delta = sub(bounds.center, camera);
  if (!finiteVec3(delta)) throw new RangeError('Scene view-space subtraction overflow');
  const z = dot(delta, axes.forward);
  if (!Number.isFinite(z)) throw new RangeError('Scene view-space projection overflow');
  if (z + radius < near || z - radius > far) return false;
  const x = dot(delta, axes.right), y = dot(delta, axes.up);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new RangeError('Scene view-space projection overflow');
  }
  const horizontal = aspect / focalLength, vertical = 1 / focalLength;
  return Math.abs(x) <= z * horizontal + radius * Math.hypot(1, horizontal) &&
    Math.abs(y) <= z * vertical + radius * Math.hypot(1, vertical);
}

/** No loss of rotations/shear: matrix packets require an affine-capable renderer. */
export function planSceneDraws(graph, camera, options = {}) {
  const packets = [];
  let culled = 0, hidden = 0;
  for (const item of graph) {
    if (!item.primitive || !item.visible) { hidden++; continue; }
    if (!isBoundsVisible(item.bounds, camera, options)) { culled++; continue; }
    const color = typeof item.material === 'string' && Object.hasOwn(GENERATED_PALETTE, item.material)
      ? GENERATED_PALETTE[item.material] : null;
    if (!color) throw new TypeError('Unknown generated material: ' + item.material);
    const m = item.worldMatrix, s = item.primitive.size;
    // The legacy renderer has no off-diagonal uniforms. Even a tiny nonzero
    // rotation/shear can produce visible displacement on a large primitive.
    // Never silently flatten a transform using an arbitrary absolute epsilon.
    const diagonal = [1, 2, 4, 6, 8, 9].every((i) => m[i] === 0);
    // The legacy vertex shader applies uScale to positions but does not transform
    // normals by its sign. Reflections (and degenerate scales) need an affine
    // renderer with a correct normal matrix; routing them to renderer.box()
    // produces incorrect lighting even though their bounds remain valid.
    const legacySafe = diagonal && [0, 5, 10].every((i) => m[i] > 0);
    const legacyBoxArgs = legacySafe
      ? [m[12], m[13], m[14], m[0]*s.x, m[5]*s.y, m[10]*s.z, color]
      : null;
    // The affine packet needs a float32 matrix and source primitive dimensions;
    // the legacy packet additionally needs float32 box uniforms. Prevent
    // implicit JS-double -> GPU-float conversion from introducing Infinity.
    const uniformNumbers = [...m, s.x, s.y, s.z, ...(legacyBoxArgs?.slice(0, 6) ?? [])];
    if (!uniformNumbers.every(finiteFloat32)) {
      throw new RangeError('Visible scene packet exceeds WebGL2 float32 uniform range');
    }
    if (!AXES.every((axis) => finiteFloat32(camera[axis]))) {
      throw new RangeError('Visible scene camera exceeds WebGL2 float32 uniform range');
    }
    if (losesCameraOffset(m, camera)) {
      throw new RangeError('Visible scene packet loses camera-relative position in WebGL2 float32');
    }
    if (legacyBoxArgs && AXES.some((_, i) => collapsesLegacyAxis(legacyBoxArgs[i], legacyBoxArgs[i + 3]))) {
      throw new RangeError('Visible generated box collapses along an axis in WebGL2 float32');
    }
    packets.push({
      id: item.id, mesh: 'box', color, matrix: m.slice(), bounds: item.bounds,
      // Legacy WebGL2 renderer accepts only translate + axis-aligned signed scales.
      // Rotated/sheared meshes MUST NOT be silently flattened to an AABB.
      legacyBoxArgs,
    });
  }
  // Group by material to reduce CPU state changes. This is not GPU instancing.
  packets.sort((a, b) => a.color.localeCompare(b.color) || a.id.localeCompare(b.id));
  return {
    packets, culled, hidden,
    affineRequired: packets.filter((p) => p.legacyBoxArgs === null).length,
    estimatedLegacyDrawCalls: packets.filter((p) => p.legacyBoxArgs !== null).length,
  };
}
