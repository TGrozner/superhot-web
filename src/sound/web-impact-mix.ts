/** SH-07: original Web sound design, NOT recovered MCD audio. */
export type WebImpactCue = 'player-shot' | 'enemy-shot' | 'impact' | 'shatter'
  | 'katana' | 'step' | 'pickup' | 'throw';
export interface WebImpactPoint {readonly x: number; readonly y: number; readonly z: number}
export interface WebImpactRequest {readonly position?: WebImpactPoint; readonly intensity?: number}
export interface WebImpactResult {
  readonly status: 'started' | 'blocked';
  readonly source: 'web-original-synthesis';
  readonly at: number | null;
  readonly spatial: boolean;
}
interface Voice {
  readonly sources: AudioScheduledSourceNode[];
  readonly gain: GainNode;
  readonly panner: PannerNode | null;
  readonly priority: number;
  pending: number;
}

/**
 * Plug into the EXISTING gesture-unlocked AudioContext; SH-05 owns the bridge.
 * Compressor, short noise transient, pitched body, HRTF emitter, voice cap,
 * ambient ducking. All values below are creative Web tunings, NOT Unity data.
 * Status started means sources scheduled; it does not prove human audibility.
 */
export function createWebImpactMix(context: AudioContext, maxVoices = 24) {
  if (!context || typeof context.createGain !== 'function') throw new TypeError('AudioContext required');
  if (!Number.isInteger(maxVoices) || maxVoices < 1 || maxVoices > 64) throw new RangeError('maxVoices 1..64');
  const dynamics = context.createDynamicsCompressor();
  dynamics.threshold.value = -18;
  dynamics.ratio.value = 7;
  dynamics.attack.value = 0.003;
  dynamics.release.value = 0.18;
  const master = context.createGain();
  master.gain.value = 0.76;
  dynamics.connect(master);
  master.connect(context.destination);
  const weapons = context.createGain();
  const impacts = context.createGain();
  const footsteps = context.createGain();
  const ambient = context.createGain();
  weapons.gain.value = 0.9;
  impacts.gain.value = 0.8;
  footsteps.gain.value = 0.3;
  ambient.gain.value = 0.13;
  for (const bus of [weapons, impacts, footsteps, ambient]) bus.connect(dynamics);
  const noiseBed = context.createBuffer(1, Math.ceil(context.sampleRate * 0.5), context.sampleRate);
  const samples = noiseBed.getChannelData(0);
  let seed = 0x3ad9f12;
  for (let i = 0; i < samples.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    samples[i] = seed / 2147483648 - 1;
  }
  const voices = new Set<Voice>();
  let drone: {osc: OscillatorNode; gain: GainNode} | null = null;
  let disposed = false;
  let variationIndex = 0;
  // Creative Web variation: repeat hits should not share the exact same waveform.
  const priorityByCue: Record<WebImpactCue, number> = {
    // Creative Web mix priorities: melee/player fire survive overlapping steps.
    'player-shot': 5, 'enemy-shot': 4, impact: 3, shatter: 4,
    katana: 5, step: 1, pickup: 2, throw: 3,
  };

  function release(voice: Voice): void {
    voices.delete(voice);
    for (const src of voice.sources) {
      src.onended = null;
      try { src.stop(); } catch { /* already ended */ }
      src.disconnect();
    }
    voice.gain.disconnect();
    voice.panner?.disconnect();
  }

  function emit(cue: WebImpactCue, {position, intensity = 1}: WebImpactRequest = {}): WebImpactResult {
    const at = context.currentTime;
    if (!Number.isFinite(intensity) || intensity < 0 || intensity > 2) throw new RangeError('intensity 0..2');
    if (position && ![position.x, position.y, position.z].every(Number.isFinite)) {
      throw new TypeError('position must be finite');
    }
    if (disposed || context.state !== 'running' || intensity === 0) {
      return {status: 'blocked', source: 'web-original-synthesis', at: null, spatial: false};
    }
    const specs: Record<WebImpactCue, readonly [number, number, number, number, number]> = {
      // noise time, highpass Hz (negative = lowpass), pitch start/end, loudness
      'player-shot': [0.14, 540, 150, 52, 0.62],
      'enemy-shot': [0.11, 1050, 240, 90, 0.42],
      impact: [0.15, 1800, 580, 145, 0.45],
      shatter: [0.27, 2200, 1250, 220, 0.48],
      katana: [0.20, 1180, 1480, 325, 0.43],
      step: [0.075, -360, 108, 58, 0.22],
      pickup: [0.08, 1400, 510, 880, 0.23],
      throw: [0.17, 890, 540, 180, 0.28],
    };
    if (!Object.hasOwn(specs, cue)) throw new TypeError('unknown Web cue');
    const [duration, cutoff, startHz, endHz, volume] = specs[cue];
    const priority = priorityByCue[cue];
    if (voices.size >= maxVoices) {
      let victim: Voice | null = null;
      for (const voice of voices) {
        if (victim === null || voice.priority < victim.priority) victim = voice;
      }
      if (victim === null || victim.priority > priority) {
        return {status: 'blocked', source: 'web-original-synthesis', at: null, spatial: false};
      }
      release(victim);
    }
    const out = context.createGain();
    out.gain.value = intensity;
    let panner: PannerNode | null = null;
    if (position && typeof context.createPanner === 'function') {
      panner = context.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 2.5;
      panner.maxDistance = 40;
      panner.rolloffFactor = 1.2;
      panner.positionX.setValueAtTime(position.x, at);
      panner.positionY.setValueAtTime(position.y, at);
      panner.positionZ.setValueAtTime(position.z, at);
      out.connect(panner);
      panner.connect(cue === 'step' ? footsteps : cue === 'impact' || cue === 'shatter' ? impacts : weapons);
    } else {
      out.connect(cue === 'step' ? footsteps : cue === 'impact' || cue === 'shatter' ? impacts : weapons);
    }
    const voice: Voice = {sources: [], gain: out, panner, pending: 2, priority};
    voices.add(voice);
    const variation = variationIndex++;
    const noiseOffsetSeconds = (variation % 8) * 0.025;
    const pitchScale = 0.97 + (variation % 7) * 0.01;
    const ended = () => {
      voice.pending--;
      if (voice.pending === 0) release(voice);
    };
    const noise = context.createBufferSource();
    noise.buffer = noiseBed;
    const filter = context.createBiquadFilter();
    filter.type = cutoff < 0 ? 'lowpass' : 'highpass';
    filter.frequency.value = Math.abs(cutoff);
    const burst = context.createGain();
    burst.gain.setValueAtTime(volume * 0.8, at);
    burst.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    noise.connect(filter);
    filter.connect(burst);
    burst.connect(out);
    noise.onended = ended;
    voice.sources.push(noise);
    noise.start(at, noiseOffsetSeconds, duration);
    const osc = context.createOscillator();
    osc.type = cue === 'player-shot' || cue === 'enemy-shot' ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime(startHz * pitchScale, at);
    osc.frequency.exponentialRampToValueAtTime(endHz * pitchScale, at + duration);
    const body = context.createGain();
    body.gain.setValueAtTime(volume * 0.48, at);
    body.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(body);
    body.connect(out);
    osc.onended = ended;
    voice.sources.push(osc);
    osc.start(at);
    osc.stop(at + duration);
    if (cue !== 'step') {
      ambient.gain.cancelScheduledValues(at);
      ambient.gain.setTargetAtTime(0.03, at, 0.015);
      ambient.gain.setTargetAtTime(0.13, at + 0.14, 0.22);
    }
    return {status: 'started', source: 'web-original-synthesis', at, spatial: panner !== null};
  }

  function startAmbience(): boolean {
    if (drone || disposed || context.state !== 'running') return false;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = 'sine';
    osc.frequency.value = 57;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.linearRampToValueAtTime(0.15, context.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ambient);
    osc.start();
    drone = {osc, gain};
    return true;
  }

  function stopAmbience(): void {
    if (!drone) return;
    const {osc, gain} = drone;
    drone = null;
    gain.gain.cancelScheduledValues(context.currentTime);
    gain.gain.setTargetAtTime(0.0001, context.currentTime, 0.05);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    osc.stop(context.currentTime + 0.3);
  }

  function dispose(): void {
    if (disposed) return;
    stopAmbience();
    disposed = true;
    for (const voice of [...voices]) release(voice);
    for (const bus of [weapons, impacts, footsteps, ambient]) bus.disconnect();
    dynamics.disconnect();
    master.disconnect();
  }

  return Object.freeze({emit, startAmbience, stopAmbience, dispose,
    getActiveVoices: () => voices.size});
}
