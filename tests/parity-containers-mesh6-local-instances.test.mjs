import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer } from '../src/renderer.js';
import { assessContainersBrowserMetrics } from '../scripts/integration-vertical.mjs';
import { makeCylinderMesh } from '../src/render/mesh-format.js';
import { planLocalMesh6Draws } from '../src/scenes/containers-mesh6-local-plan.js';
import { drawContainersBuild28Preview } from '../src/levels.js';
import { CONTAINERS_BUILD28_DEMO_CAMERA } from '../src/scenes/containers-build28.js';

function mockWebGL2() {
  const models = [], draws = [], buffers = [], attributes = [], drawStates = [];
  const textures = new Set(), deletedTextures = [], uploads = [], parameters = [];
  const uniforms = new Map();
  let next = 1, vao = null, buffer = null, texture = null, error = 0;
  const recordDraw = (indexed) => drawStates.push({
    indexed, texture, textured: uniforms.get('uUseTexture'),
    color: uniforms.get('uColor'), st: uniforms.get('uTextureST'),
  });
  const gl = {
    VERTEX_SHADER: 35633, FRAGMENT_SHADER: 35632, COMPILE_STATUS: 35713,
    LINK_STATUS: 35714, ARRAY_BUFFER: 34962, ELEMENT_ARRAY_BUFFER: 34963,
    ARRAY_BUFFER_BINDING: 34964, VERTEX_ARRAY_BINDING: 34229,
    STATIC_DRAW: 35044, FLOAT: 5126, UNSIGNED_SHORT: 5123, UNSIGNED_INT: 5125,
    TRIANGLES: 4, DEPTH_TEST: 2929, BLEND: 3042, SRC_ALPHA: 770,
    ONE_MINUS_SRC_ALPHA: 771, CULL_FACE: 2884,
    COLOR_BUFFER_BIT: 16384, DEPTH_BUFFER_BIT: 256,
    NO_ERROR: 0, OUT_OF_MEMORY: 1285, TEXTURE0: 33984, TEXTURE_2D: 3553,
    SRGB8_ALPHA8: 35907, RGBA: 6408, UNSIGNED_BYTE: 5121, MAX_TEXTURE_SIZE: 3379,
    TEXTURE_WRAP_S: 10242, TEXTURE_WRAP_T: 10243, REPEAT: 10497,
    TEXTURE_MIN_FILTER: 10241, TEXTURE_MAG_FILTER: 10240,
    LINEAR_MIPMAP_LINEAR: 9987, LINEAR: 9729,
    failAllocation: false, failUpload: false, uploadError: 0, contextLost: false,
    isContextLost() { return this.contextLost; },
    getError() { const result = error; error = 0; return result; },
    createTexture() {
      if (this.failAllocation) return null;
      const result = ++next; textures.add(result); return result;
    },
    activeTexture(unit) { assert.equal(unit, this.TEXTURE0); },
    bindTexture(_, value) { texture = value; },
    texImage2D(...args) {
      if (this.failUpload) throw new Error('Simulated upload failure');
      uploads.push(args); error = this.uploadError;
    },
    texParameteri(...args) { parameters.push(args); },
    generateMipmap(target) { assert.equal(target, this.TEXTURE_2D); },
    deleteTexture(value) { textures.delete(value); deletedTextures.push(value); },
    createShader: () => ++next, shaderSource() {}, compileShader() {},
    getShaderParameter: () => true, createProgram: () => ++next,
    attachShader() {}, linkProgram() {}, getProgramParameter: () => true,
    useProgram() {}, getUniformLocation: (_, key) => key,
    createVertexArray: () => ++next, createBuffer: () => ++next,
    bindVertexArray(v) { vao = v; }, bindBuffer(k, v) { if (k === this.ARRAY_BUFFER) buffer = v; },
    getParameter(k) {
      if (k === this.MAX_TEXTURE_SIZE) return 4096;
      return k === this.VERTEX_ARRAY_BINDING ? vao : buffer;
    },
    bufferData(k, payload) { buffers.push([k, payload.length]); },
    getAttribLocation: (_, name) => ({ aPosition: 0, aNormal: 1, aUV: 2 }[name] ?? -1),
    enableVertexAttribArray() {},
    vertexAttribPointer(...args) { attributes.push(args); },
    enable() {}, disable() {}, blendFunc() {},
    viewport() {}, clearColor() {}, clear() {}, uniform3f() {}, uniform2f() {},
    uniform1i(key, value) { uniforms.set(key, value); }, uniform1f() {},
    uniform4f(key, ...values) { uniforms.set(key, values); },
    uniformMatrix4fv(_, transpose, value) {
      assert.equal(transpose, false);
      models.push(Array.from(value));
    },
    uniformMatrix3fv() {},
    drawArrays() { recordDraw(false); },
    drawElements(...args) { draws.push(args); recordDraw(true); },
    deleteVertexArray() {}, deleteBuffer() {},
  };
  return { gl, models, draws, buffers, attributes, drawStates,
    textures, deletedTextures, uploads, parameters };
}
test('one generated indexed source upload supports three per-draw affine transforms', () => {
  const { gl, models, draws, buffers } = mockWebGL2();
  const canvas = {
    clientWidth: 320, clientHeight: 180, width: 320, height: 180,
    getContext: (kind) => kind === 'webgl2' ? gl : null,
  };
  const saved = globalThis.window;
  globalThis.window = { devicePixelRatio: 1 };
  try {
    const renderer = createRenderer(canvas);
    const mesh = makeCylinderMesh({ segments: 8 }); // SYNTHETIC, never source OBJ.
    renderer.replacePrivateMesh('mesh6', mesh);
    renderer.begin(CONTAINERS_BUILD28_DEMO_CAMERA);
    const plan = planLocalMesh6Draws({ group47Loaded: true });
    plan.drawPackets.forEach(packet =>
      assert.equal(renderer.drawPrivateMesh('mesh6', '#485761', packet.modelMatrix), true));
    assert.equal(renderer.getDrawCalls(), 3);
    assert.equal(draws.length, 3);
    assert.equal(models.length, 3);
    assert.deepEqual(models.map(m => m.slice(12, 15).map(n => +n.toFixed(3))),
      [[0,0,0],[-7.35,0,4.5],[-1.4,-.05,-25.2]]);
    assert.equal(buffers.filter(([kind]) => kind === gl.ELEMENT_ARRAY_BUFFER).length, 1,
      'one source upload, one EBO, three indexed draws');
    assert.throws(() => renderer.drawPrivateMesh('mesh6', '#485761', Array(16).fill(0)),
      /affine 4x4/);
    assert.equal(draws.length, 3, 'invalid matrix does not trigger a draw');
  } finally {
    if (saved === undefined) delete globalThis.window;
    else globalThis.window = saved;
  }
});

