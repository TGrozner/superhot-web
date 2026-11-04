import assert from 'node:assert/strict';
import test from 'node:test';
import {createWebImpactMix} from '../src/sound/web-impact-mix.js';

function fakeAudio(state = 'running') {
  const nodes = [];
  const gains = [];
  const param = (value = 0) => ({value,
    setValueAtTime(v) { this.value = v; },
    exponentialRampToValueAtTime(v) { this.value = v; },
    linearRampToValueAtTime(v) { this.value = v; },
    cancelScheduledValues() {}, setTargetAtTime(v) { this.value = v; }});
  const base = () => ({connect(dst) { return dst; }, disconnect() {}});
  const source = () => {
    const n = {...base(), frequency: param(), onended: null,
      start(...args) { this.startArgs = args; }, stop(...args) { this.stopped = true; this.stopArgs = args; }};
    nodes.push(n); return n;
  };
  const ctx = {state, currentTime: 2.25, sampleRate: 8000, destination: base(),
    createGain: () => { const n = {...base(), gain: param()}; gains.push(n); return n; },
    createDynamicsCompressor: () => ({...base(), threshold: param(), ratio: param(),
      attack: param(), release: param()}),
    createBuffer: (_channels, length) => ({getChannelData: () => new Float32Array(length)}),
    createBufferSource: source, createOscillator: source,
    createBiquadFilter: () => ({...base(), frequency: param()}),
    createPanner: () => ({...base(), positionX: param(), positionY: param(),
      positionZ: param()}),
  };
  return {ctx, nodes, gains};
}

test('original Web gunshot is scheduled with HRTF and kept inside the voice budget', () => {
  const {ctx, nodes} = fakeAudio();
  const layer = createWebImpactMix(ctx, 2);
  assert.equal(layer.startAmbience(), true);
  const r = layer.emit('player-shot', {position: {x: 1, y: 0, z: -3}});
  assert.deepEqual(r, {status: 'started', source: 'web-original-synthesis',
    at: 2.25, spatial: true});
  assert.equal(nodes.length, 3); // drone + two one-shot layers
  assert.equal(nodes[1].startArgs.length, 3); // noise buffer region, not file audio
  for (let i = 0; i < 8; i++) layer.emit('impact');
  assert.equal(layer.getActiveVoices(), 2);
  layer.stopAmbience();
  layer.dispose();
  assert.equal(layer.getActiveVoices(), 0);
});

test('suspended context schedules nothing and invalid position fails explicitly', () => {
  const {ctx, nodes} = fakeAudio('suspended');
  const layer = createWebImpactMix(ctx);
  assert.equal(layer.emit('shatter').status, 'blocked');
  assert.equal(nodes.length, 0);
  ctx.state = 'running';
  assert.throws(() => layer.emit('katana', {position: {x: Infinity, y: 0, z: 0}}), /position/);
  assert.equal(layer.emit('katana').status, 'started');
  layer.dispose();
  assert.equal(layer.emit('katana').status, 'blocked');
});


test('a saturated combat mix prioritizes shots over footsteps, not the oldest shot', () => {
  const first = fakeAudio();
  const loud = createWebImpactMix(first.ctx, 2);
  assert.equal(loud.emit('player-shot').status, 'started');
  assert.equal(loud.emit('katana').status, 'started');
  const before = first.nodes.length;
  assert.equal(loud.emit('step').status, 'blocked');
  assert.equal(first.nodes.length, before); // A dropped cue schedules nothing.
  loud.dispose();

  const second = fakeAudio();
  const mix = createWebImpactMix(second.ctx, 2);
  mix.emit('step');
  mix.emit('pickup');
  const stepNoise = second.nodes[0];
  assert.equal(stepNoise.stopped, undefined);
  assert.equal(mix.emit('enemy-shot').status, 'started');
  assert.equal(stepNoise.stopped, true); // Lower-priority voice was stopped.
  assert.equal(mix.getActiveVoices(), 2);
  mix.dispose();
});


test('Web accents can be trimmed beside original-mode buffers without scheduling muted voices', () => {
  const {ctx, nodes, gains} = fakeAudio();
  const layer = createWebImpactMix(ctx);
  assert.equal(layer.getMixLevel(), 1);
  assert.throws(() => layer.setMixLevel(1.01), /mixLevel 0\.\.1/);
  layer.setMixLevel(0);
  assert.equal(gains[0].gain.value, 0);
  assert.equal(layer.startAmbience(), false);
  assert.equal(layer.emit('player-shot').status, 'blocked');
  assert.equal(nodes.length, 0);
  layer.setMixLevel(0.15);
  assert.ok(Math.abs(gains[0].gain.value - 0.114) < 1e-9);
  assert.equal(layer.emit('player-shot').status, 'started');
  layer.dispose();
});

test('rapid Web shots rotate noise slices and subtly detune rather than repeat identically', () => {
  const {ctx, nodes} = fakeAudio();
  const mix = createWebImpactMix(ctx, 8);
  for (let i = 0; i < 8; i++) {
    assert.equal(mix.emit('player-shot').status, 'started');
  }
  const noises = nodes.filter((_, i) => i % 2 === 0);
  const tones = nodes.filter((_, i) => i % 2 === 1);
  assert.ok(noises.every((n, i) => Math.abs(n.startArgs[1] - i * 0.025) < 1e-10));
  const pitches = tones.map(n => n.frequency.value);
  assert.ok(pitches.every(hz => hz >= 49 && hz <= 55));
  assert.equal(new Set(pitches).size, 8);
  assert.ok(noises.every(n => n.startArgs[2] === 0.14));
  mix.dispose();
});

test('stolen Web voice fades for 8ms rather than hard-cutting, and cleans up', () => {
  const {ctx, nodes, gains} = fakeAudio();
  const mix = createWebImpactMix(ctx, 1);
  assert.equal(mix.emit('step').status, 'started');
  const priorNoise = nodes[0];
  const priorTone = nodes[1];
  const priorGain = gains.at(-1);
  assert.equal(mix.emit('player-shot').status, 'started');
  assert.equal(mix.getActiveVoices(), 1);
  assert.deepEqual(priorNoise.stopArgs, [ctx.currentTime + 0.008]);
  assert.deepEqual(priorTone.stopArgs, [ctx.currentTime + 0.008]);
  assert.equal(priorGain.gain.value, 0);
  priorNoise.onended();
  priorTone.onended();
  assert.equal(mix.getActiveVoices(), 1);
  mix.dispose();
});
