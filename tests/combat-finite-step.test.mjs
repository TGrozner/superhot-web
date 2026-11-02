import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceProjectile } from '../src/combat/projectiles.js';

const v = (x, y = 0, z = 0) => ({ x, y, z });
const baseline = () => ({ pos: v(0), direction: v(1), speed: 1, ttl: 2, age: 0 });

// Synthetic numerics only. These are not weapon speeds or timings from native MCD.
test('rejects a time-speed product that overflows despite finite inputs', () => {
  const original = { ...baseline(), speed: 1e308 };
  assert.throws(() => advanceProjectile(original, 2), RangeError);
  assert.deepEqual(original, { ...baseline(), speed: 1e308 });
});

test('rejects an overflowing direction-scaled displacement', () => {
  assert.throws(() => advanceProjectile({ ...baseline(), direction: v(1e308), speed: 10 }, 1), RangeError);
});

test('rejects a position plus displacement overflow', () => {
  assert.throws(() => advanceProjectile({ ...baseline(), pos: v(1e308), direction: v(1e308) }, 1), RangeError);
});

test('rejects an overflowing derived age even if the position is finite', () => {
  assert.throws(() => advanceProjectile({ ...baseline(), speed: 0, age: 1e308, ttl: 1e308 }, 1e308), RangeError);
});

test('large yet finite results remain valid and preserve non-unit directions', () => {
  const original = { ...baseline(), direction: v(2), speed: 1e100, ttl: 1 };
  const result = advanceProjectile(original, 0.25);
  assert.equal(result.projectile.pos.x, 5e99);
  assert.equal(result.projectile.age, 0.25);
  assert.equal(result.projectile.ttl, 0.75);
  assert.deepEqual(original.pos, v(0));
});

test('zero world time still returns a snapshot without numerical motion', () => {
  const original = { ...baseline(), pos: v(1e308), speed: 1e308 };
  const result = advanceProjectile(original, 0);
  assert.deepEqual(result.projectile.pos, original.pos);
  assert.equal(result.impact, null);
  assert.equal(result.expired, false);
});
