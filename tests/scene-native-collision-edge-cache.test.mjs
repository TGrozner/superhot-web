import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareNativeCollision, nativeCapsuleHit } from '../src/scenes/native-collision.js';

// A sheared, reflected Dojo-like door jamb is a Web collision fixture, not an
// extracted asset or an assertion about an original scene's placement.
test('capsule probes share first-seen box edges without losing grazing contacts', () => {
  const scene = prepareNativeCollision([{
    id: 'door-jamb', center: [0, 0, 0], size: [.2, 2, 2],
    worldMatrix: [-1, 0, 0, 0, .2, 1, 0, 0, 0, 0, 1, 0, 2, 1, 0, 1],
    initial: { enabled: true, activeInHierarchy: true },
    isTrigger: false,
  }]);
  const triangles = scene.boxes[0].triangles;
  assert.equal(triangles.length, 12);
  assert.equal(triangles.reduce((total, triangle) => total + triangle.uniqueEdges.length, 0), 18,
    'a solid box has 12 external edges + 6 triangulation diagonals, not 36 repeated edges');

  // A near-edge capsule must still be blocked even when its center ray
  // misses the box. This guards the optimization against skipping contacts.
  const hit = nativeCapsuleHit(scene,
    { x: 0, y: 0, z: 1.17 }, { x: 5, y: 0, z: 1.17 },
    { radius: .3, height: 1.8 });
  assert.ok(hit, 'finite-radius grazing contact must remain');
  assert.equal(hit.collider.id, 'door-jamb');
  assert.ok(hit.t >= 0 && hit.t < 1, 'contact precedes the end of the sweep');
});
