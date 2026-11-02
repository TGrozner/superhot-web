import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NATIVE_ENEMY_OBJ_EXPORTS, decodeSourceNeutralEnemyObj,
  loadNativeEnemyObj, createEnemyStaticIndexedPass,
} from '../src/characters/native-enemy-local.js';

// Synthetic THREE-vertex fixture. Commercial MCD bytes are NEVER test fixtures.
const fakeObj = [
  '# generated fixture, NOT SUPERHOT data',
  'o invented',
  'v 0 0 0', 'v 1 0 0', 'v 0 1 0',
  'vt 0 0', 'vt 1 0', 'vt 0 1',
  'vn 0 0 1',
  'g Demo_0', 'f 1/1/1 2/2/1 3/3/1',
].join('\n');

const evidence = Object.freeze({
  groupName: 'Demo_0', triangleCount: 1,
  vCount: 3, vtCount: 3, vnCount: 1,
  webBounds: { min: [-1, 0, 0], max: [0, 1, 0] },
});

test('owner qualification prevents resources.assets:284/285 false friends', () => {
  assert.equal(NATIVE_ENEMY_OBJ_EXPORTS.merged.owner, 'sharedassets0.assets');
  assert.equal(NATIVE_ENEMY_OBJ_EXPORTS.merged.pathId, 284);
  assert.equal(NATIVE_ENEMY_OBJ_EXPORTS.merged.rendererPathId, 4748);
  assert.equal(NATIVE_ENEMY_OBJ_EXPORTS.merged.serializedBoneRefs, 60);
  assert.equal(NATIVE_ENEMY_OBJ_EXPORTS.headless.pathId, 285);
  assert.equal(NATIVE_ENEMY_OBJ_EXPORTS.headless.serializedBoneRefs, 59);
  assert.equal(NATIVE_ENEMY_OBJ_EXPORTS.merged.gzipBytes, 110391);
  assert.equal(NATIVE_ENEMY_OBJ_EXPORTS.merged.objBytes, 660805);
  assert.equal(NATIVE_ENEMY_OBJ_EXPORTS.headless.gzipBytes, 103229);
  assert.equal(NATIVE_ENEMY_OBJ_EXPORTS.headless.objBytes, 618720);
});

test('strict OBJ group binds to SH-12 indexed non-cuboid pipeline without claiming skin', () => {
  const source = decodeSourceNeutralEnemyObj(fakeObj, evidence);
  assert.equal(source.mesh.indexCount, 3);
  assert.equal(source.mesh.triangleCount, 1);
  assert.deepEqual(source.groupEvidence[0].bounds.min.map((v) => v + 0), [-1, 0, 0]);
  assert.deepEqual(source.groupEvidence[0].bounds.max.map((v) => v + 0), [0, 1, 0]);
  assert.equal(source.drawRanges[0].groupName, 'Demo_0');
  assert.deepEqual(source.sourceCounts, { v: 3, vt: 3, vn: 1 });
  assert.equal(source.mesh.vertices[2], 0);
  assert.equal(source.mesh.vertices[5], -1);
  assert.equal(source.skinWeightsAvailable, false);
  assert.equal(source.materialBindingsResolved, false);
  assert.match(source.geometryProvenance, /not-native-qualified/);
});

test('wrong group, triangle count, raw channels and bounds are rejected before GPU', () => {
  assert.throws(() => decodeSourceNeutralEnemyObj(fakeObj, { ...evidence, groupName: 'EnemyMerged_0' }), /missing|empty/i);
  assert.throws(() => decodeSourceNeutralEnemyObj(fakeObj, { ...evidence, triangleCount: 2 }), /mismatched triangle count/i);
  assert.throws(() => decodeSourceNeutralEnemyObj(fakeObj, { ...evidence, vCount: 5237 }), /declarations differ/);
  assert.throws(() => decodeSourceNeutralEnemyObj(fakeObj, {
    ...evidence, webBounds: { min: [0, 0, 0], max: [1, 1, 0] },
  }), /verified OBJ bounds/);
  assert.throws(() => decodeSourceNeutralEnemyObj(fakeObj.replace('3/3/1', '3/3/1 2/2/1'), evidence), /triangles only/i);
});

