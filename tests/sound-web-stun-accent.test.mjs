import assert from 'node:assert/strict';
import test from 'node:test';
import {createWebImpactMix} from '../src/sound/web-impact-mix.js';

// Web-original synthesis scheduling. This mock does not prove speaker audibility.
function fakeContext() {
  const nodes = [];
  const param = (value = 0) => ({value,
    setValueAtTime(v) { this.value = v; },
    exponentialRampToValueAtTime(v) { this.value = v; },
    linearRampToValueAtTime(v) { this.value = v; },
    cancelScheduledValues() {},
    setTargetAtTime(v) { this.value = v; },
  });
  const base = () => ({connect() {}, disconnect() {}});
  const source = () => {
    const n = {...base(), frequency: param(),
      start() {}, stop() { n.stopped = true; }};
    nodes.push(n);
    return n;
  };
  return {
    nodes,
    context: {
      currentTime: 2, state: 'running', sampleRate: 8000,
      destination: base(),
      listener: {positionX: param(), positionY: param(), positionZ: param()},
      createGain: () => ({...base(), gain: param()}),
      createDynamicsCompressor: () => ({...base(), threshold: param(),
        ratio: param(), attack: param(), release: param()}),
      createBuffer: (_channels, length) => ({getChannelData: () => new Float32Array(length)}),
      createBufferSource: source, createOscillator: source,
      createDelay: () => ({...base(), delayTime: param()}),
      createBiquadFilter: () => ({...base(), frequency: param()}),
      createPanner: () => ({...base(), positionX: param(), positionY: param(),
        positionZ: param()}),
    },
  };
}

test('stun Web accent spatializes and takes priority over a step without added audio files', () => {
  const {context, nodes} = fakeContext();
  const mix = createWebImpactMix(context, 1);
  assert.equal(mix.emit('step').status, 'started');
  const receipt = mix.emit('stun', {position: {x: 1, y: 2, z: 3}});
  assert.deepEqual(receipt, {status: 'started', source: 'web-original-synthesis',
    at: 2, spatial: true});
  assert.equal(nodes.length, 4, 'each cue uses the existing noise + tone sources only');
  assert.equal(nodes[0].stopped, true, 'stun preempts low-priority footstep');
  assert.equal(mix.getActiveVoices(), 1);
  mix.dispose();
});
