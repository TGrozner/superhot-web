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
  lightmapIndex=null,lightmapTilingOffset=null,evidence,resolvedAsset=null,
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
  const materialAsset=resolvedAsset===null?null:(()=>{
    if(typeof resolvedAsset.owner!=='string'||!resolvedAsset.owner.trim()||
       typeof resolvedAsset.name!=='string'||!resolvedAsset.name.trim()||
       typeof resolvedAsset.evidence!=='string'||!resolvedAsset.evidence.trim()){
      throw new TypeError('Resolved material requires exact owner, name and evidence');
    }
    const targetPathId=int(resolvedAsset.pathId,'resolvedAsset.pathId',1);
    if(targetPathId!==pathId) throw new RangeError('Resolved material pathId differs from source renderer pointer');
    return Object.freeze({
      owner:resolvedAsset.owner,pathId:targetPathId,
      name:resolvedAsset.name,evidence:resolvedAsset.evidence,
      qualification:'owner-qualified-pointers-result',renderPayloadResolved:false,
    });
  })();
  const lightmap=lightmapIndex===null?null:Object.freeze({
    index:int(lightmapIndex,'lightmapIndex'),
    tilingOffset:vec(lightmapTilingOffset,4,'lightmapTilingOffset'),
    textureResolved:false,
  });
  return Object.freeze({
    id,provenance:'unity-serialized',
    status:materialAsset?'material-identity-resolved-payload-unavailable':'material-reference-unresolved',
    rgba:null,shader:null,textures:null,materialAsset,
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
  if(material.provenance!=='unity-serialized'||
     !['material-reference-unresolved','material-identity-resolved-payload-unavailable'].includes(material.status)){
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
    materialAsset:material.materialAsset??null,
    lightmapSamplingEnabled:false, // Source metadata does not provide shader, UV2 or baked texels.
  });
}

/** Transform UV2 into atlas coordinates; cannot reconstruct a lightmap image. */
export function transformLightmapUV(uv2,lightmap){
  const [u,v]=vec(uv2,2,'uv2');
  if(!lightmap||!Array.isArray(lightmap.tilingOffset)) throw new TypeError('Lightmap metadata required');
  const [sx,sy,ox,oy]=lightmap.tilingOffset;
  return Object.freeze([finite(u*sx+ox,'lightmap U'),finite(v*sy+oy,'lightmap V')]);
}


/**
 * Exact, owner-qualified material/texture/shader metadata from two PRIVATE
 * bounded corpus queries. These are Unity serialized records, NOT a pixel
 * shader, texture pixels or a material that can be drawn without fallback.
 *
 * #75 artifact 13137203925 maps all six level28 renderer material pointers
 * (fileID5:pathID3) -> resources.assets:3. #85 artifact 13140636598
 * inspects resources.assets:3 and its outgoing pointer joins, including
 * shader globalgamemanagers.assets:25, Texture2D resources.assets:248, and
 * level28:18622 lightmap (fileID9:pathID2) -> sharedassets28.assets:2.
 * Names, serialized uniforms, and pointers are metadata, not copied assets.
 */
