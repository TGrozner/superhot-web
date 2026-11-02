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
