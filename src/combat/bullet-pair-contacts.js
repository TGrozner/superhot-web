/**
 * Bounded SUPERHOT: MIND CONTROL DELETE bullet-to-bullet collision planner.
 * Static source: MCD build 20299547, Bullet.cs:231-237, 238, 282-317;
 * private research #102 / artifact 13141705847. No PhysX, asset, or sound.
 *
 * This is one HandleCollision route, not a complete FixedUpdate. Contact
 * order, the other bullet's CanCollide(this) decision and post-slice destroyed
 * state must come from the caller; none is inferred from tags or IDs here.
 */
const finiteVector = v => v !== null && typeof v === 'object' &&
  Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
const clone = ({ x, y, z }) => ({ x, y, z });
const explicit = (value, name) => {
  if (typeof value !== 'boolean') throw new TypeError(name + ' must be boolean');
};
const bulletFlags = (bullet, name) => {
  if (bullet === null || typeof bullet !== 'object') {
    throw new TypeError(name + ' must be an explicit bullet state');
  }
  for (const key of ['shotgunPellet', 'didRicochet', 'deflected', 'firedByPlayer', 'sniperBullet']) {
    explicit(bullet[key], name + '.' + key);
  }
  if (!Number.isSafeInteger(bullet.shotId)) {
    throw new TypeError(name + '.shotId must be an explicit integer');
  }
};

const output = (outcome, events, requiresDestroyedProbe = false) => ({
  outcome,
  events,
  // The Bullets branch of HandleCollision returns false even when it slices.
  nativeHandlerReturn: false,
  // FixedUpdate may still stop on destroyed; SliceInHalf side effects unknown.
  requiresDestroyedProbe,
});

/**
 * Plan effects of a single, already identified Bullets-layer contact.
 * encountered is null if GetComponent<Bullet>() failed. The boolean
 * otherCanCollideCurrent represents the actual, externally evaluated result
 * of the OTHER bullet's CanCollide(current) call, not a guessed ID rule.
 * All returned effects are requests, not confirmed Unity side effects.
 */
export function planBulletPairContact({
  ignored, current, encountered, collisionPoint, otherCanCollideCurrent,
}) {
  explicit(ignored, 'ignored');
  if (ignored) return output('ignored-collider', []);

  // Bullet.HandleCollision alerts before inspecting the Bullets layer.
  const events = [{ type: 'alert-request', parameters: [5, 0.05, 2] }];
  if (encountered === null) return output('no-bullet-component', events);
  bulletFlags(current, 'current');
  bulletFlags(encountered, 'encountered');

  if (current.shotgunPellet && encountered.shotgunPellet &&
      current.shotId === encountered.shotId) {
    return output('same-shot-pellets-ignored', events);
  }
  if (current.didRicochet && encountered.didRicochet &&
      current.firedByPlayer === encountered.firedByPlayer) {
    return output('same-side-ricochets-ignored', events);
  }
  if (current.deflected && encountered.deflected) {
    return output('both-deflected-ignored', events);
  }

  if (typeof otherCanCollideCurrent !== 'boolean') {
    return output('other-can-collide-unverified', events);
  }
  if (!otherCanCollideCurrent) return output('other-can-collide-rejected', events);
  if (!finiteVector(collisionPoint)) {
    throw new TypeError('collisionPoint must be a finite source contact position');
  }
  if (!current.sniperBullet && !finiteVector(encountered.forward)) {
    throw new TypeError('encountered.forward needed to request current bullet slice');
  }
  if (!encountered.sniperBullet && !finiteVector(current.forward)) {
    throw new TypeError('current.forward needed to request encountered bullet slice');
  }

  // Bullet.HandleCollision:303-315. Do not invent a successful destruction,
  // a returned true, or the following hit's outcome in the fixed-step loop.
  events.push(
    { type: 'position-request', target: 'current', position: clone(collisionPoint) },
    { type: 'position-request', target: 'encountered', position: clone(collisionPoint) },
  );
  if (!current.sniperBullet) {
    events.push({ type: 'slice-request', target: 'current',
      direction: clone(encountered.forward), delay: 0, slice: false });
  }
  if (!encountered.sniperBullet) {
    events.push({ type: 'slice-request', target: 'encountered',
      direction: clone(current.forward), delay: 0, slice: false });
  }
  events.push({ type: 'alert-request', parameters: [5, 0.2, 5] });
  return output('bullet-pair-contact-requests', events, true);
}
