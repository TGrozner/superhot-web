import test from 'node:test';
import assert from 'node:assert/strict';
import { firstImpact } from '../src/combat/trace.js';
import { advanceProjectile } from '../src/combat/projectiles.js';

const v = (x, y = 0, z = 0) => ({ x, y, z });

// WEB-ONLY geometry regression: synthetic sizes, not native MCD data.
test('sub-1e-8 movement detects a thin AABB crossed from outside', () => {
  const solid = { min: v(0.5e-9, -1, -1), max: v(0.8e-9, 1, 1) };
  const hit = firstImpact(v(0), v(1e-9), { solids: [solid] });
  assert.equal(hit?.kind, 'solid');
  assert.ok(Math.abs(hit.t - 0.5) < 1e-12);
  assert.ok(Math.abs(hit.point.x - 0.5e-9) < 1e-21);
});

test('sub-1e-5 movement detects a spherical target crossed from outside', () => {
  const target = { center: v(7e-10), radius: 1e-10 };
  const hit = firstImpact(v(0), v(1e-9), { targets: [target] });
  assert.equal(hit?.kind, 'target');
  assert.ok(Math.abs(hit.t - 0.6) < 1e-12);
  assert.ok(Math.abs(hit.point.x - 0.6e-9) < 1e-21);
});

test('short misses remain free; zero-length segment inside hits at t=0', () => {
  const box = { min: v(0.5e-9, 1, -1), max: v(0.8e-9, 2, 1) };
  const target = { center: v(7e-10, 1), radius: 1e-10 };
  assert.equal(firstImpact(v(0), v(1e-9), { solids: [box], targets: [target] }), null);
  assert.equal(firstImpact(v(0), v(0), {
    solids: [{ min: v(-1), max: v(1) }],
  }).t, 0);
});

test('projectile step inherits the micro-sweep hit and clamps age', () => {
  const projectile = { pos: v(0), direction: v(1), speed: 1e-9, ttl: 1, age: 0 };
  const wall = { min: v(0.5e-9, -1, -1), max: v(0.8e-9, 1, 1) };
  const result = advanceProjectile(projectile, 1, { solids: [wall] });
  assert.equal(result.impact?.kind, 'solid');
  assert.equal(result.projectile.age, 0.5);
  assert.equal(result.projectile.ttl, 0.5);
  assert.equal(result.expired, true);
  assert.deepEqual(projectile.pos, v(0));
});
