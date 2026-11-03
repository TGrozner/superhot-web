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
 * available hit/punch clip or source-composable fire action; no missing source
 * animation, attack event or fire decision is synthesized.
 * Clock and actor identity come from the live Dojo gameplay caller.
 */
function webPoseReaction(actorId, pose, identity, solvedPose) {
  if (solvedPose !== null) return null;
  const hit = identity.name === 'hit';
  const melee = identity.name === 'punch';
  // An actual, validated fire action already exists in the active actor
  // package. Its action time (not the looping locomotion time) drives a
  // short Web-authored recoil AFTER the firing edge, never before it.
  const fire = !hit && !melee && pose.action?.state === 'fire';
  if (!hit && !melee && !fire) return null;
  let envelope;
  if (fire) {
    const time = pose.action.time;
    const weight = pose.action.weight;
    const blend = pose.action.blend ?? 1;
    if (!Number.isFinite(time) || time <= 0 || time >= .9 ||
        !Number.isFinite(weight) || !Number.isFinite(blend)) return null;
    // Source clip seconds at the current controller speed. The snap/recovery
    // curve and angles are deliberate WEB gameplay values, not MCD data.
    const snap = Math.min(1, time / .15);
    const recovery = Math.min(1, (.9 - time) / .75);
    envelope = snap * recovery * Math.max(0, Math.min(1, weight)) *
      Math.max(0, Math.min(1, blend));
  } else {
    const duration = hit ? .32 : .36;
    if (pose.time <= 0 || pose.time >= duration) return null;
    envelope = Math.sin(Math.PI * pose.time / duration);
  }
  if (envelope <= 0) return null;
  let parity = typeof actorId === 'number' ? actorId % 2 : 0;
  if (typeof actorId === 'string') {
    for (let i = 0; i < actorId.length; i++) parity = (parity + actorId.charCodeAt(i)) % 2;
  }
  const side = parity ? 1 : -1;
  return Object.freeze({
    kind: fire ? 'fire' : identity.name,
    pitch: (fire ? .12 : hit ? .08 : -.14) * envelope,
    roll: side * (fire ? .05 : hit ? .22 : .035) * envelope,
    design: 'Web-only reactive animation accent',
  });
}

/**
 * WEB game-feel: bank into actual lateral movement and pitch into a run.
 * The actor's two already-rendered world transforms are used, so this adds
 * no authored clip, timing guess, event or extra GPU draw. The accepted
 * gunshot's frame is intentionally excluded: its muzzle must not move before
 * the deferred shot takes its socket snapshot.
 *
 * @param {Map<string | number, {time: number, x: number, z: number}>} frames
 * @param {string | number} actorId
 * @param {{name: string}} identity
 * @param {number[] | Float32Array} modelMatrix
 * @param {number | undefined} shaderTime
 * @param {object | null} solvedPose
 * @param {object | null} action
 * @returns {{kind: string, pitch: number, roll: number, design: string} | null}
 */
function webLocomotionReaction(frames, actorId, identity, modelMatrix, shaderTime,
                            solvedPose, action) {
  if (solvedPose !== null || action !== null ||
      (identity.name !== 'walk' && identity.name !== 'run') ||
      !Number.isFinite(shaderTime) || !modelMatrix || modelMatrix.length !== 16) return null;
  const previous = frames.get(actorId);
  if (!previous) return null;
  // A first frame, pause, teleport or replay is NOT a movement sample.
  const dt = shaderTime - previous.time;
  if (!(dt > 0 && dt <= .15)) return null;
  const dx = modelMatrix[12] - previous.x;
  const dz = modelMatrix[14] - previous.z;
  if (!Number.isFinite(dx) || !Number.isFinite(dz) ||
      Math.hypot(dx, dz) > 1.5) return null;
  const rightLength = Math.hypot(modelMatrix[0], modelMatrix[2]);
  const forwardLength = Math.hypot(modelMatrix[8], modelMatrix[10]);
  if (rightLength < 1e-6 || forwardLength < 1e-6) return null;
  const strafe = (dx * modelMatrix[0] + dz * modelMatrix[2]) / (dt * rightLength);
  const advance = (dx * modelMatrix[8] + dz * modelMatrix[10]) / (dt * forwardLength);
  const clamp = (value, limit) => Math.max(-limit, Math.min(limit, value));
  const pitch = clamp(-advance * .022, .11);
  const roll = clamp(-strafe * .05, .18);
  if (Math.abs(pitch) + Math.abs(roll) < .012) return null;
  return Object.freeze({
    kind: 'locomotion', pitch, roll,
    design: 'Web-only responsive locomotion banking',
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
  // One tiny previous-transform sample per actor. Never share camera or
  // movement history between enemies; the runtime is recreated per rig.
  const movementFrames = new Map();

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
    const reaction = webPoseReaction(actorId, pose, selected.identity, solvedPose)
      ?? webLocomotionReaction(movementFrames, actorId, selected.identity,
        modelMatrix, shaderTime, solvedPose, action);
    // Web game-feel: a hard impact reads instantly against the red crystalline
    // silhouette. This pulse follows the live, already accepted hit state;
    // it never fabricates a hit event, clip, or ragdoll motion.
    const webHitFlash = solvedPose === null && selected.identity.name === 'hit'
      ? Math.max(0, 1 - pose.time / .22) ** 2 : 0;
    const draw = {
      instance: selected.instance, time: selected.time,
      modelMatrix, viewProjection, color, cameraPosition,
      transition, action, solvedPose,
      webPoseLean: reaction, webHitFlash,
    };
    if (shaderTime !== undefined) draw.shaderTime = shaderTime;
    if (sourceLighting !== undefined) draw.sourceLighting = sourceLighting;
    const report = skinPass.draw(draw);
    // Update history only after a successful, real GPU draw. A failed
    // frame cannot poison the next actor's banking sample.
    if (solvedPose !== null) {
      movementFrames.delete(actorId);
    } else if (Number.isFinite(shaderTime)) {
      movementFrames.set(actorId, {
        time: shaderTime, x: modelMatrix[12], z: modelMatrix[14],
      });
      if (movementFrames.size > 128) {
        for (const [id, sample] of movementFrames) {
          if (shaderTime - sample.time > 10) movementFrames.delete(id);
        }
      }
    }
    // GPU pass reuses its matrix scratch for every actor; copy *immediately*.
    const matrices = new Float32Array(report.boneModelMatrices);
    const socket = report.weaponAttachmentMatrix === null
      ? null : new Float32Array(report.weaponAttachmentMatrix);
    return Object.freeze({
      ...report, actorId, actorSourceSelection: selected.identity,
      boneModelMatrices: matrices, weaponAttachmentMatrix: socket,
      actorWebPoseReaction: reaction, actorWebHitFlash: webHitFlash,
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
