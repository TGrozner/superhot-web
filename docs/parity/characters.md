# Original characters: local geometry and sampled animation

## Current implementation — 2 November 2026

The configured localhost homepage uses original EnemyMerged geometry in Containers,
not a generated humanoid. The complete/headless selector replaces the OBJ receipt
and optional skin package as one generation. Failed or stale loads cannot replace
a newer complete character. A supported static-only selection clears the old skin.

Original data remains under ignored `private/`; no original vertices, weights,
bind matrices, clips, textures, binaries, decompiled code or captures are published.

## Source identity

Target: **SUPERHOT: MIND CONTROL DELETE**, Steam AppID 690040, build 20299547,
Unity 2018.4.14f1. This is not original SUPERHOT.

| Identity | Complete | Headless |
|---|---:|---:|
| Owner | sharedassets0.assets | sharedassets0.assets |
| Mesh path ID | 284 | 285 |
| SkinnedMeshRenderer path ID | 4748 | 4749 |
| Original vertex count | 5237 | 4895 |
| Triangles | 2254 | 2132 |
| Weighted bone palette | 60 | 59 |

The matching prefab is GameObject870 / Transform2048 / Animator4659,
Avatar632 (`EnemyHandsHumanoidAvatar`), Controller638 (`AnimCtrl_EnemyMain`).
The full topological hierarchy contains **62 bones**; the palette contains only
weighted bones. Same numeric IDs in `resources.assets` are unrelated glass shards.
Do not use the separate resources-based 11-piece body package as this model's rig.

Prior source joins remain available in private research
[#74](https://github.com/TGrozner/superhot-research/issues/74),
[#80](https://github.com/TGrozner/superhot-research/issues/80),
[#81](https://github.com/TGrozner/superhot-research/issues/81),
[#88](https://github.com/TGrozner/superhot-research/issues/88), and
[#104](https://github.com/TGrozner/superhot-research/issues/104).
Those serialized observations alone were not runtime animation proof; the later
local extraction and native sampling below supply the additional evidence.

## Native sampling actually executed

An isolated clone was created in the original running Unity player. Cloned scripts
were removed before activation, the AnimatorController detached, animation events
and physics disabled. The original Avatar and original leaf clips were evaluated
using `AnimationClipPlayable` and a manual playable graph. Local bone TRS values
were recorded at 60 Hz; no motion was synthesized.

| Clip | Samples | Duration |
|---|---:|---:|
| idle | 2 | approximately 1/60 second |
| walk | 61 | 1 second |
| hit | 50 | approximately 0.8 second |

The sampled hierarchy has finite transforms and normalized quaternions. Applying
its original weights/inverse binds produced changing, finite skinned geometry,
not a moving T-pose. The serialized-rest residual of approximately 0.005259 Unity
units was retained rather than silently corrected.

An earlier controller-based sampling attempt emitted StateMachineBehaviour errors
after gameplay scripts were stripped. That result is not the shipped pose source;
the separate playable capture avoids those callbacks. Native death has **no clip**
in this controller: it switches to ragdoll/shatter physics. No death clip is invented.

## Public integration APIs

- `native-enemy-local.js` validates exact local OBJ exports and provides the static
  indexed pass. The OBJ's split/conversion ordering is not used for skin weights.
- `native-skin-pass.js` validates original vertex-order skin packages, interpolates
  local position/scale and shortest-arc quaternion samples, composes parent-first
  transforms, and draws one indexed GPU-skinned mesh.
- `renderer.replaceNativeCharacter(receipt, sourcePackage)` installs a complete
  static/animated pair atomically. A null package explicitly selects static-only.
- `renderer.drawNativeSkin(modelMatrix, clip, time)` uses caller-provided world time.
  Missing clips are errors; idle/walk loop and hit clamps.

The skin equation is `sum(weight * globalBoneInMeshSpace * inverseBind * vertex)`.
The world transform is applied once afterward. Original skin packages retain Unity
coordinates; the actor world matrix performs the X reflection. The older static
OBJ loader uses a different converted basis and needs its corresponding heading.
Do not attach the original weights to the parsed OBJ's different vertex order.

The reusable CPU `skinning.js` also requires **hierarchy-global bone matrices in
mesh-local space**, not parent-local matrices. Normals use the inverse transpose of
the blended skin transform, including nonuniform scale. The GPU uses the same rule.

## Behavior observed in Chromium

- Root auto-loads complete geometry and the 62-bone/60-weighted-bone package.
- The character appears in its sampled idle pose rather than the original bind pose.
- Actual keyboard movement advances the world clock and original walking poses.
- Pausing freezes the world clock and sampled pose time.
- A controlled-camera projectile scenario exercised the actual input/projectile
  path, killed an original actor, rendered its sampled hit reaction and Web debris,
  and produced a dropped original pistol above the source floor.
- World rendering used 360 original instances / 185037 triangles, with the original
  held pistol; no GL errors were observed in these scenarios.

`Cadrer le modèle` is collision-free and hides scenery so it cannot occlude the
inspected character. Generated control/demo views retain their generated actors.

## Remaining limits

These are original **leaf-clip samples**, not a recreation of Mecanim transitions,
masked layer blending, FinalIK, root motion or active native spawning. Containers
uses authored spawn candidates with Web encounter timing. Combat/hitboxes,
axis-aligned collision, death fragments, audio and lighting remain Web behavior.
Native death ragdoll physics and complete red-crystal shader/post-processing are
not implemented. Tests and isolated pose images must not be called full 1:1 parity.

## SH-14 Red Crystal final-output integration (2026-11-02)

The live GPU-skinned character fragment shader now embeds and invokes
`NATIVE_MATERIAL_GLSL.redCrystalOutput` from `src/render/native-material.js`.
It applies the recovered final RGB mix, conditional green term and opaque alpha.
The Unity-order positions, weights, compact joint palette and original sampled
idle/walk/hit clips are unchanged; **no OBJ remap** is applied.

This is **bounded shader math**, not full Red Crystal parity. Native
`proceduralRgb`, `overlayRgbAmount`, and `additiveRgb` producers remain
unverified. For now, the pass feeds its existing Web lit RGB into procedural,
with zero overlay/additive signals. It does not invent specular, fog, reflectance,
shatter or death inputs. Its draw report exposes
`redCrystalFinalCompositor: true`, `redCrystalNativeInputsVerified: false`,
and `materialParity: false`.

The four pre-change isolated views in `docs/parity/visual.md` measure silhouette
IoU 0.9554–0.9615 and RGB delta 0.0940–0.1022. No post-change comparison or
visible improvement has been measured. SH-05 can integrate this pass without
editing its caller integration or waiting for a different rig package.
