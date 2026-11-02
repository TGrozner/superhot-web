import test from 'node:test';
import assert from 'node:assert/strict';
import { parseObjGroupsIntoIndexedMesh } from '../src/render/mesh-format.js';
import { createIndexedSkinBinding, skinIndexedCharacter } from '../src/characters/skinning.js';
import {
  createObjSkinVertexMap, remapObjPositionSkinInfluences,
} from '../src/characters/obj-skin-map.js';

// Authored non-cuboid, two-triangle, two-normal/UV-seam fixture.
// NOT MCD code, asset geometry, bone data or real animation.
const obj = [
  'o AuthoredFixture',
  'v 0 0 0', 'v 1 0 0', 'v 0 1 1', 'v -1 1 0',
  'vt 0 0', 'vt 1 0', 'vt 0 1', 'vt 1 1', 'vt .25 .5',
  'vn 0 0 1', 'vn 0 1 0',
  'g SyntheticRig_0',
  'f 3/3/1 1/1/1 2/2/1',
  'f 1/5/2 2/2/1 4/4/1',
].join('\n');
const groupName = 'SyntheticRig_0';
const parsed = () => parseObjGroupsIntoIndexedMesh(obj, [groupName], {
  axisSigns: [-1, 1, -1], winding: 'keep',
  expectedGroups: { [groupName]: { expectedTriangles: 2, expectedPositionRefs: 4 } },
});
const build = (overrides = {}) => createObjSkinVertexMap({
  objText: obj, mesh: parsed().mesh, groupName,
  sourcePositionCount: 4, ...overrides,
});
const identity = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
const shifted = [1,0,0,0, 0,1,0,0, 0,0,1,0, 3,0,0,1];
const sourceBoneIndices = [
  1,0,0,0, // OBJ source 'v 1' is bone beta
  0,1,0,0, // v 2 is alpha
  0,1,0,0, // v 3 is alpha
  1,0,0,0, // v 4 is beta
];
const sourceBoneWeights = [
  1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0,
];
const at = (mesh, vertex) => Array.from(mesh.vertices.slice(vertex*8,vertex*8+3));

test('SH-12 face-corner GPU permutation is NOT OBJ vertex declaration order', () => {
  const map = build();
  assert.deepEqual([...map.sourceVertexForGpu], [2,0,1,0,3]);
  assert.equal(map.sourcePositionCount, 4);
  assert.equal(map.gpuVertexCount, 5);
  assert.equal(map.selectedTriangles, 2);
  assert.equal(map.referencedSourcePositions, 4);
  assert.equal(map.repeatedPositionsInGpu, 1);
  assert.equal(map.reorderedGpuVertices, 5);
  assert.equal(map.nativeUnityVertexOrderVerified, false);
  assert.deepEqual([...parsed().mesh.indices], [0,1,2,3,2,4]);
});

test('remap duplicates an authentic source-position skin influence over UV/normal seams', () => {
  const map = build();
  const projected = remapObjPositionSkinInfluences(map, sourceBoneIndices, sourceBoneWeights);
  assert.deepEqual([...projected.boneIndices.filter((_,i) => i%4===0)], [0,1,0,1,1]);
  assert.deepEqual([...projected.boneIndices.slice(4,8)], [...projected.boneIndices.slice(12,16)]);
  assert.equal(projected.nativeUnityVertexOrderVerified, false);
  assert.equal(projected.nativeSkinWeightsVerified, false);
  // Source-neutral two-bone deformation: OBJ face GPU-1 & GPU-3 represent
  // the SAME original source 'v 1', and MUST deform identically.
  const mesh = parsed().mesh;
  const bind = createIndexedSkinBinding({
    mesh, boneIds: ['alpha','beta'],
    inverseBindMatrices: [identity,identity],
    boneIndices: projected.boneIndices, boneWeights: projected.boneWeights,
  });
  const result = skinIndexedCharacter(bind, new Map([
    ['alpha',identity],['beta',shifted],
  ]));
  assert.deepEqual(at(result.mesh,1), [3,0,0]);
  assert.deepEqual(at(result.mesh,3), [3,0,0]);
  assert.deepEqual(at(result.mesh,0), [0,1,-1]);
  assert.deepEqual(at(result.mesh,4), [4,1,0]);
  assert.deepEqual([...result.mesh.indices], [...mesh.indices]);
});

test('refuses passing a geometry-reordered or vertex-modified SH-12 mesh', () => {
  const mesh = parsed().mesh;
  const changedIndex = { ...mesh, indices: new Uint16Array(mesh.indices) };
  [changedIndex.indices[0],changedIndex.indices[1]] = [changedIndex.indices[1],changedIndex.indices[0]];
  assert.throws(() => build({ mesh:changedIndex }), /ordering differs/);
  const changedPosition = { ...mesh, vertices: new Float32Array(mesh.vertices) };
  changedPosition.vertices[0] += 0.5;
  assert.throws(() => build({ mesh:changedPosition }), /attribute order\/content mismatch/);
  const badNormal = { ...mesh, vertices: new Float32Array(mesh.vertices) };
  badNormal.vertices[3] = 0.1;
  assert.throws(() => build({ mesh:badNormal }), /attribute order\/content mismatch/);
});

test('rejects wrong exporter, group, evidence count, axis convention and malformed face', () => {
  assert.throws(() => build({ groupName:'Other_0' }), /missing or empty/);
  assert.throws(() => build({ sourcePositionCount:5 }), /count differs/);
  assert.throws(() => build({ axisSigns:[1,1,1] }), /attribute order\/content mismatch/);
  assert.throws(() => build({ objText:obj.replace('3\/3\/1','3\/3') }), /position\/UV\/normal/);
  assert.throws(() => build({ objText:obj.replace('1\/1\/1', '5\/1\/1') }), /unavailable OBJ declaration/);
  assert.throws(() => build({ objText:obj.replace('g SyntheticRig_0','g SyntheticRig_0\ng SyntheticRig_0') }), /declared twice/);
});

test('rejects absent, truncated, invalid source influences and stale source map', () => {
  const map = build();
  assert.throws(() => remapObjPositionSkinInfluences(map, sourceBoneIndices.slice(1), sourceBoneWeights), /four influences/);
  assert.throws(() => remapObjPositionSkinInfluences(map, sourceBoneIndices, [...sourceBoneWeights.slice(0,8),NaN,...sourceBoneWeights.slice(9)]), /Invalid source influence/);
  assert.throws(() => remapObjPositionSkinInfluences(map, [65536,...sourceBoneIndices.slice(1)], sourceBoneWeights), /Invalid source influence/);
  const changed = { ...map, sourceVertexForGpu: new Uint32Array(map.sourceVertexForGpu) };
  changed.sourceVertexForGpu[0] = 800;
  assert.throws(() => remapObjPositionSkinInfluences(changed,sourceBoneIndices,sourceBoneWeights), /missing source position/);
});
