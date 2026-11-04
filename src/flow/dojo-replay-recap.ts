/**
 * SH-08 / J3: browser-only Dojo replay goals, not MCD progression.
 *
 * Consumes the scoreboard maintained by SH-05; does not award points, count
 * kills, modify the encounter quota, reset combat or own timers/inputs.
 * A completed 6-kill round and a 7-kill round have SEPARATE records.
 * Creative Web streaks are stored in the existing per-quota localStorage key.
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
  readonly schemaVersion: 4;
  readonly quota: DojoWebQuota;
  readonly victories: number;
  /** Only attempts tracked since this feature, plus known legacy victories. */
  readonly trackedAttempts: number;
  /** Maximum kills on an unfinished attempt, not a native checkpoint. */
  readonly bestFailedKills: number;
  readonly bestScore: number;
  readonly fastestSeconds: number;
  /** Consecutive victories for this 6/7 quota only; losses reset it. */
  readonly currentStreak: number;
  readonly bestStreak: number;
  /** Bitmask: STYLE S (1), shot-free win (2), three clean dodges (4). Web-authored. */
  readonly masteryMask: number;
}

export type DojoReplayMilestone =
  | 'retry' | 'first-clear' | 'double-record'
  | 'score-record' | 'speed-record' | 'clear';

export type DojoWebStyleGrade = 'C' | 'B' | 'A' | 'S';

