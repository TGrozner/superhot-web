import assert from 'node:assert/strict';
import test from 'node:test';
import {createWebImpactMix} from '../src/sound/web-impact-mix.js';

// WebAudio scheduling test only: it cannot establish human audibility.
function fakeAudio() {
  const sources = [];
  const filters = [];
  const gains = [];
  const param = (value = 0) => ({
    value, events: [],
    setValueAtTime(v, t) { this.events.push(['set', v, t]); this.value = v; },
    linearRampToValueAtTime(v, t) { this.events.push(['linear', v, t]); this.value = v; },
    exponentialRampToValueAtTime(v, t) { this.events.push(['exponential', v, t]); this.value = v; },
    setTargetAtTime(v) { this.value = v; },
    cancelScheduledValues() {},
  });
  const base = () => ({
    connections: [], connect(to) { this.connections.push(to); return to; }, disconnect() {},
  });
  const oscillator = () => {
    const node = {...base(), frequency: param(), start() {}, stop() {}};
    sources.push(node);
    return node;
  };
  const ctx = {
    state: 'running', currentTime: 5, sampleRate: 48000, destination: base(),
    createGain() { const n = {...base(), gain: param()}; gains.push(n); return n; },
    createBiquadFilter() { const n = {...base(), frequency: param()}; filters.push(n); return n; },
    createBuffer: (_count, length) => ({getChannelData: () => new Float32Array(length)}),
    createBufferSource: oscillator, createOscillator: oscillator,
    createDynamicsCompressor: () => ({...base(), threshold: param(),
      ratio: param(), attack: param(), release: param()}),
  };
  return {ctx, sources, filters, gains};
}

test('Web player shot adds a short low muzzle punch using its existing noise voice', () => {
  const {ctx, sources, filters, gains} = fakeAudio();
  const mix = createWebImpactMix(ctx, 4);
  assert.equal(mix.emit('player-shot').status, 'started');
  assert.equal(sources.length, 2); // Noise + pitched body: no new oscillator or voice.
  const low = filters.find(f => f.type === 'lowpass' && f.frequency.value === 430);
  assert.ok(low);
  assert.ok(sources[0].connections.includes(low));
  const body = gains.find(g => low.connections.includes(g));
  assert.ok(body);
  assert.ok(body.connections.some(n => n.connections?.length)); // Existing output chain.
  assert.deepEqual(body.gain.events, [
    ['set', 0.0001, 5],
    ['linear', 0.62 * 0.35, 5.009],
    ['exponential', 0.0001, 5.13],
  ]);
  const before = filters.filter(f => f.type === 'lowpass' && f.frequency.value === 430).length;
  assert.equal(mix.emit('enemy-shot').status, 'started');
  assert.equal(filters.filter(f => f.type === 'lowpass' && f.frequency.value === 430).length, before);
  assert.equal(mix.getActiveVoices(), 2);
  mix.dispose();
});
