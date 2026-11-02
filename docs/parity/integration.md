# SH-16 | Containers/build28 integration readiness (NOT native parity)

Run **node scripts/integration-vertical.mjs** from the repository root with Node 20+. It emits a machine-readable report of the actual checkout's static ES-module import reachability, existing Web renderer capabilities, and an optional **CPU-only** draw-packet probe of the generated cargo scene. The report is deliberately not a browser or native-executable test: nativeParityVerdict is UNASSESSED, and a reachable import is not proof that code executed.

## Current localhost integration — original assets and sampled poses

The configured root URL `/` loads the selected private source-scene package automatically.
The owner's current selection is Dojo/build10:20 meshes,178 world draws and17 textures.
EnemyMerged/Headless use a62-bone hierarchy with60/59 weighted GPU matrices and
original idle/walk/hit poses evaluated in Unity. No query flags are required.

`assessContainersBrowserMetrics` accepts `NATIVE_ORIGINAL_GEOMETRY_WEB_GAMEPLAY`
with actual source-world draw counts. The four-draw manual preview is a separate
fallback contract, not the current complete-world acceptance criterion.

Keyboard movement, pause, atomic variant switching and a controlled-camera
projectile impact were exercised in Chromium. Source collider AABBs and authored
spawn candidates are connected to Web gameplay; this is not native PhysX, spawner
timing, navigation or ragdoll death. Source projection parameters are consumed by
all draw passes through the same uploaded view-projection matrix. See
`characters.md` and `visual.md` for bounded runtime and image-comparison evidence.

The sections below preserve earlier integration observations, not current setup instructions.

## Historical state verified 2 November 2026, before original-world integration

- SH-05 PR #81, merged at d686de55: opt-in ?scene=synthetic uses buildSyntheticManifest -> buildSceneGraph -> planSceneDraws -> drawGeneratedManifest -> renderer.affineBox. This is an original generated fixture, not Containers. Its meshes do not contribute to state.solids.
- SH-04 PR #86, merged at 390e64d4: src/scenes/containers-build28.js exposes CONTAINERS_BUILD28_HULLS (5 rounded, source-derived world-space AABBs), CONTAINERS_BUILD28_DEMO_CAMERA (x=11, y=7, z=31), createContainersBuild28Nodes(), and createContainersBuild28DrawPlan(camera). The generated scene is five cargo boxes, forty invented decorative ribs and an invented floor. It models collision envelopes only: **no original meshes, materials, textures, shaders, native camera or observed runtime instances.**
- Native transport verified directly by SH-16: private research issue #10, run 41426522641, artifact 13133542861, result.json is a valid SQLite schema query result (hierarchy, objects, scenes, serialized, sources), not a SQL error. SH-04 deeper scene placement evidence comes from private #16/#20/#27/#30/#32/#37/#39. The actual original data stays private.
- SH-03 PR #83 offers isolated beginPistolFire / advanceBulletUpdate / traceBulletFixedStep / classifyOrdinaryEnemyImpact; its Web tracer is not Unity Physics.SphereCast. SH-07 #82 supplies source-checked shot audio selectors (merged at 4e71e3e4), and SH-06 #84 a generated impact cue and bounded animation event intervals (merged at 8750cc23). SH-08 #85 supplies flow eligibility guards, not a scheduler. These modules are not automatically integrated into gameplay just because PR checks are green.
- SH-12 #76, SH-13 #77, SH-14 #78, SH-15 #79 own the new GPU meshes, materials, characters and native/Web visual comparisons.

## Concrete SH-05 integration contract

1. SH-05 has **already wired a visual-only route** at ?scene=containers in merged #88 (22b87c96): main.js -> drawContainersBuild28Preview() -> createContainersBuild28DrawPlan() -> renderer.box(). No second route is needed. The preview resets state.solids and state.enemies to empty, explicitly reports collisionConnected=false, and does not implement gameplay. Verify a real WebGL2 frame/capture before claiming the five cargo boxes were seen; do not claim original mesh fidelity.
2. For playability, map **only** CONTAINERS_BUILD28_HULLS into the actual movement and projectile collision list, using center ± size/2 for min/max. Exclude invented ribs and floor from claims about native colliders; decide their Web collision policy explicitly. Generated AABBs do NOT preserve Unity BoxCollider rotations, layers, triggers or PhysX, and are not native-runtime contacts.
3. The legacy prototype clamps the player camera X to [-14.9,14.9] and Z to [-33.8,21.8]. The cargo cluster includes X=17.45 and the demo camera begins at Z=31. A demo draw from that viewpoint is therefore **not proof of a traversable playable level**. Set a deliberate new spawn/world bounds/collision policy, and verify motion and bullets hit the displayed cargo, not invisible legacy walls.
4. Integrate SH-03/SH-08 only after choosing actual weapon, enemy/spawner and kill-quota bindings. The current Web shoot() uses fixed ammo/cooldown, bullets use one rAF sweep against legacy state.solids, and level clear is based on the locally empty enemy array. The source-bounded isolated modules cannot be treated as live without an explicit call path and phase-order contract.
5. After the browser wiring, capture a real playable Web screenshot at stated resolution/GPU and record scene packet count, **actual** WebGL2 draw calls and p95 frame time, as well as a successful physical walk/bullet occlusion interaction. Only then compare with a same-camera original MCD capture kept private. No fidelity score should be issued from Web tests or asset inventory alone.

## What the SH-16 report means

The scanner uses a conservative lexical static-import graph. It may miss dynamic or multiline imports, and a static edge only proves a source reference. The optional cargo probe calls the public generated plan and verifies finite legacy draw-packets; its reported estimatedLegacyDrawCalls is **not** a GPU measurement. The negative cargoColliderWiringProven flag means SH-16 has not proved the collision integration, not that no future implementation exists. Browser GPU tests, active Unity execution, collision equivalence, actual scene matching and 1:1 remain unassessed until explicit evidence is supplied.

