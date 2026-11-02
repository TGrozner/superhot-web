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
