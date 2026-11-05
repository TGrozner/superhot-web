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


test('Web shatter chain rises on rapid confirmed cues and resets after a gap', () => {
  const {ctx, nodes} = fakeAudio();
  const mix = createWebImpactMix(ctx);
  for (const at of [2.25, 2.65, 3.25, 5.2]) {
    ctx.currentTime = at;
    assert.equal(mix.emit('shatter').status, 'started');
  }
  // Every shatter still has exactly two oscillator rings, plus noise + body.
  assert.equal(nodes.length, 16);
  const rings = nodes.filter(node => node.type === 'sine');
  assert.equal(rings.length, 8);
  const normalizedPitch = (index) => rings[index * 2].frequency.value /
    (1 + (index - 3.5) * 0.012);
  const base = 1540 * 0.985;
  assert.ok(Math.abs(normalizedPitch(0) - base) < 1e-7);
  assert.ok(Math.abs(normalizedPitch(1) - base * 1.085) < 1e-7);
  assert.ok(Math.abs(normalizedPitch(2) - base * 1.17) < 1e-7);
  assert.ok(Math.abs(normalizedPitch(3) - base) < 1e-7);
  assert.ok(Math.abs(rings[1].startArgs[0] - 2.297) < 1e-9);
  assert.ok(Math.abs(rings[1].stopArgs[0] - 2.527) < 1e-9);
  mix.dispose();
});

test('Web kill shatter adds a bass debris pulse without another audio source or voice', () => {
  const {ctx, nodes, filters, gains} = fakeAudio();
  const mix = createWebImpactMix(ctx, 2);
  assert.equal(mix.emit('shatter').status, 'started');
  assert.equal(nodes.length, 4); // Existing noise + pitched body + two glass rings.
  const debris = filters.find(filter => filter.type === 'lowpass' && filter.frequency.value === 390);
  assert.ok(debris);
  assert.ok(nodes[0].connections.includes(debris)); // Shared shatter noise source.
  const pulse = gains.find(gain => debris.connections.includes(gain));
  assert.ok(pulse);
  assert.ok(pulse.connections.includes(gains[7])); // Same shatter output / bus.
  assert.equal(pulse.gain.value, 0.0001); // The pulse has a scheduled fade to silence.
  assert.equal(mix.getActiveVoices(), 1);
  mix.emit('player-shot');
  assert.equal(filters.filter(filter => filter.type === 'lowpass' && filter.frequency.value === 390).length, 1);
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
  const priorGain = gains.find(gain => gain.connections.includes(gains[3])); // Shared step output
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

test('Web Dojo room sends two filtered early reflections without echoing footsteps', () => {
  const {ctx, nodes, gains, filters, delays} = fakeAudio();
  const mix = createWebImpactMix(ctx, 2);
  assert.equal(delays.length, 2);
  assert.equal(delays[0].delayTime.value, 0.09);
  assert.equal(delays[1].delayTime.value, 0.075);
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
  const lateTone = filters.find(n => n.type === 'bandpass' && n.frequency.value === 1350);
  assert.ok(lateTone);
  assert.ok(roomTone.connections.includes(delays[1]));
  assert.ok(delays[1].connections.includes(lateTone));
  assert.ok(lateTone.connections.includes(wet));
  assert.equal(mix.emit('player-shot').status, 'started');
  assert.equal(mix.emit('shatter').status, 'started');
  assert.equal(mix.emit('step').status, 'blocked'); // Priority cap unchanged.
  assert.equal(delays.length, 2); // No per-event delay allocations.
  assert.equal(mix.getActiveVoices(), 2);
  mix.dispose();
  assert.equal(delays[0].disconnected, true);
  assert.equal(delays[1].disconnected, true);
  assert.equal(lateTone.disconnected, true);
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
  assert.equal(nodes[0].connections.length, 4); // Burst, crack, delayed action and low muzzle punch.
  const crack = filters.find(f => f.type === 'highpass' && f.frequency.value > 2500);
  assert.ok(crack);
  const crackGain = gains.find(g => crack.connections.includes(g));
  assert.ok(crackGain);
  assert.equal(crackGain.gain.value, 0.0001); // Exponential 22ms decay programmed.

  const filterCount = filters.length;
  assert.equal(mix.emit('step').status, 'started');
  assert.equal(nodes[2].connections.length, 2); // Old muted thud + new dry shoe snap.
  assert.equal(filters.length, filterCount + 2); // Tonal filter plus the new 1650Hz scuff.
  assert.ok(filters.some(filter => filter.type === 'highpass' && filter.frequency.value === 1650));

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
  assert.equal(nodes.length, 5); // Step 2 + damage 3; ear ring stays in one voice.
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
    [ctx.currentTime + 0.36], [ctx.currentTime + 0.047 + 0.23],
  ]);
  assert.equal(mix.getActiveVoices(), 1);
  assert.equal(mix.emit('step').status, 'blocked'); // Only one voice, despite four sources.

  const finished = nodes.slice(0, 4).map(node => node.onended);
  assert.equal(mix.emit('player-hit').status, 'started'); // Damage preempts glass.
  assert.equal(nodes.length, 7); // Shatter 4 + damage 3; voice cap remains 1.
  for (const node of nodes.slice(0, 4)) {
    assert.deepEqual(node.stopArgs, [ctx.currentTime + 0.008]);
  }
  for (const callback of finished) callback();
  assert.equal(mix.getActiveVoices(), 1);
  assert.ok(nodes.slice(0, 4).every(node => node.disconnected));
  mix.dispose();
  assert.equal(mix.getActiveVoices(), 0);
});

