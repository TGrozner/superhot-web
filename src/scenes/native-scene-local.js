import { defineIndexedMesh, meshModelMatrices } from '../render/mesh-format.js';
import { multiplyMatrices } from './graph.js';

const IDENTITY = Object.freeze([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]);

const COORDINATES = Object.freeze({
  geometry: 'right-handed browser geometry; finalized UnityPy OBJ mirrors source Unity X',
  matrices: 'flat column-major arrays, column vectors, Float32Array-compatible',
  browserFromUnity: 'browserWorld = H * sourceUnityWorld * H, H=diag(-1,1,1,1)',
});

function sourceArray(value, label) {
  if (!Array.isArray(value) && !(ArrayBuffer.isView(value) && !(value instanceof DataView))) {
    throw new TypeError(label + ' must be a numeric array');
  }
  return value;
}

function sourceList(value, label) {
  if (!Array.isArray(value)) throw new TypeError(label + ' must be an array');
  return value;
}

function sourceId(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new TypeError(label + ' must be a bounded identifier');
  }
  return value;
}

function uniqueMap(values, label) {
  const result = new Map();
  for (const value of sourceList(values, label)) {
    const id = sourceId(value?.id, label + ' id');
    if (result.has(id)) throw new Error('Duplicate ' + label + ' id: ' + id);
    result.set(id, value);
  }
  return result;
}

function prepareMesh(source) {
  const id = sourceId(source?.id, 'mesh id');
  const positions = sourceArray(source.positions, id + ' positions');
  const normals = sourceArray(source.normals, id + ' normals');
  const uvs = sourceArray(source.uv0, id + ' uv0');
  const uv2s = sourceArray(source.uv2 ?? [], id + ' uv2');
  const indices = sourceArray(source.indices, id + ' indices');
  const tangents = sourceArray(source.tangent0 ?? [], id + ' tangent0');
  if (positions.length % 3 !== 0) throw new RangeError(id + ' positions are not vec3');
  const vertexCount = positions.length / 3;
  const hasNormals = normals.length !== 0;
  const hasUV = uvs.length !== 0;
  const hasUV2 = uv2s.length !== 0;
  const hasTangents = tangents.length !== 0;
  if (hasNormals && normals.length !== positions.length) {
    throw new RangeError(id + ' normals do not match positions');
  }
  if (hasUV && uvs.length !== vertexCount * 2) {
    throw new RangeError(id + ' UVs do not match positions');
  }
  if (hasUV2 && uv2s.length !== vertexCount * 2) {
    throw new RangeError(id + ' UV2s do not match positions');
  }
  if (hasTangents && tangents.length !== vertexCount * 4) {
    throw new RangeError(id + ' TANGENT0s do not match positions');
  }
  const colors = sourceArray(source.color0, id + ' color0');
  const hasColors = colors.length !== 0;
  if (source.hasColors !== hasColors || (hasColors && colors.length !== vertexCount * 4)) {
    throw new RangeError(id + ' COLOR0 presence or RGBA count differs');
  }
  let color0 = null;
  if (hasColors) {
    color0 = new Float32Array(colors.length);
    for (let index = 0; index < colors.length; index++) {
      const value = colors[index];
      if (typeof value !== 'number' || !Number.isFinite(value) ||
          Math.abs(value) > 3.4028234663852886e38) {
        throw new RangeError(id + ' COLOR0 must fit finite float32');
      }
      color0[index] = value;
    }
  }
  let tangent0 = null;
  if (hasTangents) {
    tangent0 = new Float32Array(tangents.length);
    for (let index = 0; index < tangents.length; index++) {
      const value = tangents[index];
      if (typeof value !== 'number' || !Number.isFinite(value) ||
          Math.abs(value) > 3.4028234663852886e38) {
        throw new RangeError(id + ' TANGENT0 must fit finite float32');
      }
      tangent0[index] = value;
    }
  }
  const mesh = defineIndexedMesh({
    positions,
    normals: hasNormals ? normals : new Float32Array(positions.length),
    uvs: hasUV ? uvs : new Float32Array(vertexCount * 2),
    indices,
  });
  const ranges = new Map();
  for (const range of sourceList(source.submeshes, id + ' submeshes')) {
    const sourceIndex = range?.sourceIndex;
    const firstIndex = range?.start;
    const indexCount = range?.count;
    if (!Number.isSafeInteger(sourceIndex) || sourceIndex < 0 ||
        !Number.isSafeInteger(firstIndex) || firstIndex < 0 ||
        !Number.isSafeInteger(indexCount) || indexCount <= 0 || indexCount % 3 !== 0 ||
        firstIndex + indexCount > mesh.indexCount || ranges.has(sourceIndex)) {
      throw new RangeError(id + ' has an invalid source submesh range');
    }
    ranges.set(sourceIndex, Object.freeze({ firstIndex, indexCount }));
  }
  if (!ranges.size) throw new RangeError(id + ' has no submesh ranges');
  return Object.freeze({
    mesh,
    hasNormals,
    hasUV,
    hasUV2,
    hasColors,
    hasTangents,
    tangent0,
    color0,
    uv2: hasUV2 ? new Float32Array(uv2s) : null,
    ranges,
    source,
  });
}

