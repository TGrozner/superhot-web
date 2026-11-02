import test from 'node:test';
import assert from 'node:assert/strict';
import { parseObjGroupsIntoIndexedMesh } from '../src/render/mesh-format.js';
import {
  LOCAL_MESH7_GROUPS, LOCAL_MESH7_PROVENANCE,
  localMesh7ObjParseRequest, planLocalMesh7Draws,
} from '../src/scenes/containers-mesh7-local-plan.js';

test('SH-04 private Mesh7 contract: three distinct source-qualified renderer groups', () => {
  assert.deepEqual(LOCAL_MESH7_GROUPS.map(g => [g.goPathId, g.rendererPathId, g.nativeSubmesh]), [
    [459, 7940, 48], [461, 7941, 46], [673, 8123, 77],
  ]);
  assert.deepEqual(LOCAL_MESH7_GROUPS.map(g => g.generatedProxyId),
    ['cargo-upper', 'cargo-86', 'cargo-21']);
  assert.equal(new Set(LOCAL_MESH7_GROUPS.map(g => g.groupName)).size, 3);
  assert.ok(LOCAL_MESH7_GROUPS.every(g => g.expectedTriangles === 1546 && g.expectedPositionRefs === 2402));
  assert.equal(LOCAL_MESH7_PROVENANCE.runtimeObserved, false);
  assert.equal(LOCAL_MESH7_PROVENANCE.publicGeometryIncluded, false);
});

test('No private user file: no native source drawings or synthetic proxy deletions', () => {
  assert.deepEqual(planLocalMesh7Draws(), {
    drawPackets: [], omitGeneratedProxyCandidates: [], expectedTriangles: 0,
  });
});

test('Three verified multi-group ranges produce exactly three distinct draw packets', () => {
  const names = LOCAL_MESH7_GROUPS.map(g => g.groupName);
  const input = names.map((groupName, i) => ({ groupName, firstIndex: i * 4638, indexCount: 4638 }));
  const plan = planLocalMesh7Draws({ drawRanges: input });
  assert.equal(plan.drawPackets.length, 3);
  assert.equal(plan.expectedTriangles, 3 * 1546);
  assert.deepEqual(plan.drawPackets.map(p => p.drawRange.firstIndex), [0, 4638, 9276]);
  assert.deepEqual(plan.drawPackets.map(p => p.nativeSubmesh), [48, 46, 77]);
  assert.deepEqual(plan.omitGeneratedProxyCandidates, ['cargo-upper', 'cargo-86', 'cargo-21']);
  assert.ok(plan.drawPackets.every(p => p.modelMatrix.every((n, i) => n === ([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1][i]))));
  assert.ok(plan.drawPackets.every(p => p.nativeMaterialShaderRuntimeProven === false));
});

test('Only an actually selected group qualifies its own proxy as a future removal candidate', () => {
  const input = [{ groupName: LOCAL_MESH7_GROUPS[1].groupName, firstIndex: 17, indexCount: 4638 }];
  const plan = planLocalMesh7Draws({ drawRanges: input });
  assert.deepEqual(plan.drawPackets.map(p => p.id), ['cargo-86']);
  assert.deepEqual(plan.omitGeneratedProxyCandidates, ['cargo-86']);
  assert.equal(plan.expectedTriangles, 1546);
});

test('Rejects fake, duplicate or incomplete group draw ranges, instead of masking a proxy', () => {
  const known = LOCAL_MESH7_GROUPS[0].groupName;
  for (const bad of [
    [{ groupName: 'unmatched-group', firstIndex: 0, indexCount: 4638 }],
    [{ groupName: known, firstIndex: 0, indexCount: 3 }],
    [{ groupName: known, firstIndex: -1, indexCount: 4638 }],
    [{ groupName: known, firstIndex: 0, indexCount: 4638 },
      { groupName: known, firstIndex: 4638, indexCount: 4638 }],
  ]) {
    assert.throws(() => planLocalMesh7Draws({ drawRanges: bad }), RangeError);
  }
});

// GENERATED geometry fixture only. This verifies that SH-12's real parser
// accepts the exact exporter group names and independent serialized AABBs,
// not that MCD GPU execution, source textures or shader pixels match.
function syntheticThreeGroupObj() {
  const vertices = [], uvs = [], normals = [], faceChunks = [];
  let base = 0;
  for (const g of LOCAL_MESH7_GROUPS) {
    const n = g.expectedPositionRefs;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const web = g.bounds.min.map((lo, axis) => lo + t * (g.bounds.max[axis] - lo));
      vertices.push('v ' + [-web[0], web[1], -web[2]].join(' '));
      uvs.push('vt ' + t + ' ' + (1 - t));
      normals.push('vn 0 1 0');
    }
    const faces = ['g ' + g.groupName];
    for (let i = 0; i < g.expectedTriangles; i++) {
      const j = i * 3;
      const local = [j % n, (j + 1) % n, (j + 2) % n];
      const refs = local.map(index => {
        const id = base + index + 1;
        return id + '/' + id + '/' + id;
      });
      faces.push('f ' + refs.join(' '));
    }
    faceChunks.push(...faces);
    base += n;
  }
  return [...vertices, ...uvs, ...normals, ...faceChunks].join('\n') + '\n';
}

test('Vertical contract: one local OBJ7 -> 3 parsed ranges -> 3 source-qualified GPU draw intentions', () => {
  const { selectors, options } = localMesh7ObjParseRequest();
  assert.deepEqual(selectors, LOCAL_MESH7_GROUPS.map(g => g.groupName));
  assert.deepEqual(options.axisSigns, [-1, 1, -1]);
  assert.equal(options.winding, 'keep'); // two axis reflections; no third winding flip
  const parsed = parseObjGroupsIntoIndexedMesh(syntheticThreeGroupObj(), selectors, options);
  assert.deepEqual(parsed.drawRanges.map(r => r.indexCount), [4638, 4638, 4638]);
  assert.deepEqual(parsed.groupEvidence.map(p => p.triangleCount), [1546, 1546, 1546]);
  const plan = planLocalMesh7Draws({ drawRanges: parsed.drawRanges });
  assert.equal(plan.drawPackets.length, 3);
  assert.equal(plan.expectedTriangles, 4638);
  assert.equal(parsed.mesh.triangleCount, 4638);
  assert.deepEqual(plan.omitGeneratedProxyCandidates, ['cargo-upper', 'cargo-86', 'cargo-21']);
});
