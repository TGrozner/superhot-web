import test from 'node:test';
import assert from 'node:assert/strict';
import { SOURCE, MESHES, BINDINGS, OBJ_GROUP_BINDINGS, mirroredBounds, reportMeshReadiness } from '../scripts/native-mesh-index-build28.mjs';
import { CONTAINERS_BUILD28_HULLS } from '../src/scenes/containers-build28.js';

test('source SHA and owner-qualified mesh IDs are bound to Containers build28', () => {
  assert.equal(SOURCE.owner, 'level28');
  assert.equal(SOURCE.unityVersion, '2018.4.14f1');
  assert.match(SOURCE.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(MESHES.map((m) => [m.pathId, m.vertices, m.submeshes]),
    [[6, 44030, 61], [7, 60874, 85]]);
  assert.equal(MESHES[0].stream.offset + MESHES[0].stream.size, MESHES[1].stream.offset);
});

test('native #68 resolves all six serialized cargo renderers to exactly one static submesh', () => {
  assert.equal(BINDINGS.length, 6);
  assert.equal(new Set(BINDINGS.map((b) => b.gameObjectId)).size, 6);
  assert.equal(new Set(BINDINGS.map((b) => b.filterId)).size, 6);
  assert.deepEqual(BINDINGS.map((b) => [b.gameObjectId, b.rendererId, b.meshId, b.submesh]),
    [[336, 7837, 6, 47], [459, 7940, 7, 48], [461, 7941, 7, 46],
      [673, 8123, 7, 77], [839, 8272, 6, 24], [1003, 8417, 6, 32]]);
  assert.ok(BINDINGS.every((b) => b.measured.indexCount === 4638));
  assert.ok(BINDINGS.every((b) => b.material.fileId === 5 && b.material.pathId === 3 && !b.material.resolved));
});

test('five source static-submesh AABBs match the five Web collider PROXIES only', () => {
  assert.equal(CONTAINERS_BUILD28_HULLS.length, 5);
  for (let i = 0; i < 5; i++) {
    const calculated = mirroredBounds(BINDINGS[i].measured);
    const hull = CONTAINERS_BUILD28_HULLS[i];
    for (const prop of ['center', 'size']) {
      for (let axis = 0; axis < 3; axis++) {
        assert.ok(Math.abs(calculated[prop][axis] - hull[prop][axis]) < 0.001,
          `GO ${BINDINGS[i].gameObjectId} mismatch ${prop}[${axis}]`);
      }
    }
  }
  // Sixth model GO1003 is not represented in the current five-hull preview.
  assert.equal(BINDINGS[5].gameObjectId, 1003);
});

test('OBJ-derived groups 24 and 47 now have exact serialized GO/renderer bindings', () => {
  assert.deepEqual(OBJ_GROUP_BINDINGS.map((b) =>
    [b.meshId, b.objGroup, b.gameObjectId, b.rendererId, b.proxyHullId, b.proof]),
    [[6, 24, 839, 8272, 'cargo-7', 'GO_BOUND'],
      [6, 47, 336, 7837, 'cargo-22', 'GO_BOUND']]);
  for (const group of OBJ_GROUP_BINDINGS) {
    const native = BINDINGS.find((row) => row.gameObjectId === group.gameObjectId);
    assert.equal(native.meshId, group.meshId);
    assert.equal(native.rendererId, group.rendererId);
    assert.equal(native.submesh, group.objGroup);
    assert.equal(group.publicDrawable, false);
  }
});

test('private OBJ exports and source linkage still do not authorize public mesh draw', () => {
  const report = reportMeshReadiness();
  assert.equal(report.webMeshReady, false);
  assert.equal(report.rows.filter((r) => r.submeshKnown).length, 6);
  assert.equal(report.rows.filter((r) => r.boundsKnown).length, 6);
  assert.deepEqual(report.sourceBoundObjGroups, [24, 47]);
  assert.ok(report.rows.every((r) => r.privateObjAvailable && !r.publicDrawable));
  assert.ok(BINDINGS.every((b) => !b.publicDrawable));
});
