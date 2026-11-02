import test from 'node:test';
import assert from 'node:assert/strict';
import { planBulletBodyPartStun } from '../src/animation/bullet-to-body-stun.js';

const bullet = () => ({
  ownerControllerInstanceId: null, ownerInHotswitch: false,
  excludeInCollision: false, firedByPlayer: true,
  pierceConcreteBody: false, goThroughGlass: false,
});
const target = () => ({
  controllerInstanceId: 4812, isBulletProof: true,
  hasArmoredCutter: false, isStunned: false, isDead: false,
  bossMindAtImpact: false, bossMindAtCleanup: false,
});
const stunState = () => ({
  direction: { x: 1, y: 0, z: 0 },
  bodyPosition: { x: 4, y: 2, z: 7 },
  stunType: 'STUN_OTHERS', isConcrete: true,
  kamikazeAnimFired: false, kamikazeStunCurrentTime: 0,
  kamikazeStunableTime: 1, leftRight: 0,
  alreadyStunned: false, isBoss: false,
  rendererIds: ['EnemyMerged:body', null],
  stunSoundRest: 8, realtimeSinceStartup: 10,
});
const run = (changes = {}) => planBulletBodyPartStun({
  contactIsQualified: true,
  bullet: bullet(),
  target: target(),
  piercingShotActive: false,
  stunControllerInstanceId: 4812,
  stunState: stunState(),
  ...changes,
});
const ops = p => p.stun?.commands.map(x => x.op) ?? [];

test('bulletproof body-part hit requests Stun, source focus reset and concrete audio intent, NOT Kill', () => {
  const p = run();
  assert.equal(p.branch, 'source-stun-request');
  assert.equal(p.reason, 'bulletproof');
  assert.equal(p.contact.outcome, 'bulletproof-hit');
  assert.equal(p.contact.intents.some(x => x.type === 'enemy-body-kill-request'), false);
  assert.ok(p.contact.intents.some(x => x.type === 'enemy-stun-request'));
  assert.ok(ops(p).includes('renderer-focus-zero'));
  assert.ok(ops(p).includes('controller-stun'));
  assert.deepEqual(p.stun.commands.find(x => x.op === 'request-stun-prefab-sound'), {
    op: 'request-stun-prefab-sound', resource: 'EnemyStunConcrete',
    position: { x: 4, y: 3.5, z: 7 },
  });
  assert.equal(p.nativeInvocationObserved, false);
  assert.equal(p.gpuEffectObserved, false);
});

test('armored body-part requests armor break then Stun, never unconditional shatter/kill', () => {
  const p = run({ target: { ...target(), isBulletProof: false, hasArmoredCutter: true } });
  assert.equal(p.reason, 'armor');
  assert.deepEqual(p.contact.intents.slice(0, 2), [
    { type: 'enemy-armor-break-request' },
    { type: 'enemy-stun-request', reason: 'armor' },
  ]);
  assert.equal(p.contact.intents.some(x => x.type === 'enemy-body-kill-request'), false);
  assert.ok(ops(p).includes('renderer-focus-zero'));
});

test('unarmored, non-bulletproof body-part takes Body.Kill route, not Stun', () => {
  const p = run({ target: { ...target(), isBulletProof: false } });
  assert.equal(p.branch, 'no-stun-request');
  assert.equal(p.stun, null);
  assert.ok(p.contact.intents.some(x => x.type === 'enemy-body-kill-request'));
});

test('already-stunned target receives no second Stun request from bulletproof route', () => {
  const p = run({ target: { ...target(), isStunned: true } });
  assert.equal(p.branch, 'no-stun-request');
  assert.equal(p.stun, null);
});

test('self-owner and excluded contacts do not produce Stun commands', () => {
  const self = run({ bullet: { ...bullet(), ownerControllerInstanceId: 4812 } });
  assert.equal(self.branch, 'no-stun-request');
  const excluded = run({ bullet: { ...bullet(), excludeInCollision: true } });
  assert.equal(excluded.branch, 'no-stun-request');
});

test('BossMind branch remains unknown, not promoted to a concrete or ordinary Stun', () => {
  const p = run({ target: { ...target(), bossMindAtImpact: true } });
  assert.equal(p.branch, 'no-stun-request');
  assert.equal(p.contact.outcome, 'boss-mind-branch-unmodeled');
  assert.equal(p.contact.nativeHandlerReturn, null);
});

test('non-qualified Web sphere cannot activate the Stun planner', () => {
  const p = run({ contactIsQualified: false });
  assert.equal(p.branch, 'unqualified-body-part-contact');
  assert.equal(p.contact, null);
  assert.equal(p.stun, null);
  assert.throws(() => run({ contactIsQualified: undefined }), /contactIsQualified/);
});

test('refuse cross-enemy Stun snapshot even when hit source requests one', () => {
  assert.throws(() => run({ stunControllerInstanceId: 4813 }), /match qualified hit controller/);
  assert.throws(() => run({ stunState: undefined }), /explicit PejAiBody.Stun/);
});

test('strict realtime audio cooldown does not suppress visible focus command intent', () => {
  const p = run({ stunState: { ...stunState(), stunSoundRest: 10 } });
  assert.equal(p.stun.branch, 'stun-commands-requested');
  assert.equal(ops(p).includes('request-stun-prefab-sound'), false);
  assert.equal(ops(p).includes('renderer-focus-zero'), true);
});

test('native kamikaze early return leaves only source stun type, no shader/audio command', () => {
  const p = run({ stunState: {
    ...stunState(), kamikazeAnimFired: true,
    kamikazeStunCurrentTime: 1, kamikazeStunableTime: 1,
  } });
  assert.equal(p.branch, 'source-stun-request');
  assert.equal(p.stun.branch, 'kamikaze-guard-return');
  assert.deepEqual(p.stun.commands, [{ op: 'set-stun-type', value: 'STUN_OTHERS' }]);
});
