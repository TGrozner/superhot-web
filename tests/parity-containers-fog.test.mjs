import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRenderer } from '../src/renderer.js';
import { createGeneratedLighting, lightingUniformPacket } from '../src/render/lighting-model.js';

function createMockWebGL2() {
  const fogValues = [];
  let allocated = 0;
  const gl = {
    VERTEX_SHADER: 35633, FRAGMENT_SHADER: 35632,
    COMPILE_STATUS: 35713, LINK_STATUS: 35714,
    ARRAY_BUFFER: 34962, STATIC_DRAW: 35044,
    FLOAT: 5126, DEPTH_TEST: 2929, BLEND: 3042,
    SRC_ALPHA: 770, ONE_MINUS_SRC_ALPHA: 771,
    CULL_FACE: 2884, COLOR_BUFFER_BIT: 16384, DEPTH_BUFFER_BIT: 256,
    NO_ERROR: 0, TEXTURE0: 33984, TEXTURE_2D: 3553,
    SRGB8_ALPHA8: 35907, RGBA: 6408, UNSIGNED_BYTE: 5121,
    TEXTURE_WRAP_S: 10242, TEXTURE_WRAP_T: 10243, REPEAT: 10497,
    TEXTURE_MIN_FILTER: 10241, TEXTURE_MAG_FILTER: 10240,
    LINEAR_MIPMAP_LINEAR: 9987, LINEAR: 9729,
    isContextLost: () => false, getError: () => 0,
    createTexture: () => ++allocated, activeTexture() {}, bindTexture() {},
    texImage2D() {}, texParameteri() {}, generateMipmap() {}, deleteTexture() {},
    createShader: () => ++allocated,
    shaderSource() {},
    compileShader() {}, getShaderParameter: () => true,
    createProgram: () => ++allocated, attachShader() {}, linkProgram() {},
    getProgramParameter: () => true, useProgram() {}, getUniformLocation: (_, name) => name,
    createVertexArray: () => ++allocated, createBuffer: () => ++allocated,
    bindVertexArray() {}, bindBuffer() {}, bufferData() {},
    getAttribLocation: (_, name) => name === 'aPosition' ? 0 : 1,
    enableVertexAttribArray() {}, vertexAttribPointer() {},
    enable() {}, blendFunc() {}, disable() {},
    viewport() {}, clearColor() {}, clear() {},
    uniform3f() {}, uniform2f() {}, uniform1i() {},
    uniform1f(name, value) { if (name === 'uFogStrength') fogValues.push(value); },
  };
  return { gl, fogValues };
}

test('SH05 WebGL2 fog policy emits the generated default and opt-in zero to the shader', () => {
  const { gl, fogValues } = createMockWebGL2();
  const canvas = {
    clientWidth: 320, clientHeight: 180, width: 320, height: 180,
    getContext: (name) => name === 'webgl2' ? gl : null,
  };
  const previousWindow = globalThis.window;
  globalThis.window = { devicePixelRatio: 1 };
  try {
    const renderer = createRenderer(canvas);
    const camera = { x: 0, y: 2, z: 8, yaw: 0, pitch: 0 };
    renderer.begin(camera);
    renderer.begin(camera, { fogStrength: 0 });
    renderer.begin(camera, { fogStrength: 0.4 });
    assert.deepEqual(fogValues, [
      lightingUniformPacket(createGeneratedLighting()).fogStrength, 0, 0.4,
    ]);
    assert.throws(() => renderer.begin(camera, { fogStrength: Infinity }), RangeError);
    assert.throws(() => renderer.begin(camera, { fogStrength: -0.1 }), RangeError);
    assert.deepEqual(fogValues, [0.72, 0, 0.4]);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('SH05 Containers-specific fog is explicitly opt-in and does not alter default/synthetic routes', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /get\('scene'\) === 'containers'/);
  assert.match(main, /renderer\.begin\(cam, containersPreviewEnabled \? \{ fogStrength: 0 \} : undefined\)/);
  assert.match(main, /CONTAINERS_COLLIDER_PROXY_NOT_MCD_RUNTIME/);
  assert.match(main, /buildSyntheticManifest/);
});
