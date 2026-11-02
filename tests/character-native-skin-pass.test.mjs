import test from 'node:test';
import assert from 'node:assert/strict';
import { NATIVE_MATERIAL_GLSL } from '../src/render/native-material.js';
import {
  createNativeSkinPass, loadNativeSkinPackage, sampleNativeSkinPalette,
} from '../src/characters/native-skin-pass.js';

// Entirely authored two-joint triangle; no commercial geometry, rig or clip bytes.
const identity = () => [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
const inverseChildBind = () => [1,0,0,0, 0,1,0,0, 0,0,1,0, -1,0,0,1];
const frame = (rootX, childRotation = [0,0,0,1]) => ({
  positions: [rootX,0,0, 1,0,0],
  rotations: [0,0,0,1, ...childRotation],
  scales: [1,1,1, 1,1,1],
});
const sourcePackage = (overrides = {}) => ({
  schemaVersion: 1,
  source: { owner: 'synthetic-test', mesh: 1 },
  coordinates: {
    space: 'synthetic renderer-local space', axes: '+X right, +Y up, +Z forward',
    units: 'authored test units', quaternion: '[x,y,z,w]',
    boneOrder: 'parent-first; joint indices address bones',
    inverseBindMatrices: 'flat column-major matrices for WebGL',
    skinEquation: 'vertex = sum(weight * boneModelMatrix * inverseBindMatrix * meshVertex)',
    indices: 'original authored indices; one source triangle submesh',
  },
  mesh: {
    positions: [0,0,0, 1,0,0, 0,1,0],
    normals: [0,0,1, 0,0,1, 0,0,1],
    indices: [0,1,2],
    indexComponentBits: 16,
    submeshes: [{ firstIndex: 0, indexCount: 3, baseVertex: 0, topology: 0 }],
    jointIndices: [0,0,0,0, 1,0,0,0, 1,0,0,0],
    weights: [1,0,0,0, 1,0,0,0, 1,0,0,0],
    inverseBindMatrices: [...identity(), ...inverseChildBind()],
  },
  bones: [
    { name: 'root', parent: -1, position: [0,0,0], rotation: [0,0,0,1], scale: [1,1,1] },
    { name: 'child', parent: 0, position: [1,0,0], rotation: [0,0,0,1], scale: [1,1,1] },
  ],
  clips: {
    walk: { duration: 1, sampleRate: 1, frames: [frame(0), frame(2)] },
  },
  ...overrides,
});

const expectedEnemyPalettePackage = () => {
  const vertexCount = 60;
  const base = sourcePackage({ clips: {} });
  const positions = Array.from({ length: vertexCount }, (_, i) => [
    i % 3 === 1 ? 1 : 0,
    Math.floor(i / 3) + (i % 3 === 2 ? 1 : 0),
    0,
  ]).flat();
  return {
    ...base,
    mesh: {
      ...base.mesh,
      positions,
      normals: Array.from({ length: vertexCount }, () => [0,0,1]).flat(),
      indices: Array.from({ length: vertexCount }, (_, i) => i),
      submeshes: [{ firstIndex: 0, indexCount: vertexCount, baseVertex: 0, topology: 0 }],
      jointIndices: Array.from({ length: vertexCount }, (_, i) => [i,0,0,0]).flat(),
      weights: Array.from({ length: vertexCount }, () => [1,0,0,0]).flat(),
      inverseBindMatrices: Array.from({ length: 62 }, identity).flat(),
    },
    bones: Array.from({ length: 62 }, (_, i) => ({
      name: 'joint-' + i, parent: i - 1,
      position: [0,0,0], rotation: [0,0,0,1], scale: [1,1,1],
    })),
  };
};
const near = (actual, expected, tolerance = 1e-5) => {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) <= tolerance,
    `component ${index}: ${value} != ${expected[index]}`));
};

test('local sampled poses compose parent-first and inverse binds cancel the child rest offset', () => {
  const palette = sampleNativeSkinPalette(sourcePackage(), {
    clip: 'walk', time: .5, playback: 'clamp',
  });
  assert.equal(palette.length, 32);
  near(Array.from(palette.slice(12, 15)), [1,0,0]);
  near(Array.from(palette.slice(28, 31)), [1,0,0]);
});

