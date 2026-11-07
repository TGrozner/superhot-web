import test from 'node:test';
import { createNativeActorSkinRuntime } from '../src/characters/native-actor-skin.js';
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
    uniform3f: () => {}, uniform2f: () => {},
    uniform4f: (location, first, second) => {
      if (location.name === 'uWebHitFlash') calls.push(['hitFlash', location.name, first, second]);
    },
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


test('solved per-actor pose drives compact GPU palette, world weapon socket and bone hit pose together', () => {
  // This is a wholly authored two-bone triangle, NOT a native rig or a
  // claimed Dojo ragdoll. Bone child has inverse bind translation -1.
  const pkg = sourcePackage({
    weaponAttachment: {
      bone: 'child', localMatrix: identity(),
      source: { owner: 'synthetic-test', weapon: 'child' },
      coordinates: { space: 'synthetic model-local' },
    },
  });
  const { gl, calls } = mockGl();
  const pass = createNativeSkinPass(gl, pkg);
  const instance = pass.createInstance({ clip: 'walk', playback: 'clamp' });
  const world = identity();
  world[12] = 10;
  const root = identity(), child = identity();
  root[12] = 3;
  child[12] = 5;
  const solvedPose = {
    rig: pass.rig, provenance: 'synthetic two-bone solved frame',
    boneModelMatrices: new Float32Array([...root, ...child]),
  };
  const drawn = pass.draw({
    instance, modelMatrix: world, viewProjection: identity(), time: .25,
    color: [.8,.1,.2,1], solvedPose,
  });
  const palette = calls.filter(c => c[0] === 'matrix' && c[1] === 'uJoints[0]').at(-1)[2];
  // Bone 1 must apply inverse bind (-1), NOT upload the global +5 directly.
  near([palette[12], palette[28]], [3,4]);
  near([drawn.boneModelMatrices[12], drawn.boneModelMatrices[28]], [3,5]);
  near([drawn.weaponAttachmentMatrix[12]], [15]);
  assert.equal(drawn.solvedPoseApplied, true);
  assert.equal(drawn.nativeClipSampled, false);
  assert.equal(drawn.solvedPoseProvenance, solvedPose.provenance);

  // Missing solvedPose falls back to existing sampled native clip, not a
  // previous actor's borrowed bone buffer (or a frozen death pose).
  const fallback = pass.draw({
    instance, modelMatrix: world, viewProjection: identity(), time: .5,
    color: [.8,.1,.2,1],
  });
  const fallbackPalette = calls.filter(c => c[0] === 'matrix' && c[1] === 'uJoints[0]').at(-1)[2];
  near([fallbackPalette[12], fallbackPalette[28]], [1,1]);
  near([fallback.weaponAttachmentMatrix[12]], [12]);
  assert.equal(fallback.nativeClipSampled, true);
  assert.equal(fallback.solvedPoseApplied, false);
  pass.dispose();
});

test('solved pose refuses wrong rig, invalid affine bones and double clip overlays before GPU draw', () => {
  const pkg = sourcePackage();
  const { gl, calls } = mockGl();
  const pass = createNativeSkinPass(gl, pkg);
  const instance = pass.createInstance({ clip: 'walk', playback: 'clamp' });
  const input = {
    instance, modelMatrix: identity(), viewProjection: identity(), time: .5,
    color: [.8,.1,.2,1],
  };
  const matrices = new Float32Array([...identity(), ...identity()]);
  const right = { rig: pass.rig, provenance: 'synthetic solved pose', boneModelMatrices: matrices };
  const drawCount = () => calls.filter(c => c[0] === 'draw').length;
  const initial = drawCount();
  assert.throws(() => pass.draw({ ...input, solvedPose: { ...right, rig: { ...pass.rig } } }),
    /rig identity/);
  assert.throws(() => pass.draw({ ...input, solvedPose: { ...right, provenance: '' } }),
    /provenance/);
  assert.throws(() => pass.draw({ ...input, solvedPose: right,
    transition: { from: instance, fromTime: 0, elapsed: .2 } }), /no clip transition/);
  const invalid = new Float32Array(matrices);
  invalid[16 + 5] = 0;
  assert.throws(() => pass.draw({ ...input, solvedPose: { ...right, boneModelMatrices: invalid } }),
    /singular|unstable/i);
  const inf = new Float32Array(matrices);
  inf[28] = Infinity;
  assert.throws(() => pass.draw({ ...input, solvedPose: { ...right, boneModelMatrices: inf } }),
    /finite/);
  assert.equal(drawCount(), initial, 'all bad solved poses rejected without issuing a draw');
  pass.dispose();
});

test('per-actor real GPU draws use source states, action, transition and solved death socket without sharing poses', () => {
  const { gl, calls } = mockGl();
  const pkg = transitionPackage();
  pkg.weaponAttachment = {
    bone: 'child', localMatrix: identity(),
    source: 'synthetic source-bone attachment', coordinates: 'synthetic mesh-local transform',
  };
  const pass = createNativeSkinPass(gl, pkg);
  const actors = createNativeActorSkinRuntime(pass);
  const draw = (actorId, pose) => actors.drawActor({
    actorId, pose, modelMatrix: identity(), viewProjection: identity(),
    color: [.8,.1,.2,1],
  });
  const first = draw('enemy-A', { state: 'idle', time: 0 });
  const firstSocket = Array.from(first.weaponAttachmentMatrix);
  const second = draw('enemy-B', {
    state: 'run', time: .2,
    transition: { from: { state: 'idle', time: 0 }, elapsed: .05 },
  });
  assert.equal(second.sampledTime, .2 * 2.25);
  assert.equal(second.transition, 'idle->run');
  assert.equal(second.transitionWeight, .5);
  assert.equal(second.actorId, 'enemy-B');
  assert.equal(second.actorSourceSelection.kind, 'state');
  assert.notEqual(first.boneModelMatrices, second.boneModelMatrices);
  assert.notDeepEqual(Array.from(first.boneModelMatrices), Array.from(second.boneModelMatrices));

  // A third actor's recovered, MODEL-space final pose, not a guessed death
  // clip. The child global X=5 and inverse bind X=-1 require GPU palette X=4;
  // the matching weapon socket must still use X=5, not the palette X=4.
  const finalChild = identity();
  finalChild[12] = 5;
  const death = draw('enemy-C', {
    state: 'idle', time: 0,
    solvedPose: {
      rig: pass.rig, provenance: 'synthetic source-qualified death receipt',
      boneModelMatrices: new Float32Array([...identity(), ...finalChild]),
    },
  });
  const palettes = calls.filter(call => call[0] === 'matrix' && call[1] === 'uJoints[0]');
  assert.equal(palettes.length, 3);
  near(palettes[2][2].slice(28, 31), [4,0,0]);
  near(Array.from(death.weaponAttachmentMatrix.slice(12, 15)), [5,0,0]);
  assert.equal(death.solvedPoseApplied, true);
  assert.equal(death.nativeActorControllerExecutionVerified, false);
  assert.equal(death.actorPoseOwnedSnapshot, true);
  assert.deepEqual(Array.from(first.weaponAttachmentMatrix), firstSocket);
  assert.deepEqual(Array.from(first.boneModelMatrices.slice(12, 15)), [0,0,0]);
  assert.notEqual(first.weaponAttachmentMatrix, second.weaponAttachmentMatrix);

  const attack = draw('enemy-A', {
    state: 'run', time: .2,
    action: { state: 'punch', time: 0, weight: 1 },
  });
  assert.equal(attack.action, 'punch');
  assert.equal(calls.filter(call => call[0] === 'draw').length, 4);
  assert.deepEqual(Array.from(first.weaponAttachmentMatrix), firstSocket);

  assert.throws(() => draw('enemy-X', { clip: 'not-in-rig', playback: 'loop', time: 0 }),
    /sampled clip unavailable/);
  assert.throws(() => draw('enemy-X', {
    clip: 'walk', playback: 'loop', time: .2,
    transition: { from: { state: 'idle', time: 0 }, elapsed: .05 },
  }), /transition unavailable/);
  assert.throws(() => draw('enemy-X', {
    state: 'run', time: .2, action: { state: 'fire', time: 0, weight: 1 },
  }), /action unavailable/);
  assert.equal(calls.filter(call => call[0] === 'draw').length, 4);
  pass.dispose();
});

