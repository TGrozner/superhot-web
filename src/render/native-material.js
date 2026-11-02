import { containersConcreteGpuSamplerPacket } from './material-model.js';

const WORLD_CATEGORY = 'world';
const CATEGORIES = new Set([
  WORLD_CATEGORY,
  'first-person-weapon',
  'interactive_fragment',
  'technical_trigger_volume',
  'technical_player_or_spawn_capsule',
  'crosshair_overlay_excluded_by_initial_world_camera',
  'excluded_by_initial_active_camera_masks',
]);

const freezeArray = values => Object.freeze([...values]);
const freezeObject = value => Object.freeze(value);
const CONCRETE_NATIVE_SAMPLER = containersConcreteGpuSamplerPacket({ mipLevels: 8 });
const CONCRETE_PACKAGE_SAMPLER = containersConcreteGpuSamplerPacket({ mipLevels: 1 });


const SOURCE_CONTRACTS = Object.freeze({
  'resources.assets::3': Object.freeze({
    family: 'concrete-2019-main',
    shader: 'globalgamemanagers.assets::25',
    keyword: '_STRIPESONOFF_ON',
    texture: Object.freeze({
      property: '_MainTex',
      source: 'resources.assets::248',
      semantic: 'seam-gated-rgb-modulation',
      uvSource: 'uv0',
      format: 'RGB24',
      width: 128,
      height: 128,
      mipCount: 8,
      serializedColorSpace: 1,
      colorTransfer: 'srgb',
      shaderSampleDomain: 'gamma-project-rgb',
      recommendedInternalFormat: 'RGBA8',
      nativeGpuResourceViewObserved: false,
      nativeSampler: CONCRETE_NATIVE_SAMPLER,
      packageSampler: CONCRETE_PACKAGE_SAMPLER,
    }),
    parameters: Object.freeze([
      '_Color', '_HighlightColor', '_ShadowColor', '_MidtonesColor',
      '_LocalAmbient', '_RAMP_COLOR', '_TINT',
      '_Alpha', '_Cutoff', '_DIFFUSE', '_Emmisive', '_GlobalScale',
      '_IsDynamic', '_RAMP_POWER', '_RAMP_SIZE', '_StripesOnOff',
      '_SPEC_INTENSITY', '_MainTexIsZacieki',
      '_SeamHorizontalDistance', '_SeamVerticalDistance',
    ]),
    unresolved: Object.freeze([
      'runtime slot ordering/current-frame values for four active XulmFalseLight components',
      'dynamic katana-recall, void/glitch, screenshot and vertex-deformation globals',
      'runtime material property-block writes and native GPU resource-view transfer',
      'source mip levels beyond finalized PNG mip 0 for global pore/microseam/fog textures',
      'post-processing, exposure and final framebuffer transfer',
    ]),
  }),
  'sharedassets0.assets::9': Object.freeze({
    family: 'black-crystal',
    shader: 'globalgamemanagers.assets::12',
    keyword: '_USEGRADIENTMAP_ON',
    texture: Object.freeze({
      property: '_Cube2d',
      source: 'sharedassets0.assets::27',
      semantic: 'reflection-lookup',
      uvSource: 'dominant-axis-reflection-direction',
      format: 'R8',
      width: 1024,
      height: 1024,
      mipCount: 11,
      serializedColorSpace: 1,
      colorTransfer: 'serialized-srgb-flag-native-r8-transfer-unresolved',
      nativeSampler: Object.freeze({
        unityFilterMode: 1,
        unityWrapU: 0,
        unityWrapV: 0,
        minFilter: 'LINEAR_MIPMAP_NEAREST',
        magFilter: 'LINEAR',
        mipFilter: 'NEAREST',
        wrapS: 'REPEAT',
        wrapT: 'REPEAT',
        anisotropy: 1,
        mipBias: 0,
        maxLevel: 10,
        generateMipmaps: false,
        originalRuntimeOverrideVerified: false,
        filterProvenance: 'Unity serialized Texture2D Bilinear/Repeat metadata; runtime override unobserved',
      }),
      packageSampler: Object.freeze({
        minFilter: 'LINEAR',
        magFilter: 'LINEAR',
        wrapS: 'REPEAT',
        wrapT: 'REPEAT',
        maxLevel: 0,
        generateMipmaps: false,
        provenance: 'browser-scene imported PNG carries mip0 only',
      }),
    }),
    parameters: Object.freeze([
      '_Color', '_HighlightColor', '_ShadowColor', '_RampColor',
      '_PrimaryRampColor', '_PrimaryRimColor', '_SpecularColor',
      '_Cutoff', '_DarkReflectionPower', '_Focus', '_FocusScale',
      '_IsEnemy', '_ReflectionPower', '_ReflectionRampAngle',
      '_ReceivedLightPower', '_SpecularPower', '_SuperSpecularPower',
      '_UseAdditiveGradientMap', '_UseGradientMap',
      '_HDRPhase', '_HDRPhaseB',
    ]),
    unresolved: Object.freeze([
      'selected FORWARDBASE compiled variant and live global shader keywords',
      'native R8 sampling transfer despite serialized m_ColorSpace=1',
      'runtime directional light/shadows, vertex deformation and property blocks',
      'post-processing, exposure and final framebuffer transfer',
    ]),
  }),
  'sharedassets3.assets::2': Object.freeze({
    family: 'concrete-2019-cutoff',
    shader: 'globalgamemanagers.assets::22',
    keyword: null,
    texture: Object.freeze({
      property: '_MainTex', source: 'sharedassets3.assets::3',
      semantic: 'albedo-alpha-cutoff', uvSource: 'uv0',
      width: 1024, height: 1024,
    }),
    parameters: Object.freeze(['_Color', '_Cutoff']),
    unresolved: Object.freeze([
      'cutout coverage is reconstructed; full Concrete lighting for this variant is not',
      'runtime property blocks, source mip chain and post-processing',
    ]),
  }),
  'sharedassets11.assets::3': Object.freeze({
    family: 'monitor-screen',
    shader: 'globalgamemanagers.assets::20',
    keyword: null,
    texture: Object.freeze({
      property: '_MainTex', source: 'sharedassets11.assets::5',
      semantic: 'animated-screen-atlas', uvSource: 'uv0',
      width: 1024, height: 1024,
    }),
    parameters: Object.freeze([
      '_NumX', '_NumY', '_PlaybackSpeed', '_TimeOffset', '_PositionOffset',
    ]),
    unresolved: Object.freeze([
      'native clock phase and runtime property blocks',
      'ground fog and post-processing',
    ]),
  }),
  'sharedassets0.assets::13': Object.freeze({
    family: 'red-crystal',
    shader: 'globalgamemanagers.assets::28',
    keyword: '_ALLOWLOCALFOG_ON',
    texture: null,
    parameters: Object.freeze([
      '_AlphaCenter', '_Color', '_EmissionColor', '_FogColor',
      '_HighlightColor', '_MidtonesColor', '_PrimaryRampColor',
      '_SecondaryRampColor', '_PrimaryRimColor', '_ShadowColor',
      '_SpecColor', '_SuperSpecColor',
      '_Alpha', '_Cutoff', '_AlbedoPower', '_BlackFocus',
      '_DarkReflectionPower', '_DiffusePower', '_Focus', '_FocusScale',
      '_HotswitchFocus', '_IsEnemy', '_ReceivedLightPower',
      '_ReflectionPower', '_ReflectionRampAngle', '_SpecularPower',
      '_SuperSpecularPower', '_UseAdditiveGradientMap', '_UseGradientMap',
      '_AllowLocalFog', '_FogDistance', '_FogLength',
    ]),
    unresolved: Object.freeze([
      'selected FORWARDBASE compiled variant and live global shader keywords',
      'inactive focus/glitch branches and their global texture producers',
      'runtime deformation, focus/death property blocks and native clock phase',
      'runtime directional light and shadow inputs',
      'post-processing, exposure and final framebuffer transfer',
    ]),
  }),
});

