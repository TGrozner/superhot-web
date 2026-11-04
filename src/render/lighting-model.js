/**
 * SH-13: generated Web lighting, plus an explicitly unresolved native profile.
 * Defaults mirror this repo's old Web shader; NONE are established MCD values.
 */
const finite=(n,label)=>{
  if(!Number.isFinite(n)||!Number.isFinite(Math.fround(n))) throw new TypeError(label+' must be finite float32');
  return n;
};
const clamp01=x=>Math.max(0,Math.min(1,x));
const vec3=(v,label)=>{
  if(!Array.isArray(v)||v.length!==3) throw new TypeError(label+' requires vec3');
  return Object.freeze(v.map((n,i)=>finite(n,label+'['+i+']')));
};
const unit=v=>{
  const size=Math.hypot(...v);
  if(size===0||!Number.isFinite(size)) throw new RangeError('Zero or invalid direction');
  return Object.freeze(v.map(x=>x/size));
};

export function createUnresolvedNativeLighting({scene,evidence}={}){
  if(typeof scene!=='string'||!scene) throw new TypeError('scene required');
  if(typeof evidence!=='string'||!evidence) throw new TypeError('evidence required');
  return Object.freeze({
    provenance:'unity-serialized-unresolved',scene,evidence,
    directional:null,ambient:null,fog:null,exposure:null,
    colorSpace:null,postProcess:null,
  });
}

export function createGeneratedLighting({
  direction=[-.55,.90,.42],ambient=.64,diffuse=.36,
  fogColor=[.927,.948,.966],fogStart=14,fogEnd=70,
  fogStrength=.72,exposure=1,colorSpace='display-srgb',
}={}){
  if(!['display-srgb','linear-srgb'].includes(colorSpace)){
    throw new TypeError('Unsupported generated color space');
  }
  const dir=unit(vec3(direction,'direction'));
  const fog=vec3(fogColor,'fogColor');
  for(const [name,value] of Object.entries({ambient,diffuse,fogStart,fogEnd,fogStrength,exposure})){
    finite(value,name);
  }
  if(ambient<0||diffuse<0||ambient+diffuse>4) throw new RangeError('Generated lighting coefficients out of range');
  if(fogStart<0||fogEnd<=fogStart) throw new RangeError('fogEnd must exceed fogStart');
  if(fogStrength<0||fogStrength>1) throw new RangeError('fogStrength outside [0,1]');
  if(exposure<=0||exposure>32) throw new RangeError('exposure outside (0,32]');
  if(fog.some(v=>v<0||v>1)) throw new RangeError('fogColor must be 0..1');
  return Object.freeze({
    provenance:'generated-web',
    directional:Object.freeze({direction:dir,ambient,diffuse}),
    fog:Object.freeze({color:fog,start:fogStart,end:fogEnd,strength:fogStrength}),
    exposure,colorSpace,postProcess:'none',
  });
}

/** Neutral shader-uniform values; SH-05/12 are the only shader integration owners. */
export function lightingUniformPacket(lighting){
  if(lighting?.provenance!=='generated-web'){
    throw new Error('Unresolved native lighting cannot be emitted as verified uniforms');
  }
  return Object.freeze({
    ambient:lighting.directional.ambient,diffuse:lighting.directional.diffuse,
    direction:lighting.directional.direction,
    fogColor:lighting.fog.color,fogStart:lighting.fog.start,
    fogEnd:lighting.fog.end,fogStrength:lighting.fog.strength,
    exposure:lighting.exposure,
    colorSpaceMode:lighting.colorSpace==='linear-srgb'?1:0,
    source:'generated-web',
  });
}
export function srgbToLinear(value){
  finite(value,'sRGB channel');
  if(value<0||value>1) throw new RangeError('sRGB channel must be 0..1');
  return value<=.04045?value/12.92:((value+.055)/1.055)**2.4;
}
export function linearToSrgb(value){
  finite(value,'linear channel');
  if(value<0||value>1) throw new RangeError('linear channel must be 0..1');
  return value<=.0031308?12.92*value:1.055*value**(1/2.4)-.055;
}

/** CPU sample for generated Web shading comparison; NOT a Unity render proof. */
export function sampleGeneratedLighting(lighting,{color,normal,position,cameraPosition}={}){
  const u=lightingUniformPacket(lighting);
  if(!Array.isArray(color)||color.length!==4) throw new TypeError('color must be rgba vec4');
  const rgba=color.map((n,i)=>finite(n,'color['+i+']'));
  if(rgba.some(x=>x<0||x>1)) throw new RangeError('rgba outside [0,1]');
  const normalUnit=unit(vec3(normal,'normal'));
  const p=vec3(position,'position'),c=vec3(cameraPosition,'cameraPosition');
  const dot=Math.max(0,normalUnit.reduce((sum,x,i)=>sum+x*u.direction[i],0));
  const factor=u.ambient+u.diffuse*dot;
  const dist=Math.hypot(p[0]-c[0],p[1]-c[1],p[2]-c[2]);
  const fogWeight=clamp01((dist-u.fogStart)/(u.fogEnd-u.fogStart))*u.fogStrength;
  const linear=u.colorSpaceMode===1;
  const rgb=rgba.slice(0,3).map((channel,i)=>{
    const base=linear?srgbToLinear(channel):channel;
    const fog=linear?srgbToLinear(u.fogColor[i]):u.fogColor[i];
    const result=clamp01((base*factor*(1-fogWeight)+fog*fogWeight)*u.exposure);
    return linear?linearToSrgb(result):result;
  });
  return Object.freeze([...rgb,rgba[3]]);
}