test('Web-only hit/melee accents lean the real sampled GPU rig, socket and hit pose per actor', () => {
  const pkg = transitionPackage();
  // Authored source-neutral clips: nothing from the commercial game.
  pkg.clips.hit = { duration: 1, sampleRate: 1, frames: [frame(0), frame(0)] };
  pkg.states.hit = { clip: 'hit', playback: 'clamp', speed: 1 };
  pkg.weaponAttachment = {
    bone: 'child', localMatrix: identity(),
    source: 'synthetic test socket', coordinates: 'synthetic local frame',
  };
  const { gl, calls } = mockGl();
  const pass = createNativeSkinPass(gl, pkg);
  const actors = createNativeActorSkinRuntime(pass);
  const draw = (actorId, pose) => actors.drawActor({
    actorId, pose, modelMatrix: identity(), viewProjection: identity(),
    color: [.8, .1, .2, 1],
  });

  const baseline = draw(1, { state: 'hit', time: 0 });
  const originalSocket = Array.from(baseline.weaponAttachmentMatrix);
  near(originalSocket.slice(12, 15), [1, 0, 0]);
  assert.equal(baseline.actorWebPoseReaction, null);
  assert.equal(baseline.webPoseLeanApplied, false);

  const struck = draw(1, { state: 'hit', time: .16 });
  assert.equal(struck.actorWebPoseReaction.kind, 'hit');
  assert.equal(struck.webPoseLeanApplied, true);
  assert.ok(struck.weaponAttachmentMatrix[13] > .1);
  assert.ok(struck.boneModelMatrices[16 + 13] > .1);
  const hitPalette = calls.filter(call => call[0] === 'matrix' && call[1] === 'uJoints[0]').at(-1)[2];
  assert.ok(hitPalette[16 + 1] > .1, 'GPU skin rotation follows the same lean as collision/socket');

  const opposite = draw(2, { state: 'hit', time: .16 });
  assert.ok(opposite.weaponAttachmentMatrix[13] < -.1, 'distinct actors react in opposite directions');
  near(Array.from(baseline.weaponAttachmentMatrix), originalSocket);
  assert.ok(struck.weaponAttachmentMatrix[13] > .1, 'owned receipt survives the other actor draw');

  const melee = draw(1, { state: 'punch', time: .18 });
  assert.equal(melee.actorWebPoseReaction.kind, 'punch');
  assert.equal(melee.webPoseLeanApplied, true);
  assert.notDeepEqual(Array.from(melee.boneModelMatrices), Array.from(baseline.boneModelMatrices));

  const recovered = draw(1, { state: 'hit', time: .36 });
  assert.equal(recovered.actorWebPoseReaction, null);
  near(Array.from(recovered.weaponAttachmentMatrix), originalSocket);

  const finalChild = identity();
  finalChild[12] = 1;
  const solved = draw(1, {
    state: 'hit', time: .16,
    solvedPose: { rig: pass.rig, provenance: 'synthetic death pose',
      boneModelMatrices: new Float32Array([...identity(), ...finalChild]) },
  });
  assert.equal(solved.solvedPoseApplied, true);
  assert.equal(solved.webPoseLeanApplied, false, 'Web accent must never modify ragdoll/death pose');
  near(Array.from(solved.weaponAttachmentMatrix), originalSocket);

  const before = calls.filter(call => call[0] === 'draw').length;
  assert.throws(() => pass.draw({
    instance: pass.createInstance({ clip: 'hit', playback: 'clamp' }),
    modelMatrix: identity(), viewProjection: identity(),
    color: [.8, .1, .2, 1], time: .16,
    webPoseLean: { pitch: 100, roll: 0 },
  }), /bounded pitch\/roll/);
  assert.equal(calls.filter(call => call[0] === 'draw').length, before);
  pass.dispose();
});

test('source fire action produces a visible post-shot Web recoil without moving the firing-edge muzzle', () => {
  const pkg = precomposedFirePackage();
  pkg.weaponAttachment = {
    bone: 'child', localMatrix: identity(),
    source: 'synthetic recoil test', coordinates: 'synthetic local frame',
  };
  const { gl, calls } = mockGl();
  const pass = createNativeSkinPass(gl, pkg);
  const actors = createNativeActorSkinRuntime(pass);
  const frameAt = (actorId, time, blend = 1) => actors.drawActor({
    actorId,
    pose: { state: 'idle', time: 0,
      action: { state: 'fire', time, weight: 1, blend } },
    modelMatrix: identity(), viewProjection: identity(),
    color: [.8, .1, .2, 1],
  });

  const atShot = frameAt('enemy-A', 0);
  assert.equal(atShot.actorWebPoseReaction, null,
    'shot time zero must retain the original source muzzle aim');
  assert.equal(atShot.webPoseLeanApplied, false);
  const shotSocket = Array.from(atShot.weaponAttachmentMatrix);

  const recoiling = frameAt('enemy-A', .15);
  assert.equal(recoiling.actorWebPoseReaction.kind, 'fire');
  assert.ok(recoiling.actorWebPoseReaction.pitch > .1);
  assert.equal(recoiling.webPoseLeanApplied, true);
  assert.ok(Math.abs(recoiling.weaponAttachmentMatrix[13] - shotSocket[13]) > .03,
    'recoil must move the actual rendered weapon socket in world space');
  assert.ok(Math.abs(recoiling.boneModelMatrices[16 + 13]) > .03,
    'live model-space bones for hitboxes follow the GPU recoil');
  const palette = calls.filter(call => call[0] === 'matrix' && call[1] === 'uJoints[0]').at(-1)[2];
  assert.ok(Math.abs(palette[16 + 1]) > .03,
    'the weighted GPU palette rotates with the same receipt');

  const opposite = frameAt('enemy-B', .15);
  assert.ok(recoiling.actorWebPoseReaction.roll * opposite.actorWebPoseReaction.roll < 0,
    'opposite stable actor IDs produce distinct recoil silhouettes');
  near(Array.from(atShot.weaponAttachmentMatrix), shotSocket);
  assert.notEqual(opposite.weaponAttachmentMatrix, recoiling.weaponAttachmentMatrix);

  const suppressed = frameAt('enemy-A', .15, 0);
  assert.equal(suppressed.actorWebPoseReaction, null,
    'source action blend zero must not introduce procedural recoil');
  const settled = frameAt('enemy-A', .9);
  assert.equal(settled.actorWebPoseReaction, null);
  assert.equal(settled.webPoseLeanApplied, false);
  assert.equal(calls.filter(call => call[0] === 'draw').length, 5);
  pass.dispose();
});


test('Web-only impact glow hits the actual GPU material once, fades, and spares ragdolls', () => {
  const pkg = transitionPackage();
  pkg.clips.hit = { duration: 1, sampleRate: 1, frames: [frame(0), frame(0)] };
  pkg.states.hit = { clip: 'hit', playback: 'clamp', speed: 1 };
  const { gl, calls } = mockGl();
  const pass = createNativeSkinPass(gl, pkg);
  const actors = createNativeActorSkinRuntime(pass);
  const draw = (time, solvedPose = null) => actors.drawActor({
    actorId: 'enemy-impact',
    pose: { state: 'hit', time, ...(solvedPose ? { solvedPose } : {}) },
    modelMatrix: identity(), viewProjection: identity(), color: [.8, .1, .2, 1],
  });
  const impact = draw(0);
  assert.equal(impact.actorWebHitFlash, 1, 'accepted hit begins white-hot');
  assert.equal(impact.webHitFlashIntensity, 1);
  assert.equal(impact.webHitFlashDesign, 'Web-only white-hot damage pulse');
  const fading = draw(.11);
  assert.ok(fading.actorWebHitFlash > .2 && fading.actorWebHitFlash < .3);
  const settled = draw(.22);
  assert.equal(settled.actorWebHitFlash, 0);
  const solved = draw(.05, { rig: pass.rig, provenance: 'authored death fixture',
    boneModelMatrices: new Float32Array([...identity(), ...identity()]) });
  assert.equal(solved.actorWebHitFlash, 0, 'ragdoll never flashes from the hit pose');
  assert.deepEqual(calls.filter(call => call[0] === 'hitFlash' && call[1] === 'uWebHitFlash')
    .map(call => call[2]), [1, fading.actorWebHitFlash, 0, 0]);
  assert.equal(calls.filter(call => call[0] === 'draw').length, 4,
    'the full-body crystal hit pulse requires no second draw');
  assert.throws(() => pass.draw({
    instance: pass.createStateInstance('hit'), time: 0,
    modelMatrix: identity(), viewProjection: identity(), color: [.8,.1,.2,1],
    webHitFlash: 2,
  }), /hit flash must be a finite intensity/);
  pass.dispose();
});


