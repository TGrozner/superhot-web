import assert from 'node:assert/strict';
import test from 'node:test';
import {createWebFootstepMotion} from '../src/sound/web-footstep-motion.js';

// Original Web first-contact response, not a Unity animation marker.
// A dispatch receipt does not prove that a person heard the sound.
test('short grounded strafes cue a shoe contact and sustained idle rearms cadence', () => {
  const calls = [];
  const gait = createWebFootstepMotion((cue, request) => {
    calls.push({cue, ...request});
    return {status: 'started', source: 'web-original-synthesis', at: 0, spatial: true};
  });
  const tick = (x, at) => gait.advance({
    position: {x, y: 1.6, z: 0}, grounded: true, timeSeconds: at,
  });

  assert.equal(tick(0, 0), null);
  assert.equal(tick(0.4, 0.1), null);
  assert.equal(tick(0.8, 0.2)?.status, 'started'); // First shoe plant at 0.75m, not 1.3m.
  assert.equal(tick(1.4, 0.3), null);
  assert.equal(tick(2.1, 0.4)?.status, 'started'); // Full 1.3m for the next stride.
  for (const at of [0.5, 0.6, 0.7, 0.8, 0.9]) assert.equal(tick(2.1, at), null);
  assert.equal(tick(2.6, 1.0), null);
  assert.equal(tick(3.0, 1.1)?.status, 'started'); // Short first contact after a real stop.
  assert.deepEqual(calls.map(call => call.cue), ['step', 'step', 'step']);
  assert.deepEqual(calls.map(call => call.position.x), [0.8, 2.1, 3]);
});
