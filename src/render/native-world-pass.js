import { uploadIndexedMesh } from './gpu-mesh.js';
import { meshModelMatrices } from './mesh-format.js';
import { multiplyMatrices } from '../scenes/graph.js';
import { createNativeSceneMaterialPacket, NATIVE_MATERIAL_GLSL } from './native-material.js';
import { RED_CRYSTAL_GLSL } from './red-crystal-pass.js';
import {
  sliceNativeLightmapBc3Mips,
  nativeLightmapBc3GpuPacket,
} from './material-model.js';

const vertex = `#version 300 es
precision highp float;
precision highp int;
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
uniform vec3 uWorldSpaceLightDirection;
uniform int uMode;
uniform vec4 uBlackState;
uniform sampler2D uFogGradient;
uniform vec4 uFogColor;
uniform float uFogScale, uFogPower, uSecondaryFogDistance;
uniform float uFirstPersonProjectionScale;
out vec3 vFirstPersonView, vFirstPersonLight;
out vec3 vViewNormal, vCameraForward, vObjectCameraForward;
out vec3 vBlackReflection;
out vec4 vBlackLighting;
out float vVertexRed;
out vec3 vWorld, vNormal, vTangent, vBitangent;
out vec2 vUV, vLightmapUV, vMicroView;
out vec4 vSeam, vColorControls;
out float vSeamOverride;
${NATIVE_MATERIAL_GLSL.concreteMainTexture}
void main() {
  vWorld = (uModel * vec4(aPosition, 1.0)).xyz;
  vNormal = normalize(uNormal * aNormal);
  vVertexRed = aColor.r;
  vFirstPersonView = vec3(0.0);
  vFirstPersonLight = vec3(0.0);
  if (uMode == 6) {
    vFirstPersonView = normalize(uCamera - vWorld);
    vFirstPersonLight = normalize(transpose(uNormal) * uWorldSpaceLightDirection);
  }
  vViewNormal = vec3(0.0);
  vCameraForward = vec3(0.0);
  vObjectCameraForward = vec3(0.0);
  if (uMode == 3 || uMode == 5) {
    vec3 cameraRight = normalize(vec3(uViewProjection[0].x, uViewProjection[1].x, uViewProjection[2].x));
    vec3 cameraUp = normalize(vec3(uViewProjection[0].y, uViewProjection[1].y, uViewProjection[2].y));
    vCameraForward = normalize(vec3(uViewProjection[0].w, uViewProjection[1].w, uViewProjection[2].w));
    vViewNormal = vec3(dot(cameraRight, vNormal), dot(cameraUp, vNormal), -dot(vCameraForward, vNormal));
    vObjectCameraForward = transpose(uNormal) * vCameraForward;
  }
  vBlackReflection = vec3(0.0, 0.0, 1.0);
  vBlackLighting = vec4(0.0);
  if (uMode == 1) {
    vec3 toCamera = uCamera - vWorld;
    float distanceToCamera = length(toCamera);
    vec3 objectIncident = normalize(transpose(uNormal) * -toCamera);
    float edge = dot(objectIncident, normalize(aNormal)) - 0.29
      - max(0.7 - distanceToCamera * 0.5, 0.0) * 0.8;
    edge *= edge;
    vBlackLighting.x = 1.0 - min(edge * edge, 1.0);
    vBlackLighting.y = clamp((distanceToCamera - 3.0) / 18.0, 0.0, 1.0);
    float specular = pow(max(dot(vNormal, normalize(toCamera + uWorldSpaceLightDirection)), 0.0), 48.0);
    vBlackLighting.z = min(specular * 0.7, 0.3);
    vBlackLighting.w = pow(specular, 5.0);
    vec3 reflected = reflect(-toCamera, vNormal);
    reflected.x = -reflected.x;
    float phase = (-vWorld.x + vWorld.y + vWorld.z) * 0.0361111127;
    float angle = sign(phase) * fract(abs(phase)) * 6.28;
    vBlackReflection = vec3(reflected.z,
      cos(angle) * reflected.x - sin(angle) * reflected.y,
      sin(angle) * reflected.x + cos(angle) * reflected.y);
  }
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
  if (uMode == 1) {
    float hdr = (1.0 - aColor.b) * uBlackState.z;
    vColorControls.xyz = uBlackState.y * 6.0 + min(hdr * vec3(3.0, 2.5, 1.0), vec3(3.0));
    // Black Crystal fog is evaluated per vertex, unlike Concrete's fragment fog.
    float distanceToCamera = length(uCamera - vWorld);
    float secondary = min(clamp((distanceToCamera - uSecondaryFogDistance) * 0.01, 0.0, 1.0), 0.8);
    secondary += clamp(abs(vWorld.y - uCamera.y) - 2.0, 0.0, 1.0) * 0.03;
    float gradient = textureLod(uFogGradient,
      vec2(clamp(distanceToCamera / uFogScale, 0.0, 1.0), 0.5), 0.0).r;
    vSeam = vec4(mix(uFogColor.rgb, vec3(1.0), secondary),
      clamp(secondary + gradient * uFogPower, 0.0, 1.0));
  }
  gl_Position = uViewProjection * vec4(vWorld, 1.0);
  if (uMode == 6) gl_Position.xy *= uFirstPersonProjectionScale;
}`;
const fragment = `#version 300 es
precision highp float;
precision highp int;
in vec3 vWorld, vNormal, vTangent, vBitangent;
in vec2 vUV, vLightmapUV, vMicroView;
in vec4 vSeam, vColorControls;
in float vSeamOverride;
in vec3 vViewNormal, vCameraForward, vObjectCameraForward;
in vec3 vBlackReflection;
in vec4 vBlackLighting;
in float vVertexRed;
in vec3 vFirstPersonView, vFirstPersonLight;
uniform vec2 uFirstPersonDepth;
uniform float uMainTexIsZacieki;
uniform sampler2D uTexture, uLightmap, uMicroseam, uPore, uFogGradient;
uniform vec4 uColor, uST, uLightmapST;
uniform vec4 uLightLocalAmbient, uLightLocalMinusAmbient, uDynamicAmbient;
uniform vec4 uFogColor;
uniform vec3 uCamera, uWorldSpaceLightDirection;
uniform vec2 uLightmapDecode, uScreen;
uniform float uAmbientMultiplier, uAttenuationOutsideShadowDistance;
uniform float uFogScale, uFogPower, uSecondaryFogDistance;
uniform vec3 uGroundFog;
uniform vec4 uGroundFogColor;
uniform vec3 uClock;
uniform vec4 uMonitor, uBlackState;
uniform float uCutoff, uObjectPhase;
uniform int uMode, uTextured, uHasNormals, uHasTangents, uLightmapped;
out vec4 outColor;
${NATIVE_MATERIAL_GLSL.blackCrystalReflection}
${NATIVE_MATERIAL_GLSL.firstPersonBlackCrystal}
${NATIVE_MATERIAL_GLSL.concreteMainTexture}
${NATIVE_MATERIAL_GLSL.concreteForwardBase}
${RED_CRYSTAL_GLSL}
void main() {
  gl_FragDepth = gl_FragCoord.z;
  if (uMode == 6) {
    // Source shader derives flat face normals; it never reads mesh NORMAL0.
    vec3 faceNormal = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    vec3 sourceAxes = vec3(-1.0, 1.0, 1.0);
    outColor = vec4(nativeFirstPersonBlackCrystal(uTexture,
      faceNormal * sourceAxes, vFirstPersonView * sourceAxes,
      vFirstPersonLight * sourceAxes, vWorld * sourceAxes,
      gl_FragCoord.xy / uScreen, uScreen.x / uScreen.y, uClock.y), 1.0);
    // Convert the source D3D reversed-Z output to WebGL forward depth.
    float sourceLinear = clamp((gl_FragCoord.w - uFirstPersonDepth.y)
      / uFirstPersonDepth.x, 0.0, 1.0);
    gl_FragDepth = 0.1 * (1.0 - sourceLinear);
    return;
  }
  vec3 n = uMode == 2 && uHasNormals == 1
    ? vNormal
    : (uHasNormals == 1 ? normalize(vNormal) : normalize(cross(dFdx(vWorld), dFdy(vWorld))));
  if (uMode == 1 && uTextured == 1) {
    float level = nativeBlackCrystalReflectionLevel(uTexture, vBlackReflection);
    vec2 screenUv = gl_FragCoord.xy / uScreen;
    float band = abs(fract((screenUv.x * uScreen.x / uScreen.y + screenUv.y)
      * (1.0 - uBlackState.x * 0.1) * 110.0 + uClock.y * 3.0) - 0.5) + 0.5;
    band = clamp((pow(band, 5.0) * 0.7 - 0.2) * 13.0, 0.0, 1.0);
    band *= band;
    float nearAmount = 1.0 - vBlackLighting.y;
    vec3 base = level * vec3(0.1, 0.15, 0.2) + vBlackLighting.x * vec3(0.1, 0.3, 0.35);
    vec3 focused = mix(base * 0.6, vec3(0.1, 0.6, 0.8), band);
    vec3 rgb = mix(base - band * nearAmount * 0.1, focused, uBlackState.x) * 1.1 + 0.055;
    rgb += vColorControls.xyz * clamp(vColorControls.xyz - fract(vWorld.y) * 0.5, 0.0, 1.0);
    rgb += clamp(rgb - 1.0, 0.0, 1.0) * 10.0;
    rgb += (vBlackLighting.z * vec3(0.0, 1.4, 1.8) + vBlackLighting.w * 10.0) * nearAmount;
    rgb *= nearAmount;
    rgb = mix(rgb, vSeam.rgb, vSeam.a);
    outColor = vec4(max(rgb - 0.1, 0.0), 1.0);
    return;
  }
  if (uMode == 3) {
    outColor = nativeRedCrystalDefaultForward(vUV, vNormal, vWorld, vViewNormal,
      vCameraForward, vObjectCameraForward, gl_FragCoord.xy / uScreen,
      uScreen.x / uScreen.y, uClock.y, uCamera, uWorldSpaceLightDirection);
    return;
  }
  if (uMode == 5 && uTextured == 1) {
    float time = (uMonitor.w + vVertexRed + uClock.x + uClock.y * 0.001 + uObjectPhase) * uMonitor.z;
    float cells = uMonitor.x * uMonitor.y;
    float frame = mod(floor(max(time, 0.0)), cells);
    vec2 localUv = vUV * uST.xy + uST.zw + vViewNormal.xy * 0.15;
    float transition = fract(time) - localUv.y;
    if (transition >= 0.0) frame = mod(frame + 1.0, cells);
    // The compiled atlas uses NumY + 1 for its inverted row divisor.
    vec2 cell = vec2(mod(frame, uMonitor.x), floor((cells - 1.0 - frame) / (uMonitor.y + 1.0)));
    vec3 rgb = texture(uTexture, (localUv + cell) / uMonitor.xy).rgb;
    rgb = nativeConcreteLocalFog(rgb, uFogGradient, vWorld, uCamera,
      uFogColor.rgb, uFogScale, uFogPower, uSecondaryFogDistance,
      uGroundFogColor.rgb, uGroundFog);
    if (abs(transition) < uClock.z + 0.01) rgb += 0.6 * (1.0 - uClock.z);
    outColor = vec4(rgb, 1.0);
    return;
  }
  vec4 albedo = vec4(1.0);
  if (uTextured == 1) {
    if (uMode == 2) {
      albedo.rgb = nativeConcreteMainTextureFactor(uTexture, vUV * uST.xy + uST.zw,
        vSeam, vSeamOverride, n.y, uMainTexIsZacieki);
    } else albedo = texture(uTexture, vUV * uST.xy + uST.zw);
  }
  if (uMode == 4 && albedo.a < uCutoff) discard;
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
      uFogColor.rgb, uFogScale, uFogPower, uSecondaryFogDistance,
      uGroundFogColor.rgb, uGroundFog);
    outColor = vec4(rgb, 1.0);
    return;
  }
  float generic = 0.64 + 0.36 * max(dot(n, normalize(vec3(-0.55, 0.9, 0.42))), 0.0);
  vec3 rgb = albedo.rgb * uColor.rgb * generic;
  outColor = vec4(rgb, uMode == 2 || uMode == 4 ? 1.0 : uColor.a * albedo.a);
}`;