const CONTAINERS_CONCRETE_SOURCE=Object.freeze({
  material:Object.freeze({
    owner:'resources.assets',pathId:3,
    name:'CONCRETE MAIN 0.2 doublebeton porowaty 0.2',
    evidence:'private research #75 artifact 13137203925, #85 artifact 13140636598',
  }),
  shader:Object.freeze({
    owner:'globalgamemanagers.assets',pathId:25,
    name:'XULM FULLFORWARD/Concrete 2019 MAIN',
    serializedKeyword:'_STRIPESONOFF_ON',
    nativeShaderProgramDecoded:false,
  }),
  mainTexture:Object.freeze({
    property:'_MainTex',owner:'resources.assets',pathId:248,
    name:'doublebeton_diffuse-barcodezacieki',
    uvChannel:'uv0',uvScale:Object.freeze([0.10000000149011612,0.10000000149011612]),
    uvOffset:Object.freeze([0,0]),imagePixelsDecoded:false,
    imageEncodingKnown:false,
  }),
  lightmapTexture:Object.freeze({
    sourceSceneOwner:'level28',sourceSettingsPathId:18622,
    slotIndex:0,sourceFileId:9,sourcePathId:2,
    targetOwner:'sharedassets28.assets',targetPathId:2,
    name:'Lightmap-0_comp_light',
    imagePixelsDecoded:false,uv2StreamDecoded:false,
  }),
  shaderProperties:Object.freeze({
    // Do not translate these into Web uniforms before the shipped custom
    // shader's stage logic and texture sampling/color-space are recovered.
    _Color:Object.freeze([1,1,1,1]),
    _HighlightColor:Object.freeze([0.15916955471038818,0.3011871874332428,0.3382353186607361,0]),
    _ShadowColor:Object.freeze([0.06617646664381027,0.11257605254650116,0.1764705777168274,0]),
    _LocalAmbient:Object.freeze([0.20000000298023224,0.20000000298023224,0.20000000298023224,1]),
    _TINT:Object.freeze([1,0.8068963885307312,0,1]),
    _Alpha:0.25,_DIFFUSE:0.5,_Emmisive:0.5,
    _RAMP_POWER:0.7200000286102295,
    _RAMP_SIZE:4.159999847412109,
    _StripesOnOff:1,
    _SPEC_INTENSITY:0,
  }),
  unityMetadata:Object.freeze({
    lightmapFlags:5,enableInstancingVariants:true,
    doubleSidedGI:false,customRenderQueue:-1,
  }),
  status:'serialized-shader-and-texture-references-resolved-payload-unavailable',
  runtimeDrawMatched:false,webShadingReady:false,
});

export function containersBuild28ConcreteMaterialSource(){
  return CONTAINERS_CONCRETE_SOURCE;
}

/**
 * P0 Containers/build28 exact serialized bindings for all six source
 * renderers, including the two meshes currently
 * selectable through the local-only OBJ browser preview. These are reference
 * and atlas-placement records, NOT decoded game colors, textures or shaders.
 *
 * Primary private evidence: #32 / 13134550402 (both MeshRenderer records),
 * #41 / 13134492119 (LightmapSettings index 0), and
 * #68 / 13136407658 (MeshRenderer -> static submesh).
 * Source is Unity 2018.4.14f1 serialized level28, NOT runtime frame state.
 */
const CONTAINERS_BUILD28_CARGO_BINDINGS = Object.freeze([
  Object.freeze({
    gameObjectPathId:336,rendererPathId:7837,
    meshPathId:6,staticSubmesh:47,indexCount:4638,
    lightmapST:Object.freeze([
      0.15870319306850433,0.15870319306850433,
      0.7985754013061523,-0.00025011622346937656,
    ]),
  }),
  Object.freeze({
    gameObjectPathId:459,rendererPathId:7940,
    meshPathId:7,staticSubmesh:48,indexCount:4638,
    lightmapST:Object.freeze([
      0.15870319306850433,0.15870319306850433,
      -0.00025011622346937656,0.6481873989105225,
    ]),
  }),
  Object.freeze({
    gameObjectPathId:461,rendererPathId:7941,
    meshPathId:7,staticSubmesh:46,indexCount:4638,lightmapST:null,
  }),
  Object.freeze({
    gameObjectPathId:673,rendererPathId:8123,
    meshPathId:7,staticSubmesh:77,indexCount:4638,lightmapST:null,
  }),
  Object.freeze({
    gameObjectPathId:839,rendererPathId:8272,
    meshPathId:6,staticSubmesh:24,indexCount:4638,lightmapST:null,
  }),
  Object.freeze({
    gameObjectPathId:1003,rendererPathId:8417,
    meshPathId:6,staticSubmesh:32,indexCount:4638,lightmapST:null,
  }),
]);

/**
 * Returns a source-addressable join key and exact serialized UV2 atlas ST
 * for ONE of the six source-bound cargo MeshRenderers (the first two also have verified UV2 atlas ST).
 *
 * The Web OBJ adapter currently exposes uv0, not the native baked UV2 data.
 * The atlas ref (level28 LightmapSettings index 0 -> fileID9:pathID2) does
 * not contain/authorize decoded texels; sampling remains explicitly disabled.
 * No guessed material owner or texture payload is manufactured.
 */
