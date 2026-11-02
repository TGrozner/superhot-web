/**
 * SH-13: metadata-aware material packets. Unity object refs are NOT colors,
 * resolved shaders, textures, or evidence of actual runtime rendering.
 */
const finite=(n,label)=>{
  if (!Number.isFinite(n)||!Number.isFinite(Math.fround(n))) throw new TypeError(label+' must be finite float32');
  return n;
};
const int=(n,label,min=0)=>{
  if (!Number.isSafeInteger(n)||n<min) throw new TypeError(label+' must be an integer >= '+min);
  return n;
};
const flag=(n,label)=>{
  if(typeof n!=='boolean') throw new TypeError(label+' must be boolean');
  return n;
};
const vec=(values,count,label)=>{
  if(!Array.isArray(values)||values.length!==count) throw new TypeError(label+' requires '+count+' components');
  return Object.freeze(values.map((n,i)=>finite(n,label+'['+i+']')));
};
const rgb=(color)=>{
  if(typeof color!=='string'||!/^#[0-9a-fA-F]{6}$/.test(color)) throw new TypeError('Generated color must be #RRGGBB');
  return [1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255);
};

/** Only generated Web paint can supply color until original material decoding. */
export function createGeneratedMaterial({id,color,alpha=1}={}){
  if(typeof id!=='string'||!id.trim()) throw new TypeError('Material id required');
  finite(alpha,'alpha');
  if(alpha<0||alpha>1) throw new RangeError('alpha outside [0,1]');
  return Object.freeze({
    id,provenance:'generated-web',status:'draw-ready',
    rgba:Object.freeze([...rgb(color),alpha]),
    materialReference:null,serializedRenderer:null,lightmap:null,
    shader:null,textures:null,
  });
}

/** Read-only serialized MeshRenderer material slot: external reference unresolved. */
export function createSerializedMaterialSlot({
  id,owner,rendererPathId,materialReference,slot=0,
  rendererEnabled,receiveShadows,castShadows,
  lightmapIndex=null,lightmapTilingOffset=null,evidence,
}={}){
  if(typeof id!=='string'||!id.trim()) throw new TypeError('Material id required');
  if(typeof owner!=='string'||!owner.trim()) throw new TypeError('Serialized owner required');
  int(rendererPathId,'rendererPathId',1); int(slot,'slot');
  if(!materialReference||typeof materialReference!=='object') throw new TypeError('materialReference required');
  const fileId=int(materialReference.fileId,'materialReference.fileId');
  const pathId=int(materialReference.pathId,'materialReference.pathId');
  if(typeof evidence!=='string'||!evidence.trim()) throw new TypeError('Private evidence locator required');
  if((lightmapIndex===null)!==(lightmapTilingOffset===null)){
    throw new TypeError('Lightmap index and tiling offset must be provided together');
  }
  const lightmap=lightmapIndex===null?null:Object.freeze({
    index:int(lightmapIndex,'lightmapIndex'),
    tilingOffset:vec(lightmapTilingOffset,4,'lightmapTilingOffset'),
    textureResolved:false,
  });
  return Object.freeze({
    id,provenance:'unity-serialized',status:'material-reference-unresolved',
    rgba:null,shader:null,textures:null,
    materialReference:Object.freeze({fileId,pathId}),
    lightmap,
    serializedRenderer:Object.freeze({
      owner,rendererPathId,slot,
      enabled:flag(rendererEnabled,'rendererEnabled'),
      receiveShadows:flag(receiveShadows,'receiveShadows'),
      castShadowsMode:int(castShadows,'castShadows'), // Unity enum, not boolean
      evidence,
    }),
  });
}

/** Fail closed: unresolved native slot needs an EXPLICIT generated substitute. */
export function materialDrawPacket(material,{fallback=null}={}){
  if(!material||typeof material!=='object') throw new TypeError('Material packet required');
  if(material.provenance==='generated-web'&&material.status==='draw-ready'){
    return Object.freeze({
      color:material.rgba,colorEncoding:'srgb',materialId:material.id,
      colorProvenance:'generated-web',fallbackUsed:false,
      serializedRenderer:null,lightmap:null,lightmapSamplingEnabled:false,
    });
  }
  if(material.provenance!=='unity-serialized'||material.status!=='material-reference-unresolved'){
    throw new TypeError('Unrecognized material state');
  }
  if(!fallback) throw new Error('Unresolved MCD material '+material.id+': explicit generated fallback required');
  if(fallback.provenance!=='generated-web'||fallback.status!=='draw-ready'){
    throw new TypeError('Fallback must be an explicitly generated Web material');
  }
  return Object.freeze({
    color:fallback.rgba,colorEncoding:'srgb',materialId:material.id,
    colorProvenance:'generated-fallback-not-mcd',fallbackUsed:true,
    serializedRenderer:material.serializedRenderer,lightmap:material.lightmap,
    lightmapSamplingEnabled:false, // UV2 ST/index alone cannot provide baked texels.
  });
}

/** Transform UV2 into atlas coordinates; cannot reconstruct a lightmap image. */
export function transformLightmapUV(uv2,lightmap){
  const [u,v]=vec(uv2,2,'uv2');
  if(!lightmap||!Array.isArray(lightmap.tilingOffset)) throw new TypeError('Lightmap metadata required');
  const [sx,sy,ox,oy]=lightmap.tilingOffset;
  return Object.freeze([finite(u*sx+ox,'lightmap U'),finite(v*sy+oy,'lightmap V')]);
}