test('Web locomotion bank follows live per-actor strafing while sparing shots, teleports and ragdolls', () => {
  const pkg = precomposedFirePackage();
  pkg.weaponAttachment = {
    bone: 'child', localMatrix: identity(),
    source: 'synthetic test socket', coordinates: 'synthetic local frame',
  };
  const { gl, calls } = mockGl();
  const pass = createNativeSkinPass(gl, pkg);
  const actors = createNativeActorSkinRuntime(pass);
  const draw = (actorId, x, z, clock, extra = {}) => {
    const matrix = identity();
    matrix[12] = x;
    matrix[14] = z;
    return actors.drawActor({
      actorId, pose: { state: 'run', time: Math.max(0, clock - .85), ...extra },
      modelMatrix: matrix, viewProjection: identity(),
      shaderTime: clock, color: [.8, .1, .2, 1],
    });
  };

  const first = draw('strafing', 0, 0, 1);
  assert.equal(first.actorWebPoseReaction, null, 'no invented movement on first frame');
  const leaning = draw('strafing', .28, .15, 1.1);
  assert.equal(leaning.actorWebPoseReaction.kind, 'locomotion');
  assert.ok(leaning.actorWebPoseReaction.roll < -.1);
  assert.ok(leaning.actorWebPoseReaction.pitch < -.02);
  assert.equal(leaning.webPoseLeanApplied, true);
  const fresh = draw('fresh', .28, .15, 1.1);
  assert.equal(fresh.webPoseLeanApplied, false, 'other actor has independent history');
  assert.notDeepEqual(Array.from(leaning.boneModelMatrices), Array.from(fresh.boneModelMatrices));
  assert.ok(Math.abs(leaning.weaponAttachmentMatrix[13] - fresh.weaponAttachmentMatrix[13]) > .05,
    'weapon socket follows the same banked bones, not a separate visual transform');
  const uploaded = calls.filter(call => call[0] === 'matrix' && call[1] === 'uJoints[0]');
  assert.equal(uploaded.length, 3, 'GPU palette is submitted once per real enemy draw');

  const shot = draw('strafing', .55, .30, 1.2, {
    action: { state: 'fire', time: 0, weight: 1, blend: 1 },
  });
  assert.equal(shot.actorWebPoseReaction, null,
    'no strafe banking on the real firing edge: deferred muzzle aim is preserved');
  assert.equal(shot.webPoseLeanApplied, false);

  assert.equal(draw('strafing', 40, 0, 1.3).actorWebPoseReaction, null,
    'teleport cannot create a fake dramatic bank');
  assert.equal(draw('strafing', 40.2, 0, 1.65).actorWebPoseReaction, null,
    'paused or delayed frames are not velocity samples');
  assert.equal(draw('strafing', 40.3, 0, 0).actorWebPoseReaction, null,
    'REJOUER rewinds the clock without carrying old momentum');

  const death = draw('strafing', 40.3, 0, .1, {
    solvedPose: { rig: pass.rig, provenance: 'synthetic ragdoll frame',
      boneModelMatrices: new Float32Array([...identity(), ...identity()]) },
  });
  assert.equal(death.webPoseLeanApplied, false);
  assert.equal(draw('strafing', 40.4, 0, .2).actorWebPoseReaction, null,
    'externally solved ragdoll clears this actor movement history');
  assert.equal(calls.filter(call => call[0] === 'draw').length, 9);
  pass.dispose();
});


test('Web J3 sentry breathing and real turning animate the same GPU bones/socket without disturbing fire or death', () => {
  const pkg = precomposedFirePackage();
  pkg.weaponAttachment = {
    bone: 'child', localMatrix: identity(),
    source: 'authored J3 fixture', coordinates: 'test bone local',
  };
  const { gl, calls } = mockGl();
  const pass = createNativeSkinPass(gl, pkg);
  const actors = createNativeActorSkinRuntime(pass);
  const draw = (actorId, poseTime, shaderTime, heading = 0, extra = {}) => {
    const model = identity();
    model[0] = Math.cos(heading);
    model[2] = -Math.sin(heading);
    model[8] = Math.sin(heading);
    model[10] = Math.cos(heading);
    return actors.drawActor({
      actorId, pose: { state: 'idle', time: poseTime, ...extra },
      modelMatrix: model, viewProjection: identity(), shaderTime,
      color: [.8, .1, .2, 1],
    });
  };

  const first = draw('enemy-1', 0, 1);
  assert.equal(first.actorWebPoseReaction, null, 'fresh idle state should not snap');
  const breathing = draw('enemy-1', .55, 1.1);
  assert.equal(breathing.actorWebPoseReaction.kind, 'idle');
  assert.equal(breathing.webPoseLeanApplied, true);
  assert.ok(Math.abs(breathing.weaponAttachmentMatrix[13] - first.weaponAttachmentMatrix[13]) > .002,
    'subtle idle movement must reach the same sampled weapon socket as the GPU pose');
  assert.notDeepEqual(Array.from(breathing.boneModelMatrices), Array.from(first.boneModelMatrices));

  const turning = draw('enemy-1', .65, 1.2, .25);
  assert.equal(turning.actorWebPoseReaction.kind, 'turn');
  assert.ok(Math.abs(turning.actorWebPoseReaction.roll) > .06,
    'actual heading change must trigger a readable, bounded body bank');
  assert.ok(Math.abs(turning.actorWebPoseReaction.roll) <= .18);
  const separate = draw('enemy-2', .65, 1.2);
  assert.equal(separate.actorWebPoseReaction.kind, 'idle',
    'another actor must not inherit the first guard heading history');

  const snap = draw('enemy-1', .75, 1.3, 2.8);
  assert.notEqual(snap.actorWebPoseReaction?.kind, 'turn',
    'a sudden orientation snap cannot be mistaken for a physical turn');
  const shot = draw('enemy-1', .8, 1.4, 2.8, {
    action: { state: 'fire', time: 0, weight: 1, blend: 1 },
  });
  assert.equal(shot.actorWebPoseReaction, null,
    'the firing edge must preserve source muzzle aim, without idle or turn banking');
  const death = draw('enemy-1', .85, 1.5, 2.8, {
    solvedPose: { rig: pass.rig, provenance: 'authored solved J3 fixture',
      boneModelMatrices: new Float32Array([...identity(), ...identity()]) },
  });
  assert.equal(death.webPoseLeanApplied, false, 'ragdolls remain fully source-driven');
  assert.equal(death.actorWebPoseReaction, null);
  assert.equal(calls.filter(call => call[0] === 'draw').length, 7,
    'no extra draw calls or fabricated meshes for Web-only pose accents');
  pass.dispose();
});

test('Web J4 gunshot glow uses accepted fire actions and never tints a solved death', () => {
  const { gl, calls } = mockGl();
  const pass = createNativeSkinPass(gl, precomposedFirePackage());
  const actors = createNativeActorSkinRuntime(pass);
  const fire = (time, blend = 1) => actors.drawActor({
    actorId: 'source-fire-guard',
    pose: { state: 'idle', time: .4,
      action: { state: 'fire', time, weight: 1, blend } },
    modelMatrix: identity(), viewProjection: identity(), color: [.8, .1, .2, 1],
  });

  assert.equal(fire(0, 0).actorWebFireGlow, 0, 'action blend zero has no pre-shot flash');
  const glowing = fire(.08);
  assert.ok(glowing.actorWebFireGlow > .45 && glowing.actorWebFireGlow < 1);
  assert.equal(glowing.webFireGlowIntensity, glowing.actorWebFireGlow);
  assert.equal(glowing.webFireGlowDesign, 'Web-only warm discharge afterglow');
  assert.equal(glowing.actorWebHitFlash, 0, 'fire never masquerades as damage');
  const continued = fire(.3);
  assert.ok(continued.actorWebFireGlow > 0 && continued.actorWebFireGlow < glowing.actorWebFireGlow,
    'source fire speed cannot compress a readable Web glow to a couple of frames');
  assert.equal(fire(.08, 0).actorWebFireGlow, 0, 'no action blend = no fire glow');
  const settled = actors.drawActor({
    actorId: 'source-fire-guard', pose: { state: 'idle', time: .6 },
    modelMatrix: identity(), viewProjection: identity(), color: [.8, .1, .2, 1],
  });
  assert.equal(settled.actorWebFireGlow, 0, 'flare stops once the accepted fire action ends');
  const dead = actors.drawActor({
    actorId: 'source-fire-guard',
    pose: { state: 'idle', time: .4, solvedPose: {
      rig: pass.rig, provenance: 'authored J4 fixture',
      boneModelMatrices: new Float32Array([...identity(), ...identity()]),
    } },
    modelMatrix: identity(), viewProjection: identity(), color: [.8, .1, .2, 1],
  });
  assert.equal(dead.actorWebFireGlow, 0, 'solved ragdoll receives no glow');
  const uniforms = calls.filter(call => call[0] === 'hitFlash' && call[1] === 'uWebHitFlash');
  assert.deepEqual(uniforms.map(call => call[3]),
    [0, glowing.actorWebFireGlow, continued.actorWebFireGlow, 0, 0, 0]);
  assert.equal(calls.filter(call => call[0] === 'draw').length, 6,
    'afterglow uses existing single GPU skin draw');
  assert.throws(() => pass.draw({
    instance: pass.createStateInstance('idle'), time: .1,
    modelMatrix: identity(), viewProjection: identity(), color: [.8, .1, .2, 1],
    webFireGlow: 2,
  }), /fire glow must be a finite intensity/);
  pass.dispose();
});