/**
 * Bounded Unity RenderSettings fields from a serialized SCENE, not a
 * runtime rendering capture. Never treats ambientIntensity alone as full
 * ambient luminance (environment probes, skybox and bake are separate).
 */
export function createSerializedRenderSettings({
  scene,owner,pathId,fogEnabled,ambientIntensity,evidence,
}={}){
  if(typeof scene!=='string'||!scene) throw new TypeError('scene required');
  if(typeof owner!=='string'||!owner) throw new TypeError('owner required');
  if(!Number.isSafeInteger(pathId)||pathId<1) throw new TypeError('pathId required');
  if(typeof fogEnabled!=='boolean') throw new TypeError('fogEnabled must be boolean');
  finite(ambientIntensity,'ambientIntensity');
  if(ambientIntensity<0) throw new RangeError('ambientIntensity must be nonnegative');
  if(typeof evidence!=='string'||!evidence) throw new TypeError('private evidence locator required');
  return Object.freeze({
    provenance:'unity-serialized',scene,owner,pathId,
    fogEnabled,ambientIntensity,evidence,
    runtimeActivationVerified:false,
  });
}

/**
 * For an explicitly opted-in serialized scene, source-derived fog=OFF is
 * a stronger statement than the generated prototype's hardcoded fog=ON.
 * Only fogStrength changes; direction, RGB, exposure, bake remain generated.
 * Caller must label the result a mixed-source approximation, NOT MCD parity.
 */
export function generatedUniformsWithSerializedFogOff(generatedLighting,settings){
  const u=lightingUniformPacket(generatedLighting);
  if(settings?.provenance!=='unity-serialized'||settings.fogEnabled!==false){
    throw new Error('Serialized fog-off proof required');
  }
  return Object.freeze({
    ...u,fogStrength:0,
    source:'generated-web-plus-serialized-fog-off',
    fogEvidence:settings.evidence,
  });
}


/**
 * SH-13 / Dojo build10: source-joined visual warning-light handoff.
 *
 * The SH-07 recovered createMcdDoorWarnings() controller owns timing.
 * This adapter never updates its live records or guesses a door key from
 * spawnPoint.id. SH-05 must supply a *verified* spawn/door -> owner::pathId
 * join, source instance.layer, and the set of cookie textures already decoded.
 *
 * The geometry/cookie shader below is an explicitly provisional Web preview:
 * the original Unity cookie projection, shadow map, light attenuation,
 * photometric transfer, and final compositor are NOT recovered. These values
 * are not native-parity uniforms.
 */
