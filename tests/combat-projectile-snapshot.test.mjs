import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceProjectile } from '../src/combat/projectiles.js';
const v = (x, y = 0, z = 0) => ({ x, y, z });
// Synthetic WEB inputs; no native projectile property is inferred.
test('position and direction are read once and never changed after validation', () => {
  let posReads = 0, dirReads = 0;
  const shot = {
    pos: { get x() { return ++posReads === 1 ? 0 : Infinity; }, y: 0, z: 0 },
    direction: { get x() { return ++dirReads === 1 ? 1 : Infinity; }, y: 0, z: 0 },
    speed: 10, ttl: 1,
  };
  const next = advanceProjectile(shot, 0.5).projectile;
  assert.deepEqual(next.pos, v(5));
  assert.deepEqual(next.direction, v(1));
  assert.equal(posReads, 1);
  assert.equal(dirReads, 1);
});
test('changing speed, ttl and age getters cannot replace validated values', () => {
  const calls = { speed: 0, ttl: 0, age: 0 };
  const shot = {
    pos: v(0), direction: v(1),
    get speed() { return ++calls.speed === 1 ? 10 : 100; },
    get ttl() { return ++calls.ttl === 1 ? 1 : 0; },
    get age() { return ++calls.age === 1 ? 0 : Infinity; },
    owner: 'player',
  };
  const { projectile, expired } = advanceProjectile(shot, 0.5);
  assert.deepEqual(projectile.pos, v(5));
  assert.equal(projectile.ttl, 0.5);
  assert.equal(projectile.age, 0.5);
  assert.equal(projectile.speed, 10);
  assert.equal(projectile.owner, 'player');
  assert.equal(expired, false);
  assert.deepEqual(calls, { speed: 1, ttl: 1, age: 1 });
});
test('pause uses exactly one snapshot and leaves absent optional age absent', () => {
  const calls = { pos: 0, dir: 0, speed: 0, ttl: 0 };
  const shot = {
    get pos() { ++calls.pos; return v(0); },
    get direction() { ++calls.dir; return v(1); },
    get speed() { return ++calls.speed === 1 ? 10 : NaN; },
    get ttl() { return ++calls.ttl === 1 ? 1 : NaN; },
    owner: 'player',
  };
  const { projectile, impact, expired } = advanceProjectile(shot, 0);
  assert.deepEqual(projectile.pos, v(0));
  assert.equal(projectile.ttl, 1);
  assert.equal(projectile.speed, 10);
  assert.equal('age' in projectile, false);
  assert.equal(impact, null);
  assert.equal(expired, false);
  assert.deepEqual(calls, { pos: 1, dir: 1, speed: 1, ttl: 1 });
});
test('ordinary frozen input preserves finite movement, metadata and no mutation', () => {
  const shot = Object.freeze({
    pos: Object.freeze(v(0)), direction: Object.freeze(v(1)),
    speed: 10, ttl: 2, age: 0, owner: 'player',
  });
  const { projectile, impact, expired } = advanceProjectile(shot, 0.5);
  assert.deepEqual(projectile, { ...shot, pos: v(5), ttl: 1.5, age: 0.5 });
  assert.equal(impact, null);
  assert.equal(expired, false);
  assert.deepEqual(shot.pos, v(0));
});
