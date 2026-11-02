import test from 'node:test';
import assert from 'node:assert/strict';
import { planBulletBodyPartStun } from '../src/animation/bullet-to-body-stun.js';
import { planDojoBulletStunAudio } from '../src/sound/dojo-bullet-stun-audio.js';

const bullet = {
  ownerControllerInstanceId: null, ownerInHotswitch: false,
  excludeInCollision: false, firedByPlayer: true,
  pierceConcreteBody: false, goThroughGlass: false,
};
const target = {
  controllerInstanceId: 4812, isBulletProof: true,
  hasArmoredCutter: false, isStunned: false, isDead: false,
  bossMindAtImpact: false, bossMindAtCleanup: false,
};
const stunState = {
  direction: {x: 1, y: 0, z: 0}, bodyPosition: {x: 4, y: 2, z: 7},
  stunType: 'STUN_OTHERS', isConcrete: true,
  kamikazeAnimFired: false, kamikazeStunCurrentTime: 0,
  kamikazeStunableTime: 1, leftRight: 0,
  alreadyStunned: false, isBoss: false, rendererIds: [],
  stunSoundRest: 8, realtimeSinceStartup: 10,
};
const source = (overrides = {}) => planBulletBodyPartStun({
  contactIsQualified: true, bullet, target, piercingShotActive: false,
  stunControllerInstanceId: 4812, stunState, ...overrides,
});
const pool = {poolExists: true, reused: false, pitchBeforeRequest: 1};
const sound = (contactPlan, playbackState = pool) =>
  planDojoBulletStunAudio({contactPlan, playbackState});

test('qualified bulletproof contact selects exact concrete source clip, not Web normal default', () => {
  const result = sound(source());
  assert.equal(result.status, 'source-local-clip-request');
  assert.equal(result.sourceBulletBranch, 'bulletproof');
  assert.equal(result.prefabName, 'EnemyStunConcrete');
  assert.equal(result.webConcreteSelector, true);
  assert.equal(result.clip.owner, 'resources.assets');
  assert.equal(result.clip.pathId, 1611);
  assert.equal(result.clip.name, 'AC_Enemy_Hit');
  assert.deepEqual(result.localClipRequest.position, {x: 4, y: 3.5, z: 7});
  assert.equal(result.nextEligibleRealtimeSeconds, 10.25);
  assert.equal(result.qualifiedNativeStunObserved, false);
  assert.equal(result.audibleInBrowserObserved, false);
});

test('armor-contact Stun selects normal EnemyStun despite the source reason being armor', () => {
  const result = sound(source({
    target: {...target, isBulletProof: false, hasArmoredCutter: true},
    stunState: {...stunState, isConcrete: false},
  }));
  assert.equal(result.sourceBulletBranch, 'armor');
  assert.equal(result.webConcreteSelector, false);
  assert.equal(result.prefabName, 'EnemyStun');
  assert.equal(result.clip.pathId, 1675);
  assert.equal(result.clip.name, 'AC_Enemy_Stun');
});

test('native Stun call argument controls audio even if persistent concrete flag would differ', () => {
  const result = sound(source({
    stunState: {...stunState, alreadyStunned: true, isConcrete: true},
  }));
  // Native retains the previous stunedConcretePart field in this branch.
  assert.equal(result.webConcreteSelector, true);
  assert.equal(result.prefabName, 'EnemyStunConcrete');
});

test('qualified body-part contact with strict realtime rest emits no sound but keeps stun effects', () => {
  const plan = source({stunState: {...stunState, stunSoundRest: 10}});
  assert.ok(plan.stun.commands.some(x => x.op === 'controller-material-focus-zero'));
  const result = sound(plan);
  assert.equal(result.status, 'stun-called-without-audio-request');
  assert.equal(result.webConcreteSelector, null);
  assert.equal(result.localClipRequest, null);
});

test('kamikaze guard returns before the audio request', () => {
  const result = sound(source({stunState: {
    ...stunState, kamikazeAnimFired: true, kamikazeStunCurrentTime: 1,
  }}));
  assert.equal(result.status, 'stun-called-without-audio-request');
  assert.equal(result.clip, null);
});

test('unqualified, owner-excluded, and vulnerable contacts never preview stun sound', () => {
  for (const plan of [
    source({contactIsQualified: false}),
    source({bullet: {...bullet, excludeInCollision: true}}),
    source({target: {...target, isBulletProof: false}}),
  ]) {
    assert.equal(sound(plan).status, 'source-did-not-request-stun');
    assert.equal(sound(plan).webConcreteSelector, null);
  }
});

test('no runtime pool means no local clip request, without inventing audible fallback', () => {
  const result = sound(source(), {poolExists: false});
  assert.equal(result.status, 'source-pool-absent');
  assert.equal(result.localClipRequest, null);
  assert.equal(result.prefabName, 'EnemyStunConcrete');
  assert.equal(result.clip.pathId, 1611);
  assert.equal(result.audibleInBrowserObserved, false);
});

test('invalid or fabricated SH-06 result is rejected before any preview selection', () => {
  assert.throws(() => sound({branch: 'source-stun-request', stun: {commands: []},
    nativeInvocationObserved: true}), /source-qualified/);
  assert.throws(() => sound({branch: 'other', stun: null}), /source-qualified/);
  assert.throws(() => sound({branch: 'no-stun-request', stun: {commands: []}}), /no-stun branch/);
  assert.throws(() => sound(source(), {}), /poolExists/);
});
