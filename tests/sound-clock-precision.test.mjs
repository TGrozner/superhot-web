import test from 'node:test';
import assert from 'node:assert/strict';
import { createSoundTimeline, SOUND_CLOCKS } from '../src/sound/timeline.js';

const create = () => {
  const dispatched = [];
  const timeline = createSoundTimeline({ dispatch: (event) => { dispatched.push(event.name); } });
  return { timeline, dispatched };
};

test('positive subnanosecond delays never dispatch at enqueue or half-delay', () => {
  const { timeline, dispatched } = create();
  timeline.enqueue({ name: 'tiny', clock: SOUND_CLOCKS.REAL, delaySeconds: 1e-10 });
  assert.equal(timeline.flushDue(), 0); // Previous fixed 1 ns tolerance dispatched here.
  assert.equal(timeline.advance({ realSeconds: 5e-11 }), 0);
  assert.equal(timeline.advance({ realSeconds: 5e-11 }), 1);
  assert.deepEqual(dispatched, ['tiny']);
});

test('one representable clock quantum is not due before any clock advance', () => {
  const { timeline } = create();
  timeline.advance({ realSeconds: 1 });
  timeline.enqueue({ name: 'one-ulp', clock: SOUND_CLOCKS.REAL, delaySeconds: Number.EPSILON });
  assert.equal(timeline.flushDue(), 0);
  assert.equal(timeline.advance({ realSeconds: Number.EPSILON }), 1);
});

test('nonrepresentable positive delay rejects atomically without consuming ID', () => {
  const { timeline } = create();
  timeline.advance({ realSeconds: 2 ** 53 });
  assert.throws(
    () => timeline.enqueue({ name: 'lost', clock: SOUND_CLOCKS.REAL, delaySeconds: 1 }),
    /delay lost clock precision/,
  );
  assert.equal(timeline.stats().enqueued, 0);
  assert.equal(timeline.enqueue({ name: 'now', clock: SOUND_CLOCKS.REAL }), 1);
  assert.equal(timeline.flushDue(), 1);
});

test('a clock increment lost to float precision rejects without mutating either clock', () => {
  const { timeline } = create();
  timeline.advance({ realSeconds: 2 ** 53 });
  assert.throws(
    () => timeline.advance({ realSeconds: 1, worldSeconds: 1 }),
    /advance lost precision/,
  );
  assert.deepEqual(timeline.now(), { real: 2 ** 53, world: 0 });
  assert.equal(timeline.advance({ realSeconds: 2, worldSeconds: 1 }), 0);
  assert.deepEqual(timeline.now(), { real: 2 ** 53 + 2, world: 1 });
});

test('roundoff at the due boundary remains tolerated after real progress', () => {
  const { timeline, dispatched } = create();
  timeline.enqueue({ name: 'rounded', clock: SOUND_CLOCKS.WORLD, delaySeconds: 0.2 });
  assert.equal(timeline.advance({ worldSeconds: 0.02 }), 0);
  assert.equal(timeline.advance({ worldSeconds: 0.18 }), 1);
  assert.deepEqual(dispatched, ['rounded']);
});