test('quaternion samples use shortest-arc slerp rather than component lerp', () => {
  const pkg = sourcePackage({
    mesh: {
      ...sourcePackage().mesh,
      jointIndices: [1,0,0,0, 1,0,0,0, 1,0,0,0],
    },
    clips: {
      turn: {
        duration: 1, sampleRate: 1,
        frames: [frame(0), frame(0, [0,0,1,0])],
      },
    },
  });
  const palette = sampleNativeSkinPalette(pkg, { clip: 'turn', time: .5, playback: 'clamp' });
  const child = palette.slice(0, 16);
  near([child[0], child[1], child[4], child[5]], [0,1,-1,0]);
});

test('missing native clips stay explicitly unavailable; no bind-pose animation is fabricated', () => {
  const loaded = loadNativeSkinPackage(sourcePackage({ clips: {} }));
  assert.deepEqual(loaded.availableClips, []);
  assert.throws(() => sampleNativeSkinPalette(loaded, {
    clip: 'idle', time: 0, playback: 'loop',
  }), /sampled clip unavailable/);
});

test('package boundary rejects hierarchy, influence and matrix convention errors', () => {
  const badHierarchy = sourcePackage();
  badHierarchy.bones[1] = { ...badHierarchy.bones[1], parent: 1 };
  assert.throws(() => loadNativeSkinPackage(badHierarchy), /parent-first/);
  const badWeight = sourcePackage();
  badWeight.mesh.weights[0] = .5;
  assert.throws(() => loadNativeSkinPackage(badWeight), /total 1/);
  const badJoint = sourcePackage();
  badJoint.mesh.jointIndices[0] = 2;
  assert.throws(() => loadNativeSkinPackage(badJoint), /Invalid joint/);
  const badBind = sourcePackage();
  badBind.mesh.inverseBindMatrices[0] = 0;
  assert.throws(() => loadNativeSkinPackage(badBind), /Singular|unstable/);
  assert.throws(() => loadNativeSkinPackage({ ...sourcePackage(), coordinates: null }), /coordinates/);
});

function mockGl({ uniformLimit = 256 } = {}) {
  const calls = [];
  let next = 0, vao = 'host-vao', arrayBuffer = 'host-array', program = 'host-program', winding = 2305;
  const constants = {
    VERTEX_SHADER: 35633, FRAGMENT_SHADER: 35632, COMPILE_STATUS: 35713, LINK_STATUS: 35714,
    MAX_VERTEX_UNIFORM_VECTORS: 36347, VERTEX_ARRAY_BINDING: 34229,
    ARRAY_BUFFER_BINDING: 34964, CURRENT_PROGRAM: 35725, FRONT_FACE: 2886,
    CULL_FACE: 2884, ARRAY_BUFFER: 34962, ELEMENT_ARRAY_BUFFER: 34963,
    STATIC_DRAW: 35044, FLOAT: 5126, UNSIGNED_BYTE: 5121,
    TRIANGLES: 4, UNSIGNED_SHORT: 5123, UNSIGNED_INT: 5125, CW: 2304, CCW: 2305,
  };
  const attributeLocations = { aPosition: 0, aNormal: 1, aJointIndices: 2, aWeights: 3 };
  const gl = {
    ...constants,
    createShader: kind => ({ kind, id: ++next }), shaderSource: () => {}, compileShader: () => {},
    getShaderParameter: () => true, getShaderInfoLog: () => '', deleteShader: () => {},
    createProgram: () => ({ id: ++next }), attachShader: () => {}, linkProgram: () => {},
    getProgramParameter: () => true, getProgramInfoLog: () => '',
    createVertexArray: () => ({ id: ++next }), createBuffer: () => ({ id: ++next }),
    bindVertexArray: value => { vao = value; calls.push(['vao', value]); },
    bindBuffer: (target, value) => { if (target === constants.ARRAY_BUFFER) arrayBuffer = value; },
    bufferData: () => {}, enableVertexAttribArray: () => {}, vertexAttribPointer: () => {},
    vertexAttribIPointer: () => {}, getAttribLocation: (_program, name) => attributeLocations[name] ?? -1,
    getUniformLocation: (_program, name) => ({ name }),
    getParameter: key => ({
      [constants.MAX_VERTEX_UNIFORM_VECTORS]: uniformLimit,
      [constants.VERTEX_ARRAY_BINDING]: vao,
      [constants.ARRAY_BUFFER_BINDING]: arrayBuffer,
      [constants.CURRENT_PROGRAM]: program,
      [constants.FRONT_FACE]: winding,
    })[key],
    isEnabled: key => key === constants.CULL_FACE,
    useProgram: value => { program = value; calls.push(['program', value]); },
    frontFace: value => { winding = value; calls.push(['winding', value]); },
    uniformMatrix4fv: (location, _transpose, value) => calls.push(['matrix', location.name, Array.from(value)]),
    uniform3f: () => {}, uniform2f: () => {}, uniform4f: () => {},
    drawElements: (mode, count, type, offset) => calls.push(['draw', mode, count, type, offset]),
    deleteBuffer: value => calls.push(['deleteBuffer', value]),
    deleteVertexArray: value => calls.push(['deleteVao', value]),
    deleteProgram: value => calls.push(['deleteProgram', value]),
  };
  return { gl, calls, state: () => ({ vao, arrayBuffer, program, winding }) };
}

