/**
 * Procedural, seeded fragment particles. No commercial meshes, authored
 * fracture graphs, or native SUPERHOT: MIND CONTROL DELETE rules are copied.
 */
const checkFinite = (value, label) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite`);
  }
};
const checkVector = (vector, label) => {
  if (!vector || typeof vector !== 'object') throw new TypeError(`${label} must be a vector`);
  for (const axis of ['x', 'y', 'z']) checkFinite(vector[axis], `${label}.${axis}`);
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
  checkVector(origin, 'origin');
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
      position: { ...origin },
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
  checkVector(fragment.position, 'fragment.position');
  checkVector(fragment.velocity, 'fragment.velocity');
  checkVector(acceleration, 'acceleration');
  checkFinite(fragment.age, 'fragment.age');
  checkFinite(fragment.lifetime, 'fragment.lifetime');
  checkFinite(dt, 'dt');
  if (dt < 0) throw new RangeError('dt must be non-negative');
  if (fragment.lifetime <= 0 || fragment.age < 0 || fragment.age > fragment.lifetime) {
    throw new RangeError('fragment age or lifetime invalid');
  }
  const remaining = fragment.lifetime - fragment.age;
  const step = Math.min(dt, remaining);
  const position = {}, velocity = {};
  for (const axis of ['x', 'y', 'z']) {
    position[axis] = fragment.position[axis] + fragment.velocity[axis] * step +
      // Halve time before multiplying: a * dt * dt can overflow even when
      // the quadratic displacement and final velocity are representable.
      acceleration[axis] * (step / 2) * step;
    velocity[axis] = fragment.velocity[axis] + acceleration[axis] * step;
    if (!Number.isFinite(position[axis]) || !Number.isFinite(velocity[axis])) {
      throw new RangeError('particle integration overflow');
    }
  }
  const age = Math.min(fragment.lifetime, fragment.age + step);
  return { ...fragment, position, velocity, age, alive: age < fragment.lifetime };
}

/** Retain only particles still alive after the step. Input stays unchanged. */
export function advanceFragments(fragments, dt, acceleration) {
  if (!Array.isArray(fragments)) throw new TypeError('fragments must be an array');
  return fragments.map((item) => advanceFragment(item, dt, acceleration))
    .filter((item) => item.alive);
}
