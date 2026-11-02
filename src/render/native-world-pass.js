import { uploadIndexedMesh } from './gpu-mesh.js';
import { meshModelMatrices } from './mesh-format.js';
import { multiplyMatrices } from '../scenes/graph.js';
import { createNativeSceneMaterialPacket, NATIVE_MATERIAL_GLSL } from './native-material.js';

const vertex = `#version 300 es
precision highp float;
in vec3 aPosition;
in vec3 aNormal;
in vec2 aUV;
in vec4 aColor;
uniform vec2 uSeamDistance;
uniform mat4 uModel, uViewProjection;
uniform mat3 uNormal;
out vec3 vWorld, vNormal;
out vec2 vUV;
out vec4 vSeam;
out float vSeamOverride;
${NATIVE_MATERIAL_GLSL.concreteMainTexture}
void main() {
  vWorld = (uModel * vec4(aPosition, 1.0)).xyz;
  vNormal = uNormal * aNormal;
  vUV = aUV;
  vSeamOverride = nativeConcreteSeamOverride(aColor.rgb);
  vSeam = nativeConcreteSeamVarying(aUV, vWorld, uSeamDistance, vSeamOverride);
  gl_Position = uViewProjection * vec4(vWorld, 1.0);
}`;
const fragment = `#version 300 es
precision highp float;
in vec3 vWorld, vNormal;
in vec2 vUV;
in vec4 vSeam;
in float vSeamOverride;
uniform float uMainTexIsZacieki;
uniform sampler2D uTexture;
uniform vec4 uColor, uST;
uniform vec3 uCamera;
uniform int uMode, uTextured, uHasNormals;
out vec4 outColor;
${NATIVE_MATERIAL_GLSL.blackCrystalReflection}
${NATIVE_MATERIAL_GLSL.concreteMainTexture}
void main() {
  // Unity's Concrete seam and diffuse inputs use the geometric world normal:
  // unlike reflection facing, they must not change as the camera moves.
  vec3 worldNormal = uHasNormals == 1 ? normalize(vNormal) : normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  vec3 reflectionNormal = worldNormal;
  if (dot(reflectionNormal, uCamera - vWorld) < 0.0) reflectionNormal = -reflectionNormal;
  // The reflection address/power are recovered; the direction and illumination
  // here remain Web reconstruction, not the native shader's full varying path.
  if (uMode == 1 && uTextured == 1) {
    float level = nativeBlackCrystalReflectionLevel(uTexture, reflect(normalize(vWorld - uCamera), reflectionNormal));
    outColor = vec4(vec3(level), 1.0);
    return;
  }
  vec4 albedo = vec4(1.0);
  if (uTextured == 1) {
    if (uMode == 2) {
      albedo.rgb = nativeConcreteMainTextureFactor(uTexture, vUV * uST.xy + uST.zw,
        vSeam, vSeamOverride, worldNormal.y, uMainTexIsZacieki);
    } else albedo = texture(uTexture, vUV * uST.xy + uST.zw);
  }
  float light = 0.64 + 0.36 * max(dot(worldNormal, normalize(vec3(-0.55, 0.9, 0.42))), 0.0);
  vec3 rgb = albedo.rgb * uColor.rgb * light;
  // Native compiled forward-base materials are opaque; serialized _Alpha\n  // is a shader parameter, not framebuffer blending opacity.\n  outColor = vec4(rgb, uMode == 2 ? 1.0 : uColor.a * albedo.a);
}`;

/**
 * Apply the recovered compiled FORWARDBASE state only for identified,
 * source-qualified opaque material packets. The shared Web renderer enables
 * SRC_ALPHA blending and uses default LESS; neither matches these pass
 * candidates. Culling is deliberately left to SH-12/SH-05 until source OBJ
 * winding and reflection matrices have been verified in a real browser draw.
 * This is compiled-pass evidence, NOT proof of the variant used by native MCD.
 */
export function applyNativeWorldBaseState(gl, pass, inherited) {
  const base = pass?.base;
  const sourceOpaque = pass?.alphaMode === 'opaque'
    && base?.lightMode === 'forward-base'
    && base.sourceBlend === 'one'
    && base.destinationBlend === 'zero'
    && base.depthWrite === true
    && base.depthTest === 'less-equal';
  if (sourceOpaque) {
    gl.disable(gl.BLEND);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
  } else {
    if (inherited.blend) gl.enable(gl.BLEND);
    else gl.disable(gl.BLEND);
    gl.depthFunc(inherited.depthFunc);
    gl.depthMask(inherited.depthMask);
  }
  return sourceOpaque;
}

