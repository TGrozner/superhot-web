import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeWorldPass } from '../src/render/native-world-pass.js';
import { defineIndexedMesh, meshModelMatrices } from '../src/render/mesh-format.js';

const identity = () => [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
const camera = { x: 0, y: 1, z: 2 };

// Authored triangles and a recording GL boundary: these tests exercise draw
// selection/state, not shader compilation, native assets or pixel fidelity.
function recordingGl() {
  let serial = 0;
  const uniforms = new Map(), draws = [], textures = new Map();
  const state = new Map();
  const gl = { drawingBufferWidth: 800, drawingBufferHeight: 600 };
  const constants = ['ACTIVE_TEXTURE', 'TEXTURE_BINDING_2D', 'CURRENT_PROGRAM',
    'VERTEX_ARRAY_BINDING', 'ARRAY_BUFFER_BINDING', 'COLOR_WRITEMASK', 'DEPTH_FUNC',
    'DEPTH_WRITEMASK', 'BLEND', 'LEQUAL', 'LESS', 'ARRAY_BUFFER', 'ELEMENT_ARRAY_BUFFER',
    'STATIC_DRAW', 'FLOAT', 'UNSIGNED_SHORT', 'UNSIGNED_INT', 'TRIANGLES', 'TEXTURE_2D',
    'RGBA8', 'RGBA', 'UNSIGNED_BYTE', 'TEXTURE_MIN_FILTER', 'TEXTURE_MAG_FILTER',
    'TEXTURE_WRAP_S', 'TEXTURE_WRAP_T', 'TEXTURE_MAX_LEVEL', 'NEAREST', 'LINEAR',
    'CLAMP_TO_EDGE', 'REPEAT', 'VERTEX_SHADER', 'FRAGMENT_SHADER', 'COMPILE_STATUS',
    'LINK_STATUS', 'NO_ERROR'];
  constants.forEach((name, i) => { gl[name] = i + 1; });
  gl.TEXTURE0 = 100;
  gl.TEXTURE1 = 101;
  state.set(gl.ACTIVE_TEXTURE, 107);
  state.set(gl.COLOR_WRITEMASK, [true, false, true, false]);
  state.set(gl.DEPTH_FUNC, gl.LESS);
  state.set(gl.DEPTH_WRITEMASK, false);
  state.set(gl.BLEND, true);
  gl.getParameter = key => key === gl.TEXTURE_BINDING_2D
    ? textures.get(state.get(gl.ACTIVE_TEXTURE)) ?? null : state.get(key) ?? null;
  gl.activeTexture = unit => state.set(gl.ACTIVE_TEXTURE, unit);
  gl.bindTexture = (_target, texture) => textures.set(state.get(gl.ACTIVE_TEXTURE), texture);
  gl.useProgram = value => state.set(gl.CURRENT_PROGRAM, value);
  gl.bindVertexArray = value => state.set(gl.VERTEX_ARRAY_BINDING, value);
  gl.bindBuffer = (target, value) => {
    if (target === gl.ARRAY_BUFFER) state.set(gl.ARRAY_BUFFER_BINDING, value);
  };
  gl.isEnabled = key => state.get(key) === true;
  gl.enable = key => state.set(key, true);
  gl.disable = key => state.set(key, false);
  gl.depthFunc = value => state.set(gl.DEPTH_FUNC, value);
  gl.depthMask = value => state.set(gl.DEPTH_WRITEMASK, value);
  gl.colorMask = (...value) => state.set(gl.COLOR_WRITEMASK, value);
  for (const name of ['createProgram', 'createShader', 'createTexture', 'createBuffer', 'createVertexArray']) {
    gl[name] = () => ({ resource: ++serial });
  }
  for (const name of ['shaderSource', 'compileShader', 'attachShader', 'linkProgram',
    'deleteShader', 'deleteProgram', 'deleteTexture', 'deleteBuffer', 'deleteVertexArray',
    'texImage2D', 'texParameteri', 'bufferData', 'enableVertexAttribArray',
    'disableVertexAttribArray', 'vertexAttribPointer', 'vertexAttrib4f', 'vertexAttrib2f']) gl[name] = () => {};
  gl.getShaderParameter = gl.getProgramParameter = () => true;
  gl.getError = () => gl.NO_ERROR;
  gl.getAttribLocation = (_program, name) => ['aPosition', 'aNormal', 'aUV', 'aColor', 'aLightmapUV', 'aTangent'].indexOf(name);
  gl.getUniformLocation = (_program, name) => name;
  for (const name of ['uniform1i', 'uniform1f']) gl[name] = (key, value) => uniforms.set(key, value);
  for (const name of ['uniform2f', 'uniform3f']) gl[name] = (key, ...value) => uniforms.set(key, value);
  for (const name of ['uniform2fv', 'uniform3fv', 'uniform4fv']) gl[name] = (key, value) => uniforms.set(key, [...value]);
  for (const name of ['uniformMatrix4fv', 'uniformMatrix3fv']) gl[name] = (key, _transpose, value) => uniforms.set(key, [...value]);
  gl.drawElements = (...range) => draws.push({ range, uniforms: new Map(uniforms), blend: gl.isEnabled(gl.BLEND), depthWrite: state.get(gl.DEPTH_WRITEMASK) });
  return { gl, draws, state };
}

function fixture({ withFragment = false, withFirstPerson = false, warning = false } = {}) {
  const mesh = defineIndexedMesh({ positions: [0,0,0, 1,0,0, 0,1,0],
    normals: [0,0,1, 0,0,1, 0,0,1], uvs: [0,0, 1,0, 0,1], indices: [0,1,2, 0,2,1] });
  const instances = ['bowl', 'shuriken'].map((id, i) => {
    const model = identity(); model[12] = i + 4;
    return { id, meshId: 'authored', ...meshModelMatrices(model), classification: { category: 'world' },
      draws: [{ meshId: 'authored', materialId: 'black', range: { firstIndex: i * 3, indexCount: 3 } }] };
  });
  const material = { source: { identity: 'sharedassets0.assets::9' },
    shader: { source: 'globalgamemanagers.assets::12' }, keywords: ['_USEGRADIENTMAP_ON'],
    textures: { _Cube2d: { textureId: 'reflection', sourceTexture: 'sharedassets0.assets::27', scale: [1,1], offset: [0,0] } },
    colors: {}, floats: {} };
  const scene = {
    meshes: new Map([['authored', { mesh, hasUV: true, hasNormals: true, hasTangents: false }]]),
    materialMap: new Map([['black', material]]), instances,
    auxiliaryInstances: withFragment ? [{
      id: 'source-shard', meshId: 'authored', ...meshModelMatrices(identity()),
      classification: { category: 'interactive_fragment', worldPassEligible: false },
      draws: [{ meshId: 'authored', materialId: 'black', range: { firstIndex: 3, indexCount: 3 } }],
    }] : [],
    concreteLighting: { textures: { microseamTextureId: 'micro', poreTextureId: 'pore', fogGradientTextureId: 'fog' },
      globals: { lightLocalAmbient: [0,0,0,0], lightLocalMinusAmbient: [0,0,0,0],
        localDynamicConcreteAmbient: [0,0,0,0], lightLocalAmbientMultiplier: 1,
        localAttenuationOutsideShadowDistance: 1, localFogColor: [1,1,1,1],
        localFogScale: 100, localFogPower: 1, localSecondaryFogDistance: 100,
        localGroundFogZero: 0, localGroundFogScale: 1, localShowGroundFog: 0,
        localGroundFogColor: [1,1,1,1], worldSpaceLightDirection: [0,1,0] } },
  };
  if (withFirstPerson) {
    scene.materialMap.set('first-person', {
      ...material, source: { identity: 'sharedassets0.assets::10' },
      shader: { source: 'globalgamemanagers.assets::8' }, keywords: [],
    });
    const localMatrix = identity(); localMatrix[12] = 30;
    scene.firstPersonPistol = {
      meshId: 'authored', localMatrix, projection: { verticalFovDegrees: 20 },
      draws: [{ meshId: 'authored', materialId: 'first-person', range: { firstIndex: 0, indexCount: 3 } }],
    };
  }
  const images = new Map(['reflection', 'micro', 'pore', 'fog'].map(id => [id, {}]));
  if (warning) {
    // Entirely synthetic source-shape fixture: no original PNG/coordinates.
    scene.source = { sceneBuildIndex:10, serializedOwner:'level10',
      scenePath:'Assets/Scenes/SHRL/SHRL_Dojo2.unity' };
    scene.gameplay = { audio:{ doors:{ 'level10::7089':{
      spotlight:{ cookieTextureId:'synthetic-cookie' },
    } } } };
    scene.instances[0].layer = 8;
    scene.instances[1].layer = 9;
    scene.instanceMap = new Map(scene.instances.map(instance => [instance.id, instance]));
    scene.textures = new Map([['synthetic-cookie', {id:'synthetic-cookie'}]]);
    images.set('synthetic-cookie', {width:2,height:2});
  }
  const context = recordingGl();
  return { ...context, scene, pass: createNativeWorldPass(context.gl, scene, images) };
}

test('pickup hides only its authored placement and release restores the same source draw', () => {
  const { pass, draws, scene } = fixture();
  assert.equal(pass.draw(identity(), camera).drawCalls, 2);
  pass.setInstanceVisible('bowl', false);
  draws.length = 0;
  assert.equal(pass.draw(identity(), camera).drawCalls, 1);
  assert.equal(draws[0].range[3], 6, 'other source submesh retains its byte offset');
  pass.setInstanceVisible('bowl', true);
  assert.equal(pass.draw(identity(), camera).drawCalls, 2);
  assert.equal(scene.instances[0].model[12], 4, 'immutable authored placement was not moved');
  pass.dispose();
});

test('held or thrown instances preserve source material/range with absolute transforms and supplied clocks', () => {
  const { pass, draws, gl, state } = fixture();
  const matrix = identity(); matrix[0] = -2; matrix[5] = 4; matrix[10] = 8; matrix[12] = 23;
  const result = pass.drawInstance('shuriken', matrix, identity(), camera,
    { scaledTime: 3, unscaledTime: 9, timeScale: .25 });
  assert.equal(result.drawCalls, 1);
  assert.equal(result.sourceBlackCrystalDrawCalls, 1);
  const draw = draws[0];
  assert.equal(draw.range[3], 6);
  assert.deepEqual(draw.uniforms.get('uModel'), matrix);
  assert.deepEqual(draw.uniforms.get('uNormal').map(value => value === 0 ? 0 : value),
    [-.5,0,0, 0,.25,0, 0,0,.125]);
  assert.equal(draw.uniforms.get('uModelSign'), -1);
  assert.deepEqual(draw.uniforms.get('uClock'), [3,9,.25]);
  assert.equal(draw.uniforms.get('uMode'), 1);
  assert.equal(draw.blend, false);
  assert.equal(draw.depthWrite, true);
  assert.equal(state.get(gl.BLEND), true);
  assert.equal(state.get(gl.DEPTH_WRITEMASK), false);
  assert.equal(state.get(gl.DEPTH_FUNC), gl.LESS);
  assert.deepEqual(state.get(gl.COLOR_WRITEMASK), [true,false,true,false]);
  assert.equal(state.get(gl.ACTIVE_TEXTURE), 107);
  assert.equal(pass.draw(identity(), camera).drawCalls, 2, 'explicit draws do not mutate world visibility');
  pass.setInstanceVisible('shuriken', false);
  assert.equal(pass.draw(identity(), camera).drawCalls, 1, 'caller hides the authored placement');
  assert.equal(pass.drawInstance('shuriken', matrix, identity(), camera).drawCalls, 1,
    'hidden authored placements can still be drawn dynamically');
  pass.dispose();
});

test('unknown ids and invalid dynamic matrices fail without hiding an existing source object', () => {
  const { pass } = fixture();
  assert.throws(() => pass.setInstanceVisible('missing', false), /Unknown native world instance/);
  assert.throws(() => pass.setInstanceVisible('bowl', 0), /boolean/);
  assert.throws(() => pass.drawInstance('missing', identity(), identity(), camera), /Unknown native world instance/);
  assert.throws(() => pass.drawInstance('bowl', [1,2,3], identity(), camera), /affine/);
  assert.throws(() => pass.drawInstance('bowl', Array(16).fill(0), identity(), camera), /affine/);
  assert.equal(pass.draw(identity(), camera).drawCalls, 2);
  pass.dispose();
});

test('authored auxiliary shards stay hidden until explicitly submitted or made visible', () => {
  const { pass, draws, scene } = fixture({ withFragment: true });
  assert.equal(scene.instances.length, 2, 'auxiliary geometry does not alter the prepared world budget');
  assert.equal(pass.draw(identity(), camera).drawCalls, 2);
  draws.length = 0;
  const matrix = identity(); matrix[13] = 7;
  const fragment = pass.drawInstance('source-shard', matrix, identity(), camera);
  assert.equal(fragment.drawCalls, 1);
  assert.equal(fragment.triangles, 1);
  assert.equal(fragment.sourceBlackCrystalDrawCalls, 1);
  assert.equal(draws[0].range[3], 6);
  assert.deepEqual(draws[0].uniforms.get('uModel'), matrix);
  assert.equal(pass.draw(identity(), camera).drawCalls, 2, 'dynamic shard draw leaves static visibility alone');
  pass.setInstanceVisible('source-shard', true);
  const visible = pass.draw(identity(), camera);
  assert.equal(visible.drawCalls, 3);
  assert.equal(visible.triangles, 3);
  pass.setInstanceVisible('source-shard', false);
  assert.equal(pass.draw(identity(), camera).drawCalls, 2);
  pass.dispose();
});

test('held source objects reuse the first-person material and projection without pistol attachments', () => {
  const { pass, draws } = fixture({ withFirstPerson: true });
  const matrix = identity(); matrix[12] = .13; matrix[13] = -.17; matrix[14] = 1.5;
  const vp = identity();
  const pistol = pass.drawFirstPersonWeapon(vp, camera, identity());
  assert.equal(pistol.sourceFirstPersonPistolDrawCalls, 1);
  const pistolDraw = draws.at(-1);
  const held = pass.drawHeldInstance('shuriken', matrix, vp, camera);
  const heldDraw = draws.at(-1);
  assert.equal(held.sourceFirstPersonObjectDrawCalls, 1);
  assert.equal(held.sourceFirstPersonPistolDrawCalls, 0);
  assert.equal(held.sourceBlackCrystalDrawCalls, 0);
  assert.equal(held.genericLightingDrawCalls, 0);
  assert.equal(heldDraw.uniforms.get('uMode'), 6);
  assert.equal(heldDraw.range[3], 6, 'held prop retains its own submesh, not the pistol range');
  assert.deepEqual(heldDraw.uniforms.get('uModel'), [...new Float32Array(matrix)]);
  assert.equal(heldDraw.uniforms.get('uFirstPersonProjectionScale'), 1 / Math.tan(20 * Math.PI / 360));
  assert.equal(heldDraw.uniforms.get('uFirstPersonProjectionScale'),
    pistolDraw.uniforms.get('uFirstPersonProjectionScale'));
  assert.deepEqual(heldDraw.uniforms.get('uFirstPersonDepth'), pistolDraw.uniforms.get('uFirstPersonDepth'));
  pass.drawInstance('shuriken', matrix, vp, camera);
  assert.equal(draws.at(-1).uniforms.get('uMode'), 1, 'thrown object restores its source world material');
  assert.equal(pass.draw(vp, camera).drawCalls, 2, 'held rendering does not change explicit world visibility');
  pass.dispose();
});

test('held rendering refuses missing source first-person material instead of drawing world material', () => {
  const { pass, draws } = fixture();
  assert.throws(() => pass.drawHeldInstance('bowl', identity(), identity(), camera),
    /requires source first-person material/);
  assert.equal(draws.length, 0);
  pass.dispose();
});

test('Dojo source warning reaches only layer-8 GPU draw, and switches off without stale cookies', () => {
  const { pass, draws, state, gl } = fixture({ warning: true });
  const packet = {
    id:'level10::7089',active:true,
    spotlight: {
      enabled:true, position:[1,2,3], direction:[0,0,1],
      right:[1,0,0], up:[0,1,0], range:10,intensity:2,
      color:[1,0,0], spotAngle:90,cullingMask:256,
      cookieTextureId:'synthetic-cookie',
    },
  };
  const lit = pass.draw(identity(), camera, {}, [packet]);
  assert.equal(lit.warningPreviewSpotlights, 1);
  assert.equal(lit.warningPreviewDrawCalls, 1);
  assert.equal(lit.nativeLightingParity, false);
  assert.equal(draws[0].uniforms.get('uDoorWarningCount'), 1);
  assert.equal(draws[0].uniforms.get('uDoorRange0'), 10);
  assert.equal(draws[1].uniforms.get('uDoorWarningCount'), 0);
  assert.equal(state.get(gl.ACTIVE_TEXTURE), 107, 'cookie units restore prior binding state');
  draws.length = 0;
  const off = pass.draw(identity(), camera, {}, []);
  assert.equal(off.warningPreviewSpotlights, 0);
  assert.equal(off.warningPreviewDrawCalls, 0);
  assert.equal(draws[0].uniforms.get('uDoorWarningCount'), 0);
  pass.dispose();
});
