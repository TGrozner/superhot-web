import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceClipClock, sampleLinearScalar } from '../src/animation/clip-clock.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);

test('non-looping clip clamps at end, including overshoot', () => {
  assert.deepEqual(advanceClipClock({ duration: 2, time: 1.5 }, 9), {
    time: 2, wraps: 0, finished: true,
  });
  assert.deepEqual(advanceClipClock({ duration: 2, time: 2 }, 1), {
    time: 2, wraps: 0, finished: true,
  });
});

test('looping clip reports exact boundaries and multi-wrap travel', () => {
  assert.deepEqual(advanceClipClock({ duration: 1, time: 0.75, loop: true }, 0.25), {
    time: 0, wraps: 1, finished: false,
  });
  assert.deepEqual(advanceClipClock({ duration: 1, time: 0.25, loop: true }, 3.5), {
    time: 0.75, wraps: 3, finished: false,
  });
});

test('pause freezes clock; rate scales travel; input is immutable', () => {
  const clip = Object.freeze({ duration: 2, time: 0.7, rate: 3, loop: true, paused: true });
  assert.deepEqual(advanceClipClock(clip, 10), { time: 0.7, wraps: 0, finished: false });
  const running = { ...clip, paused: false };
  near(advanceClipClock(running, 0.1).time, 1.0);
  assert.equal(clip.time, 0.7);
});

test('timeline rejects invalid clocks instead of silently generating NaN', () => {
  assert.throws(() => advanceClipClock({ duration: 0 }, 1), RangeError);
  assert.throws(() => advanceClipClock({ duration: 1, time: 1, loop: true }, 1), RangeError);
  assert.throws(() => advanceClipClock({ duration: 1, rate: -1 }, 1), RangeError);
  assert.throws(() => advanceClipClock({ duration: 1, loop: 1 }, 1), TypeError);
  assert.throws(() => advanceClipClock({ duration: 1 }, -0.01), RangeError);
  assert.throws(() => advanceClipClock({ duration: 1 }, Number.POSITIVE_INFINITY), TypeError);
  assert.throws(() => advanceClipClock({ duration: Number.MIN_VALUE, loop: true }, 1e300), RangeError);
});

test('scalar track clamps ends, samples knots and interpolates between them', () => {
  const keys = Object.freeze([
    Object.freeze({ time: 1, value: 4 }),
    Object.freeze({ time: 3, value: 12 }),
    Object.freeze({ time: 5, value: -8 }),
  ]);
  assert.equal(sampleLinearScalar(keys, -2), 4);
  assert.equal(sampleLinearScalar(keys, 1), 4);
  assert.equal(sampleLinearScalar(keys, 2), 8);
  assert.equal(sampleLinearScalar(keys, 3), 12);
  assert.equal(sampleLinearScalar(keys, 4), 2);
  assert.equal(sampleLinearScalar(keys, 50), -8);
});

test('scalar track rejects malformed, unordered, or non-finite keys', () => {
  assert.throws(() => sampleLinearScalar([], 1), RangeError);
  assert.throws(() => sampleLinearScalar([{ time: 0, value: 1 }, { time: 0, value: 2 }], 0), RangeError);
  assert.throws(() => sampleLinearScalar([{ time: 2, value: 1 }, { time: 1, value: 2 }], 1), RangeError);
  assert.throws(() => sampleLinearScalar([{ time: 0, value: NaN }], 0), TypeError);
  assert.throws(() => sampleLinearScalar([{ time: 0, value: 2 }], Infinity), TypeError);
});
