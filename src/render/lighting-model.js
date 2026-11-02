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
  return sourceColor * sourceIntensity * texture(sourceCookie, cookieUv).a;
}`.trim();

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

const sourceSpotlight = (spotlight, doorId) => {
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
    rendererId: spotlight.rendererId ?? null,
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
  verifiedDoorKeys, decodedCookies, meshLayer,
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
  const spotlights = [], falseLights = [], omissions = [], occupiedSlots = new Set();
  for (const packet of livePackets) {
    const id = packet?.id;
    if (!sourceDoorId(id) || !verifiedDoorKeys.has(id)) {
      omissions.push(Object.freeze({ id: typeof id === 'string' ? id : null,
        reason: 'unqualified-source-door-join' }));
      continue;
    }
    if (!packet.active) continue;
    if (packet.falseLight?.enabled && packet.falseLight.slot >= 0 &&
        packet.falseLight.intensity > 0) {
      const slot = packet.falseLight.slot;
      if (!Number.isInteger(slot) || slot > 2 || occupiedSlots.has(slot)) {
        throw new RangeError(id + ' invalid or duplicate source false-light slot');
      }
      occupiedSlots.add(slot);
      falseLights.push(Object.freeze({
        doorId: id, slot,
        position: sourceLightVec3(packet.falseLight.position, id + ' falseLight.position'),
        intensity: sourceLightNonnegative(packet.falseLight.intensity,
          id + ' falseLight.intensity'),
        shaderParity: 'unverified-no-false-light-composition',
      }));
    }
    if (!packet.spotlight?.enabled || !(packet.spotlight.range > 0)) continue;
    const spotlight = sourceSpotlight(packet.spotlight, id);
    if (((spotlight.cullingMask >>> 0) & (1 << meshLayer)) === 0) {
      omissions.push(Object.freeze({ id, reason: 'source-spotlight-layer-mask' }));
      continue;
    }
    if (!decodedCookies.has(spotlight.cookieTextureId)) {
      omissions.push(Object.freeze({ id, reason: 'source-cookie-not-decoded' }));
      continue;
    }
    spotlights.push(spotlight);
  }
  falseLights.sort((a,b) => a.slot - b.slot);
  return Object.freeze({
    sourceScene: 'SHRL_Dojo2/build10/level10',
    source: 'source-joined-warning-with-provisional-web-cookie-projection',
    nativeLightingParity: false,
    spotlights: Object.freeze(spotlights),
    falseLights: Object.freeze(falseLights),
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
 * This returns UNCLAMPED additive Web-preview RGB, not a native color result.
 */
export function sampleDojoDoorWarningWebPreview(spotlight, worldPosition, cookieAlpha) {
  const point = sourceLightVec3(worldPosition, 'warning sample worldPosition');
  if (!Number.isFinite(cookieAlpha) || cookieAlpha < 0 || cookieAlpha > 1) {
    throw new RangeError('cookie alpha must be within [0,1]');
  }
  const delta = point.map((x,i) => x - spotlight.position[i]);
  const radius = Math.hypot(...delta);
  const along = delta.reduce((sum,x,i) => sum + x * spotlight.direction[i], 0);
  if (radius <= 0 || radius > spotlight.range || along <= 0 ||
      along / radius < spotlight.cosHalfAngle) {
    return Object.freeze({ rgb: Object.freeze([0,0,0]), cookieUv: null });
  }
  const aperture = 2 * along * spotlight.tanHalfAngle;
  const cookieUv = [
    0.5 + delta.reduce((sum,x,i) => sum + x * spotlight.right[i], 0) / aperture,
    0.5 + delta.reduce((sum,x,i) => sum + x * spotlight.up[i], 0) / aperture,
  ];
  if (aperture <= 0 || cookieUv.some(value => value < 0 || value > 1)) {
    return Object.freeze({ rgb: Object.freeze([0,0,0]), cookieUv: null });
  }
  return Object.freeze({
    rgb: Object.freeze(spotlight.color.map(channel =>
      channel * spotlight.intensity * cookieAlpha)),
    cookieUv: Object.freeze(cookieUv),
  });
}
