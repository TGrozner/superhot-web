/**
 * SH-07 Dojo/build10 bullet-contact Stun AUDIO bridge.
 *
 * Proven statically for MCD 20299547, Assembly-CSharp SHA-256
 * ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257:
 * private #127 Bullet.cs:785-970; #105 PejAiBody.cs:478-536;
 * #113 AudioManager.cs:579-612; #144-147 Unity serialized bindings.
 *
 * Requires the already-composed SH-06 plan, which in turn requires a
 * qualified native body-part/controller contact. An ordinary Web hit sphere
 * MUST NOT be promoted to that qualification.
 *
 * No sound sample, Unity effect or AudioContext is created here.
 */
import { planMcdSourceBoundStunClip } from './mcd-stun-serialized-clips.js';
import { MCD_PREFAB_SOUND_RESULT } from './mcd-prefab-sound-intent.js';

const NO_SOUND = Object.freeze({
  qualifiedNativeStunObserved: false,
  audibleInBrowserObserved: false,
});

export function planDojoBulletStunAudio({ contactPlan, playbackState } = {}) {
  if (!contactPlan || typeof contactPlan !== 'object' || Array.isArray(contactPlan)) {
    throw new TypeError('a source-bounded bullet contact plan is required');
  }

  if (contactPlan.branch === 'unqualified-body-part-contact' ||
      contactPlan.branch === 'no-stun-request') {
    if (contactPlan.stun !== null) {
      throw new TypeError('a no-stun branch cannot contain Stun commands');
    }
    return Object.freeze({
      ...NO_SOUND,
      status: 'source-did-not-request-stun',
      prefabName: null, clip: null, localClipRequest: null, webConcreteSelector: null,
    });
  }

  if (contactPlan.branch !== 'source-stun-request' ||
      !contactPlan.stun || !Array.isArray(contactPlan.stun.commands) ||
      contactPlan.nativeInvocationObserved !== false) {
    throw new TypeError('expected the SH-06 source-qualified Stun command plan');
  }

  // The callee decides by its *isConcrete argument* at this invocation.
  // Do NOT read enemy.reaction.stunedConcretePart here: the source can retain
  // that previous-state flag after a subsequent concrete hit.
  const sourceClip = planMcdSourceBoundStunClip(contactPlan.stun.commands, playbackState);
  if (sourceClip === null) {
    return Object.freeze({
      ...NO_SOUND,
      status: 'stun-called-without-audio-request',
      prefabName: null, clip: null, localClipRequest: null, webConcreteSelector: null,
    });
  }

  const { prefabName, playback } = sourceClip.nativeRequest;
  if (prefabName !== 'EnemyStun' && prefabName !== 'EnemyStunConcrete') {
    throw new TypeError('unexpected native Stun audio prefab');
  }
  const webConcreteSelector = prefabName === 'EnemyStunConcrete';
  if (playback.status !== MCD_PREFAB_SOUND_RESULT.PLAY_REQUEST &&
      playback.status !== MCD_PREFAB_SOUND_RESULT.EMPTY_EFFECT) {
    throw new TypeError('unexpected native AudioPrefab playback outcome');
  }

  return Object.freeze({
    ...NO_SOUND,
    status: playback.status === MCD_PREFAB_SOUND_RESULT.PLAY_REQUEST
      ? 'source-local-clip-request' : 'source-pool-absent',
    sourceBulletBranch: contactPlan.reason,
    prefabName,
    clip: sourceClip.serializedBinding.clip,
    // SH-05 may supply this boolean to audio.stun only if its actual gameplay
    // hook is the same qualified Stun invocation and scene pool is available.
    // The position and realtime clock must come from the *current* gameplay
    // context; neither is synthesized from unrelated Web hit spheres.
    webConcreteSelector,
    localClipRequest: sourceClip.localClipRequest,
    nextEligibleRealtimeSeconds: sourceClip.nativeRequest.nextEligibleRealtimeSeconds,
  });
}
