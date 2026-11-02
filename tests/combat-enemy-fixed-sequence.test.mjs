import test from 'node:test';
import assert from 'node:assert/strict';
import { planBulletFixedContactSequence } from '../src/combat/bullet-fixed-contact-sequence.js';

const vec = (x, y = 0, z = 0) => ({ x, y, z });
const bullet = () => ({
  shotId: 24, shotgunPellet: false, didRicochet: false, deflected: false,
  firedByPlayer: true, sniperBullet: false, forward: vec(1),
  ownerControllerInstanceId: null, ownerInHotswitch: false,
  excludeInCollision: false, pierceConcreteBody: false, goThroughGlass: false,
});
const target = () => ({
  controllerInstanceId: 491, isBulletProof: false, hasArmoredCutter: false,
  isStunned: false, isDead: false,
  bossMindAtImpact: false, bossMindAtCleanup: false,
});
const enemyHit = (targetOverrides = {}, more = {}) => ({
  layer: 'Enemies', ignored: false, destroyedAfterHandler: true,
  enemyBodyPart: { ...target(), ...targetOverrides }, piercingShotActive: false,
  ...more,
});
const plan = (hits, current = bullet()) => planBulletFixedContactSequence({
  orderedHits: hits, current, projectilePosition: vec(3, 1, 0), velocity: vec(36),
});
const types = result => result.events.map(x => x.type);

test('source-gated projectile -> bodypart requests Kill, not speculative damage', () => {
  const result = plan([enemyHit(), enemyHit()]);
  assert.equal(result.status, 'native-loop-stop-requested');
  assert.equal(result.stoppedAt, 0);
  assert.deepEqual(types(result), ['alert-request', 'replay-bullet-kill-slowdown-request',
    'enemy-body-kill-request', 'bullet-destroy-request']);
  assert.equal(result.events.find(x => x.type === 'enemy-body-kill-request').hitIndex, 0);
});

test('armor branch blocks Kill on an otherwise hit enemy', () => {
  const result = plan([enemyHit({ hasArmoredCutter: true })]);
  assert.deepEqual(types(result), ['alert-request', 'enemy-armor-break-request',
    'enemy-stun-request', 'bullet-destroy-request']);
});

test('unknown collider component chain remains blocked, not a default enemy kill', () => {
  const result = plan([{ layer: 'Enemies', ignored: false, destroyedAfterHandler: false }]);
  assert.equal(result.status, 'unmodeled-native-layer');
  assert.equal(types(result).includes('enemy-body-kill-request'), false);
});

test('sniper continuation after body kill needs observed post-handler destroyed=false', () => {
  const first = enemyHit({}, { destroyedAfterHandler: false });
  const second = enemyHit({}, { destroyedAfterHandler: false });
  const c = { ...bullet(), sniperBullet: true, goThroughGlass: true };
  const result = plan([first, second], c);
  assert.equal(result.status, 'contacts-exhausted');
  assert.equal(types(result).filter(x => x === 'enemy-body-kill-request').length, 1);
  assert.equal(types(result).filter(x => x === 'alert-request').length, 2);
});

test('sniper latch skips an Enemies collider without body-part and reaches the environment', () => {
  const result = plan([
    enemyHit({}, { destroyedAfterHandler: false }),
    { layer: 'Enemies', ignored: false, destroyedAfterHandler: false },
    { layer: 'Environment', ignored: false, destroyedAfterHandler: false },
  ], { ...bullet(), sniperBullet: true, goThroughGlass: true });
  assert.equal(result.status, 'contacts-exhausted');
  assert.equal(types(result).filter(x => x === 'enemy-body-kill-request').length, 1);
  assert.ok(result.events.some(event => event.hitIndex === 2));
});

test('sniper without destroyed flag cannot infer a second target', () => {
  const { destroyedAfterHandler, ...first } = enemyHit();
  const result = plan([first, enemyHit()], { ...bullet(), sniperBullet: true });
  assert.equal(result.status, 'destruction-state-unverified');
  assert.equal(types(result).filter(x => x === 'enemy-body-kill-request').length, 1);
});

test('excluded bodypart still stops ordinary projectile: outer handler returns true', () => {
  const c = { ...bullet(), excludeInCollision: true };
  const result = plan([enemyHit(), enemyHit()], c);
  assert.equal(result.status, 'native-loop-stop-requested');
  assert.deepEqual(types(result), ['alert-request']);
});

test('boss mind is fail-closed: do not infer an enemy kill or continuation', () => {
  const result = plan([enemyHit({ bossMindAtImpact: true })]);
  assert.equal(result.status, 'enemy-native-branch-unmodeled');
  assert.deepEqual(types(result), ['alert-request']);
});

test('ignored bodypart does not alert or request native effects', () => {
  const result = plan([enemyHit({}, { ignored: true })]);
  assert.equal(result.status, 'contacts-exhausted');
  assert.deepEqual(result.events, []);
});