test('Web player shot layers a delayed slide action independently of enemy muzzle pressure', () => {
  const {ctx, nodes, filters, gains} = fakeAudio();
  const ramps = [];
  const createGain = ctx.createGain;
  ctx.createGain = () => {
    const node = createGain();
    const original = node.gain.linearRampToValueAtTime;
    node.gain.linearRampToValueAtTime = function(value, at) {
      ramps.push([node, value, at]);
      return original.call(this, value, at);
    };
    return node;
  };
  const mix = createWebImpactMix(ctx);
  assert.equal(mix.emit('player-shot').status, 'started');
  assert.equal(nodes.length, 2);
  assert.equal(nodes[0].connections.length, 4); // Includes Web low muzzle punch.
  const tone = filters.find(f => f.type === 'bandpass' && f.frequency.value === 2600);
  assert.ok(tone);
  const action = gains.find(g => tone.connections.includes(g));
  assert.ok(action);
  assert.ok(ramps.some(([node, value, at]) =>
    node === action && Math.abs(value - 0.62 * 0.32) < 1e-12 &&
    Math.abs(at - (ctx.currentTime + 0.054)) < 1e-12));
  assert.equal(mix.emit('enemy-shot').status, 'started');
  assert.equal(nodes.length, 4);
  assert.equal(nodes[2].connections.length, 3); // Enemy burst, crack and its own pressure layer.
  assert.equal(filters.filter(f => f.type === 'bandpass').length, 3); // Shared room return + player slide + enemy pressure.
  mix.dispose();
});

test('Web-original thrown weapon has a descending air swish without extra voices', () => {
  const {ctx, nodes, gains, filters} = fakeAudio();
  const ramps = [];
  const originalFilter = ctx.createBiquadFilter;
  ctx.createBiquadFilter = () => {
    const filter = originalFilter();
    const originalRamp = filter.frequency.exponentialRampToValueAtTime;
    filter.frequency.exponentialRampToValueAtTime = function(value, time) {
      ramps.push({filter, value, time});
      return originalRamp.call(this, value, time);
    };
    return filter;
  };
  const mix = createWebImpactMix(ctx);
  assert.equal(mix.emit('throw', {position: {x: 2, y: 1, z: 0}}).status, 'started');
  assert.equal(nodes.length, 2); // Existing noise/body only; no extra sources.
  assert.equal(nodes[0].connections.length, 2); // Old burst + airy release.
  const swish = filters.find(f => f.type === 'bandpass' &&
    ramps.some(e => e.filter === f && e.value === 800));
  assert.ok(swish);
  assert.ok(ramps.some(e => e.filter === swish && e.value === 800 &&
    Math.abs(e.time - (ctx.currentTime + 0.17)) < 1e-12));
  const air = gains.find(g => swish.connections.includes(g));
  assert.ok(air);
  assert.equal(air.connections.length, 1); // Shared output and spatial path.
  assert.equal(mix.emit('pickup').status, 'started');
  assert.equal(nodes.length, 4);
  assert.equal(nodes[2].connections.length, 2); // Base burst plus new pickup latch.
  assert.equal(filters.filter(f => f.type === 'bandpass').length, 3); // Shared room return + throw swish + pickup latch.
  mix.dispose();
});

