import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareNativeCollision, nativeSegmentHit } from '../src/scenes/native-collision.js';
import { prepareDoorVisibility, doorSegmentOccluded } from '../src/scenes/door-visibility.js';

// Synthetic boxes only. No original geometry, mesh, scene payload or shader.
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const affine = [-1, 0.13, 0.05, 0, 0.4, 2, 0, 0, 0.2, 0.25, 1.5, 0, 4, -1, 2, 1];
const rotated = [0.7071067811865476, 0, 0.7071067811865475, 0,
  0, 1, 0, 0, -0.7071067811865475, 0, 0.7071067811865476, 0,
  0, 0.6, -2, 1];
const collider = (id, worldMatrix = identity, props = {}) => ({
  id, center: [0.2, 0.1, -0.25], size: [1.6, 2.7, 1.2],
  worldMatrix, layer: { index: 0 }, isTrigger: false,
  initial: { enabled: true, activeInHierarchy: true }, ...props,
});

test('J4 compact door sightlines match exact collision visibility for mirrored, sheared and rotated source boxes', () => {
  const colliders = [collider('straight'), collider('shear-mirror', affine),
    collider('rotated', rotated)];
  const before = JSON.stringify(colliders);
  const visibility = prepareDoorVisibility(colliders);
  const solver = prepareNativeCollision(colliders);
  assert.equal(visibility.boxes.length, 3);
  assert.equal(visibility.boxes[0].triangles, undefined,
    'warning light visibility must not rebuild solver triangles/edges');
  for (let x = -3; x <= 6; x += 1.5) {
    for (let z = -5; z <= 5; z += 2) {
      const start = { x, y: 1.2, z };
      for (const end of [
        { x: 0.2, y: 0.7, z: -0.25 },
        { x: 5, y: -1, z: 2 },
        { x: -3, y: 3.1, z: 5 },
        { x: x + 0.1, y: 1.2, z: z + 0.1 },
      ]) {
        assert.equal(doorSegmentOccluded(visibility, start, end),
          nativeSegmentHit(solver, start, end) != null,
          'matches the collision solver across synthetic affine positions');
      }
    }
  }
  assert.equal(JSON.stringify(colliders), before, 'source scene must remain immutable');
});

test('J4 occlusion ignores triggers/inactive objects and refuses invalid affine boxes', () => {
  const blockers = [collider('live'), collider('trigger', affine, { isTrigger: true }),
    collider('disabled', rotated, { initial: { enabled: false, activeInHierarchy: true } }),
    collider('replay', rotated, { initial: { enabled: true, activeInHierarchy: false } })];
  assert.equal(prepareDoorVisibility(blockers).boxes.length, 1);
  const invisible = prepareDoorVisibility(blockers.slice(1));
  assert.equal(doorSegmentOccluded(invisible, { x: 0, y: 0, z: 0 },
    { x: 5, y: 0, z: 0 }), false);
  assert.throws(() => prepareDoorVisibility([collider('bad', [
    0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
  ])]), /Singular BoxCollider/);
  assert.throws(() => prepareDoorVisibility([collider('projective', [
    1, 0, 0, 0.2, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
  ])]), /Invalid affine BoxCollider/);
});
