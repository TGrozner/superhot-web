import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnemyReactionState, applyThrownEnemyContact, advanceEnemyReaction } from '../src/animation/enemy-reaction.js';

const enemy = () => createEnemyReactionState({ health: 2, stunTime: 2, hasWeapon: true });
const bowl = { stickable: false, isKiller: false, headshotKiller: false, cutLimbs: false };
const sharp = { ...bowl, stickable: true, headshotKiller: true, cutLimbs: true };
const contact = (extra = {}) => ({
  partId: 'Torso', isBulletProof: false, isArmored: false, isMushroom: false,
  bossMind: false, velocitySquared: 9, thrownByPlayer: true, shouldKill: false,
  direction: { x: 0, y: 0, z: 1 }, relativeVelocity: { x: 0, y: 0, z: -3 },
  position: { x: 1, y: 1.5, z: 2 }, ...extra,
});
const mods = { damage: 1, stunTimeMultiplier: 1, superThrows: false };
const hit = (state, item = bowl, target = {}, modifiers = mods) =>
  applyThrownEnemyContact(state, item, contact(target), modifiers);
const types = result => result.actions.map(a => a.type);

test('ordinary blunt throwable stuns and disarms, without first-hit damage', () => {
  const state = enemy();
  const result = hit(state);
  assert.equal(result.outcome, 'stunned');
  assert.equal(result.shatter, true);
  assert.equal(result.attach, false);
  assert.equal(state.health, 2);
  assert.equal(state.dead, false);
  assert.equal(state.hasWeapon, false);
  assert.equal(state.stunRemaining, 2);
  assert.deepEqual(types(result), ['drop-weapon', 'stun']);
  assert.equal(result.actions[0].pose, 'current-source-socket');
});

test('same-frame colliders cannot turn first blunt stun into damage or repeated disarm', () => {
  const state = enemy();
  hit(state);
  const second = hit(state);
  assert.equal(second.outcome, 'same-frame-stun');
  assert.deepEqual(second.actions, []);
  assert.equal(state.health, 2);
  advanceEnemyReaction(state, 0);
  const third = hit(state);
  assert.equal(third.outcome, 'stunned');
  assert.equal(state.health, 1);
  assert.deepEqual(types(third), ['stun']);
  advanceEnemyReaction(state, 0.1);
  const lethal = hit(state);
  assert.equal(lethal.outcome, 'killed');
  assert.equal(types(lethal).filter(t => t === 'kill').length, 1);
  assert.deepEqual(lethal.actions.find(a => a.type === 'body-force').vector, { x: -0, y: -0, z: 100 });
  assert.equal(state.dead, true);
  assert.equal(hit(state).outcome, 'already-dead');
  assert.deepEqual(hit(state).actions, []);
});

test('slow and non-player blunt contacts are not admitted, strict speed-squared threshold', () => {
  for (const target of [{ velocitySquared: 2 }, { velocitySquared: 0 }, { thrownByPlayer: false }]) {
    const state = enemy();
    assert.deepEqual(hit(state, bowl, target), { outcome: 'not-admitted', actions: [], shatter: false, attach: false });
    assert.equal(state.health, 2);
    assert.equal(state.hasWeapon, true);
  }
  assert.equal(hit(enemy(), bowl, { velocitySquared: 2.0001 }).outcome, 'stunned');
});

test('sharp body hit consumes health immediately; headshot killer is not a universal killer', () => {
  const torso = enemy();
  const bodyResult = hit(torso, sharp);
  assert.equal(bodyResult.outcome, 'stunned');
  assert.equal(bodyResult.shatter, false);
  assert.equal(bodyResult.attach, true);
  assert.equal(torso.health, 1);
  const head = enemy();
  const headResult = hit(head, sharp, { partId: 'Head' });
  assert.equal(headResult.outcome, 'killed');
  assert.equal(headResult.actions.find(a => a.type === 'kill').deathSource, 'Sticky');
  assert.ok(!types(headResult).includes('cut-body-part'));
  assert.equal(headResult.actions.find(a => a.type === 'body-force').vector.z, 2500);
});

test('sharp lethal eligible limb cuts, excludes torso/hips/thighs/head', () => {
  for (const partId of ['Torso', 'Hips', 'LeftThigh', 'RightThigh', 'Head', 'LeftForearm']) {
    const result = hit(enemy(), { ...sharp, isKiller: true }, { partId });
    const cut = partId === 'LeftForearm';
    assert.equal(types(result).includes('cut-body-part'), cut);
    assert.equal(result.actions.find(a => a.type === 'body-force').vector.z, cut ? 500 : 2500);
  }
});

test('bulletproof and armor retain native separate blunt and sticky outcomes', () => {
  const proof = enemy();
  assert.equal(hit(proof, bowl, { isBulletProof: true }).outcome, 'bulletproof');
  assert.equal(proof.hasWeapon, true);
  const armored = enemy();
  const result = hit(armored, { ...bowl, isKiller: true }, { isArmored: true });
  assert.equal(result.outcome, 'armor-broken');
  assert.equal(armored.health, 2);
  assert.equal(armored.dead, false);
  assert.deepEqual(types(result), ['break-armor', 'drop-weapon', 'stun']);
  const sticky = enemy();
  assert.equal(hit(sticky, sharp, { partId: 'Head', isBulletProof: true }).outcome, 'bulletproof-stun');
  assert.equal(sticky.dead, false);
  assert.equal(sticky.stunedConcretePart, true);
  assert.equal(hit(enemy(), sharp, { isBulletProof: true, shouldKill: true }).outcome, 'killed');
});

test('throw modifier strengthens first stun and next hit kills; only scaled time recovers', () => {
  const state = enemy();
  hit(state, bowl, {}, { ...mods, damage: 2, stunTimeMultiplier: 3 });
  assert.equal(state.stunRemaining, 6);
  assert.equal(state.strongStun, true);
  advanceEnemyReaction(state, 0);
  assert.equal(state.stunRemaining, 6);
  assert.equal(hit(state).outcome, 'killed');
  const recovery = enemy();
  hit(recovery);
  assert.deepEqual(advanceEnemyReaction(recovery, 2), [{ type: 'stun-end' }]);
  assert.equal(recovery.strongStun, false);
  assert.deepEqual(advanceEnemyReaction(recovery, 1), []);
  assert.equal(hit(recovery).outcome, 'stunned');
  assert.equal(recovery.health, 2);
});

test('special enemy routes remain explicit rather than ordinary all-kill fallback', () => {
  for (const target of [{ bossMind: true }, { isBoss: true }, { kamikazeAnimFired: true }]) {
    const state = enemy();
    assert.equal(hit(state, { ...sharp, isKiller: true }, target).outcome, 'special-enemy-handler-required');
    assert.equal(state.health, 2);
    assert.equal(state.dead, false);
  }
});

test('invalid inputs fail before committing ordinary reaction state', () => {
  const state = enemy();
  assert.throws(() => hit(state, { ...bowl, stickable: undefined }), /boolean/);
  assert.throws(() => hit(state, bowl, { velocitySquared: NaN }), /finite/);
  assert.throws(() => hit(state, bowl, {}, { ...mods, stunTimeMultiplier: Infinity }), /finite/);
  assert.deepEqual(state, enemy());
  assert.throws(() => advanceEnemyReaction(state, -1), /nonnegative/);
});
