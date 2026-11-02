// Clean WebGL reconstruction of the shipped Red Crystal pass-0 DIRECTIONAL
// default-focus branch. Source DXBC stays in the ignored private corpus.
export const RED_CRYSTAL_SOURCE = Object.freeze({
  shader: 'globalgamemanagers.assets::28',
  material: 'sharedassets0.assets::13',
  pass: 'FORWARDBASE DIRECTIONAL',
  vertexProgramSha256: '71feb502061abdcf39ba56c30b3ceff9275cc15ec06dfe61f6df817add331614',
  fragmentProgramSha256: '6491cc828a2024182a3dc26d2d682c975ad5fefd47fd421d74916f0ee033f61d',
  focusBranch: Object.freeze({ focus: 0, hotswitchFocus: 0, blackFocus: 0 }),
  directionToLight: Object.freeze([-0.351653925, 0.8712174635, -0.3425195591]),
  directionProvenance: 'level28-serialized-realtime-direction-web-space-static-not-pose-capture',
  clockInput: '_GlobalUnscaledTime-native-phase-not-captured',
});

// The compiled default branch is textureless. _GlobalGlitchMap is sampled only
// by the inactive focus branch, while the material itself has no TexEnv entries.
export const RED_CRYSTAL_GLSL = `
float redCrystalSaturate(float value) {
  return clamp(value, 0.0, 1.0);
}

float redCrystalCellGate(float value) {
  return value > 0.1 && value < 0.5 ? 1.0 : 0.0;
}

vec2 redCrystalViewReflection(
  vec3 normal,
  vec3 worldPosition,
  vec3 cameraPosition,
  out vec3 reflected
) {
  vec3 toCamera = cameraPosition - worldPosition;
  float distanceSquared = dot(toCamera, toCamera);
  if (distanceSquared == 0.0) {
    reflected = vec3(0.0);
    return vec2(0.0);
  }
  toCamera *= inversesqrt(distanceSquared);
  reflected = normalize(reflect(-toCamera, normal));
  float alignment = dot(toCamera, reflected);
  float low = 0.1 - alignment;
  float high = 1.1 - alignment;
  float x = 0.6 * redCrystalSaturate(low * low * low);
  float highSquared = high * high;
  float y = 1.0 - redCrystalSaturate(highSquared * highSquared * high);
  return vec2(x, y);
}

vec2 redCrystalViewHighlight(vec3 normal, vec3 reflected, vec3 directionToLight) {
  vec3 lightReflection = reflected + directionToLight;
  float lengthSquared = dot(lightReflection, lightReflection);
  if (lengthSquared == 0.0) return vec2(0.0);
  float facing = max(dot(normal, lightReflection * inversesqrt(lengthSquared)), 0.0);
  float highlight = min(pow(facing, 48.0) * 0.7, 0.3);
  vec2 raised = vec2(0.85 + highlight, 0.65 + 0.9 * highlight);
  return max(raised * raised - vec2(0.85, 0.65), vec2(0.0));
}

vec4 nativeRedCrystalDefaultForward(
  vec2 uv0,
  vec3 worldNormal,
  vec3 worldPosition,
  vec3 viewNormal,
  vec3 cameraForward,
  vec3 objectCameraForward,
  vec2 screenUv,
  float viewportAspect,
  float globalUnscaledTime,
  vec3 cameraPosition,
  vec3 directionToLight
) {
  vec3 normal = normalize(worldNormal);
  vec3 reflected;
  vec2 reflection = redCrystalViewReflection(
    normal, worldPosition, cameraPosition, reflected);
  vec2 highlight = redCrystalViewHighlight(normal, reflected, directionToLight);

  // Compiled UV cells use source object-space camera-forward, world
  // camera-forward and view-space normal seeds.
  float uvRowOffset = fract(uv0.y * 10.0) > 0.5 ? 10.0 : 0.0;
  float sharedSeed = objectCameraForward.x + objectCameraForward.y
    + objectCameraForward.z + cameraForward.y + viewNormal.x + cameraPosition.x;
  vec3 cell = vec3(
    uv0.x * 8.0 + viewNormal.z + cameraPosition.y + objectCameraForward.y
      + cameraForward.x + uvRowOffset + uv0.y * 2.4,
    uv0.x * 8.0 + sharedSeed - uv0.y * 3.0,
    uv0.x * 8.0 + sharedSeed - uv0.y * 3.0
  );
  vec3 phase = fract(cell * 0.4);
  phase *= vec3(redCrystalCellGate(phase.x),
    redCrystalCellGate(phase.z), redCrystalCellGate(phase.z));
  phase *= vec3(-0.7, -0.6, -0.75);

  float procedural = 0.8;
  procedural += phase.x * redCrystalSaturate(1.0 - 2.0 * reflection.x);
  procedural += phase.y * (1.0 - reflection.x);
  procedural += 0.5 * reflection.x;

  vec2 crossing = fract(vec2(
    viewNormal.x * 5.0 + 5.0 + 5.0 * uv0.x + 10.0 * uv0.y,
    viewNormal.x * 2.5 + 2.5 - 10.0 * uv0.x - 10.0 * uv0.y
      + worldPosition.x + worldPosition.z
  ));
  procedural += (-0.5 * crossing.x * crossing.y) * reflection.y;
  procedural -= 0.11 * abs(normal.x);

  float worldPhase = fract((worldPosition.x + worldPosition.y + worldPosition.z) * 0.2);
  float screenPhase = fract((screenUv.x * viewportAspect + screenUv.y) * 110.0
    + globalUnscaledTime * 3.0);
  float centered = abs(screenPhase - 0.5) + 0.5;
  float screenBand = centered * centered;
  screenBand *= screenBand * centered;

  vec3 baseRgb = vec3(
    procedural + 0.091 * screenBand,
    0.105 * screenBand,
    0.126 * screenBand
  );
  float redFloor = max(procedural * 1.15 + 0.10465 * screenBand, 0.6);
  vec3 litRgb = clamp(vec3(
    4.0 * highlight.x + redFloor,
    4.0 * highlight.y + phase.z * reflection.y,
    phase.z * reflection.y
  ), 0.0, 1.0);
  litRgb += vec3(0.091, 0.105, 0.126) * screenBand;
  float directionalGate = (worldPhase > 0.7
    && dot(directionToLight, normal) + worldPhase > 0.5) ? 1.0 : 0.0;
  vec3 rgb = mix(baseRgb, litRgb, directionalGate);

  float distanceFade = redCrystalSaturate((distance(cameraPosition, worldPosition) - 5.0) * 0.1);
  rgb = mix(rgb, vec3(0.77, 0.05, 0.12), distanceFade);
  rgb = rgb * rgb + 0.4 * (rgb - rgb * rgb);

  float green = (rgb.r - rgb.g < 0.2) ? rgb.b * 0.9 : rgb.g;
  return vec4(rgb.r, green, rgb.b, 1.0);
}`.trim();
