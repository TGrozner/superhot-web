import test from 'node:test';
import assert from 'node:assert/strict';
import { firstImpact } from '../src/combat/trace.js';

const v = (x, y = 0, z = 0) => ({ x, y, z });
const box = (minX, maxX) => ({ min: v(minX, -1, -1), max: v(maxX, 1, 1) });

// Synthetic numeric stress fixtures only; no dimensions or speeds from native MCD.
test('opposite large finite endpoints cross a central solid halfway', () => {
  const hit = firstImpact(v(1e308), v(-1e308), { solids: [box(-1, 1)] });
  assert.equal(hit?.kind, 'solid');
  assert.equal(hit.t, 0.5);
  assert.deepEqual(hit.point, v(0));
});

test('an immediate solid hit preserves the original finite point', () => {
  const hit = firstImpact(v(1e308), v(-1e308), { solids: [box(1e308, 1e308)] });
  assert.equal(hit?.t, 0);
  assert.deepEqual(hit.point, v(1e308));
});

test('an immediate sphere hit cannot manufacture NaN in hit point', () => {
  const hit = firstImpact(v(1e308), v(-1e308), { targets: [{ center: v(1e308), radius: 1 }] });
  assert.equal(hit?.t, 0);
  assert.deepEqual(hit.point, v(1e308));
});

test('overflow of intermediate boundary minus start does not change a miss into a hit', () => {
  assert.equal(firstImpact(v(-1e308), v(1e308), { solids: [box(1.5e308, 1.6e308)] }), null);
});
