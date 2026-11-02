import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createNativeSkinPass, loadNativeSkinPackage, sampleNativeSkinPalette,
  sampleNativeSkinPose, sampleNativeWeaponAttachment,
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

const transitionPackage = () => sourcePackage({
  clips: {
    idle: { duration: 1, sampleRate: 1, frames: [frame(0), frame(0)] },
    walk: { duration: 1, sampleRate: 1, frames: [frame(0), frame(2)] },
    fire: { duration: 1, sampleRate: 1, frames: [frame(0), frame(0)] },
    punch: { duration: 1, sampleRate: 1,
      frames: [frame(10, [0,0,1,0]), frame(10, [0,0,1,0])] },
  },
  clipAliases: { run: 'walk' },
  states: {
    idle: { clip: 'idle', playback: 'loop', speed: 1 },
    run: { clip: 'walk', playback: 'loop', speed: 2.25 },
    fire: { clip: 'fire', playback: 'clamp', speed: 8 },
    punch: { clip: 'punch', playback: 'clamp', speed: 1 },
  },
  transitions: {
    'idle->run': {
      from: 'idle', to: 'run', duration: .1,
      source: 'synthetic fixed-duration transition',
    },
  },
  actionTiming: {
    fire: { entryDuration: .1, exitDuration: .1, exitTime: .875, hasFixedDuration: true },
    punch: { entryDuration: .1, normalExitDuration: .3, normalExitTime: .8, hasFixedDuration: true },
  },
  actionLayers: {
    fire: {
      clip: 'fire', mode: 'additive', defaultWeight: 1, mask: [1,1],
      source: 'synthetic unavailable additive layer', reference: 'synthetic frame zero',
      webComposable: false, blocker: 'synthetic Humanoid additive composition is unavailable',
    },
    punch: {
      clip: 'punch', mode: 'override', defaultWeight: 0, mask: [0,1],
      source: 'synthetic masked override layer', webComposable: true,
    },
  },
});

const precomposedFirePackage = () => {
  const pkg = transitionPackage();
  const sample = rootX => frame(rootX);
  const values = (frames, field) => frames.flatMap(value => value[field]);
  const idle = [sample(10), sample(14)];
  const walk = [sample(0), sample(4), sample(2), sample(6)];
  return {
    ...pkg,
    actionLayers: {
      ...pkg.actionLayers,
      fire: { ...pkg.actionLayers.fire, webComposable: true },
    },
    actionPrecompositions: {
      fire: {
        schemaVersion: 1,
        action: 'fire',
        composition: 'nativeHumanoidAdditivePrecomposedGrid',
        bones: [0,1],
        actionStart: 0,
        actionStep: 1,
        actionCount: 2,
        actionDuration: 1,
        layerWeights: [1],
        implicitZeroWeight: true,
        baseClips: {
          idle: {
            phaseCount: 1,
            positions: values(idle, 'positions'),
            rotations: values(idle, 'rotations'),
            scales: values(idle, 'scales'),
          },
          walk: {
            phaseCount: 2,
            positions: values(walk, 'positions'),
            rotations: values(walk, 'rotations'),
            scales: values(walk, 'scales'),
          },
          run: { alias: 'walk' },
        },
        interpolation: 'synthetic periodic base then action interpolation',
        timeDomain: { baseTime: 'source clip seconds', actionTime: 'source clip seconds' },
        evidence: { source: 'synthetic native-grid fixture' },
        heldOut: { records: 1, maxPositionComponentError: 0 },
        transitionHeldOut: { records: 1, maxPositionComponentError: 0 },
        activation: { invocation: 'synthetic fixture' },
        shootingIdleReference: { records: 1, maxPositionComponentError: 0 },
        shootingTransitionHeldOut: { combined: { records: 1, maxPositionComponentError: 0 } },
        controllerTimeline: [{ elapsed: 0, inTransition: false }],
        limits: ['synthetic fixture'],
      },
    },
  };
};
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