export const DOJO_DOOR_WARNING_WEB_PREVIEW_GLSL = `
float dojoWebWarningSmooth(float x) {
  float t = clamp(x, 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}
float dojoWebWarningFalloff(float radius, float range, float along, float cosHalfAngle) {
  float distance = dojoWebWarningSmooth(1.0 - radius / range);
  float cone = (along / radius - cosHalfAngle) / max(1.0 - cosHalfAngle, 0.0001);
  return distance * dojoWebWarningSmooth(cone / 0.2);
}
float dojoWebWarningCompression(float energy) {
  return energy / (3.0 + energy);
}
// J4 Web art direction: red warning light must stay readable on bright
// Concrete instead of clipping into nearly-white additive RGB. This is
// deliberately signed colour grading, NOT physically additive Unity light.
vec3 dojoWebWarningContrast(vec3 sourceColor, float strength) {
  float dangerRed = max(sourceColor.r - max(sourceColor.g, sourceColor.b), 0.0);
  vec3 graded = strength * (sourceColor - vec3(0.0, 0.32 * dangerRed, 0.32 * dangerRed));
  // J4 Web-only crystal glow: a strong warning warms the translucent-looking
  // red facets toward a pale pink core. With purely red additive light, the
  // existing saturated Red Crystal pass barely changes colour on warning.
  // Uses the already-bound world-pass uMode; no new uniform, pass or texture.
  if (uMode == 3 && dangerRed > 0.0) {
    float heat = dojoWebWarningSmooth((strength - 0.26) / 0.44);
    graded += vec3(0.12, 0.26, 0.30) * (heat * dangerRed);
  }
  return graded;
}
// Web visual design: soft cone, distance fade and highlight compression.
// Serialized world basis, cookie, color and controller envelope stay untouched.
vec3 dojoDoorWarningSpotWebPreview(
  sampler2D sourceCookie, vec3 worldPosition,
  vec3 lightPosition, vec3 lightDirection, vec3 lightRight, vec3 lightUp,
  float sourceRange, float cosHalfAngle, float tanHalfAngle,
  vec3 sourceColor, float sourceIntensity
) {
  vec3 offset = worldPosition - lightPosition;
  float radius = length(offset);
  if (radius <= 0.0 || radius > sourceRange) return vec3(0.0);
  float along = dot(offset, lightDirection);
  if (along <= 0.0 || along / radius < cosHalfAngle) return vec3(0.0);
  float aperture = 2.0 * along * tanHalfAngle;
  if (aperture <= 0.0) return vec3(0.0);
  vec2 cookieUv = vec2(dot(offset, lightRight), dot(offset, lightUp))
    / aperture + vec2(0.5);
  if (any(lessThan(cookieUv, vec2(0.0))) ||
      any(greaterThan(cookieUv, vec2(1.0)))) return vec3(0.0);
  float edge = min(min(cookieUv.x, cookieUv.y),
                   min(1.0 - cookieUv.x, 1.0 - cookieUv.y));
  float feather = dojoWebWarningSmooth(edge / 0.06);
  float energy = sourceIntensity * texture(sourceCookie, cookieUv).a * feather
    * dojoWebWarningFalloff(radius, sourceRange, along, cosHalfAngle);
  return dojoWebWarningContrast(sourceColor, dojoWebWarningCompression(max(energy, 0.0)));
}
// Web-authored optional visual cue, NOT an MCD cookie substitute.
// Requires explicit per-spot Web-mode opt-in from the GPU integration owner.
// No procedural asset, texture sample, new geometry or extra draw pass.
vec3 dojoDoorWarningSpotWebGlow(
  vec3 worldPosition, vec3 lightPosition, vec3 lightDirection,
  float sourceRange, float cosHalfAngle, vec3 sourceColor, float sourceIntensity
) {
  vec3 offset = worldPosition - lightPosition;
  float radius = length(offset);
  if (radius <= 0.0 || radius > sourceRange) return vec3(0.0);
  float along = dot(offset, lightDirection);
  if (along <= 0.0 || along / radius < cosHalfAngle) return vec3(0.0);
  float energy = sourceIntensity
    * dojoWebWarningFalloff(radius, sourceRange, along, cosHalfAngle);
  return dojoWebWarningContrast(sourceColor, dojoWebWarningCompression(max(energy, 0.0)));
}
// J4 creative Web fill: the SH-04 doorway false-light already has a live
// world position/intensity, but no recovered native shader/falloff/colour.
// One cheap world-space red wash per enabled false-light; no texture/pass.
vec3 dojoDoorFalseLightWashWeb(
  vec3 worldPosition, vec3 lightPosition, float sourceIntensity
) {
  float radius = length(worldPosition - lightPosition);
  if (sourceIntensity <= 0.0 || radius >= 4.0) return vec3(0.0);
  float fade = dojoWebWarningSmooth(1.0 - radius / 4.0);
  // Creative Web wall-facing response, NOT a shadow/occlusion test.
  // Keep a 20% warning floor for legibility on back-facing geometry.
  // vNormal/uHasNormals are already provided by native-world-pass.
  float facing = 1.0;
  if (uHasNormals != 0 && radius > 0.0001) {
    float towardLamp = dot(vNormal, lightPosition - worldPosition) / radius;
    facing = 0.2 + 0.8 * clamp(towardLamp, 0.0, 1.0);
  }
  float energy = sourceIntensity * fade * fade * facing;
  return dojoWebWarningContrast(
    vec3(1.0, 0.06, 0.10), dojoWebWarningCompression(energy));
}
`.trim();

const sourceDoorId = value =>
  typeof value === 'string' && /^[A-Za-z0-9_.-]+::[1-9][0-9]*$/.test(value);

const sourceLightVec3 = (value, label) => {
  if (!Array.isArray(value) || value.length !== 3 ||
      value.some(channel => !Number.isFinite(channel))) {
    throw new TypeError(label + ' must be finite vec3');
  }
  return Object.freeze([...value]);
};

const sourceLightNonnegative = (value, label) => {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(label + ' must be finite and nonnegative');
  }
  return value;
};

const sourceSpotlight = (spotlight, doorId, rendererId) => {
  const position = sourceLightVec3(spotlight?.position, doorId + ' spotlight.position');
  const direction = unit(sourceLightVec3(spotlight?.direction, doorId + ' spotlight.direction'));
  const right = unit(sourceLightVec3(spotlight?.right, doorId + ' spotlight.right'));
  const up = unit(sourceLightVec3(spotlight?.up, doorId + ' spotlight.up'));
  const range = sourceLightNonnegative(spotlight?.range, doorId + ' spotlight.range');
  const intensity = sourceLightNonnegative(spotlight?.intensity, doorId + ' spotlight.intensity');
  const color = sourceLightVec3(spotlight?.color, doorId + ' spotlight.color');
  const spotAngle = spotlight?.spotAngle;
  if (!Number.isFinite(spotAngle) || spotAngle <= 0 || spotAngle >= 180) {
    throw new RangeError(doorId + ' spotlight.spotAngle must be in (0,180)');
  }
  const cullingMask = spotlight?.cullingMask;
  if (!Number.isSafeInteger(cullingMask) || cullingMask < -2147483648 ||
      cullingMask > 4294967295) {
    throw new TypeError(doorId + ' spotlight.cullingMask must be a Unity layer mask');
  }
  if (typeof spotlight.cookieTextureId !== 'string' ||
      !spotlight.cookieTextureId) {
    throw new TypeError(doorId + ' spotlight.cookieTextureId required');
  }
  const halfAngleRadians = spotAngle * Math.PI / 360;
  return Object.freeze({
    doorId,
    position, direction, right, up, color, range, intensity,
    cosHalfAngle: Math.cos(halfAngleRadians),
    tanHalfAngle: Math.tan(halfAngleRadians),
    cullingMask: cullingMask >>> 0,
    cookieTextureId: spotlight.cookieTextureId,
    rendererId: rendererId ?? null,
    provenance: 'source-door-warning-serialized-packet',
    shaderParity: 'unverified-web-cookie-preview',
  });
};

