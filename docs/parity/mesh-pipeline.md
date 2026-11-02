# SH-12 — Indexed WebGL2 mesh contract (source-neutral)

This module is an **independent transport/render primitive**, not a replica of any SUPERHOT: MIND CONTROL DELETE mesh. The sole built-in example is a procedurally generated capped cylinder. It does not include Unity/Steam data, original materials, textures or shaders, and is **not yet wired to the playable renderer**. SH-05 exclusively owns `src/main.js`, `src/renderer.js`, and `src/levels.js`.

## Source qualification and current blocker

SH-04's public handoff in [#4](https://github.com/TGrozner/superhot-web/issues/4) reports serialized `Containers/build28` GameObjects, TRS parent chains, MeshFilter/MeshRenderer slots and colliders based on bounded private index queries (#10, #16, #20, #27, #30, #32, #37, #39). **That is not an executed runtime mesh draw**, and does not reveal approved replacement mesh data, renderer shader or material color. Do not label this cylinder a `Containers` object. SH-11 [#75](https://github.com/TGrozner/superhot-web/issues/75) owns source->mesh/material resolution. SH-05's merged [#81](https://github.com/TGrozner/superhot-web/pull/81) already integrates an opt-in synthetic scene via affine *boxes*; this module adds the indexed *non-box* path, and does not duplicate #81's scene/normal-matrix work.

## CPU layout

```js
import { defineIndexedMesh, makeCylinderMesh, meshModelMatrices } from './src/render/mesh-format.js';
const generated = makeCylinderMesh({ radius: 0.5, height: 1, segments: 24 });
// Or defineIndexedMesh({ positions: xyzArray, normals: xyzArray, uvs: uvArray, indices: triangleIndices });
```

`defineIndexedMesh` validates lengths, finite float32-compatible components, integral in-range triangle indices, and produces `{ vertices: Float32Array, indices: Uint16Array | Uint32Array, vertexCount, indexCount, triangleCount, strideBytes: 32, bounds }`. Vertex is interleaved `position.xyz | normal.xyz | uv.xy` (32-byte stride). Index type is 16-bit for `<=65536` vertices, otherwise 32-bit. All geometry is **already in the Web scene's coordinate system**; scene coordinate conversion is a separate concern (`src/scenes/graph.js`). Matrices are column-major affine Web world transforms. Uniforms must always be set per draw.

## SH-05 exact hookup (integration owner only)

Inside `createRenderer`, after the existing shader/program is linked and while the WebGL2 context is valid:

```js
import { makeCylinderMesh, meshModelMatrices } from './render/mesh-format.js';
import { uploadIndexedMesh } from './render/gpu-mesh.js';
const cylinder = uploadIndexedMesh(gl, program, makeCylinderMesh({ segments: 24 }));

// Called after renderer.begin(camera). Color uniform still belongs to SH-05.
function affineMesh(worldMatrix, color, alpha = 1) {
  const { model, normal, mirrored } = meshModelMatrices(worldMatrix);
  gl.uniform1i(uniforms.uUseAffine, 1);
  gl.uniformMatrix4fv(uniforms.uAffineModel, false, model);
  gl.uniformMatrix3fv(uniforms.uAffineNormal, false, normal);
  // Reuse SH-05 color cache / uColor code from affineBox; no new material model here.
  // If gl.CULL_FACE becomes enabled, account for mirrored winding (mirrored === true).
  cylinder.draw(); // internally bindVertexArray() then gl.drawElements(TRIANGLES,...)
  drawCalls++; // matches existing browser scene telemetry contract
}
// On renderer shutdown/context cleanup: cylinder.dispose();
```

Actual SH-05 shader currently exposes `aPosition`, `aNormal`, `uAffineModel`, `uAffineNormal`, `uUseAffine` and `uColor` (verified against `src/renderer.js` on 2026-11-02). If its shader grows `aUV`, the uploader will bind that attribute at offset 24; otherwise UV data remains available in the VBO but no UV channel is consumed. For non-cylinder data, create/cache one GPU mesh per distinct geometry, then issue one indexed draw per instance. `uploadIndexedMesh` saves/restores previous VAO and ARRAY_BUFFER binding while uploading, owns its VBO/EBO/VAO and provides idempotent `dispose()`. It neither owns `gl.useProgram` nor changes blending/culling/depth/test/projection.

`meshModelMatrices` calculates the inverse-transpose 3×3 normal matrix (correct with rotation, nonuniform scale and shear), detects reflection via `mirrored`, and rejects singular/overflowed matrices. It uses the **supplied world matrix** directly: the author must not pre-scale geometry a second time. SH-05's own `normalMatrixFromAffine` already does the same for affine boxes; SH-05 can reuse that function if desired instead of calling the new helper.

## Local evidence and missing validation

- `node --test tests/render-mesh-*.test.mjs`: **7/7 passed locally** on Node 22.16.0. Tests check a 24-segment cylinder is curved and capped, winding is outward, separated normal/UV layout, uint16/uint32 boundaries, model normal orthogonality under shear/reflection, correct VAO offsets and indexed GPU calls in a mocked WebGL2 context.
- **Not performed:** real WebGL2 browser/GPU render, shader compile for a mesh-enabled runtime, photo comparison, draw-call/FPS/p95, source mesh assignment to `Containers/build28`, runtime observation of original MCD. Mock tests are only API evidence, not a visual acceptance gate.
- Next vertical-slice gate: SH-05 wires an opt-in **synthetic cylinder** first; obtains one browser screenshot and indexed draw-call telemetry; then swaps to a source-qualified generated replacement only after SH-04/SH-11 provide `owner,path_id -> approved geometry / material` plus matching scene transform. SH-15 compares native vs Web only with matched camera/reference observations.

Ownership: SH-12 files `src/render/mesh-format.js`, `src/render/gpu-mesh.js`, `tests/render-mesh-*.test.mjs`, this document. SH-13 owns `src/render/material-model.js` and `src/render/lighting-model.js`. SH-05 alone touches existing renderer/entrypoint/levels.


## 2026-11-02 P0: native stream payload boundary (SH-12 follow-up)

This section **supersedes the previous suggestion to create more cylinders**. Existing #87 is already merged. The new `decodeIndexedMeshPayload` is strictly a **source-neutral decoded buffer contract** for future source-qualified meshes, not a Unity .assets parser. It does not fabricate geometry, parse `m_CompressedMesh`, fetch proprietary files, or introduce an asset to the public repository.

### Evidence inspected, without copying private source bytes

Private `superhot-research` result.json files **actually inspected**, not inferred from green workflow status:

- [#42](https://github.com/TGrozner/superhot-research/issues/42), artifact `13134488644`: four `level28` cargo MeshFilters point to local mesh path IDs **6** and **7** (`m_FileID=0`). This proves serialized references, **not a runtime draw**.
- [#43](https://github.com/TGrozner/superhot-research/issues/43), artifact `13134688163`: Mesh 6 is named a combined-scene mesh with **44,030 declared vertices / 61 submeshes**, Mesh 7 with **60,874 declared vertices / 85 submeshes**. Both include declared vertex stream paths and index format 0. Those figures are **source metadata only**.
- [#45](https://github.com/TGrozner/superhot-research/issues/45), artifact `13135470613`: serialized index buffer fields are present, but `m_VertexData.m_Data` is not a resolved inline payload; **vertex data is referenced by an external stream**. The bounded SQL did not return decoded vertex or index bytes. Neither MCD triangles nor a shader/texture has been transported into the Web runtime.

The original `result.json`, binary buffers, `level28.resS`, source materials and captures stay **private**. SH-11 owns the next extraction/resolution and must qualify real bytes, exact Unity stream/channel offsets and source licensing before any visual matching claim. No additional corpus query was issued by SH-12.

### Required explicit descriptor, after PRIVATE source conversion

```js
import { decodeIndexedMeshPayload } from './render/mesh-format.js';
import { uploadIndexedMesh } from './render/gpu-mesh.js';

// All input bytes must be real, authorized, fully decoded and separately
// verified against the source. This is a CONTRACT, not a payload example:
const decoded = decodeIndexedMeshPayload({
  coordinateSpace: 'web-rh',
  byteOrder: 'little',
  compression: 'none',
  sourceWinding: 'ccw',  // or 'cw' AFTER Unity->Web axis conversion
  vertexCount: verifiedVertexCount,
  streams: [
    { bytes: verifiedVertexBuffer, strideBytes: verifiedStrideBytes, byteOffset: 0 },
    // multi-stream layouts accepted, each stream independently bounded
  ],
  attributes: {
    position: { stream: 0, offsetBytes: positionOffset, format: 'float32' },
    normal: { stream: 0, offsetBytes: normalOffset, format: 'snorm8' },
    uv0: { stream: 0, offsetBytes: uvOffset, format: 'float16' },
  },
  indexBufferBytes: verifiedIndexBytes,
  indexFormat: 'uint16', // or 'uint32', NOT Unity enum passed through blindly
  submeshes: verifiedSubmeshes.map((sub, materialSlot) => ({
    topology: 'triangles',  // explicit converted primitive type
    firstByte: sub.firstByte, indexCount: sub.indexCount,
    baseVertex: sub.baseVertex, firstVertex: sub.firstVertex,
    vertexCount: sub.vertexCount, materialSlot,
  })),
  worldMatrix: verifiedWebColumnMajorAffine4x4, // OPTIONAL; no auto Unity conversion
});
// decoded.mesh = canonical Float32 pos|normal|uv mesh, uint16/32 indices
// decoded.drawRanges = [{firstIndex,indexCount,materialSlot}] per source submesh
// decoded.world = { model, normal, mirrored } if worldMatrix supplied
```

The formats currently understood are `float32`, `float16`, `snorm8`, `unorm8`, `snorm16`, `unorm16` (all little endian). Attribute **component counts are fixed** (position.xyz, normal.xyz, uv0.xy), so exotic formats, missing channels, unknown compression, missing streams, non-triangle topology, out-of-range submeshes, illegal offsets or unproven coordinate conversion are hard failures. `sourceWinding='cw'` swaps the triangle indices once; model-matrix reflection remains a **separate GPU front-face decision**. No silent approximation or normal reconstruction.

Do **not** pass base64-encoded `tree_json`, external `m_StreamData.path`, compressed Unity blobs, a collider approximation, or a `MeshFilter` ID as `bytes`. Before this API can render MCD, SH-11 must prove actual buffer locations, byte lengths, channel mappings/strides, index format/endianness, primitive topology, submesh/material assignment and correct source->Web orientation. If bytes are not obtainable/authorized, the native mesh remains blocked.

### SH-05 exact integration contract — no shared files changed by SH-12

Inside SH-05's existing `createRenderer` (in `src/renderer.js`, exclusively SH-05), after the shader is linked and an **authorized** decoded mesh descriptor is supplied:

```js
const { mesh, drawRanges, world } = decodeIndexedMeshPayload(sourceQualifiedDescriptor);
const gpu = uploadIndexedMesh(gl, program, mesh);  // once per source mesh
// Per instance, after renderer.begin(camera) and SH-13 material binding:
const { model, normal, mirrored } = world ?? meshModelMatrices(worldMatrix);
gl.uniform1i(uniforms.uUseAffine, 1);
gl.uniformMatrix4fv(uniforms.uAffineModel, false, model);
gl.uniformMatrix3fv(uniforms.uAffineNormal, false, normal);
// Reuse existing uColor / uAlpha and SH-13 material/light uniforms.
// If CULL_FACE is enabled, set FRONT_FACE to mirrored ? CW : CCW,
// then restore the caller's previous state after the draw batch.
for (const range of drawRanges) {
  const material = sourceQualifiedMaterials.get(range.materialSlot);
  if (!material) throw new Error('Missing verified submesh material slot');
  // bind material here; shader/texture ownership stays SH-13/SH-05
  gpu.draw(range); // drawElements(TRIANGLES, range.indexCount, type,
//                range.firstIndex * (uint32 ? 4 : 2))
  drawCalls++; // existing SH-05 scene metric
}
// gpu.dispose() on context loss/shutdown
```

The uploader still validates/owns VAO+VBO+EBO; `gpu.draw()` remains backward compatible, while `gpu.draw({firstIndex,indexCount})` now draws only the requested triangle range. Material slots and world transforms are deliberately not inferred from buffer shape. SH-05 should first run a **synthetic/authorized in-memory split-stream fixture** through this contract, then capture a real browser frame and draw-call trace; only substitute a source-qualified mesh when its exact bytes and bindings are verified. SH-15 handles paired screenshot comparison with same native/Web camera.

**Acceptance ladder:** (1) 6 synthetic vertices, two submeshes and two drawElements with offsets 0 and 6 bytes (uint16) in mocked WebGL2, not a screenshot; (2) SH-05's browser/GPU smoke screenshot, winding/reflection and draw call count; (3) verified private native buffer provenance + matching scene instance + authorized runtime draw; (4) matched camera, silhouette/material/color deltas measured by SH-15. Only (1) is established by this module's tests. Never conflate a parser unit test or green CI with MCD visual parity.


## 2026-11-02 P0 OBJ group adapter — exported topology, not another cube

**Correction to the earlier binary-only blocker.** The SH-11 owner [#75](https://github.com/TGrozner/superhot-web/issues/75) has inspected the *private* result.json chain: research #53 and #60 confirm existing UnityPy gzip OBJ exports for level28 Mesh6/Mesh7; #61/#63 establish complete private access to Mesh6 OBJ (artifact 13135277646). Its recorded static measurements are **44,030 OBJ positions, 29,809 triangles, 61 submesh groups**, with group **47 = 1,546 triangles / 2,402 distinct referenced positions**, bounds matching serialized Unity after X reflection. These are **SH-11's evidence**, not this module reading game assets or a live runtime draw. Files, original source paths, raw triangles and game textures remain private. The native materials, active mesh draw, instance world transform, camera and 1:1 visual output remain unresolved.

The public adapter **decodeIndexedObjPayload(objText, descriptor)** accepts a *caller-authorized, decoded OBJ string*. It does not decompress source files, ship game content, parse Unity asset formats, or fetch the private corpus. OBJ can have three distinct indices for each corner (position, UV, normal); this adapter splits GPU vertices at seams, supports OBJ negative relative references, selects explicit groups and assigns explicit externally qualified material slots. It returns the existing packet fields **mesh, drawRanges, world** plus groupEvidence for numerical checks. It rejects missing or repeated groups, non-triangle faces, missing UV/normal, unsupported OBJ syntax and count/bounds mismatches. OBJ usemtl and numerical group suffixes are **not** trusted material evidence.

### Exact SH-05 renderer handoff (SH-05 owns all shared files)

SH-11 supplies privately decoded *authorized* OBJ text, verified exact group name, confirmed triangle and position-reference counts, qualified material slot, bounds after axis conversion and SHA/provenance; SH-04 supplies independently checked OBJ-to-Web axis mapping and world TRS. None is inferred by this module. SH-05 can wire the following **only after those inputs are actually available**:

    import { decodeIndexedObjPayload, meshModelMatrices } from './render/mesh-format.js';
    import { uploadIndexedMesh } from './render/gpu-mesh.js';

    const { mesh, drawRanges, groupEvidence, world } = decodeIndexedObjPayload(
      authorizedDecodedObjText,
      {
        coordinateSpace: 'web-rh',
        axisSigns: verifiedObjToWebSigns,  // array of exactly three +1/-1
        winding: verifiedFinalWinding,     // 'keep' or 'flip', explicitly verified
        groups: [{
          name: verifiedExactObjGroupName,
          materialSlot: verifiedMaterialSlot, // NOT inferred from group number
          expectedTriangles: 1546,           // group 47, Mesh6, SH-11 source finding
          expectedPositionRefs: 2402,        // original OBJ v references, NOT Web vertexCount
          expectedBounds: {
            min: verifiedTargetBoundsMin, max: verifiedTargetBoundsMax, tolerance: 1e-5,
          },
        }],
        worldMatrix: verifiedWebWorldMatrix,  // optional, no automatic native conversion
      },
    );
    const gpu = uploadIndexedMesh(gl, program, mesh); // cached by geometry, SH-05 renderer only
    // Inside SH-05's established renderer.begin(camera) draw pipeline:
    const { model, normal, mirrored } = world ?? meshModelMatrices(instanceWorldMatrix);
    gl.uniform1i(uniforms.uUseAffine, 1);
    gl.uniformMatrix4fv(uniforms.uAffineModel, false, model);
    gl.uniformMatrix3fv(uniforms.uAffineNormal, false, normal);
    // Bind source-qualified material slot (SH-13) or clearly label diagnostic color.
    for (const range of drawRanges) {
      bindQualifiedMaterial(range.materialSlot);
      gpu.draw(range);   // existing drawElements: firstIndex/indexCount into EBO
      drawCalls++;
    }
    // When GL_CULL_FACE is enabled, adjust frontFace for mirrored model and restore.
    // On context shutdown/rebuild: gpu.dispose().

A source OBJ that already mirrors X and reverses triangle winding (UnityPy export) **does not imply** that any additional axis conversion is safe. The final Web orientation is an SH-04/SH-11 measured decision. The explicit axisSigns and winding are not defaults. Mesh geometry, material binding and runtime visibility are separate proof obligations. The GPU may have more split vertices than original OBJ distinct-position references due to seams.

### Tangible generated-only acceptance and next visual gate

The generated **non-cubic, asymmetric wedge** in tests/render-mesh-obj.test.mjs has two selected groups, distinct UV/normal seams, negative OBJ indices, signed X reflection and winding correction. Behavioral tests validate both group bounds, triangle counts, per-corner vertex splitting, resulting normals and **mocked WebGL2 drawElements index offsets 0 and 12 bytes** (6 and 3 uint16 indices, two material slots). This is an end-to-end *CPU parser → GPU API mock* check, not a browser/WebGL2 execution, not native polygons, and not a 1:1 claim.

The next P0 **visible** gate is SH-05 loading an authorized mesh privately (never committing or shipping original OBJ/bytes publicly), replacing a Containers collider-proxy silhouette in the opt-in browser scene, recording the WebGL2 frame and indexed draw telemetry, then requesting SH-15's same-camera native/Web comparison. Only SH-05 modifies src/main.js, src/renderer.js or src/levels.js. SH-12 does not alter SH-13's material-model or lighting-model modules.


## 2026-11-02 SH-12 P0 — select existing private OBJ source groups `2_24` and `2_47`

The SH-12 **source-neutral** entry point `parseObjGroupsIntoIndexedMesh(objText, groupNames, options?)`
reuses `decodeIndexedObjPayload` and `uploadIndexedMesh`; it is **not** an
alternative Unity byte-stream or `m_CompressedMesh` parser. Two-argument
calls preserve OBJ's original coordinates/winding, with no claim that its axes
already correspond to Web. With axis conversion, explicitly pass winding;
never silently reverse winding based on a filename or unqualified PathID.

**Private corpus evidence checked from actual `result.json` this cycle:**
`superhot-research#68` artifact `13136407658` returned six serialized
renderer bindings without truncation, including GO839 / renderer8272 /
`level28:mesh6` submesh24 and GO336 / renderer7837 / mesh6 submesh47.
Both report 4638 indices, one selected submesh, enabled MeshRenderer and an
unresolved *owner-qualified* material reference `(fileId=5,pathId=3)`.
`superhot-research#63` artifact `13135277646` returned the complete private
gzip payload; its SHA-256 slice matched `result.json`. Private local read:
632318 compressed bytes, 5722287 decoded OBJ characters, 44030 `v`,
44030 `vt`, 44030 `vn`, 29809 triangular `f`, 62 multiword `g` labels.
The groups whose **terminal tokens** are `2_24` and `2_47` are each unique,
1546 triangles / 2402 referenced position indices. Native 3D renderer output,
materials, dynamic visibility and parity are **not** established.

### Browser integration contract — SH-05 is the sole owner of shared entrypoints

Pass decoded UTF-8 text **only from a user-selected local File** (a local
`.obj.gz` can be decompressed by the browser `DecompressionStream('gzip')`
before passing the text). Do not fetch it from the public server, publish it,
save it in a repository/workflow artifact, or collect it via analytics.

```js
// SH-05-owned integration location, NOT a file changed by SH-12:
import { parseObjGroupsIntoIndexedMesh, meshModelMatrices } from './render/mesh-format.js';
import { uploadIndexedMesh } from './render/gpu-mesh.js';

const decoded = parseObjGroupsIntoIndexedMesh(localPrivateObjText, ['2_24', '2_47'], {
  // Source OBJ is mirrored on X; Web preview convention also reflects Z:
  // two reflections => determinant +1, therefore do NOT flip a second time.
  axisSigns: [-1, 1, -1], winding: 'keep',
  expectedGroups: {
    '2_24': {
      expectedTriangles: 1546, expectedPositionRefs: 2402,
      expectedBounds: {
        min: [8.60, 0.97605, 14.37], max: [11.60, 4.17395, 22.58],
        tolerance: 0.003,
      },
    },
    '2_47': {
      expectedTriangles: 1546, expectedPositionRefs: 2402,
      expectedBounds: {
        min: [15.95, 0.97605, 9.87], max: [18.95, 4.17395, 18.08],
        tolerance: 0.003,
      },
    },
  },
});

const gpu = uploadIndexedMesh(gl, program, decoded.mesh); // ONE upload for both
const identityWorld = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const { model, normal } = meshModelMatrices(identityWorld);
for (const range of decoded.drawRanges) {
  gl.uniform1i(uniforms.uUseAffine, 1);
  gl.uniformMatrix4fv(uniforms.uAffineModel, false, model);
  gl.uniformMatrix3fv(uniforms.uAffineNormal, false, normal);
  // SH-05/SH-13 explicitly bind a clearly labelled DIAGNOSTIC fallback
  // until exact owner-qualified Unity material/shader/texture are resolved.
  bindExplicitlyDiagnosticMaterial(range.groupName);
  gpu.draw(range);
  drawCalls++;
}
// On context loss/reset: gpu.dispose().
```

For this static-batched OBJ, the converted vertices already carry their
**global scene coordinates**. Identity world is intentional: *do not* also
translate by cargo centers or reapply serialized GameObject TRS. The two
validated AABBs lie at cargo-7 (10.1,2.575,18.475) and cargo-22
(17.45,2.575,13.975) in the Web preview convention. The single interleaved
VBO/EBO has two separate triangle ranges (each 4638 indices) and two
`drawElements` calls; it **does not** deduplicate translationally congruent
group geometry yet. A future shared local-space mesh optimization requires
explicit recenter/instance-matrix testing rather than a silent transform.
`parseObjGroupsIntoIndexedMesh` deliberately strips the internal group
ordinal `materialSlot` and returns no guessed material binding.

Selection semantics: exact multiword name always works; a `2_N` terminal
token works **only when uniquely present**. Ambiguous duplicate endings,
reopened groups, missing groups, quads, malformed `v/vt/vn`, zero/out-of-range
positive/relative references, invalid bounds and unsupported axis conversion
are hard failures. The returned `groupEvidence[].independentChecks` distinguishes
caller-provided source assertions from counts self-measured from OBJ text.
The synthetic fixture tests exercise two non-cubic groups, UV/normal seam
splitting, negative OBJ indices, source-derived bounds, and two offset-correct
`drawElements` calls in a WebGL2 mock. No original asset is committed.

**Integrate safely:** `?scene=containers` already has a separate SH-05
local-file mesh6:g47 / mesh7:g48 path from #98. Use this two-group adapter to
add mesh6:g24 and optionally replace mesh6:g47 **inside SH-05's files**,
preserving the no-file generated-proxy fallback. Only remove each specific
cargo hull+artificial ribs after successfully checking and uploading its group.
Record `locallyLoadedSourceGroups`, triangle/draw-call totals and a real GPU
screenshot. SH-15 still needs matched active-native camera/render captures;
do not claim a 1:1 scene from successful unit tests.


## SH-12 P0 next visible target — entire local OBJ for EnemyMerged (2026-11-02)

The original group-selecting `parseObjGroupsIntoIndexedMesh(text,['2_24','2_47'],opts)`
**remains unchanged** for the existing Containers cargo pipeline (#102 merged).
The browser integrator (#5/SH-05) now needs a **complete local enemy OBJ**:
the `parseEntireObjIntoIndexedMesh(text, options?)` entry point intentionally
does **not** require knowing any source `g` label. It consumes **all** triangular
`f v/vt/vn` faces, with both one-based and negative relative indexes,
preserves split UV0/normal seams, and returns one source-neutral indexed
vertex/index buffer. If `g` labels exist, it preserves each contiguous group
run as a range; if no `g` exists, it produces one range with
`groupName: null`. It never derives native Material from `g` or `usemtl`.

**Primary private metadata, re-inspected from `result.json`**:
`superhot-research#81` artifact `13140480419` returned four rows,
`truncated=false`. Mesh owner `sharedassets0.assets`, PathID `284` =
`EnemyMerged`, **5,237 serialized vertices**, one submesh,
`converted_obj` UnityPy export; PathID `285` =
`EnemyMergedHeadless`, **4,895 serialized vertices**, one submesh,
also `converted_obj`. Both report positions, normals, UV0 and faces,
X-mirrored UnityPy conversion, **no skin, animation or weights in OBJ**.
Different owner `resources.assets` PathID 284/285 refers to *glass shards*,
not the enemy. These source facts do **not** establish the exact decompressed
OBJ face count, group syntax, a runtime visible enemy, bone pose,
source->Web handedness, or original material/shader. No private OBJ bytes, paths,
texture bytes or runtime captures were copied into this public codebase.

### Exact SH-05 browser + WebGL2 handoff — only SH-05 modifies shared files

In SH-05's existing `?scene=containers` local File picker, after reading the
**privately owned, user-selected** `.obj.gz` as text with the existing
`readLocalObjFile(file)` helper (no HTTP upload):

```js
import { parseEntireObjIntoIndexedMesh, meshModelMatrices } from './render/mesh-format.js';
import { uploadIndexedMesh } from './render/gpu-mesh.js';

// Example ONLY: double reflection matches the previous Containers Web preview.
// SH-05/SH-04 must confirm the actual enemy OBJ->Web signs and final winding.
// Do not blindly force this conversion on all exports.
const decoded = parseEntireObjIntoIndexedMesh(authorizedLocalObjText, {
  axisSigns: independentlyVerifiedObjToWebSigns, // e.g. [-1,1,-1]
  winding: independentlyVerifiedTriangleWinding, // 'keep' or 'flip'
  // Independent source gates are OPTIONAL until real OBJ table/face counts verified:
  // expectedSourcePositionCount: knownObjPositionTableCount,
  // expectedTriangles: knownObjTriangleCount,
  // expectedPositionRefs: knownDistinctReferencedPositions,
  // expectedBounds: {min:[...],max:[...],tolerance:1e-5},
});
const uploaded = uploadIndexedMesh(gl, program, decoded.mesh);
// In renderer.begin(camera), with a VERIFIED Web-space instance/prefab transform:
const { model, normal, mirrored } = meshModelMatrices(verifiedEnemyWebModelMatrix);
gl.uniform1i(uniforms.uUseAffine, 1);
gl.uniformMatrix4fv(uniforms.uAffineModel, false, model);
gl.uniformMatrix3fv(uniforms.uAffineNormal, false, normal);
// SH-05/SH-13 bind a clearly labeled SYNTHETIC DIAGNOSTIC material,
// never treat OBJ 'usemtl' as Unity material provenance.
// If CULL_FACE is used, account for `mirrored` + explicit parsed winding.
for (const range of decoded.drawRanges) {
  uploaded.draw(range);
  drawCalls++;
}
// Dispose uploaded GPU buffers when the file changes or the context is destroyed.
```

Return packet fields: `{mesh,drawRanges,sourcePositionCount,
sourcePositionRefs,sourceTriangleCount,groupRunCount,windingFlipped,world,
geometryProvenance,materialBindingsResolved:false,skinningAvailable:false}`.
`mesh` is the canonical 32-byte interleaved
`position.xyz|normal.xyz|uv0.xy` indexed WebGL2 payload.
`drawRanges` are `{firstIndex,indexCount,groupName}` with **no materialSlot**;
`uploadIndexedMesh(...).draw(range)` uses the actual index element size for
byte offsets, and `drawElements(TRIANGLES,...)`.
`sourcePositionCount` records the raw OBJ v-table count, distinct from the
GPU vertex count after UV/normal seam duplication. A count of 5,237 from
serialized metadata is not automatically asserted to match the exporter text;
verify its v-table length independently before enabling that gate.

The existing SH-13 UV2/lightmap contract is NOT implemented by an OBJ UV0
parser: absence of independently recovered UV2 means
**lightmapSamplingEnabled=false**. There are no bindposes, bone weights, skin
deformations, valid native enemy spawn, headless swap, or animations in this
module. The OBJ is suitable for a **static geometry diagnostic** only; SH-14
owns rig/proxy and SH-06 animation, while SH-05 exclusively owns
`src/main.js`, `src/renderer.js`, `src/levels.js`.

### Tangible acceptance gates

`tests/render-mesh-entire-obj.test.mjs` uses an original asymmetric,
noncuboid wedge (no commercial vertices): verifies ungrouped source, optional
multiword groups, UV/normal seam splitting, negative relative indices,
axis-reflected normals, wrong source count/bounds rejection, inverse-transpose
matrix, and mocked GPU **two real indexed draw ranges** at uint16 byte offsets
0 and 6. These tests are a **CPU + WebGL2 API mock**, not a real browser frame.

Next gate by SH-05: load either local `EnemyMerged` or `EnemyMergedHeadless`
OBJ into Containers with an explicitly labeled **static/unrigged native-source
mesh**, record successful GPU upload/draw counters, shader/culling diagnostics,
render a browser screenshot with a deliberate and independently qualified
placement, and send SH-15 a same-camera original/Web comparison request.
Do not claim a native pose, material, draw, or 1:1 before those observations.
No new corpus query is required for this parser.


## SH-12 P0 GPU UV0 gate for source-qualified Concrete texture (2026-11-02)

The indexed mesh transport *already* has UV0 float32 at interleaved vertex offsets
`position=0`, `normal=12`, `uv0=24`, stride **32 bytes**. Its uploader previously treated
the shader's `aUV` location as optional. That behavior is correct for the fallback,
untextured diagnostic material, but **not sufficient** for the requested Containers
Concrete texture: a shader can compile successfully while optimizing away
`aUV`, causing meaningless texturing despite correct OBJ UV0.

**New source-neutral contract (SH-05 alone wires its shared renderer files):**

```js
const decoded = parseObjGroupsIntoIndexedMesh(localObjText, [
  'Combined Mesh (root: scene)_48',
  'Combined Mesh (root: scene)_46',
  'Combined Mesh (root: scene)_77',
], independentlyVerifiedSourceChecks);
const gpu = uploadIndexedMesh(gl, program, decoded.mesh, {
  requireUV: true, // FAIL before GPU allocation if program lacks active aUV
});
if (!gpu.uvAttributeBound) throw new Error('UV0 attribute not active');
for (const sourceVerifiedRange of decoded.drawRanges) {
  // SH-05 owns gl.useProgram, shader uniforms and texture binding.
  // Bind verified source-selected local RGB24 pixels *before* drawing;
  // source UV0 *_MainTex_ST.xy, source ST=(0.10000000149, 0.10000000149),
  // offset (0,0), sourced separately by SH-13. Not UV2/lightmap.
  gpu.draw(sourceVerifiedRange); // byte offsets handled by the uploader
}
gpu.dispose();
```

This gate deliberately validates only *active vertex-to-shader UV0 plumbing*.
It does **not** decode texture pixels, bind a source texture, prove `_MainTex`
sampling, reproduce the native XULM Concrete shader, validate UV2 lightmap,
gamma/tone mapping or 1:1 native pixels. There is no automatic UV axis flip
or inferred material binding. If `requireUV` is omitted, legacy untextured
draws remain legal; `gpu.uvAttributeBound` reports whether the program has
an active `aUV` attribute, not whether a native texture appeared onscreen.

The new `tests/render-mesh-uv0-attribute.test.mjs` uses only a generated
asymmetric non-cubic wedge and a mock WebGL2 context to prove the 32-byte
vertex offsets, partial `drawElements` byte offset, fail-before-upload,
and legacy compatibility. **A real Chromium GPU frame / private local file
test is still an independent SH-05 / SH-15 acceptance gate.**
