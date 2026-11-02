import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGeneratedDiagnosticEnemyRig, createCharacterRig, poseCharacterRig } from '../src/characters/rig.js';
import { makeGeneratedLatheMesh, makeGeneratedDiagnosticEnemyMeshes } from '../src/characters/generated-meshes.js';

test('diagnostic silhouette is a genuine indexed non-box surface with normals and UVs', () => {
  const meshes = makeGeneratedDiagnosticEnemyMeshes();
  assert.deepEqual(Object.keys(meshes), ['torso', 'head', 'limb']);
  for (const mesh of Object.values(meshes)) {
    assert.equal(mesh.vertexCount * 8, mesh.vertices.length);
    assert.equal(mesh.indices.length, mesh.triangleCount * 3);
    assert.ok(mesh.triangleCount > 40);
    assert.equal(mesh.strideBytes, 32);
    // Curved lathe profile must have vertices at more than two x-coordinates.
    const xs = new Set(Array.from({ length: mesh.vertexCount }, (_, i) =>
      Math.round(mesh.vertices[i * 8] * 1000)));
    assert.ok(xs.size > 4);
    for (let i = 0; i < mesh.vertexCount; i++) {
      const norm = mesh.vertices.subarray(8 * i + 3, 8 * i + 6);
      assert.ok(Math.abs(Math.hypot(...norm) - 1) < 0.00002);
    }
  }
});

test('lathe construction preserves outward triangle winding and fails invalid profiles', () => {
  const m = makeGeneratedLatheMesh([[-.5, .3, .3], [.5, .3, .3]], { segments: 8 });
  assert.equal(m.triangleCount, 32);
  const a = m.vertices.slice(0, 3), b = m.vertices.slice(8, 11), c = m.vertices.slice(16, 19);
  const cross = (u, v) => [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
  const n = cross(b.map((v,i)=>v-a[i]),c.map((v,i)=>v-a[i]));
  assert.ok(n[0] > 0);
  assert.throws(() => makeGeneratedLatheMesh([[0, .3, .3], [0, .2, .2]]), /increasing/);
  assert.throws(() => makeGeneratedLatheMesh([[-.5, .3, 0], [.5, .2, .2]]), /positive/);
});

test('joint rotations move descendants but do not alter unrelated head/leg parts', () => {
  const rig = makeGeneratedDiagnosticEnemyRig();
  assert.match(rig.provenance, /not-native/);
  const idle = poseCharacterRig(rig);
  const pose = poseCharacterRig(rig, {
    jointDeltas: { shoulderR: { rotation: { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 } } },
  });
  assert.equal(idle.packets.length, 11);
  assert.notDeepEqual(pose.jointMatrices.get('elbowR'), idle.jointMatrices.get('elbowR'));
  assert.deepEqual(pose.jointMatrices.get('head'), idle.jointMatrices.get('head'));
  const byId = (state, id) => state.packets.find(x => x.partId === id);
  assert.notDeepEqual(Array.from(byId(pose, 'upperArmR').model), Array.from(byId(idle, 'upperArmR').model));
  assert.deepEqual(Array.from(byId(pose, 'upperLegL').model), Array.from(byId(idle, 'upperLegL').model));
  for (const packet of pose.packets) {
    assert.equal(packet.model.length, 16);
    assert.equal(packet.normal.length, 9);
    assert.equal(typeof packet.mirrored, 'boolean');
  }
});

test('root can be supplied by SH-05 and mirrored normals are flagged, not flattened', () => {
  const rig = makeGeneratedDiagnosticEnemyRig();
  const root = [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 8, 0, -12, 1];
  const result = poseCharacterRig(rig, { rootMatrix: root });
  assert.ok(result.packets.every(p => p.mirrored));
  assert.equal(result.jointMatrices.get('root')[12], 8);
  assert.equal(result.jointMatrices.get('root')[14], -12);
  assert.throws(() => poseCharacterRig(rig, {
    rootMatrix: [0,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],
  }), /Singular/);
});

test('invalid graph, unknown pose id and missing drawable bindings fail closed', () => {
  assert.throws(() => createCharacterRig({
    joints: [{ id: 'a', parentId: 'b' }, { id: 'b', parentId: 'a' }],
    parts: [{ id: 'part', jointId: 'a', meshId: 'head', materialKey: 'generated-red' }],
  }), /cycle/);
  assert.throws(() => createCharacterRig({
    joints: [{ id: 'root' }],
    parts: [{ id: 'p', jointId: 'missing', meshId: 'head', materialKey: 'generated-red' }],
  }), /known joint/);
  assert.throws(() => poseCharacterRig(makeGeneratedDiagnosticEnemyRig(), {
    jointDeltas: { fabricatedMcdJoint: { rotation: { x: 0, y: 0, z: 0, w: 1 } } },
  }), /Unknown posed joint/);
});