/**
 * Builds the draw inputs for ONE source-qualified mesh layer.
 *
 * No cookie => no spotlight. No exact door join => no light at all.
 * The three false-light slots are returned separately as *data*; their
 * original shader/color/falloff are unknown and must not be projected using
 * the spotlight cookie. The same controller can be evaluated per instance
 * without consuming the curve or changing the warning clock.
 */
export function prepareDojoDoorWarningLighting(sceneSource, livePackets, {
  verifiedDoorKeys, decodedCookies, meshLayer, allowWebCookieFreeGlow = false,
} = {}) {
  if (sceneSource?.sceneBuildIndex !== 10 ||
      sceneSource.serializedOwner !== 'level10' ||
      !sceneSource.scenePath?.endsWith('SHRL_Dojo2.unity')) {
    throw new Error('Source-qualified Dojo build10 scene required');
  }
  if (!Array.isArray(livePackets) ||
      !(verifiedDoorKeys instanceof Set) ||
      !(decodedCookies instanceof Set) ||
      !Number.isInteger(meshLayer) || meshLayer < 0 || meshLayer > 31) {
    throw new TypeError('Dojo warning needs packets, joined door IDs, decoded cookies and mesh layer');
  }
  if (typeof allowWebCookieFreeGlow !== 'boolean') {
    throw new TypeError('allowWebCookieFreeGlow must be boolean');
  }
  const spotlights = [], falseLights = [], omissions = [], occupiedSlots = new Set();
  for (const packet of livePackets) {
    const id = packet?.id;
    if (!sourceDoorId(id) || !verifiedDoorKeys.has(id)) {
      omissions.push(Object.freeze({ id: typeof id === 'string' ? id : null,
        reason: 'unqualified-source-door-join' }));
      continue;
    }
    if (!packet.active) continue;
    if (packet.falseLight?.enabled && packet.falseLight.slot >= 0) {
      const intensity = sourceLightNonnegative(packet.falseLight.intensity,
        id + ' falseLight.intensity');
      const slot = packet.falseLight.slot;
      if (!Number.isInteger(slot) || slot > 2 || occupiedSlots.has(slot)) {
        throw new RangeError(id + ' invalid or duplicate source false-light slot');
      }
      if (intensity > 0) {
        // The Unity component can be known before its parent-chain world TRS
        // has been recovered. Do not crash the Dojo or invent a world point.
        if (packet.falseLight.position == null) {
          omissions.push(Object.freeze({ id,
            reason: 'source-false-light-world-position-not-resolved' }));
        } else {
          occupiedSlots.add(slot);
          falseLights.push(Object.freeze({
            doorId: id, slot,
            position: sourceLightVec3(packet.falseLight.position, id + ' falseLight.position'),
            intensity,
            shaderParity: 'unverified-no-false-light-composition',
          }));
        }
      }
    }
    if (!packet.spotlight?.enabled) continue;
    const range = sourceLightNonnegative(packet.spotlight.range, id + ' spotlight.range');
    if (range === 0) continue;
    // SH-04 research #175 may provide local TRS, not the accumulated
    // world-space basis. Until that exact chain is qualified, fail closed.
    if (['position', 'direction', 'right', 'up'].some(
      name => packet.spotlight[name] == null)) {
      omissions.push(Object.freeze({ id,
        reason: 'source-spotlight-world-basis-not-resolved' }));
      continue;
    }
    const spotlight = sourceSpotlight(packet.spotlight, id, packet.rendererId);
    if (((spotlight.cullingMask >>> 0) & (1 << meshLayer)) === 0) {
      omissions.push(Object.freeze({ id, reason: 'source-spotlight-layer-mask' }));
      continue;
    }
    if (!decodedCookies.has(spotlight.cookieTextureId)) {
      omissions.push(Object.freeze({ id, reason: 'source-cookie-not-decoded' }));
      if (allowWebCookieFreeGlow) {
        spotlights.push(Object.freeze({ ...spotlight,
          webPreviewMode: 'web-procedural-no-cookie', sourceCookieDecoded: false,
          shaderParity: 'web-authored-creative-light-not-MCD',
        }));
      }
      continue;
    }
    spotlights.push(Object.freeze({ ...spotlight,
      webPreviewMode: 'source-cookie-web-preview', sourceCookieDecoded: true,
    }));
  }
  falseLights.sort((a,b) => a.slot - b.slot);
  return Object.freeze({
    sourceScene: 'SHRL_Dojo2/build10/level10',
    source: 'source-joined-warning-with-provisional-web-cookie-projection',
    nativeLightingParity: false,
    spotlights: Object.freeze(spotlights),
    falseLights: Object.freeze(falseLights),
    // Web-only short-range illumination can be culled per mesh without
    // rewriting the source false-light slots or their owner-qualified data.
    webFalseLights: falseLights,
    omissions: Object.freeze(omissions),
    unresolved: Object.freeze([
      'native cookie projection and orientation',
      'shadow map and light attenuation',
      'false-light shader/color/falloff',
      'post-process, exposure and final framebuffer',
    ]),
  });
}

