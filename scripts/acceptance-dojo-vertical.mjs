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

  // Web encounter retains dead actors until the next reset. A kill counter can
  // reach the quota even when the trace contains only one dead actor repeatedly;
  // count distinct rendered Web enemy IDs instead of accepting that false proof.
  // This is a Web receipt, not evidence of native MCD death causality.
  const target = get(frames[start]).encounter.killTarget;
  const deadActorIds = new Set(), liveActorIds = new Set(), witnessedDeathIds = new Set(), previousLiveness = new Map();
  for (let i = start; i <= win; i++) {
    const inFrame = new Set();
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
        if (liveActorIds.has(id)) witnessedDeathIds.add(id);
      }
    }
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

  let picked = null;
  for (let i = start; i < win; i++) {
    const f = frames[i], key = itemKey(get(f).heldItem);
    if (key && hasItem(f, key, ['held'])) { picked = {id:key, index:i}; break; }
  }
  checks.pickupObserved = picked !== null;
  if (!checks.pickupObserved) errors.push('no source-item held state observed');
  const released = picked ? frames.findIndex((f, i) => i > picked.index && i < win &&
    f.activeScreen === 'playing' && get(f).heldItem === null &&
    hasItem(f, picked.id, ['flying', 'resting', 'attached', 'broken'])) : -1;
  checks.throwOrReleaseObserved = released >= 0;
  if (!checks.throwOrReleaseObserved) errors.push('no same-item release with changed world state before victory');

  const initial = get(frames[start]), after = get(frames[restart]);
  checks.itemPoolReset = initial.itemsTotal > 0 && initial.itemStates.length === 0 &&
    after.itemsTotal === initial.itemsTotal && after.itemStates.length === 0 &&
    after.heldItem === null && after.originalFragmentCount === 0;
  if (!checks.itemPoolReset) errors.push('item pool/held item/fragments not restored after victory restart');
  checks.audioAmbienceNoLeak = initial.audioAmbienceSources === after.audioAmbienceSources;
  if (!checks.audioAmbienceNoLeak) errors.push('ambient native WebAudio source count changed across restart');
  checks.weaponRestored = after.weapon === initial.weapon && after.ammo === initial.ammo;
  if (!checks.weaponRestored) errors.push('starting weapon/ammo not restored after victory restart');
  checks.worldClockReset = frames[restart].worldClock < frames[win].worldClock;
  if (!checks.worldClockReset) errors.push('worldClock did not reset after victory');
  observed.ambientSourcesBeforeAndAfter = [initial.audioAmbienceSources, after.audioAmbienceSources];
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
