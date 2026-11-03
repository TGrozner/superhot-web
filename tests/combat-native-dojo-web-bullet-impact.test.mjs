import test from 'node:test';
import assert from 'node:assert/strict';
import { planDojoWebBulletImpact } from '../src/combat/native-dojo-web-bullet-impact.js';

const p = (x, y = 0, z = 0) => ({ x, y, z });
const playerBullet = Object.freeze({
  firedByPlayer: true, sniperBullet: false,
  ownerControllerInstanceId: null, ownerInHotswitch: false,
  excludeInCollision: false, pierceConcreteBody: false, goThroughGlass: false,
});
const enemyBullet = Object.freeze({ ...playerBullet, firedByPlayer: false });
const part = Object.freeze({
  controllerInstanceId: 102, isBulletProof: false, hasArmoredCutter: false,
  isStunned: false, isDead: false, bossMindAtImpact: false,
  bossMindAtCleanup: false,
});
const params = (type, bullet = playerBullet, contact = {}) => ({
  impact: { type, t: 0.3 }, bullet,
  projectilePosition: p(0, 1, 0), velocity: p(20),
  contact: { colliderChainVerified: true, ignored: false, ...contact },
});

test('Dojo first Web sweep: wall blocks, source bodypart distinguishes stun/kill, player collider requests death; unknown native receipt cannot injure', () => {
  const wall = planDojoWebBulletImpact(params('wall', playerBullet, { nativeLayer: 'Environment' }));
  assert.equal(wall.status, 'source-requests');
  assert.equal(wall.consumesWebBullet, true);
  assert.ok(wall.nativeEvents.some(event => event.type === 'environment-handler-request'));
  assert.ok(!wall.nativeEvents.some(event => /kill-request/.test(event.type)));

  const enemyContact = { nativeLayer: 'Enemies', enemyBodyPart: part, piercingShotActive: false };
  const killed = planDojoWebBulletImpact(params('enemy', playerBullet, enemyContact));
  assert.equal(killed.status, 'source-requests');
  assert.equal(killed.consumesWebBullet, true);
  assert.ok(killed.nativeEvents.some(event => event.type === 'enemy-body-kill-request'));
  const armored = planDojoWebBulletImpact(params('enemy', playerBullet, {
    ...enemyContact, enemyBodyPart: { ...part, isBulletProof: true },
  }));
  assert.ok(armored.nativeEvents.some(event => event.type === 'enemy-stun-request'));
  assert.ok(!armored.nativeEvents.some(event => event.type === 'enemy-body-kill-request'));

  const player = planDojoWebBulletImpact(params('player', enemyBullet, {
    nativeLayer: 'CustomCollider', hasPlayerController: true,
  }));
  assert.equal(player.status, 'source-requests');
  assert.ok(player.nativeEvents.some(event => event.type === 'player-kill-request'));
  assert.ok(!player.nativeEvents.some(event => event.type === 'enemy-body-kill-request'));

  const noComponent = planDojoWebBulletImpact(params('enemy', playerBullet, {
    nativeLayer: 'Enemies', piercingShotActive: false,
  }));
  assert.equal(noComponent.status, 'blocked');
  assert.deepEqual(noComponent.nativeEvents, []);
  assert.equal(noComponent.consumesWebBullet, false);

  const noOwnership = planDojoWebBulletImpact(params('player',
    { ...enemyBullet, ownerControllerInstanceId: undefined }, {
      nativeLayer: 'CustomCollider', hasPlayerController: true,
    }));
  assert.equal(noOwnership.status, 'blocked');
  assert.deepEqual(noOwnership.nativeEvents, []);

  const sniper = planDojoWebBulletImpact(params('enemy', {
    ...playerBullet, sniperBullet: true,
  }, enemyContact));
  assert.equal(sniper.status, 'blocked');
  assert.match(sniper.reason, /sniper-ordered/);

  const wrongLayer = planDojoWebBulletImpact(params('enemy', playerBullet, {
    ...enemyContact, nativeLayer: 'Environment',
  }));
  assert.equal(wrongLayer.status, 'blocked');
  assert.deepEqual(wrongLayer.nativeEvents, []);
});
