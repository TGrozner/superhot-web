/**
 * Browser playback for locally served, owner/path_id-verified MCD clips.
 * The commercial WAV files stay under ignored private/. Public builds are
 * deliberately silent for a recovered native event when its local clip is
 * unavailable; they are never relabelled procedural approximations.
 */
export const MCD_AUDIO_ASSET_KEYS = Object.freeze({
  PISTOL_FIRE_PRIMARY: 'audioPistolFirePrimary',
  PISTOL_FIRE_ALTERNATE: 'audioPistolFireAlternate',
  PISTOL_EMPTY: 'audioPistolEmpty',
  PISTOL_PICKUP: 'audioPistolPickup',
  PISTOL_PICKUP_RELOADED: 'audioPistolPickupReloaded',
  PISTOL_READY: 'audioPistolReady',
  PISTOL_THROW: 'audioPistolThrow',
  ENEMY_FIRE: 'audioEnemyFire',
  PLAYER_HIT: 'audioPlayerHit',
  ENEMY_SHATTER: 'audioEnemyShatter',
});

const CLIPS = Object.freeze({
  pistolFirePrimary: Object.freeze({
    manifestKey: MCD_AUDIO_ASSET_KEYS.PISTOL_FIRE_PRIMARY,
    owner: 'sharedassets0.assets', pathId: 604, name: 'AC_Gun_Pistol_Fire',
  }),
  pistolFireAlternate: Object.freeze({
    manifestKey: MCD_AUDIO_ASSET_KEYS.PISTOL_FIRE_ALTERNATE,
    owner: 'sharedassets0.assets', pathId: 623, name: 'AC_Gun_Pistol_Fire2',
  }),
  pistolEmpty: Object.freeze({
    manifestKey: MCD_AUDIO_ASSET_KEYS.PISTOL_EMPTY,
    owner: 'sharedassets0.assets', pathId: 605, name: 'AC_Gun_Pistol_NoAmmo',
  }),
  pistolPickup: Object.freeze({
    manifestKey: MCD_AUDIO_ASSET_KEYS.PISTOL_PICKUP,
    owner: 'sharedassets0.assets', pathId: 606, name: 'AC_Gun_Pistol_Pickup',
  }),
  pistolPickupReloaded: Object.freeze({
    manifestKey: MCD_AUDIO_ASSET_KEYS.PISTOL_PICKUP_RELOADED,
    owner: 'sharedassets0.assets', pathId: 621, name: 'AC_Gun_Pistol_Pickup_NoReload',
  }),
  pistolReady: Object.freeze({
    manifestKey: MCD_AUDIO_ASSET_KEYS.PISTOL_READY,
    owner: 'sharedassets0.assets', pathId: 626, name: 'AC_Gun_Tick',
  }),
  pistolThrow: Object.freeze({
    manifestKey: MCD_AUDIO_ASSET_KEYS.PISTOL_THROW,
    owner: 'sharedassets0.assets', pathId: 600, name: 'AC_Gun_Throw',
  }),
  enemyFire: Object.freeze({
    manifestKey: MCD_AUDIO_ASSET_KEYS.ENEMY_FIRE,
    owner: 'sharedassets0.assets', pathId: 604, name: 'AC_Gun_Pistol_Fire',
  }),
  playerHit: Object.freeze({
    manifestKey: MCD_AUDIO_ASSET_KEYS.PLAYER_HIT,
    owner: 'resources.assets', pathId: 1720, name: 'AC_Player_Hit',
  }),
  enemyShatter: Object.freeze({
    manifestKey: MCD_AUDIO_ASSET_KEYS.ENEMY_SHATTER,
    owner: 'resources.assets', pathId: 1579, name: 'AC_Enemy_Death',
  }),
});

const CLIP_ENTRIES = Object.entries(CLIPS);
const PISTOL_VARIANTS = new Set(['primary', 'alternate']);
const MAX_READY_REQUESTS = 8;

