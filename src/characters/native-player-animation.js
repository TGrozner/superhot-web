import { createNativeSkinPass, loadNativeSkinPackage } from './native-skin-pass.js';
import { multiplyMatrices } from '../scenes/graph.js';

// Static Dojo scene identities from docs/dojo-reprise.md. These identify a
// source rig, not proof of a runtime Animator state or a matching screenshot.
const DOJO_RIG = Object.freeze({
  scene: 'SHRL_Dojo2', sceneBuildIndex: 10,
  animatorPathId: 6333, handManagerPathId: 6545,
  rendererPathId: 6378, weaponBoneTransformPathId: 2896,
});

function requireDojoRig(rig, loaded) {
  if (!rig || typeof rig !== 'object' || Array.isArray(rig)) {
    throw new TypeError('Dojo first-person rig identity must be explicit');
  }
  for (const [key, expected] of Object.entries(DOJO_RIG)) {
    if (rig[key] !== expected) {
      throw new Error('Dojo first-person source identity mismatch: ' + key);
    }
  }
  if (!loaded.weaponAttachment || typeof rig.weaponBoneName !== 'string' ||
      rig.weaponBoneName !== loaded.bones[loaded.weaponAttachment.bone].name) {
    throw new Error('Dojo weapon-bone socket must match a sampled hands bone');
  }
  if (typeof rig.provenance !== 'string' || !rig.provenance.length) {
    throw new TypeError('Dojo hands require a source provenance reference');
  }
}

function sourceClipBindings(clips, loaded) {
  if (!clips || typeof clips !== 'object' || Array.isArray(clips)) {
    throw new TypeError('Dojo hands require explicit held and swing source clips');
  }
  for (const key of ['held', 'swing']) {
    if (typeof clips[key] !== 'string' || !loaded.clips[clips[key]]) {
      throw new Error('Dojo source clip unavailable for ' + key);
    }
  }
  if (loaded.clips[clips.held].duration <= 0) {
    throw new RangeError('Dojo held source clip must have a positive loop duration');
  }
  return Object.freeze({ held: clips.held, swing: clips.swing });
}

function affine(value, label) {
  if (!value || value.length !== 16 ||
      !Array.from(value).every(Number.isFinite) ||
      value[3] !== 0 || value[7] !== 0 || value[11] !== 0 || value[15] !== 1) {
    throw new TypeError(label + ' must be a finite column-major affine matrix');
  }
  const m = value;
  const determinant =
    m[0] * (m[5] * m[10] - m[6] * m[9]) -
    m[4] * (m[1] * m[10] - m[2] * m[9]) +
    m[8] * (m[1] * m[6] - m[2] * m[5]);
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) {
    throw new RangeError(label + ' must be invertible');
  }
  return value;
}

/**
 * Real indexed first-person hands draw using the already-existing GPU LBS
 * sampler. It only selects caller-proven clips; it does NOT make a fake swing
 * pose, run a controller, synthesize geometry, or drive melee hit detection.
 *
 * The existing GPU pass uses EnemyMerged Red Crystal whenever UV0 is present.
 * Hands are NOT Red Crystal. A private source package therefore keeps its
 * untouched UV0, while this *diagnostic Web-lit pass* deliberately omits UV0
 * from the draw-only view. Geometry, bone weights, transforms and clips remain
 * unchanged. This is not a reconstructed source hands material.
 */
export function createDojoPlayerAnimationPass(gl, {
  sourcePackage, rig, clips, lighting,
} = {}) {
  const loaded = loadNativeSkinPackage(sourcePackage);
  requireDojoRig(rig, loaded);
  const names = sourceClipBindings(clips, loaded);

  const diagnosticPackage = loaded.mesh.hasSourceUV0
    ? { ...sourcePackage, mesh: { ...sourcePackage.mesh, uv0: undefined } }
    : sourcePackage;
  const pass = createNativeSkinPass(gl, diagnosticPackage, { lighting });
  let held;
  let swing;
  try {
    held = pass.createInstance({ clip: names.held, playback: 'loop' });
    swing = pass.createInstance({ clip: names.swing, playback: 'clamp' });
  } catch (error) {
    pass.dispose();
    throw error;
  }

  let disposed = false;
  function draw({
    heldItem, phase, sourceClipTime, modelMatrix, viewProjection,
    cameraPosition, shaderTime, color, katanaMeshLocalMatrix = null,
  } = {}) {
    if (disposed) throw new Error('Disposed Dojo player animation pass');
    // Dojo's source pistol has no held hands. Do not add fabricated hands.
    if (heldItem?.isKatana !== true) return null;
    if (phase !== 'held' && phase !== 'swing') {
      throw new TypeError('Dojo katana phase must be held or swing');
    }
    if (!Number.isFinite(sourceClipTime) || sourceClipTime < 0) {
      throw new TypeError('Dojo clip time must be nonnegative source clip seconds');
    }
    // No camera-relative magic offsets: owner SH-05 supplies the source
    // first-person renderer model matrix, same one used for both frames.
    affine(modelMatrix, 'hands modelMatrix');
    if (katanaMeshLocalMatrix != null) affine(katanaMeshLocalMatrix, 'katana mesh localMatrix');
    const report = pass.draw({
      instance: phase === 'held' ? held : swing,
      time: sourceClipTime, modelMatrix, viewProjection,
      cameraPosition, shaderTime, color,
    });
    if (!report.weaponAttachmentMatrix) {
      throw new Error('Dojo sampled weapon-bone socket is unavailable');
    }
    // The skin pass reuses its scratch array on the next draw. Copy now.
    const weaponBoneWorldMatrix = new Float32Array(report.weaponAttachmentMatrix);
    const katanaModelMatrix = katanaMeshLocalMatrix == null ? null
      : new Float32Array(multiplyMatrices(weaponBoneWorldMatrix, katanaMeshLocalMatrix));

    return Object.freeze({
      handsDrawCalls: report.drawCalls,
      handsTriangles: report.triangles,
      sampledClip: report.clip,
      sampledTime: report.sampledTime,
      weaponBoneWorldMatrix,
      katanaModelMatrix,
      sourcePoseSampled: report.nativeClipSampled,
      nativePlayerControllerTransitionVerified: false,
      nativeHandsMaterialParity: false,
      material: 'generated-web-lit-diagnostic',
      katanaTransformReady: katanaModelMatrix !== null,
    });
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    pass.dispose();
  }

  return Object.freeze({
    sourceRig: Object.freeze({ ...rig }),
    clips: names,
    draw,
    dispose,
  });
}
