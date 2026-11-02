/**
 * SH-08 / Dojo build10 — actual Web combat-to-victory bridge.
 *
 * Invoke once from the existing confirmed kill handler, not from every draw
 * or frame. This deliberately reuses the combat owner's readyForVictory,
 * which counts observed dead actors and cancels unfinished arrivals at quota.
 * No native MCD run-ending, checkpoint, SHMenu or original asset is involved.
 */
import { readyForVictory } from '../combat/native-encounter.js';
import { planDojoEncounterOutcome } from './dojo-round-intents.js';

/**
 * Validates the real Dojo scene and current Web phase BEFORE consuming a
 * combat death receipt. The combat state is changed only by readyForVictory.
 * The returned intent remains declarative: SH-05 owns its Web timer/UI.
 *
 * Do NOT call readyForVictory a second time in the main kill handler.
 */
export function resolveDojoKillCompletion({
  source, encounter, enemies, activeScreen, playerAlive, transitionPending,
} = {}) {
  const context = {source, encounter, activeScreen, playerAlive, transitionPending};
  const gate = planDojoEncounterOutcome({...context, quotaConfirmed:false});
  if (gate.status !== 'waiting-for-combat-quota') return gate;
  if (!Array.isArray(enemies)) {
    throw new TypeError('enemies must be the current combat actor array');
  }
  // This is the only invocation of the combat owner's stateful quota check.
  const quotaConfirmed = readyForVictory(encounter, enemies);
  return planDojoEncounterOutcome({...context, quotaConfirmed});
}