/**
 * CPU preview of the matching clean GLSL projection. Synthetic sampled alpha
 * is an explicit argument; never assumes a missing source PNG is white.
 * Returns signed, UNCLAMPED creative Web-grade RGB. A red warning may reduce
 * green/blue so it stays visible against bright Concrete; NOT native lighting.
 */
const dojoWebWarningSmooth = value => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};
const dojoWebWarningWeight = (spotlight, radius, along) =>
  dojoWebWarningSmooth(1 - radius / spotlight.range) *
  dojoWebWarningSmooth(((along / radius - spotlight.cosHalfAngle) /
    Math.max(1 - spotlight.cosHalfAngle, .0001)) / .2);
const zeroWebWarning = () => Object.freeze({ rgb: Object.freeze([0, 0, 0]), cookieUv: null });
// Exact CPU counterpart of the shader's deliberately nonphysical red grading.
const webWarningContrast = (color, strength, webMaterialMode = 2) => {
  // Suppressed/fully transparent warnings must be exact +0 in the CPU
  // contract; multiplying a negative colour component by zero gives -0.
  if (strength === 0) return Object.freeze([0, 0, 0]);
  const dangerRed = Math.max(color[0] - Math.max(color[1], color[2]), 0);
  const rgb = [
    color[0] * strength,
    (color[1] - .32 * dangerRed) * strength,
    (color[2] - .32 * dangerRed) * strength,
  ];
  // CPU counterpart of the GPU's Web-authored Red Crystal-only heat grade.
  if (webMaterialMode === 3 && dangerRed > 0) {
    const heat = dojoWebWarningSmooth((strength - .26) / .44) * dangerRed;
    rgb[0] += .12 * heat;
    rgb[1] += .26 * heat;
    rgb[2] += .30 * heat;
  }
  return Object.freeze(rgb);
};

/** CPU mirror of the deliberately Web-styled, cookie-bearing GPU preview. */
export function sampleDojoDoorWarningWebPreview(spotlight, worldPosition, cookieAlpha, webMaterialMode = 2) {
  const point = sourceLightVec3(worldPosition, 'warning sample worldPosition');
  if (!Number.isFinite(cookieAlpha) || cookieAlpha < 0 || cookieAlpha > 1) {
    throw new RangeError('cookie alpha must be within [0,1]');
  }
  const delta = point.map((x,i) => x - spotlight.position[i]);
  const radius = Math.hypot(...delta);
  const along = delta.reduce((sum,x,i) => sum + x * spotlight.direction[i], 0);
  if (radius <= 0 || radius > spotlight.range || along <= 0 ||
      along / radius < spotlight.cosHalfAngle) return zeroWebWarning();
  const aperture = 2 * along * spotlight.tanHalfAngle;
  if (aperture <= 0) return zeroWebWarning();
  const cookieUv = [
    0.5 + delta.reduce((sum,x,i) => sum + x * spotlight.right[i], 0) / aperture,
    0.5 + delta.reduce((sum,x,i) => sum + x * spotlight.up[i], 0) / aperture,
  ];
  if (cookieUv.some(value => value < 0 || value > 1)) return zeroWebWarning();
  const edge = Math.min(cookieUv[0], cookieUv[1], 1 - cookieUv[0], 1 - cookieUv[1]);
  const energy = spotlight.intensity * cookieAlpha *
    dojoWebWarningSmooth(edge / .06) * dojoWebWarningWeight(spotlight, radius, along);
  const glow = energy / (3 + energy);
  return Object.freeze({
    rgb: webWarningContrast(spotlight.color, glow, webMaterialMode),
    cookieUv: Object.freeze(cookieUv),
  });
}

/**
 * CPU mirror of the optional Web-only procedural warning illumination.
 * It deliberately requires an explicit Web fallback packet, never a phantom
 * Unity cookie. No image, mesh, URL or runtime event is generated here.
 */
export function sampleDojoDoorWarningWebGlow(spotlight, worldPosition, webMaterialMode = 2) {
  if (spotlight?.webPreviewMode !== 'web-procedural-no-cookie') {
    throw new TypeError('Explicit Web procedural warning packet required');
  }
  const point = sourceLightVec3(worldPosition, 'warning glow worldPosition');
  const delta = point.map((x,i) => x - spotlight.position[i]);
  const radius = Math.hypot(...delta);
  const along = delta.reduce((sum,x,i) => sum + x * spotlight.direction[i], 0);
  if (radius <= 0 || radius > spotlight.range || along <= 0 ||
      along / radius < spotlight.cosHalfAngle) return zeroWebWarning();
  const energy = spotlight.intensity * dojoWebWarningWeight(spotlight, radius, along);
  const glow = energy / (3 + energy);
  return Object.freeze({
    rgb: webWarningContrast(spotlight.color, glow, webMaterialMode),
    cookieUv: null,
  });
}


