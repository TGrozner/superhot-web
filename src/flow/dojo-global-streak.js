const isCount = (value) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const isQuota = (value) => value === 6 || value === 7;
const boundedIncrement = (value) => Math.min(value + 1, Number.MAX_SAFE_INTEGER);
/** Invalid, incompatible or tampered storage starts a NEW global streak. */
export function readDojoGlobalStreak(raw) {
    if (raw === null)
        return null;
    let value;
    try {
        value = JSON.parse(raw);
    }
    catch {
        return null;
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return null;
    const item = Object.fromEntries(Object.entries(value));
    if (item['schemaVersion'] !== 1 || !isCount(item['attempts']) ||
        !isCount(item['victories']) || !isCount(item['currentStreak']) ||
        !isCount(item['bestStreak']) || !isQuota(item['lastQuota']) ||
        item['attempts'] < 1 || item['victories'] > item['attempts'] ||
        item['bestStreak'] > item['victories'] ||
        item['currentStreak'] > item['bestStreak'])
        return null;
    return Object.freeze({
        schemaVersion: 1, attempts: item['attempts'], victories: item['victories'],
        currentStreak: item['currentStreak'], bestStreak: item['bestStreak'],
        lastQuota: item['lastQuota'],
    });
}
/**
 * Consume the terminal result after the active round (not after each kill).
 * Loss at quota 7 resets a run won at quota 6, and vice versa.
 * Historical per-format records cannot reconstruct global ordering.
 */
export function advanceDojoGlobalStreak(previous, round) {
    if (!isQuota(round.quota) || typeof round.victory !== 'boolean') {
        throw new TypeError('Dojo global streak requires a completed 6/7 round');
    }
    if (previous !== null && readDojoGlobalStreak(JSON.stringify(previous)) === null) {
        throw new TypeError('Invalid previous global streak');
    }
    const currentStreak = round.victory ? boundedIncrement(previous?.currentStreak ?? 0) : 0;
    const bestStreak = Math.max(previous?.bestStreak ?? 0, currentStreak);
    const record = Object.freeze({
        schemaVersion: 1,
        attempts: boundedIncrement(previous?.attempts ?? 0),
        victories: round.victory ? boundedIncrement(previous?.victories ?? 0) : previous?.victories ?? 0,
        currentStreak, bestStreak, lastQuota: round.quota,
    });
    const previousStreak = previous?.currentStreak ?? 0;
    const announcement = round.victory && currentStreak >= 2
        ? `SÉRIE GLOBALE ${currentStreak} VICTOIRES${currentStreak > (previous?.bestStreak ?? 0) ? ' · NOUVEAU RECORD' : ''}`
        : !round.victory && previousStreak >= 2
            ? `SÉRIE GLOBALE ${previousStreak} BRISÉE`
            : null;
    return Object.freeze({ record, announcement, provenance: 'WEB_ONLY' });
}
