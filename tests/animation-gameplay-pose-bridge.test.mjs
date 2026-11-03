import test from 'node:test';
import assert from 'node:assert/strict';
import { composeLocalMatrix } from '../src/scenes/graph.js';
import { createDojoPunchContactGate } from '../src/animation/dojo-punch-contact-gate.js';
import { createNativeDeathRuntime } from '../src/animation/native-death-runtime.js';
import { advanceRenderedDojoPunchGate, advanceDojoDeathSkinFrame } from '../src/animation/native-gameplay-pose-bridge.js';

const binding = Object.freeze({
  drawClip: 'punch', clipOwner: 'sharedassets0.assets',
  clipPathId: 468, provenance: 'research#46:sharedassets0.assets:468',
});
const flags = Object.freeze({
  preparedIntervalConfirmed: true, activeGameObjectConfirmed: true,
  methodReceiverConfirmed: true,
});
const state = () => createDojoPunchContactGate({
  attackerId: 'enemy-1', strikeId: 'strike-1', initialClipTime: 0,
});
const sweep = {
  attackerId: 'enemy-1', strikeId: 'strike-1', victimId: 'player',
  clipTime: 0.53, provenance: 'web-hitbox-sweep',
  geometryContactConfirmed: true,
};

test('GPU sampled clip seconds, not Web state seconds, qualify actual punched contact', () => {
  const report = {
    clip: 'punch', sampledTime: 0.6, skinned: true,
    nativeClipSampled: true,
  };
  const hit = advanceRenderedDojoPunchGate(state(), {
    drawReport: report, clipBinding: binding, ...flags, contact: sweep,
  });
  assert.equal(hit.poseQualified, true);
  assert.equal(hit.sampledClipTime, 0.6);
  assert.equal(hit.requests.length, 1);
  assert.equal(hit.requests[0].clipTime, sweep.clipTime);
  const missed = advanceRenderedDojoPunchGate(state(), {
    drawReport: report, clipBinding: binding, ...flags, contact: null,
  });
  assert.deepEqual(missed.requests, []);
});

test('stun, mismatched clip, active crossfade, dead solved pose or missing receiver closes punch', () => {
  const cases = [
    { clip: 'hit', sampledTime: 0.6, skinned: true, nativeClipSampled: true },
    { clip: 'punch', sampledTime: 0.6, skinned: true, nativeClipSampled: true,
      transition: 'idle->punch', transitionWeight: 0.6 },
    { clip: 'punch', sampledTime: 0.6, skinned: true,
      nativeClipSampled: false, solvedPoseApplied: true },
    null,
  ];
  for (const drawReport of cases) {
    const result = advanceRenderedDojoPunchGate(state(), {
      drawReport, clipBinding: binding, ...flags, contact: sweep,
    });
    assert.equal(result.poseQualified, false);
    assert.equal(result.state.damageEnabled, false);
    assert.deepEqual(result.requests, []);
  }
  const missingReceiver = advanceRenderedDojoPunchGate(state(), {
    drawReport: { clip: 'punch', sampledTime: 0.6,
      skinned: true, nativeClipSampled: true },
    clipBinding: binding, ...flags, methodReceiverConfirmed: false,
    contact: sweep,
  });
  assert.deepEqual(missingReceiver.requests, []);
});

const matrix = (x, y, z) => composeLocalMatrix({ position: { x, y, z } });

test('source-verified death solver hands SH-14 a copied per-actor pose; absent physics freezes', () => {
  assert.equal(advanceDojoDeathSkinFrame({runtime: null}).solvedPose, null);
  const definition = {
    boneParents: [-1, 0],
    boneRestTransforms: [
      { position: { x: 0, y: 0, z: 0 } },
      { position: { x: 0, y: 1, z: 0 } },
    ],
    fixedDelta: 1 / 150, solverIterations: 1, cleanupAfterSeconds: 2,
    gravity: { x: 0, y: -9.81, z: 0 },
    material: { bounciness: 0, dynamicFriction: 2, bounceThreshold: 2 },
    bodies: [{
      boneIndex: 1, partId: 'leg', mass: 2, drag: 0,
      angularDrag: 0, useGravity: true,
      contactSpheres: [{ center: [0, 0, 0], radius: 0.1 }],
    }],
    joints: [],
  };
  const pose = new Float32Array([...matrix(0, 0, 0), ...matrix(0, 1, 0)]);
  const runtime = createNativeDeathRuntime({
    definition, boneModelMatrices: pose, modelMatrix: matrix(0, 0, 0),
    collisionScene: { boxes: [] }, initialVelocity: { x: 0, y: 0, z: 0 },
  });
  const rig = Object.freeze({ boneOrder: ['root', 'leg'], parents: [-1, 0] });
  const first = advanceDojoDeathSkinFrame({
    runtime, rig, sourceBoneOrder: ['root', 'leg'], scaledDelta: 0.1,
    provenance: 'synthetic-verified-rig-for-test',
  });
  assert.equal(first.solvedPose.rig, rig);
  assert.ok(first.solvedPose.boneModelMatrices[29] < 1);
  const saved = first.solvedPose.boneModelMatrices[29];
  advanceDojoDeathSkinFrame({
    runtime, rig, sourceBoneOrder: ['root', 'leg'], scaledDelta: 0.1,
    provenance: 'synthetic-verified-rig-for-test',
  });
  assert.equal(first.solvedPose.boneModelMatrices[29], saved);
  assert.throws(() => advanceDojoDeathSkinFrame({
    runtime, rig, sourceBoneOrder: ['leg', 'root'], scaledDelta: 0.1,
    provenance: 'synthetic-test',
  }), /ordering/);
});