test('pickup latch adds two timed clicks within the existing 80ms noise voice', () => {
  const {ctx, nodes, filters, gains} = fakeAudio();
  const rises = [];
  const createGain = ctx.createGain;
  ctx.createGain = () => {
    const node = createGain();
    const ramp = node.gain.linearRampToValueAtTime;
    node.gain.linearRampToValueAtTime = function(value, at) {
      rises.push({node, value, at});
      return ramp.call(this, value, at);
    };
    return node;
  };
  const mix = createWebImpactMix(ctx, 1);
  const result = mix.emit('pickup');
  assert.equal(result.status, 'started');
  assert.equal(result.source, 'web-original-synthesis');
  assert.equal(nodes.length, 2, 'no extra playback sources, voices or clip assets');
  assert.deepEqual(nodes[0].startArgs, [ctx.currentTime, 0, 0.08]);
  const band = filters.find(node => node.type === 'bandpass' && node.frequency.value === 2300);
  assert.ok(band);
  assert.ok(nodes[0].connections.includes(band), 'latch reuses the existing noise source');
  const latch = gains.find(node => band.connections.includes(node));
  assert.ok(latch);
  assert.deepEqual(rises.filter(entry => entry.node === latch).map(entry => entry.at),
    [ctx.currentTime + 0.004, ctx.currentTime + 0.052]);
  assert.equal(mix.getActiveVoices(), 1);
  mix.dispose();
});

test('katana miss has a Web-only air sweep distinct from the blade-contact cue', () => {
  const {ctx, nodes, gains, filters} = fakeAudio();
  const sweeps = [];
  const createFilter = ctx.createBiquadFilter;
  ctx.createBiquadFilter = () => {
    const node = createFilter();
    const ramp = node.frequency.exponentialRampToValueAtTime;
    node.frequency.exponentialRampToValueAtTime = function(value, at) {
      sweeps.push({node, value, at});
      return ramp.call(this, value, at);
    };
    return node;
  };
  const mix = createWebImpactMix(ctx, 2);
  const result = mix.emit('katana-swing', {position: {x: 0, y: 1, z: 0}});
  assert.deepEqual(result, {status: 'started', source: 'web-original-synthesis',
    at: ctx.currentTime, spatial: true}); // Scheduling, NOT audible proof.
  assert.equal(nodes.length, 2); // Same existing noise+oscillator, one voice.
  assert.equal(nodes[0].connections.length, 2); // Dry burst plus blade air.
  const sweep = filters.find(node => node.type === 'bandpass' &&
    sweeps.some(entry => entry.node === node && entry.value === 850 &&
      Math.abs(entry.at - (ctx.currentTime + 0.24)) < 1e-12));
  assert.ok(sweep);
  const air = gains.find(node => sweep.connections.includes(node));
  assert.ok(air);
  assert.ok(air.connections.includes(gains[7])); // Existing spatialized output.
  assert.equal(mix.emit('katana').status, 'started'); // Contact is independent.
  assert.equal(nodes.length, 4);
  assert.equal(mix.emit('step').status, 'blocked'); // Priority budget unchanged.
  assert.equal(mix.getActiveVoices(), 2);
  mix.dispose();
});

test('damage adds a short Web ear-ring tail without stealing an extra voice', () => {
  const {ctx, nodes} = fakeAudio();
  const mix = createWebImpactMix(ctx, 1);
  assert.equal(mix.emit('player-hit').status, 'started');
  assert.equal(nodes.length, 3); // Existing noise/body plus the new Web-only ring.
  const [noise, body, ring] = nodes;
  assert.equal(ring.type, 'sine');
  assert.ok(Math.abs(ring.stopArgs[0] - (ctx.currentTime + 0.42)) < 1e-9);
  assert.equal(mix.getActiveVoices(), 1);
  assert.equal(mix.emit('enemy-shot').status, 'blocked'); // Keep high-priority damage feedback.
  assert.equal(nodes.length, 3);
  noise.onended();
  body.onended();
  assert.equal(mix.getActiveVoices(), 1); // The tail still owns this one voice.
  ring.onended();
  assert.equal(mix.getActiveVoices(), 0);
  assert.equal(mix.emit('enemy-shot').status, 'started');
  assert.equal(nodes.length, 5); // An ordinary shot still uses only two sources.
  mix.dispose();
});

