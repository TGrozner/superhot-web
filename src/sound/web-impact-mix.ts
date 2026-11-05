/** SH-07: original Web sound design, NOT recovered MCD audio. */
export type WebImpactCue = 'player-shot' | 'enemy-shot' | 'impact' | 'wall-impact' | 'shatter' | 'player-hit'
  | 'katana' | 'katana-swing' | 'punch-swing' | 'punch-contact' | 'step' | 'landing' | 'pickup' | 'throw' | 'dodge' | 'dry-fire';
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
  readonly effects: AudioNode[];
  readonly gain: GainNode;
  readonly panner: PannerNode | null;
  readonly distanceFilter: BiquadFilterNode | null;
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
  // Synthetic Web room slapback, not a recovered Unity reflection or impulse response.
  // Post-spatialization send colors weapon/item and impact cues, not footsteps.
  // One shared delay/filter pair keeps node count constant during burst combat.
  const roomReflections: AudioNode[] = [];
  if (typeof context.createDelay === 'function') {
    const send = context.createGain();
    const delay = context.createDelay(0.25);
    const tone = context.createBiquadFilter();
    const returnGain = context.createGain();
    send.gain.value = 0.34;
    delay.delayTime.value = 0.09;
    tone.type = 'lowpass';
    tone.frequency.value = 2450;
    returnGain.gain.value = 0.34;
    weapons.connect(send);
    impacts.connect(send);
    send.connect(delay);
    delay.connect(tone);
    tone.connect(returnGain);
    returnGain.connect(dynamics);
    roomReflections.push(send, delay, tone, returnGain);
  }
  const noiseBed = context.createBuffer(1, Math.ceil(context.sampleRate * 0.5), context.sampleRate);
  const samples = noiseBed.getChannelData(0);
  let seed = 0x3ad9f12;
  for (let i = 0; i < samples.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    samples[i] = seed / 2147483648 - 1;
  }
  const voices = new Set<Voice>();
  const retired = new Set<Voice>();
  let drone: {osc: OscillatorNode; gain: GainNode} | null = null;
  let disposed = false;
  let mixLevel = 1;
  // Web-authored texture cycle: repeated rapid shots should not be sample-identical.
  let transientSerial = 0;
  // Web-original kill-chain color; do not count blocked/muted shatters.
  let lastShatterAt = -Infinity;
  let shatterChain = 0;

  /** Web-only output trim: 0 mutes synthetic accents, 1 preserves their original level. */
  function setMixLevel(level: number): void {
    if (!Number.isFinite(level) || level < 0 || level > 1) throw new RangeError('mixLevel 0..1');
    if (disposed) return;
    mixLevel = level;
    const at = context.currentTime;
    master.gain.cancelScheduledValues(at);
    master.gain.setTargetAtTime(0.76 * level, at, 0.025);
  }
  const priorityByCue: Record<WebImpactCue, number> = {
    // Creative Web mix priorities: damage feedback survives even shot bursts.
    'player-shot': 5, 'enemy-shot': 4, impact: 3, 'wall-impact': 4, shatter: 4,
    'player-hit': 6,
    katana: 5, 'katana-swing': 4, 'punch-swing': 3, 'punch-contact': 5,
        // Web-only F/E priority: player-initiated pickup/throw can displace an
    // older enemy shot, but cannot steal player fire or player damage.
    // These levels are not recovered Unity mixer priorities.
    step: 1, landing: 2, pickup: 4, throw: 4, dodge: 4, 'dry-fire': 5,
  };

  const attackByCue: Partial<Record<WebImpactCue, readonly [number, number, number]>> = {
    // Player damage: dark body + short bright contact, Web-original synthesis.
    // Layered Web attack: a short high-band crack rides the existing noise source.
    // No additional voice, no original MCD clip or recovered Unity equalization.
    'player-shot': [3700, 0.45, 0.022],
    'enemy-shot': [3900, 0.32, 0.019],
    impact: [2800, 0.48, 0.014],
    'wall-impact': [3600, 0.26, 0.015],
    'player-hit': [2600, 0.34, 0.032],
    shatter: [4800, 0.31, 0.043],
    katana: [3200, 0.32, 0.065],
    'punch-contact': [2400, 0.44, 0.018],
    landing: [1800, 0.21, 0.022],
    // WEB-ORIGINAL shoe-contact snap: adds definition above the muffled
    // footfall without a third source or Unity marker/clip claim.
    step: [1650, 0.45, 0.029],
  };

  function release(voice: Voice): void {
    voices.delete(voice);
    retired.delete(voice);
    for (const src of voice.sources) {
      src.onended = null;
      try { src.stop(); } catch { /* already ended */ }
      src.disconnect();
    }
    // Each transient owns processing nodes besides its source/output.
    // Disconnect on completed cue and on voice stealing: no dangling WebAudio graphs.
    for (const effect of voice.effects) effect.disconnect();
    voice.gain.disconnect();
    voice.panner?.disconnect();
    voice.distanceFilter?.disconnect();
  }

  // A stolen still-audible transient needs a short release to avoid a click.
  // Retired tails are capped separately to bound work during extreme bursts.
  function retire(voice: Voice): void {
    voices.delete(voice);
    if (retired.size >= 8) {
      const oldest = retired.values().next().value;
      if (oldest) release(oldest);
    }
    retired.add(voice);
    const at = context.currentTime;
    voice.gain.gain.cancelScheduledValues(at);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, at);
    voice.gain.gain.linearRampToValueAtTime(0, at + 0.008);
    for (const src of voice.sources) {
      try { src.stop(at + 0.008); } catch { /* already ended */ }
    }
  }

  function emit(cue: WebImpactCue, {position, intensity = 1}: WebImpactRequest = {}): WebImpactResult {
    const at = context.currentTime;
    if (!Number.isFinite(intensity) || intensity < 0 || intensity > 2) throw new RangeError('intensity 0..2');
    if (position && ![position.x, position.y, position.z].every(Number.isFinite)) {
      throw new TypeError('position must be finite');
    }
    if (disposed || context.state !== 'running' || intensity === 0 || mixLevel === 0) {
      return {status: 'blocked', source: 'web-original-synthesis', at: null, spatial: false};
    }
    const specs: Record<WebImpactCue, readonly [number, number, number, number, number]> = {
      // noise time, highpass Hz (negative = lowpass), pitch start/end, loudness
      'player-shot': [0.14, 540, 150, 52, 0.62],
      'enemy-shot': [0.11, 1050, 240, 90, 0.42],
      impact: [0.15, 1800, 580, 145, 0.45],
      'wall-impact': [0.16, 1900, 960, 240, 0.31],
      'player-hit': [0.22, -680, 142, 44, 0.52],
      shatter: [0.27, 2200, 1250, 220, 0.48],
      katana: [0.20, 1180, 1480, 325, 0.43],
      'katana-swing': [0.24, 1800, 490, 210, 0.33],
      'punch-swing': [0.16, 1200, 360, 130, 0.30],
      'punch-contact': [0.14, -850, 165, 56, 0.48],
      step: [0.075, -360, 108, 58, 0.22],
      landing: [0.15, -650, 145, 54, 0.40],
      pickup: [0.08, 1400, 510, 880, 0.23],
      throw: [0.17, 890, 540, 180, 0.28],
      'dry-fire': [0.105, 2150, 1250, 470, 0.20],
      dodge: [0.18, 1550, 980, 240, 0.30],
    };
    if (!Object.hasOwn(specs, cue)) throw new TypeError('unknown Web cue');
    const [duration, cutoff, startHz, endHz, volume] = specs[cue];
    // Web-only voice admission: distant enemy muzzles remain spatially playable
    // when free, but cannot steal local movement or confirmed impacts.
    // Share the 14m distance boundary with the existing footstep duck.
    // These priorities are Web design, not recovered Unity mixer policy.
    const lx = context.listener?.positionX?.value;
    const ly = context.listener?.positionY?.value;
    const lz = context.listener?.positionZ?.value;
    const listenerDistance = position && typeof context.createPanner === 'function' &&
        typeof lx === 'number' && Number.isFinite(lx) &&
        typeof ly === 'number' && Number.isFinite(ly) &&
        typeof lz === 'number' && Number.isFinite(lz)
        ? Math.hypot(position.x - lx, position.y - ly, position.z - lz) : null;
    const priority = cue === 'enemy-shot' && listenerDistance !== null &&
        listenerDistance > 14 ? 0 : priorityByCue[cue];
    if (voices.size >= maxVoices) {
      let victim: Voice | null = null;
      for (const voice of voices) {
        if (victim === null || voice.priority < victim.priority) victim = voice;
      }
      if (victim === null || victim.priority > priority) {
        return {status: 'blocked', source: 'web-original-synthesis', at: null, spatial: false};
      }
      retire(victim);
    }
    // Use real AudioContext time for successive confirmed death cues.
    // Creative Web feedback, not a recovered MCD combo rule or timer.
    if (cue === 'shatter') {
      const gap = at - lastShatterAt;
      shatterChain = gap >= 0 && gap <= 1.5 ? Math.min(3, shatterChain + 1) : 0;
      lastShatterAt = at;
    }
    // Each successful cue uses a fresh noise region and a subtle tonal detune.
    // The 0.5-second bed safely covers the longest 0.27s burst + 0.175s offset.
    const textureIndex = transientSerial++ % 8;
    const texturePitch = 1 + (textureIndex - 3.5) * 0.012;
    const out = context.createGain();
    out.gain.value = intensity;
    let panner: PannerNode | null = null;
    let distanceFilter: BiquadFilterNode | null = null;
    let enemyShotDistanceMetres: number | null = null;
    if (position && typeof context.createPanner === 'function') {
      panner = context.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 2.5;
      panner.maxDistance = 40;
      panner.rolloffFactor = 1.2;
      // The legacy PannerNode API has setPosition but no position AudioParams.
      // Without this fallback, located Web cues throw instead of sounding.
      if (typeof panner.positionX?.setValueAtTime === 'function' &&
          typeof panner.positionY?.setValueAtTime === 'function' &&
          typeof panner.positionZ?.setValueAtTime === 'function') {
        panner.positionX.setValueAtTime(position.x, at);
        panner.positionY.setValueAtTime(position.y, at);
        panner.positionZ.setValueAtTime(position.z, at);
      } else if (typeof panner.setPosition === 'function') {
        panner.setPosition(position.x, position.y, position.z);
      }
      // Original Web mix coloration, NOT a recovered Unity attenuation law.
      // A remote emitter has a softer transient. The existing camera listener
      // is updated by SH-05; browsers without position AudioParams fail open.
      const lx = context.listener?.positionX?.value;
      const ly = context.listener?.positionY?.value;
      const lz = context.listener?.positionZ?.value;
      if (lx !== undefined && ly !== undefined && lz !== undefined &&
        Number.isFinite(lx) && Number.isFinite(ly) && Number.isFinite(lz)) {
        const distance = Math.hypot(position.x - lx, position.y - ly, position.z - lz);
        enemyShotDistanceMetres = distance;
        const cutoff = Math.max(1200, Math.min(context.sampleRate * 0.45,
        18000 / (1 + distance * distance / 450)));
        distanceFilter = context.createBiquadFilter();
        distanceFilter.type = 'lowpass';
        distanceFilter.frequency.setValueAtTime(cutoff, at);
        distanceFilter.connect(panner);
      }
      out.connect(distanceFilter ?? panner);
      panner.connect((cue === 'step' || cue === 'landing') ? footsteps : cue === 'impact' || cue === 'wall-impact' || cue === 'shatter' || cue === 'player-hit' || cue === 'punch-contact' ? impacts : weapons);
    } else {
      out.connect((cue === 'step' || cue === 'landing') ? footsteps : cue === 'impact' || cue === 'wall-impact' || cue === 'shatter' || cue === 'player-hit' || cue === 'punch-contact' ? impacts : weapons);
    }
    const voice: Voice = {sources: [], effects: [], gain: out, panner, distanceFilter, pending: cue === 'shatter' ? 4 : cue === 'player-hit' ? 3 : 2, priority};
    voices.add(voice);
    const track = <T extends AudioNode>(node: T): T => {
      voice.effects.push(node);
      return node;
    };
    const ended = () => {
      voice.pending--;
      if (voice.pending === 0) release(voice);
    };
    const noise = context.createBufferSource();
    noise.buffer = noiseBed;
    const filter = track(context.createBiquadFilter());
    filter.type = cutoff < 0 ? 'lowpass' : 'highpass';
    filter.frequency.value = Math.abs(cutoff);
    const burst = track(context.createGain());
    burst.gain.setValueAtTime(volume * 0.8, at);
    burst.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    noise.connect(filter);
    filter.connect(burst);
    burst.connect(out);
    // WEB-ORIGINAL shatter body: a short low-frequency debris pressure pulse
    // behind the existing bright glass rings. Shares the noise source, HRTF
    // route and voice budget; NOT an extracted MCD recording or Unity curve.
    if (cue === 'shatter') {
      const debrisLow = track(context.createBiquadFilter());
      debrisLow.type = 'lowpass';
      debrisLow.frequency.value = Math.min(390, context.sampleRate * 0.24);
      const debris = track(context.createGain());
      debris.gain.setValueAtTime(0.0001, at);
      debris.gain.linearRampToValueAtTime(volume * 0.38, at + 0.014);
      debris.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
      noise.connect(debrisLow);
      debrisLow.connect(debris);
      debris.connect(out);
    }
    // WEB-ORIGINAL fist body: a compressed low thud after an accepted
    // melee contact. One existing noise source, voice and spatial route;
    // not a recovered Unity punch clip or source-authored envelope.
    if (cue === 'punch-contact') {
      const fistLow = track(context.createBiquadFilter());
      fistLow.type = 'lowpass';
      fistLow.frequency.value = Math.min(340, context.sampleRate * 0.28);
      const fistBody = track(context.createGain());
      fistBody.gain.setValueAtTime(0.0001, at);
      fistBody.gain.linearRampToValueAtTime(volume * 0.54, at + 0.012);
      fistBody.gain.exponentialRampToValueAtTime(0.0001, at + 0.115);
      noise.connect(fistLow);
      fistLow.connect(fistBody);
      fistBody.connect(out);
    }
    // Web-authored transient: audible snap on hits, no extra BufferSourceNode.
    // This layer shares the spatial path, gain trim and existing voice budget.
    const snap = attackByCue[cue];
    if (snap) {
      const [hz, weight, tail] = snap;
      const bright = track(context.createBiquadFilter());
      bright.type = cue === 'katana' ? 'bandpass' : 'highpass';
      bright.frequency.value = Math.min(hz, context.sampleRate * 0.43);
      const accent = track(context.createGain());
      accent.gain.setValueAtTime(volume * weight, at);
      accent.gain.exponentialRampToValueAtTime(0.0001, at + tail);
      noise.connect(bright);
      bright.connect(accent);
      accent.connect(out);
    }
    // Web-original enemy muzzle pressure: the delayed low-band burst adds
    // weight at the firing point, not a guessed projectile flyby or native clip.
    // It shares the existing noise source, HRTF routing and voice budget.
    if (cue === 'enemy-shot') {
      const pressureTone = track(context.createBiquadFilter());
      pressureTone.type = 'bandpass';
      pressureTone.frequency.value = Math.min(720, context.sampleRate * 0.35);
      const pressure = track(context.createGain());
      pressure.gain.setValueAtTime(0.0001, at);
      pressure.gain.linearRampToValueAtTime(volume * 0.45, at + 0.018);
      pressure.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      noise.connect(pressureTone);
      pressureTone.connect(pressure);
      pressure.connect(out);
    }
    // WEB-ORIGINAL mechanical slide tick AFTER the gunshot crack (not Unity data).
    // Gating the existing noise source adds no voices, buffers or timers.
    if (cue === 'player-shot') {
      const actionTone = track(context.createBiquadFilter());
      actionTone.type = 'bandpass';
      actionTone.frequency.value = Math.min(2600, context.sampleRate * 0.42);
      const action = track(context.createGain());
      action.gain.setValueAtTime(0.0001, at);
      action.gain.setValueAtTime(0.0001, at + 0.046);
      action.gain.linearRampToValueAtTime(volume * 0.32, at + 0.054);
      action.gain.exponentialRampToValueAtTime(0.0001, at + 0.098);
      noise.connect(actionTone);
      actionTone.connect(action);
      action.connect(out);
    }
    // WEB-ORIGINAL bullet-to-wall grit: short swept bandpass on existing noise.
    // Only for a RESOLVED wall contact; not a native MCD surface sample.
    // No additional source, clip, voice or proprietary material.
    if (cue === 'wall-impact') {
      const gritBand = track(context.createBiquadFilter());
      gritBand.type = 'bandpass';
      gritBand.frequency.setValueAtTime(Math.min(3100, context.sampleRate * 0.43), at);
      gritBand.frequency.exponentialRampToValueAtTime(Math.min(1050, context.sampleRate * 0.23), at + duration);
      const grit = track(context.createGain());
      grit.gain.setValueAtTime(volume * 0.31, at);
      grit.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      noise.connect(gritBand);
      gritBand.connect(grit);
      grit.connect(out);
    }
    // WEB-ORIGINAL dry-fire: the short two-click action uses the current noise
    // source and voice, not a guessed MCD clip or extra WebAudio source.
    // SH-05's empty() bridge may overlay this on the identified native WAV.
    if (cue === 'dry-fire') {
      const actionBand = track(context.createBiquadFilter());
      actionBand.type = 'bandpass';
      actionBand.frequency.value = Math.min(2800, context.sampleRate * 0.42);
      const click = track(context.createGain());
      click.gain.setValueAtTime(0.0001, at);
      click.gain.linearRampToValueAtTime(volume * 0.58, at + 0.003);
      click.gain.exponentialRampToValueAtTime(0.0001, at + 0.020);
      click.gain.setValueAtTime(0.0001, at + 0.054);
      click.gain.linearRampToValueAtTime(volume * 0.30, at + 0.060);
      click.gain.exponentialRampToValueAtTime(0.0001, at + 0.092);
      noise.connect(actionBand);
      actionBand.connect(click);
      click.connect(out);
    }
    // WEB-ORIGINAL pickup latch: two quick mechanical ticks on the SAME noise
    // source and voice as the existing pickup accent. This is not a recovered
    // Unity pickup recording or timing; the published source WAV stays distinct.
    if (cue === 'pickup') {
      const latchBand = track(context.createBiquadFilter());
      latchBand.type = 'bandpass';
      latchBand.frequency.value = Math.min(2300, context.sampleRate * 0.42);
      const latch = track(context.createGain());
      latch.gain.setValueAtTime(0.0001, at);
      latch.gain.linearRampToValueAtTime(volume * 0.50, at + 0.004);
      latch.gain.exponentialRampToValueAtTime(0.0001, at + 0.019);
      latch.gain.setValueAtTime(0.0001, at + 0.046);
      latch.gain.linearRampToValueAtTime(volume * 0.36, at + 0.052);
      latch.gain.exponentialRampToValueAtTime(0.0001, at + 0.077);
      noise.connect(latchBand);
      latchBand.connect(latch);
      latch.connect(out);
    }
    // Web-original airborne weapon swish, NOT a recovered MCD throw sample.
    // A descending band of the existing noise buffer follows the release.
    // This adds no scheduled source, voice, timer or proprietary asset.
    if (cue === 'throw') {
      const swish = track(context.createBiquadFilter());
      swish.type = 'bandpass';
      swish.frequency.setValueAtTime(Math.min(3100, context.sampleRate * 0.43), at);
      swish.frequency.exponentialRampToValueAtTime(Math.min(800, context.sampleRate * 0.23), at + duration);
      const air = track(context.createGain());
      air.gain.setValueAtTime(0.0001, at);
      air.gain.linearRampToValueAtTime(volume * 0.38, at + 0.018);
      air.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      noise.connect(swish);
      swish.connect(air);
      air.connect(out);
    }
    // WEB-original sword air sweep on SWING, distinct from Katana's hit/slice cue.
    // No Unity timing, original clip, new source voice, or implied native audition.
    if (cue === 'katana-swing') {
      const sweep = track(context.createBiquadFilter());
      sweep.type = 'bandpass';
      sweep.frequency.setValueAtTime(Math.min(3400, context.sampleRate * 0.43), at);
      sweep.frequency.exponentialRampToValueAtTime(Math.min(850, context.sampleRate * 0.23), at + duration);
      const air = track(context.createGain());
      air.gain.setValueAtTime(0.0001, at);
      air.gain.linearRampToValueAtTime(volume * 0.55, at + 0.03);
      air.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      noise.connect(sweep);
      sweep.connect(air);
      air.connect(out);
    }
    // Web-original fist air sweep: intentionally separate from confirmed contact.
    // No native MCD clip is inferred, and no extra source or voice is allocated.
    if (cue === 'punch-swing') {
      const airFilter = track(context.createBiquadFilter());
      airFilter.type = 'bandpass';
      airFilter.frequency.setValueAtTime(Math.min(2300, context.sampleRate * 0.43), at);
      airFilter.frequency.exponentialRampToValueAtTime(Math.min(740, context.sampleRate * 0.23), at + duration);
      const air = track(context.createGain());
      air.gain.setValueAtTime(0.0001, at);
      air.gain.linearRampToValueAtTime(volume * 0.48, at + 0.028);
      air.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      noise.connect(airFilter);
      airFilter.connect(air);
      air.connect(out);
    }
    // WEB-original two-stage landing contact: weighted heel then softer sole.
    // Uses the existing landing noise source, spatial emitter and footstep bus.
    // Timing/EQ are creative Web tuning, not Unity footsteps or native clips.
    if (cue === 'landing') {
      const floorWeight = track(context.createBiquadFilter());
      floorWeight.type = 'lowpass';
      floorWeight.frequency.value = Math.min(460, context.sampleRate * 0.28);
      const heelToe = track(context.createGain());
      heelToe.gain.setValueAtTime(0.0001, at);
      heelToe.gain.linearRampToValueAtTime(volume * 0.36, at + 0.013);
      heelToe.gain.exponentialRampToValueAtTime(0.0001, at + 0.047);
      heelToe.gain.setValueAtTime(0.0001, at + 0.053);
      heelToe.gain.linearRampToValueAtTime(volume * 0.19, at + 0.071);
      heelToe.gain.exponentialRampToValueAtTime(0.0001, at + 0.114);
      noise.connect(floorWeight);
      floorWeight.connect(heelToe);
      heelToe.connect(out);
    }
    // WEB-ORIGINAL clean-dodge zip. Call only after a confirmed no-hit near miss;
    // this is NOT MCD bullet audio or a recovered Unity playback parameter.
    // Same noise source, HRTF output and existing bounded voice budget.
    if (cue === 'dodge') {
      const zip = track(context.createBiquadFilter());
      zip.type = 'bandpass';
      zip.frequency.setValueAtTime(Math.min(5200, context.sampleRate * 0.43), at);
      zip.frequency.exponentialRampToValueAtTime(Math.min(1050, context.sampleRate * 0.23), at + duration);
      const air = track(context.createGain());
      air.gain.setValueAtTime(0.0001, at);
      air.gain.linearRampToValueAtTime(volume * 0.55, at + 0.012);
      air.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      noise.connect(zip);
      zip.connect(air);
      air.connect(out);
    }
    noise.onended = ended;
    voice.sources.push(noise);
    noise.start(at, textureIndex * 0.025, duration);
    const osc = context.createOscillator();
    osc.type = cue === 'player-shot' || cue === 'enemy-shot' ? 'sawtooth' :
      cue === 'katana' || cue === 'wall-impact' ? 'sine' : 'triangle';
    const body = track(context.createGain());
    if (cue === 'katana') {
      // WEB-ORIGINAL steel contact: a bright attack settles into a short
      // metallic tail. The confirmed slice uses its existing oscillator,
      // HRTF output and voice; this is NOT native MCD clip equalization.
      osc.frequency.setValueAtTime(1850 * texturePitch, at);
      osc.frequency.exponentialRampToValueAtTime(1340 * texturePitch, at + 0.07);
      osc.frequency.exponentialRampToValueAtTime(610 * texturePitch, at + duration);
      body.gain.setValueAtTime(0.0001, at);
      body.gain.linearRampToValueAtTime(volume * 0.68, at + 0.008);
      body.gain.exponentialRampToValueAtTime(volume * 0.18, at + 0.065);
      body.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    } else if (cue === 'wall-impact') {
      // WEB-ORIGINAL falling ricochet chirp on confirmed world collision.
      // This reuses the same oscillator and voice as the wall grit; no new clip.
      // Neither surface material nor these acoustic values come from MCD.
      osc.frequency.setValueAtTime(1950 * texturePitch, at);
      osc.frequency.exponentialRampToValueAtTime(750 * texturePitch, at + duration);
      body.gain.setValueAtTime(0.0001, at);
      body.gain.linearRampToValueAtTime(volume * 0.40, at + 0.008);
      body.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    } else {
      osc.frequency.setValueAtTime(startHz * texturePitch, at);
      osc.frequency.exponentialRampToValueAtTime(endHz * texturePitch, at + duration);
      body.gain.setValueAtTime(volume * 0.48, at);
      body.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    }
    osc.connect(body);
    body.connect(out);
    osc.onended = ended;
    voice.sources.push(osc);
    osc.start(at);
    osc.stop(at + duration);
    // Web-authored short ear ring on player damage. It trails the impact
    // without changing the native hit clip, mixer routing or voice budget.
    // The pitch and envelope are original Web sound design, NOT Unity data.
    if (cue === 'player-hit') {
      const ring = context.createOscillator();
      ring.type = 'sine';
      ring.frequency.setValueAtTime(970 * texturePitch, at);
      ring.frequency.exponentialRampToValueAtTime(570 * texturePitch, at + 0.42);
      const ringGain = track(context.createGain());
      ringGain.gain.setValueAtTime(0.0001, at);
      ringGain.gain.linearRampToValueAtTime(volume * 0.115, at + 0.024);
      ringGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.42);
      ring.connect(ringGain);
      ringGain.connect(out);
      ring.onended = ended;
      voice.sources.push(ring);
      ring.start(at);
      ring.stop(at + 0.42);
    }
    // Web-original crystalline kill chain: each rapid shatter raises the two
    // inharmonic rings, and a delayed glint separates break from falling glass.
    // Only already-present oscillators/gains; no additional sources or assets.
    if (cue === 'shatter') {
        const pitchLift = 1 + shatterChain * 0.085;
        const levelLift = 1 + shatterChain * 0.12;
        const glassTones = [
            { hz: 1540, tail: 0.36, level: 0.26, onset: 0 },
            { hz: 2690, tail: 0.23, level: 0.18, onset: 0.047 },
        ];
        for (const tone of glassTones) {
            const ringAt = at + tone.onset;
            const ring = context.createOscillator();
            ring.type = 'sine';
            ring.frequency.setValueAtTime(tone.hz * texturePitch * pitchLift, ringAt);
            ring.frequency.exponentialRampToValueAtTime(tone.hz * texturePitch * pitchLift * 0.985, ringAt + tone.tail);
            const ringGain = track(context.createGain());
            ringGain.gain.setValueAtTime(0.0001, at);
            ringGain.gain.setValueAtTime(0.0001, ringAt);
            ringGain.gain.linearRampToValueAtTime(volume * tone.level * levelLift, ringAt + 0.008);
            ringGain.gain.exponentialRampToValueAtTime(0.0001, ringAt + tone.tail);
            ring.connect(ringGain);
            ringGain.connect(out);
            ring.onended = ended;
            voice.sources.push(ring);
            ring.start(ringAt);
            ring.stop(ringAt + tone.tail);
        }
    }
    if (cue !== 'step' && cue !== 'landing') {
      ambient.gain.cancelScheduledValues(at);
      ambient.gain.setTargetAtTime(0.03, at, 0.015);
      ambient.gain.setTargetAtTime(0.13, at + 0.14, 0.22);
      // WEB-ORIGINAL combat clarity: transient shots and confirmed contacts
      // briefly duck synthetic footsteps, never source-backed scene WAVs.
      // Movement cues and pickup/throw do not lower the walking bus.
      // WEB-ORIGINAL near-field sidechain: far-away enemy fire is already HRTF/
      // distance-attenuated; it must not repeatedly mask local movement.
      // 14 metres is a creative Web threshold, NOT a Unity audio value.
      if ((cue !== 'enemy-shot' || enemyShotDistanceMetres === null || enemyShotDistanceMetres <= 14) &&
          (cue === 'player-shot' || cue === 'enemy-shot' || cue === 'player-hit' ||
          cue === 'impact' || cue === 'wall-impact' || cue === 'shatter' || cue === 'katana' ||
          cue === 'punch-contact' || cue === 'dodge' || cue === 'dry-fire')) {
        footsteps.gain.cancelScheduledValues(at);
        footsteps.gain.setTargetAtTime(0.10, at, 0.012);
        footsteps.gain.setTargetAtTime(0.3, at + 0.14, 0.18);
      }
    }
    return {status: 'started', source: 'web-original-synthesis', at, spatial: panner !== null};
  }

  function startAmbience(): boolean {
    if (drone || disposed || context.state !== 'running' || mixLevel === 0) return false;
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
    for (const voice of [...voices, ...retired]) release(voice);
    for (const node of roomReflections) node.disconnect();
    for (const bus of [weapons, impacts, footsteps, ambient]) bus.disconnect();
    dynamics.disconnect();
    master.disconnect();
  }

  return Object.freeze({emit, startAmbience, stopAmbience, dispose, setMixLevel,
    getMixLevel: () => mixLevel, getActiveVoices: () => voices.size});
}
