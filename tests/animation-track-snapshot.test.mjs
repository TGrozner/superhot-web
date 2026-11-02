import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleLinearScalar } from '../src/animation/clip-clock.js';

test('sampleLinearScalar reads each timestamp only once before interpolation', () => {
  let reads = 0;
  const keys = [
    { time: 0, value: 0 },
    { get time() { return ++reads === 1 ? 10 : Number.NaN; }, value: 20 },
  ];
  assert.equal(sampleLinearScalar(keys, 5), 10);
  assert.equal(reads, 1);
});

test('sampleLinearScalar reads each finite key value once', () => {
  let reads = 0;
  const keys = [
    { time: 0, value: 0 },
    { time: 10, get value() { return ++reads === 1 ? 20 : Number.NaN; } },
  ];
  assert.equal(sampleLinearScalar(keys, 5), 10);
  assert.equal(reads, 1);
});

test('sampleLinearScalar samples a fixed keyframe membership when getters mutate the input array', () => {
  const keys = [
    { time: 0, get value() { keys.pop(); return 0; } },
    { time: 10, value: 20 },
  ];
  assert.equal(sampleLinearScalar(keys, 5), 10);
  assert.equal(keys.length, 1);
});

test('sampleLinearScalar rejects values invalid at the single validated read', () => {
  let reads = 0;
  const keys = [
    { time: 0, value: 0 },
    { time: 10, get value() { return ++reads === 1 ? Infinity : 20; } },
  ];
  assert.throws(() => sampleLinearScalar(keys, 5), TypeError);
  assert.equal(reads, 1);
});
