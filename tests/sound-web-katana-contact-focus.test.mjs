import assert from 'node:assert/strict';
import test from 'node:test';
import {createWebImpactMix} from '../src/sound/web-impact-mix.js';

function audioFixture() {
  const sources = [];
  const param = (value = 0) => ({
    value,
    setValueAtTime(next) { this.value = next; },
    linearRampToValueAtTime(next) { this.value = next; },
    exponentialRampToValueAtTime(next) { this.value = next; },
    setTargetAtTime(next) { this.value = next; },
    cancelScheduledValues() {},
  });
  const base = () => ({connect() {}, disconnect() {}});
  const source = () => {
    const node = {...base(), frequency: param(), stoppedAt: null,
      start() {}, stop(at) { this.stoppedAt = at ?? 0; }};
    sources.push(node);
    return node;
  };
  const ctx = {
    state: 'running', currentTime: 4, sampleRate: 48000, destination: base(),
    createGain: () => ({...base(), gain: param()}),
    createDynamicsCompressor: () => ({
      ...base(), threshold: param(), ratio: param(), attack: param(), release: param(),
    }),
    createBuffer: (_channels, count) => ({getChannelData: () => new Float32Array(count)}),
    createBufferSource: source, createOscillator: source,
    createBiquadFilter: () => ({...base(), frequency: param()}),
  };
  return {ctx, sources};
}

test('Dojo confirmed katana contact fades the same-frame synthetic swing, but a whiff remains', () => {
  const {ctx, sources} = audioFixture();
  const mix = createWebImpactMix(ctx, 8);
  // The real main.js Dojo path invokes itemCue(swing) then itemCue(slice)
  // synchronously after an accepted findMeleeTarget / killEnemy result.
  assert.equal(mix.emit('katana-swing').status, 'started');
  assert.equal(sources.length, 2);
  assert.equal(sources[0].stoppedAt, null);
  assert.equal(mix.emit('katana').status, 'started');
  assert.equal(sources.length, 4); // No new playback sources or voice budget.
  assert.equal(sources[0].stoppedAt, 4.008);
  assert.equal(sources[1].stoppedAt, 4.008);
  assert.equal(sources[2].stoppedAt, null);
  assert.equal(mix.getActiveVoices(), 1); // Contact remains the active voice.
  mix.dispose();

  const miss = audioFixture();
  const whiffMix = createWebImpactMix(miss.ctx, 8);
  assert.equal(whiffMix.emit('katana-swing').status, 'started');
  assert.equal(miss.sources[0].stoppedAt, null);
  // No earlier swing is cancelled by an unrelated delayed contact.
  miss.ctx.currentTime += 0.1;
  assert.equal(whiffMix.emit('katana').status, 'started');
  assert.equal(miss.sources[0].stoppedAt, null);
  assert.equal(whiffMix.getActiveVoices(), 2);
  whiffMix.dispose();
});