// Shader 8 shares only the reflection atlas/addressing with shader 12.
const FIRST_PERSON_PISTOL_CONTRACT = Object.freeze({
  family: 'first-person-black-crystal',
  shader: 'globalgamemanagers.assets::8',
  keyword: null,
  texture: SOURCE_CONTRACTS['sharedassets0.assets::9'].texture,
  parameters: Object.freeze(['_IsPlayerHands']),
  unresolved: Object.freeze([
    'runtime directional shadow texture and selected shadow keyword',
    'native R8 sampling transfer and source reflection mip chain beyond imported mip0',
    'post-processing, exposure and final framebuffer transfer',
  ]),
});

const basePass = (name, colorWrite, depthWrite = true) => Object.freeze({
  name,
  lightMode: 'forward-base',
  sourceBlend: 'one',
  destinationBlend: 'zero',
  colorWrite,
  depthWrite,
  depthTest: 'less-equal',
  cull: 'back',
  alphaToCoverage: false,
});

const additivePass = (name, colorWrite, depthWrite) => Object.freeze({
  name,
  lightMode: 'forward-add',
  sourceBlend: 'one',
  destinationBlend: 'one',
  colorWrite,
  depthWrite,
  depthTest: 'less-equal',
  cull: 'back',
  alphaToCoverage: false,
});

