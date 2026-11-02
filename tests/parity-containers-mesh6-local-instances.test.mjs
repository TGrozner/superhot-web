import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer } from '../src/renderer.js';
import { assessContainersBrowserMetrics } from '../scripts/integration-vertical.mjs';
import { makeCylinderMesh } from '../src/render/mesh-format.js';
import { planLocalMesh6Draws } from '../src/scenes/containers-mesh6-local-plan.js';
import { drawContainersBuild28Preview } from '../src/levels.js';
import { CONTAINERS_BUILD28_DEMO_CAMERA } from '../src/scenes/containers-build28.js';

function mockWebGL2() {
  const models = [], draws = [], buffers = [];
  let next = 1, vao = null, buffer = null;
  const gl = {
    VERTEX_SHADER: 35633, FRAGMENT_SHADER: 35632, COMPILE_STATUS: 35713,
    LINK_STATUS: 35714, ARRAY_BUFFER: 34962, ELEMENT_ARRAY_BUFFER: 34963,
    ARRAY_BUFFER_BINDING: 34964, VERTEX_ARRAY_BINDING: 34229,
    STATIC_DRAW: 35044, FLOAT: 5126, UNSIGNED_SHORT: 5123, UNSIGNED_INT: 5125,
    TRIANGLES: 4, DEPTH_TEST: 2929, BLEND: 3042, SRC_ALPHA: 770,
    ONE_MINUS_SRC_ALPHA: 771, CULL_FACE: 2884,
    COLOR_BUFFER_BIT: 16384, DEPTH_BUFFER_BIT: 256,
    createShader: () => ++next, shaderSource() {}, compileShader() {},
    getShaderParameter: () => true, createProgram: () => ++next,
    attachShader() {}, linkProgram() {}, getProgramParameter: () => true,
    useProgram() {}, getUniformLocation: (_, key) => key,
    createVertexArray: () => ++next, createBuffer: () => ++next,
    bindVertexArray(v) { vao = v; }, bindBuffer(k, v) { if (k === this.ARRAY_BUFFER) buffer = v; },
    getParameter(k) { return k === this.VERTEX_ARRAY_BINDING ? vao : buffer; },
    bufferData(k, payload) { buffers.push([k, payload.length]); },
    getAttribLocation: (_, name) => ({ aPosition: 0, aNormal: 1, aUV: 2 }[name] ?? -1),
    enableVertexAttribArray() {}, vertexAttribPointer() {},
    enable() {}, disable() {}, blendFunc() {},
    viewport() {}, clearColor() {}, clear() {}, uniform3f() {}, uniform2f() {},
    uniform1i() {}, uniform1f() {}, uniform4f() {},
    uniformMatrix4fv(_, transpose, value) {
      assert.equal(transpose, false);
      models.push(Array.from(value));
    },
    uniformMatrix3fv() {},
    drawArrays() {},
    drawElements(...args) { draws.push(args); },
    deleteVertexArray() {}, deleteBuffer() {},
  };
  return { gl, models, draws, buffers };
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
