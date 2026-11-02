import test from 'node:test';
import assert from 'node:assert/strict';
import { firstImpact, IMPACT_EPSILON } from '../src/combat/trace.js';

const v = (x, y = 0, z = 0) => ({ x, y, z });
const block = (lo, hi) => ({ min: v(lo, -1, -1), max: v(hi, 1, 1) });
const sphere = (x, r = 1) => ({ center: v(x), radius: r });

test('returns null for free segment and reports the exact wall hit point', () => {
  assert.equal(firstImpact(v(0), v(10)), null);
  const wall = block(4, 6);
  const hit = firstImpact(v(0), v(10), { solids: [wall] });
  assert.equal(hit.kind, 'solid');
  assert.equal(hit.entity, wall);
  assert.equal(hit.index, 0);
  assert.equal(hit.t, .4);
  assert.deepEqual(hit.point, v(4));
});

test('a nearer target beats a wall but a wall occludes a farther target', () => {
  const wall = block(4, 6);
  const nearer = sphere(3, .5);
  const farther = sphere(8, .5);
  assert.equal(firstImpact(v(0), v(10), { solids: [wall], targets: [nearer] }).entity, nearer);
  assert.equal(firstImpact(v(0), v(10), { solids: [wall], targets: [farther] }).entity, wall);
});

test('solids win exact target ties; earlier entries win same-kind ties', () => {
  const wall = block(4, 6), target = sphere(5);
  assert.equal(firstImpact(v(0), v(10), { solids: [wall], targets: [target] }).kind, 'solid');
  const a = sphere(5), b = sphere(5);
  assert.equal(firstImpact(v(0), v(10), { targets: [a, b] }).entity, a);
  const tinyEarlier = sphere(5 - IMPACT_EPSILON * 5, 1);
  assert.equal(firstImpact(v(0), v(10), { solids: [wall], targets: [tinyEarlier] }).kind, 'solid');
});

test('reports zero fraction when segment starts within a hit volume', () => {
  assert.equal(firstImpact(v(5), v(9), { solids: [block(4, 6)] }).t, 0);
  assert.equal(firstImpact(v(5), v(9), { targets: [sphere(5)] }).t, 0);
});

test('does not mutate geometry or endpoints and rejects malformed input', () => {
  const start = Object.freeze(v(0)), end = Object.freeze(v(10));
  const wall = Object.freeze({ min: Object.freeze(v(4, -1, -1)), max: Object.freeze(v(6, 1, 1)) });
  firstImpact(start, end, { solids: [wall] });
  assert.deepEqual(start, v(0));
  assert.deepEqual(end, v(10));
  assert.throws(() => firstImpact(v(NaN), end), TypeError);
  assert.throws(() => firstImpact(start, end, { targets: [{ center: v(5), radius: -1 }] }), TypeError);
  assert.throws(() => firstImpact(start, end, { solids: [{ min: v(1) }] }), TypeError);
});
