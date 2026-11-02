import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleLinearScalar } from '../src/animation/clip-clock.js';

test('valid opposite-sign finite values do not overflow during linear sampling', () => {
  const keys = [
    { time: 0, value: -1e308 },
    { time: 1, value: 1e308 },
  ];
  assert.equal(sampleLinearScalar(keys, 0.5), 0);
  assert.equal(sampleLinearScalar(keys, 0.25), -5e307);
  assert.ok(Number.isFinite(sampleLinearScalar(keys, 0.75)));
});

test('valid extreme timestamp interval does not collapse to first key', () => {
  const keys = [
    { time: -1e308, value: -1 },
    { time: 1e308, value: 1 },
  ];
  assert.equal(sampleLinearScalar(keys, 0), 0);
  assert.equal(sampleLinearScalar(keys, 5e307), 0.5);
  assert.equal(sampleLinearScalar(keys, -5e307), -0.5);
});

test('ordinary samples and out-of-range clamping are unchanged', () => {
  const keys = [
    { time: 0, value: 10 },
    { time: 10, value: 20 },
  ];
  assert.equal(sampleLinearScalar(keys, -1), 10);
  assert.equal(sampleLinearScalar(keys, 3), 13);
  assert.equal(sampleLinearScalar(keys, 10), 20);
  assert.equal(sampleLinearScalar(keys, 20), 20);
});
