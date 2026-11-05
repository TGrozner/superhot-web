import assert from 'node:assert/strict';
import test from 'node:test';
import {createWebImpactMix} from '../src/sound/web-impact-mix.js';

function fakeAudioContext() {
  const nodes = [];
  const param = (value = 0) => ({
    value, automation: [],
    setValueAtTime(v, at) { this.automation.push(['set', v, at]); this.value = v; },
    exponentialRampToValueAtTime(v, at) { this.automation.push(['exponential', v, at]); this.value = v; },
    linearRampToValueAtTime(v, at) { this.automation.push(['linear', v, at]); this.value = v; },
    cancelScheduledValues() {},
    setTargetAtTime(v) { this.value = v; },
  });
  const base = () => ({
    connect() {}, disconnect() { this.disconnected = true; },
  });
  const source = () => {
    const node = {...base(), frequency: param(), start() {}, stop() {}};
    nodes.push(node);
    return node;
  };
  const ctx = {
    state: 'running', currentTime: 4, sampleRate: 48000, destination: base(),
    createGain: () => ({...base(), gain: param()}),
    createDynamicsCompressor: () => ({...base(), threshold: param(), ratio: param(),
      attack: param(), release: param()}),
    createBuffer: (_channels, length) => ({getChannelData: () => new Float32Array(length)}),
    createBufferSource: source,
    createOscillator: source,
    createBiquadFilter: () => ({...base(), frequency: param()}),
    createPanner: () => ({...base(), positionX: param(), positionY: param(), positionZ: param()}),
  };
  return {ctx, nodes};
}

test('confirmed Web katana contact rings distinctly from a missed swing without a new voice', () => {
  const {ctx, nodes} = fakeAudioContext();
  const mix = createWebImpactMix(ctx);
  const hit = mix.emit('katana', {position: {x: 1, y: 2, z: 3}});
  assert.equal(hit.status, 'started'); // Scheduled, NOT proof of audible output.
  assert.equal(hit.spatial, true);
  assert.equal(nodes.length, 2); // Existing noise + pitched body, no new source.
  const contactTone = nodes[1];
  assert.equal(contactTone.type, 'sine');
  const firstPitch = 1 - 3.5 * 0.012;
  assert.deepEqual(contactTone.frequency.automation, [
    ['set', 1850 * firstPitch, 4],
    ['exponential', 1340 * firstPitch, 4.07],
    ['exponential', 610 * firstPitch, 4.20],
  ]);

  assert.equal(mix.emit('katana-swing').status, 'started');
  assert.equal(nodes.length, 4);
  assert.equal(nodes[3].type, 'triangle'); // Missed swing remains an air sweep.
  assert.equal(mix.getActiveVoices(), 2);
  for (const node of nodes) node.onended();
  assert.equal(mix.getActiveVoices(), 0);
  mix.dispose();
});