export function containersBuild28CargoMaterialBinding(rendererPathId) {
  int(rendererPathId,'rendererPathId',1);
  const row=CONTAINERS_BUILD28_CARGO_BINDINGS.find(
    entry=>entry.rendererPathId===rendererPathId,
  );
  if(!row) throw new RangeError('No proved Containers/build28 cargo material binding for renderer '+rendererPathId);
  const material=createSerializedMaterialSlot({
    id:'level28:MeshRenderer:'+row.rendererPathId+':material0',
    owner:'level28',rendererPathId:row.rendererPathId,slot:0,
    materialReference:{fileId:5,pathId:3},
    rendererEnabled:true,receiveShadows:true,castShadows:1,
    lightmapIndex:row.lightmapST?0:null,
    lightmapTilingOffset:row.lightmapST?[...row.lightmapST]:null,
    resolvedAsset:CONTAINERS_CONCRETE_SOURCE.material,
    evidence:'private #32 13134550402, #41 13134492119, #68 13136407658, #75 13137203925, #85 13140636598',
  });
  return Object.freeze({
    scene:'Containers/build28',sourceOwner:'level28',
    gameObjectPathId:row.gameObjectPathId,
    rendererPathId:row.rendererPathId,
    geometry:Object.freeze({
      owner:'level28',meshPathId:row.meshPathId,
      staticSubmesh:row.staticSubmesh,
      indexCount:row.indexCount,triangleCount:row.indexCount/3,
    }),
    material,
    nativeMaterialOwner:'resources.assets',
    nativeMaterialMetadata:CONTAINERS_CONCRETE_SOURCE,
    bakedLightmap:row.lightmapST?Object.freeze({
      index:0,sceneSettingsPathId:18622,
      atlasReference:Object.freeze({fileId:9,pathId:2}),
      target:Object.freeze({owner:'sharedassets28.assets',pathId:2,name:'Lightmap-0_comp_light'}),
      atlasTextureResolved:false,
      webObjUv2Ready:false,
      samplingAuthorized:false,
      provenance:'unity-serialized-reference-only',
    }):null,
  });
}


/**
 * P0 source-qualified RED CRYSTAL ENEMY, unrelated to Concrete cargo material.
 *
 * Native metadata was inspected inside PRIVATE Actions result.json:
 * #93 artifact 13139554254: renderers 4748/4749 -> meshes 284/285,
 * material (0,13), 60/59 bones, enabled, lightmap index 65535.
 * #95 artifact 13141157351: serialized Material13, authored shader inputs.
 * #98 artifact 13141163607: shader owner qualified to globalgamemanagers:28.
 * #88/#90: independently checked OBJ triangles/positions (private bytes).
 *
 * No Unity shader pass, final fragments, animated pose or runtime instance
 * was observed. The color below is a *DIAGNOSTIC WEB INPUT*, not final MCD RGB.
 */
const ENEMY_RED_CRYSTAL_SOURCE=Object.freeze({
  material:Object.freeze({
    owner:'sharedassets0.assets',pathId:13,
    name:'MAIN RedCrystalNuEnemyMaterial',
    rendererReference:Object.freeze({fileId:0,pathId:13}),
    serializedTextureEnvironmentCount:0,
  }),
  shader:Object.freeze({
    owner:'globalgamemanagers.assets',pathId:28,
    name:'XULM FULLFORWARD/Red Crystal',
    materialReference:Object.freeze({fileId:1,pathId:28}),
    serializedKeyword:'_ALLOWLOCALFOG_ON',
    actualPassAndVariantVerified:false,
  }),
  shaderInputs:Object.freeze({
    _Color:Object.freeze([0.720588207244873,0,0,1]),
    _EmissionColor:Object.freeze([0.5220588445663452,0,0,1]),
    _FogColor:Object.freeze([0.6838235259056091,0,0,1]),
    _Alpha:0,
    _IsEnemy:1,
    _AllowLocalFog:1,
    _FogDistance:5,
    _FogLength:7,
  }),
  sourceEvidence:'private research #93/13139554254, #95/13141157351, #98/13141163607',
  status:'unity-serialized-owner-qualified-params-no-render-pass',
  webShadingReady:false,
  runtimeNativePixelsVerified:false,
  nativeTexturePixelsAvailable:false,
  nativeSurfaceAlphaKnown:false,
  nativeLocalFogPixelsKnown:false,
});