This SH-16 PR changes only scripts/integration-vertical.mjs, tests/integration-vertical.test.mjs and docs/parity/integration.md. It does not modify shared game code, run native binaries or touch the Windows runner.

## Historical integration cut — before full scene and sampled skin integration

**Actual source path now on public main:** `?scene=containers` → locally selected `File` → `readLocalObjFile` → `parseLocalObjGroup` → `replacePrivateMesh` (`uploadIndexedMesh`) → `renderer.drawPrivateMesh`. Merged #98 makes this path available for two selected groups; merged #97 offers a **separate**, stricter full-label OBJ adapter not yet used by #98. The only guaranteed default view without the private files is SH-04's five collider-derived generated hulls, their **40 invented ribs**, and a generated floor. This is a real wiring change, but the actual browser pixel output with the private `File` is still unobserved. The new report replaces the stale `syntheticModeOnlyDetected` with two independent **lexical** flags, `containersPreviewWired` and `localObjPreviewWired`. Neither asserts runtime invocation or GPU completeness.

**New independent compatibility adapter:** `scripts/integration-cargo-proxy.mjs` exports `buildContainersProxySolids(CONTAINERS_BUILD28_HULLS)`. It accepts exactly the five named, bounded collider-derived AABBs and returns the Web solver's **combined** `{x,y,z,w,h,d,min,max,solid}` contract. This is needed because the current `resolveWalk` reads **center and width/depth**, whereas `segmentAabb` reads **min/max**. Tests in `tests/integration-cargo-proxy.test.mjs` independently call both production math routines using the same hull. This is **not yet wired** to gameplay; `main.js::loadLevel` explicitly empties `state.solids` and `state.enemies` on the Containers route. We neither approximate rotations/layers/triggers/contacts nor infer any native collision from rounded AABBs. SH-05 alone should decide whether to import the adapter and should preserve the distinction between proxy tests and original PhysX proof.

**Quantified reproducible movement discrepancy (static code, not a browser traversal):** Demo camera `{x:11,z:31}` is outside the inherited `clamp(next.z,-33.8,21.8)` by **9.2 world units**. Its x stays within `[-14.9,14.9]`, while source-derived cargo centers `cargo-22.x=17.45` and `cargo-upper.x=17.475` lie beyond the inherited positive X center bound by **2.55** and **2.575** units, respectively. A moving camera can snap because its first movement is clamped. A deliberate playable spawn and **source-qualified** world limits are required; do **not** declare the demo camera a native player pose.

**Source->Web geometry provenance independently inspected this cycle, no new query issued:** downloaded **existing** private research #8–#15 artifact ZIPs and inspected their `result.json` operation/status. #8 and #9 are bounded combat/audio specification reads, #10 a valid SQLite schema query (not a runtime capture), #11–#12 animation/link verification reads, #13 bounded TimeControl source, #14 world README, and #15 source camera/time/input specification. Original text and data remain in the private environment. Separately private #63 artifact **13135277646** was decoded and the included gzip slice SHA-256 **matched** its manifest. Its **Mesh6** OBJ group ending `_24` is 1546 triangles / 2402 distinct position references, center **before** `(-x,y,-z)` conversion `[-10.10000039,2.57499891,-18.4749999]`; group `_47` also has 1546 triangles / 2402 distinct position references, raw center `[-17.4500008,2.574999125,-13.974999895]`. After `(-x,y,-z)`, their centers match public generated cargo-7 and cargo-22 positions within the expected rounding. **This establishes group/position provenance only**, not renderer materials, runtime visibility or GPU output. The second selected **Mesh7 `_48`** in #98 was **not present in the Mesh6-only #63 slice**; its independent source assignment is documented by private research #68, but SH-16 did not decode its payload this cycle. Avoid claiming both meshes visually verified from the one artifact.

**Quantified analytical projection mismatch, not an image difference:** native camera FOV serialized `~60.0000267°` in private #15; Web shader at this cut uses `f=1.58` → **64.66037°**. At fixed distance, equal vertical subjects project **8.78% smaller** on the current Web camera than the serialized Unity camera would, *if* both cameras were active with those values; active original pose/FOV is not verified by this scan. Web near/far `.045/120` vs Unity serialized `.03/1000`. SH-15 owns paired comparison; SH-05 owns shared renderer projection changes. Without matched camera/render state, a visual fidelity percentage would be misleading.

**Browser acceptance gate** (no private bytes in Git): select the **user's own** authorized OBJ/OBJ.gz files for Mesh6 `_47` and Mesh7 `_48` locally in `/?scene=containers`; start the preview; record `window.__superhotSceneMetrics` together with screenshot and viewport/GPU metadata. Run `assessContainersBrowserMetrics(copiedTelemetry)` from `scripts/integration-vertical.mjs` for *reporting only*. Expected for a fully loaded 2-group demo: `locallyLoadedSourceGroups=2`, `generatedManifest.privateIndexedDraws=2`, `generatedManifest.hiddenByPrivateMesh>0`, finite `p95FrameMs`, explicit `totalWebGLDrawCalls`. These app-generated counters still need a real screenshot and SH-15 comparison. Coverage is at most **2/5 of the five named cargo hull objects by indexed replacements** (not 40% of all native geometry or pixels). There is still no active native character/weapon/collision/level-clear behavior on this route.

**SH-05 next exact ordered hook:** (1) validate both private-file browser imports and rendered screenshot/p95, fixing any parser/camera failure; (2) choose source-based spawn/world bounds, replace the preview-only empty `state.solids` with **these five rounded proxy envelopes** solely as an explicitly non-PhysX visual-contact prototype and test movement/bullet segments; (3) bind actual instantiated native character/rig/weapon IDs from SH-14/SH-03 evidence, not legacy mannequin; (4) source-gate time, fire, bullet/impact, and progression; (5) compare same-scene/same-camera native vs Web pixels, animation, sound and interactions. Unresolved original material owner `level28:MeshRenderer m_Materials[0]` `fileID5,pathID3` and active GPU/runtime camera require separate SH-11/SH-13/SH-15 evidence. **SH-16 does not edit renderer/main/levels or merge PRs.**


