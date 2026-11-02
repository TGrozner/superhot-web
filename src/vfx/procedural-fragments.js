/**
 * Procedural, seeded fragment particles. No commercial meshes, authored
 * fracture graphs, or native SUPERHOT: MIND CONTROL DELETE rules are copied.
 */
const checkFinite = (value, label) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite`);
  }
};
const AXES = ['x', 'y', 'z'];
const snapshotVector = (vector, label) => {
  if (!vector || typeof vector !== 'object') throw new TypeError(`${label} must be a vector`);
  // Validate the very same finite coordinates used for the calculation.
  // Caller-authored getters must not alter a burst or a frame mid-step.
  const snapshot = {};
  for (const axis of AXES) {
    const component = vector[axis];
    checkFinite(component, `${label}.${axis}`);
    snapshot[axis] = component;
  }
  return snapshot;
};

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    // Mulberry32: deterministic across browser and Node JS number semantics.
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Emit a reproducible spherical burst from caller-selected parameters.
 * Speeds and lifetimes are NOT inferred from the native game.
 */
export function createProceduralBurst({
  origin, seed, count, minSpeed, maxSpeed, minLifetime, maxLifetime,
}) {
  const originSnapshot = snapshotVector(origin, 'origin');
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xFFFFFFFF) {
    throw new RangeError('seed must be an unsigned 32-bit integer');
  }
  if (!Number.isInteger(count) || count < 0 || count > 4096) {
    throw new RangeError('count must be an integer from 0 to 4096');
  }
  for (const [label, value] of [
    ['minSpeed', minSpeed], ['maxSpeed', maxSpeed],
    ['minLifetime', minLifetime], ['maxLifetime', maxLifetime],
  ]) checkFinite(value, label);
  if (minSpeed < 0 || maxSpeed < minSpeed) throw new RangeError('invalid speed range');
  if (minLifetime <= 0 || maxLifetime < minLifetime) {
    throw new RangeError('invalid lifetime range');
  }
  const random = seededRandom(seed);
  const fragments = [];
  for (let id = 0; id < count; id++) {
    const y = random() * 2 - 1;
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const speed = minSpeed + random() * (maxSpeed - minSpeed);
    const lifetime = minLifetime + random() * (maxLifetime - minLifetime);
    fragments.push({
      id,
      position: { ...originSnapshot },
      velocity: {
        x: Math.cos(angle) * radius * speed,
        y: y * speed,
        z: Math.sin(angle) * radius * speed,
      },
      age: 0,
      lifetime,
    });
  }
  return fragments;
}

/**
 * Advance one particle analytically for constant acceleration, without
 * introducing frame-rate-dependent Euler integration drift.
 */
export function advanceFragment(fragment, dt, acceleration = { x: 0, y: 0, z: 0 }) {
  if (!fragment || typeof fragment !== 'object') throw new TypeError('fragment must be an object');
  const { position: sourcePosition, velocity: sourceVelocity, age, lifetime } = fragment;
  const positionSnapshot = snapshotVector(sourcePosition, 'fragment.position');
  const velocitySnapshot = snapshotVector(sourceVelocity, 'fragment.velocity');
  const accelerationSnapshot = snapshotVector(acceleration, 'acceleration');
  checkFinite(age, 'fragment.age');
  checkFinite(lifetime, 'fragment.lifetime');
  checkFinite(dt, 'dt');
  if (dt < 0) throw new RangeError('dt must be non-negative');
  if (lifetime <= 0 || age < 0 || age > lifetime) {
    throw new RangeError('fragment age or lifetime invalid');
  }
  const remaining = lifetime - age;
  const step = Math.min(dt, remaining);
  const position = {}, velocity = {};
  for (const axis of AXES) {
    position[axis] = positionSnapshot[axis] + velocitySnapshot[axis] * step +
      // Halve time before multiplying: a * dt * dt can overflow even when
      // the quadratic displacement and final velocity are representable.
      accelerationSnapshot[axis] * (step / 2) * step;
    velocity[axis] = velocitySnapshot[axis] + accelerationSnapshot[axis] * step;
    if (!Number.isFinite(position[axis]) || !Number.isFinite(velocity[axis])) {
      throw new RangeError('particle integration overflow');
    }
  }
  const nextAge = Math.min(lifetime, age + step);
  return { ...fragment, position, velocity, age: nextAge, lifetime, alive: nextAge < lifetime };
}

/** Retain only particles still alive after the step. Input stays unchanged. */
export function advanceFragments(fragments, dt, acceleration = { x: 0, y: 0, z: 0 }) {
  if (!Array.isArray(fragments)) throw new TypeError('fragments must be an array');
  // A zero-particle frame must reject malformed inputs just like a populated
  // frame. Otherwise validity unexpectedly depends on burst size.
  checkFinite(dt, 'dt');
  if (dt < 0) throw new RangeError('dt must be non-negative');
  const accelerationSnapshot = snapshotVector(acceleration, 'acceleration');
  return fragments.map((item) => advanceFragment(item, dt, accelerationSnapshot))
    .filter((item) => item.alive);
}