test('local albedo uses shared UV texture state only for both private mesh slots', () => {
  const { gl, attributes, drawStates, textures, deletedTextures, uploads, parameters } = mockWebGL2();
  const renderer = createRenderer({ getContext: () => gl });
  const mesh = makeCylinderMesh({ segments: 8 });
  renderer.replacePrivateMesh('mesh6', mesh);
  renderer.replacePrivateMesh('mesh7', mesh);
  assert.equal(attributes.filter(([location, size, , , stride, offset]) =>
    location === 2 && size === 2 && stride === 32 && offset === 24).length, 2);
  renderer.drawPrivateMesh('mesh6', '#485761');
  assert.equal(drawStates.at(-1).textured, 0);
  assert.deepEqual(drawStates.at(-1).color, [72 / 255, 87 / 255, 97 / 255, 1]);
  const image = { width: 128, height: 64, close() { assert.fail('Caller owns bitmap'); } };
  assert.deepEqual(renderer.replacePrivateTexture(image), { width: 128, height: 64 });
  assert.equal(uploads.at(-1)[2], gl.SRGB8_ALPHA8);
  assert.equal(uploads.at(-1).at(-1), image);
  assert.deepEqual(parameters.slice(-4), [
    [gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT],
    [gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT],
    [gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR],
    [gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR],
  ]);
  renderer.drawPrivateMesh('mesh6', '#485761');
  renderer.box(0, 0, 0, 1, 1, 1, '#123456');
  renderer.drawPrivateMesh('mesh7', '#485761');
  renderer.shard(0, 0, 0, 1, 1, 1, '#123456');
  renderer.drawPrivateMesh('mesh6', '#485761');
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  renderer.affineBox(identity, { x: 1, y: 1, z: 1 }, '#123456');
  const sequence = drawStates.slice(1);
  assert.deepEqual(sequence.map(d => d.textured), [1, 0, 1, 0, 1, 0]);
  assert.deepEqual(sequence.map(d => d.indexed), [true, false, true, false, true, false]);
  for (const draw of sequence) {
    assert.deepEqual(draw.color, draw.textured ? [1, 1, 1, 1] : [18 / 255, 52 / 255, 86 / 255, 1]);
    assert.deepEqual(draw.st, [0.1, 0.1, 0, 0]);
  }
  assert.equal(new Set(sequence.map(d => d.texture)).size, 1);
  const firstTexture = sequence[0].texture;
  renderer.replacePrivateTexture(image, { scale: [0.2, 0.3], offset: [0.4, 0.5] });
  renderer.drawPrivateMesh('mesh7', '#485761');
  assert.deepEqual(drawStates.at(-1).st, [0.2, 0.3, 0.4, 0.5]);
  assert.notEqual(drawStates.at(-1).texture, firstTexture);
  assert.ok(deletedTextures.includes(firstTexture));
  assert.equal(textures.size, 1, 'only the current texture remains allocated');
});