test('Web unarmed punch distinguishes air swing from a contact crunch in one voice each', () => {
  const {ctx, nodes, filters, gains} = fakeAudio();
  const mix = createWebImpactMix(ctx, 2);
  const hand = {x: 0.2, y: 1.4, z: -0.4};
  const swing = mix.emit('punch-swing', {position: hand});
  assert.deepEqual(swing, {status: 'started', source: 'web-original-synthesis',
    at: ctx.currentTime, spatial: true}); // Scheduling, not audible output.
  assert.equal(nodes.length, 2);
  assert.equal(nodes[0].connections.length, 2); // Existing burst + Web-only air sweep.
  assert.ok(filters.some(filter => filter.type === 'bandpass' && filter.frequency.value === 740));
  const contact = mix.emit('punch-contact', {position: hand});
  assert.equal(contact.status, 'started');
  assert.equal(nodes.length, 4); // Contact: just the existing noise + pitched body.
  assert.ok(filters.some(filter => filter.type === 'lowpass' && filter.frequency.value === 850));
  assert.ok(filters.some(filter => filter.type === 'highpass' && filter.frequency.value === 2400));
  const impactBus = gains[2];
  assert.ok(gains.some(output => output.connections.some(node =>
    node?.connections?.includes(impactBus)))); // HRTF contact -> impacts, not footsteps.
  assert.equal(mix.emit('step').status, 'blocked'); // Combat preserves the voice budget.
  assert.equal(mix.getActiveVoices(), 2);
  mix.dispose();
  assert.equal(mix.getActiveVoices(), 0);
});

test('active enemy shots carry a spatial Web-only muzzle pressure layer without another voice', () => {
  const {ctx, nodes, gains, filters} = fakeAudio();
  const ramps = [];
  const createGain = ctx.createGain;
  ctx.createGain = () => {
    const gain = createGain();
    const original = gain.gain.linearRampToValueAtTime;
    gain.gain.linearRampToValueAtTime = function(value, time) {
      ramps.push({gain, value, time});
      return original.call(this, value, time);
    };
    return gain;
  };
  const mix = createWebImpactMix(ctx, 2);
  assert.equal(mix.emit('enemy-shot', {position: {x: 4, y: 1, z: -2}}).spatial, true);
  assert.equal(nodes.length, 2); // One noise buffer and one oscillator, as before.
  assert.equal(nodes[0].connections.length, 3); // Burst, crack and muzzle-pressure coloration.
  const lowBand = filters.find(f => f.type === 'bandpass' && f.frequency.value === 720);
  assert.ok(lowBand);
  const pressure = gains.find(g => lowBand.connections.includes(g));
  assert.ok(pressure);
  assert.ok(ramps.some(r => r.gain === pressure &&
    Math.abs(r.value - 0.42 * 0.45) < 1e-12 &&
    Math.abs(r.time - (ctx.currentTime + 0.018)) < 1e-12));
  assert.equal(mix.getActiveVoices(), 1);
  assert.equal(mix.emit('player-shot').status, 'started');
  assert.equal(filters.filter(f => f.type === 'bandpass' && f.frequency.value === 720).length, 1);
  assert.equal(mix.emit('step').status, 'blocked'); // Existing combat-priority cap.
  mix.dispose();
});

test('each Web combat cue releases all its transient processing nodes on source completion', () => {
  const {ctx, nodes, gains, filters} = fakeAudio();
  const mix = createWebImpactMix(ctx, 1);
  // AudioNodes must not accumulate between battles even when the voices finish.
  // This verifies a WebAudio lifecycle invariant, not audible native behavior.
  for (const cue of ['player-shot', 'enemy-shot', 'impact', 'shatter', 'player-hit',
    'katana', 'katana-swing', 'punch-swing', 'punch-contact', 'step', 'landing',
    'pickup', 'throw', 'dodge']) {
    const beforeSources = nodes.length;
    const beforeGains = gains.length;
    const beforeFilters = filters.length;
    assert.equal(mix.emit(cue).status, 'started');
    const eventSources = nodes.slice(beforeSources);
    const eventGains = gains.slice(beforeGains);
    const eventFilters = filters.slice(beforeFilters);
    assert.ok(eventSources.length >= 2, cue);
    assert.ok(eventGains.length >= 3, cue);
    assert.ok(eventFilters.length >= 1, cue);
    assert.equal(mix.getActiveVoices(), 1);
    for (const node of eventSources) node.onended();
    assert.equal(mix.getActiveVoices(), 0, cue);
    assert.ok(eventSources.every(node => node.disconnected), cue);
    assert.ok(eventGains.every(node => node.disconnected), cue);
    assert.ok(eventFilters.every(node => node.disconnected), cue);
  }
  mix.dispose();
});