test('clip aliases and evidenced transition durations blend local TRS without a generic crossfade', () => {
  const pkg = transitionPackage();
  const loaded = loadNativeSkinPackage(pkg);
  assert.deepEqual(loaded.availableClips, ['idle', 'walk', 'fire', 'punch', 'run']);
  assert.deepEqual(loaded.availableTransitions, ['idle->run']);
  assert.deepEqual(loaded.availableActions, ['punch']);
  assert.deepEqual(loaded.actionTiming.fire,
    { entryDuration: .1, exitDuration: .1, exitTime: .875, hasFixedDuration: true });
  assert.equal(loaded.clips.run, loaded.clips.walk);
  const palette = sampleNativeSkinPalette(loaded, {
    clip: 'run', time: .5, playback: 'loop',
    transition: {
      fromClip: 'idle', fromTime: 0, fromPlayback: 'loop', elapsed: .05,
    },
  });
  near(Array.from(palette.slice(12, 15)), [.5,0,0]);
  assert.throws(() => sampleNativeSkinPalette(loaded, {
    clip: 'walk', time: 1, playback: 'loop',
    transition: {
      fromClip: 'idle', fromTime: 0, fromPlayback: 'loop', elapsed: .05,
    },
  }), /transition unavailable/);
});

test('masked override action preserves base locomotion outside its source-qualified bones', () => {
  const loaded = loadNativeSkinPackage(transitionPackage());
  const palette = sampleNativeSkinPalette(loaded, {
    clip: 'run', time: .5, playback: 'loop',
    action: { state: 'punch', time: 0, weight: 1 },
  });
  near(Array.from(palette.slice(12, 15)), [1,0,0]);
  near([palette[16], palette[17], palette[20], palette[21]], [-1,0,0,-1]);
  assert.throws(() => sampleNativeSkinPalette(loaded, {
    clip: 'run', time: .5, playback: 'loop',
    action: { state: 'fire', time: .25, weight: 1 },
  }), /Humanoid additive composition is unavailable/);
  assert.throws(() => sampleNativeSkinPalette(loaded, {
    clip: 'run', time: .5, playback: 'loop',
    action: { state: 'punch', time: 0, weight: .5 },
  }), TypeError);
});

