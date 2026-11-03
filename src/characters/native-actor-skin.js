/**
 * Runtime source-clip to actual WebGL skin draw for independent actors.
 *
 * This consumes an ALREADY validated createNativeSkinPass. Source clip/state
 * membership and exact transition availability come from that active package,
 * never the global MCD inventory (clips belonging to other avatars are not
 * automatically compatible with this skeleton).
 *
 * All times are caller-owned: state time is elapsed state seconds (multiplied
 * only by the source state's recorded speed), raw clip time is clip seconds,
 * and transition elapsed is wall/source transition seconds. No clock, Mecanim
 * branch condition, attack trigger, IK, or death motion is inferred here.
 * Unknown clips/states/edges fail closed before submitting a GPU draw.
 *
 * Returned matrices are OWNED Float32Array snapshots, unlike the borrowed
 * createNativeSkinPass.draw() report. The same sampled frame thus remains
 * available for the exact actor's hitboxes, weapon socket and late shot even
 * when another actor is rendered before the gameplay consumer runs.
 */

/**
 * Reactive Web animation accents; these are a deliberate game-feel choice,
 * NOT source Animator clips or native timing. They only accompany an actual
 * available hit/punch clip, never substitute for missing source animation.
 * Clock and actor identity come from the live Dojo gameplay caller.
 */
function webPoseReaction(actorId, pose, identity, solvedPose) {
  if (solvedPose !== null || (identity.name !== 'hit' && identity.name !== 'punch')) {
    return null;
  }
  const hit = identity.name === 'hit';
  const duration = hit ? .32 : .36;
  if (pose.time <= 0 || pose.time >= duration) return null;
  const envelope = Math.sin(Math.PI * pose.time / duration);
  let parity = typeof actorId === 'number' ? actorId % 2 : 0;
  if (typeof actorId === 'string') {
    for (let i = 0; i < actorId.length; i++) parity = (parity + actorId.charCodeAt(i)) % 2;
  }
  const side = parity ? 1 : -1;
  return Object.freeze({
    kind: identity.name,
    pitch: (hit ? .08 : -.14) * envelope,
    roll: side * (hit ? .22 : .035) * envelope,
    design: 'Web-only reactive animation accent',
  });
}

/**
 * @param {ReturnType<import('./native-skin-pass.js').createNativeSkinPass>} skinPass
 */
