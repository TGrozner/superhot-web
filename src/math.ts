/** Typed source of src/math.js. Keep the generated JavaScript in sync with npm run build:typed. */
export type Vec3 = Readonly<{ x: number; y: number; z: number }>;
export type WalkSolid = Readonly<{ x: number; z: number; w: number; d: number }>;

export const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const length3 = (v: Vec3): number => Math.hypot(v.x, v.y, v.z);
export const normalize3 = (v: Vec3): Vec3 => {
  const length = length3(v) || 1;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
};
export const add3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const subtract3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const multiply3 = (v: Vec3, value: number): Vec3 => ({ x: v.x * value, y: v.y * value, z: v.z * value });
export const distance3 = (a: Vec3, b: Vec3): number => length3(subtract3(a, b));
export const dot3 = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

/** Camera faces -Z in a Y-up coordinate system. */
export const cameraAxes = (yaw: number, pitch: number): { forward: Vec3; right: Vec3; up: Vec3 } => {
  const sy = Math.sin(yaw), cy = Math.cos(yaw);
  const sp = Math.sin(pitch), cp = Math.cos(pitch);
  return {
    forward: { x: sy * cp, y: sp, z: -cy * cp },
    right: { x: cy, y: 0, z: sy },
    up: { x: -sy * sp, y: cp, z: cy * sp },
  };
};

/** First hit fraction along a segment, or null. */
export const segmentSphere = (start: Vec3, end: Vec3, center: Vec3, radius: number): number | null => {
  const delta = subtract3(end, start);
  const offset = subtract3(start, center);
  const a = dot3(delta, delta);
  if (a < 1e-10) return dot3(offset, offset) <= radius * radius ? 0 : null;
  const b = 2 * dot3(offset, delta);
  const c = dot3(offset, offset) - radius * radius;
  if (c <= 0) return 0;
  const determinant = b * b - 4 * a * c;
  if (determinant < 0) return null;
  const t = (-b - Math.sqrt(determinant)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
};

export const segmentAabb = (start: Vec3, end: Vec3, min: Vec3, max: Vec3): number | null => {
  let enter = 0, leave = 1;
  const axes: readonly (keyof Vec3)[] = ['x', 'y', 'z'];
  for (const axis of axes) {
    const delta = end[axis] - start[axis];
    if (Math.abs(delta) < 1e-8) {
      if (start[axis] < min[axis] || start[axis] > max[axis]) return null;
      continue;
    }
    let t1 = (min[axis] - start[axis]) / delta;
    let t2 = (max[axis] - start[axis]) / delta;
    if (t1 > t2) [t1, t2] = [t2, t1];
    enter = Math.max(enter, t1);
    leave = Math.min(leave, t2);
    if (enter > leave) return null;
  }
  return enter;
};

export const resolveWalk = (position: Vec3, radius: number, solids: readonly WalkSolid[]): Vec3 => {
  const next = { ...position };
  for (const solid of solids) {
    const halfX = solid.w / 2 + radius;
    const halfZ = solid.d / 2 + radius;
    const dx = next.x - solid.x;
    const dz = next.z - solid.z;
    if (Math.abs(dx) >= halfX || Math.abs(dz) >= halfZ) continue;
    const penetrationX = halfX - Math.abs(dx);
    const penetrationZ = halfZ - Math.abs(dz);
    if (penetrationX < penetrationZ) next.x += (dx >= 0 ? 1 : -1) * penetrationX;
    else next.z += (dz >= 0 ? 1 : -1) * penetrationZ;
  }
  return next;
};
