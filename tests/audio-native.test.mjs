import test from 'node:test';
import assert from 'node:assert/strict';
import {createAudio, MCD_AUDIO_ASSET_KEYS} from '../src/audio.js';

class Param {
  constructor(value = 0) { this.value = value; this.values = []; }
  setValueAtTime(value, time) { this.value = value; this.values.push({value, time}); }
  exponentialRampToValueAtTime(value, time) { this.value = value; this.values.push({value, time}); }
}

class Node {
  constructor() { this.connections = []; }
  connect(node) { this.connections.push(node); return node; }
}

class Source extends Node {
  constructor() {
    super();
    this.playbackRate = new Param(1);
    this.buffer = null;
    this.started = false;
    this.startedAt = null;
    this.onended = null;
  }
  start(when) { this.started = true; this.startedAt = when ?? null; }
  stop() { this.stopped = true; }
}

class Gain extends Node {
  constructor() { super(); this.gain = new Param(1); }
}

class Panner extends Node {
  constructor() {
    super();
    this.positionX = new Param();
    this.positionY = new Param();
    this.positionZ = new Param();
  }
}

class Oscillator extends Node {
  constructor() {
    super();
    this.frequency = new Param();
    this.started = false;
    this.stoppedAt = null;
  }
  start() { this.started = true; }
  stop(time) { this.stoppedAt = time; }
}

class Filter extends Node {
  constructor() { super(); this.frequency = new Param(); this.type = ''; }
}

class FakeAudioContext {
  constructor() {
    this.state = 'suspended';
    this.currentTime = 12.5;
    this.sampleRate = 48000;
    this.destination = new Node();
    this.listener = {
      positionX: new Param(), positionY: new Param(), positionZ: new Param(),
      forwardX: new Param(), forwardY: new Param(), forwardZ: new Param(),
      upX: new Param(), upY: new Param(), upZ: new Param(),
    };
    this.sources = [];
    this.gains = [];
    this.panners = [];
    this.oscillators = [];
    FakeAudioContext.last = this;
  }
  async resume() { this.state = 'running'; }
  async decodeAudioData(bytes) {
    return {duration: bytes.byteLength / 1000, sampleRate: 48000, numberOfChannels: 2, length: bytes.byteLength};
  }
  createBufferSource() { const node = new Source(); this.sources.push(node); return node; }
  createGain() { const node = new Gain(); this.gains.push(node); return node; }
  createPanner() { const node = new Panner(); this.panners.push(node); return node; }
  createOscillator() { const node = new Oscillator(); this.oscillators.push(node); return node; }
  createBiquadFilter() { return new Filter(); }
  createBuffer(channels, length, sampleRate) {
    const channelData = Array.from({length: channels}, () => new Float32Array(length));
    return {
      duration: length / sampleRate,
      sampleRate,
      numberOfChannels: channels,
      length,
      getChannelData: (channel) => channelData[channel],
    };
  }
}

const localManifest = Object.fromEntries(
  Object.values(MCD_AUDIO_ASSET_KEYS).map((key, index) => [key, `/private/${index}.wav`]),
);
localManifest[MCD_AUDIO_ASSET_KEYS.ENEMY_FIRE] =
  localManifest[MCD_AUDIO_ASSET_KEYS.PISTOL_FIRE_PRIMARY];
Object.freeze(localManifest);

function makeAudio(randomValues = [0.5], originalMode = true) {
  let randomIndex = 0;
  const fetched = [];
  const audio = createAudio({
    AudioContext: FakeAudioContext,
    random: () => randomValues[randomIndex++ % randomValues.length],
    fetch: async (url) => {
      fetched.push(url);
      return {ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(2400)};
    },
    crypto: {
      subtle: {
        digest: async () => new Uint8Array(32).buffer,
      },
    },
  });
  audio.setOriginalMode(originalMode);
  return {audio, fetched};
}

