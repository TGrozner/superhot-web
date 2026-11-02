// Adapter for synthetic browser-only audio. No original game media.
export const PROTOTYPE_SOUND_NAMES = Object.freeze(['shoot','enemyShoot','shatter','pickup','hit','empty','win']);
const allowed = new Set(PROTOTYPE_SOUND_NAMES);

// true means only that the synth method was invoked, not that audio was heard.
export function createPrototypeSoundSink(audio) {
  if (!audio || typeof audio !== 'object') throw new TypeError('audio interface required');
  return (event) => {
    if (!event || !allowed.has(event.name)) return false;
    const method = audio[event.name];
    if (typeof method !== 'function') return false;
    method.call(audio);
    return true;
  };
}
