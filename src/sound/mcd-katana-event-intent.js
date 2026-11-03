/** Global Katana ScriptableObject (source asset, NOT a runtime load claim).
 * Local browser file must be provided separately in ignored private data.
 */
export const MCD_KATANA_AUDIO = Object.freeze({
    resourceAsset: Object.freeze({ owner: 'resources.assets', pathId: 29451 }),
    hit: Object.freeze({
        clip: Object.freeze({ owner: 'resources.assets', pathId: 1443,
            name: 'AC_Katana_Hit' }),
        serializedVolume: 0.5, serializedPitch: 1, priority: 128,
        mixerReference: Object.freeze({ fileId: 3, pathId: 659 }),
        pitchRandomization: 0.1, volumeRandomization: 0.1,
        relativePitch: true, startFromBeginning: true, realtimeRestSeconds: 0.1,
    }),
    /** These are Start's *fallback* resources only if the entire swing array is null. */
    defaultSwingClips: Object.freeze([
        Object.freeze({ owner: 'sharedassets0.assets', pathId: 603, name: 'AC_Katana_Swing_01' }),
        Object.freeze({ owner: 'sharedassets0.assets', pathId: 629, name: 'AC_Katana_Swing_02' }),
        Object.freeze({ owner: 'resources.assets', pathId: 1644, name: 'AC_Katana_Swing_03' }),
    ]),
});
/**
 * Call ONLY when the qualifying original Katana.AttackTarget path reaches
 * PlaySliceSound, not on arbitrary hits, bullets or raw animation markers.
 * `local-clip-request` is an eligible Web action, not an audible observation.
 */
export function planMcdKatanaSliceSound(input) {
    if (!input || typeof input !== 'object')
        throw new TypeError('source Katana slice input required');
    if (input.producer !== null && input.producer !== 'gun-pickup' &&
        input.producer !== 'shatterable' && input.producer !== 'break-glass' &&
        input.producer !== 'living-body-part')
        throw new TypeError('unknown source slice producer');
    if (!Number.isFinite(input.realtimeSeconds) || input.realtimeSeconds < 0 ||
        !Number.isFinite(input.previousSliceRealtimeSeconds) ||
        input.previousSliceRealtimeSeconds < 0 || typeof input.localClipDecoded !== 'boolean') {
        throw new TypeError('explicit realtime clock and local decode flag required');
    }
    const result = (status, next = null, clip = null) => Object.freeze({
        status, requestedNextSliceRealtimeSeconds: next, clip,
        browserAudibilityObserved: false,
    });
    if (input.producer === null)
        return result('not-source-slice');
    if (!(input.realtimeSeconds > input.previousSliceRealtimeSeconds + 0.1)) {
        return result('native-realtime-rest');
    }
    if (!input.localClipDecoded) {
        return result('native-request-local-clip-missing', input.realtimeSeconds);
    }
    return result('local-clip-request', input.realtimeSeconds, MCD_KATANA_AUDIO.hit.clip);
}
