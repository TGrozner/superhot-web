import test from 'node:test';
import assert from 'node:assert/strict';
import { firstImpact } from '../src/combat/trace.js';

const point = (x, y = 0, z = 0) => ({ x, y, z });
function expectSphereEntry(start, end, radius, expectedPointX) {
  const hit = firstImpact(start, end, {
    targets: [{ center: point(0), radius }],
  });
  assert.ok(hit, 'Expected a target intersection');
  assert.equal(hit.kind, 'target');
  assert.ok(Math.abs(hit.t - 0.45) < 1e-12, `entry t=${hit.t}`);
  assert.ok(Math.abs(hit.point.x / expectedPointX - 1) < 1e-12);
  assert.ok(Object.values(hit.point).every(Number.isFinite));
}

test('huge finite sweep crosses a finite sphere', () => {
  expectSphereEntry(point(-1e200), point(1e200), 1e199, -1e199);
});

test('subnormal squared magnitudes do not turn an exterior start into an impact', () => {
  expectSphereEntry(point(-1e-200), point(1e-200), 1e-201, -1e-201);
});

test('finite opposite-sign endpoints do not overflow the sphere sweep', () => {
  expectSphereEntry(point(1e308), point(-1e308), 1e307, 1e307);
});

test('an extremely large finite near miss remains a miss', () => {
  assert.equal(firstImpact(point(-1e200, 2e199), point(1e200, 2e199), {
    targets: [{ center: point(0), radius: 1e199 }],
  }), null);
});

test('start inside a huge sphere hits immediately', () => {
  const hit = firstImpact(point(1e200), point(2e200), {
    targets: [{ center: point(0), radius: 1e200 }],
  });
  assert.equal(hit?.t, 0);
  assert.deepEqual(hit?.point, point(1e200));
});
