import assert from 'node:assert/strict';
import test from 'node:test';
import {createWebFootstepMotion} from '../src/sound/web-footstep-motion.js';

const p = (x, y = 1.6, z = 0) => ({x, y, z});

test('Web gait accent follows actual ground travel, not idling, looking or jumping', () => {
  const cues = [];
  const gait = createWebFootstepMotion((cue, request) => {
    cues.push({cue, ...request});
    return {status: 'started', source: 'web-original-synthesis', at: 1, spatial: true};
  });
  const tick = (x, time, grounded = true, y = 1.6) =>
    gait.advance({position: p(x, y), grounded, timeSeconds: time});
  assert.equal(tick(0, 1), null);
  assert.equal(tick(0, 1.1), null); // Looking in place does not count.
  assert.equal(tick(0.7, 1.2), null);
  assert.equal(tick(1.4, 1.3)?.status, 'started');
  assert.deepEqual(cues.map(cue => cue.cue), ['step']);
  assert.ok(cues[0].intensity > 0.45);
  assert.equal(tick(1.9, 1.4, false), null); // No mid-air steps.
  assert.equal(tick(2.0, 1.5, true), null); // Landing primes the cadence.
  assert.equal(tick(4.0, 1.6), null); // Teleport doesn't fake a stride.
  assert.equal(tick(4.7, 1.7), null);
  assert.equal(tick(5.4, 1.8)?.status, 'started');
  gait.reset();
  assert.equal(tick(0, 0), null); // Replay reset/rewind is safe.
  assert.equal(tick(0.7, 0.1), null);
  assert.equal(tick(1.4, 0.2)?.status, 'started');
  assert.equal(cues.length, 3);
});

test('Web gait rejects a paused frame and malformed position without emitting', () => {
  let count = 0;
  const gait = createWebFootstepMotion(() => { count++; return {status:'started', source:'web-original-synthesis', at:1, spatial:false}; });
  assert.equal(gait.advance({position:p(0), grounded:true, timeSeconds:1}), null);
  assert.equal(gait.advance({position:p(0.9), grounded:true, timeSeconds:1.1}), null);
  assert.equal(gait.advance({position:p(1.8), grounded:true, timeSeconds:3}), null);
  assert.equal(gait.advance({position:p(2.5), grounded:true, timeSeconds:3.1}), null);
  assert.equal(count, 0);
  assert.throws(() => gait.advance({position:p(Infinity), grounded:true, timeSeconds:3.2}), /finite/);
});