test('Web hit stagger follows the actual rendered facing and live player camera, not actor parity', () => {
  const pkg = transitionPackage();
  pkg.clips.hit = { duration: 1, sampleRate: 1, frames: [frame(0), frame(0)] };
  pkg.states.hit = { clip: 'hit', playback: 'clamp', speed: 1 };
  pkg.weaponAttachment = {
    bone: 'child', localMatrix: identity(),
    source: 'authored socket fixture', coordinates: 'authored local frame',
  };
  const { gl, calls } = mockGl();
  const pass = createNativeSkinPass(gl, pkg);
  const actors = createNativeActorSkinRuntime(pass);
  const draw = (cameraPosition, modelMatrix = identity(), solvedPose = null) =>
    actors.drawActor({
      actorId: 'same-actor',
      pose: { state: 'hit', time: .11, ...(solvedPose ? { solvedPose } : {}) },
      cameraPosition, modelMatrix, viewProjection: identity(), color: [.8, .1, .2, 1],
    });

  const fromRight = draw([4, 1, 0]);
  const fromLeft = draw([-4, 1, 0]);
  assert.equal(fromRight.actorWebPoseReaction.hitDirectionProvenance,
    'Web camera-facing proxy, not contact origin');
  assert.ok(fromRight.actorWebPoseReaction.roll > .2);
  assert.ok(fromLeft.actorWebPoseReaction.roll < -.2);
  assert.ok(fromRight.actorWebPoseReaction.yaw < -.15,
    'right-side hits twist away from the player');
  assert.ok(fromLeft.actorWebPoseReaction.yaw > .15,
    'left-side hits twist in the opposite direction');
  assert.ok(fromRight.weaponAttachmentMatrix[8] < -.1 &&
    fromLeft.weaponAttachmentMatrix[8] > .1,
    'the weapon socket inherits the directional torso twist');
  assert.ok(fromRight.weaponAttachmentMatrix[13] > .2);
  assert.ok(fromLeft.weaponAttachmentMatrix[13] < -.2);
  assert.ok(fromRight.boneModelMatrices[16 + 13] > .2,
    'socket and bone matrix must share the GPU pose');
  const front = draw({ x: 0, y: 1, z: 4 });
  const rear = draw({ x: 0, y: 1, z: -4 });
  assert.ok(front.actorWebPoseReaction.pitch < -.15, 'frontal impact throws shoulders back');
  assert.ok(rear.actorWebPoseReaction.pitch > .15, 'rearward hit throws shoulders forward');

  const turn = [0,0,-1,0, 0,1,0,0, 1,0,0,0, 0,0,0,1];
  const rotated = draw([4, 1, 0], turn);
  assert.ok(rotated.actorWebPoseReaction.pitch < -.15,
    'camera direction is projected into the rotated enemy basis');
  const fallback = draw(null);
  assert.equal(fallback.actorWebPoseReaction.hitDirectionProvenance, 'actor-id fallback');
  const overlapping = draw([0, 1, 0]);
  assert.equal(overlapping.actorWebPoseReaction.hitDirectionProvenance, 'actor-id fallback');

  const solved = draw([4, 1, 0], identity(), {
    rig: pass.rig, provenance: 'authored death fixture',
    boneModelMatrices: new Float32Array([...identity(), ...identity()]),
  });
  assert.equal(solved.actorWebPoseReaction, null, 'ragdoll owns its own pose');
  assert.equal(solved.webPoseLeanApplied, false);
  assert.equal(calls.filter(call => call[0] === 'draw').length, 8,
    'no added render passes for direction-aware impact feedback');
  pass.dispose();
});

test('Web inertial bank survives a real source gait blend but yields to actions', () => {
  const pkg = precomposedFirePackage();
  pkg.transitions['run->idle'] = {
    from: 'run', to: 'idle', duration: .1, source: 'authored gait blend',
  };
  pkg.weaponAttachment = {
    bone: 'child', localMatrix: identity(),
    source: 'synthetic inertial test socket', coordinates: 'synthetic bone local',
  };
  const { gl, calls } = mockGl();
  const pass = createNativeSkinPass(gl, pkg);
  const actors = createNativeActorSkinRuntime(pass);
  const draw = (actorId, state, x, z, clock, transition = null, stateTime = null) => {
    const model = identity();
    model[12] = x;
    model[14] = z;
    return actors.drawActor({
      actorId, pose: { state, time: stateTime ?? Math.max(0, clock - .6),
        ...(transition ? { transition } : {}) },
      modelMatrix: model, viewProjection: identity(), shaderTime: clock,
      color: [.8, .1, .2, 1],
    });
  };
  assert.equal(draw('guard', 'run', 0, 0, 1).actorWebPoseReaction, null);
  const moving = draw('guard', 'run', .28, .15, 1.1);
  assert.equal(moving.actorWebPoseReaction.kind, 'locomotion');
  assert.ok(moving.actorWebPoseReaction.roll < -.1);
  const paused = draw('guard', 'run', .28, .15, 1.1);
  assert.deepEqual(Array.from(paused.boneModelMatrices), Array.from(moving.boneModelMatrices),
    'zero game-time must not snap the previously banked GPU pose to upright');
  assert.deepEqual(Array.from(paused.weaponAttachmentMatrix),
    Array.from(moving.weaponAttachmentMatrix),
    'held source pose, weapon socket and hitboxes must freeze together');
  const settling = draw('guard', 'idle', .28, .15, 1.2,
    {from: {state: 'run', time: .5}, elapsed: 0}, 0);
  assert.equal(settling.actorWebPoseReaction.kind, 'turn');
  assert.equal(settling.actorWebPoseReaction.roll, moving.actorWebPoseReaction.roll,
    'a REAL source run->idle blend must keep the Web bank on the blended palette');
  assert.equal(settling.webPoseLeanApplied, true);
  const settled = draw('guard', 'idle', .28, .15, 1.3,
    {from: {state: 'run', time: .525}, elapsed: .025}, .025);
  assert.equal(settled.actorWebPoseReaction.kind, 'turn');
  assert.ok(Math.abs(settled.actorWebPoseReaction.roll) <
    Math.abs(settling.actorWebPoseReaction.roll),
    'the following source-blend frame settles bank using real world-state time');
  const transitioning = draw('guard', 'run', .48, .15, 1.4,
    {from: {state: 'idle', time: .025}, elapsed: 0}, 0);
  assert.equal(transitioning.actorWebPoseReaction.kind, 'locomotion');
  assert.equal(transitioning.actorWebPoseReaction.roll, settled.actorWebPoseReaction.roll,
    'idle->run blend preserves the last rendered offset without a snap to zero');
  const resumed = draw('guard', 'run', .68, .15, 1.5,
    {from: {state: 'idle', time: .05}, elapsed: .05}, .05);
  assert.equal(resumed.actorWebPoseReaction.kind, 'locomotion');
  assert.ok(Number.isFinite(resumed.actorWebPoseReaction.roll) &&
    Math.abs(resumed.actorWebPoseReaction.roll) > .012,
    'transition continues an already-banked GPU actor without adding another pass');
  assert.equal(draw('other', 'run', .68, .15, 1.5).actorWebPoseReaction, null,
    'new actors cannot inherit banking from other actor IDs');
  assert.equal(calls.filter(call => call[0] === 'draw').length, 8,
    'inertial pose uses the existing skin draw, not additional GPU passes');
  pass.dispose();
});

