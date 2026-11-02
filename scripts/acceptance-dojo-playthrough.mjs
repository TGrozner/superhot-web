/**
 * SH-10 — inspect a *real, user-supplied* Web Dojo playthrough trace.
 * No original assets, network requests, browser automation or native parity claim.
 * Unit tests use synthetic records and do NOT certify a game playthrough.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finiteInteger = value => Number.isSafeInteger(value) && value >= 0;
const dojoScene = source => isRecord(source) &&
  /(?:^|[\\/])SHRL_Dojo2(?:\.unity)?$/i.test(source.scenePath ?? '') &&
  source.buildIndex === 10;
const encounterOf = frame => frame?.gameplay?.encounter;
const screenOf = frame => frame?.activeScreen;
const killsOf = frame => encounterOf(frame)?.killed;
const targetOf = frame => encounterOf(frame)?.killTarget;
const actorsOf = frame => encounterOf(frame)?.enemies;

export const DOJO_TRACE_STATUS = Object.freeze({
  PASSED: 'WEB_PLAYTHROUGH_TRACE_COMPLETE_NOT_NATIVE_PARITY',
  INCOMPLETE: 'WEB_PLAYTHROUGH_TRACE_INCOMPLETE',
  INVALID: 'WEB_PLAYTHROUGH_TRACE_INVALID',
});

/**
 * Accept snapshots from window.__superhotGetRenderedFrameSnapshot().
 * Snapshots must cover the whole run, including victory and *subsequent* restart.
 * No guessed samples are inserted for missing frames, deaths or spawns.
 */
export function assessDojoPlaythrough(trace) {
  const frames = Array.isArray(trace) ? trace : trace?.frames;
  const errors = [];
  if (!Array.isArray(frames) || frames.length === 0 || frames.length > 100000) {
    return { status: DOJO_TRACE_STATUS.INVALID, complete: false,
      evidence: 'USER_SUPPLIED_WEB_FRAMES_UNAUTHENTICATED', frames: 0,
      milestones: {}, errors: ['frames must be a nonempty bounded array'] };
  }
  let previousFrameId = -1;
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    if (!isRecord(frame) || !finiteInteger(frame.frameId) || frame.frameId <= previousFrameId) {
      errors.push('frameId must strictly increase at sample ' + i);
      continue;
    }
    previousFrameId = frame.frameId;
    if (!dojoScene(frame.nativeScene?.source)) errors.push('Dojo/build10 identity missing at sample ' + i);
    const encounter = encounterOf(frame);
    if (!isRecord(encounter) || !finiteInteger(encounter.killed) ||
        ![6, 7].includes(encounter.killTarget) || !Array.isArray(encounter.enemies)) {
      errors.push('source-backed finite encounter missing at sample ' + i);
    }
    if (!['playing', 'win', 'dead', 'paused'].includes(screenOf(frame))) {
      errors.push('unsupported screen at sample ' + i);
    }
  }
  if (errors.length) {
    return { status: DOJO_TRACE_STATUS.INVALID, complete: false,
      evidence: 'USER_SUPPLIED_WEB_FRAMES_UNAUTHENTICATED', frames: frames.length,
      milestones: {}, errors: errors.slice(0, 20) };
  }

  const firstStart = frames.findIndex(f =>
    screenOf(f) === 'playing' && killsOf(f) === 0);
  const spawned = frames.findIndex((f, i) => i >= firstStart && firstStart >= 0 &&
    screenOf(f) === 'playing' && actorsOf(f).some(a => a?.alive === true));
  const combat = frames.findIndex((f, i) => i >= spawned && spawned >= 0 &&
    killsOf(f) > 0);
  const victory = frames.findIndex((f, i) => i >= combat && combat >= 0 &&
    screenOf(f) === 'win' && killsOf(f) >= targetOf(f));
  const restart = frames.findIndex((f, i) => i > victory && victory >= 0 &&
    screenOf(f) === 'playing' && killsOf(f) === 0 &&
    actorsOf(f).length === 0);
  const milestones = {
    runStarted: firstStart >= 0,
    enemySpawned: spawned >= 0,
    killRecorded: combat >= 0,
    victoryScreenWithKillQuota: victory >= 0,
    restartResetKillsAndEnemies: restart >= 0,
  };
  if (firstStart < 0) errors.push('missing playing state at zero kills');
  if (spawned < 0) errors.push('no living spawned enemy was sampled');
  if (combat < 0) errors.push('no recorded elimination after spawn');
  if (victory < 0) errors.push('missing win screen with satisfied kill target');
  if (restart < 0) errors.push('missing post-victory restart with cleared kills and enemies');

  // A counter drop before victory is evidence of a reset or a broken trace.
  // Do not misinterpret an earlier failed attempt as one continuous victory run.
  if (victory >= 0) {
    for (let i = firstStart + 1; i <= victory; i++) {
      if (killsOf(frames[i]) < killsOf(frames[i - 1])) {
        errors.push('kill counter reset during alleged continuous run at sample ' + i);
        break;
      }
      if (targetOf(frames[i]) !== targetOf(frames[firstStart])) {
        errors.push('kill target changed during alleged continuous run at sample ' + i);
        break;
      }
    }
  }
  const complete = errors.length === 0;
  return {
    status: complete ? DOJO_TRACE_STATUS.PASSED : DOJO_TRACE_STATUS.INCOMPLETE,
    complete,
    evidence: 'USER_SUPPLIED_WEB_FRAMES_UNAUTHENTICATED',
    browserExecutionIndependentlyVerified: false,
    originalNativeComparisonPerformed: false,
    frames: frames.length,
    killTarget: firstStart >= 0 ? targetOf(frames[firstStart]) : null,
    milestones,
    errors,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const index = process.argv.indexOf('--trace');
  if (index < 0 || !process.argv[index + 1]) {
    process.stderr.write('Usage: node scripts/acceptance-dojo-playthrough.mjs --trace private/dojo-frames.json\n');
    process.exitCode = 2;
  } else {
    try {
      const trace = JSON.parse(readFileSync(process.argv[index + 1], 'utf8'));
      const report = assessDojoPlaythrough(trace);
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      if (!report.complete) process.exitCode = 2;
    } catch (error) {
      process.stderr.write('Invalid local trace: ' + error.message + '\n');
      process.exitCode = 2;
    }
  }
}
