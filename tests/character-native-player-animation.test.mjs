import test from 'node:test';
import assert from 'node:assert/strict';
import { createDojoPlayerAnimationPass } from '../src/characters/native-player-animation.js';
import { sampleNativeSkinPalette } from '../src/characters/native-skin-pass.js';

// Authored skewed four-vertex mesh/pose ONLY. No native mesh, bone, clip or shader bytes.
const identity = () => [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
const translate = x => [1,0,0,0, 0,1,0,0, 0,0,1,0, x,0,0,1];
const pose = childX => ({
  positions: [0,0,0, childX,0,0],
  rotations: [0,0,0,1, 0,0,0,1],
  scales: [1,1,1, 1,1,1],
});
const rig = () => ({
  scene: 'SHRL_Dojo2', sceneBuildIndex: 10,
  animatorPathId: 6333, handManagerPathId: 6545,
  rendererPathId: 6378, weaponBoneTransformPathId: 2896,
  weaponBoneName: 'blade-socket', provenance: 'synthetic test for documented source path IDs',
});
const pkg = () => ({
  schemaVersion: 1,
  source: { owner: 'authored-geometry-fixture' },
  coordinates: {
    space: 'fixture mesh-local', axes: 'xyz', units: 'fixture units',
    quaternion: 'xyzw', boneOrder: 'parent-first',
    inverseBindMatrices: 'column-major affine',
    skinEquation: 'boneModelMatrix * inverseBindMatrix, weighted mesh vertex',
    indices: 'source fixture vertex order',
  },
  mesh: {
    // A skewed non-cuboid quadrilateral; UV included to exercise red-shader exclusion.
    positions: [-.2,0,0, .3,.15,.1, .55,1,.25, -.1,.8,.4],
    normals: [0,0,1, 0,0,1, 0,0,1, 0,0,1],
    uv0: [0,0, 1,0, 1,1, 0,1],
    indices: [0,1,2, 0,2,3],
    indexComponentBits: 16,
    submeshes: [{ firstIndex: 0, indexCount: 6, baseVertex: 0, topology: 0 }],
    jointIndices: [0,0,0,0, 1,0,0,0, 1,0,0,0, 0,0,0,0],
    weights: [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    inverseBindMatrices: [...identity(), ...translate(-1)],
  },
  bones: [
    { name: 'root', parent: -1, position: [0,0,0], rotation: [0,0,0,1], scale: [1,1,1] },
    { name: 'blade-socket', parent: 0, position: [1,0,0], rotation: [0,0,0,1], scale: [1,1,1] },
  ],
  clips: {
    heldSource: { duration: 1, sampleRate: 1, frames: [pose(1), pose(1)] },
    swingSource: { duration: 1, sampleRate: 1, frames: [pose(1), pose(2)] },
  },
  weaponAttachment: {
    bone: 'blade-socket', localMatrix: translate(.25),
    source: { fixture: 'explicit synthetic socket' },
    coordinates: { fixture: 'mesh-local column-major' },
  },
});
const clipBindings = { held: 'heldSource', swing: 'swingSource' };

function mockGl() {
  const calls = [];
  let serial = 0, vao = 'previous-vao', arrayBuffer = 'previous-array',
    program = 'previous-program', winding = 2305;
  const c = {
    VERTEX_SHADER: 35633, FRAGMENT_SHADER: 35632,
    COMPILE_STATUS: 35713, LINK_STATUS: 35714,
    MAX_VERTEX_UNIFORM_VECTORS: 36347, VERTEX_ARRAY_BINDING: 34229,
    ARRAY_BUFFER_BINDING: 34964, CURRENT_PROGRAM: 35725, FRONT_FACE: 2886,
    CULL_FACE: 2884, ARRAY_BUFFER: 34962, ELEMENT_ARRAY_BUFFER: 34963,
    STATIC_DRAW: 35044, FLOAT: 5126, UNSIGNED_BYTE: 5121,
    TRIANGLES: 4, UNSIGNED_SHORT: 5123, UNSIGNED_INT: 5125, CW: 2304, CCW: 2305,
  };
  const attrs = { aPosition: 0, aNormal: 1, aJointIndices: 2, aWeights: 3 };
  const gl = {
    ...c, drawingBufferWidth: 1920, drawingBufferHeight: 1080,
    createShader: kind => ({ kind, id: ++serial }),
    shaderSource: (_shader, src) => calls.push(['source', src]),
    compileShader: () => {}, getShaderParameter: () => true, getShaderInfoLog: () => '',
    deleteShader: () => {},
    createProgram: () => ({ id: ++serial }), attachShader: () => {},
    linkProgram: () => {}, getProgramParameter: () => true,
    getProgramInfoLog: () => '',
    createVertexArray: () => ({ id: ++serial }),
    createBuffer: () => ({ id: ++serial }),
    bindVertexArray: next => { vao = next; },
    bindBuffer: (target, next) => { if (target === c.ARRAY_BUFFER) arrayBuffer = next; },
    bufferData: () => {}, enableVertexAttribArray: () => {},
    vertexAttribPointer: () => {}, vertexAttribIPointer: () => {},
    getAttribLocation: (_program, name) => attrs[name] ?? -1,
    getUniformLocation: (_program, name) => ({ name }),
    getParameter: key => ({
      [c.MAX_VERTEX_UNIFORM_VECTORS]: 256,
      [c.VERTEX_ARRAY_BINDING]: vao,
      [c.ARRAY_BUFFER_BINDING]: arrayBuffer,
      [c.CURRENT_PROGRAM]: program,
      [c.FRONT_FACE]: winding,
    })[key],
    isEnabled: key => key === c.CULL_FACE,
    useProgram: next => { program = next; },
    frontFace: next => { winding = next; },
    uniformMatrix4fv: (location, _transpose, value) =>
      calls.push(['matrix', location.name, Array.from(value)]),
    uniform3f: () => {}, uniform2f: () => {},
    uniform4f: (location, ...values) => calls.push(['vec4', location.name, ...values]),
    drawElements: (mode, count, type, offset) =>
      calls.push(['draw', mode, count, type, offset]),
    deleteBuffer: () => {}, deleteVertexArray: () => {}, deleteProgram: () => {},
  };
  return { gl, calls, state: () => ({ vao, arrayBuffer, program, winding }) };
}

const frame = (phase, sourceClipTime, katanaMeshLocalMatrix = translate(.25)) => ({
  heldItem: { id: 'authored-katana', isKatana: true },
  phase, sourceClipTime, modelMatrix: identity(), viewProjection: identity(),
  color: [.8,.8,.8,1], shaderTime: 0,
  katanaMeshLocalMatrix,
});

test('the actual indexed hands GPU pass follows sampled swing pose and katana source socket', () => {
  const { gl, calls, state } = mockGl();
  const sourcePackage = pkg();
  const beforeUv = [...sourcePackage.mesh.uv0];
  const pass = createDojoPlayerAnimationPass(gl, {
    sourcePackage, rig: rig(), clips: clipBindings,
  });
  const before = state();
  const held = pass.draw(frame('held', .5));
  const swing = pass.draw(frame('swing', .5));
  assert.deepEqual(state(), before);
  assert.deepEqual(sourcePackage.mesh.uv0, beforeUv, 'source UV must not be mutated');
  assert.equal(held.sampledClip, 'heldSource');
  assert.equal(swing.sampledClip, 'swingSource');
  assert.equal(held.handsDrawCalls, 1);
  assert.equal(swing.handsDrawCalls, 1);
  assert.equal(swing.handsTriangles, 2);
  assert.equal(swing.sourcePoseSampled, true);
  assert.equal(swing.nativePlayerControllerTransitionVerified, false);
  assert.equal(swing.nativeHandsMaterialParity, false);
  assert.equal(swing.material, 'generated-web-lit-diagnostic');
  assert.equal(held.katanaModelMatrix[12], 1.5);
  assert.equal(swing.katanaModelMatrix[12], 2.0);
  assert.equal(swing.weaponBoneWorldMatrix[12], 1.75);
  assert.deepEqual(calls.filter(call => call[0] === 'draw'), [
    ['draw', gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0],
    ['draw', gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0],
  ]);
  assert.ok(calls.some(call => call[0] === 'vec4' &&
    call[1] === 'uRedCrystalControl' && call[2] === 0),
  'hands must not run the enemy Red Crystal material');
  const expected = sampleNativeSkinPalette(sourcePackage, {
    clip: 'swingSource', time: .5, playback: 'clamp',
  });
  assert.equal(expected[28], .5, 'the child deforms relative to its inverse bind');
  pass.dispose();
  assert.throws(() => pass.draw(frame('held', 0)), /Disposed/);
});

test('source pistol and non-katana items never invent first-person hands', () => {
  const { gl, calls } = mockGl();
  const pass = createDojoPlayerAnimationPass(gl, {
    sourcePackage: pkg(), rig: rig(), clips: clipBindings,
  });
  assert.equal(pass.draw({ heldItem: { isKatana: false } }), null);
  assert.equal(pass.draw({ heldItem: null }), null);
  assert.equal(calls.filter(call => call[0] === 'draw').length, 0);
  const handsOnly = pass.draw(frame('held', 0, null));
  assert.equal(handsOnly.katanaTransformReady, false);
  assert.equal(handsOnly.katanaModelMatrix, null);
  pass.dispose();
});

test('Dojo source identity, sampled clips and weapon bone must be explicit', () => {
  const { gl, calls } = mockGl();
  assert.throws(() => createDojoPlayerAnimationPass(gl, {
    sourcePackage: pkg(), rig: { ...rig(), sceneBuildIndex: 28 }, clips: clipBindings,
  }), /identity mismatch/);
  assert.throws(() => createDojoPlayerAnimationPass(gl, {
    sourcePackage: pkg(), rig: { ...rig(), weaponBoneName: 'guessed' }, clips: clipBindings,
  }), /socket must match/);
  assert.throws(() => createDojoPlayerAnimationPass(gl, {
    sourcePackage: { ...pkg(), weaponAttachment: null }, rig: rig(), clips: clipBindings,
  }), /socket must match/);
  assert.throws(() => createDojoPlayerAnimationPass(gl, {
    sourcePackage: pkg(), rig: rig(), clips: { held: 'heldSource', swing: 'invented' },
  }), /clip unavailable/);
  assert.equal(calls.filter(call => call[0] === 'draw').length, 0);
});

test('caller controls real clip seconds and the source katana offset; invalid poses fail closed', () => {
  const { gl, calls } = mockGl();
  const pass = createDojoPlayerAnimationPass(gl, {
    sourcePackage: pkg(), rig: rig(), clips: clipBindings,
  });
  assert.throws(() => pass.draw(frame('guess', .5)), /phase/);
  assert.throws(() => pass.draw(frame('swing', -1)), /clip time/);
  assert.throws(() => pass.draw({ ...frame('swing', .5), modelMatrix: translate(NaN) }),
    /modelMatrix/);
  const singular = identity();
  singular[0] = 0;
  assert.throws(() => pass.draw(frame('swing', .5, singular)), /invertible/);
  assert.equal(calls.filter(call => call[0] === 'draw').length, 0);
  pass.dispose();
});