function finiteVector(value, size, label) {
  const source = sourceArray(value, label);
  if (source.length !== size || source.some((component) =>
    typeof component !== 'number' || !Number.isFinite(component))) {
    throw new RangeError(label + ' must contain ' + size + ' finite numbers');
  }
  return Object.freeze(Array.from(source));
}

function prepareLightmaps(values, textures) {
  const byId = uniqueMap(values ?? [], 'lightmaps');
  const byIndex = new Map();
  for (const [id, source] of byId) {
    const index = source?.index;
    const textureId = sourceId(source?.textureId, id + ' textureId');
    const compressedAssetId = source.compressedAssetId == null ? null :
      sourceId(source.compressedAssetId, id + ' compressedAssetId');
    if (!Number.isSafeInteger(index) || index < 0 || byIndex.has(index)) {
      throw new RangeError(id + ' has an invalid or duplicate source index');
    }
    if (!textures.has(textureId)) throw new Error(id + ' references missing texture ' + textureId);
    if (source.uvChannel !== 1 || source.uvAttribute !== 'uv2' ||
        source.decode?.encoding !== 'unity-rgbm-gamma' ||
        source.decode?.multiplier !== 5 ||
        source.decode?.alphaExponent !== 1 ||
        source.decode?.concreteBakedContributionScale !== 0.2 ||
        source.sampler?.minification !== 'linear' ||
        source.sampler?.magnification !== 'linear' ||
        source.sampler?.wrapU !== 'clamp' || source.sampler?.wrapV !== 'clamp') {
      throw new TypeError(id + ' lightmap decode/sampler contract differs');
    }
    const prepared = Object.freeze({
      ...source,
      textureId,
      compressedAssetId,
      decode: Object.freeze({ ...source.decode }),
      sampler: Object.freeze({ ...source.sampler }),
    });
    byIndex.set(index, prepared);
    byId.set(id, prepared);
  }
  return Object.freeze({ byId, byIndex });
}