## SH-16 — 2026-11-02 native world vertical: previous six-cargo gate superseded (HEAD reviewed 1361ef23)

The earlier six-cargo fallback is no longer the default source-world path. SH-05 published the original local scene loader and sampled rigs in `e79bf696`/`a30a5755`: the allowlisted `scenePackage` goes through `prepareNativeScene`, matching private images, `replaceNativeWorld` and `drawNativeWorld`. The selected scene now reports `NATIVE_ORIGINAL_GEOMETRY_WEB_GAMEPLAY` with its identity in `nativeScene.source`. The counts below describe the historical Containers checkpoint, not the current Dojo selection; do not require six indexed cargo draws or the obsolete scene-specific mode.

**Source-side visual scale of progress, not pixel fidelity:** SH-05/SH-15 documented a real Chromium local smoke with **68 indexed meshes, 360 source world instances, 17 textures, 185,037 source world triangle submissions**, an original source pistol and GPU-skinned character. Against the older six-cargo *candidate* budget (6 draws, 9,276 triangles), the full source-world path proposes **175,761 additional triangle submissions** and many more objects, but counts are from different render paths and do **not** measure visible pixels, visibility/occlusion, frame timing, or native draw equivalence. SH-15 separately documented four *isolated character* MCD-vs-Web views, 960×540, silhouette IoU **0.9554–0.9615**, center offsets **0.63–0.81 px** and masked mean normalized RGB difference **0.0940–0.1022**. Those are **not gameplay Containers native-frame pairs**, not an improvement attributable to the Red Crystal merge #136, and not a claim of 1:1. SH-14 proved the default red-only shader input to #136 yields the same ideal RGB as the prior Web compositor, so do not credit the merge as visual progress without post-change measurements.

### Reusable SH-16 gate and exact SH-05 hookup (reserved code only)

```js
import { summarizePreparedNativeWorld, assessNativeWorldBrowserFrame, auditNativeWorldStaticWiring }
  from './scripts/integration-native-world.mjs';

// Optional **local-only** CPU contract: pass the actual prepared private package.
// Nothing is uploaded or serialized from this helper.
const expected = summarizePreparedNativeWorld(preparedNativeScene);

// On the owner-local real Chromium page after a completed render:
const captured = assessNativeWorldBrowserFrame({
  metrics: window.__superhotSceneMetrics,
  frame: window.__superhotGetRenderedFrameSnapshot(),
  sourceBudget: expected, // optional: rejects silent source→Web count mismatches
});
// The helper never exports screenshots, original assets, or raw native data.
```

Run `node --test tests/integration-native-world.test.mjs` or `node scripts/integration-native-world.mjs`. The static audit checks the real import chain and renderer declarations; the frame assessor requires **same-rendered-frame world drawCalls/triangles** and a source-count match if the independent local prepared budget is supplied. A green Node test does not imply the owner browser actually rendered. It labels `frame.nativeEnemy` precisely as the **last** skinned character draw; the array of all enemy positions is only asynchronous app telemetry. It cannot infer that all actors were drawn or that a Web collision was native MCD damage.

### Next P0 blockers by owner; no speculative new PRs

- **SH-05 and SH-04/11:** verify the newly source-joined **GO379 → Mesh7:34, GO392 → Mesh6:25** raised flat surfaces and their colliders in the actual private scene package. SH-04 private #115/#116/#118 inspected `result.json`; the public metadata only proves *serialized* renderer/collider pairing, 12 triangles each, not runtime floor/PhysX. `LevelFloor` GO389 was only a Transform marker; the large PlayerKillerTrigger is not a floor. Beware fallback coordinates reflect Z while `native-scene-local.js` reflects X; do not copy centers between conventions without conversion. Avoid duplicate rendered solids: the private world package may already include these instances.
- **SH-05 / SH-10 / SH-03:** current nativeScene branch binds source AABB colliders and authored spawn/target anchors, but encounter timing and bullet hits are Web substitutes. Real native Bullet.FixedUpdate ordering, attack/damage, enemy AI, collision layers and progression have not been replayed in this scene. Use one measured browser scenario (move to native ramp/raised surface → meet source-rig actor → fire → impact → actor transition) and record the actual frame/pose/contacts, not merely another static import contract.
- **SH-14:** current `drawNativeSkin(actorMatrix,clip,time)` is connected with source pose samples; telemetry keeps only the last actor's draw. Source-sampled idle/walk/hit ≠ native Animator AI decisions. Capture actor-specific time/pose and material inputs in private comparison without touching shared SH-05 files.
- **SH-15 / SH-13:** `requireContainersWebEvidence` now accepts the full native-world mode and same-rendered-frame world counters; follow its 1920×1080 DPR1 workflow, keep the local bitmap private, and pair it with a **native running Containers** frame, active camera, projection and world state. Generic Web illumination, shader globals, lightmaps/UV2 and material parity remain unresolved. No valid full-world native/Web pixel delta yet.

**Private artifacts reused (no new corpus query):** existing #8, #9, #10, #11, #12, #13, #14, #15, as documented in #72. This cycle directly opened all eight `result.json` archives. #10 is a five-row untruncated `query` result; #8 is a bounded 120-line `read` with next-page cursor 121, NOT the entire combat document or an executed native trace. #13 is a 97-line `read` of TimeControl; #15 is a 110-line camera-spec `read`. All source text/JSON/bytes remain private; no original asset has been copied to public Git. **No new native execution or visual capture in this SH-16 cycle.**

