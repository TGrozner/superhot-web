/**
 * SH-08 / J3: browser-only Dojo replay goals, not MCD progression.
 *
 * Consumes the scoreboard maintained by SH-05; does not award points, count
 * kills, modify the encounter quota, reset combat or own timers/inputs.
 * A completed 6-kill round and a 7-kill round have SEPARATE records.
 * Caller owns persistence and UI. No assets or private data required.
 */

export type DojoWebQuota = 6 | 7;

export interface DojoReplayRun {
  readonly quota: DojoWebQuota;
  readonly victory: boolean;
  readonly kills: number;
  readonly shots: number;
  readonly dodges: number;
  readonly score: number;
  readonly elapsedSeconds: number;
}

export interface DojoReplayBest {
  readonly schemaVersion: 1;
  readonly quota: DojoWebQuota;
  readonly victories: number;
  readonly bestScore: number;
  readonly fastestSeconds: number;
}

export type DojoReplayMilestone =
  | 'retry' | 'first-clear' | 'double-record'
  | 'score-record' | 'speed-record' | 'clear';

export interface DojoReplayRecap {
  readonly text: string;
  readonly milestone: DojoReplayMilestone;
  readonly best: Readonly<DojoReplayBest> | null;
  /** Only true for victorious rounds. Persist best under the quota-specific key. */
  readonly shouldPersist: boolean;
  readonly provenance: 'WEB_ONLY';
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function isQuota(value: unknown): value is DojoWebQuota {
  return value === 6 || value === 7;
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isSeconds(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * Decode untrusted storage; invalid JSON/foreign quota/unknown schema means
 * "no stored record", never a crash or a borrowed 6-vs-7 score.
 */
export function readDojoReplayBest(json: string | null, quota: DojoWebQuota): DojoReplayBest | null {
  if (!isQuota(quota) || typeof json !== 'string') return null;
  let value: unknown;
  try { value = JSON.parse(json); } catch { return null; }
  if (!isRecord(value) || value['schemaVersion'] !== 1 || value['quota'] !== quota ||
      !isCount(value['victories']) || value['victories'] < 1 ||
      !isCount(value['bestScore']) || !isSeconds(value['fastestSeconds'])) return null;
  return Object.freeze({
    schemaVersion: 1, quota,
    victories: value['victories'],
    bestScore: value['bestScore'],
    fastestSeconds: value['fastestSeconds'],
  });
}

function validateRun(value: unknown): DojoReplayRun {
  if (!isRecord(value) || !isQuota(value['quota']) ||
      typeof value['victory'] !== 'boolean' ||
      !isCount(value['kills']) || !isCount(value['shots']) ||
      !isCount(value['dodges']) || !isCount(value['score']) ||
      !isSeconds(value['elapsedSeconds'])) {
    throw new TypeError('Dojo Web replay requires a finite, complete scoreboard');
  }
  const run = {
    quota: value['quota'], victory: value['victory'],
    kills: value['kills'], shots: value['shots'], dodges: value['dodges'],
    score: value['score'], elapsedSeconds: value['elapsedSeconds'],
  };
  if (run.victory && run.kills < run.quota) {
    throw new RangeError('Dojo Web win contradicts the recorded 6/7 quota');
  }
  return run;
}

/**
 * Generate end-screen feedback from ACTUAL Web counters, independent of MCD.
 * `best` comes from `readDojoReplayBest` for the SAME quota. No side effects.
 * The SH-05 glue invokes this once on `finish(win)`, formats `text` into the
 * existing stats node and persists `JSON.stringify(result.best)` only when
 * `shouldPersist`. Never call from per-frame updates or from `killEnemy`.
 */
export function createDojoReplayRecap(snapshot: unknown,
  best: Readonly<DojoReplayBest> | null = null): DojoReplayRecap {
  const run = validateRun(snapshot);
  if (best !== null && (best.schemaVersion !== 1 || best.quota !== run.quota ||
      !isCount(best.victories) || best.victories < 1 ||
      !isCount(best.bestScore) || !isSeconds(best.fastestSeconds))) {
    throw new TypeError('Dojo replay record does not match this quota');
  }
  let milestone: DojoReplayMilestone = 'retry';
  let nextBest = best;
  if (run.victory) {
    const first = best === null;
    const scoreRecord = first || run.score > best.bestScore;
    const speedRecord = first || run.elapsedSeconds < best.fastestSeconds;
    milestone = first ? 'first-clear' : scoreRecord && speedRecord ? 'double-record'
      : scoreRecord ? 'score-record' : speedRecord ? 'speed-record' : 'clear';
    nextBest = Object.freeze({
      schemaVersion: 1, quota: run.quota,
      victories: first ? 1 : best.victories + 1,
      bestScore: first ? run.score : Math.max(run.score, best.bestScore),
      fastestSeconds: first ? run.elapsedSeconds : Math.min(run.elapsedSeconds, best.fastestSeconds),
    });
  }
  const title: Record<DojoReplayMilestone, string> = {
    'retry': 'REJOUE POUR PRENDRE TA REVANCHE',
    'first-clear': 'PREMIÈRE VICTOIRE !',
    'double-record': 'DOUBLE RECORD !',
    'score-record': 'NOUVEAU RECORD DE SCORE !',
    'speed-record': 'NOUVEAU RECORD DE TEMPS !',
    'clear': 'REJOUE POUR BATTRE TES RECORDS',
  };
  const metrics = `${run.kills}/${run.quota} ennemis · ${run.shots} tirs · ` +
    `${run.dodges} esquives · ${run.score} pts · ${run.elapsedSeconds.toFixed(1)} s`;
  const recordText = !run.victory && nextBest !== null
    ? ` · record : ${nextBest.bestScore} pts / ${nextBest.fastestSeconds.toFixed(1)} s`
    : '';
  return Object.freeze({
    text: `${metrics} · ${title[milestone]}${recordText}`,
    milestone, best: nextBest,
    shouldPersist: run.victory,
    provenance: 'WEB_ONLY',
  });
}