/**
 * J4 Web-only floor/doorway fill from an EXISTING SH-07/SH-04 false-light
 * position and intensity. 4 m radius and warm red grade are Web art choices:
 * the native XulmFalseLight composition/colour/falloff remain unresolved.
 * This creative Web improvement attenuates the wash on surfaces facing AWAY
 * from the lamp, keeping 20% ambient legibility. It does NOT cast shadows or
 * solve wall occlusion. Flat source meshes use their interpolated vNormal;
 * surfaces with no normal retain the former omnidirectional wash.
 * SH-05's existing world shader imports the updated GLSL automatically.
 * @param {{position: number[], intensity: number, shaderParity: string}} falseLight
 * @param {number[]} worldPosition
 * @param {number} [webMaterialMode]
 * @param {number[] | null} [worldNormal] - optional valid world surface normal; null mirrors uHasNormals=0.
 * @returns {{rgb: readonly number[], cookieUv: null}}
 */
export function sampleDojoDoorFalseLightWebWash(falseLight, worldPosition, webMaterialMode = 2, worldNormal = null) {
  if (falseLight?.shaderParity !== 'unverified-no-false-light-composition') {
    throw new TypeError('Source-qualified false-light packet required');
  }
  const position = sourceLightVec3(falseLight.position, 'false-light position');
  const point = sourceLightVec3(worldPosition, 'false-light sample');
  const intensity = sourceLightNonnegative(falseLight.intensity, 'false-light intensity');
  const distance = Math.hypot(...point.map((value, index) => value - position[index]));
  if (intensity === 0 || distance >= 4) return zeroWebWarning();
  const fade = dojoWebWarningSmooth(1 - distance / 4);
  // For flat source normals the GPU dot(vNormal, towardLamp) mirrors this
  // normalized CPU reference; curved interpolants are only approximated.
  let facing = 1;
  if (worldNormal !== null) {
    const normal = unit(sourceLightVec3(worldNormal, 'false-light worldNormal'));
    if (distance > .0001) {
      const cosine = normal.reduce((sum, value, index) =>
        sum + value * (position[index] - point[index]), 0) / distance;
      facing = .2 + .8 * clamp01(cosine);
    }
  }
  const energy = intensity * fade * fade * facing;
  return Object.freeze({
    rgb: webWarningContrast([1, .06, .10], energy / (3 + energy), webMaterialMode),
    cookieUv: null,
  });
}

/**
 * The SH-07 controller intentionally reuses its live packet ARRAY and MUTATES
 * the records every tick. Keying only on array identity would freeze door
 * sweeps and player/spawn tracking. Compare every value consumed by the
 * spotlight/false-light preparation before reusing a layer's GPU packet.
 * A full native validation/freeze is then needed only once per changed layer.
 * This is a Web CPU optimization, not a native lighting claim.
 */
const warningVectorSnapshot = value => Array.isArray(value) ? [...value] : value;
const sameWarningVector = (left, right) =>
  Array.isArray(left) && Array.isArray(right)
    ? left.length === right.length && left.every((value, index) => Object.is(value, right[index]))
    : Object.is(left, right);

const warningPacketSnapshot = packet => {
  const spot = packet?.spotlight;
  const falseLight = packet?.falseLight;
  return {
    id: packet?.id, active: packet?.active, elapsed: packet?.elapsed,
    rendererId: packet?.rendererId,
    spotEnabled: spot?.enabled, spotRange: spot?.range,
    spotIntensity: spot?.intensity, spotAngle: spot?.spotAngle,
    spotMask: spot?.cullingMask, spotCookie: spot?.cookieTextureId,
    spotPosition: warningVectorSnapshot(spot?.position),
    spotDirection: warningVectorSnapshot(spot?.direction),
    spotRight: warningVectorSnapshot(spot?.right),
    spotUp: warningVectorSnapshot(spot?.up),
    spotColor: warningVectorSnapshot(spot?.color),
    falseEnabled: falseLight?.enabled, falseIntensity: falseLight?.intensity,
    falseSlot: falseLight?.slot,
    falsePosition: warningVectorSnapshot(falseLight?.position),
  };
};