test('demo mode keeps explicit procedural feedback while original mode fails closed', async () => {
  const publicDefault = createAudio({AudioContext: FakeAudioContext});
  assert.equal(publicDefault.getMetrics().originalMode, false);

  const {audio} = makeAudio([0.5], false);
  await audio.init();

  const demo = audio.shoot();
  assert.equal(demo.status, 'started');
  assert.equal(demo.source, 'procedural-fallback');
  assert.equal(demo.reason, 'original-mode-disabled');
  assert.equal(FakeAudioContext.last.sources.length, 1);
  assert.equal(FakeAudioContext.last.oscillators.length, 1);
  assert.equal(audio.getMetrics().originalMode, false);

  audio.setOriginalMode(true);
  const original = audio.shoot({variant: 'primary'});
  assert.equal(original.status, 'blocked');
  assert.equal(original.reason, 'native-clip-not-loaded');
  assert.equal(FakeAudioContext.last.sources.length, 1);
  assert.equal(FakeAudioContext.last.oscillators.length, 1);
  assert.equal(audio.getMetrics().originalMode, true);
});

test('recovered events stay silent until their native buffers are loaded', async () => {
  const {audio} = makeAudio();
  const beforeInit = audio.shoot({variant: 'primary'});
  assert.equal(beforeInit.status, 'blocked');
  assert.equal(beforeInit.reason, 'audio-context-not-initialized');

  await audio.init();
  const beforeLoad = audio.hit();
  assert.equal(beforeLoad.status, 'blocked');
  assert.equal(beforeLoad.reason, 'native-clip-not-loaded');
  assert.equal(FakeAudioContext.last.sources.length, 0);
});


test('world-delay ready cue rechecks thrown state at callback time', async () => {
  const {audio} = makeAudio();
  await audio.init();
  await audio.loadLocalAssets(localManifest);
  let thrown = false;
  audio.scheduleReady({delaySeconds: 0.6000000238418579, isWeaponThrown: () => thrown});

  assert.deepEqual(audio.advanceWorldTime(0.4), []);
  thrown = true;
  const suppressed = audio.advanceWorldTime(0.2000000238418579);
  assert.equal(suppressed.length, 1);
  assert.equal(suppressed[0].status, 'suppressed');
  assert.equal(suppressed[0].reason, 'weapon-thrown-at-callback');

  thrown = false;
  audio.scheduleReady({delaySeconds: 0.6, isWeaponThrown: () => thrown});
  const played = audio.advanceWorldTime(0.6);
  assert.equal(played[0].status, 'started');
  assert.equal(played[0].pathId, 626);
});

test('recovered mixer pitch updates active native AudioBufferSources', async () => {
  const {audio} = makeAudio([0.5]);
  await audio.init();
  await audio.loadLocalAssets(localManifest);
  const shot = audio.shoot({variant: 'primary'});
  assert.ok(Math.abs(shot.playbackRate - 1) < 1e-12);

  const mixer = audio.updateWorldAudio({aggregateTargetTimescale: 0, customAudioTimescale: 0});
  assert.equal(mixer.soundScale, 0);
  assert.ok(Math.abs(mixer.worldPitch - 0.29292929292929293) < 1e-12);
  assert.ok(Math.abs(FakeAudioContext.last.sources.at(-1).playbackRate.value - mixer.worldPitch) < 1e-12);
  assert.equal(audio.getMetrics().worldPitch, mixer.worldPitch);
});

test('throw randomization adds to its non-unit native pitch instead of scaling it', async () => {
  const {audio} = makeAudio([0, 0, 1, 1]);
  await audio.init();
  await audio.loadLocalAssets(localManifest);
  const low = audio.throwWeapon();
  const high = audio.throwWeapon();
  assert.ok(Math.abs(low.playbackRate - 1.3) < 1e-12);
  assert.ok(Math.abs(high.playbackRate - 1.7) < 1e-12);
  assert.ok(Math.abs(low.gain - 0.64) < 1e-12);
  assert.ok(Math.abs(high.gain - 0.96) < 1e-12);
});