function prepareConcreteLighting(source, textures) {
  if (!source || source.schema !== 'containers-build28-concrete-main-forward-v1' ||
      source.sourceMaterial !== 'resources.assets::3' ||
      source.sourceShader !== 'globalgamemanagers.assets::25' ||
      source.variant !== 'FORWARDBASE DIRECTIONAL LIGHTMAP_ON') {
    throw new TypeError('Native scene Concrete lighting contract differs');
  }
  const textureIds = {};
  for (const key of ['microseamTextureId', 'poreTextureId', 'fogGradientTextureId']) {
    const id = sourceId(source.textures?.[key], 'Concrete lighting ' + key);
    if (!textures.has(id)) throw new Error('Concrete lighting references missing texture ' + id);
    textureIds[key] = id;
  }
  const globals = source.globals;
  const preparedGlobals = {
    lightLocalAmbient: finiteVector(globals?.lightLocalAmbient, 4, 'lightLocalAmbient'),
    lightLocalMinusAmbient: finiteVector(globals?.lightLocalMinusAmbient, 4, 'lightLocalMinusAmbient'),
    lightLocalAmbientMultiplier: globals?.lightLocalAmbientMultiplier,
    localDynamicConcreteAmbient:
      finiteVector(globals?.localDynamicConcreteAmbient, 4, 'localDynamicConcreteAmbient'),
    localAttenuationOutsideShadowDistance: globals?.localAttenuationOutsideShadowDistance,
    localShowFog: globals?.localShowFog,
    localFogColor: finiteVector(globals?.localFogColor, 4, 'localFogColor'),
    localFogScale: globals?.localFogScale,
    localFogPower: globals?.localFogPower,
    localShowGroundFog: globals?.localShowGroundFog,
    localGroundFogColor: finiteVector(globals?.localGroundFogColor, 4, 'localGroundFogColor'),
    localGroundFogZero: globals?.localGroundFogZero,
    localGroundFogScale: globals?.localGroundFogScale,
    localSecondaryFogDistance: globals?.localSecondaryFogDistance,
    worldSpaceLightDirection:
      finiteVector(globals?.worldSpaceLightDirection, 3, 'worldSpaceLightDirection'),
  };
  for (const [name, value] of Object.entries(preparedGlobals)) {
    if (!Array.isArray(value) && (typeof value !== 'number' || !Number.isFinite(value))) {
      throw new RangeError('Concrete lighting ' + name + ' must be finite');
    }
  }
  if (preparedGlobals.localFogScale <= 0 ||
      preparedGlobals.localShowFog !== 1 ||
      preparedGlobals.localShowGroundFog !== 0) {
    throw new RangeError('Concrete lighting fog contract differs');
  }
  return Object.freeze({
    ...source,
    textures: Object.freeze(textureIds),
    globals: Object.freeze(preparedGlobals),
  });
}

function prepareInstanceLightmap(source, id, lightmaps) {
  if (source == null) return null;
  if (typeof source !== 'object') throw new TypeError(id + ' lightmap must be an object or null');
  const index = source.index;
  if (!Number.isSafeInteger(index) || index < 0) throw new RangeError(id + ' lightmap index is invalid');
  const atlas = lightmaps.byIndex.get(index);
  if (!atlas) throw new Error(id + ' references missing lightmap index ' + index);
  const textureId = sourceId(source.textureId, id + ' lightmap textureId');
  if (textureId !== atlas.textureId || source.uvChannel !== atlas.uvChannel) {
    throw new Error(id + ' lightmap mapping differs from atlas');
  }
  return Object.freeze({
    index,
    textureId,
    uvChannel: source.uvChannel,
    tilingOffset: finiteVector(source.tilingOffset, 4, id + ' lightmap tilingOffset'),
    atlas,
    source,
  });
}

function prepareCamera(source) {
  const matrices = meshModelMatrices(source?.worldMatrix);
  return Object.freeze({
    ...source,
    worldMatrix: matrices.model,
  });
}

function attachmentMatrices(pistol) {
  const chain = sourceList(pistol?.attachmentChain, 'pistol attachmentChain');
  if (!chain.length) throw new RangeError('pistol attachmentChain is empty');
  let world = IDENTITY;
  for (const attachment of chain) {
    world = multiplyMatrices(world, attachment?.localMatrix);
  }
  return meshModelMatrices(world);
}

/**
 * Convert a caller-supplied private schema-1 native scene package into immutable
 * WebGL-ready mesh and transform packets. This module contains no source assets.
 */