test('native precomposed additive fire interpolates over locomotion and its transition', () => {
  const loaded = loadNativeSkinPackage(precomposedFirePackage());
  assert.deepEqual(loaded.availableActions, ['fire', 'punch']);
  const moving = sampleNativeSkinPalette(loaded, {
    clip: 'run', time: .25, playback: 'loop',
    action: { state: 'fire', time: .5, weight: 1 },
  });
  near(Array.from(moving.slice(12, 15)), [3,0,0]);
  const fractional = sampleNativeSkinPalette(loaded, {
    clip: 'run', time: .25, playback: 'loop',
    action: { state: 'fire', time: .5, weight: .5 },
  });
  near(Array.from(fractional.slice(12, 15)), [1.75,0,0]);
  const transitioning = sampleNativeSkinPalette(loaded, {
    clip: 'run', time: .25, playback: 'loop',
    transition: {
      fromClip: 'idle', fromTime: 0, fromPlayback: 'loop', elapsed: .05,
    },
    action: { state: 'fire', time: .5, weight: 1 },
  });
  near(Array.from(transitioning.slice(12, 15)), [7.5,0,0]);
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


test('GPU pass samples caller time, uploads one compact palette and restores host draw state', () => {
  const { gl, calls, state } = mockGl();
  const pass = createNativeSkinPass(gl, sourcePackage());
  assert.equal(pass.jointCount, 2);
  assert.equal(pass.weightedJointCount, 2);
  assert.deepEqual(pass.availableClips, ['walk']);
  const instance = pass.createInstance({ clip: 'walk', playback: 'clamp' });
  const before = state();
  pass.draw({
    instance, time: .5, modelMatrix: identity(), viewProjection: identity(), color: [.8,.1,.2,1],
  });
  assert.deepEqual(state(), before);
  assert.deepEqual(calls.filter(call => call[0] === 'draw'), [['draw', gl.TRIANGLES, 3, gl.UNSIGNED_SHORT, 0]]);
  const paletteUpload = calls.find(call => call[0] === 'matrix' && call[1] === 'uJoints[0]');
  assert.equal(paletteUpload[2].length, 32);
  near(paletteUpload[2].slice(12, 15), [1,0,0]);
  pass.dispose();
  pass.dispose();
  assert.equal(calls.filter(call => call[0] === 'deleteBuffer').length, 5);
  assert.throws(() => pass.draw({}), /disposed/);
});

test('GPU instances crossfade only through a package transition contract', () => {
  const { gl, calls } = mockGl();
  const pass = createNativeSkinPass(gl, transitionPackage());
  assert.deepEqual(pass.availableTransitions, ['idle->run']);
  assert.equal(pass.states.run.speed, 2.25);
  assert.deepEqual(pass.actionTiming.fire,
    { entryDuration: .1, exitDuration: .1, exitTime: .875, hasFixedDuration: true });
  assert.deepEqual(pass.availableActions, ['punch']);
  const idle = pass.createStateInstance('idle');
  const run = pass.createStateInstance('run');
  const report = pass.draw({
    instance: run, time: .5, modelMatrix: identity(), viewProjection: identity(),
    color: [.8,.1,.2,1], transition: { from: idle, fromTime: 0, elapsed: .05 },
  });
  const paletteUpload = calls.find(call => call[0] === 'matrix' && call[1] === 'uJoints[0]');
  near(paletteUpload[2].slice(12, 15), [.5,0,0]);
  assert.equal(report.transition, 'idle->run');
  assert.equal(report.transitionDuration, .1);
  assert.equal(report.transitionWeight, .5);
  pass.dispose();
});

test('GPU action API applies only composable masked override layers', () => {
  const { gl, calls } = mockGl();
  const pass = createNativeSkinPass(gl, transitionPackage());
  const run = pass.createStateInstance('run');
  const report = pass.draw({
    instance: run, time: .5, modelMatrix: identity(), viewProjection: identity(),
    color: [.8,.1,.2,1], action: { state: 'punch', time: 0, weight: 1 },
  });
  const paletteUpload = calls.find(call => call[0] === 'matrix' && call[1] === 'uJoints[0]');
  near(paletteUpload[2].slice(12, 15), [1,0,0]);
  assert.equal(report.action, 'punch');
  assert.equal(report.actionMode, 'override');
  assert.equal(report.actionTime, 0);
  assert.equal(report.actionWeight, 1);
  assert.throws(() => pass.draw({
    instance: run, time: .5, modelMatrix: identity(), viewProjection: identity(),
    color: [.8,.1,.2,1], action: { state: 'fire', time: .25, weight: 1 },
  }), /Humanoid additive composition is unavailable/);
  pass.dispose();
});

test('GPU fire action uses native precomposition during locomotion transition', () => {
  const { gl, calls } = mockGl();
  const pass = createNativeSkinPass(gl, precomposedFirePackage());
  const idle = pass.createStateInstance('idle');
  const run = pass.createStateInstance('run');
  const report = pass.draw({
    instance: run, time: .25, modelMatrix: identity(), viewProjection: identity(),
    color: [.8,.1,.2,1],
    transition: { from: idle, fromTime: 0, elapsed: .05 },
    action: { state: 'fire', time: .5, weight: 1 },
  });
  const paletteUpload = calls.find(call => call[0] === 'matrix' && call[1] === 'uJoints[0]');
  near(paletteUpload[2].slice(12, 15), [7.5,0,0]);
  assert.equal(report.action, 'fire');
  assert.equal(report.actionComposition, 'nativeHumanoidAdditivePrecomposedGrid');
  assert.equal(report.actionApproximation, true);
  pass.dispose();
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

test('CPU pose gives the current source socket for weapon detach, independent of drawing', () => {
  const localMatrix = identity();
  localMatrix[13] = 0.5;
  const pkg = sourcePackage({
    weaponAttachment: { bone: 'child', localMatrix, source: 'authored socket fixture',
      coordinates: 'Fixture bone-local affine transform, column-major' },
  });
  const pose = sampleNativeSkinPose(pkg, { clip: 'walk', time: 0.5, playback: 'clamp' });
  const model = identity();
  model[12] = 10;
  model[14] = 7;
  const socket = sampleNativeWeaponAttachment(pkg, model, pose.boneModelMatrices);
  near([socket[12],socket[13],socket[14]],[12,.5,7]);
  near([pose.boneModelMatrices[28]],[2]);
  // Child skin palette is offset by the inverse bind, unlike the socket.
  near([pose.palette[28]],[1]);
  assert.deepEqual(pose.palette,
    sampleNativeSkinPalette(pkg, { clip: 'walk', time: 0.5, playback: 'clamp' }));
  pose.boneModelMatrices[28] = 99;
  near([socket[12]],[12]);
});

test('socket sampling does not fabricate a detached position when source attachment is absent', () => {
  const pkg = sourcePackage();
  const pose = sampleNativeSkinPose(pkg, { clip: 'walk', time: 0, playback: 'clamp' });
  assert.equal(sampleNativeWeaponAttachment(pkg, identity(), pose.boneModelMatrices), null);
  assert.throws(() => sampleNativeWeaponAttachment(pkg, identity(), []), /components/);
});