const ENEMY_RED_CRYSTAL_RENDERERS=Object.freeze([
  Object.freeze({
    rendererPathId:4748,meshPathId:284,meshName:'EnemyMerged',
    objGroup:'EnemyMerged_0',sourceVertexCount:5237,
    sourceTriangleCount:2254,rootBonePathId:2257,boneCount:60,
  }),
  Object.freeze({
    rendererPathId:4749,meshPathId:285,meshName:'EnemyMergedHeadless',
    objGroup:'EnemyMergedHeadless_0',sourceVertexCount:4895,
    sourceTriangleCount:2132,rootBonePathId:2257,boneCount:59,
  }),
]);

/**
 * Resolves an exact enemy SkinnedMeshRenderer -> native material owner, while
 * retaining static-only OBJ and missing skinning/lightmap/pass limitations.
 */
export function enemyRedCrystalMaterialBinding(rendererPathId) {
  int(rendererPathId,'rendererPathId',1);
  const r=ENEMY_RED_CRYSTAL_RENDERERS.find(x=>x.rendererPathId===rendererPathId);
  if(!r) throw new RangeError('No proved EnemyMerged material binding for renderer '+rendererPathId);
  return Object.freeze({
    sourceOwner:'sharedassets0.assets',rendererPathId,rendererEnabled:true,
    mesh:Object.freeze({
      owner:'sharedassets0.assets',pathId:r.meshPathId,name:r.meshName,
      objGroup:r.objGroup,sourceVertexCount:r.sourceVertexCount,
      sourceTriangleCount:r.sourceTriangleCount,
      staticObjOnly:true,skinWeightsAvailable:false,poseProven:false,
    }),
    materialSlot:0,materialSource:ENEMY_RED_CRYSTAL_SOURCE,
    lightmapIndexSerialized:65535,lightmapSamplingEnabled:false,
    rootBonePathId:r.rootBonePathId,boneCount:r.boneCount,
    castShadowsSerialized:true,receiveShadowsSerialized:true,
    runtimeScenePresenceVerified:false,
  });
}

/**
 * Deliberately show a visible source-derived RED diagnostic when SH-05 draws
 * a privately selected static EnemyMerged OBJ. This forwards raw authored
 * _Color RGB to the CURRENT WEB shader as if normalized display sRGB.
 * That transfer function, emission, shading, and Unity color management are
 * not proven. In particular, material _Alpha=0 must NOT hide this geometry.
 *
 * Do NOT use this packet for the concrete cargos, source-pixel comparisons,
 * actual XULM shader emulation, or a native-fidelity assertion.
 */
export function enemyRedCrystalDiagnosticWebPacket(rendererPathId) {
  const binding=enemyRedCrystalMaterialBinding(rendererPathId);
  const nativeParameter=binding.materialSource.shaderInputs._Color;
  const color=Object.freeze([nativeParameter[0],nativeParameter[1],nativeParameter[2],1]);
  const colorHex='#'+color.slice(0,3)
    .map(x=>Math.round(Math.max(0,Math.min(1,x))*255).toString(16).padStart(2,'0'))
    .join('');
  return Object.freeze({
    rendererPathId,mesh:binding.mesh,color,colorHex,
    colorEncoding:'display-srgb-diagnostic-assumption',
    colorProvenance:'native-serialized-color-parameter-web-diagnostic-NOT-MCD-fragments',
    fallbackUsed:true,
    sourceMaterial:binding.materialSource.material,
    sourceShader:binding.materialSource.shader,
    sourceLightmapIndex:65535,lightmapSamplingEnabled:false,
    shaderPassVerified:false,nativeRenderedColorKnown:false,
    localFogProvenance:'_ALLOWLOCALFOG_ON-serialized-shader-branch-unverified',
    webAlphaOverride:'opaque-diagnostic-only-not-_Alpha-mapping',
  });
}