export function createNativeActorSkinRuntime(skinPass) {
  if (!skinPass || typeof skinPass.draw !== 'function' ||
      typeof skinPass.createInstance !== 'function' ||
      typeof skinPass.createStateInstance !== 'function' ||
      !Array.isArray(skinPass.availableClips) ||
      !Array.isArray(skinPass.availableTransitions) ||
      !Array.isArray(skinPass.availableActions) ||
      !skinPass.states || !skinPass.rig) {
    throw new TypeError('A live, source-validated native GPU skin pass is required');
  }
  const clips = new Set(skinPass.availableClips);
  const transitions = new Set(skinPass.availableTransitions);
  const actions = new Set(skinPass.availableActions);
  const instances = new Map();

  function choosePose(selection, label) {
    if (!selection || typeof selection !== 'object' || Array.isArray(selection)) {
      throw new TypeError(label + ' requires a source state or named sampled clip');
    }
    const isState = Object.hasOwn(selection, 'state');
    const isClip = Object.hasOwn(selection, 'clip');
    if (isState === isClip || !Number.isFinite(selection.time) || selection.time < 0) {
      throw new TypeError(label + ' requires exactly one source state/clip and nonnegative time');
    }
    let key;
    let instance;
    let time = selection.time;
    let identity;
    if (isState) {
      const stateName = selection.state;
      const state = typeof stateName === 'string' ? skinPass.states[stateName] : null;
      if (!state) throw new RangeError('Source animation state unavailable: ' + String(stateName));
      if (selection.playback !== undefined) {
        throw new TypeError('A source state determines its own playback; do not override it');
      }
      key = 'state:' + stateName;
      instance = instances.get(key);
      if (!instance) {
        instance = skinPass.createStateInstance(stateName);
        instances.set(key, instance);
      }
      time *= state.speed;
      identity = Object.freeze({ kind: 'state', name: stateName, clip: instance.clip });
    } else {
      if (typeof selection.clip !== 'string' || !clips.has(selection.clip)) {
        throw new RangeError('Source sampled clip unavailable: ' + String(selection.clip));
      }
      if (selection.playback !== 'loop' && selection.playback !== 'clamp') {
        throw new TypeError('Raw source clip requires explicit loop or clamp playback');
      }
      key = 'clip:' + selection.clip + ':' + selection.playback;
      instance = instances.get(key);
      if (!instance) {
        instance = skinPass.createInstance({
          clip: selection.clip, playback: selection.playback,
        });
        instances.set(key, instance);
      }
      identity = Object.freeze({ kind: 'clip', name: selection.clip, clip: instance.clip });
    }
    if (!Number.isFinite(time)) throw new RangeError('Source clip time overflow');
    return { instance, time, identity };
  }

  /**
   * Draw an independently clocked actor from source-qualified samples.
   * The caller must select the actual source state/clip from that actor's
   * controller and supply model/view matrices. There is no guessed fallback.
   *
   * pose: {state,time} OR {clip,playback,time}; optional
   * transition:{from:{state,time}|{clip,playback,time},elapsed};
   * action is exactly the existing source-mask/precomposition descriptor.
   * solvedPose is the SH-06 death result bound to skinPass.rig, mutually
   * exclusive with transition/action. No authored ragdoll is synthesized.
   *
   * @param {object} frame
   * @returns {object} Owned actor-specific pose/socket report from a real draw.
   */
  function drawActor({
    actorId, pose, modelMatrix, viewProjection, color,
    cameraPosition = null, shaderTime, sourceLighting,
  } = {}) {
    if (!(typeof actorId === 'string' && actorId.length > 0) &&
        !(Number.isSafeInteger(actorId) && actorId >= 0)) {
      throw new TypeError('Drawn actor requires stable nonempty string or nonnegative integer ID');
    }
    const selected = choosePose(pose, 'actor pose');
    const solvedPose = pose.solvedPose ?? null;
    const action = pose.action ?? null;
    const transitionDescriptor = pose.transition ?? null;
    if (solvedPose !== null && (action !== null || transitionDescriptor !== null)) {
      throw new TypeError('An externally solved actor pose cannot also blend source clips/actions');
    }
    let transition = null;
    if (transitionDescriptor !== null) {
      const from = choosePose(transitionDescriptor.from, 'source transition.from');
      const key = from.instance.clip + '->' + selected.instance.clip;
      if (!transitions.has(key)) {
        throw new RangeError('Source transition unavailable: ' + key);
      }
      if (!Number.isFinite(transitionDescriptor.elapsed) || transitionDescriptor.elapsed < 0) {
        throw new TypeError('Source transition elapsed must be nonnegative');
      }
      transition = {
        from: from.instance, fromTime: from.time,
        elapsed: transitionDescriptor.elapsed,
      };
    }
    if (action !== null && (!action || typeof action.state !== 'string' ||
        !actions.has(action.state))) {
      throw new RangeError('Source-composable actor action unavailable: ' + String(action?.state));
    }
    const reaction = webPoseReaction(actorId, pose, selected.identity, solvedPose);
    const draw = {
      instance: selected.instance, time: selected.time,
      modelMatrix, viewProjection, color, cameraPosition,
      transition, action, solvedPose,
      webPoseLean: reaction,
    };
    if (shaderTime !== undefined) draw.shaderTime = shaderTime;
    if (sourceLighting !== undefined) draw.sourceLighting = sourceLighting;
    const report = skinPass.draw(draw);
    // GPU pass reuses its matrix scratch for every actor; copy *immediately*.
    const matrices = new Float32Array(report.boneModelMatrices);
    const socket = report.weaponAttachmentMatrix === null
      ? null : new Float32Array(report.weaponAttachmentMatrix);
    return Object.freeze({
      ...report, actorId, actorSourceSelection: selected.identity,
      boneModelMatrices: matrices, weaponAttachmentMatrix: socket,
      actorWebPoseReaction: reaction,
      // A serialized controller/state name is NOT proof of active native
      // Mecanim runtime branch or of 1:1 gameplay animation behavior.
      nativeActorControllerExecutionVerified: false,
      actorPoseOwnedSnapshot: true,
    });
  }

  return Object.freeze({
    rig: skinPass.rig,
    availableClips: skinPass.availableClips,
    availableStates: Object.freeze(Object.keys(skinPass.states)),
    availableActions: skinPass.availableActions,
    availableTransitions: skinPass.availableTransitions,
    drawActor,
  });
}
