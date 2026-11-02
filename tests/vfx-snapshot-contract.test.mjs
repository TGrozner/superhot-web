import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createProceduralBurst, advanceFragment, advanceFragments,
} from '../src/vfx/procedural-fragments.js';

const fragment = (position, velocity) => ({
  id: 1, position, velocity, age: 0, lifetime: 10,
});
const flip = (first, later) => {
  let reads = 0;
  return {
    get x() { reads += 1; return reads === 1 ? first : later; },
    y: 0, z: 0,
    getReads() { return reads; },
  };
};

test('burst snapshots the origin once and only emits x/y/z', () => {
  const origin = flip(4, 900);
  origin.unrelated = 'not part of a 3D vector';
  const burst = createProceduralBurst({
    origin, seed: 5, count: 3,
    minSpeed: 1, maxSpeed: 1, minLifetime: 1, maxLifetime: 1,
  });
  assert.deepEqual(burst.map((p) => p.position), [
    { x: 4, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 4, y: 0, z: 0 },
  ]);
  assert.equal(origin.getReads(), 1);
});

test('single fragment uses position, velocity and acceleration values that were validated', () => {
  const position = flip(1, 999);
  const velocity = flip(2, 888);
  const acceleration = flip(4, 777);
  const output = advanceFragment(fragment(position, velocity), 0.5, acceleration);
  assert.equal(output.position.x, 2.5); // 1 + 2*0.5 + 0.5*4*0.5^2
  assert.equal(output.velocity.x, 4);
  assert.equal(position.getReads(), 1);
  assert.equal(velocity.getReads(), 1);
  assert.equal(acceleration.getReads(), 1);
});

test('batch has one consistent acceleration snapshot for all particles', () => {
  const acceleration = flip(2, 999);
  const source = fragment({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
  const outputs = advanceFragments([source, { ...source, id: 2 }], 1, acceleration);
  assert.deepEqual(outputs.map((p) => p.position.x), [1, 1]);
  assert.deepEqual(outputs.map((p) => p.velocity.x), [2, 2]);
  assert.equal(acceleration.getReads(), 1);
});

test('previously valid vector cannot turn non-finite during computation', () => {
  const acceleration = flip(2, Infinity);
  const output = advanceFragment(fragment(
    { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 },
  ), 1, acceleration);
  assert.equal(output.position.x, 1);
  assert.equal(acceleration.getReads(), 1);
});

test('age and lifetime getters are captured before selecting the integration step', () => {
  let ageReads = 0;
  let lifetimeReads = 0;
  const source = {
    id: 99,
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 2, y: 0, z: 0 },
    get age() { ageReads++; return ageReads === 1 ? 0 : 0.75; },
    get lifetime() { lifetimeReads++; return lifetimeReads === 1 ? 2 : 1; },
  };
  const output = advanceFragment(source, 0.5);
  assert.equal(output.age, 0.5);
  assert.equal(output.lifetime, 2);
  assert.equal(output.alive, true);
  assert.equal(output.position.x, 1);
  assert.equal(ageReads, 1);
  assert.equal(lifetimeReads, 1);
});