// PR150's source-qualified opaque state, extended to the compiled alpha-test
// pass. Cutout discards fragments; it must not blend or leave invisible depth.
function applyNativeWorldBaseState(gl, pass, inherited) {
  const base = pass?.base;
  const sourceOpaque = (pass?.alphaMode === 'opaque' || pass?.alphaMode === 'cutout')
    && base?.lightMode === 'forward-base'
    && base.sourceBlend === 'one' && base.destinationBlend === 'zero'
    && base.depthWrite === true && base.depthTest === 'less-equal';
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
  const auxiliaryInstances = scene.auxiliaryInstances ?? [];
  const worldInstances = [...scene.instances, ...auxiliaryInstances];
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
    const sampler = nativeLightmapBc3GpuPacket({
      colorTransfer: 'unorm-diagnostic',
      mipLevels: atlas.compressedAssetId ? atlas.sampler.sourceMipCount : 1,
    });
    const extension = atlas.compressedAssetId ? gl.getExtension(sampler.extensionName) : null;
    let levels = null;
    if (atlas.compressedAssetId) {
      const bytes = images.get(atlas.compressedAssetId);
      if (!(bytes instanceof Uint8Array)) {
        throw new Error('Missing private BC3 lightmap bytes: ' + atlas.compressedAssetId);
      }
      const texture = scene.textures.get(atlas.textureId);
      if (atlas.compressedSource?.mipCount !== atlas.sampler.sourceMipCount) {
        throw new Error('BC3 source and sampler mip counts differ: ' + atlas.textureId);
      }
      levels = sliceNativeLightmapBc3Mips(bytes, {
        owner: atlas.source?.texture?.owner,
        pathId: atlas.source?.texture?.path_id,
        width: texture.width,
        height: texture.height,
        unityFormatId: atlas.source?.serialized?.textureFormat,
        mipCount: atlas.compressedSource.mipCount,
        sourceByteCount: atlas.compressedSource.bytes,
      }).levels;
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
    const materialInstances = [...worldInstances];
    if (scene.worldPistol) {
      materialInstances.push({ ...scene.worldPistol, classification: { category: 'world' } });
    }
    if (scene.firstPersonPistol) {
      materialInstances.push({ ...scene.firstPersonPistol, classification: { category: 'first-person-weapon' } });
    }
    for (const instance of materialInstances) {
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
        const reflection = packet.family === 'black-crystal' && preparedMesh.hasNormals && Boolean(textureId);
        const firstPerson = packet.family === 'first-person-black-crystal';
        if (firstPerson && !textureId) throw new Error('First-person pistol requires its source reflection atlas');
        const redCrystal = packet.family === 'red-crystal' && preparedMesh.hasUV && preparedMesh.hasNormals;
        const cutout = packet.family === 'concrete-2019-cutoff' && Boolean(textureId);
        const monitor = packet.family === 'monitor-screen' && preparedMesh.hasNormals && Boolean(textureId);
        packets.set(draw, {
          color,
          st,
          textureId,
          reflection,
          mode: firstPerson ? 6 : reflection ? 1 : concrete ? 2 : redCrystal ? 3 : cutout ? 4 : monitor ? 5 : 0,
          cutoff: source.floats?._Cutoff ?? 0,
          blackState: [source.floats?._Focus ?? 0, source.floats?._HDRPhase ?? 0,
            source.floats?._HDRPhaseB ?? 0, 0],
          monitor: [source.floats?._NumX ?? 1, source.floats?._NumY ?? 1,
            source.floats?._PlaybackSpeed ?? 0,
            (source.floats?._TimeOffset ?? 0) + (source.floats?._PositionOffset ?? 0)],
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
    'uGroundFog', 'uGroundFogColor',
    'uWorldSpaceLightDirection',
    'uClock', 'uMonitor', 'uBlackState', 'uCutoff', 'uObjectPhase',
    'uFirstPersonProjectionScale', 'uFirstPersonDepth',
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
  const instanceMap = new Map(worldInstances.map(instance => [instance.id, instance]));
  const heldMaterial = scene.firstPersonPistol?.draws
    .map(draw => packets.get(draw))
    .find(material => material.packet.family === 'first-person-black-crystal');
  const hiddenInstances = new Set(auxiliaryInstances.map(instance => instance.id));
  function requireInstance(id) {
    const instance = instanceMap.get(id);
    if (!instance) throw new RangeError('Unknown native world instance: ' + id);
    return instance;
  }
  const worldWeapon = scene.worldPistol ?? scene.pistol?.instance;
  let weaponLocal = scene.worldPistol?.localMatrix ?? identity;
  if (!scene.worldPistol) {
    // First link is the authored pickup placement, not the held model's offset.
    for (const link of scene.pistol?.source.attachmentChain.slice(1) ?? []) {
      weaponLocal = multiplyMatrices(weaponLocal, link.localMatrix);
    }
  }
  function render(viewProjection, camera, weaponMatrix = null, clock = {}, firstPerson = false,
    weaponLocalMatrix = weaponLocal, selectedInstance = null, instanceTransform = null) {
    const previousProgram = gl.getParameter(gl.CURRENT_PROGRAM);
    const previousVao = gl.getParameter(gl.VERTEX_ARRAY_BINDING);
    const previousActive = gl.getParameter(gl.ACTIVE_TEXTURE);
    const previousColorMask = gl.getParameter(gl.COLOR_WRITEMASK);
    const inheritedState = {
      blend: gl.isEnabled(gl.BLEND),
      depthFunc: gl.getParameter(gl.DEPTH_FUNC),
      depthMask: gl.getParameter(gl.DEPTH_WRITEMASK),
    };
    const previousTextureBindings = [];
    for (let unit = 0; unit < 5; unit++) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      previousTextureBindings.push(gl.getParameter(gl.TEXTURE_BINDING_2D));
    }
    let drawCalls = 0, triangles = 0;
    let sourceConcreteDrawCalls = 0, concreteDrawCalls = 0;
    let blackCrystalDrawCalls = 0, redCrystalDrawCalls = 0, cutoutDrawCalls = 0, monitorDrawCalls = 0;
    let firstPersonDrawCalls = 0;
    let heldObjectDrawCalls = 0;
    try {
      gl.useProgram(program);
      gl.uniformMatrix4fv(uniforms.uViewProjection, false, viewProjection);
      gl.uniform3f(uniforms.uCamera, camera.x, camera.y, camera.z);
      gl.uniform3f(uniforms.uClock, clock.scaledTime ?? 0, clock.unscaledTime ?? 0, clock.timeScale ?? 0);
      if (firstPerson) {
        const verticalFov = scene.firstPersonPistol.projection.verticalFovDegrees;
        const projectionY = Math.hypot(viewProjection[1], viewProjection[5], viewProjection[9]);
        gl.uniform1f(uniforms.uFirstPersonProjectionScale,
          1 / Math.tan(verticalFov * Math.PI / 360) / projectionY);
        const depthA = viewProjection[2] * viewProjection[3] +
          viewProjection[6] * viewProjection[7] + viewProjection[10] * viewProjection[11];
        const depthB = viewProjection[2] * camera.x + viewProjection[6] * camera.y +
          viewProjection[10] * camera.z + viewProjection[14];
        gl.uniform2f(uniforms.uFirstPersonDepth, -2 / depthB, (1 - depthA) / depthB);
      }
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
      gl.uniform3f(uniforms.uGroundFog, concreteGlobals.localGroundFogZero,
        concreteGlobals.localGroundFogScale, concreteGlobals.localShowGroundFog);
      gl.uniform4fv(uniforms.uGroundFogColor, concreteGlobals.localGroundFogColor);
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
      const instances = selectedInstance ? [selectedInstance] :
        firstPerson ? [scene.firstPersonPistol] :
        weaponMatrix ? [worldWeapon] : worldInstances;
      for (const instance of instances) {
        if (!selectedInstance && !weaponMatrix && hiddenInstances.has(instance.id)) continue;
        const local = firstPerson ? scene.firstPersonPistol.localMatrix : weaponLocalMatrix;
        const transform = instanceTransform ??
          (weaponMatrix ? meshModelMatrices(multiplyMatrices(weaponMatrix, local)) : instance);
        gl.uniformMatrix4fv(uniforms.uModel, false, transform.model);
        gl.uniformMatrix3fv(uniforms.uNormal, false, transform.normal);
        gl.uniform1f(uniforms.uModelSign, transform.mirrored ? -1 : 1);
        const objectPhase = (transform.model[13] - transform.model[12]) * 1000;
        gl.uniform1f(uniforms.uObjectPhase, objectPhase - Math.floor(objectPhase));
        const preparedMesh = scene.meshes.get(instance.meshId);
        gl.uniform1i(uniforms.uHasNormals, preparedMesh.hasNormals ? 1 : 0);
        gl.uniform1i(uniforms.uHasTangents, preparedMesh.hasTangents ? 1 : 0);
        for (const draw of instance.draws) {
          const material = firstPerson && selectedInstance ? heldMaterial : packets.get(draw);
          applyNativeWorldBaseState(gl, material.packet.pass, inheritedState);
          gl.uniform4fv(uniforms.uColor, material.color);
          gl.uniform4fv(uniforms.uST, material.st);
          gl.uniform1i(uniforms.uMode, material.mode);
          gl.uniform1f(uniforms.uCutoff, material.cutoff);
          gl.uniform4fv(uniforms.uBlackState, material.blackState);
          gl.uniform4fv(uniforms.uMonitor, material.monitor);
          gl.uniform2fv(uniforms.uSeamDistance, material.seamDistance);
          gl.uniform1f(uniforms.uMainTexIsZacieki, material.streaks);
          gl.colorMask(true, true, true, material.packet.pass?.base.colorWrite !== 'rgb');
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
          if (material.sourceConcrete) sourceConcreteDrawCalls++;
          if (material.concrete) concreteDrawCalls++;
          if (material.mode === 1) blackCrystalDrawCalls++;
          if (material.mode === 3) redCrystalDrawCalls++;
          if (material.mode === 4) cutoutDrawCalls++;
          if (material.mode === 5) monitorDrawCalls++;
          if (material.mode === 6) {
            if (selectedInstance) heldObjectDrawCalls++;
            else firstPersonDrawCalls++;
          }
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
      if (inheritedState.blend) gl.enable(gl.BLEND);
      else gl.disable(gl.BLEND);
      gl.depthFunc(inheritedState.depthFunc);
      gl.depthMask(inheritedState.depthMask);
      gl.bindVertexArray(previousVao); gl.useProgram(previousProgram);
    }
    return {
      drawCalls,
      triangles,
      nativeGeometry: true,
      nativeMaterialParity: false,
      nativeLightingParity: false,
      sourceConcreteLightmappedDrawCalls: sourceConcreteDrawCalls,
      unsupportedConcreteCompositionDrawCalls: concreteDrawCalls - sourceConcreteDrawCalls,
      sourceBlackCrystalDrawCalls: blackCrystalDrawCalls,
      sourceRedCrystalDrawCalls: redCrystalDrawCalls,
      sourceCutoutDrawCalls: cutoutDrawCalls,
      sourceMonitorDrawCalls: monitorDrawCalls,
      sourceFirstPersonPistolDrawCalls: firstPersonDrawCalls,
      sourceFirstPersonObjectDrawCalls: heldObjectDrawCalls,
      unsupportedMaterialCompositionDrawCalls: drawCalls - sourceConcreteDrawCalls -
        blackCrystalDrawCalls - redCrystalDrawCalls - monitorDrawCalls - firstPersonDrawCalls - heldObjectDrawCalls,
      genericLightingDrawCalls: drawCalls - sourceConcreteDrawCalls -
        blackCrystalDrawCalls - redCrystalDrawCalls - monitorDrawCalls - firstPersonDrawCalls - heldObjectDrawCalls,
      lightmapCoverage,
      concreteCompositionCoverage,
    };
  }
  return {
    draw: (vp, camera, clock) => render(vp, camera, null, clock),
    // Visibility controls only the authored world placement, not explicit draws.
    setInstanceVisible(id, visible) {
      requireInstance(id);
      if (typeof visible !== 'boolean') throw new TypeError('Instance visibility must be boolean');
      if (visible) hiddenInstances.delete(id);
      else hiddenInstances.add(id);
    },
    /**
     * Reuse an authored renderer at an absolute mesh-local-to-Web-world matrix.
     * Hide on pickup before the frame's world draw to avoid a one-frame duplicate.
     * Child attachment transforms are the caller's responsibility; unlike the
     * pistol path, this never appends an unrelated weapon attachment matrix.
     */
    drawInstance(id, worldMatrix, viewProjection, camera, clock) {
      const instance = requireInstance(id);
      const transform = meshModelMatrices(worldMatrix);
      return render(viewProjection, camera, null, clock, false, weaponLocal, instance, transform);
    },
    // ThrowableItemWeapon replaces the source world material with the same
    // FOV-independent material as the pistol; geometry and ranges stay intact.
    drawHeldInstance(id, worldMatrix, viewProjection, camera, clock) {
      const instance = requireInstance(id);
      if (!heldMaterial) throw new Error('Held native instance requires source first-person material');
      const transform = meshModelMatrices(worldMatrix);
      return render(viewProjection, camera, null, clock, true, weaponLocal, instance, transform);
    },
    drawWeapon: (vp, camera, matrix, clock, enemy = false) => worldWeapon
      ? render(vp, camera, matrix, clock, false,
        enemy && scene.worldPistol ? scene.worldPistol.enemyLocalMatrix : weaponLocal) : null,
    drawFirstPersonWeapon: (vp, camera, matrix, clock) => scene.firstPersonPistol
      ? render(vp, camera, matrix, clock, true) : null,
    dispose,
  };
}
