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
 * WEB-only directional damage stagger, using the already supplied live camera
 * as an approximate attack origin. This is NOT the actual hit/contact vector:
 * shots from other directions would need an explicit SH-03 event/SH-05 hook.
 * Project into the enemy's rendered model basis rather than world X/Z, so
 * mirrored/rotated enemies recoil consistently. Invalid/overlapping cameras
 * retain the previous actor-id fallback instead of introducing NaNs.
 *
 * @param {number[] | Float32Array} modelMatrix column-major actor model matrix
 * @param {{x: number, y: number, z: number} | number[] | Float32Array | null} cameraPosition
 * @returns {{pitch: number, roll: number, yaw: number} | null}
 */
function webCameraHitDirection(modelMatrix, cameraPosition) {
  if (!cameraPosition || !modelMatrix || modelMatrix.length !== 16) return null;
  const indexed = Array.isArray(cameraPosition) || ArrayBuffer.isView(cameraPosition);
  const cx = indexed ? cameraPosition[0] : cameraPosition.x;
  const cz = indexed ? cameraPosition[2] : cameraPosition.z;
  if (!Number.isFinite(cx) || !Number.isFinite(cz)) return null;
  const dx = cx - modelMatrix[12];
  const dz = cz - modelMatrix[14];
  const rightLength = Math.hypot(modelMatrix[0], modelMatrix[2]);
  const forwardLength = Math.hypot(modelMatrix[8], modelMatrix[10]);
  if (!Number.isFinite(rightLength) || !Number.isFinite(forwardLength) ||
      rightLength < 1e-6 || forwardLength < 1e-6) return null;
  const lateral = (dx * modelMatrix[0] + dz * modelMatrix[2]) / rightLength;
  const frontal = (dx * modelMatrix[8] + dz * modelMatrix[10]) / forwardLength;
  const distance = Math.hypot(lateral, frontal);
  if (!Number.isFinite(distance) || distance < .1) return null;
  // The lean rotates around source hips. +roll leans away from a camera on
  // the actor's right; -pitch leans backward from a camera in front.
  return {
    pitch: -.22 * frontal / distance,
    roll: .32 * lateral / distance,
    yaw: -.20 * lateral / distance,
  };
}

/**
 * Reactive Web animation accents; these are a deliberate game-feel choice,
 * NOT source Animator clips or native timing. They only accompany an actual
 * available hit/punch clip or source-composable fire action; no missing source
 * animation, attack event or fire decision is synthesized.
 * Clock and actor identity come from the live Dojo gameplay caller.
 */
function webPoseReaction(actorId, pose, identity, solvedPose, modelMatrix, cameraPosition) {
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
  } else if (hit) {
    // An immediate readable flinch, then a longer diminishing recovery.
    // Pure Web tuning: no claim about MCD's impact kinetics.
    if (pose.time <= 0 || pose.time >= .36) return null;
    envelope = Math.min(1, pose.time / .045) *
      Math.min(1, (.36 - pose.time) / .30);
  } else {
    if (pose.time <= 0 || pose.time >= .36) return null;
    envelope = Math.sin(Math.PI * pose.time / .36);
  }
  if (envelope <= 0) return null;
  let parity = typeof actorId === 'number' ? actorId % 2 : 0;
  if (typeof actorId === 'string') {
    for (let i = 0; i < actorId.length; i++) parity = (parity + actorId.charCodeAt(i)) % 2;
  }
  const side = parity ? 1 : -1;
  const direction = hit ? webCameraHitDirection(modelMatrix, cameraPosition) : null;
  return Object.freeze({
    kind: fire ? 'fire' : identity.name,
    pitch: (hit ? (direction?.pitch ?? .08) : fire ? .12 : -.14) * envelope,
    roll: (hit ? (direction?.roll ?? side * .22) : side * (fire ? .05 : .035)) * envelope,
    // Web-only shoulder twist: a single GPU pose drives bones, hitboxes and
    // the weapon socket. Externally solved death poses never receive it.
    yaw: hit && direction ? direction.yaw * envelope : 0,
    hitDirectionProvenance: hit
      ? (direction ? 'Web camera-facing proxy, not contact origin' : 'actor-id fallback')
      : null,
    design: 'Web-only reactive animation accent',
  });
}