test('Web J4 slow-motion locomotion banks on world time, not unrelated crystal shader time', () => {
  const { gl, calls } = mockGl();
  const pass = createNativeSkinPass(gl, precomposedFirePackage());
  const actors = createNativeActorSkinRuntime(pass);
  const draw = (actorId, x, poseTime, shaderTime) => {
    const model = identity();
    model[12] = x;
    return actors.drawActor({
      actorId, pose: { state: 'run', time: poseTime },
      modelMatrix: model, viewProjection: identity(),
      shaderTime, color: [.8, .1, .2, 1],
    });
  };
  assert.equal(draw('slow-guard', 0, .4, 1).actorWebPoseReaction, null);
  const slow = draw('slow-guard', .125, .45, 1.5);
  assert.equal(slow.actorWebPoseReaction?.kind, 'locomotion',
    '10x shader-clock advance must not discard real pose-world movement');
  assert.ok(slow.actorWebPoseReaction.roll < -.04,
    'actor visibly banks with world velocity despite 10x slowed world time');
  const paused = draw('slow-guard', .125, .45, 2);
  assert.equal(paused.actorWebPoseReaction.roll, slow.actorWebPoseReaction.roll,
    'shader-only time advances cannot settle or unfreeze a game-time pose');
  assert.deepEqual(Array.from(paused.boneModelMatrices), Array.from(slow.boneModelMatrices),
    'the GPU pose and collision bones remain frozen together');

  assert.equal(draw('normal-guard', 0, .4, 1).actorWebPoseReaction, null);
  const normal = draw('normal-guard', .125, .45, 1.05);
  assert.ok(Math.abs(normal.actorWebPoseReaction.roll - slow.actorWebPoseReaction.roll) < 1e-9,
    'identical world motion has identical banking regardless of real/shader seconds');
  const replay = draw('slow-guard', .126, .01, .1);
  assert.equal(replay.actorWebPoseReaction, null,
    'replayed actor ID must not inherit movement through either clock rewind');
  assert.equal(calls.filter(call => call[0] === 'draw').length, 6,
    'the slow-motion fix adds no extra indexed GPU draws');
  pass.dispose();
});


