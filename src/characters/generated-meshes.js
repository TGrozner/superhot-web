import { defineIndexedMesh } from '../render/mesh-format.js';

/**
 * Faceted, non-box source-neutral surface of revolution with elliptical rings.
 * This is original procedural Web geometry, not a decoded MCD Mesh/Avatar.
 * Normals are derived from the longitudinal profile (not borrowed from Unity).
 */
export function makeGeneratedLatheMesh(profile, { segments = 12 } = {}) {
  if (!Array.isArray(profile) || profile.length < 2 || profile.length > 32 ||
      !Number.isSafeInteger(segments) || segments < 3 || segments > 64) {
    throw new RangeError('Lathe needs 2..32 profile rings and 3..64 segments');
  }
  for (let i = 0; i < profile.length; i++) {
    const ring = profile[i];
    if (!Array.isArray(ring) || ring.length !== 3 ||
        !ring.every(Number.isFinite) || ring[1] <= 0 || ring[2] <= 0 ||
        (i && ring[0] <= profile[i - 1][0])) {
      throw new RangeError('Each profile ring must be [increasing y, positive rx, positive rz]');
    }
  }
  const positions = [], normals = [], uvs = [], indices = [];
  function vertex(x, y, z, nx, ny, nz, u, v) {
    const length = Math.hypot(nx, ny, nz);
    positions.push(x, y, z);
    normals.push(nx / length, ny / length, nz / length);
    uvs.push(u, v);
    return positions.length / 3 - 1;
  }
  const y0 = profile[0][0], span = profile.at(-1)[0] - y0;
  for (let row = 0; row < profile.length; row++) {
    const [y, rx, rz] = profile[row];
    const previous = profile[Math.max(0, row - 1)];
    const next = profile[Math.min(profile.length - 1, row + 1)];
    const slopeX = (next[1] - previous[1]) / (next[0] - previous[0]);
    const slopeZ = (next[2] - previous[2]) / (next[0] - previous[0]);
    for (let s = 0; s <= segments; s++) {
      const theta = 2 * Math.PI * s / segments;
      const c = Math.cos(theta), sn = Math.sin(theta);
      // Implicit elliptical-profile gradient, including taper slope.
      const nx = c / rx, nz = sn / rz;
      const ny = -(c * c * slopeX / rx + sn * sn * slopeZ / rz);
      vertex(rx * c, y, rz * sn, nx, ny, nz, s / segments, (y - y0) / span);
    }
  }
  const stride = segments + 1;
  for (let row = 0; row < profile.length - 1; row++) {
    for (let s = 0; s < segments; s++) {
      const a = row * stride + s, b = (row + 1) * stride + s;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  for (const [row, normalY] of [[0, -1], [profile.length - 1, 1]]) {
    const [y] = profile[row];
    const center = vertex(0, y, 0, 0, normalY, 0, .5, .5);
    // Caps have distinct normals and UVs, never reuse the side ring.
    const ring = [];
    for (let s = 0; s < segments; s++) {
      const theta = 2 * Math.PI * s / segments;
      const [c, sn] = [Math.cos(theta), Math.sin(theta)];
      ring.push(vertex(
        profile[row][1] * c, y, profile[row][2] * sn,
        0, normalY, 0, .5 + .5 * c, .5 + .5 * sn,
      ));
    }
    for (let s = 0; s < segments; s++) {
      const a = ring[s], b = ring[(s + 1) % segments];
      if (normalY > 0) indices.push(center, b, a);
      else indices.push(center, a, b);
    }
  }
  return defineIndexedMesh({ positions, normals, uvs, indices });
}

/**
 * Small reusable mesh set. All geometry is normalized around local Y=0 and
 * remains explicitly generated until a source-qualified private mesh is found.
 */
export function makeGeneratedDiagnosticEnemyMeshes() {
  return Object.freeze({
    torso: makeGeneratedLatheMesh([
      [-.5, .31, .28], [-.23, .42, .32],
      [.20, .49, .31], [.5, .29, .25],
    ]),
    head: makeGeneratedLatheMesh([
      [-.5, .18, .20], [-.27, .34, .32],
      [.10, .43, .36], [.36, .34, .31], [.5, .19, .20],
    ]),
    limb: makeGeneratedLatheMesh([
      [-.5, .19, .18], [-.29, .17, .17],
      [.24, .16, .16], [.5, .13, .13],
    ], { segments: 10 }),
  });
}