/**
 * WEB game-feel: bank toward observed travel AND observed heading changes,
 * then ease into and out of that bank using elapsed GAME-WORLD animation
 * seconds, even when slow motion advances the Red Crystal shader on a different
 * clock. A stationary guard settles instead of snapping rigidly upright. Paused
 * world time preserves the last GPU posture; an actual action/transition,
 * teleport, clock rewind or death cancels the bank.
 *
 * Per-actor history is committed ONLY after a successful GPU draw, so an
 * invalid frame cannot alter the next frame's visual/weapon/hitbox pose.
 * This is an intentional Web animation layer, not a recovered MCD controller.
 *
 * @param {Map<string | number, {time: number, poseTime: number, state: string, x: number, z: number, fx: number, fz: number, bankPitch: number, bankRoll: number}>} frames
 * @param {string | number} actorId
 * @param {{name: string}} identity
 * @param {number[] | Float32Array} modelMatrix
 * @param {number | undefined} shaderTime red-crystal/unscaled Web clock (not movement time)
 * @param {number} poseTime elapsed gameplay-world seconds in this state
 * @param {object | null} solvedPose
 * @param {object | null} action
 * @param {object | null} transition
 * @returns {{kind: string, pitch: number, roll: number, design: string} | null}
 */
function webLocomotionReaction(frames, actorId, identity, modelMatrix, shaderTime,
                            poseTime, solvedPose, action, transition) {
  const locomoting = identity.name === 'walk' || identity.name === 'run';
  if (solvedPose !== null || action !== null || transition !== null ||
      (!locomoting && identity.name !== 'idle') ||
      !Number.isFinite(shaderTime) || !modelMatrix || modelMatrix.length !== 16) return null;
  const previous = frames.get(actorId);
  if (!previous) return null;
  const describe = (pitch, roll) => Object.freeze({
    kind: locomoting ? 'locomotion' : 'turn', pitch, roll,
    design: 'Web-only inertial travel and turn banking',
  });
  // Dojo samples source pose.time from worldClock, while shaderTime is runClock
  // (real active seconds). Under SUPERHOT slow motion these are very different:
  // dividing world displacement by real seconds makes an enemy lean as if
  // barely moving, and a shader-only tick must not unfreeze a held pose.
  const shaderDt = shaderTime - previous.time;
  const sameState = identity.name === previous.state;
  const dt = sameState ? poseTime - previous.poseTime : shaderDt;
  if (shaderDt < 0 || dt < 0) return null; // REJOUER or state clock rewind
  // Freeze the exact bank while the sampled GAME pose time is frozen.
  if (dt === 0) {
    return Math.abs(previous.bankPitch) + Math.abs(previous.bankRoll) >= .012
      ? describe(previous.bankPitch, previous.bankRoll) : null;
  }
  if (!(dt > 0 && dt <= .15)) return null;
  const dx = modelMatrix[12] - previous.x;
  const dz = modelMatrix[14] - previous.z;
  if (!Number.isFinite(dx) || !Number.isFinite(dz) ||
      Math.hypot(dx, dz) > 1.5) return null;
  const rightLength = Math.hypot(modelMatrix[0], modelMatrix[2]);
  const forwardLength = Math.hypot(modelMatrix[8], modelMatrix[10]);
  if (!Number.isFinite(rightLength) || !Number.isFinite(forwardLength) ||
      rightLength < 1e-6 || forwardLength < 1e-6) return null;
  const fx = modelMatrix[8] / forwardLength;
  const fz = modelMatrix[10] / forwardLength;
  // Crossing state identities resets pose.time. Only settle the previous
  // lean in that case; a new state's first transform is not a velocity sample.
  const headingChange = sameState ? Math.atan2(previous.fx * fz - previous.fz * fx,
    previous.fx * fx + previous.fz * fz) : 0;
  if (!Number.isFinite(headingChange) || Math.abs(headingChange) > .7) return null;
  const strafe = locomoting && sameState
    ? (dx * modelMatrix[0] + dz * modelMatrix[2]) / (dt * rightLength) : 0;
  const advance = locomoting && sameState
    ? (dx * modelMatrix[8] + dz * modelMatrix[10]) / (dt * forwardLength) : 0;
  const clamp = (value, limit) => Math.max(-limit, Math.min(limit, value));
  // First-order damped response is independent of frame rate. Target angles
  // retain the bounded Web-only game-feel from the original movement bank.
  const pitchTarget = clamp(-advance * .022, .11);
  const rollTarget = clamp(-strafe * .05 - headingChange / dt * .035, .18);
  const response = 1 - Math.exp(-14 * dt);
  const pitch = previous.bankPitch + (pitchTarget - previous.bankPitch) * response;
  const roll = previous.bankRoll + (rollTarget - previous.bankRoll) * response;
  if (Math.abs(pitch) + Math.abs(roll) < .012) return null;
  return describe(pitch, roll);
}

/**
 * A stationary sentry gets a small independent breath/weight-shift cycle.
 * Uses the ACTUAL gameplay state time (not wall time), so a frozen game
 * freezes the pose too. Fades in after entering idle and never overlays
 * actions, transitions, fire aim, hits or ragdolls.
 */