test('only canonical local source bytes are accepted, not fixture data or owner-free path IDs', async () => {
  await assert.rejects(loadNativeEnemyObj({}, { variant: 'merged' }), /local File/);
  await assert.rejects(loadNativeEnemyObj({
    name: 'fake.obj', size: fakeObj.length, arrayBuffer: async () => new TextEncoder().encode(fakeObj).buffer,
  }, { variant: 'resources.assets:284' }), /Unknown owner-qualified/);
  await assert.rejects(loadNativeEnemyObj({
    name: 'fake.obj', size: fakeObj.length, arrayBuffer: async () => new TextEncoder().encode(fakeObj).buffer,
  }, { variant: 'merged' }), /length differs/);
  await assert.rejects(loadNativeEnemyObj({
    name: 'fake.exe', size: NATIVE_ENEMY_OBJ_EXPORTS.merged.objBytes, arrayBuffer: async () => new ArrayBuffer(0),
  }), /\.obj/);
  const bytes = new Uint8Array(NATIVE_ENEMY_OBJ_EXPORTS.merged.gzipBytes);
  await assert.rejects(loadNativeEnemyObj({
    name: 'fake.obj.gz', size: bytes.length, arrayBuffer: async () => bytes.buffer,
  }, { variant: 'merged' }), /SHA-256 differs/);
});

function mockGl() {
  const calls = [];
  let vao = 'old-vao', array = 'old-buffer', program = 'old-program', winding = 2305;
  let next = 0;
  const gl = {
    FLOAT: 5126, STATIC_DRAW: 35044, TRIANGLES: 4,
    ARRAY_BUFFER: 34962, ELEMENT_ARRAY_BUFFER: 34963, UNSIGNED_SHORT: 5123, UNSIGNED_INT: 5125,
    VERTEX_ARRAY_BINDING: 34229, ARRAY_BUFFER_BINDING: 34964,
    CURRENT_PROGRAM: 35725, FRONT_FACE: 2886, CULL_FACE: 2884,
    CCW: 2305, CW: 2304,
    createVertexArray: () => 'v' + ++next, createBuffer: () => 'b' + ++next,
    bindVertexArray: (v) => { vao = v; calls.push(['vao', v]); },
    bindBuffer: (key, value) => { if (key === 34962) array = value; },
    bufferData: () => {}, enableVertexAttribArray: () => {}, vertexAttribPointer: () => {},
    getAttribLocation: (_program, key) => ({ aPosition: 0, aNormal: 1, aUV: -1 })[key],
    getParameter: (key) => ({
      34229: vao, 34964: array, 35725: program, 2886: winding,
    })[key],
    isEnabled: (key) => key === 2884,
    frontFace: (value) => { winding = value; },
    useProgram: (value) => { program = value; },
    uniform1i: () => {}, uniformMatrix4fv: () => {}, uniformMatrix3fv: () => {}, uniform4f: () => {},
    drawElements: (_mode, count, _type, offset) => { calls.push(['draw', count, offset, winding]); },
    deleteVertexArray: () => calls.push(['dispose-vao']),
    deleteBuffer: () => {},
  };
  return { gl, calls, snapshot: () => ({ vao, program, winding }) };
}

test('static enemy draw is one SH-12 indexed GPU draw, preserves SH-05 state, never claims native pose', () => {
  const { gl, calls, snapshot } = mockGl();
  const geometry = decodeSourceNeutralEnemyObj(fakeObj, evidence);
  const pass = createEnemyStaticIndexedPass(gl, 'shared-host-program',
    { uUseAffine: {}, uAffineModel: {}, uAffineNormal: {}, uColor: {} }, geometry);
  const before = snapshot();
  const report = pass.draw([
    1,0,0,0, 0,1,0,0, 0,0,1,0, 10,0,5,1,
  ]);
  assert.equal(report.drawCalls, 1);
  assert.equal(report.triangles, 1);
  assert.equal(report.staticMesh, true);
  assert.equal(report.skinned, false);
  assert.equal(report.nativeEnemySpawnVerified, false);
  assert.equal(report.nativeMaterialVerified, false);
  assert.equal(report.geometryProvenance, 'caller-supplied-unverified-mesh');
  assert.deepEqual(calls.filter(c => c[0] === 'draw').map(c => c.slice(1)), [[3,0,2305]]);
  assert.deepEqual(snapshot(), before);
  assert.throws(() => pass.draw([0,0,0,0]), /4x4 world matrix/);
  pass.dispose();
  pass.dispose();
  assert.equal(calls.filter(c => c[0] === 'dispose-vao').length, 1);
  assert.throws(() => pass.draw([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]), /disposed/);
});

test('static pass refuses unqualified diagnostic palette rather than invent native material', () => {
  const { gl } = mockGl();
  const geometry = decodeSourceNeutralEnemyObj(fakeObj, evidence);
  assert.throws(() => createEnemyStaticIndexedPass(gl, 'program',
    { uUseAffine: {}, uAffineModel: {}, uAffineNormal: {}, uColor: {} },
    geometry, { diagnosticColor: [999,0,0,1] }), /diagnostic RGBA/);
});