const shadowPass = Object.freeze({
  name: 'ShadowCaster',
  lightMode: 'shadow-caster',
  sourceBlend: 'one',
  destinationBlend: 'zero',
  colorWrite: 'rgba',
  depthWrite: true,
  depthTest: 'less-equal',
  cull: 'back',
  alphaToCoverage: false,
});

const materialPasses = (base, additive) => Object.freeze({
  queue: 'geometry-default',
  renderType: 'opaque',
  alphaMode: 'opaque',
  cutout: false,
  compiledBaseOutputAlpha: 1,
  materialAlphaIsOpacity: false,
  base,
  additive,
  shadow: shadowPass,
});

const PASS_CONTRACTS = Object.freeze({
  'concrete-2019-main': materialPasses(
    basePass('MAIN FORWARD BASE WITH ONE DIRECTIONAL', 'rgba'),
    additivePass('CUSTOM FORWARD ADD', 'rgba', true),
  ),
  'black-crystal': materialPasses(
    basePass('FORWARD', 'rgb'),
    additivePass('FORWARD ADD', 'rgb', false),
  ),
  'first-person-black-crystal': Object.freeze({
    ...materialPasses(basePass('FORWARDBASE', 'rgba'), null),
    queue: 'geometry-minus-10000',
    projection: 'source-custom-fov',
    fragmentDepth: 'compressed-front-tenth',
  }),
  'red-crystal': materialPasses(
    basePass('FORWARD BASE WITH DIRECTIONAL', 'rgba'),
    additivePass('FORWARD ADD', 'rgba', false),
  ),
  'concrete-2019-cutoff': Object.freeze({
    ...materialPasses(basePass('MAIN FORWARD BASE WITH ONE DIRECTIONAL', 'rgba'), null),
    alphaMode: 'cutout',
    cutout: true,
  }),
  'monitor-screen': materialPasses(
    basePass('MAIN FORWARD BASE WITH ONE DIRECTIONAL', 'rgba'), null,
  ),
});

function sourceIdentity(material) {
  const value = material?.source?.identity;
  if (typeof value !== 'string' || !value) throw new TypeError('Native material source.identity is required');
  return value;
}

function propertySubset(material, names) {
  const values = {};
  for (const name of names) {
    if (Object.hasOwn(material.colors ?? {}, name)) {
      const color = material.colors[name];
      if (!Array.isArray(color) || color.length !== 4 || color.some(value => !Number.isFinite(value))) {
        throw new TypeError(`Native material color ${name} must contain four finite channels`);
      }
      values[name] = freezeArray(color);
    } else if (Object.hasOwn(material.floats ?? {}, name)) {
      const value = material.floats[name];
      if (!Number.isFinite(value)) throw new TypeError(`Native material float ${name} must be finite`);
      values[name] = value;
    }
  }
  return freezeObject(values);
}

