/**
 * Deterministic diagnostics for the existing FRAME//BREAK Web flow reducer.
 * Not a native MCD sequence or checkpoint contract.
 * No DOM, global clock, persisted save or side effect is involved.
 */
import { createFlowRules, createFlowState, reduceFlow } from './state-machine.js';

const STATE_FIELDS = Object.freeze([
  'phase', 'roomIndex', 'health', 'clearRemainingSeconds', 'bannerRemainingSeconds',
]);

/**
 * Replay a caller-authored prototype event sequence from the menu state.
 * Each record contains immutable before/after snapshots and a field-level delta.
 * Event snapshots retain only the reducer's public event fields.
 */
export function traceFlowScenario(events, ruleOverrides = {}) {
  if (!Array.isArray(events)) throw new TypeError('Flow scenario events must be an array');
  const rules = createFlowRules(ruleOverrides);
  const initial = createFlowState(rules);
  let state = initial;
  const steps = [];

  for (const [index, event] of events.entries()) {
    const before = state;
    const after = reduceFlow(before, event, rules);
    const eventSnapshot = Object.freeze({
      type: event.type,
      ...(Object.hasOwn(event, 'amount') ? { amount: event.amount } : {}),
      ...(Object.hasOwn(event, 'realSeconds') ? { realSeconds: event.realSeconds } : {}),
    });
    const changedFields = Object.freeze(STATE_FIELDS.filter((field) => !Object.is(before[field], after[field])));
    steps.push(Object.freeze({ index, event: eventSnapshot, before, after,
      changedFields, changed: changedFields.length > 0 }));
    state = after;
  }

  return Object.freeze({ rules, initial, final: state, steps: Object.freeze(steps) });
}
