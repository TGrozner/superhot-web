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
    draw: ({time}) => {
      draws++;
      return {drawCalls: 1, sampledTime: time,
        boneModelMatrices: new Float32Array(identity()),
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

test('a second accepted stun refreshes Web flinch and damage pulse without restarting the source clip', () => {
  const {render, draws} = actorFixture();
  const fromLeft = {x: 2, y: 0, z: 0};
  const fromRight = {x: -2, y: 0, z: 0};
  const initial = render('guard', 17, fromLeft, null, .12, 1);
  assert.ok(initial.actorWebPoseReaction.roll < 0);
  const old = render('guard', 17, fromLeft, null, .5, 1.4);
  assert.equal(old.actorWebPoseReaction, null);
  assert.equal(old.actorWebHitFlash, 0);

  // The source hit state has NOT been restarted by the native reaction path.
  // A second accepted contact can still carry a different hitEventId.
  const fresh = render('guard', 18, fromRight, null, .52, 1.42);
  assert.ok(fresh.actorWebPoseReaction.roll > 0,
    'a second accepted contact must visibly respond on its first rendered frame');
  assert.ok(fresh.actorWebHitFlash > .5, 'new accepted hit must flash immediately');
  const followThrough = render('guard', 18, fromLeft, null, .57, 1.47,
    {x: -10, y: 1, z: 0});
  assert.equal(followThrough.actorWebPoseReaction.kind, 'hit');
  assert.ok(followThrough.actorWebPoseReaction.roll > 0,
    'new hit direction remains latched despite camera motion and later input');
  assert.ok(followThrough.actorWebHitFlash > 0);
  assert.equal(followThrough.sampledTime, .57,
    'the source clip still uses the caller-provided unreset time');
  const recovered = render('guard', 18, fromLeft, null, .91, 1.81);
  assert.equal(recovered.actorWebPoseReaction, null);
  assert.equal(recovered.actorWebHitFlash, 0);
  assert.equal(draws(), 5);
});

test('accepted first stun reacts on its collision frame, freezes with world time and preserves full flash', () => {
  const {render, draws} = actorFixture();
  const incoming = {x: 2, y: 0, z: 0};
  // The contact is accepted at the start of the sampled hit clip, before
  // the next animation tick. The existing GPU lean must not wait one frame.
  const impact = render('first-frame', 91, incoming, null, 0, 1);
  assert.equal(impact.sampledTime, 0, 'source clip timing is never pre-advanced');
  assert.equal(impact.actorWebPoseReaction.kind, 'hit');
  assert.ok(impact.actorWebPoseReaction.roll < -.25,
    'the first accepted frame already shows a directional full-strength Web flinch');
  assert.equal(impact.actorWebHitFlash, 1,
    'first-frame material glow stays white-hot while the pose starts at impact peak');

  // SUPERHOT can advance shader/real time while the world pose is frozen.
  const frozen = render('first-frame', 91, incoming, null, 0, 1.1);
  assert.deepEqual(frozen.actorWebPoseReaction, impact.actorWebPoseReaction);
  assert.equal(frozen.actorWebHitFlash, 1);

  const recovering = render('first-frame', 91, incoming, null, .1, 1.2);
  assert.ok(recovering.actorWebPoseReaction.roll < 0);
  assert.ok(recovering.actorWebHitFlash > 0 && recovering.actorWebHitFlash < 1);
  assert.equal(draws(), 3);
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
