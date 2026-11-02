/**
 * Stateful ordinary-enemy consequences, MCD build 20299547.
 * Source: GunPickup.EnemyCollision, PejAiBodyPart.StickyAttackReaction,
 * PejAiController.Stun/ReduceAndGetHitpointCountThrow/EndStun.
 * Caller resolves actual collider, item configuration and modifiers. Actions
 * describe remaining rendering/physics work; no guessed ragdoll or death clip.
 */
const finite = (v, name) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new TypeError(name + ' must be finite');
  return v;
};
const flag = (v, name) => {
  if (typeof v !== 'boolean') throw new TypeError(name + ' must be boolean');
  return v;
};
const vector = (v, name) => {
  if (!v) throw new TypeError(name + ' must be a vector');
  return { x: finite(v.x, name + '.x'), y: finite(v.y, name + '.y'), z: finite(v.z, name + '.z') };
};
const scale = (v, amount) => ({ x: v.x * amount, y: v.y * amount, z: v.z * amount });

export function createEnemyReactionState({ health, stunTime, hasWeapon }) {
  finite(health, 'health');
  finite(stunTime, 'stunTime');
  flag(hasWeapon, 'hasWeapon');
  if (health <= 0 || stunTime < 0) throw new RangeError('positive health and nonnegative stunTime required');
  return {
    health, stunTime, hasWeapon, dead: false, stunRemaining: 0,
    stunnedThisFrame: false, strongStun: false, stunedConcretePart: false,
    deathElapsed: 0, reactionRevision: 0,
  };
}

/** Call once at frame start, before ALL contacts, including paused frames. */
export function advanceEnemyReaction(state, scaledDelta) {
  finite(scaledDelta, 'scaledDelta');
  if (scaledDelta < 0) throw new RangeError('scaledDelta must be nonnegative');
  const actions = [];
  if (state.dead) {
    const elapsed = state.deathElapsed + scaledDelta;
    if (!Number.isFinite(elapsed)) throw new RangeError('death clock overflow');
    state.deathElapsed = elapsed;
  } else if (state.stunRemaining > 0) {
    state.stunRemaining = Math.max(0, state.stunRemaining - scaledDelta);
    if (state.stunRemaining === 0) {
      state.strongStun = false;
      state.stunedConcretePart = false;
      actions.push({ type: 'stun-end' });
    }
  }
  state.stunnedThisFrame = false;
  return actions;
}

/**
 * stickable selects the actual ObjectSticker route, not the object's name.
 * For that route the caller must have admitted a new body contact (excluding
 * dropped-owner and repeat bouncy contacts); shouldKill is its bounce/pierce
 * result. direction is the source raycast-end minus start normalized vector.
 * Ordinary GunPickup admission uses current pickup velocity squared > 2.
 * Boss/kamikaze bodies require their native handlers, never ordinary fallback.
 */
