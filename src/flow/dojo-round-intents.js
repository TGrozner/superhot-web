/**
 * SH-08: pure Web integration decisions for the source-selected Dojo/build10
 * pistol encounter. Not the original MCD progression/EndRunLevel implementation.
 *
 * The combat owner remains the authority for killTarget and quotaConfirmed
 * (readyForVictory); this module neither recounts enemies nor rolls difficulty.
 */

const sourceMatchesDojo = source => source !== null && typeof source === 'object' &&
  !Array.isArray(source) && source.sceneBuildIndex === 10 &&
  source.serializedOwner === 'level10' &&
  typeof source.scenePath === 'string' &&
  /(?:^|[\\/])SHRL_Dojo2\.unity$/i.test(source.scenePath);

export function isDojoBuild10Source(source) {
  return sourceMatchesDojo(source);
}

function assertDojoSource(source) {
  if (!sourceMatchesDojo(source)) throw new RangeError('Dojo flow requires SHRL_Dojo2/build10/level10 source');
}

/**
 * Feed this AFTER the combat owner evaluated readyForVictory(runtime,enemies).
 * That call mutates nativeEncounter.killed / pending arrivals; do not repeat its
 * algorithm here. No schedule, screen mutation or native menu transition occurs.
 *
 * quotaConfirmed must be the actual boolean returned by readyForVictory, not
 * an inference from an empty list of currently visible enemies.
 */
export function planDojoEncounterOutcome({source, encounter, quotaConfirmed,
  activeScreen, playerAlive, transitionPending} = {}) {
  assertDojoSource(source);
  if (!encounter || typeof encounter !== 'object' || Array.isArray(encounter)) {
    throw new TypeError('encounter must be the combat runtime counters');
  }
  const {killTarget,killed} = encounter;
  if (killTarget !== 6 && killTarget !== 7) {
    throw new RangeError('Dojo preview supports only the source-selected 6/7 kill quota');
  }
  if (!Number.isSafeInteger(killed) || killed < 0) {
    throw new RangeError('encounter.killed must be a nonnegative safe integer');
  }
  if (typeof quotaConfirmed !== 'boolean' || typeof playerAlive !== 'boolean' ||
      typeof transitionPending !== 'boolean') {
    throw new TypeError('explicit quotaConfirmed, playerAlive and transitionPending booleans required');
  }
  if (!['playing','paused','dead','win','menu'].includes(activeScreen)) {
    throw new RangeError('activeScreen must be a known Web phase');
  }
  if (quotaConfirmed && killed < killTarget) {
    throw new RangeError('combat quota receipt contradicts killed counter');
  }
  // The UI counter is informational. Neither this count nor an empty enemy list
  // is a substitute for the combat owner's stateful quota confirmation.
  const progress = Object.freeze({killTarget, killed,
    remaining:Math.max(0,killTarget-killed)});
  let status = 'waiting-for-combat-quota';
  if (activeScreen === 'win') status = 'already-won-web';
  else if (activeScreen !== 'playing' || !playerAlive) status = 'not-playing-or-player-dead';
  else if (transitionPending) status = 'web-transition-pending';
  else if (quotaConfirmed) status = 'request-provisional-web-victory';
  return Object.freeze({status,progress,
    intent:status === 'request-provisional-web-victory'
      ? Object.freeze({type:'request-web-win-transition',nativeParity:'UNVERIFIED',delaySeconds:null})
      : null});
}

/**
 * Explicit Web UX reset request. The integration owner calls the existing
 * start() -> resetGame() -> loadLevel() path, which creates a NEW combat runtime.
 * This is not a MCD save/checkpoint/replay rule and never mutates the old run.
 */
export function planDojoRestartIntent({source, activeScreen} = {}) {
  assertDojoSource(source);
  if (!['menu','paused','dead','win','playing'].includes(activeScreen)) {
    throw new RangeError('activeScreen must be a known Web phase');
  }
  // Playing has no explicit restart-button action in the current Web UI.
  if (activeScreen === 'playing') return Object.freeze({status:'not-requested',intent:null});
  return Object.freeze({status:'request-fresh-web-run',intent:Object.freeze({
    type:'request-web-resetGame',mustRecreateEncounter:true,
    mustClearKillCount:true,mustClearPendingTransition:true,nativeParity:'UNVERIFIED',
  })});
}
