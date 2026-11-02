/**
 * Source-identified MCD fist-punch AnimationEvent requests, not hit detection.
 * Source clip: sharedassets0.assets:468 (MCD Steam build 20299547).
 * Bounded serialized event writes: private research #46, artifact 13135780460.
 * Receiver method contract: #152, artifact 13178856534,
 * PejAiAnimator.cs:1501-1509; native event interval: #29.
 *
 * This adapter deliberately requires positive evidence for the actor, clip,
 * prepared event interval, active GameObject and receiver. It DOES NOT resolve
 * Unity's clip time, crossfade, weight, culling, binding, or hitbox itself.
 */
import { scanNativeEventInterval } from './native-event-interval.js';

const CLIP = Object.freeze({ owner: 'sharedassets0.assets', pathId: 468 });
const EVENTS = Object.freeze([
  Object.freeze({ id: 'MeleeDamageStart', time: 0.4686083197593689 }),
  Object.freeze({ id: 'MeleeDamageEnd', time: 0.7319236993789673 }),
]);

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

  if (clipOwner !== CLIP.owner || clipPathId !== CLIP.pathId) {
    return { status: 'unsupported-clip', commands: [] };
  }
  if (!activeClipConfirmed || !preparedIntervalConfirmed ||
      !activeGameObjectConfirmed || !methodReceiverConfirmed) {
    return { status: 'unqualified-dispatch', commands: [] };
  }
  // Reuse the existing bounded UnityPlayer interval scanner. DO NOT feed raw
  // wall-clock or an unadjusted animation state time here.
  const events = scanNativeEventInterval(EVENTS, lastClipTime, currentClipTime);
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