test('Web gunfire and confirmed impacts temporarily duck footsteps, not native audio', () => {
  const {ctx, gains} = fakeAudio();
  const mix = createWebImpactMix(ctx);
  const footstepBus = gains[3];
  assert.equal(footstepBus.gain.value, 0.3);
  const cancels = [];
  const automation = [];
  footstepBus.gain.cancelScheduledValues = at => cancels.push(at);
  footstepBus.gain.setTargetAtTime = (value, at, constant) => {
    automation.push({value, at, constant});
  };
  // Footfalls, swings and object handling must never sidechain themselves.
  for (const cue of ['step', 'landing', 'pickup', 'throw', 'katana-swing', 'punch-swing']) {
    assert.equal(mix.emit(cue).status, 'started');
  }
  assert.equal(cancels.length, 0);
  assert.equal(automation.length, 0);
  // Repeated combat cues restart a short duck/recovery envelope on the same bus.
  const combat = ['player-shot', 'enemy-shot', 'player-hit', 'impact', 'shatter',
    'katana', 'punch-contact'];
  for (const cue of combat) {
    assert.equal(mix.emit(cue).status, 'started');
    assert.equal(cancels.length, combat.indexOf(cue) + 1);
    assert.deepEqual(automation.slice(-2), [
      {value: 0.10, at: ctx.currentTime, constant: 0.012},
      {value: 0.3, at: ctx.currentTime + 0.14, constant: 0.18},
    ]);
  }
  assert.equal(mix.getActiveVoices(), 13);
  mix.dispose();
  assert.equal(mix.getActiveVoices(), 0);
});

test('clean dodge schedules a spatial Web-only descending zip and ducks footsteps', () => {
  const {ctx, nodes, gains, filters} = fakeAudio();
  const sweeps = [];
  const createFilter = ctx.createBiquadFilter;
  ctx.createBiquadFilter = () => {
    const filter = createFilter();
    const ramp = filter.frequency.exponentialRampToValueAtTime;
    filter.frequency.exponentialRampToValueAtTime = function(value, time) {
      sweeps.push({filter, value, time});
      return ramp.call(this, value, time);
    };
    return filter;
  };
  const mix = createWebImpactMix(ctx, 1);
  const footstepBus = gains[3];
  const duckTargets = [];
  footstepBus.gain.setTargetAtTime = (value, at, tau) => duckTargets.push({value, at, tau});
  const receipt = mix.emit('dodge', {position: {x: 1.2, y: 1.5, z: -0.2}});
  assert.deepEqual(receipt, {status: 'started', source: 'web-original-synthesis',
    at: ctx.currentTime, spatial: true}); // Scheduling, never an audition proof.
  assert.equal(nodes.length, 2); // One noise and one oscillator, one voice.
  assert.equal(mix.getActiveVoices(), 1);
  const zip = filters.find(filter => filter.type === 'bandpass' &&
    sweeps.some(entry => entry.filter === filter && entry.value === 1050 &&
      Math.abs(entry.time - (ctx.currentTime + 0.18)) < 1e-12));
  assert.ok(zip, 'Web-authored 180ms descending air zip');
  const output = gains[7];
  assert.ok(output.connections[0].connections.includes(gains[1])); // HRTF -> weapons.
  assert.ok(duckTargets.some(entry => entry.value === 0.10));
  assert.equal(mix.emit('step').status, 'blocked'); // Dodge outranks a footfall.
  mix.dispose();
  assert.equal(mix.getActiveVoices(), 0);
});

test('a confirmed Web landing has two weighted floor contacts without adding sources', () => {
  const {ctx, nodes, gains, filters} = fakeAudio();
  const pulses = [];
  const originalGain = ctx.createGain;
  ctx.createGain = () => {
    const node = originalGain();
    const ramp = node.gain.linearRampToValueAtTime;
    node.gain.linearRampToValueAtTime = function(level, at) {
      pulses.push({node, level, at});
      return ramp.call(this, level, at);
    };
    return node;
  };
  const mix = createWebImpactMix(ctx);
  assert.equal(mix.emit('landing', {position: {x: 0, y: 0, z: 0}}).status, 'started');
  assert.equal(nodes.length, 2); // Noise and oscillator as before; same one voice.
  const weightFilter = filters.find(filter => filter.type === 'lowpass' &&
    filter.frequency.value === 460);
  assert.ok(weightFilter);
  const heelToe = gains.find(gain => weightFilter.connections.includes(gain));
  assert.ok(heelToe);
  assert.ok(heelToe.connections.includes(gains[7])); // Same spatial output.
  assert.deepEqual(pulses.filter(pulse => pulse.node === heelToe).map(pulse =>
    [pulse.level, pulse.at]), [
      [0.4 * 0.36, ctx.currentTime + 0.013],
      [0.4 * 0.19, ctx.currentTime + 0.071],
    ]);
  assert.equal(mix.emit('step').status, 'started');
  assert.equal(nodes.length, 4); // Ordinary walking is not layered.
  assert.equal(filters.filter(filter => filter.type === 'lowpass' &&
    filter.frequency.value === 460).length, 1);
  mix.dispose();
  assert.equal(weightFilter.disconnected, true);
  assert.equal(heelToe.disconnected, true);
});

