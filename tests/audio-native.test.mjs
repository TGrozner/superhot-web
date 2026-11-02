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
