import test from 'node:test';
import assert from 'node:assert/strict';
import { planEnemyBodyPartBulletContact } from '../src/combat/enemy-body-part-contact.js';

const base = () => ({
  bullet: { ownerControllerInstanceId: null, ownerInHotswitch: false,
    excludeInCollision: false, firedByPlayer: true,
    pierceConcreteBody: false, goThroughGlass: false },
  target: { controllerInstanceId: 42, isBulletProof: false, hasArmoredCutter: false,
    isStunned: false, isDead: false,
    bossMindAtImpact: false, bossMindAtCleanup: false },
  piercingShotActive: false,
});
const types = plan => plan.intents.map(event => event.type);

test('ordinary vulnerable body part requests replay slowdown, Body.Kill and bullet destruction', () => {
  const input = base();
  const snapshot = structuredClone(input);
  const result = planEnemyBodyPartBulletContact(input);
  assert.equal(result.outcome, 'body-kill-requested');
  assert.equal(result.nativeHandlerReturn, true);
  assert.deepEqual(types(result), ['replay-bullet-kill-slowdown-request',
    'enemy-body-kill-request', 'bullet-destroy-request']);
  assert.equal(result.intents[1].deathSource, 'Bullet');
  assert.deepEqual(input, snapshot);
});

test('armored cutter asks for armor break and Stun, but not Body.Kill', () => {
  const input = base(); input.target.hasArmoredCutter = true;
  const result = planEnemyBodyPartBulletContact(input);
  assert.equal(result.outcome, 'armor-hit');
  assert.deepEqual(types(result), ['enemy-armor-break-request',
    'enemy-stun-request', 'bullet-destroy-request']);
});

test('already stunned armor does not request a duplicate Stun', () => {
  const input = base(); input.target.hasArmoredCutter = true; input.target.isStunned = true;
  assert.deepEqual(types(planEnemyBodyPartBulletContact(input)),
    ['enemy-armor-break-request', 'bullet-destroy-request']);
});

test('bulletproof is a Stun path, not an unconditional shatter/kill', () => {
  const input = base(); input.target.isBulletProof = true;
  const result = planEnemyBodyPartBulletContact(input);
  assert.equal(result.outcome, 'bulletproof-hit');
  assert.deepEqual(types(result), ['enemy-stun-request', 'bullet-destroy-request']);
});

test('PiercingShot on player projectile overrides bulletproof and retains bullet', () => {
  const input = base(); input.target.isBulletProof = true; input.piercingShotActive = true;
  const result = planEnemyBodyPartBulletContact(input);
  assert.equal(result.outcome, 'body-kill-requested');
  assert.deepEqual(types(result), ['replay-bullet-kill-slowdown-request', 'enemy-body-kill-request']);
  assert.equal(result.postHandlerDestroyedUnknown, true);
});

test('PiercingShot does not override bulletproof or destruction for enemy projectile', () => {
  const input = base(); input.target.isBulletProof = true;
  input.piercingShotActive = true; input.bullet.firedByPlayer = false;
  const result = planEnemyBodyPartBulletContact(input);
  assert.deepEqual(types(result), ['enemy-stun-request', 'bullet-destroy-request']);
});

test('goThroughGlass retains a bullet after a vulnerable body-part contact', () => {
  const input = base(); input.bullet.goThroughGlass = true;
  assert.equal(types(planEnemyBodyPartBulletContact(input)).includes('bullet-destroy-request'), false);
});

test('separate cleanup BossMind check may still request bullet destruction', () => {
  const input = base(); input.bullet.goThroughGlass = true;
  input.target.bossMindAtCleanup = true;
  assert.equal(types(planEnemyBodyPartBulletContact(input)).includes('bullet-destroy-request'), true);
});

test('same controller ID blocks damage unless owner is in hotswitch', () => {
  const input = base(); input.bullet.ownerControllerInstanceId = 42;
  const blocked = planEnemyBodyPartBulletContact(input);
  assert.equal(blocked.nativeHandlerReturn, false);
  assert.deepEqual(types(blocked), ['bullet-destroy-request']);
  input.bullet.ownerInHotswitch = true;
  assert.equal(types(planEnemyBodyPartBulletContact(input)).includes('enemy-body-kill-request'), true);
});

test('excluded collision returns false without kill or destruction request', () => {
  const input = base(); input.bullet.excludeInCollision = true;
  const result = planEnemyBodyPartBulletContact(input);
  assert.equal(result.nativeHandlerReturn, false);
  assert.deepEqual(result.intents, []);
});

test('boss-mind branch fails closed pending separate guard/ricochet modeling', () => {
  const input = base(); input.target.bossMindAtImpact = true;
  const result = planEnemyBodyPartBulletContact(input);
  assert.equal(result.nativeHandlerReturn, null);
  assert.equal(result.outcome, 'boss-mind-branch-unmodeled');
  assert.deepEqual(result.intents, []);
});

test('missing state and unrelated parent weapon ID cannot silently classify a hit', () => {
  const input = base(); delete input.target.isBulletProof;
  assert.throws(() => planEnemyBodyPartBulletContact(input), /target.isBulletProof/);
  const other = base(); delete other.bullet.ownerControllerInstanceId;
  other.bullet.parentWeaponId = 42;
  assert.throws(() => planEnemyBodyPartBulletContact(other), /ownerControllerInstanceId/);
});