function webIdleReaction(actorId, pose, identity, solvedPose, action, transition) {
  if (solvedPose !== null || action !== null || transition !== null ||
      identity.name !== 'idle' || !Number.isFinite(pose.time) || pose.time <= 0) return null;
  let phase = typeof actorId === 'number' ? actorId * .618 : 0;
  if (typeof actorId === 'string') {
    for (let i = 0; i < actorId.length; i++) phase += actorId.charCodeAt(i) * .13;
  }
  const ramp = Math.min(1, pose.time / .28);
  const pitch = Math.sin(pose.time * 2.4 + phase) * .035 * ramp;
  const roll = Math.sin(pose.time * 1.3 + phase * 1.5) * .025 * ramp;
  return Object.freeze({
    kind: 'idle', pitch, roll, design: 'Web-only idle weight shifting',
  });
}


/**
 * Web-only anticipation: on the existing sampled Head branch, guards glance
 * toward the camera in both azimuth and elevation while their torso/weapon
 * maintain the source pose. Vertical gaze uses the previous sampled, actual
 * Head pivot instead of an invented humanoid head height. This is deliberately
 * NOT a native head IK controller or a projectile aim vector.
 * Slow-world time damps movement; a frozen world pose freezes the gaze too.
 * Replays, teleports, attacks and death never carry a stale head transform.
 *
 * @param {Map<string|number, object>} frames committed GPU actor histories
 * @returns {{yaw: number, design: string} | null}
 */
