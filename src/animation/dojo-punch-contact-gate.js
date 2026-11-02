/**
 * Dojo/build10 Web integration candidate for source-timed enemy fist contact.
 *
 * Evidence (private; do not copy source bodies):
 * - MCD build 20299547, sharedassets0.assets:468 event timestamps:
 *   research #46, artifact 13135780460.
 * - PejAiAnimator MeleeDamageStart/End bool writes:
 *   research #152, artifact 13178856534, lines 1501-1509.
 * - UnityPlayer prepared event interval: research #29.
 *
 * This adapter reuses SH-06's already merged event-request planner. It does
 * NOT claim that any Dojo actor executed these callbacks in the native game.
 * It does NOT infer the contact from the animation or a proximity timer.
 */
import { planMcdPunchDamageEvents } from './mcd-punch-damage-events.js';

const requireId = (value, name) => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(name + ' must be a nonempty string');
  }
};

const requireTime = (value, name) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(name + ' must be finite clip seconds');
  }
};

/**
 * One gate per explicitly identified swing. Do not reuse a strikeId after
 * restarting a clip. initialClipTime is provided by the animation playback
 * owner, never inferred from Date.now(), worldDelta, or a 0.5s Web timeout.
 */
export function createDojoPunchContactGate({
  attackerId, strikeId, initialClipTime,
} = {}) {
  requireId(attackerId, 'attackerId');
  requireId(strikeId, 'strikeId');
  requireTime(initialClipTime, 'initialClipTime');
  return Object.freeze({
    attackerId, strikeId, lastClipTime: initialClipTime,
    damageEnabled: false, contactIssued: false,
  });
}

/**
 * Consume one ALREADY PREPARED source-clip time interval. The four qualification
 * flags are facts about the current Web playback and its mapped receiver, NOT
 * evidence of an executed Unity native callback.
 *
 * An optional Web collision receipt must come from a real geometry sweep at
 * an explicitly timestamped clip position; proximity or animation intent is
 * insufficient. Only one candidate contact is requested per strike by
 * PROVISIONAL WEB policy. That deduplication is not a proven MCD hit rule.
 *
 * This function never changes health, makes VFX, or calls src/main.js.
 */
export function advanceDojoPunchContactGate(state, {
  clipOwner, clipPathId, currentClipTime,
  activeClipConfirmed, preparedIntervalConfirmed,
  activeGameObjectConfirmed, methodReceiverConfirmed,
  contact = null,
} = {}) {
  if (!state || typeof state !== 'object') {
    throw new TypeError('state must be a Dojo punch gate state');
  }
  requireId(state.attackerId, 'state.attackerId');
  requireId(state.strikeId, 'state.strikeId');
  requireTime(state.lastClipTime, 'state.lastClipTime');
  if (typeof state.damageEnabled !== 'boolean' ||
      typeof state.contactIssued !== 'boolean') {
    throw new TypeError('state flags must be boolean');
  }
  requireTime(currentClipTime, 'currentClipTime');

  const prepared = planMcdPunchDamageEvents({
    clipOwner, clipPathId, lastClipTime: state.lastClipTime,
    currentClipTime, activeClipConfirmed, preparedIntervalConfirmed,
    activeGameObjectConfirmed, methodReceiverConfirmed,
  });
  const qualified = prepared.status === 'source-event-requests';
  const eventWrites = prepared.commands;
  // Lost evidence must CLOSE the Web damage gate; do not preserve a stale
  // active hitbox across missing/unknown receivers or an unsupported clip.
  const finalEnabled = qualified
    ? eventWrites.reduce((value, event) => event.value, state.damageEnabled)
    : false;

  let contactStatus = 'not-sampled';
  let contactAllowed = false;
  if (contact !== null && contact !== undefined) {
    if (typeof contact !== 'object') {
      throw new TypeError('contact must be an object or null');
    }
    requireTime(contact.clipTime, 'contact.clipTime');
    if (!qualified) {
      contactStatus = 'unqualified-playback';
    } else if (contact.attackerId !== state.attackerId ||
               contact.strikeId !== state.strikeId ||
               typeof contact.victimId !== 'string' ||
               contact.victimId.length === 0) {
      contactStatus = 'wrong-actor-or-strike';
    } else if (contact.provenance !== 'web-hitbox-sweep' ||
               contact.geometryContactConfirmed !== true) {
      contactStatus = 'unqualified-geometry';
    } else if (currentClipTime <= state.lastClipTime) {
      // Reverse playback may fire serialized events in reverse, but
      // independently executed reverse melee damage is not proven.
      contactStatus = 'reverse-or-paused';
    } else if (!(state.lastClipTime < contact.clipTime &&
                 contact.clipTime <= currentClipTime)) {
      contactStatus = 'outside-prepared-interval';
    } else if (eventWrites.some((event) => event.clipTime === contact.clipTime)) {
      // Unity event-vs-physics ordering at the SAME timestamp is unknown.
      // Fail closed instead of silently assuming the callback ran first.
      contactStatus = 'same-time-order-unknown';
    } else if (state.contactIssued) {
      contactStatus = 'already-requested-this-strike';
    } else {
      // Replay serialized bool writes strictly BEFORE the sampled contact.
      // The current end-of-frame bool may already be false when one frame
      // crossed both Start and End, so finalEnabled alone is insufficient.
      const enabledAtContact = eventWrites
        .filter((event) => event.clipTime < contact.clipTime)
        .reduce((value, event) => event.value, state.damageEnabled);
      contactAllowed = enabledAtContact;
      contactStatus = contactAllowed ? 'requested-web-preview' : 'damage-window-closed';
    }
  }

  const nextState = Object.freeze({
    attackerId: state.attackerId,
    strikeId: state.strikeId,
    lastClipTime: currentClipTime,
    damageEnabled: finalEnabled,
    contactIssued: state.contactIssued || contactAllowed,
  });
  const requests = contactAllowed ? [Object.freeze({
    op: 'request-web-player-melee-contact',
    attackerId: state.attackerId,
    strikeId: state.strikeId,
    victimId: contact.victimId,
    clipTime: contact.clipTime,
    provenance: 'source-window-plus-qualified-web-sweep',
    parity: 'WEB_PREVIEW_NOT_NATIVE_VERIFIED',
  })] : [];
  return {
    status: prepared.status,
    contactStatus,
    state: nextState,
    eventWrites,
    requests,
  };
}
