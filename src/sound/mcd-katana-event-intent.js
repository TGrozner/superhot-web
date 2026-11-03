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
/** A fail-closed local WAV registration for an *already source-confirmed* Katana.
 * Creates only a descriptor for the existing browser audio graph; it NEVER
 * performs playback or certifies that a sound has been heard. See private
 * research #185/#188/#193, Assembly-CSharp SHA ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257.
 */
export function planMcdKatanaHitSceneBinding({ sceneAudio, itemId, sourceItemVerified, privateWavPresent, }) {
    if (typeof itemId !== 'string' || !itemId ||
        typeof sourceItemVerified !== 'boolean' ||
        typeof privateWavPresent !== 'boolean' ||
        (sceneAudio !== null && (typeof sceneAudio !== 'object' || Array.isArray(sceneAudio)))) {
        throw new TypeError('exact source item and private original WAV presence required');
    }
    if (!sourceItemVerified || !privateWavPresent)
        return null;
    const base = sceneAudio ?? {};
    const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
    const clips = base['clips'] ?? {};
    const items = base['items'] ?? {};
    if (!isRecord(clips) || !isRecord(items)) {
        throw new TypeError('source audio clips/items must be records');
    }
    const priorItem = Object.hasOwn(items, itemId) ? items[itemId] : {};
    if (!isRecord(priorItem))
        throw new TypeError('source item cues must be a record');
    const key = 'audioNative_resources_assets_1443';
    if (Object.hasOwn(clips, key) || Object.hasOwn(priorItem, 'slice')) {
        throw new Error('pre-existing Katana clip or slice cue must not be overwritten');
    }
    const hit = MCD_KATANA_AUDIO.hit;
    // Web routing label derived *only* from the serialized non-null
    // AudioResource.Channel reference (fileID 3/pathID 659). It is NOT a
    // decoded Unity mixer name, DSP parity or observed native channel load.
    // createAudio().playMcdClip rejects cues without a mixerGroup at the
    // AudioManager.PlayClip channel-present guard. The label deliberately
    // does not claim either 'Gunshots' or 'Env SFX' pitch-scaler routing.
    const sourceChannelLabel = `source-mixer-ref:file${hit.mixerReference.fileId}:path${hit.mixerReference.pathId}`;
    return Object.freeze({
        ...base,
        clips: Object.freeze({ ...clips, [key]: Object.freeze({
                manifestKey: key, ...hit.clip,
            }) }),
        items: Object.freeze({ ...items, [itemId]: Object.freeze({
                ...priorItem, slice: Object.freeze({
                    clipId: key, gain: hit.serializedVolume, pitch: hit.serializedPitch,
                    mixerGroup: sourceChannelLabel,
                    gainRandomization: hit.volumeRandomization,
                    pitchRandomization: hit.pitchRandomization,
                    relativePitch: hit.relativePitch,
                    realtimeCooldown: hit.realtimeRestSeconds,
                    priority: hit.priority,
                }),
            }) }),
    });
}
