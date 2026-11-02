/**
 * PejAiAnimator.Kill command plan, MCD build 20299547.
 * PRIVATE evidence: research #86, PejAiAnimator.cs:1008-1112, artifact 13140401513.
 * Only call after THIS METHOD's invocation is independently established.
 * Body.Kill -> Controller.Kill does not directly call Animator.Kill (#87/#89).
 *
 * Emits commands; does not emulate Animator, Unity rigidbodies, HDR or rendering.
 */
const bool = (value, name) => {
  if (typeof value !== 'boolean') throw new TypeError(name + ' must be boolean');
  return value;
};
const seconds = (value, name, min = 0, max = Infinity) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
    throw new RangeError(name + ' must be finite seconds in [' + min + ',' + max + ']');
  return value;
};
const id = (value, name) => {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(name + ' must be a nonempty string');
  return value;
};

/** Immediate portion. `alreadyScheduled` is the source's `toKill` flag. */
export function planPejAiAnimatorKillStart({
  killTime = 3.5, alreadyScheduled, limbCount,
  hasIKSolverX, hasGrounder, hasMeleeWeaponIK, hasWeaponSocket, hasLookAtIK,
}) {
  seconds(killTime, 'killTime');
  bool(alreadyScheduled, 'alreadyScheduled');
  if (!Number.isSafeInteger(limbCount) || limbCount < 0)
    throw new RangeError('limbCount must be a nonnegative safe integer');
  for (const [name, value] of Object.entries({
    hasIKSolverX, hasGrounder, hasMeleeWeaponIK, hasWeaponSocket, hasLookAtIK,
  })) bool(value, name);

  const immediate = [
    { op: 'disable-nav-agent' },
    { op: 'disable-animator' },
    ...(hasIKSolverX ? [{ op: 'zero-and-disable-FinalIK' }] : []),
    ...(hasGrounder ? [{ op: 'disable-IK-grounder' }] : []),
    { op: 'mark-body-being-killed' },
    ...(hasMeleeWeaponIK ? [{ op: 'zero-melee-IK-weight' }] : []),
  ];
  // Native checks toKill AFTER the disables above.
  if (alreadyScheduled)
    return { status: 'already-scheduled', immediate, cleanupRequest: null };

  immediate.push(
    { op: 'enable-limb-rigidbodies', count: limbCount },
    { op: 'change-layer-to-dead' },
    { op: 'clear-melee-weapon-layer' },
    { op: 'set-frame-delay', frames: 5 },
    { op: 'set-to-kill' },
  );
  if (hasWeaponSocket) immediate.push({ op: 'weapon-socket-on-kill' });
  if (hasLookAtIK) immediate.push({ op: 'look-at-IK-on-kill' });
  return {
    status: 'scheduled', immediate,
    cleanupRequest: { afterSeconds: killTime, clock: 'scaled-not-realtime', sampleStateAtCallback: true },
  };
}

const effect = (value, name, eligibilityKey, type) => {
  if (!value || typeof value !== 'object') throw new TypeError(name + ' must be an object');
  id(value.id, name + '.id');
  if (!bool(value[eligibilityKey], name + '.' + eligibilityKey)) return null;
  return {
    id: value.id, type,
    duration: seconds(value.duration, name + '.duration', 0.1, 0.4),
    delay: seconds(value.delay, name + '.delay', 0.1, 0.4),
    startScale: 1, endScale: type === 'BodyPart' ? 0.8 : 1,
    destroyOnAnimationEnd: false,
    disableCollidersOnCompletion: type === 'BodyPart',
  };
};

/**
 * Deferred callback. Branch flags and RNG samples must be read at callback time.
 * Only the exact source branches are described; no native random generator here.
 */
export function planPejAiAnimatorKillCleanup({
  hdrReactionTriggered, isNewMesh, wholebodyEnabled, headlessBodyActive,
  meshRenderers, hdrChain, bodyParts,
}) {
  for (const [name, value] of Object.entries({
    hdrReactionTriggered, isNewMesh, wholebodyEnabled, headlessBodyActive,
  })) bool(value, name);
  if (![meshRenderers, hdrChain, bodyParts].every(Array.isArray))
    throw new TypeError('meshRenderers, hdrChain and bodyParts must be arrays');

  const fadeBranch = !hdrReactionTriggered ||
    (isNewMesh && (wholebodyEnabled || headlessBodyActive));
  if (!fadeBranch) {
    // Immediate native PoolObject call, not a zero-second timer.
    return {
      branch: 'pool-immediately', restoreRendererIds: [],
      hideWholebody: false, hideHeadless: false,
      effects: [], poolRequest: { when: 'now', deactivate: false },
    };
  }
  const restoreRendererIds = hdrReactionTriggered
    ? meshRenderers.filter((r, i) => {
      if (!r || typeof r !== 'object') throw new TypeError('meshRenderers[' + i + '] invalid');
      id(r.id, 'meshRenderers[' + i + '].id');
      bool(r.shatterParentActive, 'shatterParentActive');
      bool(r.rendererNull, 'rendererNull');
      return !r.shatterParentActive && !r.rendererNull;
    }).map(r => r.id)
    : [];
  const effects = [
    ...hdrChain.map((v, i) => effect(v, 'hdrChain[' + i + ']', 'rendererAvailable', 'HDRChain')),
    ...bodyParts.map((v, i) => effect(v, 'bodyParts[' + i + ']', 'skinnedRendererEnabled', 'BodyPart')),
  ].filter(Boolean);
  return {
    branch: 'register-disappear-effects', restoreRendererIds,
    hideWholebody: hdrReactionTriggered && isNewMesh && wholebodyEnabled,
    hideHeadless: hdrReactionTriggered && isNewMesh && headlessBodyActive,
    effects,
    poolRequest: { afterSeconds: 1, clock: 'scaled-not-realtime', deactivate: false },
  };
}
