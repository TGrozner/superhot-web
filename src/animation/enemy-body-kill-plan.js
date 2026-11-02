/**
 * Source-bounded command intents for PejAiBody.Kill (MCD build 20299547).
 * Private primary source: research #89, artifact 13139513152,
 * managed/Assembly-CSharp/PejAiBody.cs:565-602, read SHA-256
 * 2f938d5c65af66128acd324d52b6fb542c2ca369bf2e6f1bb298227c5e913c60.
 *
 * Execute this ONLY after a call to PejAiBody.Kill is independently established.
 * No PhysX, mesh cuts, shader or audio is executed. A command is not a pixel.
 */
const checkBool = (value, field) => {
  if (typeof value !== 'boolean') throw new TypeError(`${field} must be boolean`);
};
const checkId = (value, field) => {
  if (typeof value !== 'string' || !value.trim())
    throw new TypeError(`${field} must be a nonempty identifier`);
  return value;
};
const checkVec = (value, field) => {
  if (!value || typeof value !== 'object') throw new TypeError(`${field} must be a vector`);
  const v = {};
  for (const axis of ['x', 'y', 'z']) {
    if (typeof value[axis] !== 'number' || !Number.isFinite(value[axis]))
      throw new TypeError(`${field}.${axis} must be finite`);
    v[axis] = value[axis];
  }
  return v;
};
const checkIds = (value, field, allowNull = false) => {
  if (!Array.isArray(value)) throw new TypeError(`${field} must be an array`);
  return value.map((item, i) => item === null && allowNull ? null : checkId(item, `${field}[${i}]`));
};

/**
 * All flags/IDs are explicit snapshots of an independently verified invocation.
 * `bulletToken` is a caller-local opaque reference, not an original Unity object.
 * `col` is not modeled: this method does not read it in the bounded source.
 */
export function planPejAiBodyKill({
  controllerIsDead, shouldExplodeFromDog, isBoss, rendererIds,
  bossHeadRendererId = null, bossMeshIds = [], deathSource,
  bulletToken = null, bodyPosition,
}) {
  for (const [field, value] of Object.entries({ controllerIsDead, shouldExplodeFromDog, isBoss }))
    checkBool(value, field);
  const wrappers = checkIds(rendererIds, 'rendererIds', true);
  const bossMeshes = checkIds(bossMeshIds, 'bossMeshIds');
  checkId(deathSource, 'deathSource');
  if (bulletToken !== null) checkId(bulletToken, 'bulletToken');
  const position = checkVec(bodyPosition, 'bodyPosition');
  if (isBoss) checkId(bossHeadRendererId, 'bossHeadRendererId');
  else if (bossHeadRendererId !== null) checkId(bossHeadRendererId, 'bossHeadRendererId');

  if (controllerIsDead) return { branch: 'already-dead', commands: [] };
  const commands = [];
  if (shouldExplodeFromDog) commands.push(
    { op: 'remove-head-body-part', cutMode: 'Shatter' },
    { op: 'clear-should-explode-from-dog' },
  );
  if (isBoss) {
    commands.push({ op: 'enable-boss-current-head-renderer', rendererId: bossHeadRendererId });
    for (const meshId of bossMeshes)
      commands.push({ op: 'enable-boss-mesh', rendererId: meshId });
  }
  for (const wrapperId of wrappers) {
    if (wrapperId === null) continue;
    commands.push(
      { op: 'renderer-set-float', rendererId: wrapperId, property: '_Focus', value: 0 },
      { op: 'renderer-set-float', rendererId: wrapperId, property: '_HotswitchFocus', value: 0 },
    );
  }
  commands.push(
    { op: 'material-focus-zero' },
    { op: 'material-hotswitch-focus-zero' },
    { op: 'available-pickup-effect-fade-out' },
    { op: 'controller-kill', deathSource, bulletToken },
    { op: 'request-prefab-sound', resource: 'EnemyShatter',
      position: { x: position.x, y: position.y + 1.5, z: position.z } },
    { op: 'melee-IK-left-weight-zero' },
    { op: 'melee-IK-right-weight-zero' },
    { op: 'melee-IK-left-deactivate' },
    { op: 'melee-IK-right-deactivate' },
  );
  return { branch: 'body-kill-commands-requested', commands };
}
