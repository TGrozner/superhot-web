/**
 * Source-bounded Shatter branch of MCD BodyPartMeshCutter.RemoveBodyPart.
 * Private provenance: superhot-research #137-139, MCD build 20299547,
 * managed/Assembly-CSharp/BodyPartMeshCutter.cs:270-412.
 * This never executes native Unity effects, draws shards, or plays audio.
 *
 * Method-wide HDR locking, pickup detaches and body-mesh prelude are not
 * included: they also run on non-Shatter paths. This planner begins inside
 * the eligible Shatter branch, not a full RemoveBodyPart simulation.
 */
const requireBoolean = (value, name) => {
  if (typeof value !== 'boolean') throw new TypeError(name + ' must be observed boolean');
};

/**
 * Values must describe the same live cutter at the relevant branch check.
 * A returned intent never asserts that shards were rendered.
 */
export function planBodyPartShatterBranch({
  isRemoved, hasShatterMeshes, hdrChainReactionTriggered,
  hasCustomEnemyHead, readyToShatter, armored, bulletproof,
  spawnParticles, deadPhase,
}) {
  const input = { isRemoved, hasShatterMeshes, hdrChainReactionTriggered,
    hasCustomEnemyHead, readyToShatter, armored, bulletproof,
    spawnParticles, deadPhase };
  for (const [key, value] of Object.entries(input)) requireBoolean(value, key);

  // Entry point is specifically CutMode.Shatter. Ineligible does NOT mean
  // RemoveBodyPart has no effects: other branches and prelude still run.
  if (isRemoved || !hasShatterMeshes || hdrChainReactionTriggered) {
    return {
      branch: 'shatter-not-entered',
      reason: isRemoved ? 'already-removed' : !hasShatterMeshes ? 'missing-shatter-meshes' : 'hdr-chain-already-triggered',
      actions: [],
      otherNativeEffectsPossible: true,
      enclosingMethodPreludeUnmodeled: true,
    };
  }

  const actions = [
    { op: 'audio-prefab-request', resource: 'CrystalCrush' },
    { op: 'detach-stickable' },
    { op: 'mark-is-removed' },
    { op: 'set-break-joints' },
    { op: 'break-joints', destroyJoints: false, spawnParticles },
    { op: 'disable-body-part-colliders' },
  ];

  if (hasCustomEnemyHead) {
    actions.push({ op: 'custom-enemy-head-shatter-request' });
    // The custom-head branch does NOT call HideOriginalMesh or enable HDR
    // on ShatterObjectsRenderers. Its returned renderer list is separate.
  } else if (readyToShatter) {
    actions.push(
      { op: 'align-shatter-parent-to-first-skinned-bone' },
      { op: 'enable-shatter-parent' },
      { op: 'add-force-to-slices-request' },
    );
  } else {
    const material = armored ? 'Parent.ArmorMaterial'
      : bulletproof ? 'bulletproofMat' : 'Parent.BaseMaterial';
    actions.push(
      { op: 'enable-shatter-parent' },
      { op: 'setup-separated-body-parts', material, deadPhase },
    );
  }
  if (!hasCustomEnemyHead) actions.push(
    { op: 'use-shatter-renderer-list' },
    { op: 'hide-original-renderer' },
    { op: 'disable-attach-glass-breaker-on-rigidbody-parts' },
    { op: 'enable-hdr-chain-reaction-on-shatter-renderers' },
  );

  return {
    branch: 'shatter-requests',
    actions,
    enclosingMethodPreludeUnmodeled: true,
    renderedShardsNotObserved: true,
  };
}
