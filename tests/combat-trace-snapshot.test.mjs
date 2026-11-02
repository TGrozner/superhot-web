import test from 'node:test';
import assert from 'node:assert/strict';
import { firstImpact } from '../src/combat/trace.js';

const v = (x, y = 0, z = 0) => ({ x, y, z });
const box = (a, b) => ({ min: v(a, -1, -1), max: v(b, 1, 1) });

// Deliberately changing accessors are synthetic WEB tests, not MCD evidence.
test('segment endpoint components are read once and the same snapshot produces the hit point', () => {
  let startReads = 0, endReads = 0;
  const start = {
    get x() { return ++startReads === 1 ? 0 : Infinity; }, y: 0, z: 0,
  };
  const end = {
    get x() { return ++endReads === 1 ? 10 : NaN; }, y: 0, z: 0,
  };
  const wall = box(4, 6);
  const hit = firstImpact(start, end, { solids: [wall] });
  assert.equal(hit?.kind, 'solid');
  assert.equal(hit.entity, wall);
  assert.equal(hit.t, 0.4);
  assert.deepEqual(hit.point, v(4));
  assert.equal(startReads, 1);
  assert.equal(endReads, 1);
});

test('solid bounds are sampled once before both validation and swept collision', () => {
  let minReads = 0, maxReads = 0;
  const wall = {
    get min() { return ++minReads === 1 ? v(4, -1, -1) : v(40, -1, -1); },
    get max() { return ++maxReads === 1 ? v(6, 1, 1) : v(60, 1, 1); },
  };
  const hit = firstImpact(v(0), v(10), { solids: [wall] });
  assert.equal(hit?.entity, wall);
  assert.equal(hit.t, 0.4);
  assert.deepEqual(hit.point, v(4));
  assert.equal(minReads, 1);
  assert.equal(maxReads, 1);
});

test('sphere center and radius are sampled once before validation and tracing', () => {
  let centerReads = 0, radiusReads = 0;
  const target = {
    get center() { return ++centerReads === 1 ? v(5) : v(100); },
    get radius() { return ++radiusReads === 1 ? 1 : NaN; },
  };
  const hit = firstImpact(v(0), v(10), { targets: [target] });
  assert.equal(hit?.entity, target);
  assert.equal(hit?.kind, 'target');
  assert.ok(Math.abs(hit.t - 0.4) < 1e-12);
  assert.ok(Math.abs(hit.point.x - 4) < 1e-12);
  assert.equal(centerReads, 1);
  assert.equal(radiusReads, 1);
});

test('nested coordinate getters cannot replace validated collider values', () => {
  let xReads = 0;
  const min = { get x() { return ++xReads === 1 ? 4 : NaN; }, y: -1, z: -1 };
  const solid = { min, max: v(6, 1, 1) };
  const hit = firstImpact(v(0), v(10), { solids: [solid] });
  assert.equal(hit?.kind, 'solid');
  assert.equal(hit.t, 0.4);
  assert.equal(xReads, 1);
});

test('snapshot rejects invalid first coordinate even if a getter later returns valid data', () => {
  let reads = 0;
  const start = { get x() { return ++reads === 1 ? NaN : 0; }, y: 0, z: 0 };
  assert.throws(() => firstImpact(start, v(10), { solids: [box(4, 6)] }), TypeError);
  assert.equal(reads, 1);
});
