/**
 * SH-04 handoff, reused by SH-05 for LOCAL, user-selected OBJ6 preview.
 * Unity 2018.4.14f1; serialized level28 SHA256:
 * e0dae9e43ce59ff8f53e157bae277c382602efdf8b34386cacf8c34995b2db91
 * Private evidence: research #68 / artifact 13136407658 (renderer joins),
 * #63 / artifact 13135277646 (converted mesh6 OBJ).
 *
 * Reuses OBJ group 47 for three nearly congruent, world-batched submeshes.
 * This is an approximation from source-converted geometry, NOT native runtime
 * or pixel parity. No original vertices, faces or assets are distributed.
 */
export const LOCAL_MESH6_GROUP47_TARGETS = Object.freeze([
  Object.freeze({
    id: 'cargo-22', gameObjectId: 336, rendererPathId: 7837,
    meshPathId: 6, nativeSubmesh: 47, sourceGroup: 47,
    webCenter: Object.freeze([17.45, 2.575, 13.975]),
    generatedProxyId: 'cargo-22',
  }),
  Object.freeze({
    id: 'cargo-7', gameObjectId: 839, rendererPathId: 8272,
    meshPathId: 6, nativeSubmesh: 24, sourceGroup: 47,
    webCenter: Object.freeze([10.1, 2.575, 18.475]),
    generatedProxyId: 'cargo-7',
  }),
  Object.freeze({
    id: 'go1003', gameObjectId: 1003, rendererPathId: 8417,
    meshPathId: 6, nativeSubmesh: 32, sourceGroup: 47,
    webCenter: Object.freeze([16.05, 2.525, -11.225]),
    generatedProxyId: null,
  }),
]);

export const LOCAL_MESH6_PROVENANCE = Object.freeze({
  owner: 'level28', unityVersion: '2018.4.14f1',
  sceneSha256: 'e0dae9e43ce59ff8f53e157bae277c382602efdf8b34386cacf8c34995b2db91',
  mesh6ConvertedGzipSha256: 'ff59d8e1548448926a6431d27578310f3a68f6e35d272cbe63576a1df8034941',
  sourceGroup: 47, sourceTriangles: 1546, sourceReferencedPositions: 2402,
  serializedMaterial: Object.freeze({ fileId: 5, pathId: 3, resolved: false }),
  maxObservedCenteredPositionDelta: 2.01e-6,
  runtimeObserved: false, publicGeometryIncluded: false,
});

const translation4 = ([x, y, z]) => [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  x, y, z, 1,
];

/** One existing local GPU upload, three affine draw packets. */
export function planLocalMesh6Draws({ group47Loaded = false } = {}) {
  if (typeof group47Loaded !== 'boolean') throw new TypeError('group47Loaded must be boolean');
  if (!group47Loaded) return {
    drawPackets: [], omitGeneratedProxyIds: [], expectedTriangles: 0,
    sourceGroup: LOCAL_MESH6_PROVENANCE.sourceGroup,
  };
  const sourceCenter = LOCAL_MESH6_GROUP47_TARGETS[0].webCenter;
  const drawPackets = LOCAL_MESH6_GROUP47_TARGETS.map((item) => ({
    id: item.id, gameObjectId: item.gameObjectId,
    rendererPathId: item.rendererPathId, nativeSubmesh: item.nativeSubmesh,
    gpuSlot: 'mesh6', sourceGroup: item.sourceGroup,
    modelMatrix: translation4(item.webCenter.map((value, i) => value - sourceCenter[i])),
    generatedPreviewMaterialOnly: true,
    nativeMaterialResolved: false,
  }));
  return {
    drawPackets,
    omitGeneratedProxyIds: LOCAL_MESH6_GROUP47_TARGETS
      .map((item) => item.generatedProxyId).filter(Boolean),
    expectedTriangles: LOCAL_MESH6_PROVENANCE.sourceTriangles * drawPackets.length,
    sourceGroup: LOCAL_MESH6_PROVENANCE.sourceGroup,
  };
}
