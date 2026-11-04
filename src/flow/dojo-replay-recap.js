/**
 * SH-08 / J3: browser-only Dojo replay goals, not MCD progression.
 *
 * Consumes the scoreboard maintained by SH-05; does not award points, count
 * kills, modify the encounter quota, reset combat or own timers/inputs.
 * A completed 6-kill round and a 7-kill round have SEPARATE records.
 * Creative Web streaks are stored in the existing per-quota localStorage key.
 * Caller owns persistence and UI. No assets or private data required.
 */
const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
function isQuota(value) {
    return value === 6 || value === 7;
}
function isCount(value) {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function isSeconds(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
/**
 * Decode untrusted storage; invalid JSON/foreign quota/unknown schema means
 * "no stored record", never a crash or a borrowed 6-vs-7 score.
 */
export function readDojoReplayBest(json, quota) {
    if (!isQuota(quota) || typeof json !== 'string')
        return null;
    let value;
    try {
        value = JSON.parse(json);
    }
    catch {
        return null;
    }
    if (!isRecord(value) ||
        (value['schemaVersion'] !== 1 && value['schemaVersion'] !== 2 && value['schemaVersion'] !== 3) ||
        value['quota'] !== quota || !isCount(value['victories']) || value['victories'] < 1 ||
        !isCount(value['bestScore']) || !isSeconds(value['fastestSeconds']))
        return null;
    // Existing v1 personal records cannot establish any past streak. Upgrade
    // without fabricating wins or discarding a saved best score/time.
    let currentStreak = 0, bestStreak = 0;
    if (value['schemaVersion'] === 2 || value['schemaVersion'] === 3) {
        const current = value['currentStreak'];
        const record = value['bestStreak'];
        if (!isCount(current) || !isCount(record) ||
            current > record || record > value['victories'])
            return null;
        currentStreak = current;
        bestStreak = record;
    }
    const masteryMask = value['schemaVersion'] === 3 ? value['masteryMask'] : 0;
    if (!isCount(masteryMask) || masteryMask > 7)
        return null;
    return Object.freeze({
        schemaVersion: 3, quota,
        victories: value['victories'],
        bestScore: value['bestScore'],
        fastestSeconds: value['fastestSeconds'],
        currentStreak, bestStreak, masteryMask,
    });
}
function validateRun(value) {
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
function gradeDojoStyle(run) {
    // #271 awards 100, 200, ... for consecutive kills within this 6/7 cap.
    // Dodge bonuses can exceed this COMBO-ONLY S benchmark. Web tuning, not MCD.
    const ceiling = 50 * run.quota * (run.quota + 1);
    const bScore = Math.ceil(ceiling * 0.5 / 50) * 50;
    const aScore = Math.ceil(ceiling * 0.7 / 50) * 50;
    if (run.score >= ceiling)
        return { grade: 'S', nextTarget: null };
    if (run.score >= aScore)
        return { grade: 'A', nextTarget: ceiling };
    if (run.score >= bScore)
        return { grade: 'B', nextTarget: aScore };
    return { grade: 'C', nextTarget: bScore };
}
/**
 * Generate end-screen feedback from ACTUAL Web counters, independent of MCD.
 * `best` comes from `readDojoReplayBest` for the SAME quota. No side effects.
 * The SH-05 glue invokes this once on `finish(win)`, formats `text` into the
 * existing stats node and persists `JSON.stringify(result.best)` only when
 * `shouldPersist`, including losses that break an active streak. Never call from
 * per-frame updates or from `killEnemy`.
 */
export function createDojoReplayRecap(snapshot, best = null) {
    const run = validateRun(snapshot);
    if (best !== null && (best.schemaVersion !== 3 || best.quota !== run.quota ||
        !isCount(best.victories) || best.victories < 1 ||
        !isCount(best.bestScore) || !isSeconds(best.fastestSeconds) ||
        !isCount(best.currentStreak) || !isCount(best.bestStreak) ||
        best.currentStreak > best.bestStreak || best.bestStreak > best.victories ||
        !isCount(best.masteryMask) || best.masteryMask > 7)) {
        throw new TypeError('Dojo replay record does not match this quota');
    }
    let milestone = 'retry';
    let nextBest = best;
    const previousStreak = best?.currentStreak ?? 0;
    if (run.victory) {
        const first = best === null;
        const scoreRecord = first || run.score > best.bestScore;
        const speedRecord = first || run.elapsedSeconds < best.fastestSeconds;
        milestone = first ? 'first-clear' : scoreRecord && speedRecord ? 'double-record'
            : scoreRecord ? 'score-record' : speedRecord ? 'speed-record' : 'clear';
        const currentStreak = Math.min(Number.MAX_SAFE_INTEGER, previousStreak + 1);
        // Creative, opt-in mastery track. These are observed run counters, not
        // original MCD achievements or a substitute for native progression.
        const style = gradeDojoStyle(run);
        const earnedMask = (style.grade === 'S' ? 1 : 0) |
            (run.shots === 0 ? 2 : 0) | (run.dodges >= 3 ? 4 : 0);
        nextBest = Object.freeze({
            schemaVersion: 3, quota: run.quota,
            victories: first ? 1 : Math.min(Number.MAX_SAFE_INTEGER, best.victories + 1),
            bestScore: first ? run.score : Math.max(run.score, best.bestScore),
            fastestSeconds: first ? run.elapsedSeconds : Math.min(run.elapsedSeconds, best.fastestSeconds),
            currentStreak,
            bestStreak: Math.max(currentStreak, best?.bestStreak ?? 0),
            masteryMask: (best?.masteryMask ?? 0) | earnedMask,
        });
    }
    else if (best !== null && previousStreak > 0) {
        // finish(false) is already wired to write when shouldPersist is true.
        // A defeat breaks the chain but never deletes PB score/time or wins.
        nextBest = Object.freeze({ ...best, currentStreak: 0 });
    }
    const title = {
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
    // Personalized challenge uses the SAME quota's previous PBs, never a
    // fabricated MCD checkpoint or kill-completion signal. New PBs are compared
    // against the previous run, not the record updated above.
    let replayTarget = null;
    if (run.victory && best !== null) {
        if (run.score <= best.bestScore && best.bestScore < Number.MAX_SAFE_INTEGER) {
            replayTarget = `+${best.bestScore - run.score + 1} PTS POUR UN NOUVEAU RECORD`;
        }
        else if (run.elapsedSeconds >= best.fastestSeconds && best.fastestSeconds > 0) {
            replayTarget = `SOUS ${best.fastestSeconds.toFixed(1)} S POUR UN NOUVEAU RECORD`;
        }
        else if (((nextBest?.masteryMask ?? 0) & 2) === 0 && run.shots > 0) {
            replayTarget = 'GAGNE SANS TIRER';
        }
        else if (((nextBest?.masteryMask ?? 0) & 4) === 0 && run.dodges < 3) {
            replayTarget = 'RÉUSSIS 3 ESQUIVES EN UNE VICTOIRE';
        }
    }
    const replayTargetText = replayTarget === null ? '' : ` · DÉFI : ${replayTarget}`;
    return Object.freeze({
        text: `${metrics} · ${title[milestone]}${styleText}${masteryText}${streakText}${recordText}${replayTargetText}`,
        milestone, best: nextBest,
        shouldPersist: run.victory || previousStreak > 0,
        provenance: 'WEB_ONLY',
        styleGrade: style?.grade ?? null,
        nextStyleTarget: style?.nextTarget ?? null,
        currentStreak: nextBest?.currentStreak ?? 0,
        bestStreak: nextBest?.bestStreak ?? 0,
        replayTarget, masteryCount, newMedals: Object.freeze(newMedals),
    });
}