test('animated skin shader incorporates bounded shared Red Crystal output math', () => {
  const { gl, calls } = mockGl();
  const sources = [];
  const original = gl.shaderSource;
  gl.shaderSource = (shader, text) => { sources.push([shader.kind, text]); original(shader, text); };
  const pass = createNativeSkinPass(gl, sourcePackage());
  const fragment = sources.find(([kind]) => kind === gl.FRAGMENT_SHADER)?.[1];
  assert.ok(fragment?.includes(NATIVE_MATERIAL_GLSL.redCrystalOutput));
  assert.match(fragment, /nativeRedCrystalFinalOutput\\(webProceduralRgb, vec4\\(0\\.0\\), vec3\\(0\\.0\\)\\)/);
  assert.doesNotMatch(fragment, /uNativeOverlay|uNativeAdditive|sampler2D/);
  const instance = pass.createInstance({ clip: 'walk', playback: 'clamp' });
  const report = pass.draw({ instance, time: .5,
    modelMatrix: identity(), viewProjection: identity(), color: [.8,.1,.2,1] });
  assert.equal(report.redCrystalFinalCompositor, true);
  assert.equal(report.redCrystalNativeInputsVerified, false);
  assert.equal(report.materialParity, false);
  assert.equal(calls.filter(([kind]) => kind === 'draw').length, 1);
  pass.dispose();
});

test('GPU pass samples caller time, uploads one compact palette and restores host draw state', () => {
  const { gl, calls, state } = mockGl();
  const pass = createNativeSkinPass(gl, sourcePackage());
  assert.equal(pass.jointCount, 2);
  assert.equal(pass.weightedJointCount, 2);
  assert.deepEqual(pass.availableClips, ['walk']);
  const instance = pass.createInstance({ clip: 'walk', playback: 'clamp' });
  const before = state();
  const report = pass.draw({
    instance, time: .5, modelMatrix: identity(), viewProjection: identity(), color: [.8,.1,.2,1],
  });
  assert.deepEqual(state(), before);
  assert.deepEqual(calls.filter(call => call[0] === 'draw'), [['draw', gl.TRIANGLES, 3, gl.UNSIGNED_SHORT, 0]]);
  const paletteUpload = calls.find(call => call[0] === 'matrix' && call[1] === 'uJoints[0]');
  assert.equal(paletteUpload[2].length, 32);
  near(paletteUpload[2].slice(12, 15), [1,0,0]);
  assert.deepEqual(report, {
    drawCalls: 1, triangles: 1, clip: 'walk', sampledTime: .5, skinned: true,
    nativeClipSampled: true, runtimeEnemyInstanceVerified: false,
    materialParity: false, redCrystalFinalCompositor: true,
    redCrystalNativeInputsVerified: false, lightingProvenance: 'generated-web',
  });
  pass.dispose();
  pass.dispose();
  assert.equal(calls.filter(call => call[0] === 'deleteBuffer').length, 5);
  assert.throws(() => pass.draw({}), /disposed/);
});

test('62 hierarchy bones compact to the verified 60 weighted uniform matrices', () => {
  const { gl } = mockGl({ uniformLimit: 256 });
  const pass = createNativeSkinPass(gl, expectedEnemyPalettePackage());
  assert.equal(pass.jointCount, 62);
  assert.equal(pass.weightedJointCount, 60);
  pass.dispose();
  const constrained = mockGl({ uniformLimit: 250 }).gl;
  assert.throws(() => createNativeSkinPass(constrained, expectedEnemyPalettePackage()),
    /needs 251 vertex uniform vectors/);
});

test('GPU pass refuses unsupported palette size before compiling or drawing', () => {
  const { gl } = mockGl({ uniformLimit: 18 });
  assert.throws(() => createNativeSkinPass(gl, sourcePackage()), /uniform vectors/);
});
