import assert from 'node:assert/strict';
import test from 'node:test';
import {createWebImpactMix} from '../src/sound/web-impact-mix.js';

function fakeAudio(state = 'running') {
  const nodes = [];
  const gains = [];
  const filters = [];
  const delays = [];
  const param = (value = 0) => ({value,
    setValueAtTime(v) { this.value = v; },
    exponentialRampToValueAtTime(v) { this.value = v; },
    linearRampToValueAtTime(v) { this.value = v; },
    cancelScheduledValues() {}, setTargetAtTime(v) { this.value = v; }});
  const base = () => ({connections: [], connect(dst) { this.connections.push(dst); return dst; },
    disconnect() { this.disconnected = true; }});
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
    createDelay: () => { const n = {...base(), delayTime: param()}; delays.push(n); return n; },
    createBiquadFilter: () => { const n = {...base(), frequency: param()}; filters.push(n); return n; },
    createPanner: () => ({...base(), positionX: param(), positionY: param(),
      positionZ: param()}),
  };
  return {ctx, nodes, gains, filters, delays};
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
  const priorGain = gains.at(-3); // voice output, before burst and oscillator body
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

test('Web HRTF emitters soften with distance and follow the active listener', () => {
  const {ctx, filters} = fakeAudio();
  ctx.listener = {positionX: {value: 0}, positionY: {value: 0}, positionZ: {value: 0}};
  const mix = createWebImpactMix(ctx);
  assert.equal(mix.emit('enemy-shot', {position: {x: 1, y: 0, z: 0}}).spatial, true);
  assert.equal(mix.emit('enemy-shot', {position: {x: 50, y: 0, z: 0}}).spatial, true);
  // The shared fixed 2450Hz room-return filter is not a positional filter.
  const lowpasses = filters.filter(node => node.type === 'lowpass' && node.frequency.value !== 2450);
  assert.equal(lowpasses.length, 2);
  assert.ok(lowpasses[0].frequency.value > lowpasses[1].frequency.value);
  assert.ok(lowpasses[1].frequency.value >= 1200);
  ctx.listener.positionX.value = 49;
  mix.emit('enemy-shot', {position: {x: 50, y: 0, z: 0}});
  assert.equal(filters.filter(node => node.type === 'lowpass' && node.frequency.value !== 2450)[2].frequency.value,
    lowpasses[0].frequency.value);
  mix.emit('enemy-shot'); // Non-positional cue has no extra coloration.
  assert.equal(filters.filter(node => node.type === 'lowpass' && node.frequency.value !== 2450).length, 3);
  mix.dispose();

  const oldBrowser = fakeAudio();
  const oldMix = createWebImpactMix(oldBrowser.ctx);
  assert.equal(oldMix.emit('enemy-shot', {position: {x: 50, y: 0, z: 0}}).status, 'started');
  assert.equal(oldBrowser.filters.filter(node => node.type === 'lowpass' && node.frequency.value !== 2450).length, 0);
  oldMix.dispose();
});

test('Web room slapback is a shared, filtered combat send and does not echo footsteps', () => {
  const {ctx, nodes, gains, filters, delays} = fakeAudio();
  const mix = createWebImpactMix(ctx, 2);
  assert.equal(delays.length, 1);
  assert.equal(delays[0].delayTime.value, 0.09);
  const roomTone = filters.find(n => n.type === 'lowpass' && n.frequency.value === 2450);
  assert.ok(roomTone);
  const [master, weapons, impacts, steps, ambience, send, wet] = gains;
  assert.equal(send.gain.value, 0.34);
  assert.equal(wet.gain.value, 0.34);
  assert.ok(weapons.connections.includes(send));
  assert.ok(impacts.connections.includes(send));
  assert.ok(!steps.connections.includes(send));
  assert.ok(!ambience.connections.includes(send));
  assert.ok(send.connections.includes(delays[0]));
  assert.ok(delays[0].connections.includes(roomTone));
  assert.ok(roomTone.connections.includes(wet));
  assert.equal(mix.emit('player-shot').status, 'started');
  assert.equal(mix.emit('shatter').status, 'started');
  assert.equal(mix.emit('step').status, 'blocked'); // Priority cap unchanged.
  assert.equal(delays.length, 1); // No per-event delay allocations.
  assert.equal(mix.getActiveVoices(), 2);
  mix.dispose();
  assert.equal(delays[0].disconnected, true);
  assert.equal(send.disconnected, true);
  assert.equal(wet.disconnected, true);
  assert.equal(master.disconnected, true);
  assert.ok(nodes.length >= 4);
});


