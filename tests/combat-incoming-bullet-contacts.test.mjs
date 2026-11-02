import assert from 'node:assert/strict';
import test from 'node:test';
import { planIncomingBulletFixedContacts } from '../src/combat/incoming-bullet-contacts.js';

const bullet = {
  firedByPlayer: false, sniperBullet: false,
  projectilePosition: { x: 6, y: 2, z: 1 },
  velocity: { x: 36, y: 0, z: 0 },
};
const player = { layer: 'CustomCollider', ignored: false, hasPlayerController: true };
const wall = { layer: 'Environment', ignored: false };

const plan = (orderedHits, overrides = {}) => planIncomingBulletFixedContacts({
  ...bullet, ...overrides, orderedHits,
});

test('enemy bullet routed to an actual PlayerController requests Kill with native offset/flags', () => {
  const result = plan([player]);
  assert.equal(result.status, 'native-loop-stop-requested');
  assert.equal(result.stoppedAt, 0);
  assert.deepEqual(result.events, [
    { type: 'alert-request', hitIndex: 0, parameters: [5, 0.05, 2] },
    { type: 'player-kill-request', hitIndex: 0,
      attackOrigin: { x: 1, y: 2, z: 1 },
      flags: { switchToBlack: false, hardKill: false, forceKill: false } },
  ]);
});

test('environment first stops ordinary bullet before an alleged player contact', () => {
  const result = plan([wall, player]);
  assert.equal(result.status, 'native-loop-stop-requested');
  assert.equal(result.consumedHits, 1);
  assert.equal(result.events.some(e => e.type === 'player-kill-request'), false);
});

test('ignored collider does not alert or stop before player contact', () => {
  const result = plan([{ ...wall, ignored: true }, player]);
  assert.equal(result.stoppedAt, 1);
  assert.equal(result.events[0].hitIndex, 1);
  assert.equal(result.events.filter(e => e.type === 'alert-request').length, 1);
});

test('firedByPlayer and a CustomCollider without PlayerController cannot kill player', () => {
  assert.equal(plan([player], { firedByPlayer: true }).events.some(e => e.type === 'player-kill-request'), false);
  assert.equal(plan([{ ...player, hasPlayerController: false }]).events.some(e => e.type === 'player-kill-request'), false);
});

test('unresolved player component and other native layers halt inference', () => {
  assert.equal(plan([{ layer: 'CustomCollider', ignored: false }]).status, 'player-component-unverified');
  const result = plan([{ layer: 'Enemies', ignored: false }, player]);
  assert.equal(result.status, 'unmodeled-native-layer');
  assert.equal(result.events.some(e => e.type === 'player-kill-request'), false);
});

test('sniper may continue handled environment only with explicit post-handler destruction state', () => {
  assert.equal(plan([wall, player], { sniperBullet: true }).status, 'destruction-state-unverified');
  const continued = plan([{ ...wall, destroyedAfterHandler: false }, player], { sniperBullet: true });
  assert.equal(continued.status, 'destruction-state-unverified');
  assert.equal(continued.events.some(e => e.type === 'player-kill-request'), true);
  const destroyed = plan([{ ...wall, destroyedAfterHandler: true }, player], { sniperBullet: true });
  assert.equal(destroyed.stoppedAt, 0);
  assert.equal(destroyed.events.some(e => e.type === 'player-kill-request'), false);
});

test('invalid or unsupported contact state does not silently become a hit', () => {
  assert.throws(() => plan([{ layer: 'CustomCollider' }]), /ignored/);
  assert.throws(() => plan([player], { firedByPlayer: 'false' }), /explicit/);
  assert.throws(() => plan([player], { velocity: { x: Infinity, y: 0, z: 0 } }), /explicit/);
});

test('synthetic enemy fire -> Update translation -> FixedUpdate player hit requests a player kill', async () => {
  // The existing enemy shotgun producer is source-bounded; 1 pellet and the
  // target collider are deliberately injected fixtures, NOT Containers data.
  const { planEnemyShotgunAttack, planEnemyShotgunLateVolley } =
    await import('../src/combat/enemy-shotgun.js');
  const { advanceBulletUpdate } = await import('../src/combat/shot-phases.js');
  const ready = planEnemyShotgunAttack({
    isAttackReady: true, haveBeenSeen: true, alreadyDeferred: false,
  });
  const volley = planEnemyShotgunLateVolley({
    deferredBulletSpawn: ready.deferredBulletSpawn,
    pelletCount: 1, muzzlePosition: { x: 0, y: 2, z: 1 },
    weaponForward: { x: 1, y: 0, z: 0 }, projectileSpeed: 36,
    spreadSamples: [{ x: 0, y: 0, z: 0 }], extraSpeedFactors: [],
  });
  assert.equal(volley.requests.length, 1);
  const moved = advanceBulletUpdate({
    position: volley.requests[0].origin,
    velocity: volley.requests[0].velocity,
  }, 0.2);
  assert.equal(moved.bullet.position.x, 7.2);
  const result = planIncomingBulletFixedContacts({
    orderedHits: [player], firedByPlayer: false, sniperBullet: false,
    projectilePosition: moved.bullet.position, velocity: moved.bullet.velocity,
  });
  assert.equal(result.events.at(-1).type, 'player-kill-request');
  assert.equal(result.status, 'native-loop-stop-requested');
});