export interface DojoReplayRecap {
  readonly text: string;
  readonly milestone: DojoReplayMilestone;
  readonly best: Readonly<DojoReplayBest> | null;
  /** Persist victorious rounds and defeats which break an active streak. */
  readonly shouldPersist: boolean;
  readonly provenance: 'WEB_ONLY';
  /** Creative Web style ladder based solely on existing combat score. */
  readonly styleGrade: DojoWebStyleGrade | null;
  readonly nextStyleTarget: number | null;
  readonly currentStreak: number;
  readonly bestStreak: number;
  /** A Web-only, factual next-run target derived from prior records. */
  readonly replayTarget: string | null;
  /** Three optional, independent Web challenges per 6/7-kill quota. */
  readonly masteryCount: number;
  readonly newMedals: readonly string[];
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
  if (!isRecord(value) ||
      (value['schemaVersion'] !== 1 && value['schemaVersion'] !== 2 &&
       value['schemaVersion'] !== 3 && value['schemaVersion'] !== 4) ||
      value['quota'] !== quota || !isCount(value['victories']) ||
      (value['schemaVersion'] !== 4 && value['victories'] < 1) ||
      !isCount(value['bestScore']) || !isSeconds(value['fastestSeconds'])) return null;
  const v4 = value['schemaVersion'] === 4;
  if (value['victories'] === 0 &&
      (!v4 || value['bestScore'] !== 0 || value['fastestSeconds'] !== 0)) return null;
  // Existing v1 personal records cannot establish any past streak. Upgrade
  // without fabricating wins or discarding a saved best score/time.
  let currentStreak = 0, bestStreak = 0;
  if (value['schemaVersion'] === 2 || value['schemaVersion'] === 3 || v4) {
    const current = value['currentStreak'];
    const record = value['bestStreak'];
    if (!isCount(current) || !isCount(record) ||
        current > record || record > value['victories']) return null;
    currentStreak = current;
    bestStreak = record;
  }
  const masteryMask = (value['schemaVersion'] === 3 || v4) ? value['masteryMask'] : 0;
  if (!isCount(masteryMask) || masteryMask > 7) return null;
  const trackedAttempts = v4 ? value['trackedAttempts'] : value['victories'];
  const bestFailedKills = v4 ? value['bestFailedKills'] : 0;
  if (!isCount(trackedAttempts) || trackedAttempts < 1 ||
      trackedAttempts < value['victories'] || !isCount(bestFailedKills) ||
      bestFailedKills > quota) return null;
  return Object.freeze({
    schemaVersion: 4, quota,
    victories: value['victories'],
    bestScore: value['bestScore'],
    fastestSeconds: value['fastestSeconds'],
    currentStreak, bestStreak, masteryMask, trackedAttempts, bestFailedKills,
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

function gradeDojoStyle(run: DojoReplayRun): {grade: DojoWebStyleGrade; nextTarget: number | null} {
  // #271 awards 100, 200, ... for consecutive kills within this 6/7 cap.
  // Dodge bonuses can exceed this COMBO-ONLY S benchmark. Web tuning, not MCD.
  const ceiling = 50 * run.quota * (run.quota + 1);
  const bScore = Math.ceil(ceiling * 0.5 / 50) * 50;
  const aScore = Math.ceil(ceiling * 0.7 / 50) * 50;
  if (run.score >= ceiling) return {grade:'S',nextTarget:null};
  if (run.score >= aScore) return {grade:'A',nextTarget:ceiling};
  if (run.score >= bScore) return {grade:'B',nextTarget:aScore};
  return {grade:'C',nextTarget:bScore};
}

/**
 * Generate end-screen feedback from ACTUAL Web counters, independent of MCD.
 * `best` comes from `readDojoReplayBest` for the SAME quota. No side effects.
 * The SH-05 glue invokes this once on `finish(win)`, formats `text` into the
 * existing stats node and persists `JSON.stringify(result.best)` only when
 * `shouldPersist`, including losses before any victory. Never call from
 * per-frame updates or from `killEnemy`.
 */
export function createDojoReplayRecap(snapshot: unknown,
  best: Readonly<DojoReplayBest> | null = null): DojoReplayRecap {
  const run = validateRun(snapshot);
  if (best !== null && (best.schemaVersion !== 4 || best.quota !== run.quota ||
      !isCount(best.victories) || !isCount(best.trackedAttempts) ||
      best.trackedAttempts < 1 || best.trackedAttempts < best.victories ||
      !isCount(best.bestFailedKills) || best.bestFailedKills > run.quota ||
      !isCount(best.bestScore) || !isSeconds(best.fastestSeconds) ||
      (best.victories === 0 && (best.bestScore !== 0 || best.fastestSeconds !== 0)) ||
      !isCount(best.currentStreak) || !isCount(best.bestStreak) ||
      best.currentStreak > best.bestStreak || best.bestStreak > best.victories ||
      !isCount(best.masteryMask) || best.masteryMask > 7)) {
    throw new TypeError('Dojo replay record does not match this quota');
  }
  let milestone: DojoReplayMilestone = 'retry';
  let nextBest = best;
  const previousStreak = best?.currentStreak ?? 0;
  if (run.victory) {
    const first = best === null || best.victories === 0;
    const scoreRecord = first || run.score > (best?.bestScore ?? 0);
    const speedRecord = first || run.elapsedSeconds < (best?.fastestSeconds ?? Infinity);
    milestone = first ? 'first-clear' : scoreRecord && speedRecord ? 'double-record'
      : scoreRecord ? 'score-record' : speedRecord ? 'speed-record' : 'clear';
    const currentStreak = Math.min(Number.MAX_SAFE_INTEGER, previousStreak + 1);
    // Web-only medals, preserved across tracked defeats.
    const style = gradeDojoStyle(run);
    const earnedMask = (style.grade === 'S' ? 1 : 0) |
      (run.shots === 0 ? 2 : 0) | (run.dodges >= 3 ? 4 : 0);
    nextBest = Object.freeze({
      schemaVersion: 4, quota: run.quota,
      trackedAttempts: Math.min(Number.MAX_SAFE_INTEGER, (best?.trackedAttempts ?? 0) + 1),
      bestFailedKills: best?.bestFailedKills ?? 0,
      victories: Math.min(Number.MAX_SAFE_INTEGER, (best?.victories ?? 0) + 1),
      bestScore: first ? run.score : Math.max(run.score, best?.bestScore ?? 0),
      fastestSeconds: first ? run.elapsedSeconds
        : Math.min(run.elapsedSeconds, best?.fastestSeconds ?? run.elapsedSeconds),
      currentStreak, bestStreak: Math.max(currentStreak, best?.bestStreak ?? 0),
      masteryMask: (best?.masteryMask ?? 0) | earnedMask,
    });
  } else {
    // A loss now contributes real, bounded progress even before FIRST clear.
    // "trackedAttempts" never pretends to reconstruct unknown legacy defeats.
    nextBest = Object.freeze({
      schemaVersion: 4, quota: run.quota,
      trackedAttempts: Math.min(Number.MAX_SAFE_INTEGER, (best?.trackedAttempts ?? 0) + 1),
      bestFailedKills: Math.max(best?.bestFailedKills ?? 0, Math.min(run.quota, run.kills)),
      victories: best?.victories ?? 0, bestScore: best?.bestScore ?? 0,
      fastestSeconds: best?.fastestSeconds ?? 0,
      currentStreak: 0, bestStreak: best?.bestStreak ?? 0,
      masteryMask: best?.masteryMask ?? 0,
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
  const recordText = !run.victory && nextBest !== null && nextBest.victories > 0
    ? ` · record : ${nextBest.bestScore} pts / ${nextBest.fastestSeconds.toFixed(1)} s`
    : '';
  const attemptText = !run.victory && nextBest !== null && nextBest.victories === 0
    ? ` · MEILLEUR ESSAI ${nextBest.bestFailedKills}/${run.quota} · ${nextBest.trackedAttempts} ESSAI${nextBest.trackedAttempts > 1 ? 'S' : ''} SUIVI${nextBest.trackedAttempts > 1 ? 'S' : ''}` : '';
  const style = run.victory ? gradeDojoStyle(run) : null;
  const stillNeeded = Math.max(0, run.quota - run.kills);
  const styleText = style === null
    ? stillNeeded > 0 ? ` · ${stillNeeded} ENNEMI${stillNeeded > 1 ? 'S' : ''} RESTANT${stillNeeded > 1 ? 'S' : ''}`
      : ' · QUOTA ATTEINT, MAIS RUN PERDU'
    : style.nextTarget === null ? ' · STYLE S — RANG MAX'
      : ` · STYLE ${style.grade} · PROCHAIN RANG : ${style.nextTarget} PTS`;
  const newMasteryBits = run.victory && nextBest !== null
    ? nextBest.masteryMask & ~(best?.masteryMask ?? 0) : 0;
  const newMedals = [
    ...(newMasteryBits & 1 ? ['STYLE S'] : []),
    ...(newMasteryBits & 2 ? ['SANS TIRER'] : []),
    ...(newMasteryBits & 4 ? ['3 ESQUIVES'] : []),
  ];
  const masteryCount = [1, 2, 4].filter(bit => ((nextBest?.masteryMask ?? 0) & bit) !== 0).length;
  const masteryText = run.victory && nextBest !== null
    ? ` · MAÎTRISE ${masteryCount}/3${newMedals.length ? ` · MÉDAILLE : ${newMedals.join(' + ')}` : ''}`
    : '';
  const streakText = run.victory && nextBest !== null && nextBest.currentStreak >= 2
    ? ` · SÉRIE ${nextBest.currentStreak}${nextBest.currentStreak > (best?.bestStreak ?? 0)
      ? ' · RECORD SÉRIE' : ''}`
    : !run.victory && previousStreak > 0 ? ` · SÉRIE ${previousStreak} BRISÉE` : '';
  // Web-only post-round coaching. In particular a first win or a loss
  // deserves a concrete next attempt, not only a record comparison. Keep
  // provenance separate from native MCD RunEnding and never mutate gameplay.
  let replayTarget: string | null = null;
  if (!run.victory) {
    // Before a first clear, beat the best unfinished round, not just this loss.
    const goal = Math.max(run.kills, best?.victories === 0 ? best.bestFailedKills : 0) + 1;
    replayTarget = stillNeeded > 0 && goal <= run.quota
      ? `VISE ${goal} ÉLIMINATION${goal === 1 ? '' : 'S'} AU PROCHAIN ESSAI`
      : 'SURVIS JUSQU’À LA VICTOIRE';
  } else if (best !== null && best.victories > 0) {
    // Compare only to the PREVIOUS same-quota PB, never a just-written PB.
    if (run.score <= best.bestScore && best.bestScore < Number.MAX_SAFE_INTEGER) {
      replayTarget = `+${best.bestScore - run.score + 1} PTS POUR UN NOUVEAU RECORD`;
    } else if (run.elapsedSeconds >= best.fastestSeconds && best.fastestSeconds > 0) {
      replayTarget = `SOUS ${best.fastestSeconds.toFixed(1)} S POUR UN NOUVEAU RECORD`;
    }
  }
  if (run.victory && replayTarget === null) {
    // First clear, double-record and mastered runs share the same meaningful
    // next objectives. Already earned badges are never suggested again.
    const mask = nextBest?.masteryMask ?? 0;
    if ((mask & 2) === 0) replayTarget = 'GAGNE SANS TIRER';
    else if ((mask & 4) === 0) replayTarget = 'RÉUSSIS 3 ESQUIVES EN UNE VICTOIRE';
    else if ((mask & 1) === 0) replayTarget = 'DÉCROCHE LE STYLE S';
  }
  const replayTargetText = replayTarget === null ? '' : ` · DÉFI : ${replayTarget}`;
  return Object.freeze({
    text: `${metrics} · ${title[milestone]}${styleText}${masteryText}${streakText}${recordText}${attemptText}${replayTargetText}`,
    milestone, best: nextBest,
    shouldPersist: true,
    provenance: 'WEB_ONLY',
    styleGrade: style?.grade ?? null,
    nextStyleTarget: style?.nextTarget ?? null,
    currentStreak: nextBest?.currentStreak ?? 0,
    bestStreak: nextBest?.bestStreak ?? 0,
    replayTarget, masteryCount, newMedals:Object.freeze(newMedals),
  });
}