**Ownership:** this PR updates only `scripts/integration-*.mjs`, `tests/integration-*.test.mjs`, and this documentation. It does not change `src/main.js`, `src/renderer.js`, `src/levels.js`, GitHub main, private files, or the runner; SH-05 must review and merge.


## SH-16 P0 elevated-platform draw/contact/viewport gate (2 November 2026, follow-up)

The previous source-world code gate is not a paired GPU/native test. SH-04's
**existing** private read-only `result.json` artifacts were re-opened by SH-16,
without a new corpus request:

- Research **#115**, artifact `13149983876`, JSON SHA256 `ad3f216eb9ebf422986034110ffff86c6d0a8a106bd1b17fed35bc00cec38683`: two serialized BoxColliders, enabled, not triggers.
- **#116**, artifact `13151525587`, JSON SHA256 `702ca376fda521405ad9f28ad7ebf91ef082f56a45454a6932e8fc3657942b10`: source GO379 / GO392 renderer and mesh links.
- **#118**, artifact `13151330697`, JSON SHA256 `833a8422b8088a12bc6121bbc62cdff7adf625f124d81928b3a44055de34c2fa`: exactly **36 indices / 12 triangles per elevated source submesh**. These are **serialized source facts**, not proof of runtime visibility or PhysX contact.

The exact known source-reference tuples are GO379 → Mesh7 submesh34 → BoxCollider15807 and GO392 → Mesh6 submesh25 → BoxCollider15811. Their shared parent does **not** establish the main ground plane; GO389 `LevelFloor` remains marker-only, and `PlayerKillerTrigger` must not be treated as traversable floor. The browser's owner-private source package uses an **X-reflection**, whereas SH-04's five public generated boxes are pre-**Z-reflected**. Never transfer position/rotation from one convention to the other without re-evaluating the actual source transform.

### Runnable, privacy-preserving SH-05 source/world visibility assay

```js
import { assessNativeElevatedPlatformBindings } from './scripts/integration-native-world.mjs';

// Input obtained IN THE OWNER'S LOCAL BROWSER after prepareNativeScene().
// Selectors must be determined from source-qualified local instance/collider
// provenance — never guessed from names, collider proximity or list order.
const report = assessNativeElevatedPlatformBindings({
  prepared: preparedNativeScene,
  bindings: [
    { goPathId: 379, instanceId: actualGo379PreparedInstanceId,
      colliderId: actualCollider15807PreparedId },
    { goPathId: 392, instanceId: actualGo392PreparedInstanceId,
      colliderId: actualCollider15811PreparedId },
  ],
  frame: window.__superhotGetRenderedFrameSnapshot(),
  viewport: { width: sceneCanvas.width, height: sceneCanvas.height },
});
```

The report differentiates **(a)** missing or world-pass-ineligible instance;
**(b)** absent or trigger-only collision surface; **(c)** wrong indexed submesh
range/triangle count; **(d)** a prepared source draw + collider candidate.
Direct native path-ID checks require those IDs to be explicitly carried in
`instance.source.goPathId`, `mesh.source.pathId`, `collider.pathId`,
`collider.goPathId` by the **owner-local** source package. If any are missing,
the status stays `PREPARED_WORLD_RANGE_AND_COLLIDER_LINKED_SOURCE_IDS_UNATTESTED`
even if the owner supplies two seemingly correct IDs. SH-05/SH-04 should close
that actual metadata gap rather than claiming identity from array positions.

Where the current **completed Web** frame carries a valid
`projection.viewProjection`, the check projects all eight corners of the
actual decoded `collider.worldAabb` into a **viewport pixel ROI**, with
`viewportCoverageUpperBound`. This is only the clipped screen rectangle of a
Web **collider**, not the rasterized surface, a measured screenshot silhouette
or a matched original-MCD pixel difference. If any corner crosses the near
plane, the ROI is intentionally `AABB_CROSSES_NEAR_PLANE_OR_BEHIND_CAMERA`;
far-clipped AABBs are rejected with `AABB_CROSSES_FAR_PLANE_ROI_UNRELIABLE`
and a viewport whose aspect differs from the completed frame's projection is
rejected with `WEB_FRAME_PROJECTION_VIEWPORT_ASPECT_MISMATCH`, rather than
reporting a misleading screen rectangle. No source files, screenshots,
raw mesh data or private inspector output are written by the helper.

Run `node --test tests/integration-native-world.test.mjs`. The fixture uses
synthetic world packets; it proves the gate contract, **not** that GO379/GO392
are in the owner-local package. SH-05's actual next acceptance gate remains:
lookup both identities from the already decoded local package → verify the
two 12-triangle GPU draw *submissions*, non-trigger source collider and
non-duplicated walking contacts → capture the corresponding browser pixel ROI
with SH-15's same-frame WebGL2 readback → pair a genuinely active native MCD
Containers frame at the same camera, material/lighting and state. A valid
`sourceWorldPassCandidateDraws=2` is not proof either platform was visible
in the original game. SH-05 exclusively wires the shared runtime and handles
PR merging. Until native paired frames exist, the 1:1 claim is **UNASSESSED**.


## SH-16 P0: source-inactive collider → invisible Web wall candidate (2 Nov 2026)

**Collider membership after the Dojo integration:** `prepareNativeScene()` retains
the supplied collider roster separately from drawable-instance classification.
`main.js:loadLevel()` admits only non-trigger colliders with both
`initial.enabled` and `initial.activeInHierarchy`. The diagnostic mirrors that
population before comparing it with independently qualified source states.
It must not report a disabled collider as an invisible Web wall when that collider
was already excluded by the runtime. Prepared/source disagreement remains a
candidate discrepancy, not an observed native PhysX contact. The elevated
Containers references remain scene-specific and do not qualify Dojo geometry.

### Owner-local read-only SH-05 gate (no private metadata or asset published)

