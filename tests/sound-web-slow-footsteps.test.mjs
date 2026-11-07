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

test('240Hz running has the same Web footstep strength as 60Hz at equal ground speed', () => {
  // At 240Hz, clamping the speed denominator to 1/120 halved measured
  // velocity (3m/s -> 1.5m/s), reducing each synthetic step to the 0.45 floor.
  // This checks emitter intensity, NOT an observed sound or a Unity gait.
  const measure = (fps) => {
    const cues = [];
    const gait = createWebFootstepMotion((cue, request) => {
      cues.push({cue, ...request});
      return sourceReceipt;
    });
    for (let frame = 0; frame <= fps * 2; frame++) {
      const timeSeconds = frame / fps;
      gait.advance({position: {x: 3 * timeSeconds, y: 1.6, z: 0},
        grounded: true, timeSeconds});
    }
    return cues;
  };
  const lowRefresh = measure(60);
  const highRefresh = measure(240);
  assert.ok(lowRefresh.length >= 3 && highRefresh.length >= 3,
    'both refresh rates must maintain a grounded gait');
  assert.ok(Math.abs(lowRefresh.length - highRefresh.length) <= 1,
    'refresh rate must not change step cadence');
  for (const {cue, intensity} of [...lowRefresh, ...highRefresh]) {
    assert.equal(cue, 'step');
    assert.ok(Math.abs(intensity - 2 / 3) < 1e-8,
      '3m/s gait should retain the same intensity at 60 and 240Hz');
  }
});
