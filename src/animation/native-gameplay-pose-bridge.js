import { advanceDojoPunchContactGate } from './dojo-punch-contact-gate.js';
import { advanceNativeDeathRuntime } from './native-death-runtime.js';

/**
 * Restore the ACTIVE Dojo frame duration for corpse PBD without undoing the
 * applied MCD/Web time scale. The host's worldDelta is calculated from a
 * capped simulationDt (50ms at 10 FPS), but death motion and its cleanup
 * clock must not lose the unspent active time.
 *
 * The rAF owner provides both deltas from sampleActiveFrameDeltas. It must
 * pass the worldDelta from that SAME tick; a stale/other-actor receipt cannot
 * establish the source clock. Full active elapsed time is forwarded to the
 * solver, which separately caps expensive PBD catch-up on long hitches.
 * Original Web clock policy; NOT native Unity/PhysX scheduling.
 *
 * @param {number} scaledDelta World-time delta from this frame's capped tick.
 * @param {{simulationDelta:number,activeRealDelta:number}|null} frameTiming
 * @returns {number} World-time delta covering the full active rAF frame.
 */
export function resolveDojoDeathScaledFrameDelta(scaledDelta,frameTiming=null) {
  if(!Number.isFinite(scaledDelta)||scaledDelta<0)
    throw new RangeError('Nonnegative finite world delta required');
  if(frameTiming===null)return scaledDelta; // Existing callers stay compatible.
  if(!frameTiming||typeof frameTiming!=='object' ||
      !Number.isFinite(frameTiming.simulationDelta) ||
      !Number.isFinite(frameTiming.activeRealDelta) ||
      frameTiming.simulationDelta<0 || frameTiming.activeRealDelta<0 ||
      frameTiming.activeRealDelta+1e-12<frameTiming.simulationDelta)
    throw new TypeError('Same-frame capped and active real deltas required');
  if(frameTiming.simulationDelta===0) {
    if(scaledDelta!==0)throw new RangeError('World time without a simulation tick');
    return 0; // Paused/resume boundary: do not invent an applied time scale.
  }
  const appliedScale=scaledDelta/frameTiming.simulationDelta;
  const elapsed=frameTiming.activeRealDelta*appliedScale;
  if(!Number.isFinite(elapsed))throw new RangeError('Restored Dojo death time overflow');
  return elapsed;
}

/**
 * Use the exact source-clip seconds sampled by SH-14's GPU pass, NOT the
 * elapsed Web state timer or the 0.5s punch visualization timeout.
 *
 * Caller must separately prove the owner-qualified clip mapping, prepared
 * Unity event interval, active GameObject and mapped receiver. A real contact
 * must be a SH-03 geometry sweep sampled in that same clip-time interval.
 * A source action layer is sampled at actionTime, not the base clip time;\n * it must carry an owned actor receipt and exact action weight.\n * Outputs are requests, never direct damage. No Animator dispatch is inferred.
 *
 * @param {object} state - Per-strike state from createDojoPunchContactGate.
 * @param {object} packet - Current source-qualified renderer/contact receipt.
 * @returns {object} Contact requests and the next per-strike gate state.
 */
