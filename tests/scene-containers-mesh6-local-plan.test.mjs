import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOCAL_MESH6_GROUP47_TARGETS, LOCAL_MESH6_PROVENANCE, planLocalMesh6Draws,
} from '../src/scenes/containers-mesh6-local-plan.js';

test('without local source, no draw and no proxy suppression', () => {
  assert.deepEqual(planLocalMesh6Draws(), {
    drawPackets: [], omitGeneratedProxyIds: [], expectedTriangles: 0, sourceGroup: 47,
  });
  assert.throws(() => planLocalMesh6Draws({ group47Loaded: 1 }), /boolean/);
});
test('one selected 1546-triangle group maps to three independently sourced GOs', () => {
  const plan = planLocalMesh6Draws({ group47Loaded: true });
  assert.deepEqual(plan.drawPackets.map((p) => [p.gameObjectId, p.rendererPathId, p.nativeSubmesh]),
    [[336, 7837, 47], [839, 8272, 24], [1003, 8417, 32]]);
  assert.ok(plan.drawPackets.every((p) => p.gpuSlot === 'mesh6' && p.sourceGroup === 47));
  assert.equal(plan.expectedTriangles, 3 * 1546);
  assert.deepEqual(plan.omitGeneratedProxyIds, ['cargo-22', 'cargo-7']);
  assert.equal(new Set(plan.drawPackets.map((p) => p.id)).size, 3);
});
test('world-batched OBJ translations move the first loaded group to each world center', () => {
  const plan = planLocalMesh6Draws({ group47Loaded: true });
  const origin = LOCAL_MESH6_GROUP47_TARGETS[0].webCenter;
  plan.drawPackets.forEach((packet, i) => {
    const model = packet.modelMatrix;
    assert.deepEqual(model.slice(0, 12), [1,0,0,0, 0,1,0,0, 0,0,1,0]);
    assert.equal(model[15], 1);
    const moved = origin.map((v, j) => v + model[12 + j]);
    assert.ok(moved.every((value, j) =>
      Math.abs(value - LOCAL_MESH6_GROUP47_TARGETS[i].webCenter[j]) < 1e-9));
  });
  assert.deepEqual(plan.drawPackets[2].modelMatrix.slice(12, 15).map(n => +n.toFixed(3)),
    [-1.4, -0.05, -25.2]);
});
test('proof is source-converted only, without original material or pixel certification', () => {
  assert.equal(LOCAL_MESH6_PROVENANCE.runtimeObserved, false);
  assert.equal(LOCAL_MESH6_PROVENANCE.publicGeometryIncluded, false);
  assert.equal(LOCAL_MESH6_PROVENANCE.serializedMaterial.resolved, false);
  assert.equal(LOCAL_MESH6_PROVENANCE.sourceReferencedPositions, 2402);
  assert.equal(LOCAL_MESH6_PROVENANCE.maxObservedCenteredPositionDelta, 2.01e-6);
  assert.ok(LOCAL_MESH6_GROUP47_TARGETS.every(p => Object.isFrozen(p.webCenter)));
});