export function prepareNativeScene(scenePackage) {
  if (!scenePackage || typeof scenePackage !== 'object' || scenePackage.schemaVersion !== 1) {
    throw new TypeError('Native scene package schemaVersion must be 1');
  }
  const coordinates = scenePackage.coordinateSpace;
  if (!coordinates || Object.entries(COORDINATES).some(([key, value]) => coordinates[key] !== value)) {
    throw new TypeError('Native scene package coordinate contract differs');
  }

  const sourceMeshes = uniqueMap(scenePackage.meshes, 'meshes');
  const meshes = new Map();
  for (const [id, source] of sourceMeshes) meshes.set(id, prepareMesh(source));
  const materialMap = uniqueMap(scenePackage.materials, 'materials');
  const textures = uniqueMap(scenePackage.textures, 'textures');
  const lightmaps = prepareLightmaps(scenePackage.lightmaps, textures);
  const concreteLighting = prepareConcreteLighting(scenePackage.concreteLighting, textures);
  const cameras = sourceList(scenePackage.cameras, 'cameras').map(prepareCamera);
  const activeCameras = cameras.filter((camera) => camera.initial?.enabledAndActive === true);
  if (activeCameras.length !== 1) {
    throw new RangeError('Native scene package must have exactly one initial active camera');
  }

  const instances = [];
  const instanceMap = new Map();
  for (const source of sourceList(scenePackage.instances, 'instances')) {
    const id = sourceId(source?.id, 'instance id');
    if (instanceMap.has(id)) throw new Error('Duplicate instance id: ' + id);
    if (source.renderClassification?.worldPassEligible !== true) continue;
    const meshId = sourceId(source.meshId, id + ' meshId');
    const preparedMesh = meshes.get(meshId);
    if (!preparedMesh) throw new Error(id + ' references missing mesh ' + meshId);
    const matrices = meshModelMatrices(source.worldMatrix);
    const lightmap = prepareInstanceLightmap(source.lightmap ?? null, id, lightmaps);
    const draws = sourceList(source.draws, id + ' draws').map((draw) => {
      const materialId = sourceId(draw?.materialId, id + ' materialId');
      if (!materialMap.has(materialId)) throw new Error(id + ' references missing material ' + materialId);
      const range = preparedMesh.ranges.get(draw?.sourceSubmesh);
      if (!range) throw new Error(id + ' references missing source submesh ' + draw?.sourceSubmesh);
      return Object.freeze({ meshId, range, materialId });
    });
    if (!draws.length) throw new RangeError(id + ' has no draws');
    const packet = Object.freeze({
      id,
      name: source.name,
      meshId,
      model: matrices.model,
      normal: matrices.normal,
      mirrored: matrices.mirrored,
      draws: Object.freeze(draws),
      lightmap,
      layer: source.layer,
      classification: source.renderClassification,
      source,
    });
    instances.push(packet);
    instanceMap.set(id, packet);
  }

  const pistolSource = scenePackage.pistol;
  const pistolInstanceId = sourceId(pistolSource?.instanceId, 'pistol instanceId');
  const pistolMeshId = sourceId(pistolSource?.meshId, 'pistol meshId');
  const pistolInstance = instanceMap.get(pistolInstanceId);
  const pistolMesh = meshes.get(pistolMeshId);
  if (!pistolInstance || !pistolMesh || pistolInstance.meshId !== pistolMeshId) {
    throw new Error('Pistol source instance/mesh is not in the prepared world pass');
  }
  const pistolMatrices = attachmentMatrices(pistolSource);
  const pistol = Object.freeze({
    source: pistolSource,
    instance: pistolInstance,
    mesh: pistolMesh,
    model: pistolMatrices.model,
    normal: pistolMatrices.normal,
    mirrored: pistolMatrices.mirrored,
  });

  return Object.freeze({
    meshes,
    instances: Object.freeze(instances),
    instanceMap,
    materialMap,
    textures,
    lightmaps: lightmaps.byId,
    lightmapByIndex: lightmaps.byIndex,
    concreteLighting,
    pistol,
    camera: activeCameras[0],
    cameras: Object.freeze(cameras),
    anchors: scenePackage.anchors,
    colliders: scenePackage.colliders,
    layers: scenePackage.layers,
    source: scenePackage.source,
    coordinateSpace: coordinates,
  });
}