export function advanceRenderedDojoPunchGate(state, {
  drawReport, clipBinding, contact = null,
  preparedIntervalConfirmed, activeGameObjectConfirmed,
  methodReceiverConfirmed,
} = {}) {
  // A base clip and a source Animator action layer have distinct clocks.
  // The latter is sampled at drawReport.actionTime, never sampledTime.
  const useBaseClip = typeof clipBinding?.drawClip === 'string' && !!clipBinding.drawClip;
  const useAction = typeof clipBinding?.drawAction === 'string' && !!clipBinding.drawAction;
  if (!clipBinding || typeof clipBinding !== 'object' ||
      useBaseClip === useAction ||
      typeof clipBinding.clipOwner !== 'string' || !clipBinding.clipOwner ||
      !Number.isSafeInteger(clipBinding.clipPathId) || clipBinding.clipPathId <= 0 ||
      typeof clipBinding.provenance !== 'string' || !clipBinding.provenance.trim()) {
    throw new TypeError('Exactly one owner-qualified source clip/action binding required');
  }
  for (const [name, value] of Object.entries({
    preparedIntervalConfirmed, activeGameObjectConfirmed,
    methodReceiverConfirmed,
  })) {
    if (typeof value !== 'boolean') throw new TypeError(name + ' must be boolean');
  }

  // transitionWeight < 1 is a blended pose, NOT proof that Unity would
  // dispatch this clip's callbacks. Solved pose has no active clip either.
  // For source-composed punches the base 'idle/walk' clip is NOT the punch
  // timeline. SH-14 reports the actual action-layer sample separately.
  // Require the owned actor receipt so another enemy cannot lend its event
  // clock to this strike. Incomplete/approximate blend => no inferred hit.
  const actionQualified = useAction &&
    drawReport?.actorPoseOwnedSnapshot === true &&
    drawReport.actorId === state.attackerId &&
    drawReport.action === clipBinding.drawAction &&
    Number.isFinite(drawReport.actionTime) && drawReport.actionTime >= 0 &&
    drawReport.actionEffectiveWeight === 1 &&
    drawReport.actionApproximation !== true;
  const baseQualified = useBaseClip &&
    drawReport?.clip === clipBinding.drawClip &&
    drawReport.action == null &&
    Number.isFinite(drawReport.sampledTime) && drawReport.sampledTime >= 0 &&
    // When SH-14 provides an actor ID, it must match this gate's attacker.
    (drawReport.actorId === undefined || drawReport.actorId === state.attackerId);
  const matched = drawReport?.skinned === true &&
    drawReport.nativeClipSampled === true &&
    drawReport.solvedPoseApplied !== true &&
    (!drawReport.transition || drawReport.transitionWeight === 1) &&
    (actionQualified || baseQualified);
  const currentClipTime = matched
    ? (useAction ? drawReport.actionTime : drawReport.sampledTime)
    : state.lastClipTime;
  const result = advanceDojoPunchContactGate(state, {
    clipOwner: clipBinding.clipOwner,
    clipPathId: clipBinding.clipPathId,
    currentClipTime, activeClipConfirmed: matched,
    preparedIntervalConfirmed, activeGameObjectConfirmed,
    methodReceiverConfirmed, contact: matched ? contact : null,
  });
  return {
    ...result, poseQualified: matched,
    sampledClipTime: currentClipTime,
    poseProvenance: matched ? clipBinding.provenance : null,
  };
}

/**
 * SH-14's opt-in solvedPose accepts final MODEL-space matrices in exactly
 * the active skin pass' bone order. Advance the existing SH-06 solver once
 * and freeze a new pose snapshot so the next actor/frame cannot mutate it.
 * No authored rigidbody/joint definition => null solvedPose, original freeze.
 *
 * @param {object} packet - Complete, separately source-verified rig binding.
 * @returns {object} One GPU pose receipt or an explicit freeze fallback.
 */
export function advanceDojoDeathSkinFrame({
  runtime = null, rig = null, sourceBoneOrder = null,
  scaledDelta = 0, provenance = null, frameTiming = null,
} = {}) {
  if (runtime === null) {
    return {
      status: 'freeze-fallback-missing-verified-physics',
      solvedPose: null, cleanupRequested: false, contacts: [],
    };
  }
  if (!rig || typeof rig !== 'object' || !Array.isArray(rig.boneOrder) ||
      !Array.isArray(rig.parents) || !Array.isArray(sourceBoneOrder) ||
      typeof provenance !== 'string' || !provenance.trim() ||
      !runtime.definition || !Array.isArray(runtime.definition.boneParents) ||
      sourceBoneOrder.length !== rig.boneOrder.length ||
      rig.parents.length !== sourceBoneOrder.length ||
      runtime.definition.boneParents.length !== sourceBoneOrder.length ||
      runtime.boneModelMatrices?.length !== sourceBoneOrder.length * 16) {
    throw new TypeError('Exact source bone order, runtime definition, GPU rig and provenance required');
  }
  for (let index = 0; index < sourceBoneOrder.length; index++) {
    if (typeof sourceBoneOrder[index] !== 'string' ||
        !sourceBoneOrder[index] ||
        sourceBoneOrder[index] !== rig.boneOrder[index] ||
        rig.parents[index] !== runtime.definition.boneParents[index]) {
      throw new RangeError('Source death definition does not match active GPU rig ordering');
    }
  }
  // This is intentionally NOT PhysX: the source-parameterized PBD solver
  // cannot establish Unity angular/CCD equivalence or native cleanup by itself.
  // Web budget: preserve authored substeps on normal frames, allow four
  // slightly larger swept steps at 30 Hz, and discard long-stall catch-up.
  // This is responsive Web physics, not the original PhysX scheduler.
  const activeScaledDelta=resolveDojoDeathScaledFrameDelta(scaledDelta,frameTiming);
  const step = advanceNativeDeathRuntime(runtime, activeScaledDelta, {limitWebFrameWork:true});
  return {
    status: 'source-parameterized-web-solver-not-physx',
    solvedPose: {
      rig, provenance,
      boneModelMatrices: new Float32Array(runtime.boneModelMatrices),
    },
    cleanupRequested: step.cleanupRequested, contacts: step.contacts,
  };
}
