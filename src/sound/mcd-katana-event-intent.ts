/** SH-07 native Katana audio gates, NOT a playback engine.
 * MCD build 20299547, Assembly-CSharp SHA-256
 * ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257.
 * Private evidence: #185 Katana.cs:50-129, #188 Katana.cs:247-354,
 * #186 KatanaAudioResources, #189 AudioResources, #192-193 serialized IDs.
 */
export type KatanaSliceProducer = 'gun-pickup' | 'shatterable' |
  'break-glass' | 'living-body-part';
export type KatanaSliceInput = Readonly<{
  /** Exact source AttackTarget branch; bullet deflection/cut does NOT call PlaySliceSound. */
  producer: KatanaSliceProducer | null;
  /** Unity Time.realtimeSinceStartup, never world/animation time. */
  realtimeSeconds: number;
  /** The Katana instance's own previous lastSliceSound, zero initially. */
  previousSliceRealtimeSeconds: number;
  /** Explicit local browser decode state, NOT Unity Resources.Load proof. */
  localClipDecoded: boolean;
}>;
export type KatanaSliceResult = Readonly<{
  status: 'not-source-slice' | 'native-realtime-rest' |
    'native-request-local-clip-missing' | 'local-clip-request';
  /** Only an *intended* source field update, assuming normal method return. */
  requestedNextSliceRealtimeSeconds: number | null;
  /** Never an observed AudioBufferSourceNode or physical sound. */
  clip: Readonly<{owner: 'resources.assets'; pathId: 1443; name: 'AC_Katana_Hit'}> | null;
  browserAudibilityObserved: false;
}>;

/** Global Katana ScriptableObject (source asset, NOT a runtime load claim).
 * Local browser file must be provided separately in ignored private data.
 */
export const MCD_KATANA_AUDIO = Object.freeze({
  resourceAsset: Object.freeze({owner: 'resources.assets', pathId: 29451}),
  hit: Object.freeze({
    clip: Object.freeze({owner: 'resources.assets' as const, pathId: 1443 as const,
      name: 'AC_Katana_Hit' as const}),
    serializedVolume: 0.5, serializedPitch: 1, priority: 128,
    mixerReference: Object.freeze({fileId: 3, pathId: 659}),
    pitchRandomization: 0.1, volumeRandomization: 0.1,
    relativePitch: true, startFromBeginning: true, realtimeRestSeconds: 0.1,
  }),
  /** These are Start's *fallback* resources only if the entire swing array is null. */
  defaultSwingClips: Object.freeze([
    Object.freeze({owner: 'sharedassets0.assets', pathId: 603, name: 'AC_Katana_Swing_01'}),
    Object.freeze({owner: 'sharedassets0.assets', pathId: 629, name: 'AC_Katana_Swing_02'}),
    Object.freeze({owner: 'resources.assets', pathId: 1644, name: 'AC_Katana_Swing_03'}),
  ]),
});

/**
 * Call ONLY when the qualifying original Katana.AttackTarget path reaches
 * PlaySliceSound, not on arbitrary hits, bullets or raw animation markers.
 * `local-clip-request` is an eligible Web action, not an audible observation.
 */
export function planMcdKatanaSliceSound(input: KatanaSliceInput): KatanaSliceResult {
  if (!input || typeof input !== 'object') throw new TypeError('source Katana slice input required');
  if (input.producer !== null && input.producer !== 'gun-pickup' &&
      input.producer !== 'shatterable' && input.producer !== 'break-glass' &&
      input.producer !== 'living-body-part') throw new TypeError('unknown source slice producer');
  if (!Number.isFinite(input.realtimeSeconds) || input.realtimeSeconds < 0 ||
      !Number.isFinite(input.previousSliceRealtimeSeconds) ||
      input.previousSliceRealtimeSeconds < 0 || typeof input.localClipDecoded !== 'boolean') {
    throw new TypeError('explicit realtime clock and local decode flag required');
  }
  const result = (status: KatanaSliceResult['status'], next: number | null = null,
    clip: KatanaSliceResult['clip'] = null): KatanaSliceResult => Object.freeze({
      status, requestedNextSliceRealtimeSeconds: next, clip,
      browserAudibilityObserved: false,
    });
  if (input.producer === null) return result('not-source-slice');
  if (!(input.realtimeSeconds > input.previousSliceRealtimeSeconds + 0.1)) {
    return result('native-realtime-rest');
  }
  if (!input.localClipDecoded) {
    return result('native-request-local-clip-missing', input.realtimeSeconds);
  }
  return result('local-clip-request', input.realtimeSeconds, MCD_KATANA_AUDIO.hit.clip);
}