function texturePacket(material, contract, meshHasUv0) {
  if (!contract.texture) return null;
  const binding = material.textures?.[contract.texture.property];
  if (!binding || binding.sourceTexture !== contract.texture.source) {
    throw new Error(`${contract.family} requires exact ${contract.texture.property} source ${contract.texture.source}`);
  }
  const scale = binding.scale;
  const offset = binding.offset;
  if (!Array.isArray(scale) || scale.length !== 2 || scale.some(value => !Number.isFinite(value)) ||
      !Array.isArray(offset) || offset.length !== 2 || offset.some(value => !Number.isFinite(value))) {
    throw new TypeError(`Native ${contract.texture.property} scale/offset must be finite vec2 values`);
  }
  const requiresUv0 = contract.texture.uvSource === 'uv0';
  return freezeObject({
    property: contract.texture.property,
    textureId: binding.textureId ?? null,
    sourceTexture: binding.sourceTexture,
    semantic: contract.texture.semantic,
    diffuse: contract.texture.semantic === 'albedo',
    uvSource: contract.texture.uvSource,
    serializedUvTransform: freezeArray([scale[0], scale[1], offset[0], offset[1]]),
    shaderAppliesSerializedUvTransform: requiresUv0,
    requiresUv0,
    sample: !requiresUv0 || meshHasUv0 === true,
    omissionReason: requiresUv0 && meshHasUv0 !== true ? 'mesh-has-no-proved-uv0' : null,
    format: contract.texture.format,
    dimensions: freezeArray([contract.texture.width, contract.texture.height]),
    sourceMipCount: contract.texture.mipCount,
    packageAssetCarriesImportedPng: true,
    packageAssetCarriesNativeMipChain: false,
    serializedColorSpace: contract.texture.serializedColorSpace,
    colorTransfer: contract.texture.colorTransfer,
    shaderSampleDomain: contract.texture.shaderSampleDomain ?? 'native-transfer-unresolved',
    recommendedInternalFormat: contract.texture.recommendedInternalFormat ?? null,
    nativeGpuResourceViewObserved: false,
    projectActiveColorSpace: 0,
    projectColorSpaceName: 'Gamma',
    nativeSampler: contract.texture.nativeSampler,
    packageSampler: contract.texture.packageSampler,
  });
}

/**
 * Convert one material from the private browser-scene package into a small,
 * public-safe draw contract. Classification is supplied by the package's
 * instance.renderClassification; this helper never guesses from object names.
 *
 * Source facts: Unity 2018.4 serialized materials/textures and D3D11 shader
 * configuration recovered privately on 2026-11-02. No shader or asset bytes
 * are embedded here. Runtime property blocks and a selected game frame were
 * not observed, so `unresolved` is part of the contract rather than a caveat
 * callers may discard.
 */
