/**
 * Order-only plan for PejAiBody.Explode, MCD build 20299547.
 * Private source: research #105, PejAiBody.cs:462-475, artifact 13144030637.
 *
 * No geometry, ragdoll, physics, random generation or native sound here.
 * This plan is ONLY applicable after an actual Explode invocation is known.
 */
const nonempty = (v, name) => {
  if (typeof v !== 'string' || !v.trim())
    throw new TypeError(name + ' must be a nonempty string identifier');
  return v;
};
const nativeRoll = (v, name) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1)
    throw new RangeError(name + ' must be a supplied Unity Random.value sample in [0, 1]');
  return v;
};

/**
 * `bodyPartIds` follow the source's actual bodyPartMeshCutters traversal.
 * The head is deliberately requested separately even if the list contains it:
 * the source does not deduplicate that operation.
 *
 * `nonCivilian` comes from !controller.IsCivilian() in PejAiBody.Explode.
 * It is forwarded as the third RemoveBodyPart argument `spawnParticles`;
 * its meaning is now source-proven by BodyPartMeshCutter.cs:270,351 (#138).
 */
export function planPejAiBodyExplode({
  deathSource, bodyPartIds, randomValues, nonCivilian, hasAnimator,
}) {
  nonempty(deathSource, 'deathSource');
  if (!Array.isArray(bodyPartIds) || !Array.isArray(randomValues))
    throw new TypeError('bodyPartIds and randomValues must be arrays');
  if (bodyPartIds.length !== randomValues.length)
    throw new RangeError('one Random.value sample is required per bodyPartMeshCutter');
  if (typeof nonCivilian !== 'boolean' || typeof hasAnimator !== 'boolean')
    throw new TypeError('nonCivilian and hasAnimator must be booleans');

  const cuts = bodyPartIds.map((partId, i) => ({
    partId: nonempty(partId, 'bodyPartIds[' + i + ']'),
    cutMode: nativeRoll(randomValues[i], 'randomValues[' + i + ']') >= 0.9
      ? 'Shatter' : 'None',
    deadPhase: true,
    spawnParticles: nonCivilian,
  }));

  return {
    sourceMethod: 'PejAiBody.Explode',
    actions: [
      { op: 'body-kill', deathSource },
      { op: 'remove-body-part', partId: 'Head', cutMode: 'Shatter' },
      ...cuts.map(cut => ({ op: 'remove-body-part', ...cut })),
      ...(hasAnimator ? [{ op: 'animator-kill', killTime: 0, clock: 'scaled-not-realtime-queue' }] : []),
    ],
  };
}
