/**
 * SH-04: source-qualified (NOT runtime-observed) Containers/build28 Mesh7
 * local-file rendering contract. No mesh vertices/faces/texture data here.
 *
 * PRIVATE evidence:
 * - research #68 / artifact 13136407658: owner-qualified GO -> renderer ->
 *   Mesh7 static-batch submesh, enabled state, 4638 indices and Unity AABB.
 * - research #60 / artifact 13134799393: existing UnityPy OBJ7 export.
 * - research #103 / artifact 13142756457: ENTIRE converted OBJ7 gzip read
 *   privately; each group 46/48/77 has 1546 faces, 2402 referenced positions.
 * Unity: 2018.4.14f1; level28 source SHA256:
 * e0dae9e43ce59ff8f53e157bae277c382602efdf8b34386cacf8c34995b2db91.
 *
 * UnityPy already mirrors OBJ X. The established Web Containers preview maps
 * OBJ (-x,y,-z), preserving OBJ winding after TWO axis reflections. This is
 * a verified STATIC source-converted preview, not an MCD rendering/pose claim.
 */

const ROOT = 'Combined Mesh (root: scene)_';
const freeze3 = (numbers) => Object.freeze(numbers);
const freezeBounds = (min, max) => Object.freeze({
  min: freeze3(min), max: freeze3(max),
});
const IDENTITY4 = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

export const LOCAL_MESH7_PROVENANCE = Object.freeze({
  owner: 'level28',
  meshPathId: 7,
  unityVersion: '2018.4.14f1',
  level28Sha256: 'e0dae9e43ce59ff8f53e157bae277c382602efdf8b34386cacf8c34995b2db91',
  convertedObjGzipSha256: '59166c0c21221654fc996624ba9085caa4d64b4af0187a13749c68007699d116',
  convertedObjUncompressedSha256: '392ff2a66b6d01e31d239701cc464eaf2e2ea680fbc1d13cf42476dc461f0f51',
  serializedMeshSha256: 'fab39bcea528f5441897fe15b27a16f614c125b26300ac1a557f26a530fb95a9',
  sourceConversion: 'UnityPy mirrored X; Web preview mirrors OBJ X and Z',
  runtimeObserved: false,
  publicGeometryIncluded: false,
  pixelParityProven: false,
});

/**
 * Web-space bounding boxes are Unity serialized submesh AABBs from #68
 * converted (x,y,-z), NOT independently measured GPU pixels.
 * 2402 position refs per group were verified from private full OBJ7 #103.
 * These three groups are distinct; do not re-use g48 via translation/rotation
 * unless UV/normal/face equivalence is separately established.
 */
export const LOCAL_MESH7_GROUPS = Object.freeze([
  Object.freeze({
    id: 'cargo-upper', goPathId: 459, rendererPathId: 7940,
    meshPathId: 7, nativeSubmesh: 48, groupName: ROOT + '48',
    generatedProxyId: 'cargo-upper',
    center: freeze3([17.474998474121094, 5.72499942779541, 15.800012588500977]),
    bounds: freezeBounds(
      [13.369994163513184, 4.126049995422363, 14.300000667572022],
      [21.580002784729004, 7.323948860168457, 17.300024509429932]
    ),
    expectedTriangles: 1546, expectedPositionRefs: 2402,
  }),
  Object.freeze({
    id: 'cargo-86', goPathId: 461, rendererPathId: 7941,
    meshPathId: 7, nativeSubmesh: 46, groupName: ROOT + '46',
    generatedProxyId: 'cargo-86',
    center: freeze3([4.575000762939453, 2.5749993324279785, 15.900012969970703]),
    bounds: freezeBounds(
      [0.469996452331543, 0.9760499000549316, 14.400001049041748],
      [8.680005073547363, 4.173948764801025, 17.400024890899658]
    ),
    expectedTriangles: 1546, expectedPositionRefs: 2402,
  }),
  Object.freeze({
    id: 'cargo-21', goPathId: 673, rendererPathId: 8123,
    meshPathId: 7, nativeSubmesh: 77, groupName: ROOT + '77',
    generatedProxyId: 'cargo-21',
    center: freeze3([14.5, 2.5749990940093994, 16.82499885559082]),
    bounds: freezeBounds(
      [13, 0.9760499000549316, 12.719999313354492],
      [16, 4.173948287963867, 20.92999839782715]
    ),
    expectedTriangles: 1546, expectedPositionRefs: 2402,
  }),
]);

/**
 * Use with SH-12's parseObjGroupsIntoIndexedMesh(sourceText, selectors, opts).
 * Only SH-05 may read a user-selected browser File and upload to GPU.
 * Native serialized AABB tolerance accounts for OBJ decimal/float rounding.
 */
export function localMesh7ObjParseRequest() {
  return {
    selectors: LOCAL_MESH7_GROUPS.map(group => group.groupName),
    options: {
      axisSigns: [-1, 1, -1],
      winding: 'keep',
      expectedGroups: Object.fromEntries(LOCAL_MESH7_GROUPS.map(group => [
        group.groupName,
        {
          expectedTriangles: group.expectedTriangles,
          expectedPositionRefs: group.expectedPositionRefs,
          expectedBounds: {
            min: [...group.bounds.min],
            max: [...group.bounds.max],
            tolerance: 0.0001,
          },
        },
      ])),
    },
  };
}

/**
 * Input drawRanges is the VERIFIED parser result (not a list guessed from
 * a filename). Ranges are for one GPU mesh built from groups 48/46/77.
 * No proxy is hidden here; SH-05 must hide each candidate ONLY after its
 * matching gl.drawElements succeeds and must preserve other proxies.
 */
export function planLocalMesh7Draws({ drawRanges = [] } = {}) {
  if (!Array.isArray(drawRanges)) throw new TypeError('drawRanges must be an array');
  const valid = new Map(LOCAL_MESH7_GROUPS.map(group => [group.groupName, group]));
  const selected = new Map();
  for (const range of drawRanges) {
    if (!range || !valid.has(range.groupName) ||
        !Number.isSafeInteger(range.firstIndex) || range.firstIndex < 0 ||
        !Number.isSafeInteger(range.indexCount) || range.indexCount !== 4638 ||
        selected.has(range.groupName)) {
      throw new RangeError('Unverified, duplicate or malformed Mesh7 group draw range');
    }
    selected.set(range.groupName, range);
  }
  const drawPackets = LOCAL_MESH7_GROUPS.filter(g => selected.has(g.groupName)).map(g => ({
    id: g.id, goPathId: g.goPathId, rendererPathId: g.rendererPathId,
    meshPathId: 7, nativeSubmesh: g.nativeSubmesh,
    groupName: g.groupName, gpuSlot: 'mesh7',
    drawRange: {
      firstIndex: selected.get(g.groupName).firstIndex,
      indexCount: selected.get(g.groupName).indexCount,
    },
    modelMatrix: [...IDENTITY4], // converted OBJ already world-batched
    generatedPreviewMaterialOnly: true,
    nativeMaterialShaderRuntimeProven: false,
    generatedProxyCandidate: g.generatedProxyId,
  }));
  return {
    drawPackets,
    // Candidates, NOT automatic deletion: commit only on successful GPU draw.
    omitGeneratedProxyCandidates: drawPackets.map(packet => packet.generatedProxyCandidate),
    expectedTriangles: drawPackets.length * 1546,
  };
}