test('concurrent preload requests share clips without merging distinct waveforms', async () => {
  const {audio, fetched} = makeAudio();
  await audio.init();
  await Promise.all([audio.loadLocalAssets(localManifest), audio.loadLocalAssets(localManifest)]);
  await audio.loadLocalAssets(localManifest);
  assert.equal(fetched.length, new Set(Object.values(localManifest)).size);
  audio.shoot({variant: 'primary'});
  audio.enemyShoot();
  audio.shoot({variant: 'alternate'});
  const [player, enemy, alternate] = FakeAudioContext.last.sources;
  assert.equal(player.buffer, enemy.buffer);
  assert.notEqual(player.buffer, alternate.buffer);
});

test('matching active PlayClip sources do not invent a weapon cooldown', async () => {
  const {audio} = makeAudio([0.5]);
  await audio.init();
  await audio.loadLocalAssets(localManifest);

  assert.equal(audio.shoot({variant: 'primary'}).status, 'started');
  assert.equal(audio.shoot({variant: 'primary'}).status, 'started');
  assert.equal(FakeAudioContext.last.sources.length, 2);
  assert.ok(FakeAudioContext.last.sources.every((source) => source.started));
});

// Synthetic descriptors exercise the public adapter, not native media playback.
function sceneAudioFixture() {
  const id = 'audioNative_resources_assets_999';
  const curve = [
    {time: 0, value: 1, inSlope: -1, outSlope: -1},
    {time: 1, value: 0, inSlope: -1, outSlope: -1},
  ];
  const cue = {clipId: id, gain: .6, pitch: 1, mixerGroup: 'Env SFX'};
  return {
    id,
    descriptors: {
      clips: {[id]: {manifestKey: id, owner: 'resources.assets', pathId: 999, name: 'synthetic-test'}},
      prefabs: {EnemyStun: {...cue, clips: [id], poolSize: 1, priority: 30,
        maxDistance: 30, rolloffCurve: curve}},
      items: {item: {
        pickup: {...cue, mixerGroup: 'Unscaled SFX'},
        throw: {...cue, pitch: 1.5, pitchRandomization: .2, gainRandomization: .2, relativePitch: false},
        attackThrow: {alsoThrow: true, selectionThreshold: .5,
          choices: [{...cue, gain: .4, priority: 1}, {...cue, gain: .6, priority: 1}]},
        break: {prefab: 'EnemyStun'},
        swing: {choices: [{clipId: null}]},
        slice: {...cue, realtimeCooldown: .1},
      }},
      ambience: [{...cue, mixerGroup: 'BG Object', loop: true, distanceGate: true,
        position: [0, 0, 0], maxDistance: 5, rolloffCurve: curve}],
    },
  };
}

test('scene action clips use original mixer ancestry and preserve source-null swing', async () => {
  const {audio} = makeAudio();
  const {id, descriptors} = sceneAudioFixture();
  audio.configureSceneAudio(descriptors);
  await audio.init();
  await audio.loadLocalAssets({[id]: '/scene-test.wav'});
  audio.updateWorldAudio({aggregateTargetTimescale: 0, customAudioTimescale: 0});
  const pickup = audio.itemCue('pickup', {itemId: 'item'});
  assert.equal(pickup.timeScaled, false);
  assert.equal(pickup.playbackRate, 1);
  const thrown = audio.itemCue('throw', {itemId: 'item'});
  assert.equal(thrown.timeScaled, true);
  assert.equal(thrown.nativePitch, 1.5);
  const before = audio.getMetrics().playbackCount;
  assert.equal(audio.itemCue('swing', {itemId: 'item'}).reason, 'source-null-clip');
  assert.equal(audio.getMetrics().playbackCount, before);
});