const warningPacketsUnchanged = (packets, snapshot) => {
  if (!Array.isArray(packets) || packets.length !== snapshot.length) return false;
  for (let index = 0; index < packets.length; index++) {
    const packet = packets[index], saved = snapshot[index];
    const spot = packet?.spotlight, falseLight = packet?.falseLight;
    if (!Object.is(packet?.id, saved.id) ||
        !Object.is(packet?.active, saved.active) ||
        !Object.is(packet?.elapsed, saved.elapsed) ||
        !Object.is(packet?.rendererId, saved.rendererId) ||
        !Object.is(spot?.enabled, saved.spotEnabled) ||
        !Object.is(spot?.range, saved.spotRange) ||
        !Object.is(spot?.intensity, saved.spotIntensity) ||
        !Object.is(spot?.spotAngle, saved.spotAngle) ||
        !Object.is(spot?.cullingMask, saved.spotMask) ||
        !Object.is(spot?.cookieTextureId, saved.spotCookie) ||
        !sameWarningVector(spot?.position, saved.spotPosition) ||
        !sameWarningVector(spot?.direction, saved.spotDirection) ||
        !sameWarningVector(spot?.right, saved.spotRight) ||
        !sameWarningVector(spot?.up, saved.spotUp) ||
        !sameWarningVector(spot?.color, saved.spotColor) ||
        !Object.is(falseLight?.enabled, saved.falseEnabled) ||
        !Object.is(falseLight?.intensity, saved.falseIntensity) ||
        !Object.is(falseLight?.slot, saved.falseSlot) ||
        !sameWarningVector(falseLight?.position, saved.falsePosition)) return false;
  }
  return true;
};

/**
 * SH-13 / Dojo: bind the *existing* source warning controller to the already
 * decoded scene textures and the exact layer of an authored world instance.
 * This does NOT create a texture, light, asset URL or gameplay event.
 *
 * @param {object} scene - prepareNativeScene() output; must identify level10.
 * @param {Map<string, ImageBitmap>} images - decoded by the scene loader.
 * @returns {{cookieStatus: readonly object[], prepareForInstance:
 *   (instanceId: string, packets: object[]) => object,
 *   cookieImage: (textureId: string) => ImageBitmap | null}}
 */

/**
 * J4 Web-only GPU optimization: cull warning projection conservatively when
 * an authored static mesh cannot intersect the light's finite forward cone.
 * The current world vertex shader applies uModel without displacement.
 * sqrt(||M||1 * ||M||inf) bounds nonuniform scale and shear safely.
 * Unknown bounds deliberately bypass culling: never drop visible pixels.
 */
const dojoWorldInstanceSphere = (scene, instance) => {
  // Only scene-builder qualified, static world-pass meshes have a stable
  // source-to-GPU bound. Synthetic/unclassified objects fail open.
  if (instance.classification?.worldPassEligible !== true) return null;
  const bounds = scene.meshes?.get(instance.meshId)?.mesh?.bounds;
  const center = bounds?.center, m = instance.model;
  if (!Array.isArray(center) || center.length !== 3 ||
      !center.every(Number.isFinite) || !(bounds.radius >= 0) ||
      !Number.isFinite(bounds.radius) ||
      !m || m.length !== 16 || !Array.from(m).every(Number.isFinite)) return null;
  const column = Math.max(
    Math.abs(m[0]) + Math.abs(m[1]) + Math.abs(m[2]),
    Math.abs(m[4]) + Math.abs(m[5]) + Math.abs(m[6]),
    Math.abs(m[8]) + Math.abs(m[9]) + Math.abs(m[10]));
  const row = Math.max(
    Math.abs(m[0]) + Math.abs(m[4]) + Math.abs(m[8]),
    Math.abs(m[1]) + Math.abs(m[5]) + Math.abs(m[9]),
    Math.abs(m[2]) + Math.abs(m[6]) + Math.abs(m[10]));
  const radius = bounds.radius * Math.sqrt(column * row);
  const world = [
    m[0] * center[0] + m[4] * center[1] + m[8] * center[2] + m[12],
    m[1] * center[0] + m[5] * center[1] + m[9] * center[2] + m[13],
    m[2] * center[0] + m[6] * center[1] + m[10] * center[2] + m[14],
  ];
  if (!Number.isFinite(radius) || !world.every(Number.isFinite)) return null;
  return { center: world, radius };
};

const dojoSpotCouldReachSphere = (spot, sphere) => {
  const delta = sphere.center.map((value, i) => value - spot.position[i]);
  const distance = Math.hypot(...delta);
  const slack = 1e-4 * Math.max(1, distance, spot.range, sphere.radius);
  if (distance > spot.range + sphere.radius + slack) return false;
  const along = delta.reduce((sum, value, i) => sum + value * spot.direction[i], 0);
  if (along < -sphere.radius - slack) return false;
  const lateral = Math.sqrt(Math.max(0, distance * distance - along * along));
  return lateral - sphere.radius <=
    Math.max(0, along + sphere.radius) * spot.tanHalfAngle + slack;
};

