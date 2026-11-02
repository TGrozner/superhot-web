import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createProceduralBurst, advanceFragment, advanceFragments,
} from '../src/vfx/procedural-fragments.js';

const config = Object.freeze({
  origin: Object.freeze({ x: 2, y: 3, z: -4 }), seed: 42, count: 16,
  minSpeed: 0.5, maxSpeed: 3, minLifetime: 0.3, maxLifetime: 1.5,
});
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('burst is seeded, platform deterministic and does not mutate origin', () => {
  const first = createProceduralBurst(config);
  const again = createProceduralBurst(config);
  assert.deepEqual(first, again);
  assert.notDeepEqual(first, createProceduralBurst({ ...config, seed: 43 }));
  assert.equal(first.length, 16);
  assert.deepEqual(first.map((p) => p.id), Array.from({ length: 16 }, (_, i) => i));
  for (const fragment of first) {
    assert.deepEqual(fragment.position, config.origin);
    const speed = Math.hypot(...Object.values(fragment.velocity));
    assert.ok(speed >= config.minSpeed - 1e-12 && speed <= config.maxSpeed + 1e-12);
    assert.ok(fragment.lifetime >= config.minLifetime && fragment.lifetime <= config.maxLifetime);
  }
  assert.deepEqual(config.origin, { x: 2, y: 3, z: -4 });
  assert.deepEqual(createProceduralBurst({ ...config, count: 0 }), []);
});

test('analytic integration remains stable across frame subdivisions', () => {
  const fragment = {
    id: 5, position: { x: 1, y: 2, z: 3 }, velocity: { x: 2, y: 4, z: -1 },
    age: 0, lifetime: 5,
  };
  const gravity = { x: 0, y: -10, z: 0 };
  const whole = advanceFragment(fragment, 1, gravity);
  const halves = advanceFragment(advanceFragment(fragment, 0.5, gravity), 0.5, gravity);
  for (const axis of ['x', 'y', 'z']) {
    near(whole.position[axis], halves.position[axis]);
    near(whole.velocity[axis], halves.velocity[axis]);
  }
  near(whole.age, halves.age);
  assert.equal(whole.alive, true);
  assert.equal(fragment.age, 0);
  assert.deepEqual(fragment.position, { x: 1, y: 2, z: 3 });
});

test('particle stops exactly at lifetime and is removed by collection step', () => {
  const particle = {
    position: { x: 0, y: 0, z: 0 }, velocity: { x: 2, y: 0, z: 0 },
    age: 0.75, lifetime: 1,
  };
  const expired = advanceFragment(particle, 5);
  assert.equal(expired.alive, false);
  assert.equal(expired.age, 1);
  near(expired.position.x, 0.5);
  assert.equal(advanceFragments([particle], 5).length, 0);
  assert.equal(particle.age, 0.75);
});

test('rejects invalid ranges, non-finite values and oversized bursts', () => {
  assert.throws(() => createProceduralBurst({ ...config, count: 4097 }), RangeError);
  assert.throws(() => createProceduralBurst({ ...config, seed: -1 }), RangeError);
  assert.throws(() => createProceduralBurst({ ...config, minLifetime: 0 }), RangeError);
  assert.throws(() => createProceduralBurst({ ...config, maxSpeed: 0.2 }), RangeError);
  assert.throws(() => createProceduralBurst({ ...config, origin: { x: NaN, y: 0, z: 0 } }), TypeError);
  const particle = createProceduralBurst(config)[0];
  assert.throws(() => advanceFragment(particle, -0.1), RangeError);
  assert.throws(() => advanceFragment(particle, Infinity), TypeError);
  assert.throws(() => advanceFragment({ ...particle, age: 6 }, 0.1), RangeError);
});
