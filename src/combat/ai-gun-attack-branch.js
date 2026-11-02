/**
 * Pure, source-bounded PejAiController.GunAttackBehaviour.OnRun planner.
 * PRIVATE PRIMARY: research #140, artifact 13169030963,
 * PejAiController.cs:996-1082, MCD build 20299547.
 *
 * Plans C# method-call intentions, NEVER a fired projectile or applied hit.
 * The caller must supply measured/current native-equivalent predicates; missing
 * facts stop the plan rather than authoring default enemy behavior.
 */
const readBoolean = (state, name) => {
  const value = state[name];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'boolean') throw new TypeError(`${name} must be a boolean source predicate`);
  return value;
};

const readFinite = (state, name) => {
  const value = state[name];
  if (value === undefined || value === null) return null;
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be a finite source value`);
  return value;
};

export function planPejAiGunAttackTick(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state))
    throw new TypeError('source predicate state object required');

  const actions = [];
  const result = (status, nodeStatus = null, missing = null) => ({
    status, nodeStatus, actions: [...actions],
    missing, attackRequested: actions.includes('Weapon.Attack'),
    projectileEmitted: null, // deferred emission/IK/Pooler are separate evidence.
  });
  const flag = name => readBoolean(state, name);
  const need = (name, nodeStatus) => result('source-predicate-required', nodeStatus, name);

  // PejAiController.cs:1011-1029. This is CanSeePlayer360's OUTPUT,
  // potentially afterglow; it is not equivalent to a distance check.
  const canSeePlayer360 = flag('canSeePlayer360');
  if (canSeePlayer360 === null) return need('canSeePlayer360', null);
  if (!canSeePlayer360) return result('proven-branch', 'Failure');
  actions.push('UpdateLocation'); // Virtual: do not assume Offensive/Defensive.

  const aimTargetInSight = flag('aimTargetInSight');
  if (aimTargetInSight === null) return need('aimTargetInSight', 'Running');
  if (!aimTargetInSight) {
    actions.push('SetAimTargetAtPlayer', 'WeaponLower');
    return result('proven-branch', 'Running');
  }
  actions.push('WeaponPrepare');

  // PejAiController.cs:1036-1060. A rejected reroll aborts the nested
  // GunAttack routine BEFORE the local Aim call.
  const rerollReady = flag('targetRerollReady');
  if (rerollReady === null) return need('targetRerollReady', 'Running');
  if (!rerollReady) return result('proven-branch', 'Running');

  const weaponPositionReady = flag('weaponPositionReady');
  if (weaponPositionReady === null) return need('weaponPositionReady', 'Running');
  const timeToReady = readFinite(state, 'timeToReady');
  if (timeToReady === null) return need('timeToReady', 'Running');
  const stopAimingTime = readFinite(state, 'stopAimingTime');
  if (stopAimingTime === null) return need('stopAimingTime', 'Running');
  if (timeToReady > stopAimingTime || !weaponPositionReady)
    actions.push('RefreshAimTarget');
  actions.push('Aim');

  const weaponAttackReady = flag('weaponAttackReady');
  if (weaponAttackReady === null) return need('weaponAttackReady', 'Running');
  if (!weaponAttackReady || !weaponPositionReady) {
    actions.push('Weapon.CheckReload');
    return result('proven-branch', 'Running');
  }
  const inMiddleOfSeries = flag('inMiddleOfSeries');
  if (inMiddleOfSeries === null) return need('inMiddleOfSeries', 'Running');
  if (!inMiddleOfSeries) {
    const aimTargetReady = flag('aimTargetReady');
    if (aimTargetReady === null) return need('aimTargetReady', 'Running');
    if (!aimTargetReady) return result('proven-branch', 'Running');
  }
  actions.push('SetOnBulletSpawnController', 'Weapon.Attack', 'RerollTarget');
  return result('proven-branch', 'Running');
}