```js
import { assessPreparedColliderActivation }
  from './scripts/integration-native-world.mjs';

// Owner privately joins collider.id to the serialized component and owner
// GameObject active-in-hierarchy flags. Do NOT infer from names/positions.
// Qualified example shape only; values MUST come from the owner's source:
const qualifiedSourceStates = new Map([
  [actualColliderId, { componentEnabled: actualSourceEnabledBoolean,
    hierarchyActive: actualSourceActiveInHierarchyBoolean }],
]);
const report = assessPreparedColliderActivation({
  prepared: preparedNativeScene, qualifiedSourceStates,
});
// Compare webNonTriggerSolids vs sourceQualifiedActiveSolids,
// sourceQualifiedInactiveSolidsStillInWeb and sourceActivationUnknownWebSolids.
```

The helper mirrors the current non-trigger, component-enabled, hierarchy-active membership, never modifies
scene/collision arrays, never emits original source bytes, and refuses missing or
non-boolean state as qualified evidence. Any source state not provided remains
UNKNOWN. A positive `sourceQualifiedInactiveSolidsStillInWeb` is a concrete
candidate for SH-05 to resolve **in SH-05-owned runtime code** by source-gating
collision membership *only after* metadata and actual browser contact are
verified; it is not an instruction to globally disable all AABBs or invent PhysX
filters. Even a fully matched serialized-activation roster does not establish
native collision layers/contacts. Test with a single player walk and a shot
across the same candidate collider, recording Web contact and native replay
separately before claiming a real bug fix.

**Independent gameplay blocker after source binding:** the Web entrypoint
still calls `closestImpact()` with provisional spheres and then immediately
`killEnemy()` on `impact.type==='enemy'`. SH-03's bounded source guard
planner in unmerged PR #152 requires verified `PejAiBodyPart`, controller
GetInstanceID (not `parentWeaponId`), armor/bulletproof/boss/pierce flags,
native per-FixedUpdate ordered contacts and post-handler bullet destruction.
Do **not** wire a sphere hit directly into `enemy-body-kill-request`;
SH-05 must first obtain one real owner-local collider/controller link and
measure a browser shot→reaction against original gameplay. This step
prioritizes a visible/interactive discrepancy over more immutability checks.

**Explicit next visual acceptance:** owner-local Containers package and
active scene/camera → a real browser render with platform ROI and actor →
actual guarded bullet contact + action → paired original MCD frame at
the same active pose/time/material state. None of those native-vs-Web
paired gameplay pixels or native PhysX contacts was observed by SH-16.


## 2026-11-02 SH-16 P0 — observable scene → actor → Web shot/death trace (no native contact claim)

The browser currently exposes one world-frame snapshot through `window.__superhotGetRenderedFrameSnapshot()` and a separate **~1 Hz asynchronous** metrics object `window.__superhotSceneMetrics`. Both can be captured owner-locally; neither contains exact `Bullet.FixedUpdate` contacts or an original MCD game frame. The first exposes `frameId`, `worldClock`, `nativeScene`, `generatedManifest`, last rendered `nativeEnemy`, and `gameplay.nativeClock/ammo/weapon`; the second exposes coarse `enemies[].alive` without collision identity. The `nativeEnemy` packet is only the **last** actor drawn. Neither tells us which body part an individual bullet hit.

New offline integration API (SH-16 only):
```js
import {
  summarizePreparedNativeWorld, assessNativeWorldEncounterTrace,
} from './scripts/integration-native-world.mjs';

const sourceBudget = summarizePreparedNativeWorld(preparedNativeScene); // actual local package
const samples = []; // collect at least two samples from the SAME active browser scene
// At capture-time, after each rendered frame; no automatic cloud upload:
// samples.push({
//   frame: window.__superhotGetRenderedFrameSnapshot(),
//   metrics: structuredClone(window.__superhotSceneMetrics),
// });
const report = assessNativeWorldEncounterTrace({ samples, sourceBudget });
```

The report requires the **exact locally prepared scene draw budget** (never a hardcoded 68 meshes / 360 instances), validates the source-world mode and app's self-reported draw counters **for each sample**, rejects resets/scene drift and non-monotonic frame/world clocks, checks that at least one *last drawn* skinned actor appeared, and separates a one-round ammunition decrease from a delayed `enemies[].alive: true→false` transition. The strongest accepted status is **`WEB_WORLD_ACTOR_AMMO_AND_ASYNC_DEFEAT_SEQUENCE_ONLY`**: a **candidate app sequence**. It can never certify that a shot caused that death, which subobject was hit, that the animation corresponds to the hit, or anything about native PhysX/material/parity. Neither a test fixture nor `browserMeasured=true` attests independent GPU pixels.

**Concrete SH-05 wiring contract, owned files only:** To establish genuine contact causality, the runtime must eventually emit an ordered, same-frame/per-tick, uniquely identified receipt for `shotId→hit.collider/source instance→PejAiBodyPart→controller state→guard decision→resulting actual effect→actor pose`, with post-handler projectile destruction and separate animation/event identity. Do **not** fill missing values with the current `closestImpact` two-sphere Web target; its unconditional `killEnemy` is provisional. SH-03's [#152](https://github.com/TGrozner/superhot-web/pull/152) independently offers source-bounded armor/bulletproof/boss/owner/planner requests but **not** an executed contact or a native-to-Web collider binding. SH-03 [#153](https://github.com/TGrozner/superhot-web/pull/153) also plans AI line-of-sight independently; no source Settings/PhysX cast in Containers has yet been measured. SH-05 alone may import either after reviewing exact HEAD CI, integrating components and instrumenting actual scene contacts.