function finite(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be finite`);
  }
  return value;
}

function boolean(value, name) {
  if (typeof value !== 'boolean') throw new TypeError(`${name} must be boolean`);
  return value;
}

function vector3(value, name) {
  if (value == null) return null;
  const result = Array.isArray(value)
    ? {x: value[0], y: value[1], z: value[2]}
    : {x: value.x, y: value.y, z: value.z};
  finite(result.x, `${name}.x`);
  finite(result.y, `${name}.y`);
  finite(result.z, `${name}.z`);
  return result;
}

function setParam(param, value, time) {
  if (typeof param?.setValueAtTime === 'function') param.setValueAtTime(value, time);
  else if (param) param.value = value;
}

function errorMessage(error) {
  try {
    return error instanceof Error ? error.message : String(error);
  } catch {
    return 'unprintable audio load error';
  }
}

export function createAudio(options = {}) {
  const AudioContextClass = options.AudioContext ??
    globalThis.AudioContext ?? globalThis.webkitAudioContext;
  const fetchAudio = options.fetch ?? globalThis.fetch?.bind(globalThis);
  const random = options.random ?? Math.random;
  const cryptoApi = options.crypto ?? globalThis.crypto;

  let ctx = null;
  let originalMode = false;
  let soundScale = 1;
  let worldPitch = 1;
  let playbackCount = 0;
  let lastPlayback = null;
  let nextReadyId = 1;
  let assetsSnapshot = null;
  const buffers = new Map();
  const assetUrls = new Map();
  const loadErrors = new Map();
  const sourceMetrics = new Map();
  const urlLoads = new Map();
  const activeSources = new Map();
  const readyRequests = new Map();

  function randomUnit() {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new RangeError('random() must return a finite value in [0,1]');
    }
    return value;
  }

  function randomizedMultiplier(amount) {
    return 1 + randomUnit() * amount * 2 - amount;
  }

  async function inspectSourceBytes(bytes) {
    let sha256 = null;
    if (typeof cryptoApi?.subtle?.digest === 'function') {
      try {
        const digest = new Uint8Array(await cryptoApi.subtle.digest('SHA-256', bytes));
        sha256 = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
      } catch {
        // Decoding remains useful when a browser exposes but refuses SubtleCrypto.
      }
    }
    return {sourceByteLength: bytes.byteLength, sourceSha256: sha256};
  }

  function report(status, event, details = {}) {
    lastPlayback = Object.freeze({
      status, event, playbackCount, contextTime: ctx?.currentTime ?? null, ...details,
    });
    return lastPlayback;
  }

  async function init() {
    if (!ctx) {
      if (typeof AudioContextClass !== 'function') {
        return report('blocked', 'init', {reason: 'AudioContext unavailable'});
      }
      // Callers invoke init from a user gesture. No context is created earlier.
      ctx = new AudioContextClass();
    }
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') await ctx.resume();
    return report(ctx.state === 'running' ? 'ready' : 'blocked', 'init', {
      contextState: ctx.state,
      sampleRate: ctx.sampleRate,
    });
  }

  async function loadLocalAssets(manifest) {
    if (!ctx) throw new Error('audio.init() must run from a user gesture before loading clips');
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
      throw new TypeError('local asset manifest must be an object');
    }
    if (typeof fetchAudio !== 'function') throw new Error('fetch is unavailable');

    const requested = [];
    for (const [clipId, binding] of CLIP_ENTRIES) {
      const url = manifest[binding.manifestKey];
      if (typeof url !== 'string' || url.length === 0) continue;
      assetUrls.set(clipId, url);
      assetsSnapshot = null;
      let pending = urlLoads.get(url);
      if (!pending) {
        pending = (async () => {
          const response = await fetchAudio(url);
          if (!response?.ok) throw new Error(`audio fetch failed (${response?.status ?? 'unknown'})`);
          const bytes = await response.arrayBuffer();
          const source = await inspectSourceBytes(bytes);
          const buffer = await ctx.decodeAudioData(bytes);
          return {buffer, ...source};
        })();
        urlLoads.set(url, pending);
      }
      requested.push(pending.then(({buffer, ...source}) => {
        if (!buffer || !(buffer.duration >= 0) || !(buffer.sampleRate > 0) ||
            !(buffer.numberOfChannels > 0)) {
          throw new Error('decodeAudioData returned an invalid AudioBuffer');
        }
        buffers.set(clipId, buffer);
        sourceMetrics.set(clipId, source);
        loadErrors.delete(clipId);
        assetsSnapshot = null;
        return clipId;
      }).catch((error) => {
        buffers.delete(clipId);
        sourceMetrics.delete(clipId);
        loadErrors.set(clipId, errorMessage(error));
        if (urlLoads.get(url) === pending) urlLoads.delete(url);
        assetsSnapshot = null;
        return null;
      }));
    }
    await Promise.all(requested);
    return getMetrics().assets;
  }

  function blockedNative(event, clipId, reason) {
    const binding = CLIPS[clipId];
    return report('blocked', event, {
      reason,
      source: 'native-audio-buffer',
      clipId,
      owner: binding.owner,
      pathId: binding.pathId,
      clipName: binding.name,
    });
  }

  function addPanner(gain, position, maxDistance) {
    if (!position || typeof ctx.createPanner !== 'function') {
      gain.connect(ctx.destination);
      return false;
    }
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1;
    panner.maxDistance = maxDistance;
    panner.rolloffFactor = 1;
    setParam(panner.positionX, position.x, ctx.currentTime);
    setParam(panner.positionY, position.y, ctx.currentTime);
    setParam(panner.positionZ, position.z, ctx.currentTime);
    if (!panner.positionX && typeof panner.setPosition === 'function') {
      panner.setPosition(position.x, position.y, position.z);
    }
    gain.connect(panner);
    panner.connect(ctx.destination);
    return true;
  }

  function playNative(event, clipId, {
    gain: requestedGain, pitch = 1, position = null, maxDistance = 300,
    mixerGroup, priority = 128,
  }) {
    if (!ctx) return blockedNative(event, clipId, 'audio-context-not-initialized');
    const buffer = buffers.get(clipId);
    if (!buffer) {
      return blockedNative(event, clipId,
        loadErrors.has(clipId) ? 'native-clip-load-failed' : 'native-clip-not-loaded');
    }
    const binding = CLIPS[clipId];
    const identity = sourceMetrics.get(clipId);
    const source = ctx.createBufferSource();
    const gainNode = ctx.createGain();
    const gain = Math.max(0, Math.min(1, finite(requestedGain, 'gain')));
    const nativePitch = finite(pitch, 'pitch');
    const playbackRate = nativePitch * worldPitch;
    if (!(playbackRate > 0)) throw new RangeError('effective playback rate must be positive');

    source.buffer = buffer;
    setParam(source.playbackRate, playbackRate, ctx.currentTime);
    setParam(gainNode.gain, gain, ctx.currentTime);
    source.connect(gainNode);
    const spatial = addPanner(gainNode, position, maxDistance);
    activeSources.set(source, {nativePitch});
    source.onended = () => activeSources.delete(source);
    const startedAt = ctx.currentTime;
    source.start();
    playbackCount++;
    return report('started', event, {
      source: 'native-audio-buffer',
      node: 'AudioBufferSourceNode',
      clipId,
      manifestKey: binding.manifestKey,
      owner: binding.owner,
      pathId: binding.pathId,
      clipName: binding.name,
      sourceByteLength: identity?.sourceByteLength ?? null,
      sourceSha256: identity?.sourceSha256 ?? null,
      duration: buffer.duration,
      sampleRate: buffer.sampleRate,
      channels: buffer.numberOfChannels,
      frames: buffer.length,
      requestedGain,
      gain,
      nativeMixerGroup: mixerGroup,
      priority,
      nativePitch,
      worldPitch,
      playbackRate,
      spatial,
      position,
      maxDistance: spatial ? maxDistance : null,
      startedAt,
    });
  }

  function setOriginalMode(enabled) {
    originalMode = boolean(enabled, 'enabled');
    if (!originalMode) {
      readyRequests.clear();
      for (const source of activeSources.keys()) {
        try { source.stop(); } catch {}
      }
      activeSources.clear();
    }
    return originalMode;
  }

  function shoot({variant, position} = {}) {
    if (!originalMode) return proceduralShoot();
    if (variant !== undefined && !PISTOL_VARIANTS.has(variant)) {
      throw new TypeError('variant must be primary or alternate');
    }
    // Gun.Fire consumes selection RNG, then pitch, then volume RNG.
    const selected = variant ?? (randomUnit() > 0.6 ? 'alternate' : 'primary');
    const pitch = randomizedMultiplier(0.15);
    const gain = 0.6 * randomizedMultiplier(0.15);
    return playNative('shoot',
      selected === 'alternate' ? 'pistolFireAlternate' : 'pistolFirePrimary', {
        gain,
        pitch,
        mixerGroup: 'Gunshots',
        priority: 1,
        position: vector3(position, 'position'),
      });
  }

  function throwWeapon() {
    if (!originalMode) return proceduralShoot();
    // Pistol pickup4858 has no override: Weapon.Throw uses SFXThrow with
    // pitch1.5, then adds (not multiplies) its absolute ±0.2 randomization.
    const pitch = 1.5 + randomUnit() * 0.4 - 0.2;
    const gain = 0.8 * randomizedMultiplier(0.2);
    return playNative('throwWeapon', 'pistolThrow', {
      gain, pitch, mixerGroup: 'Env SFX',
    });
  }

  function enemyShoot({position} = {}) {
    if (!originalMode) return proceduralEnemyShoot();
    return playNative('enemyShoot', 'enemyFire', {
      gain: 0.800000011920929,
      mixerGroup: 'Gunshots',
      priority: 128,
      pitch: 1 + randomUnit() * 0.8 - 0.4,
      position: vector3(position, 'position'),
      maxDistance: 300,
    });
  }

  function shatter({position} = {}) {
    if (!originalMode) return proceduralShatter();
    return playNative('shatter', 'enemyShatter', {
      gain: 1,
      mixerGroup: 'Env SFX',
      priority: 30,
      position: vector3(position, 'position'),
      maxDistance: 30,
    });
  }

  function pickup({reloaded = false} = {}) {
    if (!originalMode) return proceduralPickup();
    boolean(reloaded, 'reloaded');
    const pitch = randomizedMultiplier(0.15);
    const gain = 0.9 * randomizedMultiplier(0.15);
    return playNative('pickup',
      reloaded ? 'pistolPickupReloaded' : 'pistolPickup', {
        gain, pitch, mixerGroup: 'Env SFX',
      });
  }

  function hit() {
    if (!originalMode) return proceduralHit();
    return playNative('hit', 'playerHit', {
      gain: 0.699999988079071, mixerGroup: 'Interface SFX', priority: 128,
    });
  }

  function empty() {
    if (!originalMode) return proceduralEmpty();
    return playNative('empty', 'pistolEmpty', {
      gain: 0.4, mixerGroup: 'Env SFX', priority: 128,
    });
  }

  function ready({weaponThrownAtCallback} = {}) {
    if (!originalMode) {
      return report('suppressed', 'ready', {
        reason: 'original-mode-disabled',
        source: 'native-audio-buffer',
        clipId: 'pistolReady',
      });
    }
    boolean(weaponThrownAtCallback, 'weaponThrownAtCallback');
    if (weaponThrownAtCallback) {
      return report('suppressed', 'ready', {
        reason: 'weapon-thrown-at-callback',
        source: 'native-audio-buffer',
        clipId: 'pistolReady',
      });
    }
    return playNative('ready', 'pistolReady', {
      gain: 1, mixerGroup: 'Env SFX', priority: 128,
    });
  }

  function scheduleReady({delaySeconds, isWeaponThrown} = {}) {
    finite(delaySeconds, 'delaySeconds');
    if (delaySeconds < 0) throw new RangeError('delaySeconds must be nonnegative');
    if (typeof isWeaponThrown !== 'function') {
      throw new TypeError('isWeaponThrown must be a callback-time function');
    }
    if (readyRequests.size >= MAX_READY_REQUESTS) {
      throw new RangeError(`at most ${MAX_READY_REQUESTS} ready cues may be pending`);
    }
    const id = nextReadyId++;
    readyRequests.set(id, {remaining: delaySeconds, isWeaponThrown});
    const cancel = () => readyRequests.delete(id);
    Object.defineProperty(cancel, 'id', {value: id});
    return cancel;
  }

  function advanceWorldTime(worldDeltaSeconds) {
    finite(worldDeltaSeconds, 'worldDeltaSeconds');
    if (worldDeltaSeconds < 0) {
      throw new RangeError('worldDeltaSeconds must be nonnegative');
    }
    const delivered = [];
    for (const [id, request] of readyRequests) {
      request.remaining -= worldDeltaSeconds;
      if (request.remaining > 0) continue;
      readyRequests.delete(id);
      try {
        const thrown = request.isWeaponThrown();
        boolean(thrown, 'isWeaponThrown() result');
        delivered.push(ready({weaponThrownAtCallback: thrown}));
      } catch (error) {
        delivered.push(report('suppressed', 'ready', {
          reason: 'ready-guard-failed',
          error: errorMessage(error),
          source: 'native-audio-buffer',
          clipId: 'pistolReady',
        }));
      }
    }
    return delivered;
  }

  function updateWorldAudio({
    aggregateTargetTimescale, customAudioTimescale = -1,
  } = {}) {
    finite(aggregateTargetTimescale, 'aggregateTargetTimescale');
    finite(customAudioTimescale, 'customAudioTimescale');
    if (aggregateTargetTimescale < 0 || customAudioTimescale < -1) {
      throw new RangeError('audio timescales are outside the recovered domain');
    }
    if (customAudioTimescale > -0.5) {
      soundScale = customAudioTimescale;
    } else {
      const target = Math.max(0, Math.min(1, aggregateTargetTimescale / 0.65));
      soundScale += (target - soundScale) * 0.1;
    }
    if (soundScale > 0.99) soundScale = 1;
    worldPitch = (soundScale - 0.01) * 0.7 / 0.99 + 0.3;
    if (!(worldPitch > 0)) throw new RangeError('mapped native mixer pitch is not playable');
    if (ctx) {
      for (const [source, state] of activeSources) {
        setParam(source.playbackRate, state.nativePitch * worldPitch, ctx.currentTime);
      }
    }
    return Object.freeze({soundScale, worldPitch});
  }

  function setListener({
    position, forward = {x: 0, y: 0, z: -1}, up = {x: 0, y: 1, z: 0},
  } = {}) {
    if (!ctx) return false;
    const listener = ctx.listener;
    const p = vector3(position, 'position');
    const f = vector3(forward, 'forward');
    const u = vector3(up, 'up');
    if (!p) throw new TypeError('position is required');
    setParam(listener.positionX, p.x, ctx.currentTime);
    setParam(listener.positionY, p.y, ctx.currentTime);
    setParam(listener.positionZ, p.z, ctx.currentTime);
    setParam(listener.forwardX, f.x, ctx.currentTime);
    setParam(listener.forwardY, f.y, ctx.currentTime);
    setParam(listener.forwardZ, f.z, ctx.currentTime);
    setParam(listener.upX, u.x, ctx.currentTime);
    setParam(listener.upY, u.y, ctx.currentTime);
    setParam(listener.upZ, u.z, ctx.currentTime);
    if (!listener.positionX && typeof listener.setPosition === 'function') {
      listener.setPosition(p.x, p.y, p.z);
    }
    if (!listener.forwardX && typeof listener.setOrientation === 'function') {
      listener.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z);
    }
    return true;
  }

  function tone(frequency, duration, shape = 'triangle', volume = 0.08, slide = 0) {
    if (!ctx) return;
    const time = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = shape;
    osc.frequency.setValueAtTime(frequency, time);
    if (slide) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(30, frequency + slide), time + duration,
      );
    }
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(time);
    osc.stop(time + duration + 0.005);
  }

  function noise(duration = 0.1, volume = 0.12) {
    if (!ctx) return;
    const size = Math.ceil(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = (random() * 2 - 1) * (1 - i / size);
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    filter.type = 'highpass';
    filter.frequency.value = 600;
    gain.gain.value = volume;
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start();
  }

  function procedural(event, emit, reason = 'original-mode-disabled') {
    if (!ctx) {
      return report('blocked', event, {
        reason: 'audio-context-not-initialized',
        source: 'procedural-fallback',
      });
    }
    const startedAt = ctx.currentTime;
    emit();
    playbackCount++;
    return report('started', event, {
      source: 'procedural-fallback',
      reason,
      node: 'procedural-audio-graph',
      startedAt,
    });
  }

  function proceduralShoot() {
    return procedural('shoot', () => {
      noise(0.11, 0.23);
      tone(92, 0.15, 'sawtooth', 0.08, -40);
    });
  }

  function proceduralEnemyShoot() {
    return procedural('enemyShoot', () => tone(180, 0.22, 'sawtooth', 0.055, -120));
  }

  function proceduralShatter() {
    return procedural('shatter', () => {
      noise(0.3, 0.16);
      tone(680, 0.33, 'triangle', 0.065, -590);
    });
  }

  function proceduralPickup() {
    return procedural('pickup', () => {
      tone(430, 0.07);
      setTimeout(() => tone(770, 0.12, 'triangle', 0.07), 60);
    });
  }

  function proceduralHit() {
    return procedural('hit', () => tone(75, 0.35, 'sawtooth', 0.19, -30));
  }

  function proceduralEmpty() {
    return procedural('empty', () => tone(650, 0.04, 'square', 0.04));
  }

  function win() {
    return procedural('win', () => {
      tone(420, 0.15);
      setTimeout(() => tone(670, 0.24), 130);
    }, 'native-binding-not-recovered');
  }

  function getMetrics() {
    if (!assetsSnapshot) {
      const assets = {};
      for (const [clipId, binding] of CLIP_ENTRIES) {
        const buffer = buffers.get(clipId);
        const source = sourceMetrics.get(clipId);
        assets[clipId] = Object.freeze({
          manifestKey: binding.manifestKey,
          owner: binding.owner,
          pathId: binding.pathId,
          clipName: binding.name,
          url: assetUrls.get(clipId) ?? null,
          loaded: Boolean(buffer),
          sourceByteLength: source?.sourceByteLength ?? null,
          sourceSha256: source?.sourceSha256 ?? null,
          duration: buffer?.duration ?? null,
          sampleRate: buffer?.sampleRate ?? null,
          channels: buffer?.numberOfChannels ?? null,
          frames: buffer?.length ?? null,
          error: loadErrors.get(clipId) ?? null,
        });
      }
      assetsSnapshot = Object.freeze(assets);
    }
    return Object.freeze({
      contextState: ctx?.state ?? 'uninitialized',
      playbackCount,
      originalMode,
      activeNativeSources: activeSources.size,
      pendingReadyCues: readyRequests.size,
      soundScale,
      worldPitch,
      lastPlayback,
      assets: assetsSnapshot,
    });
  }

  return Object.freeze({
    init,
    setOriginalMode,
    loadLocalAssets,
    shoot,
    throwWeapon,
    enemyShoot,
    shatter,
    pickup,
    hit,
    empty,
    ready,
    scheduleReady,
    advanceWorldTime,
    updateWorldAudio,
    setListener,
    win,
    getMetrics,
  });
}
