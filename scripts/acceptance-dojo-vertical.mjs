/**
 * SH-10 — strict, opt-in Dojo/build10 WEB observation gate.
 * Consumes locally recorded browser snapshots; no original assets or native verdict.
 * Operator route labels and unauthenticated JSON must never certify a native comparison.
 */
import { assessDojoPlaythrough } from './acceptance-dojo-playthrough.mjs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const DOJO_VERTICAL_STATUS = Object.freeze({
  COMPLETE: 'WEB_DOJO_VERTICAL_OBSERVED_OWNER_MARKED_NOT_NATIVE_PARITY',
  INCOMPLETE: 'WEB_DOJO_VERTICAL_INCOMPLETE',
  INVALID: 'WEB_DOJO_VERTICAL_INVALID_TELEMETRY',
});
export const DOJO_ROUTE_MARKERS = Object.freeze([
  'door-before', 'door-after', 'stairs-bottom', 'stairs-top',
  'wall-press-start', 'wall-press-end',
]);
const integer = v => Number.isSafeInteger(v) && v >= 0;
const finiteVec = p => p && [p.x, p.y, p.z].every(Number.isFinite);
const isRecord = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const distXZ = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
const itemKey = id => (typeof id === 'string' || typeof id === 'number') ? String(id) : null;
const get = f => f.gameplay;
const isDojo10 = f => f.nativeScene?.source?.serializedOwner === 'level10';
const hasItem = (frame, itemId, states) => frame.gameplay.itemStates.some(i =>
  itemKey(i.id) === itemId && states.includes(i.state));

function checkRoute(trace, frames, beforeWinIndex) {
  const errors = [];
  const marks = trace.marks;
  if (!Array.isArray(marks) || marks.length > 128) {
    return { errors: ['route markers absent or over limit'], observed: {} };
  }
  const byId = new Map(frames.map((frame, index) => [frame.frameId, index]));
  const map = new Map();
  for (const mark of marks) {
    if (!isRecord(mark) || !DOJO_ROUTE_MARKERS.includes(mark.type) ||
        !integer(mark.frameId) || !byId.has(mark.frameId)) {
      errors.push('invalid/unmatched route marker'); continue;
    }
    if (map.has(mark.type)) errors.push('duplicate route marker ' + mark.type);
    map.set(mark.type, byId.get(mark.frameId));
  }
  const segment = (from, to) => {
    const i = map.get(from), j = map.get(to);
    if (i === undefined || j === undefined || i >= j ||
        j >= beforeWinIndex || j - i < 2) {
      errors.push('missing/out-of-order route segment ' + from + ' -> ' + to);
      return null;
    }
    const path = frames.slice(i, j + 1);
    if (path.some(f => f.activeScreen !== 'playing') ||
        !path.some(f => f.gameplay.moving === true) ||
        path.some((f,k) => k > 0 && (distXZ(path[k-1].gameplay.feet, f.gameplay.feet) > .9 ||
          Math.abs(f.gameplay.feet.y - path[k-1].gameplay.feet.y) > .6))) {
      errors.push('route segment lacks playing movement or has unsampled jump ' + from);
      return null;
    }
    return path;
  };
  const observed = {};
  const door = segment('door-before', 'door-after');
  if (door) {
    const displacement = distXZ(get(door[0]).feet, get(door.at(-1)).feet);
    observed.doorHorizontalMeters = displacement;
    if (displacement < .65 || displacement > 5) errors.push('door/threshold crossing not observed within bounded displacement');
  }
  const stairs = segment('stairs-bottom', 'stairs-top');
  if (stairs) {
    const elevation = get(stairs.at(-1)).feet.y - get(stairs[0]).feet.y;
    const displacement = distXZ(get(stairs[0]).feet, get(stairs.at(-1)).feet);
    observed.stairsElevationMeters = elevation;
    if (elevation < .2 || elevation > 3 || displacement < .2 ||
        !get(stairs[0]).grounded || !get(stairs.at(-1)).grounded) {
      errors.push('grounded stair ascent not observed');
    }
  }
  const wall = segment('wall-press-start', 'wall-press-end');
  if (wall) {
    const displacement = distXZ(get(wall[0]).feet, get(wall.at(-1)).feet);
    observed.wallPressHorizontalMeters = displacement;
    if (displacement > .15 ||
        wall.filter(f => f.gameplay.moving).length < 2 ||
        wall.at(-1).worldClock <= wall[0].worldClock) {
      errors.push('blocked movement during owner-marked wall press not observed');
    }
  }
  return { errors, observed };
}