test('invalid images and GPU failures retain the previous local texture without leaks', () => {
  const { gl, drawStates, textures, uploads } = mockWebGL2();
  const renderer = createRenderer({ getContext: () => gl });
  renderer.replacePrivateMesh('mesh6', makeCylinderMesh({ segments: 8 }));
  const image = { width: 32, height: 32 };
  renderer.replacePrivateTexture(image);
  renderer.drawPrivateMesh('mesh6', '#485761');
  const previous = drawStates.at(-1);
  const uploadCount = uploads.length;
  for (const size of [0, -1, 4097, Infinity, 1.5]) {
    assert.throws(() => renderer.replacePrivateTexture({ width: size, height: 32 }), RangeError);
    assert.throws(() => renderer.replacePrivateTexture({ width: 32, height: size }), RangeError);
  }
  assert.throws(() => renderer.replacePrivateTexture(image, { scale: [Infinity, 1] }), TypeError);
  assert.throws(() => renderer.replacePrivateTexture(image, { offset: [0] }), TypeError);
  assert.equal(uploads.length, uploadCount);
  for (const failure of ['failAllocation', 'failUpload', 'uploadError', 'contextLost']) {
    gl[failure] = failure === 'uploadError' ? gl.OUT_OF_MEMORY : true;
    assert.throws(() => renderer.replacePrivateTexture(image, { scale: [2, 2] }), /WebGL2|Simulated/);
    gl[failure] = failure === 'uploadError' ? 0 : false;
    renderer.drawPrivateMesh('mesh6', '#485761');
    assert.deepEqual(drawStates.at(-1), previous);
    assert.equal(textures.size, 1, `${failure} does not leak a candidate texture`);
  }
});
test('local mesh6 proxy omission affects only its two sourced generated hulls and ribs', () => {
  const camera = CONTAINERS_BUILD28_DEMO_CAMERA;
  const all = drawContainersBuild28Preview({ box() {} }, camera);
  const plan = planLocalMesh6Draws({ group47Loaded: true });
  const draws = [];
  const reduced = drawContainersBuild28Preview({ box: (...args) => draws.push(args) }, camera,
    { omitCargoIds: plan.omitGeneratedProxyIds });
  assert.deepEqual(plan.omitGeneratedProxyIds, ['cargo-22', 'cargo-7']);
  assert.ok(reduced.hiddenByPrivateMesh > 0);
  assert.ok(reduced.visible < all.visible);
  assert.equal(reduced.visible, draws.length);
  assert.equal(reduced.collisionConnected, false);
  assert.equal(reduced.nativeMeshMatch, false);
});

test('browser telemetry distinguishes two local OBJ files from four indexed instance draws', () => {
  const telemetry = {
    mode: 'CONTAINERS_COLLIDER_PROXY_NOT_MCD_RUNTIME',
    browserMeasured: true,
    locallyLoadedSourceGroups: 2,
    generatedManifest: {
      privateIndexedDraws: 4, sourceQualifiedMesh6DrawPackets: 3,
      hiddenByPrivateMesh: 27,
    },
    totalWebGLDrawCalls: 42, p95FrameMs: 18.6,
  };
  const report = assessContainersBrowserMetrics(telemetry);
  assert.equal(report.status, 'APP_REPORTED_INDEXED_MESH_DRAWS');
  assert.equal(report.reportedSourceGroups, 2);
  assert.equal(report.reportedPrivateIndexedDraws, 4);
  assert.equal(report.sourceMatchedHullFraction, '3/5');
  assert.equal(report.browserScreenshotCaptured, false);
  assert.equal(report.nativeParityVerdict, 'UNASSESSED');
  assert.equal(assessContainersBrowserMetrics({
    ...telemetry, generatedManifest: {
      ...telemetry.generatedManifest, sourceQualifiedMesh6DrawPackets: 2,
    },
  }).status, 'INVALID_COUNTERS');
});
