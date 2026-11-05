import assert from 'node:assert/strict';
import test from 'node:test';
import {createWebImpactMix} from '../src/sound/web-impact-mix.js';

// Minimal WebAudio stand-in: no waveform or audibility assertion.
function fakeAudio() {
  const sources = [];
  const param = (value = 0) => ({
    value,
    setValueAtTime(v) { this.value = v; },
    exponentialRampToValueAtTime(v) { this.value = v; },
    linearRampToValueAtTime(v) { this.value = v; },
    setTargetAtTime(v) { this.value = v; },
    cancelScheduledValues() {},
  });
  const node = () => ({
    connect(other) { return other; },
    disconnect() {},
  });
  const source = () => {
    const src = {...node(), frequency: param(), start() {},
      stop() { this.stopped = true; }};
    sources.push(src);
    return src;
  };
  const ctx = {
    state: 'running', currentTime: 2, sampleRate: 8000,
    destination: node(),
    createGain: () => ({...node(), gain: param()}),
    createDynamicsCompressor: () => ({
      ...node(), threshold: param(), ratio: param(), attack: param(), release: param(),
    }),
    createBuffer: (_channels, length) => ({getChannelData: () => new Float32Array(length)}),
    createBufferSource: source,
    createOscillator: source,
    createBiquadFilter: () => ({...node(), frequency: param()}),
  };
  return {ctx, sources};
}

test('Web F/E audio preempts an enemy volley, but not player-shot or player-hit', () => {
  const volley = fakeAudio();
  const mix = createWebImpactMix(volley.ctx, 2);
  assert.equal(mix.emit('enemy-shot').status, 'started');
  assert.equal(mix.emit('enemy-shot').status, 'started');
  assert.equal(mix.emit('pickup').status, 'started');
  assert.equal(volley.sources[0].stopped, true);
  assert.equal(mix.emit('throw').status, 'started');
  assert.equal(volley.sources[2].stopped, true);
  assert.equal(mix.getActiveVoices(), 2);
  assert.equal(mix.emit('step').status, 'blocked');
  mix.dispose();

  const critical = fakeAudio();
  const high = createWebImpactMix(critical.ctx, 2);
  high.emit('player-shot');
  high.emit('player-hit');
  const before = critical.sources.length;
  assert.equal(high.emit('pickup').status, 'blocked');
  assert.equal(high.emit('throw').status, 'blocked');
  assert.equal(critical.sources.length, before);
  high.dispose();
});