**Visualization gate remains SH-15:** Use the private same-state Containers *executed* native screenshot + Web GPU readback, matched active projection/viewport and source-identity region masks, then SH-15's visual-region-scorecard. The latest published source report on `docs/parity/visual.md` concerns **six isolated actor pairs** (IoU 0.99172–0.99880; normalized RGB MAE 0.07162–0.08074), *not a full environment/gameplay comparison*. No new matched full Containers pixels were measured in this SH-16 cycle; actor sequence tests add **zero independently measured pixel improvement**.

**Privacy and source reuse:** Existing private research #8–#15 `result.json` archives were reopened, JSON-validated and SHA256-checked locally without new corpus queries. None of the originals, binaries, OBJ data, images or native source excerpts is included in public files. No SH-05 or SH-15 reserved file is modified.

**Run** `node --test tests/integration-native-world.test.mjs` as a local unit gate, then require GitHub Actions `npm run check` on the exact PR HEAD; this is not a browser/GPU/native test.


## SH-16 P0 (2026-11-02): prevent a Dojo scene from satisfying the Containers gate

**Concrete cross-lane regression risk identified by reading current code, NOT by running a browser:** the homepage now selects owner-local **Dojo/build10** (`SHRL_Dojo2`), while `Containers/build28` remains the original SH-16 acceptance target. The app's `NATIVE_ORIGINAL_GEOMETRY_WEB_GAMEPLAY` mode and the previous `assessNativeWorldEncounterTrace` only checked mesh/instance/texture counts across samples. They did **not** check `nativeScene.source` at all: a Dojo package with matching geometry counts could falsely satisfy a report described as a Containers encounter. No pixel measurement can fix incorrect scene registration.

The new independently testable `assessContainersBuild28VerticalEvidence` is **fail-closed** and deliberately not wired into `src/main.js`. To run it on the owner's machine (no native bytes leave the PC):

```js
import {
  assessContainersBuild28VerticalEvidence, CONTAINERS_BUILD28_SERIALIZED_SOURCE,
} from './scripts/integration-native-world.mjs';

// Authoritative serialized scene metadata, NOT an active Unity camera/frame.
// This constant comes from the independent existing private research #16
// scenes table (one row, truncated=false), not from a Web metrics snapshot.
const expectedSource = CONTAINERS_BUILD28_SERIALIZED_SOURCE;
// { sceneBuildIndex: 28,
//   scenePath: 'Assets/Scenes/SHRL/SHRL_ContainerPort/SHRL_ContainerPort.unity',
//   serializedOwner: 'level28' }
const report = assessContainersBuild28VerticalEvidence({
  expectedSource,
  prepared: prepareNativeScene(ownerLocalPrivatePackage),
  samples: [
    { frame: completedFrameA, metrics: copiedAsyncMetricsA },
    { frame: completedFrameB, metrics: copiedAsyncMetricsB },
  ],
});
```

