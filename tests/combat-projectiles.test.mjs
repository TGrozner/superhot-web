import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceProjectile } from '../src/combat/projectiles.js';

const v = (x, y = 0, z = 0) => ({ x, y, z });
const shot = () => ({ pos: v(0), direction: v(1), speed: 10, ttl: 2, age: 0, owner: 'player' });

test('advances in injected world time and leaves input untouched', () => {
  const original = shot();
  const result = advanceProjectile(original, .5);
  assert.deepEqual(result.projectile.pos, v(5));
  assert.equal(result.projectile.ttl, 1.5);
  assert.equal(result.projectile.age, .5);
  assert.equal(result.projectile.owner, 'player');
  assert.equal(result.expired, false);
  assert.equal(result.impact, null);
  assert.deepEqual(original, shot());
});

test('collision clamps displacement and elapsed time to impact fraction', () => {
  const wall = { min: v(4, -1, -1), max: v(6, 1, 1) };
  const { projectile, impact, expired } = advanceProjectile(shot(), 1, { solids: [wall] });
  assert.equal(impact.kind, 'solid');
  assert.equal(impact.t, .4);
  assert.deepEqual(projectile.pos, v(4));
  assert.equal(projectile.age, .4);
  assert.equal(projectile.ttl, 1.6);
  assert.equal(expired, true);
});

test('lifetime expiry bounds movement and cannot resurrect a spent projectile', () => {
  const short = { ...shot(), ttl: .25 };
  const result = advanceProjectile(short, 2);
  assert.deepEqual(result.projectile.pos, v(2.5));
  assert.equal(result.projectile.age, .25);
  assert.equal(result.projectile.ttl, 0);
  assert.equal(result.expired, true);
  const spent = advanceProjectile({ ...shot(), ttl: 0 }, 2);
  assert.deepEqual(spent.projectile.pos, v(0));
  assert.equal(spent.impact, null);
  assert.equal(spent.expired, true);
});

test('zero world delta freezes motion without discovering new collisions', () => {
  const result = advanceProjectile(shot(), 0, { targets: [{ center: v(0), radius: 1 }] });
  assert.deepEqual(result.projectile.pos, v(0));
  assert.equal(result.projectile.ttl, 2);
  assert.equal(result.impact, null);
  assert.equal(result.expired, false);
});

test('rejects negative or nonfinite world time and invalid projectiles', () => {
  assert.throws(() => advanceProjectile(shot(), -1), RangeError);
  assert.throws(() => advanceProjectile(shot(), Infinity), RangeError);
  assert.throws(() => advanceProjectile({ ...shot(), speed: NaN }, 1), TypeError);
  assert.throws(() => advanceProjectile({ ...shot(), ttl: -1 }, 1), TypeError);
});
