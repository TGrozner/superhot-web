import { uploadIndexedMesh } from './gpu-mesh.js';
import { meshModelMatrices } from './mesh-format.js';
import { multiplyMatrices } from '../scenes/graph.js';
import { createNativeSceneMaterialPacket, NATIVE_MATERIAL_GLSL } from './native-material.js';
import {
  sliceContainersBuild28LightmapBc3Mips,
  containersBuild28LightmapBc3GpuPacket,
} from './material-model.js';

const vertex = `#version 300 es
precision highp float;
in vec3 aPosition;
in vec3 aNormal;
in vec2 aUV;
in vec2 aLightmapUV;
in vec4 aColor;
in vec4 aTangent;
uniform vec2 uSeamDistance;
uniform mat4 uModel, uViewProjection;
uniform mat3 uNormal;
uniform vec3 uCamera;
uniform float uModelSign;
out vec3 vWorld, vNormal, vTangent, vBitangent;
out vec2 vUV, vLightmapUV, vMicroView;
out vec4 vSeam, vColorControls;
out float vSeamOverride;
${NATIVE_MATERIAL_GLSL.concreteMainTexture}
void main() {
  vWorld = (uModel * vec4(aPosition, 1.0)).xyz;
  vNormal = normalize(uNormal * aNormal);
  vTangent = normalize(mat3(uModel) * aTangent.xyz);
  vBitangent = normalize(cross(vNormal, vTangent) * aTangent.w * uModelSign);
  vUV = aUV;
  vLightmapUV = aLightmapUV;
  vSeamOverride = nativeConcreteSeamOverride(aColor.rgb);
  vec3 sourceWorld = vec3(-vWorld.x, vWorld.y, vWorld.z);
  vSeam = nativeConcreteSeamVarying(aUV, sourceWorld, uSeamDistance, vSeamOverride);
  vec3 viewDirection = normalize(uCamera - vWorld);
  vec2 tangentView = vec2(dot(viewDirection, vTangent), dot(viewDirection, vBitangent));
  vMicroView = mix(tangentView, vec2(-viewDirection.x, viewDirection.z), vSeamOverride);
  float redFlag = aColor.r > 0.95 && aColor.g + aColor.b < 0.05 ? 1.0 : 0.0;
  float blueBias = aColor.b < 0.9 ? aColor.b * 10.0 : 0.0;
  float blueOverride = aColor.b > 0.9 && aColor.b < 0.95 ? 1.0 : 0.0;
  vColorControls = vec4(vSeamOverride, blueBias, redFlag, blueOverride);
  gl_Position = uViewProjection * vec4(vWorld, 1.0);
}`;
const fragment = `#version 300 es
precision highp float;
in vec3 vWorld, vNormal, vTangent, vBitangent;
in vec2 vUV, vLightmapUV, vMicroView;
in vec4 vSeam, vColorControls;
in float vSeamOverride;
uniform float uMainTexIsZacieki;
uniform sampler2D uTexture, uLightmap, uMicroseam, uPore, uFogGradient;
uniform vec4 uColor, uST, uLightmapST;
uniform vec4 uLightLocalAmbient, uLightLocalMinusAmbient, uDynamicAmbient;
uniform vec4 uFogColor;
uniform vec3 uCamera, uWorldSpaceLightDirection;
uniform vec2 uLightmapDecode, uScreen;
uniform float uAmbientMultiplier, uAttenuationOutsideShadowDistance;
uniform float uFogScale, uFogPower, uSecondaryFogDistance;
uniform int uMode, uTextured, uHasNormals, uHasTangents, uLightmapped;
out vec4 outColor;
${NATIVE_MATERIAL_GLSL.blackCrystalReflection}
${NATIVE_MATERIAL_GLSL.concreteMainTexture}
${NATIVE_MATERIAL_GLSL.concreteForwardBase}
void main() {
  vec3 n = uMode == 2 && uHasNormals == 1
    ? vNormal
    : (uHasNormals == 1 ? normalize(vNormal) : normalize(cross(dFdx(vWorld), dFdy(vWorld))));
  // Only the reflection normal faces the camera; Concrete and diffuse stay geometric.
  vec3 reflectionNormal = n;
  if (dot(reflectionNormal, uCamera - vWorld) < 0.0) reflectionNormal = -reflectionNormal;
  if (uMode == 1 && uTextured == 1) {
    float level = nativeBlackCrystalReflectionLevel(uTexture, reflect(normalize(vWorld - uCamera), reflectionNormal));
    outColor = vec4(vec3(level), 1.0);
    return;
  }
  vec4 albedo = vec4(1.0);
  if (uTextured == 1) {
    if (uMode == 2) {
      albedo.rgb = nativeConcreteMainTextureFactor(uTexture, vUV * uST.xy + uST.zw,
        vSeam, vSeamOverride, n.y, uMainTexIsZacieki);
    } else albedo = texture(uTexture, vUV * uST.xy + uST.zw);
  }
  bool sourceConcrete = uMode == 2 && uTextured == 1 && uLightmapped == 1 &&
    uHasNormals == 1 && uHasTangents == 1;
  if (sourceConcrete) {
    vec2 atlasUV = vLightmapUV * uLightmapST.xy + uLightmapST.zw;
    vec4 encoded = texture(uLightmap, atlasUV);
    vec2 seamDistance = vSeam.zw;
    vec4 micro = texture(uMicroseam,
      nativeConcreteMicroseamUv(vSeam.xy, seamDistance, vMicroView));
    vec3 viewDirection = normalize(uCamera - vWorld);
    float distanceToCamera = length(uCamera - vWorld);
    vec3 sourceWorld = vec3(-vWorld.x, vWorld.y, vWorld.z);
    vec3 sourceView = vec3(-viewDirection.x, viewDirection.y, viewDirection.z);
    vec3 sourceNormal = vec3(-n.x, n.y, n.z);
    float poreOffset = micro.b * 0.005 *
      (sourceView.z * sourceNormal.x - sourceView.x * sourceNormal.z);
    vec3 poreCell = fract(sourceWorld * 0.3 + vec3(poreOffset, 0.0, poreOffset));
    vec2 poreUv = poreCell.xz;
    if (abs(n.x) > 0.5) poreUv = poreCell.yz;
    if (abs(n.z) > 0.5) poreUv = poreCell.xy;
    vec4 poreNear = texture(uPore, poreUv);
    vec4 poreFar = texture(uPore, poreUv * 3.0);
    float poreBlend = clamp(1.3 - distanceToCamera * 0.3, 0.0, 1.0);
    vec4 pore = mix(poreNear, poreFar, poreBlend);
    vec3 poreNormalTs = pore.rgb * 2.0 - 1.0;
    vec3 poreNormal = vTangent * poreNormalTs.x +
      vBitangent * poreNormalTs.y + n * poreNormalTs.z;
    float porePower = pore.a * 0.1 + 0.9;
    vec4 accumulated = nativeConcreteAccumulatedLight(
      uLightLocalAmbient, uLightLocalMinusAmbient, uAmbientMultiplier,
      uDynamicAmbient, vColorControls.z, encoded, uLightmapDecode.x);
    vec3 baseLit = albedo.rgb * porePower * accumulated.rgb;
    float ndl = dot(poreNormal, normalize(uWorldSpaceLightDirection));
    float ndv = dot(viewDirection, n);
    vec3 capColor = vec3(0.876, 0.936, 0.936) +
      vec3(0.084) * clamp(ndl * ndl * ndl, 0.0, 1.0);
    vec3 capped = min(baseLit, capColor);
    float rim = (1.0 - abs(ndl));
    rim = rim * rim * rim * 0.05;
    vec3 stylized = vec3(
      capped.r + min(rim, 0.02),
      capped.g + min(rim, 0.01),
      capped.b
    );
    stylized += micro.r * 0.1 - micro.g * 0.15;
    float aspect = uScreen.x / uScreen.y;
    vec2 screenUv = gl_FragCoord.xy / uScreen;
    float stripe = fract((screenUv.x * aspect - screenUv.y) * 120.0);
    stripe = abs(stripe - 0.5) + 0.5;
    stylized += stripe * stripe * 0.0354;
    stylized += (poreNormalTs.x + poreNormalTs.y) * 0.1;
    if (poreNormalTs.x > 0.0) stylized += poreNormalTs.x * 0.3;
    float ambientShape = min(accumulated.a * accumulated.a, 1.0) * 0.55 + 0.7;
    ambientShape *= 0.96;
    float lightmapRed = encoded.r * encoded.a * uLightmapDecode.x * 0.3;
    float brightness = (ambientShape + (1.0 - clamp(ndv, 0.0, 1.0)) * 0.2) * 0.7
      + lightmapRed;
    brightness += micro.r;
    float direct = clamp(ndl * 2.0 - 0.5, 0.0, 1.0);
    direct = direct * direct * 0.255 * (ndl > 0.0 ? 1.0 : 0.0);
    brightness += direct;
    brightness = mix(brightness, 0.8, 0.5);
    float poreCurve = clamp(porePower * porePower * porePower + 0.1, 0.0, 1.0);
    vec3 directColor = clamp(albedo.rgb * 0.4 + 0.6, 0.0, 1.0) *
      (brightness * poreCurve);
    if (poreNormalTs.x > 0.3) directColor = vec3(0.9, 0.9, 0.7);
    directColor = clamp(directColor, 0.0, 1.0);
    float directMix = ndl > 0.0 ? uAttenuationOutsideShadowDistance : 0.0;
    vec3 rgb = mix(stylized, directColor, directMix);
    rgb = clamp(rgb, 0.0, 1.0) + vColorControls.y;
    rgb = mix(rgb, vec3(ndv * 0.7 + 0.3, 0.0, 0.0), vColorControls.w);
    rgb = nativeConcreteLocalFog(rgb, uFogGradient, vWorld, uCamera,
      uFogColor.rgb, uFogScale, uFogPower, uSecondaryFogDistance);
    outColor = vec4(rgb, 1.0);
    return;
  }
  float generic = 0.64 + 0.36 * max(dot(n, normalize(vec3(-0.55, 0.9, 0.42))), 0.0);
  vec3 rgb = albedo.rgb * uColor.rgb * generic;
  outColor = vec4(rgb, uMode == 2 ? 1.0 : uColor.a * albedo.a);
}`;

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
  const attributeBuffers = [];
  const lightmapUploads = new Map();
  const oldActiveTexture = gl.getParameter(gl.ACTIVE_TEXTURE);
  const oldTextureBindings = [];
  for (let unit = 0; unit < 5; unit++) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    oldTextureBindings.push(gl.getParameter(gl.TEXTURE_BINDING_2D));
  }
  gl.activeTexture(gl.TEXTURE0);
  const oldProgram = gl.getParameter(gl.CURRENT_PROGRAM);
  function dispose() {
    for (const mesh of meshes.values()) mesh.dispose();
    for (const texture of textures.values()) gl.deleteTexture(texture);
    for (const buffer of attributeBuffers) gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
  }
  function uploadTexture(textureId, { point = false, clamp = false } = {}) {
    if (!textureId || textures.has(textureId)) return;
    const image = images.get(textureId);
    if (!image) throw new Error('Missing private scene texture: ' + textureId);
    const texture = gl.createTexture();
    if (!texture) throw new Error('Native scene texture GPU allocation failed');
    textures.set(textureId, texture);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    // The source project uses Gamma color space. RGBA8 preserves decoded
    // BC3 RGBM bytes; shader math performs the lightmap decode explicitly.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, point ? gl.NEAREST : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, point ? gl.NEAREST : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, clamp ? gl.CLAMP_TO_EDGE : gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, clamp ? gl.CLAMP_TO_EDGE : gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 0);
  }
  function uploadLightmap(atlas) {
    if (lightmapUploads.has(atlas.textureId)) return;
    const sampler = containersBuild28LightmapBc3GpuPacket({
      colorTransfer: 'unorm-diagnostic',
      mipLevels: 12,
    });
    const extension = atlas.compressedAssetId ? gl.getExtension(sampler.extensionName) : null;
    let levels = null;
    if (atlas.compressedAssetId) {
      const bytes = images.get(atlas.compressedAssetId);
      if (!(bytes instanceof Uint8Array)) {
        throw new Error('Missing private BC3 lightmap bytes: ' + atlas.compressedAssetId);
      }
      levels = sliceContainersBuild28LightmapBc3Mips(bytes).levels;
    }
    if (extension) {
      const texture = gl.createTexture();
      if (!texture) throw new Error('Native BC3 lightmap GPU allocation failed');
      textures.set(atlas.textureId, texture);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      for (const mip of levels) {
        gl.compressedTexImage2D(gl.TEXTURE_2D, mip.level,
          extension[sampler.internalFormatName], mip.width, mip.height, 0, mip.compressedBytes);
      }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl[sampler.minFilter]);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl[sampler.magFilter]);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl[sampler.wrapS]);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl[sampler.wrapT]);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, sampler.maxLevel);
    } else {
      uploadTexture(atlas.textureId, { clamp: true });
    }
    lightmapUploads.set(atlas.textureId, Object.freeze({
      textureId: atlas.textureId,
      compressedAssetId: atlas.compressedAssetId ?? null,
      compressed: Boolean(extension),
      mipLevels: extension ? levels.length : 1,
      sourceMipLevels: atlas.sampler.sourceMipCount,
      fallbackReason: extension ? null :
        atlas.compressedAssetId ? 's3tc-unavailable' : 'compressed-asset-not-supplied',
      colorTransferHypothesis: sampler.colorTransferHypothesis,
      nativeResourceViewObserved: false,
    }));
  }
  let packets;
  try {
    shaders.push(shader(gl, gl.VERTEX_SHADER, vertex));
    shaders.push(shader(gl, gl.FRAGMENT_SHADER, fragment));
    for (const s of shaders) gl.attachShader(program, s);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    const colorLocation = gl.getAttribLocation(program, 'aColor');
    const lightmapUvLocation = gl.getAttribLocation(program, 'aLightmapUV');
    const tangentLocation = gl.getAttribLocation(program, 'aTangent');
    const previousVao = gl.getParameter(gl.VERTEX_ARRAY_BINDING);
    const previousBuffer = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
    try {
      for (const [id, source] of scene.meshes) {
        const mesh = uploadIndexedMesh(gl, program, source.mesh);
        meshes.set(id, mesh);
        gl.bindVertexArray(mesh.vao);
        for (const [values, location, width, label] of [
          [source.color0, colorLocation, 4, 'COLOR0'],
          [source.uv2, lightmapUvLocation, 2, 'UV2'],
          [source.tangent0, tangentLocation, 4, 'TANGENT0'],
        ]) {
          if (values) {
            const buffer = gl.createBuffer();
            if (!buffer) throw new Error('Native ' + label + ' GPU allocation failed');
            attributeBuffers.push(buffer);
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER, values, gl.STATIC_DRAW);
            gl.enableVertexAttribArray(location);
            gl.vertexAttribPointer(location, width, gl.FLOAT, false, width * 4, 0);
          } else {
            gl.disableVertexAttribArray(location);
          }
        }
      }
    } finally { gl.bindVertexArray(previousVao); gl.bindBuffer(gl.ARRAY_BUFFER, previousBuffer); }
    const concreteTextures = scene.concreteLighting.textures;
    uploadTexture(concreteTextures.microseamTextureId);
    uploadTexture(concreteTextures.poreTextureId);
    uploadTexture(concreteTextures.fogGradientTextureId, { clamp: true });
    packets = new Map();
    for (const instance of scene.instances) {
      for (const draw of instance.draws) {
        const source = scene.materialMap.get(draw.materialId);
        const preparedMesh = scene.meshes.get(draw.meshId);
        const packet = createNativeSceneMaterialPacket(source, {
          renderCategory: instance.classification.category,
          meshHasUv0: preparedMesh.hasUV,
        });
        const binding = packet.texture ?? (preparedMesh.hasUV ? source.textures?._MainTex : null);
        const textureId = binding?.sample === false ? null : binding?.textureId;
        uploadTexture(textureId, { point: packet.family === 'concrete-2019-main' });
        const concrete = packet.family === 'concrete-2019-main';
        const atlas = instance.lightmap?.atlas ?? null;
        const lightmap = concrete && atlas && preparedMesh.hasUV2 ? {
          textureId: atlas.textureId,
          st: instance.lightmap.tilingOffset,
          decode: [
            atlas.decode.multiplier,
            atlas.decode.concreteBakedContributionScale,
          ],
        } : null;
        if (lightmap) uploadLightmap(atlas);
        const sourceConcrete = Boolean(lightmap && concrete && preparedMesh.hasNormals &&
          preparedMesh.hasTangents && textureId);
        const lightmapStatus = sourceConcrete ? 'source-concrete-complete-forward-base' :
          lightmap && !preparedMesh.hasTangents ? 'missing-source-tangent0' :
          lightmap ? 'source-concrete-baked-term-only' :
          !instance.lightmap ? 'source-renderer-not-lightmapped' :
          !concrete ? 'unsupported-material-family' : 'missing-source-uv2';
        const color = source.colors?._Color ?? [1, 1, 1, 1];
        const st = packet.texture?.serializedUvTransform ??
          [...(binding?.scale ?? [1, 1]), ...(binding?.offset ?? [0, 0])];
        packets.set(draw, {
          color,
          st,
          textureId,
          reflection: packet.family === 'black-crystal',
          concrete,
          lightmap,
          lightmapStatus,
          sourceConcrete,
          seamDistance: [
            source.floats?._SeamHorizontalDistance ?? 1,
            source.floats?._SeamVerticalDistance ?? 1,
          ],
          streaks: source.floats?._MainTexIsZacieki ?? 0,
          packet,
        });
      }
    }
    const error = gl.getError();
    if (error !== gl.NO_ERROR) throw new Error('Native world GPU upload failed: ' + error);
  } catch (error) { dispose(); throw error; }
  finally {
    for (const s of shaders) gl.deleteShader(s);
    gl.useProgram(oldProgram);
    for (let unit = 4; unit >= 0; unit--) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, oldTextureBindings[unit]);
    }
    gl.activeTexture(oldActiveTexture);
  }
  const lightmapCoverage = Object.freeze([...lightmapUploads.values()]);
  const uniforms = {};
  for (const name of [
    'uModel', 'uViewProjection', 'uNormal', 'uModelSign',
    'uTexture', 'uLightmap', 'uMicroseam', 'uPore', 'uFogGradient',
    'uColor', 'uST', 'uLightmapST', 'uLightmapDecode', 'uCamera', 'uScreen',
    'uMode', 'uTextured', 'uHasNormals', 'uHasTangents', 'uLightmapped',
    'uSeamDistance', 'uMainTexIsZacieki',
    'uLightLocalAmbient', 'uLightLocalMinusAmbient', 'uDynamicAmbient',
    'uAmbientMultiplier', 'uAttenuationOutsideShadowDistance',
    'uFogColor', 'uFogScale', 'uFogPower', 'uSecondaryFogDistance',
    'uWorldSpaceLightDirection',
  ]) uniforms[name] = gl.getUniformLocation(program, name);
  const colorLocation = gl.getAttribLocation(program, 'aColor');
  const lightmapUvLocation = gl.getAttribLocation(program, 'aLightmapUV');
  const tangentLocation = gl.getAttribLocation(program, 'aTangent');
  const concreteLighting = scene.concreteLighting;
  const concreteGlobals = concreteLighting.globals;
  const concreteTextureIds = concreteLighting.textures;
  const concreteCompositionCoverage = Object.freeze({
    schema: concreteLighting.schema,
    variant: concreteLighting.variant,
    sourceMaterial: concreteLighting.sourceMaterial,
    microseamTextureId: concreteTextureIds.microseamTextureId,
    poreTextureId: concreteTextureIds.poreTextureId,
    fogGradientTextureId: concreteTextureIds.fogGradientTextureId,
    omittedRuntimeTerms: Object.freeze([
      'XulmFalseLight runtime slot values',
      'katana recall',
      'void/glitch/screenshot deformation',
      'post-processing and framebuffer transfer',
    ]),
  });
  const identity = [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  let weaponLocal = identity;
  // First link is the authored pickup placement, not the held model's offset.
  for (const link of scene.pistol.source.attachmentChain.slice(1)) weaponLocal = multiplyMatrices(weaponLocal, link.localMatrix);
  function render(viewProjection, camera, weaponMatrix = null) {
    const previousProgram = gl.getParameter(gl.CURRENT_PROGRAM);
    const previousVao = gl.getParameter(gl.VERTEX_ARRAY_BINDING);
    const previousActive = gl.getParameter(gl.ACTIVE_TEXTURE);
    const previousColorMask = gl.getParameter(gl.COLOR_WRITEMASK);
    const previousTextureBindings = [];
    for (let unit = 0; unit < 5; unit++) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      previousTextureBindings.push(gl.getParameter(gl.TEXTURE_BINDING_2D));
    }
    let drawCalls = 0, triangles = 0, lightmappedDrawCalls = 0;
    let sourceConcreteDrawCalls = 0;
    try {
      gl.useProgram(program);
      gl.uniformMatrix4fv(uniforms.uViewProjection, false, viewProjection);
      gl.uniform3f(uniforms.uCamera, camera.x, camera.y, camera.z);
      gl.uniform1i(uniforms.uTexture, 0);
      gl.uniform1i(uniforms.uLightmap, 1);
      gl.uniform1i(uniforms.uMicroseam, 2);
      gl.uniform1i(uniforms.uPore, 3);
      gl.uniform1i(uniforms.uFogGradient, 4);
      gl.uniform2f(uniforms.uScreen, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.uniform4fv(uniforms.uLightLocalAmbient, concreteGlobals.lightLocalAmbient);
      gl.uniform4fv(uniforms.uLightLocalMinusAmbient, concreteGlobals.lightLocalMinusAmbient);
      gl.uniform4fv(uniforms.uDynamicAmbient, concreteGlobals.localDynamicConcreteAmbient);
      gl.uniform1f(uniforms.uAmbientMultiplier, concreteGlobals.lightLocalAmbientMultiplier);
      gl.uniform1f(uniforms.uAttenuationOutsideShadowDistance,
        concreteGlobals.localAttenuationOutsideShadowDistance);
      gl.uniform4fv(uniforms.uFogColor, concreteGlobals.localFogColor);
      gl.uniform1f(uniforms.uFogScale, concreteGlobals.localFogScale);
      gl.uniform1f(uniforms.uFogPower, concreteGlobals.localFogPower);
      gl.uniform1f(uniforms.uSecondaryFogDistance, concreteGlobals.localSecondaryFogDistance);
      gl.uniform3fv(uniforms.uWorldSpaceLightDirection,
        concreteGlobals.worldSpaceLightDirection);
      for (const [unit, textureId] of [
        [2, concreteTextureIds.microseamTextureId],
        [3, concreteTextureIds.poreTextureId],
        [4, concreteTextureIds.fogGradientTextureId],
      ]) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, textures.get(textureId));
      }
      gl.vertexAttrib4f(colorLocation, 0, 0, 0, 1);
      gl.vertexAttrib2f(lightmapUvLocation, 0, 0);
      gl.vertexAttrib4f(tangentLocation, 1, 0, 0, 1);
      const instances = weaponMatrix ? [scene.pistol.instance] : scene.instances;
      for (const instance of instances) {
        const transform = weaponMatrix ? meshModelMatrices(multiplyMatrices(weaponMatrix, weaponLocal)) : instance;
        gl.uniformMatrix4fv(uniforms.uModel, false, transform.model);
        gl.uniformMatrix3fv(uniforms.uNormal, false, transform.normal);
        gl.uniform1f(uniforms.uModelSign, transform.mirrored ? -1 : 1);
        const preparedMesh = scene.meshes.get(instance.meshId);
        gl.uniform1i(uniforms.uHasNormals, preparedMesh.hasNormals ? 1 : 0);
        gl.uniform1i(uniforms.uHasTangents, preparedMesh.hasTangents ? 1 : 0);
        for (const draw of instance.draws) {
          const material = packets.get(draw);
          gl.uniform4fv(uniforms.uColor, material.color);
          gl.uniform4fv(uniforms.uST, material.st);
          gl.uniform1i(uniforms.uMode, material.reflection ? 1 : material.concrete ? 2 : 0);
          gl.uniform2fv(uniforms.uSeamDistance, material.seamDistance);
          gl.uniform1f(uniforms.uMainTexIsZacieki, material.streaks);
          gl.colorMask(true, true, true, !material.reflection);
          gl.uniform1i(uniforms.uTextured, material.textureId ? 1 : 0);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D,
            material.textureId ? textures.get(material.textureId) : null);
          gl.uniform1i(uniforms.uLightmapped, material.lightmap ? 1 : 0);
          gl.uniform4fv(uniforms.uLightmapST, material.lightmap?.st ?? [1, 1, 0, 0]);
          gl.uniform2fv(uniforms.uLightmapDecode, material.lightmap?.decode ?? [5, 0.2]);
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D,
            material.lightmap ? textures.get(material.lightmap.textureId) : null);
          meshes.get(draw.meshId).draw(draw.range);
          drawCalls++;
          if (material.lightmap) lightmappedDrawCalls++;
          if (material.sourceConcrete) sourceConcreteDrawCalls++;
          triangles += draw.range.indexCount / 3;
        }
      }
    } finally {
      for (let unit = 4; unit >= 0; unit--) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, previousTextureBindings[unit]);
      }
      gl.activeTexture(previousActive);
      gl.colorMask(...previousColorMask);
      gl.bindVertexArray(previousVao); gl.useProgram(previousProgram);
    }
    return {
      drawCalls,
      triangles,
      nativeGeometry: true,
      nativeMaterialParity: false,
      nativeLightingParity: false,
      sourceConcreteLightmappedDrawCalls: sourceConcreteDrawCalls,
      unsupportedConcreteCompositionDrawCalls: lightmappedDrawCalls - sourceConcreteDrawCalls,
      genericLightingDrawCalls: drawCalls - sourceConcreteDrawCalls,
      lightmapCoverage,
      concreteCompositionCoverage,
    };
  }
  return { draw: (vp, camera) => render(vp, camera), drawWeapon: (vp, camera, matrix) => render(vp, camera, matrix), dispose };
}
