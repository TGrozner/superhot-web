import test from 'node:test';
import assert from 'node:assert/strict';
import { planPejAiGunAttackTick } from '../src/combat/ai-gun-attack-branch.js';

const inputs = () => ({
  canSeePlayer360: true, aimTargetInSight: true, targetRerollReady: true,
  weaponPositionReady: true, timeToReady: 0, stopAimingTime: .05,
  weaponAttackReady: true, inMiddleOfSeries: false, aimTargetReady: true,
});
const plan = delta => planPejAiGunAttackTick({ ...inputs(), ...delta });
const full = [
  'UpdateLocation', 'WeaponPrepare', 'Aim',
  'SetOnBulletSpawnController', 'Weapon.Attack', 'RerollTarget',
];

test('GunAttackBehaviour sight failure exits before location or attack', () => {
  const result = plan({ canSeePlayer360: false });
  assert.deepEqual([result.nodeStatus, result.actions, result.attackRequested],
    ['Failure', [], false]);
});

test('sight holds but IK AimTarget not in sight lowers weapon, no attack', () => {
  const result = plan({ aimTargetInSight: false });
  assert.deepEqual(result.actions, [
    'UpdateLocation', 'SetAimTargetAtPlayer', 'WeaponLower',
  ]);
  assert.equal(result.nodeStatus, 'Running');
});

test('reroll negative exits nested GunAttack before Aim', () => {
  assert.deepEqual(plan({ targetRerollReady: false }).actions,
    ['UpdateLocation', 'WeaponPrepare']);
});

test('source-predicate-complete, series absent, pose/IK ready requests Attack', () => {
  const result = plan({});
  assert.deepEqual(result.actions, full);
  assert.equal(result.attackRequested, true);
  assert.equal(result.projectileEmitted, null);
});

test('series in progress bypasses AimTarget.IsReady but still requires weapon and position ready', () => {
  const result = plan({ inMiddleOfSeries: true, aimTargetReady: null });
  assert.deepEqual(result.actions, full);
  assert.equal(plan({ inMiddleOfSeries: true, weaponAttackReady: false }).attackRequested, false);
});

test('no series and aimTarget not ready: Aim runs but there is no attack or reload', () => {
  const result = plan({ aimTargetReady: false });
  assert.deepEqual(result.actions, ['UpdateLocation','WeaponPrepare','Aim']);
  assert.equal(result.attackRequested, false);
});

test('nonready gun checks reload; being out of position also routes CheckReload', () => {
  const noGun = plan({ weaponAttackReady: false });
  assert.deepEqual(noGun.actions.slice(-2), ['Aim','Weapon.CheckReload']);
  const noPose = plan({ weaponPositionReady: false });
  assert.deepEqual(noPose.actions.slice(-3),
    ['RefreshAimTarget','Aim','Weapon.CheckReload']);
});

test('time-to-ready threshold is strictly greater; equals is no refresh', () => {
  assert.equal(plan({ timeToReady: .05 }).actions.includes('RefreshAimTarget'), false);
  assert.equal(plan({ timeToReady: .05001 }).actions.includes('RefreshAimTarget'), true);
});

test('missing active runtime predicate preserves known prefix but does not infer Attack', () => {
  const noSight = plan({ canSeePlayer360: null });
  assert.deepEqual([noSight.status,noSight.nodeStatus,noSight.missing,noSight.actions],
    ['source-predicate-required',null,'canSeePlayer360',[]]);
  const noWeapon = plan({ weaponAttackReady: undefined });
  assert.equal(noWeapon.status, 'source-predicate-required');
  assert.equal(noWeapon.missing, 'weaponAttackReady');
  assert.equal(noWeapon.attackRequested, false);
  assert.deepEqual(noWeapon.actions, ['UpdateLocation','WeaponPrepare','Aim']);
});

test('source boolean and numeric values must not silently coerce', () => {
  assert.throws(() => plan({ canSeePlayer360: 1 }), /boolean/);
  assert.throws(() => plan({ timeToReady: NaN }), /finite/);
  assert.throws(() => planPejAiGunAttackTick(null), /object/);
});
