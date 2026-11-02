import test from 'node:test';
import assert from 'node:assert/strict';
import { MCD_PLAYCLIP_RESULT, planMcdPlayClip } from '../src/sound/mcd-playclip-intent.js';

const ok = Object.freeze({
  clipPresent: true, channelPresent: true, cooldownActive: false,
  channelIsInterfaceSfx: false, bypassEffects: false,
  positionProvided: false, isLooped: false,
  playDelaySeconds: 0, volume: 0.6, pitch: 1, priority: 128,
});

test('AudioManager null clip returns the empty effect before evaluating channel/cooldown', () => {
  assert.deepEqual(planMcdPlayClip({ clipPresent: false }), {
    status: MCD_PLAYCLIP_RESULT.EMPTY_EFFECT, reason: 'clip-null',
  });
});

test('missing channel returns empty effect before consulting cooldown', () => {
  assert.deepEqual(planMcdPlayClip({ clipPresent: true, channelPresent: false }), {
    status: MCD_PLAYCLIP_RESULT.EMPTY_EFFECT, reason: 'channel-null',
  });
});

test('active clip cooldown blocks the Play request', () => {
  assert.deepEqual(planMcdPlayClip({ clipPresent: true, channelPresent: true, cooldownActive: true }), {
    status: MCD_PLAYCLIP_RESULT.EMPTY_EFFECT, reason: 'clip-on-cooldown',
  });
});

test('valid 2D immediate request preserves volume and channel and no bypass', () => {
  const result = planMcdPlayClip(ok);
  assert.equal(result.status, MCD_PLAYCLIP_RESULT.REQUEST);
  assert.equal(result.audioSource.volume, 0.6);
  assert.equal(result.audioSource.spatialBlend, 0);
  assert.equal(result.audioSource.bypassEffects, false);
  assert.equal(result.audioSource.outputMixer, 'supplied-channel');
  assert.equal(result.request.operation, 'Play');
  assert.equal(result.request.delaySeconds, 0);
  assert.equal(result.request.pauseExistingIfPoolReused, true);
});

test('position produces a fully spatial source and positive delay calls PlayDelayed', () => {
  const result = planMcdPlayClip({...ok, positionProvided: true, playDelaySeconds: 0.2, isLooped: true});
  assert.equal(result.audioSource.spatialBlend, 1);
  assert.equal(result.audioSource.loop, true);
  assert.deepEqual([result.request.operation, result.request.delaySeconds], ['PlayDelayed', 0.2]);
});

test('explicit bypass or interface SFX channel sets all three effect bypass flags', () => {
  for (const overrides of [{ bypassEffects: true }, { channelIsInterfaceSfx: true }]) {
    const src = planMcdPlayClip({...ok, ...overrides}).audioSource;
    assert.equal(src.bypassEffects, true);
    assert.equal(src.bypassListenerEffects, true);
    assert.equal(src.bypassReverbZones, true);
  }
});

test('pitch zero is a warning, not a PlayClip rejection; zero/negative delays are immediate', () => {
  for (const delay of [0, -0.1]) {
    const result = planMcdPlayClip({...ok, pitch: 0, playDelaySeconds: delay});
    assert.equal(result.zeroPitchWarning, true);
    assert.equal(result.status, MCD_PLAYCLIP_RESULT.REQUEST);
    assert.equal(result.request.operation, 'Play');
  }
});

test('required live state is never inferred by an unspecified mixer/cooldown guard', () => {
  assert.throws(() => planMcdPlayClip({...ok, cooldownActive: undefined}), /cooldownActive/);
  assert.throws(() => planMcdPlayClip({...ok, channelIsInterfaceSfx: undefined}), /channelIsInterfaceSfx/);
  assert.throws(() => planMcdPlayClip({...ok, playDelaySeconds: NaN}), /playDelaySeconds/);
  assert.throws(() => planMcdPlayClip({...ok, priority: 1.1}), /priority/);
});

test('returned request cannot be mutated by downstream cue plumbing', () => {
  const result = planMcdPlayClip(ok);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.audioSource));
  assert.ok(Object.isFrozen(result.request));
  assert.throws(() => { result.audioSource.volume = 5; }, TypeError);
});
