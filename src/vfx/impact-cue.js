/**
 * Asset-free visual feedback for a CONFIRMED Web collision.
 * Original caller-configured renderer commands, NOT recovered MCD hit/fracture
 * timing, rig, mesh, palette or particle distribution. No native assets.
 * Compatible with the opaque renderer.shard primitive owned by SH-05.
 */
const TAU = 2 * Math.PI;

function finite(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(name + ' must be finite');
  }
}

/** Create a visual cue only on an actual game collision, not clip inventory. */
export function createImpactCue({ origin, startedAt, duration, radius, count, seed, color }) {
  if (!origin || typeof origin !== 'object') throw new TypeError('origin must be a vector');
  const position = {};
  for (const axis of ['x', 'y', 'z']) {
    const component = origin[axis];
    finite(component, 'origin.' + axis);
    position[axis] = component;
  }
  for (const [name, value] of [['startedAt', startedAt], ['duration', duration], ['radius', radius]]) {
    finite(value, name);
  }
  if (duration <= 0 || radius <= 0) throw new RangeError('duration and radius must be positive');
  if (!Number.isInteger(count) || count < 1 || count > 32) {
    throw new RangeError('count must be an integer from 1 to 32 (Web-only budget)');
  }
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError('seed must be an unsigned 32-bit integer');
  }
  if (typeof color !== 'string' || !/^#[\da-fA-F]{6}$/.test(color)) {
    throw new TypeError('color must be #RRGGBB');
  }
  return { origin: position, startedAt, duration, radius, count, seed, color };
}

/**
 * Absolute-time sample, independent of frame step; compatible with
 * renderer.shard(x,y,z,size,size,size,color). SH-05 selects clock domain,
 * timing, scale, count, seed, color and whether to integrate this prototype VFX.
 */
export function sampleImpactCue(cue, now) {
  if (!cue || typeof cue !== 'object') throw new TypeError('cue must be an object');
  finite(now, 'now');
  const { origin, startedAt, duration, radius, count, seed, color } = createImpactCue(cue);
  const elapsed = now - startedAt;
  if (!Number.isFinite(elapsed)) throw new RangeError('elapsed cue time overflows');
  if (elapsed < 0 || elapsed >= duration) return { active: false, primitives: [] };
  const phase = elapsed / duration;
  const remain = 1 - phase;
  const primitives = [
    { x: origin.x, y: origin.y, z: origin.z, size: radius * 0.35 * remain, color },
  ];
  // Invented spherical Web corona, not native fracture geometry.
  const offset = (seed / 0x100000000) * TAU;
  const travel = radius * (0.35 + 0.65 * phase);
  const size = radius * 0.15 * remain;
  for (let i = 0; i < count; i++) {
    const y = 1 - 2 * (i + 0.5) / count;
    const radial = Math.sqrt(Math.max(0, 1 - y * y));
    const angle = i * (Math.PI * (3 - Math.sqrt(5))) + offset;
    primitives.push({
      x: origin.x + Math.cos(angle) * radial * travel,
      y: origin.y + y * travel,
      z: origin.z + Math.sin(angle) * radial * travel,
      size, color,
    });
  }
  if (primitives.some(({ x, y, z, size: s }) => ![x, y, z, s].every(Number.isFinite))) {
    throw new RangeError('impact primitives overflow');
  }
  return { active: true, primitives };
}
