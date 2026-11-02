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
and physics disabled. The original Avatar and exact source leaf clips were evaluated
using `AnimationClipPlayable` and a manual playable graph. Local bone TRS values
were recorded at 60 Hz; no motion was synthesized.

| Browser clip/state | Exact source clip | Owner / path ID | Source controller state | Samples | Source duration | State speed |
|---|---|---|---|---:|---:|---:|
| idle | `rig\|standing-0-idle-MR` | sharedassets0.assets / 540 | `Base Layer.Idle` | 2 | 0.0166666675 s | 1 |
| walk | `rig\|walking-forward-MR` | sharedassets0.assets / 585 | `Base Layer.Walking` | 61 | 1 s | 1.75 |
| run | the same `walk` data, without a second copy | sharedassets0.assets / 585 | `Base Layer.Running` | 61 | 1 s | 2.25 |
| hit | `rig\|standing-stun-0-epsilon-MR` | sharedassets0.assets / 569 | `Effects.Stun Blend Tree` | 50 | 0.8000001 s | 1 |
| fire | `rig\|main-pistol-strzal-epsilon-MR` | sharedassets0.assets / 578 | `Shooting.RangeAttacks_BlendTree` | 50 | 0.8000001 s | 8 |
| punch | `OA_Melee_Fist_01_Epsilon_MR` | sharedassets0.assets / 468 | `Melee.Punch` | 121 | 2 s | 1 |

The v3 sample is 1,628,004 bytes, SHA-256
`e2e50a6cc5b1d284d5fdea3799901f2d8dde93afbd95fe3cf2b9d4691264db73`.
The complete/headless browser packages are distinct ignored private files. Their
clip frames remain in the source Unity vertex/weight/bone order.

The native player also rendered six isolated 960×540 source references: idle,
walk at 0.25/0.75 second, hit at 0.25 second, fire at 0.25 second, and punch at
0.5 second. Every captured local pose matched the retained sample with maximum
component difference 0; private manifest SHA-256 is
`09e2df6ff63448dca88db0b019803737b7438c103080f0e218241f0961a0475a`.
These are source-engine pose references, not gameplay-frame or material parity.

The sampled hierarchy has finite transforms and normalized quaternions. Applying
its original weights/inverse binds produced changing, finite skinned geometry,
not a moving T-pose. The serialized-rest residual of approximately 0.005259 Unity
units was retained rather than silently corrected.

The controller supplies fixed locomotion transition durations, and only those
durations are accepted by the skin pass:

| Transition | Duration |
|---|---:|
| idle → walk, walk → idle | 0.10000000149011612 s |
| idle → run, run → idle | 0.10000000149011612 s |
| walk → run, run → walk | 0.25 s |

Fire has evidenced fixed 0.10000000149011612-second entry and exit durations and
normalized exit time 0.875. Punch has a fixed 0.10000000149011612-second entry;
its normal exit is fixed 0.33426880836486816 second at normalized time
0.8341996669769287. These action timings are retained as package provenance, not
silently generalized into locomotion crossfades.

### Action layers

Controller638 supplies transform masks for both actions. Fire layer 4 is additive
with serialized default weight 1; it affects bones 10–13 (spine), 37–38 (neck),
and 39–61 (right arm/hand). Punch layer 5 is override; it affects bones 10–61
(spine, neck and both arms/hands), while root, hips and legs remain locomotion.
Runtime layer weights are not constants: `PejAiAnimator` writes
`gunFightLayerWeight` to layer 4 and `meleeLayerWeight` to layer 5. Entering or
exiting melee linearly tweens the latter over 0.1 second and grab IK can reduce it.
The Shooting layer does **not** start from the `Shoot` trigger: that trigger is
consumed by the melee and melee-weapon layers. Controller638 serializes a
conditionless, fixed-0.1-second `IdleLeftRightBlend -> RangeAttacks_BlendTree`
edge and a fixed-0.1-second return at normalized time 0.875. That edge alone does
not prove activation: no managed `Animator.Play`/`CrossFade` targets the range
state, and an isolated `AnimatorControllerPlayable` with `LeftRight=1`,
`Weapon=0`, and layer-4 weight 1 remained in `IdleLeftRightBlend` for the full
0.8-second observation. Browser activation must therefore come from explicit Web
attack intent; it is not described as a recovered projectile-event restart or
native periodic cycle.

The first isolated native `AnimationLayerMixerPlayable` capture evaluated fire over
four walk phases at five fire times. It produced 20 records, 134,155 bytes,
SHA-256 `56ef75a661dfccf2d11a106062f8724c2091af949c961e74a9aa20e7eb051dc1`.
Fire frame zero was the native additive neutral: its maximum difference from the
base was 1.3e-9 position and 2.98e-8 radians. However, the later Humanoid additive
result is **not** a base-independent local-TRS delta. Across the four base phases,
the same action sample changed the inferred post-rotation delta by as much as
0.03370358391045004 radians and position delta by 0.0006914484000000009 Unity
units. Reusing one guessed local delta would therefore be observably different from
Unity's muscle-space composition.

V8 contains bounded native precomposition for the default right-handed pistol
branch (`LeftRight=1`, `Weapon=0`): `zeta:rig|main-pistol-strzal-epsilon`, duration
2 seconds, state speed 8. This differs from the retained raw comparison API's
0.8000001-second `fire` MR leaf. The grid covers one idle phase and 16 periodic
walk phases, 33 action knots from 0 through 2 raw source seconds, and native
external layer weights 0.5 and 1; weight 0 is the unduplicated raw base pose. Run
aliases the same walking leaf. Its 17,991,271-byte native capture has SHA-256
`cef9ef6aee2684628bb14e5e0c95274db4b3340a5af802ef00560d301d3d57c2`
and contains 1,122 training, 1,088 unseen weight/time/phase, and 648 locomotion
transition hold-out records.

