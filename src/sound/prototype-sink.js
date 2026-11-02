// Adapter for synthetic browser-only audio. No original game media.
import { SOUND_EVIDENCE } from './timeline.js';
export const PROTOTYPE_SOUND_NAMES = Object.freeze(['shoot','enemyShoot','shatter','pickup','hit','empty','win']);
const allowed = new Set(PROTOTYPE_SOUND_NAMES);

// Only explicitly PROTOTYPE events are eligible. A native/unverified event
// with the same name must not silently play the Web placeholder.
// true means only that the synth method was invoked, not that audio was heard.
export function createPrototypeSoundSink(audio) {
  if (!audio || typeof audio !== 'object') throw new TypeError('audio interface required');
  return (event) => {
    if (!event || event.evidence !== SOUND_EVIDENCE.PROTOTYPE || !allowed.has(event.name)) return false;
    const method = audio[event.name];
    if (typeof method !== 'function') return false;
    const result = method.call(audio);
    // The Web synth contract is synchronous. The browser audio methods in
    // src/audio.js return void; an async replacement must not be counted as
    // accepted before its Promise settles (or rejects without an observer).
    if (result !== null && (typeof result === 'object' || typeof result === 'function') &&
        typeof result.then === 'function') {
      void Promise.resolve(result).catch(() => {});
      throw new TypeError('synthetic sound method must be synchronous');
    }
    return true;
  };
}
