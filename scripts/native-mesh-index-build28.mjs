/** SH-11 sanitized metadata only. No Unity mesh/OBJ/vertex/index/shader assets.
 * Primary private provenance: superhot-research #32 #37 #42 #43 #45 #47 #48 #59.
 */
export const SOURCE = Object.freeze({
  owner: 'level28',
  unityVersion: '2018.4.14f1',
  sha256: 'e0dae9e43ce59ff8f53e157bae277c382602efdf8b34386cacf8c34995b2db91',
  runtimeObserved: false,
});

export const MESHES = Object.freeze([
  Object.freeze({ owner: 'level28', pathId: 6, vertices: 44030, submeshes: 61,
    stream: Object.freeze({ name: 'level28.resS', offset: 0, size: 1937320 }),
    objectSha256: 'a8317c01755a8bfaf28abdd10a1c34bd0418895d01b75de8b319ca227d5381e7',
    privateExport: 'converted_obj', publicDrawable: false }),
  Object.freeze({ owner: 'level28', pathId: 7, vertices: 60874, submeshes: 85,
    stream: Object.freeze({ name: 'level28.resS', offset: 1937320, size: 2921952 }),
    objectSha256: 'fab39bcea528f5441897fe15b27a16f614c125b26300ac1a557f26a530fb95a9',
    privateExport: 'converted_obj', publicDrawable: false }),
]);

const row = (gameObjectId, filterId, meshId, rendererId, submesh = null, measured = null) =>
  Object.freeze({ owner: 'level28', gameObjectId, filterId, meshId, rendererId,
    submesh, measured, activeSerialized: true,
    material: Object.freeze({ fileId: 5, pathId: 3, resolved: false }),
    publicDrawable: false });

/** Unknown submesh values are NULL intentionally, never inferred from adjacent ranges. */
export const BINDINGS = Object.freeze([
  row(336, 10570, 6, 7837, 47, Object.freeze({
    indexCount: 4638,
    center: Object.freeze([17.450000762939453, 2.5749990940093994, -13.975000381469727]),
    extents: Object.freeze([1.5, 1.5989491939544678, 4.105000019073486]),
  })),
  row(459, 10673, 7, 7940, 48, Object.freeze({
    indexCount: 4638,
    center: Object.freeze([17.474998474121094, 5.72499942779541, -15.800012588500977]),
    extents: Object.freeze([4.10500431060791, 1.5989494323730469, 1.500011920928955]),
  })),
  row(461, 10674, 7, 7941),
  row(673, 10856, 7, 8123),
  row(839, 11005, 6, 8272),
  row(1003, 11150, 6, 8417),
]);

/** Web mirror convention is a PROXY transform, not a runtime native camera proof. */
export const mirroredBounds = ({ center, extents }) => ({
  center: [center[0], center[1], -center[2]],
  size: extents.map((value) => value * 2),
});

export function reportMeshReadiness() {
  const byId = new Map(MESHES.map((mesh) => [mesh.pathId, mesh]));
  const rows = BINDINGS.map((binding) => {
    const mesh = byId.get(binding.meshId);
    if (!mesh || (binding.submesh !== null &&
      (!Number.isInteger(binding.submesh) || binding.submesh < 0 || binding.submesh >= mesh.submeshes))) {
      throw new Error('invalid source-mesh reference');
    }
    return {
      go: binding.gameObjectId, mesh: `level28:${binding.meshId}`,
      submeshKnown: binding.submesh !== null, boundsKnown: binding.measured !== null,
      privateObjAvailable: mesh.privateExport === 'converted_obj',
      publicDrawable: false,
    };
  });
  return { sourceSha256: SOURCE.sha256, rows, webMeshReady: false };
}
