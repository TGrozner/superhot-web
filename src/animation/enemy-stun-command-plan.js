/**
 * Source-bounded command plan for PejAiBody.Stun (MCD build 20299547).
 * Private evidence: research #105, PejAiBody.cs:478-536,
 * artifact 13144030637, text SHA-256 578030aa9ee719e10eb61b454d5379f47237a15160875c9eb6852237207f29ca.
 *
 * Describes commands requested by the method AFTER a confirmed invocation.
 * No Animator, audio, shader or Unity physics is executed here. In particular,
 * this does not establish that a normal projectile hit invokes Stun.
 */
const finite = (value, name) => {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new TypeError(`${name} must be finite`);
  return value;
};
const bool = (value, name) => {
  if (typeof value !== 'boolean') throw new TypeError(`${name} must be boolean`);
  return value;
};
const vector = (value, name) => {
  if (!value || typeof value !== 'object') throw new TypeError(`${name} must be a vector`);
  return Object.fromEntries(['x', 'y', 'z'].map(axis => [axis, finite(value[axis], `${name}.${axis}`)]));
};

/**
 * `stunSoundRest` and `realtimeSinceStartup` use Unity realtime seconds.
 * `kamikazeStunCurrentTime`/`kamikazeStunableTime` are native state samples,
 * not a time base supplied or advanced by this module.
 * `rendererIds` follows the existing RendererWrapper collection, with null
 * entries representing the source's skipped null wrappers.
 */
export function planPejAiBodyStun({
  direction, bodyPosition, stunType, isConcrete, kamikazeAnimFired,
  kamikazeStunCurrentTime, kamikazeStunableTime, leftRight,
  alreadyStunned, isBoss, rendererIds, stunSoundRest, realtimeSinceStartup,
}) {
  const aim = vector(direction, 'direction');
  const pos = vector(bodyPosition, 'bodyPosition');
  if (typeof stunType !== 'string' || !stunType)
    throw new TypeError('stunType must be a nonempty supplied enum label');
  for (const [key, val] of Object.entries({ isConcrete, kamikazeAnimFired, alreadyStunned, isBoss }))
    bool(val, key);
  const elapsed = finite(kamikazeStunCurrentTime, 'kamikazeStunCurrentTime');
  const limit = finite(kamikazeStunableTime, 'kamikazeStunableTime');
  const lateral = finite(leftRight, 'leftRight');
  const soundRest = finite(stunSoundRest, 'stunSoundRest');
  const now = finite(realtimeSinceStartup, 'realtimeSinceStartup');
  if (!Array.isArray(rendererIds)) throw new TypeError('rendererIds must be an array');
  rendererIds.forEach((item, i) => {
    if (item !== null && (typeof item !== 'string' || !item.trim()))
      throw new TypeError(`rendererIds[${i}] must be null or a nonempty identifier`);
  });

  // Native sets stun_type before evaluating its kamikaze early-return guard.
  const commands = [{ op: 'set-stun-type', value: stunType }];
  if (kamikazeAnimFired && elapsed >= limit) {
    return { branch: 'kamikaze-guard-return', commands };
  }
  if (kamikazeAnimFired) {
    commands.push(
      { op: 'animator-on-stun-end' },
      { op: 'controller-end-stun' },
      { op: 'animator-set-left-right', value: lateral },
      { op: 'clear-kamikaze-anim-fired' },
      { op: 'reset-kamikaze-stun-current-time' },
    );
  }

  // Cancellation calls EndStun before this check, resetting the stun timer.
  // Otherwise an already-stunned concrete hit preserves the existing flag.
  if (kamikazeAnimFired || !alreadyStunned || !isConcrete)
    commands.push({ op: 'set-stuned-concrete-part', value: isConcrete });

  // Strict < in native; equality does NOT schedule audio.
  if (soundRest < now) {
    commands.push(
      { op: 'request-stun-prefab-sound', resource: isConcrete ? 'EnemyStunConcrete' : 'EnemyStun',
        position: { x: pos.x, y: pos.y + 1.5, z: pos.z } },
      { op: 'set-stun-sound-rest', realtimeSeconds: now + 0.25 },
    );
  }

  commands.push(
    { op: 'mark-stunned-this-frame' },
    { op: 'mark-ever-stunned' },
  );
  if (!isBoss) commands.push({ op: 'controller-stun', direction: aim });
  for (const rendererId of rendererIds) {
    if (rendererId !== null)
      commands.push({ op: 'renderer-focus-zero', rendererId });
  }
  commands.push(
    { op: 'controller-material-focus-zero' },
    { op: 'fade-out-available-pickup-effect' },
  );
  return { branch: 'stun-commands-requested', commands };
}