test('stun uses real-time per-body rest, pool reuse and native vertical offset', async () => {
  const {audio} = makeAudio();
  const {id, descriptors} = sceneAudioFixture();
  audio.configureSceneAudio(descriptors);
  await audio.init();
  await audio.loadLocalAssets({[id]: '/scene-test.wav'});
  const hit = audio.stun({bodyId: 1, position: [2, 3, 4], realtimeSeconds: 1});
  assert.deepEqual(hit.position, {x: 2, y: 4.5, z: 4});
  assert.equal(hit.status, 'started');
  assert.equal(audio.stun({bodyId: 1, position: [2, 3, 4], realtimeSeconds: 1.25}).reason,
    'native-stun-sound-rest');
  const first = FakeAudioContext.last.sources[0];
  audio.stun({bodyId: 2, position: [0, 0, 0], realtimeSeconds: 1.1});
  assert.equal(first.stopped, true);
  assert.equal(audio.getMetrics().activeNativeSources, 1);
  FakeAudioContext.last.sources.at(-1).onended();
  assert.equal(audio.getMetrics().activeNativeSources, 0);
});

test('missing clip still advances source stun rest without pretending playback', async () => {
  const {audio} = makeAudio();
  const {descriptors} = sceneAudioFixture();
  audio.configureSceneAudio(descriptors);
  const first = audio.stun({bodyId: 1, position: [0, 0, 0], realtimeSeconds: 1});
  assert.equal(first.status, 'blocked');
  assert.equal(audio.getMetrics().playbackCount, 0);
  assert.equal(audio.stun({bodyId: 1, position: [0, 0, 0], realtimeSeconds: 1.1}).status, 'suppressed');
});

test('door ambience is a persistent distance-gated unscaled loop, not a warning one-shot', async () => {
  const {audio} = makeAudio();
  const {id, descriptors} = sceneAudioFixture();
  audio.configureSceneAudio(descriptors);
  await audio.init();
  await audio.loadLocalAssets({[id]: '/scene-test.wav'});
  audio.setListener({position: [0, 0, 0]});
  assert.equal(audio.startSceneAmbience()[0].status, 'started');
  assert.deepEqual(audio.startSceneAmbience(), []);
  const context = FakeAudioContext.last;
  const source = context.sources[0];
  assert.equal(source.loop, true);
  assert.equal(context.panners[0].rolloffFactor, 0);
  audio.setListener({position: [10, 0, 0]});
  context.currentTime += 1;
  audio.updateWorldAudio({aggregateTargetTimescale: 0, customAudioTimescale: 0});
  assert.equal(source.playbackRate.value, 0);
  audio.setListener({position: [0, 0, 0]});
  context.currentTime += .5;
  audio.updateWorldAudio({aggregateTargetTimescale: 0, customAudioTimescale: 0});
  assert.equal(source.playbackRate.value, 1);
  assert.equal(context.gains[0].gain.value, .3);
  audio.stopSceneAmbience();
  assert.equal(source.stopped, true);
  assert.equal(audio.getMetrics().sceneAmbienceSources, 0);
});

test('katana slice cooldown uses strict real-time gate and no extra source', async () => {
  const {audio} = makeAudio();
  const {id, descriptors} = sceneAudioFixture();
  audio.configureSceneAudio(descriptors);
  await audio.init();
  await audio.loadLocalAssets({[id]: '/scene-test.wav'});
  assert.equal(audio.itemCue('slice', {itemId: 'item', realtimeSeconds: 1}).status, 'started');
  assert.equal(audio.itemCue('slice', {itemId: 'item', realtimeSeconds: 1.1}).status, 'suppressed');
  assert.equal(audio.itemCue('slice', {itemId: 'item', realtimeSeconds: 1.101}).status, 'started');
  assert.equal(audio.getMetrics().playbackCount, 2);
});

test('throwable primary attack plays base throw then source extra attack clip', async () => {
  const {audio} = makeAudio([.5]);
  const {id, descriptors} = sceneAudioFixture();
  audio.configureSceneAudio(descriptors);
  await audio.init();
  await audio.loadLocalAssets({[id]: '/scene-test.wav'});
  const result = audio.itemCue('attackThrow', {itemId: 'item'});
  assert.equal(audio.getMetrics().playbackCount, 2);
  assert.equal(result.gain, .4); // Native chooses alternate only strictly above .5.
  assert.equal(result.priority, 1);
  assert.equal(FakeAudioContext.last.sources[0].playbackRate.value, 1.5);
});
