/**
 * Plug into the EXISTING gesture-unlocked AudioContext; SH-05 owns the bridge.
 * Compressor, short noise transient, pitched body, HRTF emitter, voice cap,
 * ambient ducking. All values below are creative Web tunings, NOT Unity data.
 * Status started means sources scheduled; it does not prove human audibility.
 */
export function createWebImpactMix(context, maxVoices = 24) {
    if (!context || typeof context.createGain !== 'function')
        throw new TypeError('AudioContext required');
    if (!Number.isInteger(maxVoices) || maxVoices < 1 || maxVoices > 64)
        throw new RangeError('maxVoices 1..64');
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
    for (const bus of [weapons, impacts, footsteps, ambient])
        bus.connect(dynamics);
    // Synthetic Web room slapback, not a recovered Unity reflection or impulse response.
    // Post-spatialization send colors weapon/item and impact cues, not footsteps.
    // One shared delay/filter pair keeps node count constant during burst combat.
    const roomReflections = [];
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
    const voices = new Set();
    const retired = new Set();
    let drone = null;
    let disposed = false;
    let mixLevel = 1;
    // Web-authored texture cycle: repeated rapid shots should not be sample-identical.
    let transientSerial = 0;
    /** Web-only output trim: 0 mutes synthetic accents, 1 preserves their original level. */
    function setMixLevel(level) {
        if (!Number.isFinite(level) || level < 0 || level > 1)
            throw new RangeError('mixLevel 0..1');
        if (disposed)
            return;
        mixLevel = level;
        const at = context.currentTime;
        master.gain.cancelScheduledValues(at);
        master.gain.setTargetAtTime(0.76 * level, at, 0.025);
    }
    const priorityByCue = {
        // Creative Web mix priorities: melee/player fire survive overlapping steps.
        'player-shot': 5, 'enemy-shot': 4, impact: 3, shatter: 4,
        katana: 5, step: 1, pickup: 2, throw: 3,
    };
    const attackByCue = {
        // Layered Web attack: a short high-band crack rides the existing noise source.
        // No additional voice, no original MCD clip or recovered Unity equalization.
        'player-shot': [3700, 0.45, 0.022],
        'enemy-shot': [3900, 0.32, 0.019],
        impact: [2800, 0.48, 0.014],
        shatter: [4800, 0.31, 0.043],
        katana: [3200, 0.32, 0.065],
    };
    function release(voice) {
        voices.delete(voice);
        retired.delete(voice);
        for (const src of voice.sources) {
            src.onended = null;
            try {
                src.stop();
            }
            catch { /* already ended */ }
            src.disconnect();
        }
        voice.gain.disconnect();
        voice.panner?.disconnect();
        voice.distanceFilter?.disconnect();
    }
    // A stolen still-audible transient needs a short release to avoid a click.
    // Retired tails are capped separately to bound work during extreme bursts.
    function retire(voice) {
        voices.delete(voice);
        if (retired.size >= 8) {
            const oldest = retired.values().next().value;
            if (oldest)
                release(oldest);
        }
        retired.add(voice);
        const at = context.currentTime;
        voice.gain.gain.cancelScheduledValues(at);
        voice.gain.gain.setValueAtTime(voice.gain.gain.value, at);
        voice.gain.gain.linearRampToValueAtTime(0, at + 0.008);
        for (const src of voice.sources) {
            try {
                src.stop(at + 0.008);
            }
            catch { /* already ended */ }
        }
    }
    function emit(cue, { position, intensity = 1 } = {}) {
        const at = context.currentTime;
        if (!Number.isFinite(intensity) || intensity < 0 || intensity > 2)
            throw new RangeError('intensity 0..2');
        if (position && ![position.x, position.y, position.z].every(Number.isFinite)) {
            throw new TypeError('position must be finite');
        }
        if (disposed || context.state !== 'running' || intensity === 0 || mixLevel === 0) {
            return { status: 'blocked', source: 'web-original-synthesis', at: null, spatial: false };
        }
        const specs = {
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
        if (!Object.hasOwn(specs, cue))
            throw new TypeError('unknown Web cue');
        const [duration, cutoff, startHz, endHz, volume] = specs[cue];
        const priority = priorityByCue[cue];
        if (voices.size >= maxVoices) {
            let victim = null;
            for (const voice of voices) {
                if (victim === null || voice.priority < victim.priority)
                    victim = voice;
            }
            if (victim === null || victim.priority > priority) {
                return { status: 'blocked', source: 'web-original-synthesis', at: null, spatial: false };
            }
            retire(victim);
        }
        // Each successful cue uses a fresh noise region and a subtle tonal detune.
        // The 0.5-second bed safely covers the longest 0.27s burst + 0.175s offset.
        const textureIndex = transientSerial++ % 8;
        const texturePitch = 1 + (textureIndex - 3.5) * 0.012;
        const out = context.createGain();
        out.gain.value = intensity;
        let panner = null;
        let distanceFilter = null;
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
            // Original Web mix coloration, NOT a recovered Unity attenuation law.
            // A remote emitter has a softer transient. The existing camera listener
            // is updated by SH-05; browsers without position AudioParams fail open.
            const lx = context.listener?.positionX?.value;
            const ly = context.listener?.positionY?.value;
            const lz = context.listener?.positionZ?.value;
            if (lx !== undefined && ly !== undefined && lz !== undefined &&
                Number.isFinite(lx) && Number.isFinite(ly) && Number.isFinite(lz)) {
                const distance = Math.hypot(position.x - lx, position.y - ly, position.z - lz);
                const cutoff = Math.max(1200, Math.min(context.sampleRate * 0.45, 18000 / (1 + distance * distance / 450)));
                distanceFilter = context.createBiquadFilter();
                distanceFilter.type = 'lowpass';
                distanceFilter.frequency.setValueAtTime(cutoff, at);
                distanceFilter.connect(panner);
            }
            out.connect(distanceFilter ?? panner);
            panner.connect(cue === 'step' ? footsteps : cue === 'impact' || cue === 'shatter' ? impacts : weapons);
        }
        else {
            out.connect(cue === 'step' ? footsteps : cue === 'impact' || cue === 'shatter' ? impacts : weapons);
        }
        const voice = { sources: [], gain: out, panner, distanceFilter, pending: 2, priority };
        voices.add(voice);
        const ended = () => {
            voice.pending--;
            if (voice.pending === 0)
                release(voice);
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
        // Web-authored transient: audible snap on hits, no extra BufferSourceNode.
        // This layer shares the spatial path, gain trim and existing voice budget.
        const snap = attackByCue[cue];
        if (snap) {
          const [hz, weight, tail] = snap;
          const bright = context.createBiquadFilter();
          bright.type = cue === 'katana' ? 'bandpass' : 'highpass';
          bright.frequency.value = Math.min(hz, context.sampleRate * 0.43);
          const accent = context.createGain();
          accent.gain.setValueAtTime(volume * weight, at);
          accent.gain.exponentialRampToValueAtTime(0.0001, at + tail);
          noise.connect(bright);
          bright.connect(accent);
          accent.connect(out);
        }
        noise.onended = ended;
        voice.sources.push(noise);
        noise.start(at, textureIndex * 0.025, duration);
        const osc = context.createOscillator();
        osc.type = cue === 'player-shot' || cue === 'enemy-shot' ? 'sawtooth' : 'triangle';
        osc.frequency.setValueAtTime(startHz * texturePitch, at);
        osc.frequency.exponentialRampToValueAtTime(endHz * texturePitch, at + duration);
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
        return { status: 'started', source: 'web-original-synthesis', at, spatial: panner !== null };
    }
    function startAmbience() {
        if (drone || disposed || context.state !== 'running' || mixLevel === 0)
            return false;
        const osc = context.createOscillator();
        const gain = context.createGain();
        osc.type = 'sine';
        osc.frequency.value = 57;
        gain.gain.setValueAtTime(0.0001, context.currentTime);
        gain.gain.linearRampToValueAtTime(0.15, context.currentTime + 0.35);
        osc.connect(gain);
        gain.connect(ambient);
        osc.start();
        drone = { osc, gain };
        return true;
    }
    function stopAmbience() {
        if (!drone)
            return;
        const { osc, gain } = drone;
        drone = null;
        gain.gain.cancelScheduledValues(context.currentTime);
        gain.gain.setTargetAtTime(0.0001, context.currentTime, 0.05);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
        osc.stop(context.currentTime + 0.3);
    }
    function dispose() {
        if (disposed)
            return;
        stopAmbience();
        disposed = true;
        for (const voice of [...voices, ...retired])
            release(voice);
        for (const node of roomReflections)
            node.disconnect();
        for (const bus of [weapons, impacts, footsteps, ambient])
            bus.disconnect();
        dynamics.disconnect();
        master.disconnect();
    }
    return Object.freeze({ emit, startAmbience, stopAmbience, dispose, setMixLevel,
        getMixLevel: () => mixLevel, getActiveVoices: () => voices.size });
}