export function createNativeSceneMaterialPacket(material, {
  renderCategory,
  meshHasUv0 = null,
} = {}) {
  if (!CATEGORIES.has(renderCategory)) throw new RangeError(`Unknown native render category: ${renderCategory}`);
  if (meshHasUv0 !== null && typeof meshHasUv0 !== 'boolean') {
    throw new TypeError('meshHasUv0 must be boolean or null');
  }
  const identity = sourceIdentity(material);
  // The hazard material is a separate source asset using the same default
  // Red Crystal shader and serialized focus branch as the enemy material.
  const contract = SOURCE_CONTRACTS[identity] ??
    (identity === 'sharedassets0.assets::10' ? FIRST_PERSON_PISTOL_CONTRACT :
      identity === 'sharedassets0.assets::16' ? SOURCE_CONTRACTS['sharedassets0.assets::13'] : null);
  const worldPassEligible = renderCategory === WORLD_CATEGORY;
  if (!contract) {
    return freezeObject({
      schema: 'native-material-packet-v1',
      sourceMaterial: identity,
      sourceShader: material.shader?.source ?? null,
      family: 'unmodeled',
      renderCategory,
      worldPassEligible,
      pass: null,
      parameters: freezeObject({}),
      texture: null,
      shaderMathCoverage: 'none',
      unresolved: Object.freeze(['material family has no public reconstruction contract']),
    });
  }
  if (material.shader?.source !== contract.shader) {
    throw new Error(`${contract.family} requires exact shader ${contract.shader}`);
  }
  if (contract.keyword && (!Array.isArray(material.keywords) || !material.keywords.includes(contract.keyword))) {
    throw new Error(`${contract.family} requires active source keyword ${contract.keyword}`);
  }
  return freezeObject({
    schema: 'native-material-packet-v1',
    sourceMaterial: identity,
    sourceShader: contract.shader,
    family: contract.family,
    activeSourceKeyword: contract.keyword,
    serializedRenderQueue: material.renderQueue ?? null,
    renderCategory,
    worldPassEligible,
    pass: PASS_CONTRACTS[contract.family],
    parameters: propertySubset(material, contract.parameters),
    texture: texturePacket(material, contract, meshHasUv0),
    shaderMathCoverage: contract.family === 'first-person-black-crystal'
      ? 'custom-fov-derivative-normal-cubic-reflection-directional-compositor-and-depth'
      : contract.family === 'black-crystal'
        ? 'directional-vertex-reflection-specular-focus-and-fog-compositor'
      : contract.family === 'concrete-2019-main'
        ? 'compiled-directional-lightmap-forward-compositor-with-serialized-globals'
        : contract.family === 'concrete-2019-cutoff'
          ? 'source-alpha-cutoff-with-diffuse-lighting'
          : contract.family === 'monitor-screen'
            ? 'source-atlas-animation-view-offset-and-fog'
            : 'compiled-default-focus-directional-compositor',
    unresolved: contract.unresolved,
  });
}

/** Exact scalar part of the compiled Black Crystal reflection lookup. */
export function blackCrystalReflectionLevel(sampleRed) {
  if (!Number.isFinite(sampleRed)) throw new TypeError('reflection sample must be finite');
  const square = sampleRed * sampleRed;
  return square * square;
}

/**
 * Exact dominant-axis lookup address from the no-shadow D3D11 FORWARDBASE
 * Black Crystal fragment variant. Ties follow the compiled z > y > x order.
 * The input is the shader's reflection-direction varying, not UV0.
 */
export function blackCrystalReflectionUv(direction) {
  if (!Array.isArray(direction) && !ArrayBuffer.isView(direction)) {
    throw new TypeError('reflection direction must be an array-like vec3');
  }
  if (direction.length !== 3 ||
      !Number.isFinite(direction[0]) ||
      !Number.isFinite(direction[1]) ||
      !Number.isFinite(direction[2])) {
    throw new TypeError('reflection direction must contain three finite values');
  }
  const x = direction[0], y = direction[1], z = direction[2];
  const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
  let u, v, denominator;
  if (az >= ax && az >= ay) {
    u = x; v = -y; denominator = az;
  } else if (ay >= ax && ay >= az) {
    u = x; v = -z; denominator = ay;
  } else {
    u = z; v = -y; denominator = ax;
  }
  if (denominator === 0) throw new RangeError('reflection direction must be non-zero');
  return freezeArray([u / denominator * 0.5 + 0.5, v / denominator * 0.5 + 0.5]);
}

/**
 * Independently written GLSL helpers for the bounded recovered math. No source
 * shader text or private texture payload is embedded here.
 */