The 1,088 grid hold-outs bound maximum component position error at
0.00003745558245 Unity units, scale error at zero, and rotation error at
0.0183600885 radians. Locomotion-transition hold-outs bound endpoint
precomposition at 0.0000065005 position and 0.0455490398 radians. A separate
162-record native entry/exit capture (SHA-256
`5b1c94610817c25e636ec171cbb8bb92f3a188f4c344822bbb7a76848d42f13c`)
bounds the Web effective-weight approximation at 0.0000221286897 position /
0.0192482490 radians on entry and 0.000150717612 / 0.0786473024 radians on exit.
The Shooting-idle leaf differs from raw base by at most 0.0000021615 position and
0.0000706999 radians. These are measured approximations, not exact parity or a
reconstructed Humanoid solver.

An earlier controller-based sampling attempt emitted StateMachineBehaviour errors
after gameplay scripts were stripped. That result is not the shipped pose source;
the separate playable capture avoids those callbacks. Native death has **no clip**
in this controller: `PejAiAnimator.Kill` disables the Animator and releases limb
rigidbodies for ragdoll/shatter physics. No death clip is invented.

The source prefab does serialize 11 body-part cutter meshes: torso (mesh 254),
right shin (217), right thigh (274), left shin (278), right forearm (283), left
upper arm (280), left thigh (279), left forearm (282), head (281), hips (269), and
right upper arm (276). Native separation first calls `SkinnedMeshRenderer.BakeMesh`
at the actual kill pose, groups triangles by the first vertex's color (red-channel
tolerance 10), recenters each generated mesh at its arithmetic vertex mean, then
places it with the source part transform and applies runtime joint/force behavior.
Consequently there is no exact static fragment placement to export: it depends on
the actor pose at the kill frame and subsequent native physics/randomness. A fixed
hit-pose or authored death placement would be fabricated and is intentionally absent.

## Public integration APIs

- `native-enemy-local.js` validates exact local OBJ exports and provides the static
  indexed pass. The OBJ's split/conversion ordering is not used for skin weights.
- `native-skin-pass.js` validates original vertex-order skin packages, interpolates
  local position/scale and shortest-arc quaternion samples, composes parent-first
  transforms, and draws one indexed GPU-skinned mesh.
- `renderer.replaceNativeCharacter(receipt, sourcePackage)` installs a complete
  static/animated pair atomically. A null package explicitly selects static-only.
- A loaded skin exposes `states`, `clipDurations`, `actionTiming`,
  `actionLayers`, `actionPrecompositions`, `availableTransitions`, and
  `availableActions`. `createStateInstance(name)` preserves state aliases such as
  run → walk without copying frames. `draw(...)` accepts optional
  `transition: { from, fromTime, elapsed }`, where `from` is a prior skin instance.
  If transition is absent the target is sampled directly; if its exact
  `from->to` contract is absent the draw fails rather than inventing a duration.
- The fire action API is
  `action: { state: "fire", time: rightPistolSourceSeconds, weight, blend }`.
  `time` is raw, unscaled time in the 2-second default-right-pistol leaf; the
  caller advances it at controller speed 8. `weight` is the external
  `gunFightLayerWeight` in `[0,1]`. `blend` is the Shooting state contribution in
  `[0,1]` (default 1); entry/exit use the evidenced approximation
  `effectiveWeight = weight * blend`. `null` means inactive. Fractional native
  weights are interpolated between captured 0, 0.5, and 1 knots.
- Punch remains
  `action: { state: "punch", time: sourceClipSeconds, weight: 1 }`; its override
  weight and blend must both be exactly 1. The raw `clip: "fire"` comparison API
  is unchanged and remains the separate 0.8000001-second MR leaf.
- Fire samples its bounded native precomposition over current base time, action
  time, and effective weight. During an idle/walk/run transition it precomposes
  both endpoints before the recovered locomotion transition. V4 and earlier
  packages retain the explicit blocker; V8 exposes the weighted default-right
  branch with all measured hold-outs.
- Caller base and action clocks apply the exposed source state speeds before this
  API. Idle/walk/run loop; hit/fire/punch clamp. The gameplay integration freezes
  all animation clocks at its recorded kill time because native `Kill` disables
  the Animator. Missing states, clips, transitions, or action contracts are errors.

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
The locomotion crossfades use recovered fixed controller durations, and the punch
path uses the recovered layer-5 override mask over simultaneous locomotion. Fire is
active through a bounded native precomposition grid; it is not reconstructed as a
base-independent local-TRS delta. Grid, fractional external weight, Shooting
entry/exit effective weight, and endpoint locomotion-transition interpolation
retain the measured errors above. Only the default right-handed pistol branch is
packaged. Native activation of the serialized Shooting range state remains
unobserved, so Web attack intent is an explicit integration input rather than a
claimed source event mapping. FinalIK, root motion and active native spawning are
not reconstructed. Containers uses authored spawn candidates with Web encounter
timing. Combat/hitboxes, axis-aligned collision, death fragments, audio and
lighting remain Web behavior. Native death ragdoll physics and complete red-crystal
shader/post-processing are not implemented. Isolated pose and layer captures must
not be called full 1:1 parity.

## SH-14 Red Crystal final-output integration (2026-11-02)

The live GPU-skinned character fragment shader now embeds and invokes
`NATIVE_MATERIAL_GLSL.redCrystalOutput` from `src/render/native-material.js`.
It applies the recovered final RGB mix, conditional green term and opaque alpha.
The Unity-order positions, weights, compact joint palette and the previously
sampled idle/walk/hit data are unchanged; fire/punch are added in the same direct
order and run aliases the walk data. **No OBJ remap** is applied.

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