export function createDojoDoorWarningSceneAdapter(scene, images, {
  allowWebCookieFreeGlow = false,
} = {}) {
  const source = scene?.source;
  if (source?.sceneBuildIndex !== 10 || source.serializedOwner !== 'level10' ||
      !source.scenePath?.endsWith('SHRL_Dojo2.unity')) {
    throw new Error('Source-qualified Dojo build10 scene required');
  }
  if (!(scene.textures instanceof Map) || !(scene.instanceMap instanceof Map) ||
      !(images instanceof Map)) {
    throw new TypeError('Prepared scene texture/instance maps and decoded images required');
  }
  const doors = scene.gameplay?.audio?.doors;
  if (!doors || typeof doors !== 'object' || Array.isArray(doors)) {
    throw new TypeError('Source-qualified Dojo door catalog required');
  }
  // Source join: level10 spawner GO103/221/370 -> warning components
  // 7089/7090/7091. Research #166/#167/#169/#170, SH-04 #198.
  // Do not derive keys from scene anchors, spawnPoint.id or nearby geometry.
  const qualifiedDoorKeys = new Set([
    'level10::7089', 'level10::7090', 'level10::7091',
  ].filter(key => Object.hasOwn(doors, key)));
  const decodedCookies = new Set();
  const cookieImages = new Map();
  const cookieStatus = [];
  const layerPacketCache = new Map();
  const instanceBoundCache = new Map();
  const instanceLightCache = new Map();
  for (const doorId of qualifiedDoorKeys) {
    const textureId = doors[doorId]?.spotlight?.cookieTextureId;
    const sourceTexturePresent = typeof textureId === 'string' &&
      scene.textures.has(textureId);
    const image = sourceTexturePresent ? images.get(textureId) : null;
    // The production loader uses createImageBitmap. A descriptor or a
    // compressed byte buffer is NOT proof of a decoded cookie image.
    const decoded = Boolean(image &&
      Number.isSafeInteger(image.width) && image.width > 0 &&
      Number.isSafeInteger(image.height) && image.height > 0 &&
      (typeof ImageBitmap !== 'function' || image instanceof ImageBitmap));
    if (decoded) {
      decodedCookies.add(textureId);
      cookieImages.set(textureId, image);
    }
    cookieStatus.push(Object.freeze({
      doorId,
      textureId: typeof textureId === 'string' ? textureId : null,
      sourceTexturePresent,
      decoded,
      reason: decoded ? 'scene-cookie-image-decoded' :
        !sourceTexturePresent ? 'source-cookie-not-in-scene-textures' :
          'source-cookie-image-not-decoded',
    }));
  }

  // Keep layer-wide validated uniforms, then cull only the spotlight entries
  // outside each *static* authored mesh. False-light data stays untouched.
  const forInstance = (instanceId, instance, layerResult) => {
    if (layerResult.spotlights.length === 0 && layerResult.webFalseLights.length === 0)
      return layerResult;
    const cached = instanceLightCache.get(instanceId);
    if (cached?.layerResult === layerResult) return cached.packet;
    if (!instanceBoundCache.has(instanceId))
      instanceBoundCache.set(instanceId, dojoWorldInstanceSphere(scene, instance));
    const sphere = instanceBoundCache.get(instanceId);
    const lights = sphere ? layerResult.spotlights.filter(spot =>
      dojoSpotCouldReachSphere(spot, sphere)) : layerResult.spotlights;
    // Unlike source spotlight layers, the false-light's native GPU mask is
    // unknown. This cull applies ONLY to the explicitly Web-authored 4 m wash.
    const fills = sphere ? layerResult.webFalseLights.filter(fill => {
      const distance = Math.hypot(...fill.position.map((value, i) => value - sphere.center[i]));
      const slack = 1e-4 * Math.max(1, distance, sphere.radius);
      return distance <= 4 + sphere.radius + slack;
    }) : layerResult.webFalseLights;
    const skipped = layerResult.spotlights.length - lights.length;
    const skippedFills = layerResult.webFalseLights.length - fills.length;
    const packet = skipped === 0 && skippedFills === 0 ? layerResult : Object.freeze({
      ...layerResult,
      spotlights: Object.freeze(lights),
      webFalseLights: Object.freeze(fills),
      webBoundsCulledSpotlights: skipped,
      webBoundsCulledFalseLights: skippedFills,
    });
    instanceLightCache.set(instanceId, { layerResult, packet });
    return packet;
  };
  return Object.freeze({
    cookieStatus: Object.freeze(cookieStatus),
    /**
     * @param {string} instanceId - id of an authored source mesh instance.
     * @param {object[]} packets - current SH-07 warning controller packets.
     */
    prepareForInstance(instanceId, packets) {
      const instance = scene.instanceMap.get(instanceId);
      if (!instance || !Number.isInteger(instance.layer) ||
          instance.layer < 0 || instance.layer > 31) {
        throw new TypeError('Authored world instance with source Unity layer required');
      }
      // Typical scenes draw hundreds of meshes but use only a few Unity
      // layers. Avoid re-normalizing and allocating the same live spotlights
      // once per mesh; invalidate on ALL mutable controller/steering inputs.
      const cache = layerPacketCache.get(instance.layer);
      if (cache?.packets === packets &&
          warningPacketsUnchanged(packets, cache.snapshot))
        return forInstance(instanceId, instance, cache.result);
      const result = prepareDojoDoorWarningLighting(source, packets, {
        verifiedDoorKeys: qualifiedDoorKeys,
        decodedCookies,
        meshLayer: instance.layer,
        allowWebCookieFreeGlow,
      });
      layerPacketCache.set(instance.layer, {
        packets, snapshot: packets.map(warningPacketSnapshot), result,
      });
      return forInstance(instanceId, instance, result);
    },
    /** Return only a previously decoded source scene cookie; no fallback. */
    cookieImage(textureId) {
      return cookieImages.get(textureId) ?? null;
    },
  });
}
