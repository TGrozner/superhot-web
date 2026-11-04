import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeActorSkinRuntime} from '../src/characters/native-actor-skin.js';

// An authored Web-only actor boundary; no source mesh/clip/asset bytes.
const identity = () => [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
function actorFixture() {
  let draws = 0;
  const pass = {
    availableClips: ['hit'],
    availableTransitions: [],
    availableActions: [],
    states: {hit: {clip: 'hit', playback: 'clamp', speed: 1}},
    rig: {name: 'authored-test-rig'},
    createStateInstance: state => ({clip: state, playback: 'clamp'}),
    createInstance: ({clip, playback}) => ({clip, playback}),
    draw: () => {
      draws++;
      return {drawCalls: 1, boneModelMatrices: new Float32Array(identity()),
        weaponAttachmentMatrix: null};
    },
  };
  const runtime = createNativeActorSkinRuntime(pass);
  const render = (actorId, hitEventId, hitIncomingDirection, hitOrigin,
    time, shaderTime, cameraPosition = {x: 8, y: 1, z: 0}) =>
    runtime.drawActor({
      actorId,
      pose: {state: 'hit', time, hitEventId, hitIncomingDirection, hitOrigin},
      modelMatrix: identity(), viewProjection: identity(),
      color: [1,0,0,1], shaderTime, cameraPosition,
    });
  return {render, draws: () => draws};
}

test('actual accepted incoming velocity determines Web stun lean, not contact point or moving camera', () => {
  const {render, draws} = actorFixture();
  // Shot travels +X, so the attacker is on the -X side even though the
  // camera is on +X and contact itself is at the victim root.
  const first = render('enemy', 41, {x: 3, y: 0, z: 0},
    {x: 0, y: 1, z: 0}, .1, 1);
  assert.equal(first.actorWebPoseReaction.kind, 'hit');
  assert.ok(first.actorWebPoseReaction.roll < 0,
    'incoming +X is an impact from the actor left, opposite the +X camera');
  assert.equal(first.actorWebPoseReaction.hitDirectionProvenance,
    'Web accepted projectile travel direction, not native MCD impulse');
  assert.equal(first.actorPoseOwnedSnapshot, true);
  // Same accepted contact is latched even if the next frame reports a
  // different instantaneous velocity and the camera crosses the enemy.
  const held = render('enemy', 41, {x: -3, y: 0, z: 0},
    {x: 0, y: 1, z: 0}, .2, 1.1, {x: -8, y: 1, z: 0});
  assert.ok(held.actorWebPoseReaction.roll < 0);
  // A genuinely new accepted event has a new ID; the direction can flip.
  const opposite = render('enemy', 42, {x: -2, y: 0, z: 0},
    {x: 0, y: 1, z: 0}, .1, 1.2);
  assert.ok(opposite.actorWebPoseReaction.roll > 0);
  // Existing point-only inputs retain compatibility, but a central contact
  // is NOT proof of attacker direction and must not masquerade as one.
  const pointOnly = render('old', 1, null, {x: 0, y: 1, z: 0}, .1, 1);
  assert.equal(pointOnly.actorWebPoseReaction.hitDirectionProvenance,
    'actor-id fallback');
  assert.equal(draws(), 4);
});

test('stun direction rejects broken vectors before draw, vertical impacts fail closed', () => {
  const {render, draws} = actorFixture();
  assert.throws(() => render('enemy', 1,
    {x: Number.NaN, y: 0, z: 1}, null, .1, 1),
  /hitIncomingDirection requires finite/);
  assert.throws(() => render('enemy', 1, {x: 0, y: 0, z: 0},
    null, .1, 1), /zero travel vector/);
  const vertical = render('vertical', 1, {x: 0, y: -1, z: 0},
    null, .1, 1);
  assert.equal(vertical.actorWebPoseReaction.hitDirectionProvenance,
    'actor-id fallback');
  assert.equal(draws(), 1);
});
