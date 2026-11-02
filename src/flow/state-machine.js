/**
 * Pure browser-flow reducer for the CURRENT FRAME//BREAK prototype.
 * This is NOT a verified SUPERHOT: MIND CONTROL DELETE progression model.
 * Native flow provenance and unresolved parity questions live in docs/parity/flow.md.
 *
 * No DOM, timers, persistence, random numbers or time-dilation ownership here.
 */

export const FLOW_PHASE = Object.freeze({
  MENU: 'menu',
  PLAYING: 'playing',
  PAUSED: 'paused',
  DEAD: 'dead',
  WON: 'win',
});

export const FLOW_EVENT = Object.freeze({
  START: 'start',
  RESTART: 'restart',
  PAUSE: 'pause',
  RESUME: 'resume',
  DAMAGE: 'damage',
  ROOM_CLEARED: 'room-cleared',
  TICK: 'tick',
});

export const PROTOTYPE_FLOW_RULES = Object.freeze({
  roomCount: 3,
  maxHealth: 3,
  healPerRoom: 1,
  clearDelaySeconds: 2,
  bannerSeconds: 2.2,
});

const integer = (value, min) => Number.isSafeInteger(value) && value >= min;
const finiteNonnegative = (value) => Number.isFinite(value) && value >= 0;

export function createFlowRules(overrides = {}) {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
    throw new TypeError('Flow rules must be an object');
  }
  const rules = { ...PROTOTYPE_FLOW_RULES, ...overrides };
  if (!integer(rules.roomCount, 1)) throw new RangeError('roomCount must be a positive integer');
  if (!integer(rules.maxHealth, 1)) throw new RangeError('maxHealth must be a positive integer');
  if (!integer(rules.healPerRoom, 0)) throw new RangeError('healPerRoom must be a nonnegative integer');
  if (!finiteNonnegative(rules.clearDelaySeconds)) throw new RangeError('clearDelaySeconds must be finite and nonnegative');
  if (!finiteNonnegative(rules.bannerSeconds)) throw new RangeError('bannerSeconds must be finite and nonnegative');
  return Object.freeze(rules);
}

export function createFlowState(rules = PROTOTYPE_FLOW_RULES) {
  const { maxHealth } = createFlowRules(rules);
  return Object.freeze({
    phase: FLOW_PHASE.MENU,
    roomIndex: 0,
    health: maxHealth,
    clearRemainingSeconds: null,
    bannerRemainingSeconds: 0,
  });
}

/**
 * The caller supplies elapsed *real* seconds for TICK; world-speed integration
 * belongs to SH-02. A completed room is signalled externally by the combat layer.
 * Invalid/unhandled events are rejected; ignored valid events preserve identity.
 */
export function reduceFlow(state, event, rules = PROTOTYPE_FLOW_RULES) {
  if (!state || typeof state !== 'object') throw new TypeError('Flow state must be an object');
  if (!event || typeof event !== 'object') throw new TypeError('Flow event must be an object');
  const policy = createFlowRules(rules);
  const start = () => Object.freeze({
    phase: FLOW_PHASE.PLAYING,
    roomIndex: 0,
    health: policy.maxHealth,
    clearRemainingSeconds: null,
    bannerRemainingSeconds: policy.bannerSeconds,
  });

  switch (event.type) {
    case FLOW_EVENT.START:
      return state.phase === FLOW_PHASE.MENU || state.phase === FLOW_PHASE.DEAD || state.phase === FLOW_PHASE.WON
        ? start() : state;
    case FLOW_EVENT.RESTART:
      return start();
    case FLOW_EVENT.PAUSE:
      return state.phase === FLOW_PHASE.PLAYING
        ? Object.freeze({ ...state, phase: FLOW_PHASE.PAUSED }) : state;
    case FLOW_EVENT.RESUME:
      return state.phase === FLOW_PHASE.PAUSED
        ? Object.freeze({ ...state, phase: FLOW_PHASE.PLAYING }) : state;
    case FLOW_EVENT.DAMAGE: {
      const amount = event.amount ?? 1;
      if (!integer(amount, 1)) throw new RangeError('Damage must be a positive integer');
      if (state.phase !== FLOW_PHASE.PLAYING) return state;
      const health = Math.max(0, state.health - amount);
      return Object.freeze({
        ...state,
        phase: health === 0 ? FLOW_PHASE.DEAD : FLOW_PHASE.PLAYING,
        health,
        clearRemainingSeconds: health === 0 ? null : state.clearRemainingSeconds,
      });
    }
    case FLOW_EVENT.ROOM_CLEARED:
      if (state.phase !== FLOW_PHASE.PLAYING || state.clearRemainingSeconds !== null) return state;
      return Object.freeze({ ...state, clearRemainingSeconds: policy.clearDelaySeconds });
    case FLOW_EVENT.TICK: {
      const seconds = event.realSeconds;
      if (!finiteNonnegative(seconds)) throw new RangeError('TICK needs finite nonnegative realSeconds');
      if (state.phase !== FLOW_PHASE.PLAYING || seconds === 0) return state;
      const bannerRemainingSeconds = Math.max(0, state.bannerRemainingSeconds - seconds);
      if (state.clearRemainingSeconds === null) {
        return bannerRemainingSeconds === state.bannerRemainingSeconds ? state
          : Object.freeze({ ...state, bannerRemainingSeconds });
      }
      const clearRemainingSeconds = Math.max(0, state.clearRemainingSeconds - seconds);
      if (clearRemainingSeconds > 0) {
        return Object.freeze({ ...state, clearRemainingSeconds, bannerRemainingSeconds });
      }
      if (state.roomIndex === policy.roomCount - 1) {
        return Object.freeze({ ...state, phase: FLOW_PHASE.WON,
          clearRemainingSeconds: null, bannerRemainingSeconds: 0 });
      }
      return Object.freeze({ ...state,
        roomIndex: state.roomIndex + 1,
        health: Math.min(policy.maxHealth, state.health + policy.healPerRoom),
        clearRemainingSeconds: null,
        bannerRemainingSeconds: policy.bannerSeconds,
      });
    }
    default:
      throw new RangeError(`Unknown flow event: ${String(event.type)}`);
  }
}