/** Entire user-observed run: start, spawn, gun, pickup/throw, 6–7 kills, win,
 *  reset cleanup, and three operator-labelled route measurements.
 *  Never trusts JSON or route labels as independently authenticated evidence.
 */
export function assessDojoVertical(trace) {
  const basic = assessDojoPlaythrough(trace);
  const errors = [...basic.errors];
  const frames = trace?.frames;
  const checks = Object.create(null);
  const observed = {};
  const report = status => ({
    status, complete: status === DOJO_VERTICAL_STATUS.COMPLETE,
    evidence: 'USER_SUPPLIED_WEB_TELEMETRY_AND_OPERATOR_ROUTE_LABELS_UNAUTHENTICATED',
    browserActuallyExecutedByThisTest: false, sourceNativeExecuted: false,
    matchedNativeWebFrames: false, nativeParityVerdict: 'UNKNOWN',
    basicStatus: basic.status, checks, observed, errors: errors.slice(0, 30),
  });
  if (basic.status === 'WEB_PLAYTHROUGH_TRACE_INVALID' ||
      trace?.schemaVersion !== 2 || trace?.captureKind !== 'SH10_DOJO_OWNER_BROWSER_V2' ||
      !Array.isArray(frames)) {
    errors.push('v2 browser telemetry schema or base trace invalid');
    return report(DOJO_VERTICAL_STATUS.INVALID);
  }
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i], g = f.gameplay;
    if (!isDojo10(f) || !Number.isFinite(f.worldClock) ||
        !isRecord(g) || !integer(g.ammo) || typeof g.weapon !== 'boolean' ||
        !integer(g.itemsTotal) || !integer(g.originalFragmentCount) ||
        !integer(g.audioAmbienceSources) || !Array.isArray(g.itemStates) ||
        g.itemStates.length > g.itemsTotal || g.itemStates.some(item =>
          !isRecord(item) || itemKey(item.id) === null ||
          !['held', 'flying', 'resting', 'attached', 'broken'].includes(item.state)) ||
        g.itemsTruncated !== false ||
        !finiteVec(g.feet) || typeof g.grounded !== 'boolean' ||
        typeof g.moving !== 'boolean' ||
        (g.heldItem !== null && itemKey(g.heldItem) === null) ||
        (g.weapon && g.heldItem !== null)) {
      errors.push('missing/invalid Dojo v2 runtime telemetry at sample ' + i);
      return report(DOJO_VERTICAL_STATUS.INVALID);
    }
  }
  const start = frames.findIndex(f => f.activeScreen === 'playing' && get(f).encounter.killed === 0);
  const win = frames.findIndex(f => f.activeScreen === 'win' &&
    get(f).encounter.killed >= get(f).encounter.killTarget);
  const restart = frames.findIndex((f, i) => i > win && win >= 0 &&
    f.activeScreen === 'playing' && get(f).encounter.killed === 0 &&
    get(f).encounter.enemies.length === 0);
  if (start < 0 || win < 0 || restart < 0 || !basic.complete) {
    errors.push('base Dojo start/spawn/kills/win/restart must be complete first');
    return report(DOJO_VERTICAL_STATUS.INCOMPLETE);
  }
  // A win screen followed by zero kills is not itself a witnessed user restart.
  // Require trusted DOM click receipts recorded by the real browser sampler.
  // Missing receipts are INCOMPLETE rather than a native contradiction.
  const actions = trace.uiActions;
  if (actions !== undefined && (!Array.isArray(actions) || actions.length > 32 ||
      actions.some(a => !isRecord(a) || !['start','restart'].includes(a.type) ||
        !['start-button','play-original','again-button'].includes(a.buttonId) ||
        !integer(a.frameId) || !['playing','menu','win'].includes(a.activeScreen)))) {
    errors.push('invalid owner browser UI-click telemetry');
    return report(DOJO_VERTICAL_STATUS.INVALID);
  }
  checks.startButtonClickObserved = Array.isArray(actions) && actions.some(a =>
    a.type === 'start' && ['start-button','play-original'].includes(a.buttonId) &&
    ['playing','menu'].includes(a.activeScreen) && a.frameId < frames[start].frameId);
  checks.winRestartButtonClickObserved = Array.isArray(actions) && actions.some(a =>
    a.type === 'restart' && a.buttonId === 'again-button' &&
    a.activeScreen === 'win' && a.frameId >= frames[win].frameId &&
    a.frameId < frames[restart].frameId);
  if (!checks.startButtonClickObserved) errors.push('no trusted owner Start button click observed before first combat frame');
  if (!checks.winRestartButtonClickObserved) errors.push('no trusted owner win-screen Replay button click between win and restart frames');
  observed.uiClicks = Array.isArray(actions) ? actions.length : 0;
  // Browser-originating input attempts are only receipts. We must additionally
  // witness the matching Web state transition; an input alone is not a hit.
  const inputs = trace.inputActions;
  if (inputs !== undefined && (!Array.isArray(inputs) || inputs.length > 256 ||
      inputs.some(a => !isRecord(a) || !['fire','pickup','throw'].includes(a.kind) ||
        !integer(a.frameId) || a.activeScreen !== 'playing')) ||
      (trace.inputActionsTruncated !== undefined &&
        typeof trace.inputActionsTruncated !== 'boolean')) {
    errors.push('invalid browser input-attempt telemetry');
    return report(DOJO_VERTICAL_STATUS.INVALID);
  }
  const witnessedInput = (kind, beforeId, afterId) => Array.isArray(inputs) &&
    inputs.some(a => a.kind === kind && a.frameId >= beforeId && a.frameId < afterId);
  observed.inputReceipts = Array.isArray(inputs) ? inputs.length : 0;
  checks.inputReceiptsComplete = trace.inputActionsTruncated === false;
  if (!checks.inputReceiptsComplete) {
    errors.push('browser input receipts absent or truncated; old traces cannot certify actions');
  }

  // Web encounter retains dead actors until the next reset. A kill counter can
  // reach the quota even when the trace contains only one dead actor repeatedly;
  // count distinct rendered Web enemy IDs instead of accepting that false proof.
  // This is a Web receipt, not evidence of native MCD death causality.
  const target = get(frames[start]).encounter.killTarget;
  const deadActorIds = new Set(), liveActorIds = new Set(), witnessedDeathIds = new Set(), previousLiveness = new Map();
  // Web killEnemy() updates enemy.alive and the kill counter in one call.
  // A counter rising before or after the observed death is not a witnessed
  // per-kill transition, even if both eventually reach the same total.
  const desyncedDeathFrames = [];
  let previousKilled = get(frames[start]).encounter.killed;
  for (let i = start; i <= win; i++) {
    const inFrame = new Set();
    let newWitnessedDeaths = 0;
    for (const actor of get(frames[i]).encounter.enemies) {
      const id = itemKey(actor?.id);
      if (!isRecord(actor) || !id || typeof actor.alive !== 'boolean' || inFrame.has(id)) {
        errors.push('invalid/duplicate Web encounter actor ID or liveness at sample ' + i);
        return report(DOJO_VERTICAL_STATUS.INVALID);
      }
      if (previousLiveness.get(id) === false && actor.alive) {
        errors.push('dead Web encounter actor resurrected before restart at sample ' + i);
        return report(DOJO_VERTICAL_STATUS.INVALID);
      }
      inFrame.add(id);
      previousLiveness.set(id, actor.alive);
      if (actor.alive) liveActorIds.add(id);
      else {
        deadActorIds.add(id);
        // A corpse first seen dead is not a sampled kill transition. Sparse
        // sampling may miss a short-lived actor, so this is INCOMPLETE.
        if (liveActorIds.has(id) && !witnessedDeathIds.has(id)) {
          witnessedDeathIds.add(id);
          newWitnessedDeaths++;
        }
      }
    }
    if (i > start) {
      const killed = get(frames[i]).encounter.killed;
      if (killed - previousKilled !== newWitnessedDeaths) {
        desyncedDeathFrames.push(frames[i].frameId);
      }
      previousKilled = killed;
    }
  }
  checks.killCounterAlignedWithWitnessedDeaths = desyncedDeathFrames.length === 0;
  observed.killDeathDesyncedFrameIds = desyncedDeathFrames.slice(0, 20);
  if (!checks.killCounterAlignedWithWitnessedDeaths) {
    errors.push('kill-counter increments not aligned with sampled living-to-dead actor transitions');
  }
  checks.distinctDeadActorsObserved = deadActorIds.size >= target;
  observed.distinctDeadActorIdsBeforeWin = deadActorIds.size;
  observed.distinctAliveThenDeadActorIdsBeforeWin = witnessedDeathIds.size;
  checks.aliveToDeadTransitionsObserved = witnessedDeathIds.size >= target;
  if (!checks.distinctDeadActorsObserved) {
    errors.push('fewer than kill quota distinct dead actor IDs observed in Web encounter');
  }
  if (!checks.aliveToDeadTransitionsObserved) {
    errors.push('fewer than kill quota sampled alive-to-dead actor transitions in Web encounter');
  }
  const active = frames.slice(start, win);
  const witnessedKills = new Set(frames.slice(start, win + 1).map(f => get(f).encounter.killed));
  checks.everyKillCounterObserved = Array.from({length: target + 1}, (_, value) => value)
    .every(value => witnessedKills.has(value));
  if (!checks.everyKillCounterObserved) errors.push('one or more individual kill-counter transitions were not sampled');
  checks.pistolEquippedAndFired = active.some((f, i) => i > 0 &&
    f.activeScreen === 'playing' && active[i - 1].activeScreen === 'playing' &&
    get(f).weapon === true && get(active[i - 1]).weapon === true &&
    get(active[i - 1]).ammo > 0 && get(f).ammo < get(active[i - 1]).ammo);
  if (!checks.pistolEquippedAndFired) errors.push('no consecutive playing frames with armed ammo decrease (gun discard is not a shot)');
  checks.pistolFireInputObserved = active.some((f, i) => i > 0 &&
    f.activeScreen === 'playing' && active[i - 1].activeScreen === 'playing' &&
    get(f).weapon === true && get(active[i - 1]).weapon === true &&
    get(active[i - 1]).ammo > 0 && get(f).ammo < get(active[i - 1]).ammo &&
    witnessedInput('fire', active[i - 1].frameId, f.frameId));
  if (!checks.pistolFireInputObserved) errors.push('no trusted pointer-locked primary-fire input receipt aligned with armed ammo decrease');

  let picked = null;
  for (let i = start; i < win; i++) {
    const f = frames[i], key = itemKey(get(f).heldItem);
    if (key && hasItem(f, key, ['held'])) { picked = {id:key, index:i}; break; }
  }
  checks.pickupObserved = picked !== null;
  if (!checks.pickupObserved) errors.push('no source-item held state observed');
  checks.pickupInputObserved = picked !== null && picked.index > 0 &&
    witnessedInput('pickup', frames[picked.index - 1].frameId, frames[picked.index].frameId);
  if (!checks.pickupInputObserved) errors.push('no trusted E input receipt aligned with same-item pickup');
  const released = picked ? frames.findIndex((f, i) => i > picked.index && i < win &&
    f.activeScreen === 'playing' && get(f).heldItem === null &&
    hasItem(f, picked.id, ['flying', 'resting', 'attached', 'broken'])) : -1;
  checks.throwOrReleaseObserved = released >= 0;
  if (!checks.throwOrReleaseObserved) errors.push('no same-item release with changed world state before victory');
  checks.throwInputObserved = released > 0 && witnessedInput('throw',
    frames[released - 1].frameId, frames[released].frameId);
  if (!checks.throwInputObserved) errors.push('no trusted F input receipt aligned with same-item release');

  const initial = get(frames[start]), after = get(frames[restart]);
  const postRestart = frames.slice(restart);
  // One immediate reset snapshot can precede asynchronous WebAudio startup or
  // miss a later duplicate source. Require a settled, observed *Web* reset,
  // not merely 0 === 0 or a one-frame 3 === 3 coincidence.
  const enoughResetSamples = postRestart.length >= 2;
  checks.postRestartSettledSamples = enoughResetSamples;
  if (!enoughResetSamples) errors.push('at least two rendered post-restart samples required to observe settled reset');
  checks.itemPoolReset = initial.itemsTotal > 0 && initial.itemStates.length === 0 &&
    enoughResetSamples && postRestart.every(f => f.activeScreen === 'playing' &&
      get(f).itemsTotal === initial.itemsTotal && get(f).itemStates.length === 0 &&
      get(f).heldItem === null && get(f).originalFragmentCount === 0);
  if (!checks.itemPoolReset) errors.push('item pool/held item/fragments not restored and stable after victory restart');
  // Owner's documented *Web* Dojo baseline is three persistent scene ambiences
  // (docs/dojo-reprise.md). This is NOT an MCD native audio parity target.
  const expectedAmbience = 3;
  const preWin = frames.slice(start, win);
  const twoConsecutiveAmbiences = samples => samples.some((f, i) => i > 0 &&
    get(f).audioAmbienceSources === expectedAmbience &&
    get(samples[i - 1]).audioAmbienceSources === expectedAmbience);
  const overBudgetAudioSamples = [...preWin, ...postRestart].filter(f =>
    get(f).audioAmbienceSources > expectedAmbience);
  checks.audioAmbienceNoLeak = enoughResetSamples && twoConsecutiveAmbiences(preWin) &&
    twoConsecutiveAmbiences(postRestart) &&
    get(postRestart.at(-1)).audioAmbienceSources === expectedAmbience &&
    overBudgetAudioSamples.length === 0;
  if (!checks.audioAmbienceNoLeak) {
    errors.push('three stable Dojo WebAudio scene ambiences not observed before/after restart, or duplicate sources observed');
  }
  checks.weaponRestored = enoughResetSamples && postRestart.every(f =>
    get(f).weapon === initial.weapon && get(f).ammo === initial.ammo);
  if (!checks.weaponRestored) errors.push('starting weapon/ammo not restored and stable after victory restart');
  checks.worldClockReset = frames[restart].worldClock < frames[win].worldClock;
  if (!checks.worldClockReset) errors.push('worldClock did not reset after victory');
  observed.ambientSourcesBeforeAndAfter = [initial.audioAmbienceSources, after.audioAmbienceSources];
  observed.postRestartSampleCount = postRestart.length;
  observed.postRestartAudioSourceCounts = postRestart.slice(0, 16).map(f => get(f).audioAmbienceSources);
  observed.overBudgetAudioFrameIds = overBudgetAudioSamples.slice(0, 16).map(f => f.frameId);
  observed.itemsBeforeAndAfter = [initial.itemsTotal, after.itemsTotal];
  observed.killTarget = get(frames[start]).encounter.killTarget;
  observed.pickupItemId = picked?.id ?? null;

  const route = checkRoute(trace, frames, win);
  errors.push(...route.errors);
  Object.assign(observed, route.observed);
  checks.operatorMarkedRoute = route.errors.length === 0;
  return report(errors.length ? DOJO_VERTICAL_STATUS.INCOMPLETE : DOJO_VERTICAL_STATUS.COMPLETE);
}

// Opt-in only: CI runs synthetic unit tests, never a fabricated gameplay trace.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf('--trace');
  if (index < 0 || !process.argv[index + 1]) {
    process.stderr.write('Usage: node scripts/acceptance-dojo-vertical.mjs --trace private/dojo-full-run.json\n');
    process.exitCode = 2;
  } else {
    try {
      const {readFileSync} = await import('node:fs');
      const data = JSON.parse(readFileSync(process.argv[index + 1], 'utf8'));
      const result = assessDojoVertical(data);
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      if (!result.complete) process.exitCode = 2;
    } catch (error) {
      process.stderr.write('Invalid local Dojo trace: ' + error.message + '\n');
      process.exitCode = 2;
    }
  }
}
