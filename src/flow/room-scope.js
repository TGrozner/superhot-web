/**
 * Optional stale-callback guard for FRAME//BREAK's pure Web flow reducer.
 * Not a SUPERHOT: MIND CONTROL DELETE room/run/checkpoint contract.
 *
 * Capture a scope when an asynchronous room-local producer is created; passing a
 * freshly captured scope when its late callback fires defeats the guard.
 * This adapter also rejects room tokens from independent Web sessions.
 * Identity is process-local, not a checkpoint, save format or security boundary.
 * Timing, input and the browser adapter remain owned by other lanes.
 */
import { FLOW_EVENT, FLOW_PHASE, createFlowRules, createFlowState, reduceFlow } from './state-machine.js';

const isRoomLocal = (type) => type === FLOW_EVENT.DAMAGE || type === FLOW_EVENT.ROOM_CLEARED;
const isCounter = (value) => Number.isSafeInteger(value) && value >= 0;
// Process-local identity: two independent runs can have identical public counters.
// Keep the brand non-enumerable so the serializable diagnostics stay unchanged.
const originKey = Symbol('SH-08 Web session origin');

function freezeWithOrigin(record, origin) {
  Object.defineProperty(record, originKey, { value: origin });
  return Object.freeze(record);
}

function assertSession(session) {
  if (!session || typeof session !== 'object' || !session.flow || !session.rules
    || !isCounter(session.generation) || typeof session[originKey] !== 'symbol') {
    throw new TypeError('Expected a room-scoped Web flow session');
  }
}

export function createRoomScopedFlow(ruleOverrides = {}) {
  const rules = createFlowRules(ruleOverrides);
  return freezeWithOrigin({
    rules,
    flow: createFlowState(rules),
    generation: 0,
  }, Symbol('SH-08 Web session'));
}

/** Capture when the enemy/projectile/room-clear producer is created. */
export function captureRoomScope(session) {
  assertSession(session);
  if (session.flow.phase !== FLOW_PHASE.PLAYING && session.flow.phase !== FLOW_PHASE.PAUSED) {
    throw new RangeError('Cannot capture a room scope without an active room');
  }
  return freezeWithOrigin({ generation: session.generation, roomIndex: session.flow.roomIndex }, session[originKey]);
}

/**
 * Reuse reduceFlow unchanged. DAMAGE/ROOM_CLEARED require a captured scope;
 * stale callbacks are ignored (returning the identical session).
 * A START/RESTART or room change invalidates scopes from the previous lifetime.
 */
export function reduceRoomScopedFlow(session, event, originScope) {
  assertSession(session);
  if (!event || typeof event !== 'object') throw new TypeError('Expected a flow event');
  if (isRoomLocal(event.type)) {
    if (!originScope || typeof originScope !== 'object'
      || !isCounter(originScope.generation) || !isCounter(originScope.roomIndex)
      || typeof originScope[originKey] !== 'symbol') {
      throw new TypeError('A room-local event needs a valid captured origin scope');
    }
    if (originScope[originKey] !== session[originKey]
      || originScope.generation !== session.generation || originScope.roomIndex !== session.flow.roomIndex) {
      return session;
    }
  } else if (originScope !== undefined) {
    throw new TypeError('Only room-local events accept a captured origin scope');
  }

  const next = reduceFlow(session.flow, event, session.rules);
  if (next === session.flow) return session;

  const newLifetime = (event.type === FLOW_EVENT.START || event.type === FLOW_EVENT.RESTART
    || next.roomIndex !== session.flow.roomIndex);
  const generation = session.generation + Number(newLifetime);
  if (!isCounter(generation)) throw new RangeError('Room generation exceeded safe integer range');
  return freezeWithOrigin({ ...session, flow: next, generation }, session[originKey]);
}
