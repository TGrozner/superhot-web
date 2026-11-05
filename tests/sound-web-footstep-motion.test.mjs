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

test('Web gait snapshots a camera that moves in place between frames', () => {
  const cues = [];
  const camera = p(0);
  const gait = createWebFootstepMotion((cue, request) => {
    cues.push({cue, request});
    return {status:'started', source:'web-original-synthesis', at:1, spatial:true};
  });
  const advance = timeSeconds => gait.advance({position:camera, grounded:true, timeSeconds});
  assert.equal(advance(1), null);
  camera.x = 0.7;
  assert.equal(advance(1.1), null);
  camera.x = 1.4;
  assert.equal(advance(1.2)?.status, 'started');
  assert.equal(cues.length, 1);
  assert.equal(cues[0].request.position.x, 1.4);
  camera.x = 40; // Historical dispatched position must not alias the live camera.
  assert.equal(cues[0].request.position.x, 1.4);
});

test('ground contact emits a single Web-only landing thud, not a stride or a spurious replay thump', () => {
  const cues = [];
  const gait = createWebFootstepMotion((cue, request) => {
    cues.push({cue, ...request});
    return {status: 'started', source: 'web-original-synthesis', at: 1, spatial: true};
  });
  const tick = (x, timeSeconds, grounded) =>
    gait.advance({position: p(x), timeSeconds, grounded});

  assert.equal(tick(0, 1, true), null);
  assert.equal(tick(0.02, 1.05, false), null);
  assert.equal(tick(0.06, 1.10, false), null);
  assert.equal(tick(0.1, 1.16, false), null);
  assert.equal(tick(0.12, 1.20, true)?.status, 'started');
  assert.deepEqual(cues.map(cue => cue.cue), ['landing']);
  assert.ok(cues[0].intensity > 0.55);
  assert.equal(tick(0.12, 1.25, true), null);
  assert.equal(tick(0.12, 1.30, false), null);
  assert.equal(tick(0.12, 1.34, true), null); // One-frame grounded jitter.
  assert.equal(cues.length, 1);

  gait.reset();
  assert.equal(tick(0, 0, false), null); // Initial airborne spawn is not a landing.
  assert.equal(tick(0, 0.1, false), null);
  assert.equal(tick(0, 0.2, true), null);

  gait.reset();
  tick(0, 2, true);
  tick(0, 2.05, false);
  tick(0, 2.1, false);
  assert.equal(tick(20, 2.15, true), null); // Teleport between last air/ground frames.
  gait.reset();
  tick(0, 3, true);
  tick(0, 3.05, false);
  tick(0, 3.1, false);
  assert.equal(tick(0, 3.5, true), null); // Suspended tab / long frame gap.
  assert.deepEqual(cues.map(cue => cue.cue), ['landing']);
});

test('low-FPS grounded strides and a landing schedule cues while teleports remain silent', () => {
  const cues = [];
  const gait = createWebFootstepMotion((cue, request) => {
    cues.push({cue, ...request});
    return {status:'started', source:'web-original-synthesis', at:1, spatial:true};
  });
  const tick = (x, timeSeconds, grounded = true) =>
    gait.advance({position:p(x), grounded, timeSeconds});
  // 6.6 m/s over 200ms moves 1.32m: legitimate gameplay at slow frame cadence.
  assert.equal(tick(0, 0), null);
  assert.equal(tick(1.32, 0.2)?.status, 'started');
  assert.equal(tick(2.64, 0.4)?.status, 'started');
  assert.equal(tick(9, 0.6), null); // 6.36m teleport in 200ms is still rejected.
  assert.deepEqual(cues.map(cue => cue.cue), ['step', 'step']);
  // Existing bridge provides the eye position (y=1.6 in this test), not feet.
  assert.ok(Math.abs(cues[0].position.y - 0.35) < 1e-10);
  assert.ok(Math.abs(cues[1].position.y - 0.35) < 1e-10);
  assert.ok(Math.abs(cues[0].position.z + 0.22) < 1e-10);
  assert.ok(Math.abs(cues[1].position.z - 0.22) < 1e-10);

  gait.reset();
  assert.equal(tick(0, 1), null);
  assert.equal(tick(0.9, 1.2, false), null);
  assert.equal(tick(1.3, 1.4, false), null);
  assert.equal(tick(2.6, 1.6, true)?.status, 'started');
  assert.deepEqual(cues.map(cue => cue.cue), ['step', 'step', 'landing']);
  assert.ok(Math.abs(cues[2].position.y - 0.35) < 1e-10);
  assert.equal(tick(2.6, 1.8), null);
});

// A pure Web-height accent. Source WebAudio routing is unchanged and a receipt
// still proves scheduling only, not that a person heard the resulting sound.
test('higher genuine falls increase landing weight, while a vertical respawn stays silent', () => {
  const recorded = [];
  const gait = createWebFootstepMotion((cue, request) => {
    recorded.push({cue, ...request});
    return {status:'started', source:'web-original-synthesis', at:1, spatial:true};
  });
  const run = heights => {
    gait.reset();
    [0, 0.05, 0.1, 0.15, 0.2].forEach((timeSeconds, i) => {
      gait.advance({position:p(0, heights[i]), grounded:i === 0 || i === 4, timeSeconds});
    });
    return recorded.at(-1).intensity;
  };
  const hop = run([1.6, 1.8, 1.9, 1.8, 1.6]);
  const drop = run([4.6, 4.3, 3.2, 2.0, 1.6]);
  assert.deepEqual(recorded.map(entry => entry.cue), ['landing', 'landing']);
  assert.ok(drop > hop + 0.35, 'falling from higher up should sound heavier');
  assert.ok(drop <= 1.4, 'Web landing boost is limited');
  assert.ok(recorded.every(entry => Math.abs(entry.position.y - 0.35) < 1e-9));

  gait.reset();
  gait.advance({position:p(0, 1.6), grounded:true, timeSeconds:1});
  gait.advance({position:p(0, 1.7), grounded:false, timeSeconds:1.05});
  gait.advance({position:p(0, 1.8), grounded:false, timeSeconds:1.1});
  assert.equal(gait.advance({position:p(0, -12), grounded:true,
    timeSeconds:1.15}), null, 'one-frame vertical teleport is not a landing');
  assert.equal(recorded.length, 2);
});