function shader(gl, type, source) {
  const s = gl.createShader(type);
  gl.shaderSource(s, source); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error(message);
  }
  return s;
}

/** Caller supplies private decoded assets. No asset URLs or original data are embedded. */
export function createNativeWorldPass(gl, scene, images) {
  const program = gl.createProgram(), meshes = new Map(), textures = new Map();
  const shaders = [];
  const colorBuffers = [];
  const oldActiveTexture = gl.getParameter(gl.ACTIVE_TEXTURE);
  gl.activeTexture(gl.TEXTURE0);
  const oldProgram = gl.getParameter(gl.CURRENT_PROGRAM);
  const oldTexture = gl.getParameter(gl.TEXTURE_BINDING_2D);
  function dispose() {
    for (const mesh of meshes.values()) mesh.dispose();
    for (const texture of textures.values()) gl.deleteTexture(texture);
    for (const buffer of colorBuffers) gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
  }
  let packets;
  try {
    shaders.push(shader(gl, gl.VERTEX_SHADER, vertex));
    shaders.push(shader(gl, gl.FRAGMENT_SHADER, fragment));
    for (const s of shaders) gl.attachShader(program, s);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    const colorLocation = gl.getAttribLocation(program, 'aColor');
    const previousVao = gl.getParameter(gl.VERTEX_ARRAY_BINDING);
    const previousBuffer = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
    try {
      for (const [id, source] of scene.meshes) {
        const mesh = uploadIndexedMesh(gl, program, source.mesh);
        meshes.set(id, mesh);
        gl.bindVertexArray(mesh.vao);
        if (source.color0) {
          const buffer = gl.createBuffer();
          if (!buffer) throw new Error('Native COLOR0 GPU allocation failed');
          colorBuffers.push(buffer);
          gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
          gl.bufferData(gl.ARRAY_BUFFER, source.color0, gl.STATIC_DRAW);
          gl.enableVertexAttribArray(colorLocation);
          gl.vertexAttribPointer(colorLocation, 4, gl.FLOAT, false, 16, 0);
        } else {
          gl.disableVertexAttribArray(colorLocation);
        }
      }
    } finally { gl.bindVertexArray(previousVao); gl.bindBuffer(gl.ARRAY_BUFFER, previousBuffer); }
    packets = new Map();
    for (const instance of scene.instances) {
      for (const draw of instance.draws) {
        const source = scene.materialMap.get(draw.materialId);
        const packet = createNativeSceneMaterialPacket(source, {
          renderCategory: instance.classification.category,
          meshHasUv0: scene.meshes.get(draw.meshId).hasUV,
        });
        const binding = packet.texture ?? (scene.meshes.get(draw.meshId).hasUV ? source.textures?._MainTex : null);
        const textureId = binding?.sample === false ? null : binding?.textureId;
        if (textureId && !textures.has(textureId)) {
          const image = images.get(textureId);
          if (!image) throw new Error('Missing private scene texture: ' + textureId);
          const texture = gl.createTexture(); textures.set(textureId, texture);
          gl.bindTexture(gl.TEXTURE_2D, texture);
          // The original project uses Gamma color space; authored sRGB bytes
          // are not evidence for an sRGB-decoding native resource view.
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, image);
          const point = packet.family === 'concrete-2019-main';
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, point ? gl.NEAREST : gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, point ? gl.NEAREST : gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 0);
        }
        const color = source.colors?._Color ?? [1, 1, 1, 1];
        const st = packet.texture?.serializedUvTransform ?? [...(binding?.scale ?? [1, 1]), ...(binding?.offset ?? [0, 0])];
        packets.set(draw, { color, st, textureId, reflection: packet.family === 'black-crystal',
          concrete: packet.family === 'concrete-2019-main',
          seamDistance: [source.floats?._SeamHorizontalDistance ?? 1, source.floats?._SeamVerticalDistance ?? 1],
          streaks: source.floats?._MainTexIsZacieki ?? 0, packet });
      }
    }
    const error = gl.getError();
    if (error !== gl.NO_ERROR) throw new Error('Native world GPU upload failed: ' + error);
  } catch (error) { dispose(); throw error; }
  finally {
    for (const s of shaders) gl.deleteShader(s);
    gl.useProgram(oldProgram); gl.bindTexture(gl.TEXTURE_2D, oldTexture);
    gl.activeTexture(oldActiveTexture);
  }
  const uniforms = {};
  for (const name of ['uModel', 'uViewProjection', 'uNormal', 'uTexture', 'uColor', 'uST', 'uCamera', 'uMode', 'uTextured', 'uHasNormals', 'uSeamDistance', 'uMainTexIsZacieki']) uniforms[name] = gl.getUniformLocation(program, name);
  const identity = [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  let weaponLocal = identity;
  // First link is the authored pickup placement, not the held model's offset.
  for (const link of scene.pistol.source.attachmentChain.slice(1)) weaponLocal = multiplyMatrices(weaponLocal, link.localMatrix);
  function render(viewProjection, camera, weaponMatrix = null) {
    const previousProgram = gl.getParameter(gl.CURRENT_PROGRAM), previousVao = gl.getParameter(gl.VERTEX_ARRAY_BINDING);
    const previousActive = gl.getParameter(gl.ACTIVE_TEXTURE);
    const previousColorMask = gl.getParameter(gl.COLOR_WRITEMASK);
    const inheritedState = {
      blend: gl.isEnabled(gl.BLEND),
      depthFunc: gl.getParameter(gl.DEPTH_FUNC),
      depthMask: gl.getParameter(gl.DEPTH_WRITEMASK),
    };
    gl.activeTexture(gl.TEXTURE0);
    const previousTexture = gl.getParameter(gl.TEXTURE_BINDING_2D);
    let drawCalls = 0, triangles = 0;
    try {
      gl.useProgram(program);
      gl.uniformMatrix4fv(uniforms.uViewProjection, false, viewProjection);
      gl.uniform3f(uniforms.uCamera, camera.x, camera.y, camera.z);
      gl.uniform1i(uniforms.uTexture, 0);
      gl.vertexAttrib4f(gl.getAttribLocation(program, 'aColor'), 0, 0, 0, 1);
      const instances = weaponMatrix ? [scene.pistol.instance] : scene.instances;
      for (const instance of instances) {
        const transform = weaponMatrix ? meshModelMatrices(multiplyMatrices(weaponMatrix, weaponLocal)) : instance;
        gl.uniformMatrix4fv(uniforms.uModel, false, transform.model);
        gl.uniformMatrix3fv(uniforms.uNormal, false, transform.normal);
        gl.uniform1i(uniforms.uHasNormals, scene.meshes.get(instance.meshId).hasNormals ? 1 : 0);
        for (const draw of instance.draws) {
          const material = packets.get(draw);
          applyNativeWorldBaseState(gl, material.packet.pass, inheritedState);
          gl.uniform4fv(uniforms.uColor, material.color);
          gl.uniform4fv(uniforms.uST, material.st);
          gl.uniform1i(uniforms.uMode, material.reflection ? 1 : material.concrete ? 2 : 0);
          gl.uniform2fv(uniforms.uSeamDistance, material.seamDistance);
          gl.uniform1f(uniforms.uMainTexIsZacieki, material.streaks);
          gl.colorMask(true, true, true, !material.reflection);
          gl.uniform1i(uniforms.uTextured, material.textureId ? 1 : 0);
          if (material.textureId) gl.bindTexture(gl.TEXTURE_2D, textures.get(material.textureId));
          meshes.get(draw.meshId).draw(draw.range);
          drawCalls++; triangles += draw.range.indexCount / 3;
        }
      }
    } finally {
      gl.bindTexture(gl.TEXTURE_2D, previousTexture);
      gl.activeTexture(previousActive);
      gl.colorMask(...previousColorMask);
      if (inheritedState.blend) gl.enable(gl.BLEND);
      else gl.disable(gl.BLEND);
      gl.depthFunc(inheritedState.depthFunc);
      gl.depthMask(inheritedState.depthMask);
      gl.bindVertexArray(previousVao); gl.useProgram(previousProgram);
    }
    return { drawCalls, triangles, nativeGeometry: true, nativeMaterialParity: false };
  }
  return { draw: (vp, camera) => render(vp, camera), drawWeapon: (vp, camera, matrix) => render(vp, camera, matrix), dispose };
}
