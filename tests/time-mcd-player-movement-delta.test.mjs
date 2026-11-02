import test from 'node:test';
import assert from 'node:assert/strict';
import { mcdSourcePlayerPreConstraintMove as move } from '../src/time.js';

const identity = Object.freeze({ x: 0, y: 0, z: 0, w: 1 });
const source = (velocity, scaledDeltaTime, directionRotation = identity) =>
  move({ velocity, scaledDeltaTime, directionRotation });

test('pre-constraint displacement consumes scaled Unity seconds, not real seconds', () => {
  assert.deepEqual(source({ x: 2, y: -3, z: 4 }, 0.02), { x: 0.04, y: -0.06, z: 0.08 });
  const slow = source({ x: 0, y: 0, z: 6 }, 1 / 600);
  const fast = source({ x: 0, y: 0, z: 6 }, 1 / 60);
  assert.ok(Math.abs(slow.z * 10 - fast.z) < 1e-15);
});

test('native direction quaternion rotates player-local velocity before scaling', () => {
  const yaw90 = { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 };
  const result = source({ x: 0, y: 0, z: 8 }, 0.125, yaw90);
  assert.ok(Math.abs(result.x - 1) < 1e-14);
  assert.ok(Math.abs(result.y) < 1e-14);
  assert.ok(Math.abs(result.z) < 1e-14);
});

test('scaled pause delta gives zero movement without assuming unscaled time stopped', () => {
  assert.ok(Object.values(source({ x: 9, y: -2, z: 3 }, 0)).every(value => value === 0));
});

test('source-level pre-constraint motion does not mutate caller velocity or rotation', () => {
  const velocity = Object.freeze({ x: 2, y: 0, z: -1 });
  const directionRotation = Object.freeze({ ...identity });
  source(velocity, 0.5, directionRotation);
  assert.deepEqual(velocity, { x: 2, y: 0, z: -1 });
  assert.deepEqual(directionRotation, identity);
});

test('unknown or malformed native motion inputs fail closed', () => {
  assert.throws(() => move({}), /explicit/);
  assert.throws(() => source({ x: 1, y: 2, z: 3 }, -0.1), /nonnegative/);
  assert.throws(() => source({ x: 1, y: Infinity, z: 3 }, 0.1), /finite/);
  assert.throws(() => source({ x: 1, y: 2, z: 3 }, 0.1, { x: NaN, y: 0, z: 0, w: 1 }), /finite/);
});