test('confirmed bullet wall contacts have a short spatial Web grit, not a shatter', () => {
  const {ctx, nodes, filters, gains} = fakeAudio();
  const mix = createWebImpactMix(ctx, 1);
  const footstepBus = gains[3];
  const duck = [];
  footstepBus.gain.setTargetAtTime = (value, at) => duck.push({value, at});
  const result = mix.emit('wall-impact', {position: {x: 1, y: 2, z: 3}});
  assert.deepEqual(result, {status: 'started', source: 'web-original-synthesis',
    at: ctx.currentTime, spatial: true});
  assert.equal(nodes.length, 2); // One existing noise plus one pitched body.
  assert.equal(mix.getActiveVoices(), 1);
  assert.ok(filters.some(f => f.type === 'bandpass' && f.frequency.value === 1050));
  assert.ok(gains[7].connections[0].connections.includes(gains[2])); // HRTF to impacts.
  assert.ok(duck.some(entry => entry.value === 0.10)); // Keep contact audible over steps.
  assert.equal(mix.emit('step').status, 'blocked'); // Wall hit outranks a footstep.
  for (const source of nodes) source.onended();
  assert.equal(mix.getActiveVoices(), 0);
  assert.ok(filters.every(f => f.disconnected || f.frequency.value === 2450 || f.frequency.value === 1350));
  mix.dispose();
});

test('distant spatial enemy shots keep local footsteps audible but close fire still ducks', () => {
  const {ctx, gains} = fakeAudio();
  ctx.listener = {positionX: {value: 0}, positionY: {value: 0}, positionZ: {value: 0}};
  const mix = createWebImpactMix(ctx);
  const footsteps = gains[3].gain;
  const duckTargets = [];
  const apply = footsteps.setTargetAtTime;
  footsteps.setTargetAtTime = function(value, at, duration) {
    duckTargets.push(value);
    return apply.call(this, value, at, duration);
  };

  assert.equal(mix.emit('enemy-shot', {position: {x: 30, y: 0, z: 0}}).status, 'started');
  assert.deepEqual(duckTargets, []); // Distant gunfire still plays; local steps are not masked.
  assert.equal(mix.emit('enemy-shot', {position: {x: 5, y: 0, z: 0}}).status, 'started');
  assert.deepEqual(duckTargets, [0.10, 0.3]); // Actual nearby fire retains the sidechain.

  duckTargets.length = 0;
  assert.equal(mix.emit('player-shot', {position: {x: 30, y: 0, z: 0}}).status, 'started');
  assert.deepEqual(duckTargets, [0.10, 0.3]); // Player action retains combat priority.
  duckTargets.length = 0;
  assert.equal(mix.emit('enemy-shot').status, 'started');
  assert.deepEqual(duckTargets, [0.10, 0.3]); // Unknown distance retains existing fallback.
  mix.dispose();
});

test('Web dry-fire has two brief mechanical ticks on one source voice, never a gunshot', () => {
  const {ctx, nodes, filters, gains} = fakeAudio();
  const mix = createWebImpactMix(ctx, 1);
  const receipt = mix.emit('dry-fire');
  assert.deepEqual(receipt, {status:'started', source:'web-original-synthesis',
    at:2.25, spatial:false});
  assert.equal(nodes.length, 2, 'a Web click reuses noise and oscillator only');
  const actionBand = filters.find(filter =>
    filter.type === 'bandpass' && filter.frequency.value === 2800);
  assert.ok(actionBand, 'a dry mechanical click has its own band-limited path');
  assert.ok(gains.find(gain => actionBand.connections.includes(gain)));
  assert.equal(nodes[0].connections.length, 2, 'base transient + staggered mechanical ticks');
  assert.equal(mix.emit('step').status, 'blocked', 'an accepted empty trigger outranks footsteps');
  assert.equal(mix.getActiveVoices(), 1);
  mix.dispose();
});

