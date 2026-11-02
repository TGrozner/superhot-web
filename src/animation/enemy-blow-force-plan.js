/**
 * Source-bounded intents for PejAiController.AddBlowForce / KillWithBlowForce.
 * MCD build 20299547; private research #87 (PejAiController.cs:5835-5849)
 * and #123 (PejAiController.cs:5840-5870, artifact 13157108175).
 *
 * Plans actions ONLY after a native invocation of the named method has been
 * independently established. It does not run ragdolls, render or simulate
 * ConstantForce/PhysX, and does not infer that an ordinary shot calls it.
 */
const finite = (v, name) => {
  if (typeof v !== 'number' || !Number.isFinite(v))
    throw new TypeError(name + ' must be finite');
  return v;
};
const bool = (v, name) => {
  if (typeof v !== 'boolean') throw new TypeError(name + ' must be boolean');
  return v;
};
const vec = (v, name) => {
  if (!v || typeof v !== 'object') throw new TypeError(name + ' must be a vector');
  return { x: finite(v.x, name + '.x'), y: finite(v.y, name + '.y'), z: finite(v.z, name + '.z') };
};
const addScaled = (a, b, scale) => ({
  x: a.x + b.x * scale,
  y: a.y + b.y * scale,
  z: a.z + b.z * scale,
});

/**
 * cameraBasis is the caller-observed 3x3 linear part of the original
 * StandardCameraTransform.localToWorldMatrix, grouped by columns. This does
 * not include translation and is NOT a browser camera pose guess.
 * randomX/Y are provided native RNG realizations, never invented here.
 */
export function planPejAiAddBlowForce({
  hasAnimator, existingConstantForce, force, blowInterval = 0.5,
  randomX, randomY, cameraBasis, bodyPart = 'Head',
}) {
  bool(hasAnimator, 'hasAnimator');
  finite(force, 'force');
  finite(blowInterval, 'blowInterval');
  if (typeof bodyPart !== 'string' || !bodyPart) throw new TypeError('bodyPart must be a supplied enum label');
  if (!hasAnimator) return { branch: 'no-animator', commands: [], returns: null };
  bool(existingConstantForce, 'existingConstantForce');
  const x = finite(randomX, 'randomX');
  const y = finite(randomY, 'randomY');
  if (x < -0.15 || x > 0.15 || y < -0.25 || y > 0.25)
    throw new RangeError('randomX/Y must be samples of the source Unity ranges');
  if (!cameraBasis || typeof cameraBasis !== 'object')
    throw new TypeError('cameraBasis must be supplied from the active camera');
  const right = vec(cameraBasis.right, 'cameraBasis.right');
  const up = vec(cameraBasis.up, 'cameraBasis.up');
  const forward = vec(cameraBasis.forward, 'cameraBasis.forward');
  const length = Math.hypot(x, y, 1);
  const localUnit = { x: x / length, y: y / length, z: 1 / length };
  // Native matrix multiplication applies after Vector3.Normalize. It does
  // not normalize again and cannot infer a camera pose from serialized FOV.
  const worldDirection = addScaled(addScaled({ x: 0, y: 0, z: 0 }, right, localUnit.x), up, localUnit.y);
  const world = addScaled(worldDirection, forward, localUnit.z);
  const worldForce = { x: world.x * force, y: world.y * force, z: world.z * force };
  if (!Object.values(worldForce).every(Number.isFinite))
    throw new RangeError('world force overflow');
  return {
    branch: 'force-requested',
    commands: [
      { op: 'use-body-part-rigidbody-zero', bodyPart },
      { op: 'invoke-animator-kill-default' },
      { op: 'drop-weapon', removeFromTree: false },
      { op: existingConstantForce ? 'reuse-constant-force' : 'add-constant-force' },
      { op: 'set-constant-force', vector: worldForce },
      { op: 'enable-constant-force' },
      ...(blowInterval > 0 ? [{
        op: 'enqueue-force-disable', afterSeconds: blowInterval,
        clock: 'non-realtime', clearVector: true,
      }] : []),
    ],
    returns: 'constant-force-component',
  };
}

/**
 * KillWithBlowForce always invokes Kill by name after AddBlowForce returns,
 * including when its Animator component is missing. Invocation is a REQUEST,
 * not proof of the callback executing or of a shot choosing this route.
 */
export function planPejAiKillWithBlowForce(options) {
  const blow = planPejAiAddBlowForce(options);
  const interval = options.blowInterval ?? 0.5;
  return {
    branch: 'kill-with-blow-force-requested',
    commands: [
      ...blow.commands,
      { op: 'request-unity-invoke', method: 'Kill', afterSeconds: interval, scheduler: 'Unity Invoke' },
    ],
    addBlowForceReturn: blow.returns,
  };
}
