import test from 'node:test';
import assert from 'node:assert/strict';
import { SOURCE, MESHES, BINDINGS, mirroredBounds, reportMeshReadiness } from '../scripts/native-mesh-index-build28.mjs';

test('source SHA and owner-qualified mesh IDs are bound to Containers build28', () => {
  assert.equal(SOURCE.owner, 'level28');
  assert.equal(SOURCE.unityVersion, '2018.4.14f1');
  assert.match(SOURCE.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(MESHES.map((m) => [m.pathId, m.vertices, m.submeshes]),
    [[6, 44030, 61], [7, 60874, 85]]);
  assert.equal(MESHES[0].stream.offset + MESHES[0].stream.size, MESHES[1].stream.offset);
});

test('six serialized cargo meshes have distinct component chains, with only two proven submeshes', () => {
  assert.equal(BINDINGS.length, 6);
  assert.equal(new Set(BINDINGS.map((b) => b.gameObjectId)).size, 6);
  assert.equal(new Set(BINDINGS.map((b) => b.filterId)).size, 6);
  assert.deepEqual(BINDINGS.slice(0, 2).map((b) => [b.gameObjectId, b.meshId, b.submesh, b.measured.indexCount]),
    [[336, 6, 47, 4638], [459, 7, 48, 4638]]);
  assert.ok(BINDINGS.slice(2).every((b) => b.submesh === null && b.measured === null));
  assert.ok(BINDINGS.every((b) => b.material.fileId === 5 && b.material.pathId === 3 && !b.material.resolved));
});

test('two native static-submesh bounds agree with first two GENERATED proxy hulls, not topology', () => {
  const expected = [
    { center: [17.45, 2.575, 13.975], size: [3, 3.198, 8.21] },
    { center: [17.475, 5.725, 15.8], size: [8.21, 3.198, 3] },
  ];
  for (let i = 0; i < 2; i++) {
    const calculated = mirroredBounds(BINDINGS[i].measured);
    for (const prop of ['center', 'size']) {
      for (let axis = 0; axis < 3; axis++) {
        assert.ok(Math.abs(calculated[prop][axis] - expected[i][prop][axis]) < 0.001);
      }
    }
  }
});

test('private OBJ converted exports do not authorize public mesh draw', () => {
  const report = reportMeshReadiness();
  assert.equal(report.webMeshReady, false);
  assert.equal(report.rows.filter((r) => r.submeshKnown).length, 2);
  assert.equal(report.rows.filter((r) => r.boundsKnown).length, 2);
  assert.ok(report.rows.every((r) => r.privateObjAvailable && !r.publicDrawable));
  assert.ok(BINDINGS.every((b) => !b.publicDrawable));
});
