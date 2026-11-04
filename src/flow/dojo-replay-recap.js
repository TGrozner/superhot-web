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
function isChallenge(value) {
    if (!isRecord(value) || !isSeconds(value['target']))
        return false;
    const kind = value['kind'], target = value['target'];
    if (kind === 'kills' || kind === 'score')
        return isCount(target) && target >= 1;
    if (kind === 'streak')
        return isCount(target) && target >= 2;
    if (kind === 'time')
        return target > 0;
    return (kind === 'no-shots' || kind === 'dodges' || kind === 'style' || kind === 'survive') && target === 0;
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
        (value['schemaVersion'] !== 1 && value['schemaVersion'] !== 2 &&
            value['schemaVersion'] !== 3 && value['schemaVersion'] !== 4 &&
            value['schemaVersion'] !== 5) ||
        value['quota'] !== quota || !isCount(value['victories']) ||
        (value['schemaVersion'] !== 4 && value['schemaVersion'] !== 5 && value['victories'] < 1) ||
        !isCount(value['bestScore']) || !isSeconds(value['fastestSeconds']))
        return null;
    const v4plus = value['schemaVersion'] === 4 || value['schemaVersion'] === 5;
    if (value['victories'] === 0 &&
        (!v4plus || value['bestScore'] !== 0 || value['fastestSeconds'] !== 0))
        return null;
    // Existing v1 personal records cannot establish any past streak. Upgrade
    // without fabricating wins or discarding a saved best score/time.
    let currentStreak = 0, bestStreak = 0;
    if (value['schemaVersion'] === 2 || value['schemaVersion'] === 3 || v4plus) {
        const current = value['currentStreak'];
        const record = value['bestStreak'];
        if (!isCount(current) || !isCount(record) ||
            current > record || record > value['victories'])
            return null;
        currentStreak = current;
        bestStreak = record;
    }
    const masteryMask = (value['schemaVersion'] === 3 || v4plus) ? value['masteryMask'] : 0;
    if (!isCount(masteryMask) || masteryMask > 7)
        return null;
    const trackedAttempts = v4plus ? value['trackedAttempts'] : value['victories'];
    const bestFailedKills = v4plus ? value['bestFailedKills'] : 0;
    if (!isCount(trackedAttempts) || trackedAttempts < 1 ||
        trackedAttempts < value['victories'] || !isCount(bestFailedKills) ||
        bestFailedKills > quota)
        return null;
    const pending = value['schemaVersion'] === 5 ? value['pendingChallenge'] : null;
    if (pending !== null && !isChallenge(pending))
        return null;
    return Object.freeze({
        schemaVersion: 5, quota,
        victories: value['victories'],
        bestScore: value['bestScore'],
        fastestSeconds: value['fastestSeconds'],
        currentStreak, bestStreak, masteryMask, trackedAttempts, bestFailedKills,
        pendingChallenge: pending === null ? null : Object.freeze({ kind: pending.kind, target: pending.target }),
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
function challengeCompleted(challenge, run, previousStreak) {
    if (challenge === null)
        return false;
    if (challenge.kind === 'kills')
        return run.kills >= challenge.target;
    if (!run.victory)
        return false;
    if (challenge.kind === 'survive')
        return true;
    if (challenge.kind === 'streak')
        return Math.min(Number.MAX_SAFE_INTEGER, previousStreak + 1) >= challenge.target;
    if (challenge.kind === 'score')
        return run.score >= challenge.target;
    if (challenge.kind === 'time')
        return run.elapsedSeconds < challenge.target;
    if (challenge.kind === 'no-shots')
        return run.shots === 0;
    if (challenge.kind === 'dodges')
        return run.dodges >= 3;
    return gradeDojoStyle(run).grade === 'S';
}
// Web UX: the on-screen target uses tenths of a second. Quantize DOWN so
// completing the shown goal always beats the exact stored personal best.
function visibleTimeGoal(bestSeconds) {
    const target = Math.floor(bestSeconds * 10) / 10;
    return target > 0 ? target : null;
}
// Old v5 challenges may hold precise targets. Never round those when retrying:
// a displayed 22.0 must not silently credit 22.02 against an old 22.049 goal.
function displayTimeGoal(target) {
    return Number.isInteger(target * 10) ? target.toFixed(1) : String(target);
}
// Show enough detail to distinguish the actual run time from the active
// strict '<' chrono goal. No rounded 22.0 s for a successful 21.99 s run.
function displayRunSeconds(seconds, goal) {
    for (let digits = 2; digits <= 6; digits++) {
        const shown = seconds.toFixed(digits);
        if ((Number(shown) < goal) === (seconds < goal))
            return shown;
    }
    return String(seconds);
}
function existingChallengePrompt(challenge) {
    switch (challenge.kind) {
        case 'kills':
            return `VISE ${challenge.target} ÉLIMINATION${challenge.target === 1 ? '' : 'S'} AU PROCHAIN ESSAI`;
        case 'score': return `ATTEINS ${challenge.target} PTS POUR LE RECORD`;
        case 'time': return `SOUS ${displayTimeGoal(challenge.target)} S POUR LE RECORD`;
        case 'no-shots': return 'GAGNE SANS TIRER';
        case 'dodges': return 'RÉUSSIS 3 ESQUIVES EN UNE VICTOIRE';
        case 'style': return 'DÉCROCHE LE STYLE S';
        case 'survive': return 'SURVIS JUSQU’À LA VICTOIRE';
        case 'streak': return `FAIS ${challenge.target} VICTOIRES D’AFFILÉE`;
    }
}
// Meaningful feedback after a missed persistent goal, derived from the FINAL
// score; a good partial score/time on a death is never credited as a win.
function describeUnfinishedChallenge(challenge, run, currentStreak) {
    if (challenge.kind === 'kills') {
        const missing = Math.max(0, challenge.target - run.kills);
        return `${missing} ÉLIMINATION${missing === 1 ? '' : 'S'} MANQUANTE${missing === 1 ? '' : 'S'}`;
    }
    if (challenge.kind === 'score') {
        const missing = Math.max(0, challenge.target - run.score);
        return missing > 0 ? `${missing} PTS MANQUANTS${run.victory ? '' : ' · VICTOIRE REQUISE'}`
            : 'SCORE ATTEINT · VICTOIRE REQUISE';
    }
    if (challenge.kind === 'time') {
        return run.elapsedSeconds < challenge.target ? 'CHRONO ATTEINT · VICTOIRE REQUISE'
            : 'CHRONO À BATTRE';
    }
    if (challenge.kind === 'no-shots') {
        return run.shots > 0 ? `${run.shots} TIR${run.shots === 1 ? '' : 'S'} EFFECTUÉ${run.shots === 1 ? '' : 'S'}`
            : 'SANS TIR · VICTOIRE REQUISE';
    }
    if (challenge.kind === 'dodges') {
        const missing = Math.max(0, 3 - run.dodges);
        return missing > 0 ? `${missing} ESQUIVE${missing === 1 ? '' : 'S'} MANQUANTE${missing === 1 ? '' : 'S'}`
            : '3 ESQUIVES ATTEINTES · VICTOIRE REQUISE';
    }
    if (challenge.kind === 'streak') {
        const missing = Math.max(0, challenge.target - currentStreak);
        return run.victory ? `SÉRIE ${currentStreak}/${challenge.target} · ${missing} VICTOIRE${missing === 1 ? '' : 'S'} MANQUANTE${missing === 1 ? '' : 'S'}`
            : `SÉRIE BRISÉE · REPARS DE 0/${challenge.target}`;
    }
    if (challenge.kind === 'style') {
        const grade = gradeDojoStyle(run).grade;
        return grade === 'S' ? 'STYLE S ATTEINT · VICTOIRE REQUISE' : `STYLE ${grade} · S REQUIS`;
    }
    return 'SURVIE JUSQU’À LA VICTOIRE REQUISE';
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
 * `shouldPersist`, including losses before any victory. Never call from
 * per-frame updates or from `killEnemy`.
 */
export function createDojoReplayRecap(snapshot, best = null) {
    const run = validateRun(snapshot);
    if (best !== null && (best.schemaVersion !== 5 || best.quota !== run.quota ||
        !isCount(best.victories) || !isCount(best.trackedAttempts) ||
        best.trackedAttempts < 1 || best.trackedAttempts < best.victories ||
        !isCount(best.bestFailedKills) || best.bestFailedKills > run.quota ||
        !isCount(best.bestScore) || !isSeconds(best.fastestSeconds) ||
        (best.victories === 0 && (best.bestScore !== 0 || best.fastestSeconds !== 0)) ||
        !isCount(best.currentStreak) || !isCount(best.bestStreak) ||
        best.currentStreak > best.bestStreak || best.bestStreak > best.victories ||
        !isCount(best.masteryMask) || best.masteryMask > 7 ||
        (best.pendingChallenge !== null && !isChallenge(best.pendingChallenge)))) {
        throw new TypeError('Dojo replay record does not match this quota');
    }
    let milestone = 'retry';
    let nextBest = best;
    const previousStreak = best?.currentStreak ?? 0;
    const priorChallenge = best?.pendingChallenge ?? null;
    const completedChallenge = challengeCompleted(priorChallenge, run, previousStreak)
        ? priorChallenge?.kind ?? null : null;
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
            schemaVersion: 5, quota: run.quota,
            trackedAttempts: Math.min(Number.MAX_SAFE_INTEGER, (best?.trackedAttempts ?? 0) + 1),
            bestFailedKills: best?.bestFailedKills ?? 0,
            victories: Math.min(Number.MAX_SAFE_INTEGER, (best?.victories ?? 0) + 1),
            bestScore: first ? run.score : Math.max(run.score, best?.bestScore ?? 0),
            fastestSeconds: first ? run.elapsedSeconds
                : Math.min(run.elapsedSeconds, best?.fastestSeconds ?? run.elapsedSeconds),
            currentStreak, bestStreak: Math.max(currentStreak, best?.bestStreak ?? 0),
            masteryMask: (best?.masteryMask ?? 0) | earnedMask,
            pendingChallenge: null,
        });
    }
    else {
        // A loss now contributes real, bounded progress even before FIRST clear.
        // "trackedAttempts" never pretends to reconstruct unknown legacy defeats.
        nextBest = Object.freeze({
            schemaVersion: 5, quota: run.quota,
            trackedAttempts: Math.min(Number.MAX_SAFE_INTEGER, (best?.trackedAttempts ?? 0) + 1),
            bestFailedKills: Math.max(best?.bestFailedKills ?? 0, Math.min(run.quota, run.kills)),
            victories: best?.victories ?? 0, bestScore: best?.bestScore ?? 0,
            fastestSeconds: best?.fastestSeconds ?? 0,
            currentStreak: 0, bestStreak: best?.bestStreak ?? 0,
            masteryMask: best?.masteryMask ?? 0,
            pendingChallenge: null,
        });
    }
    // A partial best is meaningful only before the first clear, and only when
    // the current loss genuinely beats the previous best for this quota.
    if (!run.victory && (best?.victories ?? 0) === 0 &&
        run.kills > (best?.bestFailedKills ?? 0) && run.kills < run.quota) {
        milestone = 'retry-progress';
    }
    const title = {
        'retry': 'REJOUE POUR PRENDRE TA REVANCHE',
        'retry-progress': 'NOUVEAU PALIER AVANT LA VICTOIRE !',
        'first-clear': 'PREMIÈRE VICTOIRE !',
        'double-record': 'DOUBLE RECORD !',
        'score-record': 'NOUVEAU RECORD DE SCORE !',
        'speed-record': 'NOUVEAU RECORD DE TEMPS !',
        'clear': 'REJOUE POUR BATTRE TES RECORDS',
    };
    const elapsedText = priorChallenge?.kind === 'time'
        ? displayRunSeconds(run.elapsedSeconds, priorChallenge.target)
        : run.elapsedSeconds.toFixed(1);
    const metrics = `${run.kills}/${run.quota} ennemis · ${run.shots} tirs · ` +
        `${run.dodges} esquives · ${run.score} pts · ${elapsedText} s`;
    const recordText = !run.victory && nextBest !== null && nextBest.victories > 0
        ? ` · record : ${nextBest.bestScore} pts / ${nextBest.fastestSeconds.toFixed(1)} s`
        : '';
    const attemptText = !run.victory && nextBest !== null && nextBest.victories === 0
        ? ` · MEILLEUR ESSAI ${nextBest.bestFailedKills}/${run.quota} · ${nextBest.trackedAttempts} ESSAI${nextBest.trackedAttempts > 1 ? 'S' : ''} SUIVI${nextBest.trackedAttempts > 1 ? 'S' : ''}` : '';
    // An eventual first victory pays off the actually tracked failed attempts.
    // No historic defeats are inferred from v1-v3 stored personal bests.
    const clearAttemptText = run.victory && milestone === 'first-clear' &&
        (nextBest?.trackedAttempts ?? 0) > 1
        ? ` · ${nextBest?.trackedAttempts ?? 1} ESSAIS POUR LA PREMIÈRE VICTOIRE` : '';
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
    let replayTarget = null;
    let nextChallenge = null;
    if (!run.victory) {
        // Before a first clear, beat the best unfinished round, not just this loss.
        const goal = Math.max(run.kills, best?.victories === 0 ? best.bestFailedKills : 0) + 1;
        replayTarget = stillNeeded > 0 && goal <= run.quota
            ? `VISE ${goal} ÉLIMINATION${goal === 1 ? '' : 'S'} AU PROCHAIN ESSAI`
            : 'SURVIS JUSQU’À LA VICTOIRE';
        nextChallenge = Object.freeze(replayTarget === 'SURVIS JUSQU’À LA VICTOIRE'
            ? { kind: 'survive', target: 0 } : { kind: 'kills', target: goal });
    }
    else if (best !== null && best.victories > 0) {
        // Compare only to the PREVIOUS same-quota PB, never a just-written PB.
        if (run.score <= best.bestScore && best.bestScore < Number.MAX_SAFE_INTEGER) {
            replayTarget = `+${best.bestScore - run.score + 1} PTS POUR UN NOUVEAU RECORD`;
            nextChallenge = Object.freeze({ kind: 'score', target: best.bestScore + 1 });
        }
        else if (run.elapsedSeconds >= best.fastestSeconds) {
            const timeGoal = visibleTimeGoal(best.fastestSeconds);
            if (timeGoal !== null) {
                replayTarget = `SOUS ${displayTimeGoal(timeGoal)} S POUR UN NOUVEAU RECORD`;
                nextChallenge = Object.freeze({ kind: 'time', target: timeGoal });
            }
        }
    }
    if (run.victory && replayTarget === null) {
        // First clear, double-record and mastered runs share the same meaningful
        // next objectives. Already earned badges are never suggested again.
        const mask = nextBest?.masteryMask ?? 0;
        if ((mask & 2) === 0) {
            replayTarget = 'GAGNE SANS TIRER';
            nextChallenge = Object.freeze({ kind: 'no-shots', target: 0 });
        }
        else if ((mask & 4) === 0) {
            replayTarget = 'RÉUSSIS 3 ESQUIVES EN UNE VICTOIRE';
            nextChallenge = Object.freeze({ kind: 'dodges', target: 0 });
        }
        else if ((mask & 1) === 0) {
            replayTarget = 'DÉCROCHE LE STYLE S';
            nextChallenge = Object.freeze({ kind: 'style', target: 0 });
        }
    }
    // After all three medals, consecutive wins give mastered players a real
    // endgame replay goal without modifying combat or an MCD checkpoint.
    if (run.victory && replayTarget === null && nextBest !== null &&
        nextBest.masteryMask === 7 && nextBest.bestStreak < Number.MAX_SAFE_INTEGER) {
        const target = Math.max(2, nextBest.bestStreak + 1);
        replayTarget = `FAIS ${target} VICTOIRES D’AFFILÉE`;
        nextChallenge = Object.freeze({ kind: 'streak', target });
    }
    // Keep the PREVIOUS assigned challenge until a real round completes it.
    // A defeat must not silently discard a shot-free, speed or score objective.
    const retainingChallenge = priorChallenge !== null && completedChallenge === null;
    if (retainingChallenge) {
        nextChallenge = priorChallenge;
        replayTarget = existingChallengePrompt(priorChallenge);
    }
    const retryDetail = retainingChallenge && priorChallenge !== null
        ? describeUnfinishedChallenge(priorChallenge, run, nextBest?.currentStreak ?? 0) : null;
    const retryDetailText = retryDetail === null ? '' : ` · BILAN DÉFI : ${retryDetail}`;
    const replayTargetText = replayTarget === null ? '' :
        ` · ${retainingChallenge ? 'DÉFI À RETENTER' : 'DÉFI'} : ${replayTarget}`;
    const completedLabel = completedChallenge === null ? null : {
        'kills': 'ÉLIMINATIONS', 'score': 'SCORE', 'time': 'CHRONO',
        'no-shots': 'SANS TIRER', 'dodges': '3 ESQUIVES', 'style': 'STYLE S',
        'survive': 'SURVIE', 'streak': 'SÉRIE DE VICTOIRES',
    }[completedChallenge];
    const completedText = completedLabel === null ? '' : ` · DÉFI RÉUSSI : ${completedLabel}`;
    // Store exactly the next displayed goal, never a guess about a native run.
    if (nextBest !== null)
        nextBest = Object.freeze({ ...nextBest, pendingChallenge: nextChallenge });
    return Object.freeze({
        text: `${title[milestone]} · ${metrics}${clearAttemptText}${styleText}${masteryText}${streakText}${recordText}${attemptText}${completedText}${replayTargetText}${retryDetailText}`,
        milestone, best: nextBest,
        shouldPersist: true,
        provenance: 'WEB_ONLY',
        styleGrade: style?.grade ?? null,
        nextStyleTarget: style?.nextTarget ?? null,
        currentStreak: nextBest?.currentStreak ?? 0,
        bestStreak: nextBest?.bestStreak ?? 0,
        replayTarget, masteryCount, newMedals: Object.freeze(newMedals),
        completedChallenge, retryDetail,
    });
}
