import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraAxes } from '../src/math.js';
import { multiplyMatrices } from '../src/scenes/graph.js';
import { nativeItemDraws } from '../src/combat/native-items.js';
import { projectDojoPlayerFrame } from '../src/characters/native-player-controller.js';

// Numerical cross-module seam of the actual runtime functions used by SH-05
// in #224. Synthetic matrices test transform composition, NOT native poses,
// GPU pixels, source camera parity, or an executed Dojo browser frame.
const I = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const translation = (x, y, z) => [...I().slice(0, 12), x, y, z, 1];
const nearMatrix = (actual, expected) => {
  assert.equal(actual.length, 16);
  for (let i = 0; i < 16; i++) {
    assert.ok(Math.abs(actual[i] - expected[i]) < 2e-6,
      `matrix[${i}]: ${actual[i]} != ${expected[i]}`);
  }
};
const browserBasis = camera => {
  const axes = cameraAxes(camera.yaw, camera.pitch);
  return [
    -axes.right.x, -axes.right.y, -axes.right.z, 0,
    axes.up.x, axes.up.y, axes.up.z, 0,
    axes.forward.x, axes.forward.y, axes.forward.z, 0,
    camera.x, camera.y, camera.z, 1,
  ];
};
const descriptor = { clip: 'source-fixture-attack', time: 0.42, playback: 'clamp' };
const katanaPose = () => ({
  handsVisible: true, profileId: 'pickup_742', descriptor,
  handsMatrix: translation(0.28, -0.17, 0.45),
  // Non-identity orientation exercises item-socket rotation, not only position.
  itemMatrix: [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0.32, -0.23, 0.55, 1],
});
const katanaItem = () => ({
  id: 'pickup_742', isKatana: true, state: 'held',
  heldMatrix: translation(0.11, -0.3, 0.7),
  worldMatrix: I(), handPosition: [0, 0, 0],
  containerMatrix: I(), scaleMatrix: I(),
  models: [{ instanceId: 'source-katana-fixture', localMatrix: translation(0.04, 0.02, -0.06) }],
});

test('SH16 sampled katana socket follows the same non-identity camera as nativeItemDraws, exactly once', () => {
  for (const camera of [
    { x: 2.5, y: 1.6, z: -3.2, yaw: 0.7, pitch: -0.23 },
    { x: -5.1, y: 2.2, z: 7.4, yaw: -1.1, pitch: 0.31 },
  ]) {
    const item = katanaItem();
    const staticPose = item.heldMatrix;
    const basis = browserBasis(camera);
    const frame = projectDojoPlayerFrame({
      pose: katanaPose(), heldItem: item, cameraWorldMatrix: basis,
    });
    assert.equal(frame.profileId, item.id);
    assert.equal(frame.bladeSocketAvailable, true);
    nearMatrix(frame.modelMatrix, multiplyMatrices(basis, katanaPose().handsMatrix));
    nearMatrix(frame.itemWorldMatrix, multiplyMatrices(basis, frame.itemCameraLocalMatrix));
    // SH-05's temporary per-draw override must not permanently replace
    // an authored static fallback, including after an animation disappears.
    item.heldMatrix = frame.itemCameraLocalMatrix;
    try {
      const draws = nativeItemDraws({ items: [item], fragments: [] }, camera);
      assert.equal(draws.held.length, 1);
      nearMatrix(draws.held[0].modelMatrix,
        multiplyMatrices(frame.itemWorldMatrix, item.models[0].localMatrix));
      assert.equal(draws.world.length, 0);
    } finally {
      item.heldMatrix = staticPose;
    }
    assert.strictEqual(item.heldMatrix, staticPose);
    const fallback = nativeItemDraws({ items: [item], fragments: [] }, camera);
    assert.equal(fallback.held.length, 1);
    assert.ok(Math.abs(fallback.held[0].modelMatrix[12] -
      multiplyMatrices(frame.itemWorldMatrix, item.models[0].localMatrix)[12]) > 0.01,
    'static fallback must remain distinct from sampled socket');
  }
});

test('SH16 source-hidden and unarmed hands never manufacture a held katana socket', () => {
  const cameraWorldMatrix = browserBasis({ x: 0, y: 1.6, z: 0, yaw: 0.1, pitch: 0.05 });
  const item = katanaItem();
  assert.equal(projectDojoPlayerFrame({
    pose: { ...katanaPose(), handsVisible: false },
    heldItem: item, cameraWorldMatrix,
  }), null);
  assert.equal(projectDojoPlayerFrame({
    pose: { ...katanaPose(), profileId: 'pickup_wrong' },
    heldItem: item, cameraWorldMatrix,
  }), null);
  const unarmed = projectDojoPlayerFrame({
    pose: { ...katanaPose(), profileId: 'unarmed' },
    heldItem: null, cameraWorldMatrix,
  });
  assert.equal(unarmed.profileId, 'unarmed');
  assert.equal(unarmed.itemWorldMatrix, null);
  assert.equal(unarmed.itemCameraLocalMatrix, null);
  assert.equal(unarmed.bladeSocketAvailable, false);
  // A stale armed object must not be admitted with a source-unarmed sample.
  assert.equal(projectDojoPlayerFrame({
    pose: { ...katanaPose(), profileId: 'unarmed' },
    heldItem: item, cameraWorldMatrix,
  }), null);
});
