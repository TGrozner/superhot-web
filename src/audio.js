import {
  MCD_PLAYCLIP_RESULT,
  planMcdPlayClip,
} from './sound/mcd-playclip-intent.js';
import {planMcdAudioPrefabPlay} from './sound/mcd-prefab-sound-intent.js';
import {planMcdStunAudioFromCommands} from './sound/mcd-enemy-stun-prefab.js';
import {sampleMcdCurve} from './sound/mcd-curve.js';
import {createWebImpactMix} from './sound/web-impact-mix.js';
import {createWebFootstepMotion} from './sound/web-footstep-motion.js';

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

const DEFAULT_CLIPS = Object.freeze({
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
  const CLIPS = {...DEFAULT_CLIPS};
  let CLIP_ENTRIES = Object.entries(CLIPS);
  let sceneAudio = null;
  let listenerPosition = null;
  const prefabPools = new Map();
  const stunRest = new Map();
  const sliceRest = new Map();
  const ambienceSources = new Set();

  let ctx = null;
  let webMix = null;
  let footstepMotion = null;
  let webStepCount = 0;
  let webMixError = null;
  let lastWebAccent = null;
  let webAccentCount = 0;
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

  // Extra Web game-feel, not recovered MCD audio. Keep the native playback
  // result intact: a synthetic cue must never masquerade as a source WAV.
  function webCombatAccent(cue, nativePlayback, position = null) {
    if (!originalMode || !webMix || nativePlayback?.status === 'suppressed') return nativePlayback;
    try {
      const nativePlaying = nativePlayback?.status === 'started' ||
        nativePlayback?.status === 'scheduled';
      const receipt = webMix.emit(cue, {
        position: vector3(position, 'webAccentPosition') ?? undefined,
        intensity: nativePlaying ? 0.2 : 1,
      });
      lastWebAccent = Object.freeze({cue, nativeStatus: nativePlayback?.status ?? null,
        status: receipt.status, spatial: receipt.spatial});
      if (receipt.status === 'started') webAccentCount++;
    } catch (error) {
      lastWebAccent = Object.freeze({cue, status: 'blocked', reason: errorMessage(error)});
    }
    return nativePlayback;
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
    // A single user-gesture AudioContext is shared by original WAVs and Web
    // impact accents. No continuous drone: the Dojo has its own scene ambience.
    if (ctx.state === 'running' && !webMix &&
        typeof ctx.createDynamicsCompressor === 'function' &&
        typeof ctx.createBuffer === 'function' &&
        typeof ctx.createBiquadFilter === 'function' &&
        typeof ctx.createOscillator === 'function') {
      try {
        webMix = createWebImpactMix(ctx);
        webMix.setMixLevel(0.45);
        // One shared user-gesture AudioContext: no separate footstep audio graph.
        footstepMotion = createWebFootstepMotion((cue, request) => webMix.emit(cue, request));
        webMixError = null;
      } catch (error) { webMix = null; webMixError = errorMessage(error); }
    }
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

  function addPanner(gain, position, maxDistance, customRolloff = false) {
    if (!position || typeof ctx.createPanner !== 'function') {
      gain.connect(ctx.destination);
      return false;
    }
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1;
    panner.maxDistance = maxDistance;
    panner.rolloffFactor = customRolloff ? 0 : 1;
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
    mixerGroup, priority = 128, loop = false, delaySeconds = 0,
    zeroPitchWarning = false, rolloffCurve = null, distanceGate = false,
    onSource = null, onEnded = null,
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
    // Only Gunshots and Env SFX descend from SHMixer's pitch-controlled Scaler.
    const scaled = mixerGroup === 'Gunshots' || mixerGroup === 'Env SFX';
    const playbackRate = nativePitch * (scaled ? worldPitch : 1);
    if (playbackRate < 0) throw new RangeError('effective playback rate must be nonnegative');

    source.buffer = buffer;
    source.loop = loop;
    setParam(source.playbackRate, playbackRate, ctx.currentTime);
    setParam(gainNode.gain, gain, ctx.currentTime);
    source.connect(gainNode);
    const spatial = addPanner(gainNode, position, maxDistance, Boolean(rolloffCurve));
    activeSources.set(source, {nativePitch, scaled, gain, gainNode, position,
      maxDistance, rolloffCurve, distanceGate, gate: 1, gateTarget: 1,
      gateFrom: 1, gateTime: ctx.currentTime, paused: false});
    source.onended = () => {
      activeSources.delete(source);
      ambienceSources.delete(source);
      onEnded?.(source);
    };
    onSource?.(source);
    updateSpatialSource(source, activeSources.get(source));
    const startedAt = ctx.currentTime + delaySeconds;
    if (delaySeconds > 0) source.start(startedAt);
    else source.start();
    playbackCount++;
    return report(ctx.state === 'running' ? 'started' : 'scheduled', event, {
      contextState: ctx.state,
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
      zeroPitchWarning,
      position,
      maxDistance: spatial ? maxDistance : null,
      customRolloff: Boolean(rolloffCurve),
      timeScaled: scaled,
      startedAt,
    });
  }

  function updateSpatialSource(source, state) {
    let attenuation = 1;
    if (state.position && listenerPosition) {
      const distance = Math.hypot(state.position.x - listenerPosition.x,
        state.position.y - listenerPosition.y, state.position.z - listenerPosition.z);
      if (state.rolloffCurve) {
        attenuation = Math.max(0, sampleMcdCurve(state.rolloffCurve, distance / state.maxDistance));
      }
      if (state.distanceGate) {
        const target = distance <= state.maxDistance ? 1 : 0;
        if (target !== state.gateTarget) {
          state.gateFrom = state.gate;
          state.gateTime = ctx.currentTime;
          state.gateTarget = target;
        }
        const step = Math.min(Math.abs(target - state.gateFrom), ctx.currentTime - state.gateTime);
        state.gate = state.gateFrom + Math.sign(target - state.gateFrom) * step;
        state.paused = state.gate === 0 && target === 0;
      }
    }
    setParam(state.gainNode.gain, state.gain * attenuation * state.gate, ctx.currentTime);
    setParam(source.playbackRate, state.paused ? 0 :
      state.nativePitch * (state.scaled ? worldPitch : 1), ctx.currentTime);
  }

  function stopSceneAmbience() {
    for (const source of ambienceSources) {
      source.stop();
      activeSources.delete(source);
    }
    ambienceSources.clear();
  }

  function configureSceneAudio(descriptors) {
    stopSceneAmbience();
    for (const pool of prefabPools.values()) {
      for (const slot of pool.used) {
        if (slot.source) {
          slot.source.onended = null;
          slot.source.stop();
          activeSources.delete(slot.source);
        }
      }
    }
    prefabPools.clear();
    stunRest.clear();
    sliceRest.clear();
    sceneAudio = descriptors ?? null;
    for (const id of Object.keys(CLIPS)) {
      if (Object.hasOwn(DEFAULT_CLIPS, id)) continue;
      delete CLIPS[id];
      buffers.delete(id);
      assetUrls.delete(id);
      sourceMetrics.delete(id);
      loadErrors.delete(id);
    }
    for (const [id, binding] of Object.entries(descriptors?.clips ?? {})) {
      if (!/^audioNative_(?:resources_assets|sharedassets0_assets)_\d+$/.test(id) ||
          binding.manifestKey !== id || !Number.isInteger(binding.pathId) ||
          !['resources.assets', 'sharedassets0.assets'].includes(binding.owner)) {
        throw new TypeError('invalid private scene audio binding');
      }
      CLIPS[id] = Object.freeze({...binding});
    }
    CLIP_ENTRIES = Object.entries(CLIPS);
    assetsSnapshot = null;
    for (const [name, descriptor] of Object.entries(descriptors?.prefabs ?? {})) {
      if (!Number.isInteger(descriptor.poolSize) || descriptor.poolSize < 1 ||
          !descriptor.clips?.length) throw new TypeError('invalid recovered audio pool');
      // SoundClipRandomizer runs at instantiation, NOT every pool checkout.
      const free = Array.from({length: descriptor.poolSize}, () => ({
        clipId: descriptor.clips.length === 1 ? descriptor.clips[0] :
          descriptor.clips[Math.min(descriptor.clips.length - 1,
            Math.floor(randomUnit() * descriptor.clips.length))],
        pitch: descriptor.pitch, source: null,
      }));
      prefabPools.set(name, {descriptor, free, used: []});
    }
    return Object.freeze({clips: CLIP_ENTRIES.length, prefabs: prefabPools.size});
  }

  function startSceneAmbience() {
    if (!originalMode) return [];
    if (ambienceSources.size) return [];
    return (sceneAudio?.ambience ?? []).map((cue) => playNative('door-ambience', cue.clipId, {
      ...cue, position: vector3(cue.position, 'position'),
      onSource: source => ambienceSources.add(source),
    }));
  }

  function playScenePrefab(name, position, commands = null) {
    const pool = prefabPools.get(name);
    if (!pool) return report('blocked', name, {reason: 'native-prefab-not-configured'});
    const reused = pool.free.length === 0;
    const slot = reused ? pool.used[0] : pool.free[pool.free.length - 1];
    const state = {poolExists: true, reused, pitchBeforeRequest: slot.pitch};
    const intent = commands ? planMcdStunAudioFromCommands(commands, state).playback :
      planMcdAudioPrefabPlay({prefabName: name, position, ...state});
    if (!ctx || !buffers.has(slot.clipId)) {
      return blockedNative(name, slot.clipId, !ctx ? 'audio-context-not-initialized' : 'native-clip-not-loaded');
    }
    if (reused) {
      pool.used.shift();
      slot.source.onended = null;
      slot.source.stop();
      activeSources.delete(slot.source);
    } else pool.free.pop();
    pool.used.push(slot);
    return playNative(name, slot.clipId, {
      ...pool.descriptor, position: intent.position, pitch: intent.pitch,
      onSource: source => { slot.source = source; },
      onEnded: source => {
        if (slot.source !== source) return;
        const index = pool.used.indexOf(slot);
        if (index < 0) return;
        const last = pool.used.pop();
        if (index < pool.used.length) pool.used[index] = last;
        slot.source = null;
        pool.free.push(slot);
      },
    });
  }

  function stun({bodyId, position, concrete = false, realtimeSeconds} = {}) {
    if (!originalMode) return report('suppressed', 'stun', {reason: 'original-mode-disabled'});
    finite(realtimeSeconds, 'realtimeSeconds');
    if (bodyId === undefined) throw new TypeError('bodyId is required for the native per-body sound rest');
    boolean(concrete, 'concrete');
    if (realtimeSeconds <= (stunRest.get(bodyId) ?? 0)) {
      return report('suppressed', 'stun', {reason: 'native-stun-sound-rest'});
    }
    const origin = vector3(position, 'position');
    if (!origin) throw new TypeError('body position is required');
    const resource = concrete ? 'EnemyStunConcrete' : 'EnemyStun';
    const soundPosition = {...origin, y: origin.y + 1.5};
    const until = realtimeSeconds + .25;
    const commands = [
      {op: 'request-stun-prefab-sound', resource, position: soundPosition},
      {op: 'set-stun-sound-rest', realtimeSeconds: until},
    ];
    const result = playScenePrefab(resource, soundPosition, commands);
    // Source advances the cooldown even when the pool/clip could not play.
    stunRest.set(bodyId, until);
    return result;
  }

  function itemCue(action, {itemId, position, realtimeSeconds} = {}) {
    if (!originalMode) return report('suppressed', action, {reason: 'original-mode-disabled'});
    const withItemAccent = (result) => {
      const webCue = action === 'slice' ? 'katana' :
        action === 'throw' ? 'throw' : action === 'pickup' ? 'pickup' : null;
      return webCue ? webCombatAccent(webCue, result, position) : result;
    };
    let cue = sceneAudio?.items?.[itemId]?.[action];
    if (!cue) return withItemAccent(report('blocked', action, {reason: 'native-item-cue-not-configured', itemId}));
    if (cue.alsoThrow) itemCue('throw', {itemId, position, realtimeSeconds});
    if (cue.prefab) {
      const origin = vector3(position, 'position');
      if (!origin) throw new TypeError('prefab position is required');
      return withItemAccent(playScenePrefab(cue.prefab, origin));
    }
    if (cue.choices) {
      const selection = randomUnit();
      const index = cue.selectionThreshold !== undefined
        ? (selection > cue.selectionThreshold && cue.choices[1]?.clipId ? 1 : 0)
        : Math.min(cue.choices.length - 1, Math.floor(selection * cue.choices.length));
      cue = cue.choices[index];
    }
    if (!cue?.clipId) return report('suppressed', action, {reason: 'source-null-clip', itemId});
    if (cue.realtimeCooldown) {
      finite(realtimeSeconds, 'realtimeSeconds');
      if (realtimeSeconds <= (sliceRest.get(itemId) ?? 0) + cue.realtimeCooldown) {
        return report('suppressed', action, {reason: 'native-slice-sound-rest', itemId});
      }
      sliceRest.set(itemId, realtimeSeconds);
    }
    const pitch = cue.pitchRandomization ? (cue.relativePitch
      ? cue.pitch * randomizedMultiplier(cue.pitchRandomization)
      : cue.pitch + randomUnit() * cue.pitchRandomization * 2 - cue.pitchRandomization) : cue.pitch;
    const gain = cue.gainRandomization ? cue.gain * randomizedMultiplier(cue.gainRandomization) : cue.gain;
    return withItemAccent(playMcdClip(action, cue.clipId, {...cue, gain, pitch}));
  }

  function playMcdClip(event, clipId, {
    gain, pitch = 1, position = null, maxDistance = 300,
    mixerGroup, priority = 128,
  }) {
    const intent = planMcdPlayClip({
      clipPresent: Boolean(CLIPS[clipId]),
      channelPresent: typeof mixerGroup === 'string' && mixerGroup.length > 0,
      // None of these six recovered producer calls chains SetCooldown.
      // A matching active source alone is not a native cooldown.
      cooldownActive: false,
      channelIsInterfaceSfx: mixerGroup === 'Interface SFX',
      bypassEffects: false,
      positionProvided: position !== null,
      isLooped: false,
      playDelaySeconds: 0,
      volume: gain,
      pitch,
      priority,
    });
    if (intent.status === MCD_PLAYCLIP_RESULT.EMPTY_EFFECT) {
      return blockedNative(event, clipId, intent.reason);
    }
    if (intent.status !== MCD_PLAYCLIP_RESULT.REQUEST) {
      throw new TypeError('PlayClip planner returned an unknown status');
    }
    const source = intent.audioSource;
    const delaySeconds = intent.request.operation === 'PlayDelayed'
      ? intent.request.delaySeconds
      : 0;
    // The current Web graph has no DSP/reverb chain to bypass. Claiming Unity
    // mixer bypass from these flags would be fake parity.
    return playNative(event, clipId, {
      gain: source.volume,
      pitch: source.pitch,
      position: source.spatialBlend === 1 ? position : null,
      maxDistance,
      mixerGroup,
      priority: source.priority,
      loop: source.loop,
      delaySeconds,
      zeroPitchWarning: intent.zeroPitchWarning,
    });
  }

  function setOriginalMode(enabled) {
    originalMode = boolean(enabled, 'enabled');
    if (!originalMode) {
      readyRequests.clear();
      for (const source of activeSources.keys()) {
        source.onended = null;
        try { source.stop(); } catch {}
      }
      activeSources.clear();
      ambienceSources.clear();
      stunRest.clear();
      sliceRest.clear();
      for (const pool of prefabPools.values()) {
        for (const slot of pool.used) { slot.source = null; pool.free.push(slot); }
        pool.used.length = 0;
      }
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
    return webCombatAccent('player-shot', playMcdClip('shoot',
      selected === 'alternate' ? 'pistolFireAlternate' : 'pistolFirePrimary', {
        gain,
        pitch,
        mixerGroup: 'Gunshots',
        priority: 1,
        position: vector3(position, 'position'),
      }), position);
  }

  function throwWeapon() {
    if (!originalMode) return proceduralShoot();
    // Pistol pickup4858 has no override: Weapon.Throw uses SFXThrow with
    // pitch1.5, then adds (not multiplies) its absolute ±0.2 randomization.
    const pitch = 1.5 + randomUnit() * 0.4 - 0.2;
    const gain = 0.8 * randomizedMultiplier(0.2);
    return webCombatAccent('throw', playMcdClip('throwWeapon', 'pistolThrow', {
      gain, pitch, mixerGroup: 'Env SFX',
    }));
  }

  function enemyShoot({position} = {}) {
    if (!originalMode) return proceduralEnemyShoot();
    return webCombatAccent('enemy-shot', playNative('enemyShoot', 'enemyFire', {
      gain: 0.800000011920929,
      mixerGroup: 'Gunshots',
      priority: 128,
      pitch: 1 + randomUnit() * 0.8 - 0.4,
      position: vector3(position, 'position'),
      maxDistance: 300,
    }), position);
  }

  function shatter({position} = {}) {
    if (!originalMode) return proceduralShatter();
    return webCombatAccent('shatter', playNative('shatter', 'enemyShatter', {
      gain: 1,
      mixerGroup: 'Env SFX',
      priority: 30,
      position: vector3(position, 'position'),
      maxDistance: 30,
    }), position);
  }

  function pickup({reloaded = false} = {}) {
    if (!originalMode) return proceduralPickup();
    boolean(reloaded, 'reloaded');
    const pitch = randomizedMultiplier(0.15);
    const gain = 0.9 * randomizedMultiplier(0.15);
    return webCombatAccent('pickup', playMcdClip('pickup',
      reloaded ? 'pistolPickupReloaded' : 'pistolPickup', {
        gain, pitch, mixerGroup: 'Env SFX',
      }));
  }

  function hit() {
    if (!originalMode) return proceduralHit();
    return playMcdClip('hit', 'playerHit', {
      gain: 0.699999988079071, mixerGroup: 'Interface SFX', priority: 128,
    });
  }

  function empty() {
    if (!originalMode) return proceduralEmpty();
    return playMcdClip('empty', 'pistolEmpty', {
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
    return playMcdClip('ready', 'pistolReady', {
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
        updateSpatialSource(source, state);
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
    listenerPosition = p;
    for (const [source, state] of activeSources) updateSpatialSource(source, state);
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

  // Actual grounded travel after collision resolution. The planner uses a
  // copied position (the camera itself is mutable), and an unscaled audio
  // clock. This is a Web-authored walking accent, not an MCD animation cue.
  function advanceFootsteps({position, grounded}) {
    if (!originalMode || !footstepMotion || ctx?.state !== 'running') {
      footstepMotion?.reset();
      return null;
    }
    try {
      const result = footstepMotion.advance({
        position: vector3(position, 'footstepPosition'),
        grounded, timeSeconds: ctx.currentTime,
      });
      if (result?.status === 'started') webStepCount++;
      return result;
    } catch (error) {
      // Never interrupt combat for optional Web sound design.
      footstepMotion.reset();
      return {status: 'blocked', reason: errorMessage(error)};
    }
  }

  function resetFootsteps() { footstepMotion?.reset(); }

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
      webAccentCount,
      webStepCount,
      lastWebAccent,
      webMixLevel: webMix?.getMixLevel() ?? null,
      webMixError,
      activeNativeSources: activeSources.size,
      sceneAmbienceSources: ambienceSources.size,
      nativeSceneAudioLimitations: sceneAudio?.limitations ?? [],
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
    configureSceneAudio,
    startSceneAmbience,
    stopSceneAmbience,
    itemCue,
    stun,
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
    advanceFootsteps,
    resetFootsteps,
    win,
    getMetrics,
  });
}