export function applyThrownEnemyContact(state, item, contact, modifiers) {
  const { stickable, isKiller, headshotKiller, cutLimbs } = item;
  for (const [key, value] of Object.entries({ stickable, isKiller, headshotKiller, cutLimbs })) flag(value, key);
  const { partId, isBulletProof, isArmored, isMushroom, bossMind,
    velocitySquared, thrownByPlayer, shouldKill } = contact;
  for (const [key, value] of Object.entries({ isBulletProof, isArmored, isMushroom,
    bossMind, thrownByPlayer, shouldKill })) flag(value, key);
  if (typeof partId !== 'string' || !partId) throw new TypeError('partId required');
  finite(velocitySquared, 'velocitySquared');
  if (velocitySquared < 0) throw new RangeError('velocitySquared must be nonnegative');
  const direction = vector(contact.direction, 'direction');
  const relativeVelocity = vector(contact.relativeVelocity, 'relativeVelocity');
  const position = vector(contact.position, 'position');
  const damage = finite(modifiers.damage, 'damage');
  const stunMultiplier = finite(modifiers.stunTimeMultiplier, 'stunTimeMultiplier');
  flag(modifiers.superThrows, 'superThrows');
  if (damage < 0 || stunMultiplier < 0) throw new RangeError('invalid throw modifiers');
  if (!Number.isFinite(state.stunTime * Math.max(1, stunMultiplier))) throw new RangeError('stun duration overflow');
  const actions = [];
  const result = (outcome, shatter = !stickable, attach = stickable) => ({ outcome, actions, shatter, attach });
  if (!stickable && (velocitySquared <= 2 || !thrownByPlayer)) return result('not-admitted', false, false);
  if (state.dead) return result('already-dead');
  // These distinct modifier/animation paths are not ordinary enemy behavior.
  if (bossMind || contact.isBoss === true || contact.kamikazeAnimFired === true)
    return result('special-enemy-handler-required');

  const wasStunned = state.stunRemaining > 0;
  const drop = () => {
    if (!state.hasWeapon) return;
    state.hasWeapon = false;
    actions.push({ type: 'drop-weapon', pose: 'current-source-socket' });
  };
  const stun = (throwableStun) => {
    if (!wasStunned || !isBulletProof) state.stunedConcretePart = isBulletProof;
    state.stunnedThisFrame = true;
    if (!wasStunned) {
      state.strongStun = Math.trunc(damage) > 1;
      drop();
    }
    state.stunRemaining = state.stunTime * (throwableStun ? Math.max(1, stunMultiplier) : 1);
    state.reactionRevision++;
    actions.push({ type: 'stun', stunType: 'STUN_THROWABLE', duration: state.stunRemaining,
      direction: stickable ? { x: 0, y: 0, z: 0 } : direction,
      restartAnimation: !wasStunned, selectNextVariant: true });
  };
  const reduceHealth = () => {
    const health = state.strongStun ? 0 : state.health - damage;
    if (!Number.isFinite(health)) throw new RangeError('health overflow');
    state.health = health;
    return health <= 0;
  };
  const kill = deathSource => {
    state.dead = true;
    state.deathElapsed = 0;
    state.stunRemaining = 0;
    drop();
    state.reactionRevision++;
    // Body.Kill -> Controller.OnKill -> Animator.onKill -> Kill, once.
    actions.push({ type: 'kill', deathSource, animatorKill: true, cleanupAfterSeconds: 3.5 });
  };

  if (!stickable) {
    if (isBulletProof && !modifiers.superThrows) return result('bulletproof');
    if ((wasStunned && !state.stunnedThisFrame) || isKiller) {
      if (isKiller && isArmored) {
        actions.push({ type: 'break-armor', partId });
        if (!wasStunned) stun(false);
        return result('armor-broken');
      }
      // Native evaluates health decrement before the isKiller OR branch.
      if (reduceHealth() || isKiller) {
        kill('Throwable');
        const length = Math.hypot(relativeVelocity.x, relativeVelocity.y, relativeVelocity.z);
        actions.push({ type: 'body-force', mode: 'Impulse', partId,
          vector: scale(relativeVelocity, length > 0 ? -100 / length : 0), position });
        return result('killed');
      }
      if (!state.stunnedThisFrame) stun(false);
      return result('stunned');
    }
    if (!state.stunnedThisFrame) {
      stun(true);
      return result('stunned');
    }
    return result('same-frame-stun');
  }

  const healthKill = !isBulletProof && !state.stunedConcretePart ? reduceHealth() : false;
  if (healthKill || isKiller || shouldKill || (headshotKiller && partId === 'Head')) {
    if (isBulletProof && !shouldKill) {
      stun(false);
      return result('bulletproof-stun');
    }
    kill('Sticky');
    const cut = cutLimbs && !['Torso', 'Hips', 'LeftThigh', 'RightThigh', 'Head'].includes(partId);
    if (cut) actions.push({ type: 'cut-body-part', partId });
    if (!isMushroom || cut) actions.push({ type: 'body-force', mode: 'ConstantForce', partId,
      vector: scale(direction, cut ? 500 : 2500), duration: 0.1, clock: 'scaled' });
    actions.push({ type: 'source-particles', source: 'ObjectSticker.bodyImpactParticlesPrefab' });
    return result('killed');
  }
  if (!isBulletProof) {
    stun(false);
    return result('stunned');
  }
  return result('bulletproof');
}