test('Web head gaze turns the sampled Head subtree without turning the real weapon socket or frozen poses', () => {
  // Fully authored four-bone humanoid branch and two independent children:
  // no Unity mesh, animation clip, controller or proprietary byte is copied.
  const moved = (x, y, z) => {
    const matrix = identity();
    matrix[12] = x; matrix[13] = y; matrix[14] = z;
    return matrix;
  };
  const idleFrame = {
    positions: [0,0,0, 0,1,0, 0,.4,0, 1,0,0],
    rotations: Array.from({length: 4}, () => [0,0,0,1]).flat(),
    scales: Array.from({length: 4}, () => [1,1,1]).flat(),
  };
  const base = sourcePackage();
  const pkg = sourcePackage({
    bones: [
      {name:'root', parent:-1, position:[0,0,0], rotation:[0,0,0,1], scale:[1,1,1]},
      {name:'neck', parent:0, position:[0,1,0], rotation:[0,0,0,1], scale:[1,1,1]},
      {name:'Head', parent:1, position:[0,.4,0], rotation:[0,0,0,1], scale:[1,1,1]},
      {name:'hand', parent:0, position:[1,0,0], rotation:[0,0,0,1], scale:[1,1,1]},
    ],
    mesh: {
      ...base.mesh,
      positions: [0,1.4,0, .4,1.4,0, 0,2,0],
      jointIndices: Array.from({length:3}, () => [2,0,0,0]).flat(),
      inverseBindMatrices: [
        ...identity(), ...moved(0,-1,0), ...moved(0,-1.4,0), ...moved(-1,0,0),
      ],
    },
    clips: {
      idle: {duration: 1, sampleRate: 1, frames: [idleFrame,idleFrame]},
      run: {duration: 1, sampleRate: 1, frames: [idleFrame,idleFrame]},
      hit: {duration: 1, sampleRate: 1, frames: [idleFrame,idleFrame]},
    },
    states: {
      idle: {clip:'idle', playback:'loop', speed:1},
      run: {clip:'run', playback:'loop', speed:1},
      hit: {clip:'hit', playback:'clamp', speed:1},
    },
    transitions: {
      'idle->run': {from:'idle', to:'run', duration:.1,
        source:'authored head blend'},
      'run->idle': {from:'run', to:'idle', duration:.1,
        source:'authored head blend'},
    },
    weaponAttachment: {
      bone:'hand', localMatrix:identity(),
      source:'authored head-gaze fixture', coordinates:'authored test basis',
    },
  });
  const {gl, calls} = mockGl();
  const pass = createNativeSkinPass(gl, pkg);
  assert.equal(pass.webHeadTrackingAvailable, true);
  const actors = createNativeActorSkinRuntime(pass);
  const controlActors = createNativeActorSkinRuntime(pass);
  const control = time => controlActors.drawActor({
    actorId:'watchman', pose:{state:'idle', time},
    modelMatrix:identity(), viewProjection:identity(),
    cameraPosition:null, shaderTime:time * 10,
    color:[.8,.1,.2,1],
  });
  const draw = (time, x, z, extra = {}, y = 1.5) => actors.drawActor({
    actorId: 'watchman', pose: {state:'idle', time, ...extra},
    modelMatrix: identity(), viewProjection: identity(),
    cameraPosition: {x, y, z}, shaderTime: time * 10,
    color: [.8,.1,.2,1],
  });
  const first = draw(0, 5, 5);
  const sourceAtRight = control(.1);
  assert.equal(first.actorWebHeadLook, null, 'first pose does not invent a snap');
  const lookingRight = draw(.1, 5, 5);
  assert.equal(lookingRight.webHeadLookApplied, true);
  assert.ok(lookingRight.actorWebHeadLook.yaw > .1);
  assert.ok(lookingRight.boneModelMatrices[2*16 + 8] > .1,
    'the real head bone rotates toward the right');
  near(Array.from(lookingRight.boneModelMatrices.slice(0, 16)),
    Array.from(sourceAtRight.boneModelMatrices.slice(0,16)));
  near(Array.from(lookingRight.boneModelMatrices.slice(3*16,4*16)),
    Array.from(sourceAtRight.boneModelMatrices.slice(3*16,4*16)));
  near(Array.from(lookingRight.weaponAttachmentMatrix),
    Array.from(sourceAtRight.weaponAttachmentMatrix));
  const palette = calls.filter(call => call[0] === 'matrix' && call[1] === 'uJoints[0]').at(-1)[2];
  assert.ok(palette[8] > .1, 'GPU palette receives the same head turn');

  const paused = draw(.1, -5, 5);
  assert.equal(paused.actorWebHeadLook.yaw, lookingRight.actorWebHeadLook.yaw,
    'shader-only/camera changes never animate a frozen world frame');
  near(Array.from(paused.boneModelMatrices), Array.from(lookingRight.boneModelMatrices));
  const lookingLeft = draw(.21, -5, 5);
  assert.ok(lookingLeft.actorWebHeadLook.yaw < 0, 'head glances to the opposite side');
  near(Array.from(lookingLeft.weaponAttachmentMatrix),
    Array.from(control(.21).weaponAttachmentMatrix));

  const above = draw(.33, 0, 5, {}, 4.5);
  assert.ok(above.actorWebHeadLook.pitch > .1, 'head looks up toward a higher player');
  assert.ok(above.boneModelMatrices[2*16 + 9] > .1,
    'the original Head branch pitches up without an additional GPU draw');
  near(Array.from(above.weaponAttachmentMatrix),
    Array.from(control(.33).weaponAttachmentMatrix));
  const frozenAbove = draw(.33, 0, 5, {}, -3);
  assert.equal(frozenAbove.actorWebHeadLook.pitch, above.actorWebHeadLook.pitch,
    'frozen world-time pose ignores player altitude changes');
  near(Array.from(frozenAbove.boneModelMatrices), Array.from(above.boneModelMatrices));
  const below = draw(.46, 0, 5, {}, -3);
  assert.ok(below.actorWebHeadLook.pitch < 0, 'head follows a player below the enemy');
  assert.ok(below.boneModelMatrices[2*16 + 9] < 0);
  near(Array.from(below.weaponAttachmentMatrix),
    Array.from(control(.46).weaponAttachmentMatrix));

  // The live Dojo changes idle/walk/run source states when AI starts or
  // stops moving. Their pose.time restarts, while shaderTime advances on
  // the separate REAL clock. A Web head lock must neither snap to zero nor
  // incorrectly update from 100ms of shader time during a 0ms world step.
  const gaitActors = createNativeActorSkinRuntime(pass);
  const gait = (state, poseTime, shaderTime, worldX = 0, transition = null) => {
    const model = identity();
    model[12] = worldX;
    return gaitActors.drawActor({
      actorId: 'gait-watchman',
      pose: {state, time: poseTime, targetSight: true,
        ...(transition ? {transition} : {})},
      modelMatrix: model, viewProjection: identity(),
      cameraPosition:{x:5,y:4.5,z:5}, shaderTime,
      color:[.8,.1,.2,1],
    });
  };
  assert.equal(gait('idle', .4, 1).actorWebHeadLook, null);
  const heldGaze = gait('idle', .5, 1.1);
  assert.ok(heldGaze.actorWebHeadLook.yaw > .1);
  assert.ok(pass.availableTransitions.includes('idle->run'),
    'the test runs the real source-transition path, not a transitionless shortcut');
  const newRun = gait('run', 0, 1.2, 0,
    {from:{state:'idle', time:.5}, elapsed:0});
  assert.equal(newRun.actorWebHeadLook.yaw, heldGaze.actorWebHeadLook.yaw,
    'source-blended state-clock restart must preserve the already drawn GPU gaze');
  assert.equal(newRun.actorWebHeadLook.pitch, heldGaze.actorWebHeadLook.pitch);
  assert.equal(newRun.webHeadLookApplied, true);
  const resumedGaze = gait('run', .025, 1.3, 0,
    {from:{state:'idle', time:.525}, elapsed:.025});
  assert.ok(resumedGaze.actorWebHeadLook.yaw > 0 &&
    Number.isFinite(resumedGaze.actorWebHeadLook.pitch),
  'source blend continues a real visible gaze with finite world-time smoothing');
  const teleported = gait('idle', 0, 1.4, 4,
    {from:{state:'run', time:.025}, elapsed:0});
  assert.equal(teleported.actorWebHeadLook, null,
    'a real actor teleport cannot carry the old target gaze into a new location');
  assert.equal(gait('idle', .025, .1).actorWebHeadLook, null,
    'REJOUER clock rewind may not resurrect a prior run gaze');

  // The Web head used to track the camera even after the encounter lost LOS:
  // visible: false must settle the SAME sampled Head, not follow an unseen
  // player's new world position through an occluder or rotate the gun socket.
  const hiddenActors = createNativeActorSkinRuntime(pass);
  const visibility = (time, x, y, sight) => hiddenActors.drawActor({
    actorId:'los-watchman', pose:{state:'idle', time, targetSight:sight},
    modelMatrix:identity(), viewProjection:identity(),
    cameraPosition:{x,y,z:5}, shaderTime:time*10, color:[.8,.1,.2,1],
  });
  assert.equal(visibility(0, 5, 4.5, true).actorWebHeadLook, null);
  const seen = visibility(.1, 5, 4.5, true);
  assert.ok(seen.actorWebHeadLook.yaw > .1 && seen.actorWebHeadLook.pitch > .1);
  const occluded = visibility(.2, -5, -3, false);
  assert.ok(occluded.actorWebHeadLook.yaw > 0 &&
    occluded.actorWebHeadLook.yaw < seen.actorWebHeadLook.yaw,
    'the head must ease to neutral, not turn toward the unseen opposite camera');
  assert.ok(occluded.actorWebHeadLook.pitch > 0 &&
    occluded.actorWebHeadLook.pitch < seen.actorWebHeadLook.pitch,
    'unseen camera height must not drive a new head pitch');
  const unlooked = createNativeActorSkinRuntime(pass).drawActor({
    actorId:'los-watchman', pose:{state:'idle',time:.2,targetSight:false},
    modelMatrix:identity(), viewProjection:identity(), cameraPosition:null,
    shaderTime:2, color:[.8,.1,.2,1],
  });
  // Compare at the SAME sampled world time: the authored idle weight shift
  // legitimately moves the shoulder/socket over time independently of gaze.
  near(Array.from(occluded.weaponAttachmentMatrix),
    Array.from(unlooked.weaponAttachmentMatrix));
  const pausedHidden = visibility(.2, 40, 40, false);
  assert.equal(pausedHidden.actorWebHeadLook.yaw, occluded.actorWebHeadLook.yaw,
    'world-time pause must freeze gaze recovery too');
  assert.equal(pausedHidden.actorWebHeadLook.pitch, occluded.actorWebHeadLook.pitch);
  const reacquired = visibility(.3, -5, 1.5, true);
  assert.ok(reacquired.actorWebHeadLook.yaw < 0,
    'only restored gameplay LOS may turn the head toward the opposite side');
  assert.throws(() => visibility(.4, 5, 1.5, 'unknown'), /actual boolean AI sight/);

  // A live guard must acknowledge an ACTUALLY SEEN rear-flank threat without
  // omniscient camera tracking when sight is unknown or the target hides.
  // This is authored Web readability; the sampled head, GPU palette and
  // socket still share one pose, with no extra draw or native-IK claim.
  const rearActors = createNativeActorSkinRuntime(pass);
  const rearControlActors = createNativeActorSkinRuntime(pass);
  const rear = (time, x, sight) => rearActors.drawActor({
    actorId:'rear-watchman', pose:{state:'idle', time, targetSight:sight},
    modelMatrix:identity(), viewProjection:identity(),
    cameraPosition:{x,y:1.5,z:-5}, shaderTime:time*10,
    color:[.8,.1,.2,1],
  });
  const rearSource = time => rearControlActors.drawActor({
    actorId:'rear-watchman', pose:{state:'idle',time,targetSight:false},
    modelMatrix:identity(), viewProjection:identity(),
    cameraPosition:null, shaderTime:time*10,
    color:[.8,.1,.2,1],
  });
  assert.equal(rear(0, 5, true).actorWebHeadLook, null);
  const rearRight = rear(.1, 5, true);
  assert.ok(rearRight.actorWebHeadLook?.yaw > .1,
    'source-visible right-rear threat gets an isolated neck glance');
  const rearLeft = rear(.22, -5, true);
  assert.ok(rearLeft.actorWebHeadLook?.yaw < 0,
    'visible opposite rear flank reverses the glance with world-time damping');
  assert.equal(rearLeft.webHeadLookApplied, true);
  near(Array.from(rearLeft.weaponAttachmentMatrix),
    Array.from(rearSource(.22).weaponAttachmentMatrix));
  const rearOccluded = rear(.32, 5, false);
  assert.ok(rearOccluded.actorWebHeadLook.yaw < 0 &&
    rearOccluded.actorWebHeadLook.yaw > rearLeft.actorWebHeadLook.yaw,
    'a rear camera cannot turn the head after true AI sight is lost');
  const rearUnknownActors = createNativeActorSkinRuntime(pass);
  const rearUnknown = (time, sight) => rearUnknownActors.drawActor({
    actorId:'unknown-watchman', pose:{state:'idle',time,
      ...(sight === undefined ? {} : {targetSight:sight})},
    modelMatrix:identity(), viewProjection:identity(),
    cameraPosition:{x:5,y:1.5,z:-5}, shaderTime:time*10,
    color:[.8,.1,.2,1],
  });
  rearUnknown(0);
  assert.equal(rearUnknown(.1).actorWebHeadLook, null,
    'camera-only rear position cannot invent gameplay visibility');

  // Real Dojo encounter geometry: when personally visible, SH-03 rotates
  // enemy.face to atan2(player.x-enemy.x,-(player.z-enemy.z)) in the SAME tick.
  // Therefore a player behind the CURRENT model forward is not a reliable
  // gameplay scenario. Verify a real first-frame +90-degree body facing snap
  // produces an independently sampled, damped Web neck follow-through.
  const faceSnapActors = createNativeActorSkinRuntime(pass);
  const facingX = identity();
  facingX[0] = 0; facingX[2] = -1;
  facingX[8] = 1; facingX[10] = 0;
  const snapFrame = (time, turned, sight) => faceSnapActors.drawActor({
    actorId:'turn-watchman', pose:{state:'idle',time,targetSight:sight},
    modelMatrix: turned ? facingX : identity(),
    viewProjection:identity(),
    cameraPosition:{x:5,y:1.5,z:0}, shaderTime:time*10,
    color:[.8,.1,.2,1],
  });
  assert.equal(snapFrame(0,false,false).actorWebHeadLook,null);
  const firstTurn = snapFrame(.08,true,true);
  assert.ok(firstTurn.actorWebHeadLook?.yaw < -.2 &&
    firstTurn.webHeadLookApplied === true,
    'real instantaneous AI facing must produce an observable neck follow-through');
  // A real 90-degree facing snap also invokes the EXISTING Web torso bank.
  // Compare against that same per-actor previous-frame motion with sight
  // disabled; otherwise a different torso bank changes the weapon socket
  // regardless of the new independent neck follow-through.
  const turnControlActors = createNativeActorSkinRuntime(pass);
  const turnControl = (time, turned) => turnControlActors.drawActor({
    actorId:'turn-control',pose:{state:'idle',time,targetSight:false},
    modelMatrix:turned ? facingX : identity(),viewProjection:identity(),
    cameraPosition:null,shaderTime:time*10,color:[.8,.1,.2,1],
  });
  turnControl(0,false);
  const sourceTurn = turnControl(.08,true);
  near(Array.from(firstTurn.weaponAttachmentMatrix),
    Array.from(sourceTurn.weaponAttachmentMatrix));
  const easedTurn = snapFrame(.16,true,true);
  assert.ok(easedTurn.actorWebHeadLook.yaw > firstTurn.actorWebHeadLook.yaw,
    'settled facing must damp neck follow-through without rotating the weapon');
  const pausedTurn = snapFrame(.16,true,true);
  assert.equal(pausedTurn.actorWebHeadLook.yaw,easedTurn.actorWebHeadLook.yaw,
    'a zero-world-time frame must not advance authored follow-through');

  const dead = draw(.50, 5, 5, {solvedPose:{
    rig:pass.rig, provenance:'authored solved pose',
    boneModelMatrices:new Float32Array([
      ...identity(), ...moved(0,1,0), ...moved(0,1.4,0), ...moved(1,0,0),
    ]),
  }});
  assert.equal(dead.webHeadLookApplied, false, 'externally solved death remains authoritative');
  assert.equal(dead.actorWebHeadLook, null);

  // An accepted real hit state may add a secondary, Web-only head whiplash.
  // It must never move weapon attachments, shoulders or the root independently.
  const hit = (time, origin, solvedPose = null) => actors.drawActor({
    actorId:'hit-watchman',
    pose:{state:'hit', time, hitOrigin:origin, hitEventId:'bullet-1', solvedPose},
    modelMatrix:identity(), viewProjection:identity(),
    cameraPosition:[-5, 1.4, 0], shaderTime:1 + time,
    color:[.8,.1,.2,1],
  });
  const initialHit = hit(0, {x:5,y:1,z:0});
  assert.equal(initialHit.actorWebHeadLook?.design, 'Web-only secondary hit head whiplash',
    'accepted collision already gives the source neck a Web-only first-frame response');
  const stagger = hit(.12, {x:5,y:1,z:0});
  assert.equal(stagger.actorWebHeadLook?.design, 'Web-only secondary hit head whiplash');
  assert.ok(stagger.actorWebHeadLook.roll < -.08, 'head bends away from a right-side impact');
  assert.equal(stagger.webHeadLookApplied, true);

  const torsoOnly = pass.draw({
    instance:pass.createStateInstance('hit'), time:.12,
    modelMatrix:identity(), viewProjection:identity(),
    color:[.8,.1,.2,1], webPoseLean:stagger.actorWebPoseReaction,
  });
  for (const bone of [0,1,3]) {
    near(Array.from(stagger.boneModelMatrices.slice(bone*16,(bone+1)*16)),
      Array.from(torsoOnly.boneModelMatrices.slice(bone*16,(bone+1)*16)));
  }
  near(Array.from(stagger.weaponAttachmentMatrix),
    Array.from(torsoOnly.weaponAttachmentMatrix));
  assert.ok(Math.abs(stagger.boneModelMatrices[2*16] - torsoOnly.boneModelMatrices[2*16]) > .02,
    'only the existing Head subtree receives the second deformation');
  const hitPaletteCalls = calls.filter(call => call[0] === 'matrix' && call[1] === 'uJoints[0]');
  assert.ok(hitPaletteCalls.length > 0, 'head whiplash uses the existing GPU palette');
  pass.dispose();
});


