# SH-14 — Native enemy rig evidence and WebGL2 character slice (2026-11-02)

## Native evidence ledger — inspected actual PRIVATE result.json

**Authority:** SUPERHOT: MIND CONTROL DELETE (not original SUPERHOT), Steam 690040, build 20299547; Unity 2018.4.14f1, Assembly-CSharp SHA-256 `ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257`. Original private sources, decoded Unity blobs and raw artifacts stay in `TGrozner/superhot-research`; only source IDs/counts and synthetic code appear here. No native MCD application execution or paired screenshot has been seen by SH-14.

The **exact new SH-14 bounded source query** [private research #74](https://github.com/TGrozner/superhot-research/issues/74), run `41440009982`, artifact `13138705902` was opened and `result.json` parsed: `operation=query`, `database=resources/pass-01/corpus.sqlite`, **13 rows**, `truncated=false`, no error. It joined *original serialized* Animator `m_GameObject` to exact owner-qualified GameObject and selected `m_Controller.m_PathID=638`. Observations:

- **1 same-file chain**: `sharedassets0.assets:(Animator 4659 → GO 870 "EnemyBodyPrefab")`, `m_Enabled=0`, `m_Controller=(fileID 0,pathID 638)`, `m_Avatar=(fileID 0,pathID 632)`. SH-06's pre-existing animation source inventory labels `sharedassets0.assets:638` as the candidate `AnimCtrl_EnemyMain`. **This is a serialized prefab component, not a runtime active enemy.** Avatar identity 632 and skeleton/skin links are not independently qualified here.
- **12 additional prefab chains**: `resources.assets` Animator pathIDs **27622, 27625, 27627–27632, 27634–27637** → separately identified GOs named `EnemyBodyPrefab`. All disabled in serialized data, all `m_Controller=(fileID 3,pathID 638)`, `m_Avatar=(fileID 3,pathID 632)`. `fileID 3` requires its exact external-reference owner mapping: **do not silently call these sharedassets0 bindings** merely because the numeric pathID matches.
- **Not proved:** any `EnemyBodyPrefab` instance actually spawned in `level28/Containers`, its active Animator/controller/Avatar, clip/pose evaluated, SkinnedMeshRenderer, bone list or mesh pointer. The serialized prefab/disabled state does not rule out runtime instantiation or enabling.

This used **one** new `[corpus-query]` issue only. No corpus scan, duplicate read, rerun or Windows command was issued by this lane.

### Prior private evidence reused, without duplicate queries

| Request/result | What its parsed `result.json` actually establishes | Limit |
|---|---|---|
| [#8](https://github.com/TGrozner/superhot-research/issues/8), artifact `13132969099` | `spec/combat/combat-specification.md` text SHA `a6541443...` records `PejAiController.Update:3477–3534` and **`PejAiAnimator.LateUpdate:1114–1211`**; pose/LookAt/FinalIK precedes `UpdateDeferredBulletSpawn:1196–1199`. | These are static managed-code observations; neither pose nor muzzle is observed in a game run. SH-03 controls contact/hit. |
| [#10](https://github.com/TGrozner/superhot-research/issues/10), artifact `13133542861` | Direct SQLite schema of `objects(owner,path_id,type,name,tree_json)`, `hierarchy` and `scenes`, `truncated=false`; allowed scoped exact join for #74. | Table schema is not proof of an enemy instance. |
| [#11](https://github.com/TGrozner/superhot-research/issues/11), artifact `13133782424` | Decoded `verification.json` SHA `22ac2e6e...`: **511 AnimationClip / 15 AnimatorController / 25 Avatar / 247 Animator**, streamed/dense channel counts verified. | Not Unity runtime clip evaluation. |
| [#12](https://github.com/TGrozner/superhot-research/issues/12), artifact `13133383280` | `link-verification.json` SHA `6d23cbe9...`: controller/Avatar TOS hashes verified, 243 explicit curve joins, **1,028** subtree binding absences retained. | Asset reference/curve linkage ≠ active pose or bone matrix. |
| [#9](https://github.com/TGrozner/superhot-research/issues/9), [#13](https://github.com/TGrozner/superhot-research/issues/13), [#14](https://github.com/TGrozner/superhot-research/issues/14), [#15](https://github.com/TGrozner/superhot-research/issues/15) | Their private `result.json` reads were examined: separate audio/event, time control, world/progression, camera/time-input contracts. | No missing enemy mesh or skin data supplied by them. |
| Existing SH-06 [#52](https://github.com/TGrozner/superhot-research/issues/52), [#54](https://github.com/TGrozner/superhot-research/issues/54), [#58](https://github.com/TGrozner/superhot-research/issues/58) | Serialized **`level28`** has Animator `level28:18510` on GO `3451 "bHands"` with `AnimCtrl_PlayerMain` candidate, and legacy Animation on `Camera`. | **These are player hands/camera, NOT an enemy.** Does not exclude dynamically spawned enemies. |
| [SH-06 closure report](https://github.com/TGrozner/superhot-research/issues/18), artifact `13134221322` | Humanoid/Mecanim/FinalIK/retarget math has substantial static analysis; missing runtime reachability, masked blend cases and IK details remain explicit. | Do not invent quaternion muscle conversion, root-motion, clip state or event dispatch. |

## P0 drawable module: explicit diagnostic geometry, not MCD silhouettes

- `src/characters/generated-meshes.js` creates faceted **non-cubic indexed triangle surfaces** (head, tapered torso, tapered limbs) with coherent normals and UVs via SH-12 `defineIndexedMesh`. All vertices, colors and dimensions are **newly authored substitutes**, with no game-derived mesh or skin weights.
- `src/characters/rig.js` constructs a source-neutral 13-joint graph, checks parents/cycles, composes `parent * bind * callerDelta` in column-major affine matrices via SH-04, and emits one SH-12-compatible indexed draw packet per part with inverse-transpose normal matrix and reflection flag. It has **no animation evaluator**. The generated diagnostic skeleton is not a decoded enemy Avatar.
- `src/characters/indexed-pass.js` uploads three unique indexed GPU meshes once using SH-12 `uploadIndexedMesh`, draws **11 articulated mesh parts** per character in the host WebGL2 program, applies caller-supplied or *explicit generated* color, handles winding when culling is enabled, and restores program/VAO/front-face state. No own canvas, shader, server asset or gameplay hooks. Returns `{drawCalls,triangles,geometryProvenance}` to SH-05 for telemetry.
- **Pose interface:** `poseCharacterRig(rig,{rootMatrix,jointDeltas})`, where each jointDelta is a **quaternion TRS delta after the bind**. SH-06 owns sampling, transition selection, retargeting and animation-time rules; it must supply verified local joint transforms. SH-03 owns hit/collision and cannot treat our diagnostic part boundaries as native hitboxes. There is **no** native muzzle or damage window inferred from this module.

### Exact SH-05 integration handoff (ONLY SH-05 edits shared files)

Inside SH-05-owned `createRenderer()`, after the existing WebGL2 program and `uniforms` are created:

```js
import { makeGeneratedDiagnosticEnemyRig, poseCharacterRig } from './characters/rig.js';
import { makeGeneratedDiagnosticEnemyMeshes } from './characters/generated-meshes.js';
import { createCharacterIndexedPass } from './characters/indexed-pass.js';

const characterRig = makeGeneratedDiagnosticEnemyRig(); // DIAGNOSTIC only
const characterPass = createCharacterIndexedPass(
  gl, program, uniforms, makeGeneratedDiagnosticEnemyMeshes(),
);
// after renderer.begin(camera) each frame:
function drawDiagnosticCharacter(rootMatrix, externallyVerifiedJointDeltas = {}) {
  const pose = poseCharacterRig(characterRig, {
    rootMatrix, jointDeltas: externallyVerifiedJointDeltas,
  });
  const report = characterPass.draw(pose.packets);
  drawCalls += report.drawCalls; // same existing SH-05 telemetry counter
  return report;
}
// dispose pass on GL context cleanup, if implemented
```

The `rootMatrix` must be an explicit Web right-handed **world** transform (not a double-applied Unity transform). To prove a GPU slice without native assets, place one **visibly labeled procedural diagnostic** in the existing opt-in `?scene=containers` scene, without claiming a source enemy spawn or collision. Feed any procedural joint delta from the caller as diagnostic only. Once SH-06 supplies an actually sampled retargeted pose, pass those joint TRS deltas unchanged. The P0 target is a noncuboid articulated enemy appearing in a real browser scene with a frame capture and draw-call telemetry, followed by source-to-runtime provenance.

**Do not** connect this stand-in as if it were an original `EnemyBodyPrefab` or wire it to active combat without the missing native chain. Three independent acceptance gates remain: (1) **native prefab → SkinnedMeshRenderer → mesh/submeshes → bones/bindposes** owner-qualified (not supplied); (2) **runtime Containers spawn → enabled Animator → chosen clip/state → native retargeted pose** (not supplied); (3) **browser frame + matched-camera MCD frame → measurable silhouette delta**, including front-face normals, materials, skinning, hit contacts (not supplied). An original skinned mesh needs actual weights + vertex skinning, not merely these rigid-part draw packets. Report these as blockers, not as finished 1:1.

## Tests / limitations

`node --test tests/character-*.test.mjs` covers generated non-box triangle shape and normals, hierarchy/rotations and reference safety, mirrored matrices, indexed draw calls and state restoration in a mock WebGL2 API. Mock calls and Node CI cannot establish a visible GPU frame, actual native render, active enemy clip, material color, hit reaction or 1:1. No new private-game assets are committed or uploaded.


## P0 2026-11-02: REAL enemy geometry locally, static until skin evidence

**This section supersedes the old native-mesh blocker in the first SH-14 delivery above.** The original rig/11-piece character remains a clearly labeled procedural fallback. The **real converted enemy mesh geometry now has exact owner-qualified source and byte-level receipts**; this is more useful visually than generating another approximated humanoid.

### Native proof ledger, pre-existing PRIVATE requests (no new corpus scan in this slice)

1. [research #74](https://github.com/TGrozner/superhot-research/issues/74), result artifact `13138705902`: serialized `sharedassets0.assets:Animator4659` → `GO870 EnemyBodyPrefab`, candidate controller `(fileID0,path638)`, Avatar `(fileID0,path632)`, `m_Enabled=0` in prefab data only. This does **not** establish active animator runtime.
2. [research #78/#79/#80](https://github.com/TGrozner/superhot-research/issues/80), result artifact `13140750302`: prefab GO870/Transform2048 has piecewise `SkinnedMeshRenderer` components, and exact `SkinnedMeshRenderer4748 → m_Mesh(fileID0,pathID284), 60 bone references` (`EnemyMerged`), `renderer4749 → (fileID0,pathID285), 59 bone references` (`EnemyMergedHeadless`). These are **same-owner sharedassets0.assets** pointers. `resources.assets:pathID284/285` instead names unrelated **glass shards**; never resolve by pathID alone.
3. [research #81](https://github.com/TGrozner/superhot-research/issues/81), run `41440880253`, artifact `13140480419`: exact Mesh284/285 exported by the private UnityPy conversion as OBJ position/normal/UV and triangular faces. The OBJ format **does not encode weights, bindposes, clips, skin transforms or native materials**.
4. [research #88/#90](https://github.com/TGrozner/superhot-research/issues/88), artifacts `13139108195`/`13140612009`: prior SH-14 independent private reads inspected `result.json`, recomputed gzip and uncompressed OBJ SHA-256, enumerated group labels, vertex/UV/normal declarations, triangles and bounds. These receipts are encoded as **metadata only** in `src/characters/native-enemy-local.js`. They are NOT an additional native execution or newly downloaded data in this PR.

| Strict local source check | `merged`: sharedassets0:284 | `headless`: sharedassets0:285 |
|---|---:|---:|
| Serialized renderer / `m_Bones` refs | 4748 / 60 | 4749 / 59 |
| Exact OBJ group | `EnemyMerged_0` | `EnemyMergedHeadless_0` |
| Source `v/vt/vn` declarations | 5237 each | 4895 each |
| Triangles | 2254 | 2132 |
| Exact .obj.gz bytes | 110391 | 103229 |
| Exact uncompressed .obj bytes | 660805 | 618720 |
| Uncompressed SHA-256 | `acd05fef8f85ce06a1b6a6255247b01d3e27b5f3687525504ef39f45d2f67add` | `e6146e67cd0a9fb49b2641cc59fb397f5c236f78eb5c290a2206a74764305cff` |

Source OBJ AABB: X ±0.878194034, Y [0.0000810648,1.9474926] (headless max1.78382015), Z [-0.122781016,0.24209635]. Pipeline explicitly maps `(-x,y,-z)` and keeps triangle winding, following the existing Containers preview convention. Web AABB Z [-0.24209635,0.122781016]. This is **converted authored geometry with no independently observed Unity runtime draw**, not evidence of 1:1 silhouette in the game's running scene.

### SH-14 implementation — public code only, files reserved to this lane

`src/characters/native-enemy-local.js` exports:

- `NATIVE_ENEMY_OBJ_EXPORTS.merged/headless`: immutable public **metadata**, qualified by source file *and* path ID, with exact compressed/decompressed hashes and sizes.
- `loadNativeEnemyObj(file,{variant:'merged'|'headless'})`: owner-provided local File API `.obj` or `.obj.gz` **only**. Rejects wrong extension, size, SHA-256, missing exact OBJ group, wrong `v/vt/vn` counts, triangle count, source bounds, or malformed normals/UV/indices. No network request, automatic path access, asset serialization, clipboard, storage or upload. Strictness intentionally rejects alternate conversions until independently qualified.
- `decodeSourceNeutralEnemyObj(text,evidence)`: source-neutral shape conversion via **SH-12** `parseObjGroupsIntoIndexedMesh`, not itself a proof of native source. Its result always labels itself **unverified**.
- `createEnemyStaticIndexedPass(gl,program,uniforms,receipt)`: loads one SH-12 indexed mesh via the existing SH-14 WebGL2 character pass; provides `draw(worldMatrix)` and `dispose()`. The returned report explicitly distinguishes *digest-verified static export geometry* from a caller-provided mock, *generated red material* from native shader, and `skinned:false/nativeEnemySpawnVerified:false` from an activated EnemyBodyPrefab. One draw packet, no invented hitbox or fake bone matrices. Root transforms may later be supplied by SH-06 without creating false limb animation.

The exact exported data remains in the user's private `superhot-research` corpus. **No OBJ files, original vertex buffers, source binaries, texture, shader, copyrighted game code, Unity bindposes or captures enter public Git or Actions logs.** The only tests use a *newly generated 3-vertex OBJ*, and cannot prove real-browser GPU drawing.

### Exact SH-05 hook: static native mesh first, real skin/pose later

SH-05 alone may edit shared `src/main.js`, `src/renderer.js`, `src/levels.js`, `index.html`. Do **not** edit them from SH-14 or claim this PR is visible automatically.

Inside SH-05's existing `createRenderer()` after `gl`, `program`, `uniforms` are available:

```js
import { createEnemyStaticIndexedPass } from './characters/native-enemy-local.js';
let nativeEnemyPass = null;
function acceptLocalEnemyReceipt(receipt) {
  const newPass = createEnemyStaticIndexedPass(gl, program, uniforms, receipt);
  nativeEnemyPass?.dispose();
  nativeEnemyPass = newPass;
}
function drawLocalEnemyDiagnostic(worldMatrix) {
  if (!nativeEnemyPass) return { drawCalls: 0, triangles: 0 };
  const stats = nativeEnemyPass.draw(worldMatrix);
  drawCalls += stats.drawCalls; // SH-05's shared renderer counter
  return stats;
}
// Include acceptLocalEnemyReceipt/drawLocalEnemyDiagnostic in renderer return.
// No native EnemyBodyPrefab ID, combat entity, or active Animator inferred.
```

In SH-05's existing opt-in `?scene=containers` **local-only UI** (no server upload):

```js
import { loadNativeEnemyObj } from './characters/native-enemy-local.js';
const receipt = await loadNativeEnemyObj(fileFromInput, { variant: 'merged' });
renderer.acceptLocalEnemyReceipt(receipt);
// Render-only diagnostic placement, intentionally NOT sourced from a native
// Containers EnemyBodyPrefab spawn. Scene camera currently roughly
// (11,7,31,yaw0,pitch-0.19): z~5 puts a 0..2m model near its sightline.
const diagnosticWebWorldMatrix = [
  1,0,0,0, 0,1,0,0, 0,0,1,0, 11,0,5,1,
];
// Every frame AFTER renderer.begin(camera), never as a gameplay enemy:
const nativeEnemyMetrics = renderer.drawLocalEnemyDiagnostic(diagnosticWebWorldMatrix);
```

Show the text **`STATIC SOURCE-EXPORTED ENEMY · DIAGNOSTIC POSITION · NOT MCD SPAWN / MATERIAL / ANIMATION`** in the browser. Telemetry fields should separately report `sourceMeshOwner='sharedassets0.assets'`, `sourceMeshPathID=284|285`, `nativeIndexedDrawCalls`, `nativeStaticTriangleCount`, `nativeEnemySpawnVerified=false`, `skinAnimationVerified=false`. No native gameplay hit test should use this stand-in; SH-03 owns combat and SH-06 owns evaluated animation.

**Visual acceptance requires** a real user-selected local OBJ loaded in a WebGL2 browser, an actual frame with **nonzero** enemy indexed draws and screenshot, correct front-face/normal orientation, then a matching native MCD capture and matched camera/scale/material checks. Until that exists, **1:1 is unmeasured**. Full animated original 60/59-bone rig requires owner-qualified ordered `m_Bones`, Mesh `m_BindPose`, per-vertex bone weights/indices, Avatar632 resolution, SH-06 clip/retarget pose and verified runtime instantiation — still OPEN. One static mesh cannot legitimately be presented as skinned just by moving its root.

## SH-14: source-qualified serialized skin/bind matrices, NOT live pose (2026-11-02)

**New bounded private query:** [research #104](https://github.com/TGrozner/superhot-research/issues/104), run `41447003094`, artifact `13141584125`. Its `result.json` was inspected directly: **two joined rows, no error, `truncated=false`**. The query selected only exact owner `sharedassets0.assets`, Mesh IDs 284/285 and matching SkinnedMeshRenderer IDs 4748/4749. No earlier query was duplicated; OBJ assets, original matrices and ordered full bone arrays stay private.

| Serialized metadata proved | EnemyMerged Mesh284 / SMR4748 | EnemyMergedHeadless Mesh285 / SMR4749 |
|---|---:|---:|
| Vertex count | 5,237 | 4,895 |
| Ordered `m_Bones` array | 60 refs (all unique) | 59 refs (all unique) |
| `Mesh.m_BindPose` array | **60 matrices** | **59 matrices** |
| Bone-name hashes | 60 | 59 |
| Same-owner root bone | Transform 2257 | Transform 2257 |
| `Mesh.m_BoneWeights` / `Mesh.m_Skin` JSON | absent / absent | absent / absent |
| `Mesh.m_CompressedMesh.m_Weights` | present as **object, not decoded** | present as **object, not decoded** |
| `Mesh.m_VertexData.m_Channels` | serialized array | serialized array |

The headless ordered `m_Bones` list is exactly the 60-bone merged list with one reference **`sharedassets0.assets:Transform1939` removed at zero-based index 17**, with the other 59 refs in the same order. This is a **structural comparison, not proof of that bone's anatomical identity or runtime removal**. Serialized bindpose matrices contain `e00…e33` fields; their full numeric contents, Unity-to-Web basis conversion, bind/pose multiplication and per-vertex matching remain **unverified**. Do not equate equal counts with executable skinning. Animator4659, Avatar632 and Controller638 are serialized prefab references, not a sampled native clip/pose. Rendering `m_Enabled=1` of both SMRs from #93 is separate from the serialized disabled Animator.

### Working pure geometry deformation engine, strictly source-neutral

New `src/characters/skinning.js` exports `createIndexedSkinBinding()` and `skinIndexedCharacter()`: CPU **linear-blend skinning of real indexed triangle geometry**, using SH-12's `defineIndexedMesh` canonical interleaved 32-byte vertex layout. It is **not** another procedural enemy mesh or animation. Caller supplies *all* bone mapping and 4 influences per vertex. No fallback/invented weights, clips, transforms, hitboxes or source bytes.

```js
import { createIndexedSkinBinding, skinIndexedCharacter } from './characters/skinning.js';

// This input is BLOCKED for native EnemyMerged until private source skin weights,
// bone order and full bindpose coordinate conversion have been validated.
const binding = createIndexedSkinBinding({
  mesh: localEnemyReceipt.mesh, // SH-12-compatible indexed OBJ mesh
  boneIds: verifiedBoneIdsInRendererOrder, // 60 or 59 owner-qualified
  inverseBindMatrices: verifiedInverseBindsInWebMeshLocal,
  boneIndices: verifiedFourIndicesPerVertex, // length vertexCount*4
  boneWeights: verifiedFourNormalizedWeightsPerVertex, // same length
});
// SH-06 must supply the ACTUAL pose, bone matrices already Web mesh-local:
const frame = skinIndexedCharacter(binding, verifiedPoseByBoneId);
// frame.mesh = NEW SH-12 mesh with deformed pos/normals + unchanged UV/indices.
// frame.nativePoseVerified remains false: the caller must prove native execution.
```

The calculation is `skin_i = posedBoneInMeshLocalSpace_i × inverseBind_i`, `p' = Σ weight_j * (skin_j * p)`; normals use per-influence inverse-transpose and are normalized. The solver rejects singular/invalid matrices, missing bone matrices, invalid indices/weights, non-unit weight sums and degenerate normals. Triangles/UVs stay intact, deformed bounds recalculate, and there are no geometry or shader assets bundled. **Web RH mesh-local basis must be proven identical across OBJ positions, bindposes and sampled bones**; do not transpose Unity `eij` or mirror axes speculatively. Apply root world matrix only at draw time, not twice. `tests/character-skinning.test.mjs` uses only a newly-authored 3-vertex non-cube triangle with two bones, including 50/50 blending, inverse bind cancellation and nonuniform-scale normals.

**SH-05 exact integration handoff:** Continue showing the already-merged #114 **STATIC** local EnemyMerged OBJ in `?scene=containers` immediately; **do not gate the first native-geometry screenshot on skins**. No SH-05 shared files have been touched by SH-14. When authentic weights and poses exist, accept `frame.mesh` as SH-12 indexed data and update the existing WebGL2 vertex buffer per frame (`DYNAMIC_DRAW/bufferSubData` on cached GPU resources rather than rebuilding VBO/EBO every tick). Reuse host `renderer.begin(camera)`, `aPosition`/`aNormal`/UV32B layout, source-derived static mesh as safe fallback, and original root model-to-world once. SH-06 alone supplies clip/time/pose; SH-03 owns hit/collisions. Telemetry must separate **verified private static mesh**, **algorithmic source-neutral deform**, and **runtime-sampled native pose**. No 1:1 claim before original/Web synchronized screenshots and bone/hit comparisons.

**One exact native blocker for next research cycle:** decode the **compressed** `m_CompressedMesh` skin weight and bone-index encoding (or alternate vertex stream weight channels) for Mesh284/285, including ordering correspondence with exported OBJ vertices; determine the actual bone transform chain and map bindposes to runtime-sampled pose. Existing #104 proves their serialized presence/counts, **not usable per-vertex influence values**. No new private request should repeat #104.


## SH-14 — verified OBJ-source-position → WebGL2 skin-slot permutation (2026-11-02)

**P0 finding, based on a fresh direct reinspection of PRIVATE `result.json`, not merely workflow status.** Reused [research #88](https://github.com/TGrozner/superhot-research/issues/88), artifact `13139108195`, and [research #90](https://github.com/TGrozner/superhot-research/issues/90), artifact `13140612009`, with compressed exported objects read only in the private analysis environment. Both `result.json` payloads were `operation=bytes` with complete base64 gzip, SHA-256 matches their already published metadata receipts (no new corpus issue, no new runner requests). The original OBJ text and all original vertex/faces stay private. Also rechecked [research #104](https://github.com/TGrozner/superhot-research/issues/104), artifact `13141584125`: two complete DB rows, no truncation, **60/59** serialized bindpose counts and `m_CompressedMesh.m_Weights` object existence only; this is not a decompressed weight stream or a runtime pose.

**Crucial interoperability defect:** SH-12's `parseObjGroupsIntoIndexedMesh` numbers GPU vertices in **first-seen triangle-corner order**, NOT in the original Wavefront `v` declaration order. This is a completely deterministic fact about the existing Web implementation, independently rechecked against each original private OBJ's `f v/vt/vn` records:

| Private owner-qualified OBJ | Declared OBJ positions | Distinct referenced positions | Web unique corner vertices | GPU index identical to OBJ position index | Different index (requires remap) |
| --- | ---: | ---: | ---: | ---: | ---: |
| `sharedassets0.assets:284` EnemyMerged | 5237 | 5237 | 5237 | **2225** | **3012** |
| `sharedassets0.assets:285` Headless | 4895 | 4895 | 4895 | **2103** | **2792** |

All **6,762** merged face corners and **6,396** headless face corners have exact positive, matching `v/vt/vn` numeric indices. There are no unreferenced OBJ positions and no UV/normal seam-induced GPU duplicates **in these exact two exports**. Even so, most GPU slots are **permuted**. Feeding an eventual original source-vertex weight array directly to `createIndexedSkinBinding({mesh:receipt.mesh,...})` based only on equal vertex counts would bind the wrong weight *slots* for 3,012/5,237 and 2,792/4,895 GPU vertices. This does NOT prove that the associated weight values differ; it proves index correspondence is incorrect without permutation. One must still verify privately that the original Unity per-vertex weight order equals the OBJ exported `v` order.

### New PURE module, no gameplay modifications

`src/characters/obj-skin-map.js` exports:

- `createObjSkinVertexMap({objText,mesh,groupName,sourcePositionCount,axisSigns:[-1,1,-1],winding:'keep'})`: produces `sourceVertexForGpu` in the same first-use order as SH-12. Strictly validates every face index, GPU triangle order, exact float32 positions/normals/UVs and input source-position count. The canonical full local OBJ MUST be supplied by the owner, not copied into the repo. This map is **not** a Unity original-vertex index proof.
- `remapObjPositionSkinInfluences(map,sourceBoneIndices,sourceBoneWeights)`: duplicates/remaps four per-position influences into **SH-12 GPU order**, including authored fixture UV seams; returns arrays directly consumable by the merged `createIndexedSkinBinding` CPU solver. No weights, bone names, matrices, clips or poses are inferred.
- Newly authored **non-cuboid two-triangle fixture** tests assert source→GPU reordering, seam duplication, correctly deformed geometry when passed to the existing LBS solver, and hard fail on index/attribute drift. These tests contain no MCD values.

**SH-05 exact static→animated handoff (no shared-file changes here):**

```js
import {
  createObjSkinVertexMap, remapObjPositionSkinInfluences,
} from './characters/obj-skin-map.js';
import {
  createIndexedSkinBinding, skinIndexedCharacter,
} from './characters/skinning.js';

// Only AFTER the owner supplies the SAME local, digest-checked OBJ text as the
// already-loaded static enemy receipt AND private/native source weights
// independently qualified as matching the OBJ 'v' declaration order:
const sourceMap = createObjSkinVertexMap({
  objText: ownerLocalDecodedObjText,  // never upload / store / publish
  mesh: staticReceipt.mesh,
  groupName: staticReceipt.variant === 'merged'
    ? 'EnemyMerged_0' : 'EnemyMergedHeadless_0',
  sourcePositionCount: staticReceipt.variant === 'merged' ? 5237 : 4895,
  axisSigns: [-1,1,-1],
  winding: 'keep',
});
const remapped = remapObjPositionSkinInfluences(
  sourceMap, verifiedSourcePositionBoneIndices, verifiedSourcePositionBoneWeights,
);
const binding = createIndexedSkinBinding({
  mesh: staticReceipt.mesh,
  boneIds: verifiedOrderedOwnerQualifiedBoneIds,
  inverseBindMatrices: independentlyQualifiedWebMeshLocalBinds,
  boneIndices: remapped.boneIndices, boneWeights: remapped.boneWeights,
});
const posed = skinIndexedCharacter(binding, verifiedPoseByBoneId);
// SH-05/isolated GPU worker owns dynamic VBO upload. SH-06 owns timeline/pose.
// SH-03 owns hit; DO NOT create native hitboxes from a skin mesh.
```

**Hard gates:** source weights compressed format, original Unity→OBJ `v` correspondence, actual numerical bindposes in Web basis, source hierarchy/palette and time-sampled native pose are still unproven. **Do not postpone the existing real STATIC EnemyMerged Containers capture** while solving these. New mapping has no browser GPU screenshot and is NOT a runtime-native animation or a 1:1 claim. Native resource IDs and aggregate counts are safe metadata; original buffers remain private.