test('empty-gun click remains available under enemy fire and steps without masking player damage', () => {
  // Web-only mix policy: the already-wired empty-pistol action is actionable
  // feedback, even when the synthetic voice budget is saturated by gunfire.
  // These receipts do not establish real browser audibility.
  const {ctx, nodes, gains} = fakeAudio();
  const mix = createWebImpactMix(ctx, 1);
  const footBus = gains[3].gain;
  const ducks = [];
  footBus.setTargetAtTime = (value, at) => ducks.push({value, at});

  assert.equal(mix.emit('enemy-shot').status, 'started');
  const before = ducks.length;
  assert.equal(mix.emit('dry-fire').status, 'started');
  assert.equal(nodes[0].stopped, true, 'empty gun should preempt enemy muzzle accent');
  assert.deepEqual(ducks.slice(before).map(entry => entry.value), [0.10, 0.3],
    'short Web footstep duck keeps the click distinct while moving');
  assert.equal(mix.getActiveVoices(), 1);
  assert.equal(mix.emit('enemy-shot').status, 'blocked',
    'distant or repeated enemy shots should not steal empty-gun feedback');

  assert.equal(mix.emit('player-hit').status, 'started');
  assert.equal(nodes[2].stopped, true, 'player damage must still outrank dry-fire');
  mix.dispose();
});

test('remote enemy muzzles do not steal close contact or footsteps in a saturated mix', () => {
  // Web-authored source-distance admission policy, NOT a Unity mixing value.
  const {ctx, nodes} = fakeAudio();
  ctx.listener = {positionX: {value: 0}, positionY: {value: 0}, positionZ: {value: 0}};
  const mix = createWebImpactMix(ctx, 1);
  const close = {x: 1, y: 0, z: 0};
  const remote = {x: 30, y: 0, z: 0};
  assert.equal(mix.emit('wall-impact', {position: close}).status, 'started');
  const emittedSources = nodes.length;
  assert.equal(mix.emit('enemy-shot', {position: remote}).status, 'blocked');
  assert.equal(nodes.length, emittedSources, 'suppressed distant muzzle allocates no voice');
  assert.equal(nodes[0].stopped, undefined, 'the real nearby impact is uninterrupted');
  assert.equal(mix.emit('enemy-shot', {position: {x: 5, y: 0, z: 0}}).status, 'started');
  assert.equal(nodes[0].stopped, true, 'nearby threats retain gunfire priority');
  mix.dispose();

  const stepAudio = fakeAudio();
  stepAudio.ctx.listener = {positionX: {value: 0}, positionY: {value: 0},
    positionZ: {value: 0}};
  const walking = createWebImpactMix(stepAudio.ctx, 1);
  assert.equal(walking.emit('step', {position: close}).status, 'started');
  assert.equal(walking.emit('enemy-shot', {position: remote}).status, 'blocked');
  assert.equal(stepAudio.nodes[0].stopped, undefined, 'distant bullets do not mute a footfall');
  walking.dispose();

  const freeAudio = fakeAudio();
  freeAudio.ctx.listener = {positionX: {value: 0}, positionY: {value: 0},
    positionZ: {value: 0}};
  const free = createWebImpactMix(freeAudio.ctx, 1);
  assert.equal(free.emit('enemy-shot', {position: remote}).status, 'started',
    'far muzzle remains spatially audible when a voice is free');
  free.dispose();
});


test('resolved Web wall hits have a distinct falling ricochet body without extra voices', () => {
  // This is creative Web feedback behind the already-wired collision gate.
  // It proves graph scheduling, NOT that a user heard a sound or that MCD does this.
  const {ctx, nodes} = fakeAudio();
  const frequencies = [];
  const originalOscillator = ctx.createOscillator;
  ctx.createOscillator = () => {
    const osc = originalOscillator();
    const originalSet = osc.frequency.setValueAtTime;
    const originalRamp = osc.frequency.exponentialRampToValueAtTime;
    osc.frequency.setValueAtTime = function(value, at) {
      frequencies.push({op: 'set', value, at});
      originalSet.call(this, value, at);
    };
    osc.frequency.exponentialRampToValueAtTime = function(value, at) {
      frequencies.push({op: 'ramp', value, at});
      originalRamp.call(this, value, at);
    };
    return osc;
  };
  const mix = createWebImpactMix(ctx, 2);
  assert.equal(mix.emit('wall-impact', {position: {x: 1, y: 0, z: 0}}).status, 'started');
  assert.equal(nodes.length, 2, 'ricochet reuses the existing noise and body sources');
  assert.equal(nodes[1].type, 'sine');
  assert.ok(frequencies[0].value > 1800, 'wall contact starts with a bright chirp');
  assert.ok(frequencies[1].value < 800 && frequencies[1].value > 600,
    'tone falls below its initial pitch during the same voice');
  assert.equal(frequencies[1].at, ctx.currentTime + 0.16);
  assert.equal(mix.emit('impact').status, 'started');
  assert.equal(nodes[3].type, 'triangle', 'other impacts keep their existing timbre');
  assert.equal(mix.getActiveVoices(), 2);
  mix.dispose();
});

