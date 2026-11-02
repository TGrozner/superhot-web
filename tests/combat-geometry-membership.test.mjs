import test from 'node:test';
import assert from 'node:assert/strict';
import { firstImpact } from '../src/combat/trace.js';
import { advanceProjectile } from '../src/combat/projectiles.js';

// Synthetic Web fixtures: these do not describe Unity or MCD collision rules.
const v = (x, y = 0, z = 0) => ({ x, y, z });
const wall = (near, far) => ({
  min: v(near, -1, -1), max: v(far, 1, 1),
});

test('appending a solid from a collider getter cannot add a mid-trace candidate', () => {
  const appended = wall(2, 3);
  const solids = [];
  const original = {
    get min() {
      solids.push(appended);
      return v(8, -1, -1);
    },
    max: v(9, 1, 1),
  };
  solids.push(original);

  const impact = firstImpact(v(0), v(10), { solids });
  assert.equal(impact?.entity, original);
  assert.equal(impact?.index, 0);
  assert.equal(impact?.t, 0.8);
  assert.equal(solids.length, 2);
});

test('removing a later solid from a getter cannot erase a queued candidate', () => {
  const later = wall(3, 4);
  const solids = [];
  const first = {
    get min() {
      solids.pop();
      return v(8, -1, -1);
    },
    max: v(9, 1, 1),
  };
  solids.push(first, later);

  const impact = firstImpact(v(0), v(10), { solids });
  assert.equal(impact?.entity, later);
  assert.equal(impact?.index, 1);
  assert.equal(impact?.t, 0.3);
  assert.equal(solids.length, 1);
});

test('solid getter cannot register a target after the collision candidate snapshot', () => {
  const targets = [];
  const injected = { center: v(2), radius: 0.5 };
  const farWall = {
    get min() {
      targets.push(injected);
      return v(8, -1, -1);
    },
    max: v(9, 1, 1),
  };

  const impact = firstImpact(v(0), v(10), { solids: [farWall], targets });
  assert.equal(impact?.kind, 'solid');
  assert.equal(impact?.entity, farWall);
  assert.equal(impact?.t, 0.8);
  assert.equal(targets.length, 1);
});

test('target getter cannot append an extra target during the sweep', () => {
  const added = { center: v(2), radius: 0.5 };
  const targets = [];
  const original = {
    get center() {
      targets.push(added);
      return v(8);
    },
    radius: 0.5,
  };
  targets.push(original);

  const impact = firstImpact(v(0), v(10), { targets });
  assert.equal(impact?.kind, 'target');
  assert.equal(impact?.entity, original);
  assert.equal(impact?.index, 0);
  assert.ok(Math.abs(impact.t - 0.75) < 1e-12);
  assert.equal(targets.length, 2);
});

test('ordinary frozen arrays preserve the existing projectile hit contract', () => {
  const blocker = Object.freeze({
    min: Object.freeze(v(4, -1, -1)),
    max: Object.freeze(v(5, 1, 1)),
  });
  const solids = Object.freeze([blocker]);
  const projectile = Object.freeze({
    pos: Object.freeze(v(0)), direction: Object.freeze(v(1)),
    speed: 10, ttl: 1,
  });
  const result = advanceProjectile(projectile, 1, { solids });
  assert.equal(result.impact?.kind, 'solid');
  assert.equal(result.impact?.entity, blocker);
  assert.equal(result.impact?.index, 0);
  assert.equal(result.impact?.t, 0.4);
  assert.deepEqual(result.projectile.pos, v(4));
  assert.equal(result.expired, true);
  assert.equal(solids.length, 1);
});
