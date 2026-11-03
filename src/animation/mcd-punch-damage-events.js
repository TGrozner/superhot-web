/**
 * Source-identified MCD fist-punch AnimationEvent requests, not hit detection.
 * Source clips: sharedassets0.assets:429/440/448/457/468/475/483/489 (build 20299547).
 * Bounded serialized event writes: private research #46, artifact 13135780460.
 * Receiver method contract: #152, artifact 13178856534,
 * PejAiAnimator.cs:1501-1509; native event interval: #29.
 *
 * It supports only the eight explicitly measured source fist clips, not aliases.
 * This adapter deliberately requires positive evidence for the actor, clip,
 * prepared event interval, active GameObject and receiver. It DOES NOT resolve
 * Unity's clip time, crossfade, weight, culling, binding, or hitbox itself.
 */
import { scanNativeEventInterval } from './native-event-interval.js';

// Source serialized MeleeDamageStart/End writes for eight source fist variants.
// These are clip seconds, NEVER wall-clock estimates or proof that the Dojo
// actor selected a particular clip. Private research #46 / artifact 13135780460.
const CLIP_OWNER = 'sharedassets0.assets';
const WINDOWS = Object.freeze({
  429: Object.freeze([0.4686083197593689, 0.7319236993789673]), // Fist 01
  440: Object.freeze([0.36084142327308655, 0.5744336247444153]), // Fist 03
  448: Object.freeze([0.2970873713493347, 0.41553398966789246]), // Fist 02
  457: Object.freeze([0.3728155493736267, 0.4535922706127167]), // Fist 04
  468: Object.freeze([0.4686083197593689, 0.7319236993789673]), // Fist 01 MR
  475: Object.freeze([0.35922330617904663, 0.5582523941993713]), // Fist 03 MR
  483: Object.freeze([0.28446266055107117, 0.43558305501937866]), // Fist 02 MR
  489: Object.freeze([0.3588349521160126, 0.45980581641197205]), // Fist 04 MR
});

const requireFlag = (name, value) => {
  if (typeof value !== 'boolean') throw new TypeError(name + ' must be boolean');
};
const requireFinite = (name, value) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(name + ' must be finite clip seconds');
  }
};

/**
 * Inputs MUST describe an already qualified, prepared clip interval; passing
 * true only because a source clip exists is invalid. All gates default to
 * absent (and therefore fail validation), not to a fabricated active actor.
 *
 * Returned commands are conditional method invocation requests for
 * PejAiAnimator's MeleeDamage flag. They are NOT evidence of actual contact,
 * collision damage, animated pixels, or native callback execution.
 */
export function planMcdPunchDamageEvents({
  clipOwner, clipPathId, lastClipTime, currentClipTime,
  activeClipConfirmed, preparedIntervalConfirmed,
  activeGameObjectConfirmed, methodReceiverConfirmed,
} = {}) {
  if (typeof clipOwner !== 'string' || !clipOwner) {
    throw new TypeError('clipOwner must be a nonempty string');
  }
  if (!Number.isSafeInteger(clipPathId) || clipPathId < 1) {
    throw new TypeError('clipPathId must be a positive safe integer');
  }
  requireFinite('lastClipTime', lastClipTime);
  requireFinite('currentClipTime', currentClipTime);
  for (const [name, value] of Object.entries({
    activeClipConfirmed, preparedIntervalConfirmed,
    activeGameObjectConfirmed, methodReceiverConfirmed,
  })) requireFlag(name, value);

  const window = clipOwner === CLIP_OWNER ? WINDOWS[clipPathId] : null;
  if (!window) {
    return { status: 'unsupported-clip', commands: [] };
  }
  if (!activeClipConfirmed || !preparedIntervalConfirmed ||
      !activeGameObjectConfirmed || !methodReceiverConfirmed) {
    return { status: 'unqualified-dispatch', commands: [] };
  }
  // Reuse the existing bounded UnityPlayer interval scanner. DO NOT feed raw
  // wall-clock or an unadjusted animation state time here.
  const events = scanNativeEventInterval([
    { id: 'MeleeDamageStart', time: window[0] },
    { id: 'MeleeDamageEnd', time: window[1] },
  ], lastClipTime, currentClipTime);
  return {
    status: 'source-event-requests',
    commands: events.map(({ id, index, time }) => ({
      op: 'invoke-PejAiAnimator-animation-event',
      callback: id,
      stateField: 'MeleeDamage',
      value: id === 'MeleeDamageStart',
      sourceEventIndex: index,
      clipTime: time,
    })),
  };
}