export const NATIVE_MATERIAL_GLSL = Object.freeze({
  // Compiled Concrete base: vertex 2436a3f7... lines 222, 224-230,
  // 283-289; fragment 51a3ddf5... lines 113-126. The texture is a
  // seam-gated multiplier near white, NOT ordinary full-strength albedo.
  // Compute vertex helpers per vertex; interpolate their results normally.
  // COLOR0 must be recovered, not replaced with fabricated vertex colors.
  concreteMainTexture: `
float nativeConcreteSeamOverride(vec3 vertexColor) {
  return vertexColor.r > 0.95 && vertexColor.g < 0.05 && vertexColor.b > 0.95
    ? 1.0 : 0.0;
}
vec4 nativeConcreteSeamVarying(
  vec2 uv0, vec3 worldPosition, vec2 seamDistance, float seamOverride
) {
  return vec4(
    mix(uv0, worldPosition.xz, seamOverride),
    mix(seamDistance, vec2(1.0), seamOverride)
  );
}
float nativeConcreteMainTextureWeight(
  vec4 seamVarying, float seamOverride, float worldNormalY, float mainTexIsZacieki
) {
  float phase = fract(seamVarying.y / seamVarying.w);
  float seam = max(0.3 * phase * phase - 0.1, 0.0) - seamOverride;
  float downward = worldNormalY < -0.8 ? 1.0 : 0.0;
  return clamp(1.0 + clamp(seam - downward, 0.0, 1.0) - mainTexIsZacieki, 0.0, 1.0);
}
vec3 nativeConcreteMainTextureFactor(
  sampler2D mainTexture, vec2 transformedUv,
  vec4 seamVarying, float seamOverride, float worldNormalY, float mainTexIsZacieki
) {
  vec3 sampleRgb = texture(mainTexture, transformedUv).rgb;
  float weight = nativeConcreteMainTextureWeight(
    seamVarying, seamOverride, worldNormalY, mainTexIsZacieki
  );
  return mix(vec3(1.0), sampleRgb, weight);
}`.trim(),
  // Compiled DIRECTIONAL LIGHTMAP_ON fragment 2ab2b7c3... lines 68-87,
  // 134-152 and 212-240. Inputs are source varyings/globals, not tuned lights.
  concreteForwardBase: `
vec2 nativeConcreteMicroseamUv(
  vec2 seamCoord, vec2 seamDistance, vec2 tangentView
) {
  vec2 enabled = mix(vec2(0.0), vec2(1.0), greaterThan(seamDistance, vec2(0.0)));
  vec2 safeDistance = mix(vec2(1.0), seamDistance, enabled);
  vec2 cell = (seamCoord - safeDistance * 0.5) / safeDistance;
  vec2 whole = floor(cell);
  vec2 local = (fract(cell) - 0.5) * safeDistance / 0.2;
  vec2 drift = min(tangentView, vec2(0.2)) * 0.7;
  vec2 negative = local * (1.0 - drift);
  vec2 positive = local * (1.0 + drift);
  vec2 warped = mix(negative, positive, step(vec2(0.0), local)) + 0.5;
  return (whole + clamp(warped, 0.0, 1.0)) * enabled;
}
vec4 nativeConcreteAccumulatedLight(
  vec4 lightLocalAmbient, vec4 lightLocalMinusAmbient,
  float ambientMultiplier, vec4 dynamicAmbient, float redVertexFlag,
  vec4 encodedLightmap, float lightmapMultiplier
) {
  vec4 ambientX = vec4(lightLocalAmbient.rgb, lightLocalAmbient.r);
  vec4 minusX = vec4(lightLocalMinusAmbient.rgb, lightLocalMinusAmbient.r);
  vec4 dynamicX = vec4(dynamicAmbient.rgb, dynamicAmbient.r);
  vec4 light = 3.0 * lightLocalAmbient.a * ambientX;
  light *= ambientMultiplier;
  light -= 3.0 * lightLocalMinusAmbient.a * minusX;
  light += (dynamicAmbient.a * dynamicX - 0.5) * redVertexFlag;
  float rgbm = encodedLightmap.a * lightmapMultiplier;
  light += rgbm * vec4(encodedLightmap.rgb, encodedLightmap.r);
  return light * vec4(0.2, 0.2, 0.2, 0.25);
}
vec3 nativeConcreteLocalFog(
  vec3 rgb, sampler2D fogGradient, vec3 worldPosition, vec3 cameraPosition,
  vec3 fogColor, float fogScale, float fogPower, float secondaryDistance,
  vec3 groundFogColor, vec3 groundFog
) {
  float distanceToCamera = length(cameraPosition - worldPosition);
  float primary = clamp(distanceToCamera / fogScale, 0.0, 1.0);
  float secondary = min(clamp((distanceToCamera - secondaryDistance) * 0.01, 0.0, 1.0), 0.8);
  secondary += clamp(abs(worldPosition.y - cameraPosition.y) - 2.0, 0.0, 1.0) * 0.03;
  // Source fragment cb0[5].xy: altitude/scale; cb0[11].z: ground enable.
  // _LocalShowFog is source-qualified to 1 by the scene lighting contract.
  float ground = 0.0;
  if (groundFog.z != 0.0) {
    float height = abs(groundFog.x - worldPosition.y) / groundFog.y;
    ground = clamp(2.0 * (1.0 - clamp(height * height * height, 0.0, 1.0)) * groundFog.z, 0.0, 1.0);
  }
  vec3 distanceFog = mix(mix(fogColor, groundFogColor, ground), vec3(1.0), secondary);
  float gradient = textureLod(fogGradient, vec2(primary, 0.5), 0.0).r * fogPower;
  return mix(rgb, distanceFog, clamp(secondary + gradient + ground, 0.0, 1.0));
}`.trim(),
  blackCrystalReflection: `
vec2 nativeBlackCrystalReflectionUv(vec3 direction) {
  vec3 a = abs(direction);
  vec3 projection = (a.z >= a.x && a.z >= a.y)
    ? vec3(direction.x, -direction.y, a.z)
    : ((a.y >= a.x && a.y >= a.z)
      ? vec3(direction.x, -direction.z, a.y)
      : vec3(direction.z, -direction.y, a.x));
  return projection.xy / projection.z * 0.5 + 0.5;
}
float nativeBlackCrystalReflectionLevel(sampler2D reflectionLookup, vec3 direction) {
  float value = texture(reflectionLookup, nativeBlackCrystalReflectionUv(direction)).r;
  float square = value * value;
  return square * square;
}`.trim(),
  // Independently reconstructed shader-8 directional base, not shader-12's
  // vertex-lit Black Crystal. Direction inputs use the original world axes.
  firstPersonBlackCrystal: `
vec3 nativeFirstPersonBlackCrystal(
  sampler2D reflectionLookup, vec3 normal, vec3 vertexView,
  vec3 objectLight, vec3 sourceWorld, vec2 screenUv, float aspect, float time
) {
  vec3 reflected = reflect(-vertexView, normal);
  vec2 atlasUv = nativeBlackCrystalReflectionUv(reflected);
  atlasUv.x += fract(dot(sourceWorld, vec3(0.1)));
  float sampleRed = texture(reflectionLookup, atlasUv).r;
  float reflection = sampleRed * sampleRed * sampleRed;
  float rim = clamp((0.2 - clamp(dot(normalize(vertexView), normal), 0.0, 1.0)) * 12.0, 0.0, 1.0);
  float specular = pow(max(dot(normal, normalize(vertexView + objectLight)), 0.0) * 0.9, 20.0);
  vec3 rgb = rim * vec3(0.12, 0.35, 0.39)
    + reflection * vec3(0.15, 0.25, 0.3) - vec3(0.01, 0.02, 0.03)
    + specular * vec3(3.3, 8.8, 9.9);
  float stripe = abs(fract((screenUv.x * aspect + screenUv.y) * 90.0 + time) - 0.5) * 2.0;
  rgb += stripe * stripe * vec3(0.09, 0.1, 0.13);
  return rgb + (rgb.g > 0.9 ? 10.0 : 0.0);
}`.trim(),
  redCrystalOutput: `
vec4 nativeRedCrystalFinalOutput(
  vec3 proceduralRgb,
  vec4 overlayRgbAmount,
  vec3 additiveRgb
) {
  vec3 mixedRgb = mix(proceduralRgb, overlayRgbAmount.rgb, overlayRgbAmount.a);
  float green = (mixedRgb.r - mixedRgb.g < 0.2)
    ? mixedRgb.b * 0.9
    : mixedRgb.g;
  return vec4(vec3(mixedRgb.r, green, mixedRgb.b) + additiveRgb, 1.0);
}`.trim(),
});