test('Dojo source-named neck chain actually animates the GPU head with no Head bone', () => {
  // Independent, noncommercial rig fixture using ONLY the published source
  // joint NAMES/ancestry, not source vertices, bind poses or animation bytes.
  // The real 62-joint Dojo rig has no literal Head: neck 01 is parent of
  // neck Top and both are skinned. The previous regex disabled this feature.
  const translated = (x, y, z) => {
    const m = identity();
    m[12] = x; m[13] = y; m[14] = z;
    return m;
  };
  const rest = {
    positions: [0,0,0, 0,1,0, 0,.4,0, 1,0,0],
    rotations: Array.from({length:4}, () => [0,0,0,1]).flat(),
    scales: Array.from({length:4}, () => [1,1,1]).flat(),
  };
  const base = sourcePackage();
  const pkg = sourcePackage({
    bones: [
      {name:'root',parent:-1,position:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1]},
      {name:'jnt_Neck_01',parent:0,position:[0,1,0],rotation:[0,0,0,1],scale:[1,1,1]},
      {name:'jnt_Neck_Top',parent:1,position:[0,.4,0],rotation:[0,0,0,1],scale:[1,1,1]},
      {name:'hand',parent:0,position:[1,0,0],rotation:[0,0,0,1],scale:[1,1,1]},
    ],
    mesh: {
      ...base.mesh,
      positions: [0,1,0, .4,1.4,0, 0,2,0],
      jointIndices: [1,0,0,0, 2,0,0,0, 2,0,0,0],
      inverseBindMatrices: [
        ...identity(), ...translated(0,-1,0),
        ...translated(0,-1.4,0), ...translated(-1,0,0),
      ],
    },
    clips: {idle:{duration:1,sampleRate:1,frames:[rest,rest]}},
    states: {idle:{clip:'idle',playback:'loop',speed:1}},
    weaponAttachment: {
      bone:'hand',localMatrix:identity(),
      source:'synthetic neck-branch fixture',coordinates:'authored rig',
    },
  });
  const {gl,calls} = mockGl();
  const pass = createNativeSkinPass(gl,pkg);
  assert.equal(pass.webHeadTrackingAvailable,true);
  assert.equal(pass.webHeadPivotBone,1);
  assert.equal(pass.webHeadSampleBone,2);
  assert.equal(pass.webHeadPivotIdentity,'source jnt_Neck_01 -> jnt_Neck_Top');
  const actors = createNativeActorSkinRuntime(pass);
  const draw = (time, cameraPosition) => actors.drawActor({
    actorId:'dojo-neck-test',pose:{state:'idle',time},
    modelMatrix:identity(),viewProjection:identity(),
    cameraPosition,shaderTime:time*10,color:[.8,.1,.2,1],
  });
  const initial = draw(0,{x:5,y:4,z:5});
  assert.equal(initial.actorWebHeadLook,null);
  const moving = draw(.12,{x:5,y:4,z:5});
  // Equal source clip + equal Web idle weight shift, but NO camera gaze:
  // weapon and other body branches must remain exactly synchronized.
  const neutral = createNativeActorSkinRuntime(pass).drawActor({
    actorId:'dojo-neck-test',pose:{state:'idle',time:.12},
    modelMatrix:identity(),viewProjection:identity(),
    cameraPosition:null,shaderTime:1.2,color:[.8,.1,.2,1],
  });
  assert.equal(moving.webHeadLookApplied,true,
    'Dojo neck chain must no longer disable all Web head motion');
  assert.ok(moving.actorWebHeadLook.yaw>.1);
  assert.ok(moving.actorWebHeadLook.pitch>.05);
  assert.ok(Math.abs(moving.boneModelMatrices[2*16+8] -
    neutral.boneModelMatrices[2*16+8])>.05,
    'the source-neutral weighted terminal neck joint turns in GPU pose');
  near(Array.from(moving.weaponAttachmentMatrix),Array.from(neutral.weaponAttachmentMatrix));
  near(Array.from(moving.boneModelMatrices.slice(3*16,4*16)),
    Array.from(neutral.boneModelMatrices.slice(3*16,4*16)));
  assert.equal(calls.filter(c=>c[0]==='draw').length,3,
    'do not add a second draw or material pass for Dojo head motion');
  pass.dispose();

  const noChain={...pkg,bones:pkg.bones.map((bone,i)=>
    i===2?{...bone,name:'not-an-authored-neck-tip'}:bone)};
  const unknown=createNativeSkinPass(mockGl().gl,noChain);
  assert.equal(unknown.webHeadTrackingAvailable,false,
    'unrecognized rig identities must remain unchanged instead of guessed');
  unknown.dispose();
});