function webHeadTracking(frames, actorId, identity, pose, modelMatrix, cameraPosition,
                         action, transition, solvedPose, available) {
  if (!available || solvedPose !== null || action !== null || transition !== null ||
      !['idle', 'walk', 'run'].includes(identity.name) ||
      !Number.isFinite(pose.time) || !modelMatrix || modelMatrix.length !== 16 ||
      !cameraPosition) return null;
  const previous = frames.get(actorId);
  if (!previous || previous.state !== identity.name || pose.time < previous.poseTime) return null;
  const dt = pose.time - previous.poseTime;
  if (!Number.isFinite(dt) || dt > .15) return null;
  const indexed = Array.isArray(cameraPosition) || ArrayBuffer.isView(cameraPosition);
  const cx = indexed ? cameraPosition[0] : cameraPosition.x;
  const cz = indexed ? cameraPosition[2] : cameraPosition.z;
  if (!Number.isFinite(cx) || !Number.isFinite(cz)) return null;
  const rightLength = Math.hypot(modelMatrix[0], modelMatrix[2]);
  const forwardLength = Math.hypot(modelMatrix[8], modelMatrix[10]);
  if (!Number.isFinite(rightLength) || !Number.isFinite(forwardLength) ||
      rightLength < 1e-6 || forwardLength < 1e-6) return null;
  const dx = cx - modelMatrix[12], dz = cz - modelMatrix[14];
  const lateral = (dx * modelMatrix[0] + dz * modelMatrix[2]) / rightLength;
  const frontal = (dx * modelMatrix[8] + dz * modelMatrix[10]) / forwardLength;
  const distance = Math.hypot(lateral, frontal);
  let target = distance > 1 && frontal > .05
    ? Math.max(-.33, Math.min(.33, Math.atan2(lateral, frontal))) : 0;
  if (identity.name === 'idle' && frontal > .05) {
    // Deliberately authored small scanning offset, tied to world time.
    const phase = typeof actorId === 'number' ? actorId * .61 :
      Array.from(String(actorId)).reduce((sum, ch) => sum + ch.charCodeAt(0) * .03, 0);
    target = Math.max(-.35, Math.min(.35, target + .06 * Math.sin(pose.time * 1.45 + phase)));
  }
  // The head pivot was sampled from this actor's actual skeleton on the
  // previous successful draw. Transform it by the CURRENT actor model matrix:
  // this follows stairs, different rig proportions and actor scale without
  // guessing that every head is a fixed distance above the pelvis.
  const head = previous.headLocal;
  const cameraY = indexed ? cameraPosition[1] : cameraPosition.y;
  let pitchTarget = 0;
  if (head && Number.isFinite(cameraY) && frontal > .05) {
    const headX = modelMatrix[0]*head[0] + modelMatrix[4]*head[1] +
      modelMatrix[8]*head[2] + modelMatrix[12];
    const headY = modelMatrix[1]*head[0] + modelMatrix[5]*head[1] +
      modelMatrix[9]*head[2] + modelMatrix[13];
    const headZ = modelMatrix[2]*head[0] + modelMatrix[6]*head[1] +
      modelMatrix[10]*head[2] + modelMatrix[14];
    const horizontal = Math.hypot(cx - headX, cz - headZ);
    if (Number.isFinite(horizontal) && horizontal > 1) {
      pitchTarget = Math.max(-.32, Math.min(.32, Math.atan2(cameraY - headY, horizontal)));
    }
  }
  const blend = dt === 0 ? 0 : 1 - Math.exp(-12 * dt);
  const yaw = (previous.gazeYaw ?? 0) * (1 - blend) + target * blend;
  const pitch = (previous.gazePitch ?? 0) * (1 - blend) + pitchTarget * blend;
  return Number.isFinite(yaw) && Number.isFinite(pitch) &&
    (Math.abs(yaw) + Math.abs(pitch) >= .008)
    ? Object.freeze({yaw, pitch, design: 'Web-only isolated 3D head gaze'}) : null;
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
  const webHeadIndex = skinPass.webHeadTrackingAvailable === true
    ? skinPass.rig.boneOrder.findIndex(name => /(?:^|[^a-zA-Z])head$/i.test(name))
    : -1;

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
    const reaction = webPoseReaction(actorId, pose, selected.identity, solvedPose,
      modelMatrix, cameraPosition)
      ?? webLocomotionReaction(movementFrames, actorId, selected.identity,
        modelMatrix, shaderTime, pose.time, solvedPose, action, transitionDescriptor)
      ?? webIdleReaction(actorId, pose, selected.identity,
        solvedPose, action, transitionDescriptor);
    // Web game-feel: a hard impact reads instantly against the red crystalline
    // silhouette. This pulse follows the live, already accepted hit state;
    // it never fabricates a hit event, clip, or ragdoll motion.
    const webHeadLook = webHeadTracking(movementFrames, actorId, selected.identity,
      pose, modelMatrix, cameraPosition, action, transitionDescriptor, solvedPose,
      skinPass.webHeadTrackingAvailable === true);
    const webHitFlash = solvedPose === null && selected.identity.name === 'hit'
      ? Math.max(0, 1 - pose.time / .22) ** 2 : 0;
    // WEB-authored warm afterglow follows an actual accepted fire action.
    // Its blend gate prevents any false warning before the firing event.
    const fireStateSpeed = skinPass.states.fire?.speed;
    // action.time is in sampled clip seconds; the Web glow lasts gameplay
    // seconds regardless of the source fire state's playback speed.
    const fireTime = action?.state === 'fire' && Number.isFinite(fireStateSpeed) &&
      fireStateSpeed > 0 ? action.time / fireStateSpeed : null;
    const webFireGlow = solvedPose === null && selected.identity.name !== 'hit' &&
      Number.isFinite(fireTime) && fireTime >= 0 && fireTime < .24 &&
      Number.isFinite(action.weight) && Number.isFinite(action.blend ?? 1)
      ? (1 - fireTime / .24) ** 2 *
        Math.max(0, Math.min(1, action.weight)) *
        Math.max(0, Math.min(1, action.blend ?? 1)) : 0;
    const draw = {
      instance: selected.instance, time: selected.time,
      modelMatrix, viewProjection, color, cameraPosition,
      transition, action, solvedPose,
      webPoseLean: reaction, webHeadLook, webHitFlash, webFireGlow,
    };
    if (shaderTime !== undefined) draw.shaderTime = shaderTime;
    if (sourceLighting !== undefined) draw.sourceLighting = sourceLighting;
    const report = skinPass.draw(draw);
    // Update history only after a successful, real GPU draw. A failed
    // frame cannot poison the next actor's banking sample.
    if (solvedPose !== null) {
      movementFrames.delete(actorId);
    } else if (Number.isFinite(shaderTime)) {
      const forwardLength = Math.hypot(modelMatrix[8], modelMatrix[10]);
      const movementBank = reaction?.kind === 'locomotion' || reaction?.kind === 'turn'
        ? reaction : null;
      movementFrames.set(actorId, {
        time: shaderTime, poseTime: pose.time, state: selected.identity.name,
        x: modelMatrix[12], z: modelMatrix[14],
        fx: modelMatrix[8] / forwardLength, fz: modelMatrix[10] / forwardLength,
        bankPitch: movementBank?.pitch ?? 0, bankRoll: movementBank?.roll ?? 0,
        gazeYaw: webHeadLook?.yaw ?? 0, gazePitch: webHeadLook?.pitch ?? 0,
        headLocal: webHeadIndex < 0 ? null : [
          report.boneModelMatrices[webHeadIndex*16 + 12],
          report.boneModelMatrices[webHeadIndex*16 + 13],
          report.boneModelMatrices[webHeadIndex*16 + 14],
        ],
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
      actorWebFireGlow: webFireGlow, actorWebHeadLook: webHeadLook,
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