The scene identity is now **anchored to the actual primary serialized record**, not merely a caller-supplied object that says build28. SH-04 independently reopened existing private research [#16](https://github.com/TGrozner/superhot-research/issues/16), run `41430065967` artifact `13132978778`; SH-16 reopened its real `result.json` in this cycle, verified SHA-256 `bdbb4dbbef1a6984ede68c11443c77c40d12695d818a379d5f0efcfb9a3f9b8e`, confirmed one `scenes` row and `truncated:false`. The exact tuple is `(28, Assets/Scenes/SHRL/SHRL_ContainerPort/SHRL_ContainerPort.unity, level28)`. The check rejects alternative build28 paths or owners **even if prepared package, rendered snapshots and metrics all repeat the same fabricated tuple**. This is static source-scene provenance, NOT proof that the owner's game executed Containers, nor a privacy-sensitive model or native binary asset.

It checks source tuple `(sceneBuildIndex,scenePath,serializedOwner)` **exactly** against `prepared.source`, each same-rendered-frame `frame.nativeScene.source`, and independently against each **asynchronous** `metrics.nativeScene.source`. Wrong build10, mismatched private package, changed scene with identical draw counts, missing provenance and stale ~1 Hz telemetry all fail with distinct statuses. Only after these checks does it reuse the exact source draw-budget/actor/ammunition/async defeat gate. Positive status `CONTAINERS_BUILD28_WEB_SCENE_ACTOR_AND_ASYNC_ENCOUNTER_ONLY` **still does not prove** a same-projectile body-part hit, executed native PhysX, AI, shader fidelity or matched pixels. The results always set `nativeExecutionObserved=false`, `matchedNativeGameplayPixels=false`, `measuredVisualDelta=null` and `nativeParityVerdict='UNASSESSED'`.

**SH-05 integration dependency:** the shared runtime already publishes `frame.nativeScene.source` in `__superhotGetRenderedFrameSnapshot()` and `metrics.nativeScene.source` in `__superhotSceneMetrics`, but only the owner can select/verify the **actual** build28 local package and its independent source tuple. After source-identity pass, collect a single causal receipt
`shotId → projectileId → exact collider/GO/bodyPart → source armor/bulletproof/boss guards → post-handler result → actor pose/frameId` and pair the **executed native MCD** scene/camera/phase and WebGL2 readPixels output through SH-15. Until then, the existing Web `closestImpact → killEnemy` sphere hit and progression remain non-native. Do not auto-bind SH-03's pure gates to arbitrary Web spheres.

**SH-15 integration dependency:** report actual source scene/build index in paired manifests; reject a Dojo Web frame paired with a Containers native PNG even if camera, dimensions and mesh counts happen to agree. No new browser or original-game screenshot was produced here: full-scene visual delta is **not measured**, not zero.

**Other PRs checked this cycle (18:45 UTC):** SH-16 #127 is merged on main at `78b4f8a6`; #152, #125, #147, #143, #144, #145, #146 and #151 are also merged. SH-14 #134 and SH-13 #150 remain open with `mergeable=false`; SH-03 #153 is open and its exact HEAD requires revalidation against the now advanced main. SH-05 owns review/rebase/merge. This SH-16 PR touches only the three reserved integration files, not the runtime.

**Private primary reinspection (2026-11-02, no new corpus query):** actual `result.json` JSON was opened from existing research artifacts #8–#15 and hashed, not treated as proven merely because Actions succeeded. #8 is a partial 120-line static source read (`next_start=121`), #9 a bounded audio read, #10 an untruncated **five-row SQLite table schema** (not any world mesh/camera), #11–#12 bounded reads, #13 a 97-line TimeControl read, #14 a 75-line read and #15 a 110-line camera/time source read. None is a recorded executed Containers gameplay frame. Source text, binaries, OBJ, shaders and original captures remain private. This new public gate contains only synthetic fixture identifiers; it does not reproduce private source code.


### SH-16 follow-up, 2026-11-02 19:45 UTC — resolved source identifier, unchanged GPU parity blocker

Existing private research #8–#15 ZIP `result.json` files were **directly downloaded and parsed again**, plus #16. No new `[corpus-query]`, runner invocation or public original bytes. #10 has five `sqlite_master` table definitions (`hierarchy/objects/scenes/serialized/sources`) and **no native mesh or screenshot**. #16 independently resolves the exact Containers `scenes` triple; SHA-256 above. The actual game asset package/screenshot is not in these artifacts.

**Next owner-local cross-lane handoff, executable only by SH-05:** select the actual owner-local `scenePackage` that preserves the canonical build28/source path/owner, call `prepareNativeScene(package)`, then capture two completed playing-frame+~1Hz snapshots where both `frame.nativeScene.source` and `metrics.nativeScene.source` equal the canonical tuple and invoke `assessContainersBuild28VerticalEvidence` with `expectedSource:CONTAINERS_BUILD28_SERIALIZED_SOURCE`. A correct static tuple is the first gate; check `generatedManifest.drawCalls` against the exact prepared source budget and `nativeEnemy.skinned`, not historical hard-coded 68/360 counts. SH-04's raised platforms GO379/GO392 (serialized enabled/nontrigger) must still have their actual package instance/collider IDs joined before GPU and collision claims. SH-15's existing `captureContainersWeb` + offline saved-PNG Web manifest / source-common mask comparison owns any **real** visual delta. SH-03's combat/AI modules remain disconnected from a source-causal PhysX/bodypart hit in shared gameplay. **No new browser image, pixel delta, native runtime or player→projectile→bodypart trace was observed by SH-16 in this cycle.** SH-05 alone changes shared runtime and merges this PR.


## SH-16 P0 — owner-local Containers package preflight before browser/GPU acceptance (2026-11-02)

**Concrete selection blocker:** `server.mjs` exposes exactly one private
`scenePackage` mapping from `private/browser-assets.json` under the
`/local-assets/scenePackage` allowlist. The public entrypoint automatically
calls `loadScene()` for that mapping; its generic WebGL telemetry mode is shared
by Dojo/build10 and Containers/build28. A browser showing many meshes is **not**
evidence that Containers was selected. Previously observed owner-local Dojo is
*historical*, not a claim that SH-16 accessed today's owner's disk.

**New executable owner-local preflight** (no Windows runner or game launch):

```powershell
# Run inside TGrozner/superhot-web on the owner PC:
node scripts/integration-containers-package.mjs
# Optional, for an explicitly selected local private/ directory:
node scripts/integration-containers-package.mjs --private-dir private
```

This reads only the owner-local **allowlisted** `scenePackage` gzip JSON,
enforces the same realpath/private-root boundary as the HTTP server, bounds
compressed and decompressed size, checks the *exact independently qualified*
scene tuple from already inspected private research #16
(`28 / Assets/Scenes/SHRL/SHRL_ContainerPort/SHRL_ContainerPort.unity /
level28`), runs the actual `prepareNativeScene` source contract, and derives
the indexed mesh/triangle/collider budget via `summarizePreparedNativeWorld`.
It also checks that the private manifest has a real local enemy OBJ+rig pair
and that player collision, navigation, encounter parameters and enemy anchors
are structurally present. **Only integers, booleans, statuses, and known public
serialized-scene metadata are printed; no private paths, source JSON, OBJ,
textures, native binary, shader, rig or screenshot is emitted or uploaded.**

An exit code of **0** means
`CONTAINERS_SOURCE_INPUTS_READY_FOR_BROWSER_SMOKE_NOT_RENDERED`: purely
**local source-package readiness**, not successful Web rendering. An exit code
of **2** distinguishes missing manifest/file, wrong scene (reported build index
only), corrupt gzip, package preparation failure or missing vertical inputs.
In particular, Dojo/build10 yields
`SCENE_PACKAGE_IS_NOT_SERIALIZED_CONTAINERS_BUILD28` **without calling**
`prepareNativeScene`; a self-consistent fake build28 path also fails. There
is no fallback to invented meshes or fabricated camera poses.

**SH-05 exact handoff / next visible gate:**

1. Run the new preflight **on the owner-local package**. If it reports wrong
   scene, select the independently exported genuine Containers package via the
   private manifest. Do not rename Dojo to level28 or forge identity counters.
2. After an actual Chromium WebGL2 render, collect two fresh frame+async
   snapshots, call `assessContainersBuild28VerticalEvidence({expectedSource:
   CONTAINERS_BUILD28_SERIALIZED_SOURCE,prepared,samples})`, check geometry
   counts against this preflight's owner-local draw budget, and *save actual
   WebGL2 PNG/readPixels* through SH-15. A separate original MCD gameplay
   camera/state capture is necessary for any pixel/mask/IoU comparison.
3. For gameplay, demand a **single** causal receipt
   `projectileId→source collider/GO/bodypart→controller→armor/bulletproof/boss
   guards→actual reaction pose/frame`; bare ammo decrease, actor last-draw and
   enemy death counters remain insufficient. A source config containing fields
   is not proof the game's native callbacks ran.

**Cross-lane compatibility:** the preflight imports public
`prepareNativeScene` from SH-04/SH-11 and the existing SH-16 budget function;
it writes no SH-05-owned shared files and does not interfere with SH-15's
capture/screenshot workflow or SH-03 native planners. All tests use authored
miniature gzipped JSON and synthetic prepared objects, never private assets.

**Primary reinspection this cycle:** existing research #8–#15 workflow ZIP
archives were individually opened and their `result.json` contents parsed
(the artifact IDs recorded in #72). Research #10 contains five SQLite schema
rows only, not gameplay or a Containers world draw. Research #8 is a partial
120-line static read; #13 is a 97-line TimeControl source read, #15 a 110-line
static read. The existing research #16 `result.json` was also reopened and
SHA-256 matched
`bdbb4dbbef1a6984ede68c11443c77c40d12695d818a379d5f0efcfb9a3f9b8e`
(one untruncated serialized scene record). **No new corpus-query, native
execution, browser frame, original MCD screenshot, or pixel difference was
produced in this cycle.** The full-scene visual delta is **unmeasured**,
not zero. Source/gameplay fidelity 1:1 remains UNASSESSED.

## SH-16 — Dojo/build10 Web-only CI handoff (02 November 2026; supersedes Containers P0)

The release target is now **MCD `SHRL_Dojo2`, build index 10, serialized owner `level10`**. Containers/build28 gates remain historical opt-in diagnostics and must **not** be run as default release checks. The owner will test `main` on localhost only **after** SH-05 integration. No owner runner/Windows/WSL/Unity/Frida, corpus extraction or proprietary file is required by this change. The latest stable source of Dojo gameplay and the five **unpublished** checkpoint lots are documented in `docs/dojo-reprise.md`; do not reimplement the archived hands/HUD/death/weapons/door-lights batch here.

### Hosted-CI-capable static contract

`node scripts/integration-dojo-smoke.mjs` inspects **only checked-out public** `src/main.js`, `src/renderer.js` and `server.mjs`. It fails if the local-allowlist scene loader, source world/skin draw, collider and projectile path, native encounter, victory/restart callbacks or source-identity telemetry hooks disappear. `node --test tests/integration-dojo-smoke.test.mjs` exercises the lexical audit and 15 **synthetic** contract tests. No owner-local asset, localhost, original program or screenshot is opened. The passing status `DOJO_STATIC_WEB_INTERFACE_REACHABLE_NOT_EXECUTED` proves references and public API shape only, **not a scene or game run**.

`assessDojoWorldActorSmoke({ expectedSource, sourceBudget, samples })` is a pure, bounded companion to SH-10's `assessDojoPlaythrough` (which exclusively owns start → spawn → six/seven eliminations → victory → restart). SH-05 may pass the actual `prepared.source` and `summarizePreparedNativeWorld(prepared)` output, plus 2–32 pairs of `{ frame: window.__superhotGetRenderedFrameSnapshot(), metrics: structuredClone(window.__superhotSceneMetrics) }` **captured after real rendered frames**. This gate independently requires `build10 / SHRL_Dojo2.unity / level10` in package, frame and asynchronous metrics; rejects a Containers frame even with identical counts; checks indexed world draws/triangles against the independently prepared budget; and distinguishes source-world submission, a last-actor skinned submission, an instantiated six/seven-target encounter, and a living enemy. Do not call it with invented evidence in a release report. The CLI itself deliberately does **not** look for browser frames or private files.

**SH-05 exact hooks and routing**: keep `src/main.js`, `src/renderer.js`, `src/levels.js` exclusive to SH-05. Do not add `assessContainersBuild28VerticalEvidence` or `integration-containers-package.mjs` as a blocking Dojo release prerequisite (PR #164 is merged as an optional Containers-only diagnostic, not a Dojo P0 gate). Preserve the existing `__superhotGetRenderedFrameSnapshot` and `__superhotSceneMetrics` fields while integrating SH-10's full-playthrough trace gate. For the full-run check, use SH-10's module instead of extending this smoke to duplicate it. Let SH-15 separately record *real* GPU PNG / source gameplay comparisons, and SH-03 own attack→contact→body-part evidence. A green smoke or GitHub CI run is **not** proof of physical collisions, audible sound, native parity, GPU pixels, or a successful played game. Both `measuredVisibleDelta` and the 1:1 verdict remain unassessed until independently captured same-state Web/native images.

### Merge-train review: priority/risk at the stable Dojo cut

- #134 (SH-14) skin remap: materially useful for posed characters, but merge conflict reported and OBJ declaration index ≠ GPU face-corner order (3,012/5,237 EnemyMerged reordered); require rebasing and source-weight order validation, preserve functioning Dojo skin.
- #150 (SH-13) opaque GL depth/blend: potentially visible in Dojo Concrete/Crystal, but merge conflict and **no exact-head CI** found; do not silently apply Containers-only shader assumptions to Dojo.
- #164 (SH-16) private **Containers-only** preflight: **already merged by SH-05**; preserve only as an explicitly invoked Containers diagnostic. Its deliberate Dojo rejection must never be a default Dojo acceptance or release gate.
- #165 (SH-06), merged: punch timing source-backed request-only, no native active strike/contact or player view demonstrated; keep collision/animation wiring with SH-05, not an automatic Dojo visible improvement.
- #166 (SH-01) CameraAngle world quaternion: Containers-static only; not evidence that Dojo's active camera invokes that producer. Its documentation does not block current Dojo playability.

**Outstanding actual acceptance:** public Node/static checks cannot certify a complete Dojo victory, real body hit, actual GPU images or matched MCD pixels. SH-05 must explicitly preserve the stable Dojo baseline and choose merge order; Thomas alone performs the final owner-local test.
