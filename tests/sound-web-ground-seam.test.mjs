import assert from 'node:assert/strict';
import test from 'node:test';
import {createWebFootstepMotion} from '../src/sound/web-footstep-motion.js';

// Web-authored floor contact continuity: scheduled cue != human audible sound.
test('one-frame near-flat floor contact flicker keeps walking cadence', () => {
  const cues = [];
  const gait = createWebFootstepMotion((cue, request) => {
    cues.push({cue, request});
    return {status: 'started', source: 'web-original-synthesis', at: 1, spatial: true};
  });
  const tick = (x, t, grounded = true, y = 1.6) =>
    gait.advance({position: {x, y, z: 0}, grounded, timeSeconds: t});

  assert.equal(tick(0, 0), null);
  assert.equal(tick(0.5, 0.1), null); // Half a shoe planted: not a full step.
  assert.equal(tick(0.7, 0.15, false), null); // One false-air sample at floor height.
  assert.equal(tick(1, 0.2)?.status, 'started'); // Resumes 0.5m saved phase.
  assert.equal(tick(1.3, 0.3), null);
  assert.equal(tick(1.35, 0.35, false), null);
  assert.equal(tick(1.4, 0.4), null);
  assert.equal(tick(2.1, 0.5)?.status, 'started');
  assert.deepEqual(cues.map(({cue}) => cue), ['step', 'step']);
});

test('real vertical hops, teleports and long frame pauses do not fake floor-seam steps', () => {
  const cues = [];
  const gait = createWebFootstepMotion((cue, request) => {
    cues.push(cue);
    return {status: 'started', source: 'web-original-synthesis', at: 1, spatial: true};
  });
  const tick = (x, t, grounded = true, y = 1.6) =>
    gait.advance({position: {x, y, z: 0}, grounded, timeSeconds: t});

  tick(0, 1);
  tick(0.5, 1.1);
  tick(0.6, 1.15, false, 1.9); // Too high for floor-contact flicker.
  assert.equal(tick(1, 1.2), null, 'a hop must discard previous footfall phase');
  assert.equal(tick(1.7, 1.3), null);
  assert.equal(tick(1.9, 1.4)?.status, 'started', 'normal rearmed first stride');
  assert.deepEqual(cues, ['step']);

  gait.reset();
  tick(0, 2);
  tick(0.5, 2.1);
  tick(7, 2.15, false); // Impossible 6.5m mid-frame displacement.
  assert.equal(tick(7.2, 2.2), null);
  assert.equal(tick(7.7, 2.3), null);
  assert.deepEqual(cues, ['step']);

  gait.reset();
  tick(0, 3);
  tick(0.5, 3.1);
  tick(0.6, 3.15, false);
  assert.equal(tick(1, 4.0), null, 'tab stall must discard old gait phase');
  assert.deepEqual(cues, ['step']);
});