test('Web stun anchors its contact side through player movement and resets on a new event', () => {
  const pkg = transitionPackage();
  pkg.clips.hit = { duration: 1, sampleRate: 1, frames: [frame(0), frame(0)] };
  pkg.states.hit = { clip: 'hit', playback: 'clamp', speed: 1 };
  pkg.weaponAttachment = {
    bone: 'child', localMatrix: identity(),
    source: 'authored socket fixture', coordinates: 'authored model frame',
  };
  const { gl, calls } = mockGl();
  const pass = createNativeSkinPass(gl, pkg);
  const actors = createNativeActorSkinRuntime(pass);
  const draw = (actorId, time, shaderTime, cameraPosition, extra = {}) =>
    actors.drawActor({
      actorId, pose: {state: 'hit', time, ...extra}, shaderTime,
      cameraPosition, modelMatrix: identity(), viewProjection: identity(),
      color: [.8, .1, .2, 1],
    });

  const start = draw('stunned-A', 0, 1, [4, 1, 0], {hitEventId: 'impact-1'});
  assert.equal(start.actorWebPoseReaction?.kind, 'hit',
    'accepted hitEventId immediately leans the sampled GPU pose, not the source clip clock');
  assert.ok(start.actorWebPoseReaction.roll > .25);
  const right = draw('stunned-A', .11, 1.11, [4, 1, 0], {hitEventId: 'impact-1'});
  const movingPlayer = draw('stunned-A', .18, 1.18, [-4, 1, 0],
    {hitEventId: 'impact-1'});
  assert.ok(right.actorWebPoseReaction.roll > .1);
  assert.ok(movingPlayer.actorWebPoseReaction.roll > .1,
    'a moving camera cannot reverse an already accepted stun impulse');
  assert.equal(movingPlayer.actorWebPoseReaction.hitDirectionProvenance,
    'Web camera-facing proxy, not contact origin');
  assert.ok(movingPlayer.weaponAttachmentMatrix[8] < 0,
    'the actual weapon socket follows the locked skinned recoil');

  const other = draw('stunned-B', .11, 1.18, [-4, 1, 0], {hitEventId:'impact-1'});
  assert.ok(other.actorWebPoseReaction.roll < -.1,
    'another enemy has independent impact history');

  const trueContact = draw('stunned-A', .21, 1.21, [4, 1, 0], {
    hitEventId: 'impact-2', hitOrigin: {x:-4, y:1, z:0},
  });
  assert.ok(trueContact.actorWebPoseReaction.roll < -.1,
    'new accepted contact overrides a camera on the opposite side');
  assert.equal(trueContact.actorWebPoseReaction.hitDirectionProvenance,
    'Web gameplay contact origin, not native MCD impulse');
  const continued = draw('stunned-A', .27, 1.27, [4, 1, 0],
    {hitEventId:'impact-2'});
  assert.ok(continued.actorWebPoseReaction.roll < 0,
    'contact origin remains fixed across later frames without repeated payload');

  const beforeInvalid = calls.filter(call => call[0] === 'draw').length;
  assert.throws(() => draw('stunned-A', .3, 1.3, [4, 1, 0],
    {hitEventId:'invalid',hitOrigin:{x:NaN,y:1,z:0}}),
  /hitOrigin requires finite world-space/);
  assert.equal(calls.filter(call => call[0] === 'draw').length, beforeInvalid,
    'invalid external contact never produces a GPU draw or poisons the history');
  const afterFailure = draw('stunned-A', .31, 1.31, [4, 1, 0],
    {hitEventId:'impact-2'});
  assert.ok(afterFailure.actorWebPoseReaction.roll < 0);

  const replay = draw('stunned-A', .03, .01, [4, 1, 0],
    {hitEventId:'impact-1'});
  assert.ok(replay.actorWebPoseReaction.roll > 0,
    'world-clock rewind clears the previous stun source');
  pass.dispose();
});

test('Web Dojo hip-to-spine recoil plants both legs while bending weighted torso and weapon', () => {
  // Entirely authored six-bone fixture with the Dojo parent structure, but
  // no recovered transforms, clips, geometry or other proprietary bytes.
  const b = (name, parent, position) => ({
    name, parent, position, rotation: [0, 0, 0, 1], scale: [1, 1, 1],
  });
  const inverse = (x, y, z) => {
    const m = identity();
    m[12] = -x; m[13] = -y; m[14] = -z;
    return m;
  };
  const bones = [
    b('jnt_Root', -1, [0, 0, 0]),
    b('jnt_Hips', 0, [0, 1, 0]),
    b('jnt_L_Leg_Hip', 1, [-.5, -.5, 0]),
    b('jnt_R_Leg_Hip', 1, [.5, -.5, 0]),
    b('jnt_Spine_01', 1, [0, .5, 0]),
    b('jnt_R_Arm_Wrist', 4, [.5, .3, .2]),
  ];
  const pose = {
    positions: bones.flatMap(bone => bone.position),
    rotations: bones.flatMap(() => [0, 0, 0, 1]),
    scales: bones.flatMap(() => [1, 1, 1]),
  };
  const pkg = sourcePackage({
    bones,
    mesh: {
      ...sourcePackage().mesh,
      jointIndices: [2,0,0,0, 3,0,0,0, 5,0,0,0],
      inverseBindMatrices: [
        ...inverse(0,0,0), ...inverse(0,1,0),
        ...inverse(-.5,.5,0), ...inverse(.5,.5,0),
        ...inverse(0,1.5,0), ...inverse(.5,1.8,.2),
      ],
    },
    clips: {idle: {duration:1, sampleRate:1, frames:[pose,pose]}},
    weaponAttachment: {
      bone: 'jnt_R_Arm_Wrist', localMatrix: identity(),
      source: 'authored-test', coordinates: 'source-neutral test',
    },
  });
  const {gl, calls} = mockGl();
  const pass = createNativeSkinPass(gl, pkg);
  const instance = pass.createInstance({clip:'idle',playback:'loop'});
  const params = {instance, time:.2, modelMatrix:identity(),
    viewProjection:identity(), color:[.8,.1,.2,1]};
  const baseline = pass.draw(params);
  const before = Array.from(baseline.boneModelMatrices);
  const socketY = baseline.weaponAttachmentMatrix[13];
  const bank = pass.draw({...params,
    webPoseLean:{pitch:0,roll:.28,yaw:0}});
  const after = Array.from(bank.boneModelMatrices);
  for (const bone of [0,1,2,3]) {
    near(after.slice(bone*16,(bone+1)*16),
      before.slice(bone*16,(bone+1)*16));
  }
  assert.ok(Math.abs(after[4*16+12] - before[4*16+12]) > .1,
    'source spine should visibly lean while hips remain planted');
  assert.ok(bank.weaponAttachmentMatrix[13] > socketY + .1,
    'the weapon socket follows the upper-body lean');
  assert.equal(bank.webPoseLeanApplied,true);
  const uploaded = calls.filter(call => call[0]==='matrix' && call[1]==='uJoints[0]');
  assert.equal(uploaded.length,2);
  near(uploaded[0][2].slice(0,32),uploaded[1][2].slice(0,32));
  assert.notDeepEqual(uploaded[0][2].slice(32),uploaded[1][2].slice(32));
  assert.equal(calls.filter(call => call[0]==='draw').length,2);
  pass.dispose();
});
