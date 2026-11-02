import test from 'node:test';
import assert from 'node:assert/strict';
import { firstImpact } from '../src/combat/trace.js';
import { advanceProjectile } from '../src/combat/projectiles.js';
import { hasLineOfSight } from '../src/combat/sight.js';

const v = (x, y = 0, z = 0) => ({ x, y, z });
const wall = (start, end) => ({ min: v(start, -1, -1), max: v(end, 1, 1) });

// All cases verify PROVISIONAL Web primitives. None is evidence of native MCD parity.
test('malformed solid extents are rejected rather than producing phantom hits', () => {
  assert.throws(() => firstImpact(v(0), v(10), { solids: [wall(6, 4)] }), RangeError);
  assert.throws(() => hasLineOfSight(v(0), v(10), [wall(6, 4)]), RangeError);
  assert.equal(firstImpact(v(0), v(10), { solids: [wall(4, 6)] }).point.x, 4);
});

test('geometry collections require arrays, avoiding silent empty collision passes', () => {
  assert.throws(() => firstImpact(v(0), v(10), { solids: { 0: wall(4, 6) } }), TypeError);
  assert.throws(() => firstImpact(v(0), v(10), { targets: { 0: { center: v(5), radius: 1 } } }), TypeError);
  assert.throws(() => firstImpact(v(0), v(10), { solids: null }), TypeError);
});

test('non-unit input direction retains magnitude: no implicit shotgun normalization', () => {
  const projectile = Object.freeze({ pos: Object.freeze(v(0)), direction: Object.freeze(v(2)), speed: 10, ttl: 1 });
  const result = advanceProjectile(projectile, 0.25);
  assert.deepEqual(result.projectile.pos, v(5));
  assert.equal(result.projectile.ttl, 0.75);
  assert.deepEqual(projectile.direction, v(2));
});

test('swept projectile tests do not tunnel through thin obstacles at Web scale', () => {
  const projectile = { pos: v(0), direction: v(1), speed: 100, ttl: 1 };
  const collision = advanceProjectile(projectile, 0.5, { solids: [wall(7, 7.01)] });
  assert.equal(collision.impact.kind, 'solid');
  assert.equal(collision.impact.t, 0.14);
  assert.ok(Math.abs(collision.projectile.pos.x - 7) < 1e-12);
  assert.equal(collision.projectile.pos.y, 0);
  assert.equal(collision.projectile.pos.z, 0);
  assert.equal(collision.expired, true);
});

test('split world-time steps match a direct noncollision displacement', () => {
  const original = { pos: v(0), direction: v(2, 1), speed: 4, ttl: 2 };
  const half = advanceProjectile(original, 0.5);
  const split = advanceProjectile(half.projectile, 0.5);
  const once = advanceProjectile(original, 1);
  assert.deepEqual(split.projectile, once.projectile);
  assert.deepEqual(original.pos, v(0));
});
