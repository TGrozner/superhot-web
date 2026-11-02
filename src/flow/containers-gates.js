/**
 * Narrow MCD static-source contracts for the Containers flow controller.
 * These are NOT proof that a particular Unity scene instance executed them,
 * nor a runtime scheduler, persistence model, or full native implementation.
 * Provenance and missing instance links: docs/parity/flow.md.
 */
export const MCD_GAME_TYPE = Object.freeze({
  ENDLESS_LEVEL: 'ENDLESS_LEVEL',
  TUTORIAL_RUN: 'TUTORIAL_RUN',
});

/**
 * Authored call/enqueue order in SHRL_ContainerPortFlowControl.Start.
 * This is not a sequence of observed wall-clock transitions.
 */
export const CONTAINERS_AUTHORED_STEPS = Object.freeze([
  'initialize-timeline',
  'wait-for-level-load',
  'standard-fade-in',
  'enqueue-run-ending',
]);

function requireRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('MCD flow signals must be an object');
  }
}

function requireBoolean(value, field) {
  if (typeof value !== 'boolean') throw new TypeError(field + ' must be a boolean');
}

function requireCommonSignals(signals) {
  requireRecord(signals);
  requireBoolean(signals.playerDead, 'playerDead');
  requireBoolean(signals.winOnDeath, 'winOnDeath');
}

/**
 * LevelFlowControl.AllKilled (source-level logical guard).
 * allNeededEnemyKilled is the RESULT of the native manager predicate, not
 * necessarily equivalent to counting current on-screen enemies.
 */
export function isMcdLevelClear(signals) {
  requireCommonSignals(signals);
  const { gameType, allNeededEnemyKilled, playerDead, winOnDeath } = signals;
  if (typeof gameType !== 'string' || !gameType) {
    throw new TypeError('gameType must be an explicitly supplied nonempty string');
  }
  requireBoolean(allNeededEnemyKilled, 'allNeededEnemyKilled');
  if (gameType === MCD_GAME_TYPE.ENDLESS_LEVEL) return false;
  return (allNeededEnemyKilled && !playerDead) || (winOnDeath && playerDead);
}

/** Separate native predicate: LevelFlowControl.AllKilledWithSpawners. */
export function isMcdSpawnerInclusiveClear(signals) {
  requireCommonSignals(signals);
  const { enemiesIncludingSpawners, playerDead, winOnDeath } = signals;
  if (!Number.isSafeInteger(enemiesIncludingSpawners) || enemiesIncludingSpawners < 0) {
    throw new RangeError('enemiesIncludingSpawners must be a nonnegative safe integer');
  }
  return (enemiesIncludingSpawners === 0 && !playerDead) || (winOnDeath && playerDead);
}

/**
 * LevelFlowControl.EndRunLevel branch eligibility only.
 * Even when eligible, native finishing/replay/defrag/menu effects are async
 * and are NOT modeled or claimed to have happened here.
 */
export function classifyMcdRunEnding(signals) {
  const clear = isMcdLevelClear(signals);
  if (!clear) return 'not-ready';
  return signals.gameType === MCD_GAME_TYPE.TUTORIAL_RUN
    ? 'tutorial-ending-eligible'
    : 'progress-ending-eligible';
}
