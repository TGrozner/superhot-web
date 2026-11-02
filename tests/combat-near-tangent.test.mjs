import test from 'node:test';
import assert from 'node:assert/strict';
import { firstImpact } from '../src/combat/trace.js';

const v = (x, y = 0, z = 0) => ({ x, y, z });
const hit = (start, end, center, radius) =>
  firstImpact(start, end, { targets: [{ center, radius }] });

// Synthetic Web-only numerical fixtures; these are not MCD colliders or distances.
test('a sphere just outside the tangent line is not reported as a target hit', () => {
  assert.equal(hit(v(0), v(100), v(50, 1 + 1e-14), 1), null);
});

test('an exact tangent still intersects at the closest point', () => {
  assert.equal(hit(v(0), v(100), v(50, 1), 1)?.t, 0.5);
});

test('a point just inside tangency enters before closest approach', () => {
  const y = 1 - 1e-14;
  const fraction = hit(v(0), v(100), v(50, y), 1)?.t;
  const expected = 0.5 - Math.sqrt(1 - y * y) / 100;
  assert.ok(Number.isFinite(fraction) && fraction < 0.5 && fraction > 0);
  assert.ok(Math.abs(fraction - expected) < 2e-11);
});

test('a small nonzero sphere crossing does not lose its chord when squares underflow', () => {
  const fraction = hit(v(-1e-100), v(1e-100), v(0), 1e-101)?.t;
  assert.ok(Math.abs(fraction - 0.45) < 1e-12);
});

test('ordinary entry/near-end entry and moving-away control remain geometrically consistent', () => {
  assert.equal(hit(v(0), v(10), v(5), 1)?.t, 0.4);
  assert.ok(Math.abs(hit(v(0), v(10), v(11), 2)?.t - 0.9) < 1e-12);
  assert.equal(hit(v(0), v(-10), v(5), 1), null);
});