test('resolved Web wall ricochet survives close-range enemy fire at the voice cap', () => {
  const {ctx, nodes} = fakeAudio();
  ctx.listener = {positionX: {value: 0}, positionY: {value: 0}, positionZ: {value: 0}};
  const mix = createWebImpactMix(ctx, 2);
  assert.equal(mix.emit('enemy-shot', {position: {x: 2, y: 0, z: 0}}).status, 'started');
  assert.equal(mix.emit('enemy-shot', {position: {x: 4, y: 0, z: 0}}).status, 'started');
  const previousShot = nodes[0];
  assert.equal(mix.getActiveVoices(), 2);
  assert.equal(mix.emit('wall-impact', {position: {x: 1, y: 0, z: 0}}).status, 'started');
  assert.deepEqual(previousShot.stopArgs, [ctx.currentTime + 0.008]);
  assert.equal(mix.getActiveVoices(), 2); // One voice replaced, no budget increase.
  assert.equal(mix.emit('step').status, 'blocked');

  // Damage still takes precedence over the wall-contact accent.
  const {ctx: cappedCtx} = fakeAudio();
  const capped = createWebImpactMix(cappedCtx, 1);
  assert.equal(capped.emit('player-hit').status, 'started');
  assert.equal(capped.emit('wall-impact').status, 'blocked');
  capped.dispose();
  mix.dispose();
});

// A deliberate original Web timbre layered onto confirmed ground strides.
// This probes the scheduled graph only, not speaker audibility or Unity MCD.
test('walking footfalls carry a bright shoe-contact snap on the existing voice', () => {
  const {ctx, nodes, filters, gains} = fakeAudio();
  const mix = createWebImpactMix(ctx, 1);
  assert.equal(mix.emit('step', {position: {x: 1, y: 0, z: -2}}).status, 'started');
  assert.equal(nodes.length, 2); // One noise and one body oscillator; no extra source.
  const shoe = filters.find(filter => filter.type === 'highpass' && filter.frequency.value === 1650);
  assert.ok(shoe);
  assert.ok(nodes[0].connections.includes(shoe));
  const snap = gains.find(gain => shoe.connections.includes(gain));
  assert.ok(snap);
  assert.ok(snap.connections.includes(gains[7])); // Shared spatial output.
  assert.ok(gains[7].connections[0].connections.includes(gains[3])); // Footstep bus.
  assert.equal(mix.getActiveVoices(), 1);
  for (const node of nodes) node.onended();
  assert.equal(mix.getActiveVoices(), 0);
  assert.equal(shoe.disconnected, true);
  mix.dispose();
});

test('Web fist contact adds a compressed bass thump without another source or voice', () => {
  const {ctx, nodes, filters, gains} = fakeAudio();
  const mix = createWebImpactMix(ctx, 1);
  const result = mix.emit('punch-contact', {position: {x: 1, y: 1, z: 0}});
  assert.equal(result.status, 'started'); // Scheduling is not speaker audition.
  assert.equal(result.spatial, true);
  assert.equal(nodes.length, 2); // Existing noise + pitched body.
  const low = filters.find(filter => filter.type === 'lowpass' && filter.frequency.value === 340);
  assert.ok(low);
  assert.ok(nodes[0].connections.includes(low));
  const thump = gains.find(gain => low.connections.includes(gain));
  assert.ok(thump);
  const sharedOutput = nodes[1].connections[0].connections[0];
  assert.ok(thump.connections.includes(sharedOutput)); // Same spatial voice.
  assert.equal(thump.gain.value, 0.0001); // Scheduled to decay to silence.
  assert.equal(mix.getActiveVoices(), 1);
  for (const node of nodes) node.onended();
  assert.equal(mix.getActiveVoices(), 0);
  assert.equal(low.disconnected, true);
  mix.dispose();
});


test('Web audio keeps located gunfire on legacy PannerNode.setPosition browsers', () => {
  const {ctx, nodes} = fakeAudio();
  const positions = [];
  ctx.createPanner = () => ({
    connections: [],
    connect(target) { this.connections.push(target); return target; },
    disconnect() { this.disconnected = true; },
    setPosition(x, y, z) { positions.push([x, y, z]); },
  });
  const mix = createWebImpactMix(ctx, 1);
  const receipt = mix.emit('enemy-shot', {position: {x: 5, y: 1, z: -2}});
  assert.deepEqual(positions, [[5, 1, -2]]);
  assert.equal(receipt.status, 'started');
  assert.equal(receipt.spatial, true);
  assert.equal(nodes.length, 2);
  assert.equal(mix.getActiveVoices(), 1);
  mix.dispose();
});
