import assert from 'node:assert/strict';
import test from 'node:test';
import {createWebFootstepMotion} from '../src/sound/web-footstep-motion.js';

// Web-only gait policy: these are synthetic emitter receipts, not captured audio.
const sourceReceipt = {status: 'started', source: 'web-original-synthesis',
  at: 1, spatial: true};

test('slow grounded movement at 120 FPS produces a real distance-driven footfall', () => {
  const cues = [];
  const gait = createWebFootstepMotion((cue, request) => {
    cues.push({cue, request});
    return sourceReceipt;
  });
  // 0.24m/s yields just 2mm per 120Hz frame, formerly discarded every frame.
  for (let frame = 0; frame <= 120 * 7; frame++) {
    const timeSeconds = frame / 120;
    gait.advance({position: {x: 0.24 * timeSeconds, y: 1.6, z: 0},
      grounded: true, timeSeconds});
  }
  assert.ok(cues.length >= 1, 'directed walking should eventually plant a foot');
  assert.ok(cues.length <= 2, 'small frame motion must not inflate the gait rate');
  assert.ok(cues.every(({cue}) => cue === 'step'));
  assert.ok(cues.every(({request}) => Math.abs(request.position.y - 0.35) < 1e-9));
});

test('sub-5mm alternating camera jitter does not accumulate phantom footfalls', () => {
  const cues = [];
  const gait = createWebFootstepMotion((cue) => {
    cues.push(cue);
    return sourceReceipt;
  });
  for (let frame = 0; frame <= 120 * 7; frame++) {
    const timeSeconds = frame / 120;
    gait.advance({position: {x: frame % 2 ? 0.002 : -0.002, y: 1.6, z: 0},
      grounded: true, timeSeconds});
  }
  // No full directed stride was travelled. Calling the synthetic dispatcher
  // would not itself prove human audibility, and must not happen here.
  assert.deepEqual(cues, []);
});