test('Web combat hits add a bright attack without extra voices or coloring footsteps', () => {
  const {ctx, nodes, filters, gains} = fakeAudio();
  const mix = createWebImpactMix(ctx, 3);
  assert.equal(mix.emit('player-shot').status, 'started');
  assert.equal(nodes.length, 2); // Same two Web sources: noise and pitched body.
  assert.equal(nodes[0].connections.length, 2); // Burst plus short crack.
  const crack = filters.find(f => f.type === 'highpass' && f.frequency.value > 2500);
  assert.ok(crack);
  const crackGain = gains.find(g => crack.connections.includes(g));
  assert.ok(crackGain);
  assert.equal(crackGain.gain.value, 0.0001); // Exponential 22ms decay programmed.

  const filterCount = filters.length;
  assert.equal(mix.emit('step').status, 'started');
  assert.equal(nodes[2].connections.length, 1); // No brittle crack on footsteps.
  assert.equal(filters.length, filterCount + 1); // Only its old tonal filter.

  assert.equal(mix.emit('katana').status, 'started');
  assert.equal(nodes[4].connections.length, 2);
  assert.ok(filters.some(f => f.type === 'bandpass')); // Distinct steel attack.
  assert.equal(mix.getActiveVoices(), 3);
  mix.dispose();
});

test('a Web landing thud routes through footsteps, not room reflections or combat priority', () => {
  const {ctx, nodes, gains, filters} = fakeAudio();
  const mix = createWebImpactMix(ctx, 2);
  const result = mix.emit('landing', {position: {x: 0, y: 1, z: 0}});
  assert.equal(result.status, 'started');
  assert.equal(nodes.length, 2); // No extra sources or voice pressure.
  const footsteps = gains[3];
  const output = gains[7];
  // Spatialized landing goes from the voice output to HRTF, then the step bus.
  const panner = output.connections[0];
  assert.ok(panner.connections.includes(footsteps));
  assert.ok(!footsteps.connections.includes(gains[5])); // No synthetic room echo.
  assert.ok(filters.some(filter => filter.type === 'lowpass' && filter.frequency.value === 650));
  assert.ok(filters.some(filter => filter.type === 'highpass' && filter.frequency.value === 1800));
  assert.equal(mix.emit('player-shot').status, 'started');
  assert.equal(mix.emit('enemy-shot').status, 'started');
  assert.equal(mix.emit('landing').status, 'blocked'); // Combat owns both live voices.
  mix.dispose();
});

test('Web-only player damage impact is local, punchy and survives a saturated gunfight', () => {
  const {ctx, nodes, gains, filters} = fakeAudio();
  const mix = createWebImpactMix(ctx, 1);
  assert.equal(mix.emit('step').status, 'started');
  const result = mix.emit('player-hit');
  assert.deepEqual(result, {status: 'started', source: 'web-original-synthesis',
    at: 2.25, spatial: false});
  assert.equal(nodes[0].stopped, true); // Player damage has greater priority than steps.
  assert.equal(mix.getActiveVoices(), 1);
  assert.ok(gains.some(node => node.connections.includes(gains[2]))); // Impact bus.
  assert.ok(filters.some(filter => filter.type === 'lowpass' && filter.frequency.value === 680));
  assert.ok(filters.some(filter => filter.type === 'highpass' && filter.frequency.value === 2600));
  assert.equal(mix.emit('player-shot').status, 'blocked'); // Damage cannot be stolen by shots.
  assert.equal(nodes.length, 4); // Two sources per voice, no extra sub-bass oscillator.
  mix.dispose();
});

test('live shatter gains two glass rings without stealing more voices or leaving zombie sources', () => {
  const {ctx, nodes} = fakeAudio();
  const mix = createWebImpactMix(ctx, 1);
  assert.equal(mix.emit('shatter', {position: {x: 2, y: 1, z: 0}}).status, 'started');
  assert.equal(nodes.length, 4); // Existing noise/body + two Web-original inharmonic partials.
  assert.equal(nodes[2].type, 'sine');
  assert.equal(nodes[3].type, 'sine');
  assert.notEqual(nodes[2].frequency.value, nodes[3].frequency.value);
  assert.deepEqual(nodes.slice(2, 4).map(node => node.stopArgs), [
    [ctx.currentTime + 0.36], [ctx.currentTime + 0.23],
  ]);
  assert.equal(mix.getActiveVoices(), 1);
  assert.equal(mix.emit('step').status, 'blocked'); // Only one voice, despite four sources.

  const finished = nodes.slice(0, 4).map(node => node.onended);
  assert.equal(mix.emit('player-hit').status, 'started'); // Damage preempts glass.
  assert.equal(nodes.length, 6); // Damage still has just the original two sources.
  for (const node of nodes.slice(0, 4)) {
    assert.deepEqual(node.stopArgs, [ctx.currentTime + 0.008]);
  }
  for (const callback of finished) callback();
  assert.equal(mix.getActiveVoices(), 1);
  assert.ok(nodes.slice(0, 4).every(node => node.disconnected));
  mix.dispose();
  assert.equal(mix.getActiveVoices(), 0);
});
