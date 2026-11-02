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
