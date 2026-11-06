import assert from 'node:assert/strict';
import test from 'node:test';
import {createWebImpactMix} from '../src/sound/web-impact-mix.js';

// WebAudio graph fake: scheduling evidence, never proof of speaker audibility.
function fakeAudio() {
  const gains = [];
  const param = (value = 0) => ({
    value,
    setValueAtTime(v) { this.value = v; },
    exponentialRampToValueAtTime(v) { this.value = v; },
    linearRampToValueAtTime(v) { this.value = v; },
    cancelScheduledValues() {},
    setTargetAtTime(v) { this.value = v; },
  });
  const node = () => ({
    connections: [],
    connect(next) { this.connections.push(next); return next; },
    disconnect() { this.disconnected = true; },
  });
  const source = () => ({
    ...node(), frequency: param(), start() {}, stop() {},
  });
  const ctx = {
    state: 'running', currentTime: 2, sampleRate: 44100, destination: node(),
    listener: {positionX: {value: 0}, positionY: {value: 0}, positionZ: {value: 0}},
    createGain: () => { const result = {...node(), gain: param()}; gains.push(result); return result; },
    createDynamicsCompressor: () => ({
      ...node(), threshold: param(), ratio: param(), attack: param(), release: param(),
    }),
    createBuffer: (_channels, length) => ({getChannelData: () => new Float32Array(length)}),
    createBufferSource: source, createOscillator: source,
    createDelay: () => ({...node(), delayTime: param()}),
    createBiquadFilter: () => ({...node(), frequency: param()}),
    createPanner: () => ({
      ...node(), positionX: param(), positionY: param(), positionZ: param(),
    }),
  };
  return {ctx, gains};
}

test('distant enemy muzzle cannot duck the shared Dojo reflection or extend a local burst', () => {
  const {ctx, gains} = fakeAudio();
  const mix = createWebImpactMix(ctx);
  const roomSend = gains[5].gain; // Shared reflections send: master, 4 buses, send.
  const targets = [];
  roomSend.setTargetAtTime = (value, at, constant) => targets.push({value, at, constant});

  assert.equal(mix.emit('player-shot').status, 'started');
  assert.equal(targets.length, 2);
  assert.equal(targets[0].value, 0.34);

  ctx.currentTime = 2.1;
  assert.equal(mix.emit('enemy-shot', {position: {x: 30, y: 0, z: 0}}).status, 'started');
  assert.equal(targets.length, 2, 'far muzzle must not automate global room reverb');

  ctx.currentTime = 2.36; // >280ms after local shot, <280ms after remote muzzle.
  assert.equal(mix.emit('player-shot').status, 'started');
  assert.equal(targets.length, 4);
  assert.equal(targets[2].value, 0.34, 'distant muzzle cannot extend the local burst counter');

  ctx.currentTime = 2.42;
  assert.equal(mix.emit('enemy-shot', {position: {x: 3, y: 0, z: 0}}).status, 'started');
  assert.equal(targets.length, 6);
  assert.ok(Math.abs(targets[4].value - 0.295) < 1e-12,
    'near-range fire still softens the local room tail in a burst');
  assert.equal(mix.getActiveVoices(), 4);
  mix.dispose();
  assert.equal(mix.getActiveVoices(), 0);
});
