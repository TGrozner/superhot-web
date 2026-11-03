import { advanceDojoPunchContactGate } from './dojo-punch-contact-gate.js';
import { advanceNativeDeathRuntime } from './native-death-runtime.js';

/**
 * Use the exact source-clip seconds sampled by SH-14's GPU pass, NOT the
 * elapsed Web state timer or the 0.5s punch visualization timeout.
 *
 * Caller must separately prove the owner-qualified clip mapping, prepared
 * Unity event interval, active GameObject and mapped receiver. A real contact
 * must be a SH-03 geometry sweep sampled in that same clip-time interval.
 * Outputs are requests, never direct damage. No Animator dispatch is inferred.
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
  if (!clipBinding || typeof clipBinding !== 'object' ||
      typeof clipBinding.drawClip !== 'string' || !clipBinding.drawClip ||
      typeof clipBinding.clipOwner !== 'string' || !clipBinding.clipOwner ||
      !Number.isSafeInteger(clipBinding.clipPathId) || clipBinding.clipPathId <= 0 ||
      typeof clipBinding.provenance !== 'string' || !clipBinding.provenance.trim()) {
    throw new TypeError('Explicit owner-qualified source clip-to-GPU binding required');
  }
  for (const [name, value] of Object.entries({
    preparedIntervalConfirmed, activeGameObjectConfirmed,
    methodReceiverConfirmed,
  })) {
    if (typeof value !== 'boolean') throw new TypeError(name + ' must be boolean');
  }

  // transitionWeight < 1 is a blended pose, NOT proof that Unity would
  // dispatch this clip's callbacks. Solved pose has no active clip either.
  const matched = drawReport?.skinned === true &&
    drawReport.nativeClipSampled === true &&
    drawReport.solvedPoseApplied !== true &&
    drawReport.clip === clipBinding.drawClip &&
    typeof drawReport.sampledTime === 'number' &&
    Number.isFinite(drawReport.sampledTime) && drawReport.sampledTime >= 0 &&
    (!drawReport.transition || drawReport.transitionWeight === 1);
  const currentClipTime = matched ? drawReport.sampledTime : state.lastClipTime;
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
  scaledDelta = 0, provenance = null,
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
  // Browser-render budget: preserve exact authored substep size when run,
  // but refuse the slow-frame catch-up spiral on multiple dead actors.
  const step = advanceNativeDeathRuntime(runtime, scaledDelta, {limitWebFrameWork:true});
  return {
    status: 'source-parameterized-web-solver-not-physx',
    solvedPose: {
      rig, provenance,
      boneModelMatrices: new Float32Array(runtime.boneModelMatrices),
    },
    cleanupRequested: step.cleanupRequested, contacts: step.contacts,
  };
}
