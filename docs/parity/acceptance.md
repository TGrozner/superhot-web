# SH-10 — MCD acceptance matrix (source-qualified, not 1:1)

## P0 UPDATE — full source Containers now on main (SH-05 a30a575, 2026-11-02)

**This section supersedes the fallback-only 6-cargo gate immediately below for the
current homepage.** SH-05 has now actually connected a private, locally loaded
build28 scene package: **68 meshes / 360 world instances / 17 textures**,
a source pistol and GPU skinned EnemyMerged/Headless clips. Its read-only
browser reports `mode=CONTAINERS_ORIGINAL_GEOMETRY_WEB_GAMEPLAY`,
`generatedManifest.nativeGeometry=true`, nonzero world
`drawCalls/triangles`, and `nativeMaterialParity=false`. This is
**SOURCE GEOMETRY IN WEB**, not the executed original's camera, spawner,
PhysX, weapon timing, material or scene state. Existing
`localMeshDrawEvidence` applies **only to the old fallback route**; do
not reject the original-scene mode for failing its six-cargo counters.

**Actual browser capture gate (manual, outside CI):**

```bash
# In an owner-local environment already running npm start with its PRIVATE
# loopback browser-assets.json allowlist and the complete scene package:
node scripts/acceptance-live-capture.mjs --capture-web \
  --url http://127.0.0.1:4173/ --out /tmp/sh10-source-scene \
  --require-original-scene --require-enemy
```

The gate waits for actual browser telemetry and requires **at least**
68/360/17 source scene counts; a real world indexed draw/triangle
submission, positive measured frame timing and an app draw counter
consistent with the world pass; explicit material/light parity=false.
With `--require-enemy`, it requires source-qualified
`sharedassets0.assets:284/2254` or `:285/2132`, a nonzero skinned
Web draw and the explicit native-spawn-UNVERIFIED flag. These checks
run again **before both** PNG captures to reject a partly loaded scene.
The gate also inspects the **last completed rendered-frame snapshot both
before and after each CDP screenshot**, independently of 1-second metrics:
68/360/17 source counts, nonzero world pass, finite camera and actual
projection (vertical scale/near/far/aspect), plus the GPU skinned-enemy
submission if requested. The PNG stores the bracketed frame IDs, cameras,
projections and bounded scene counts; the screenshot is **not** claimed to
correspond to a single native MCD frame.
The normal capture then saves two actual Chromium PNGs (idle, after
KeyW), SHA-256, camera poses and render-frame brackets, and a Web-only
pixel-change metric. The gate never calls the MCD executable, and
app-reported draws **do not** independently verify GPU output. Do not
publish private PNGs or native bytes.

**Measured evidence vs missing evidence:** SH-05 reports having already
exercised the whole local scene in actual Chromium, without GL errors
(see issue #5, main `a30a575`), but **SH-10 has not executed this new
capture gate in a browser**. SH-15 documents a separate, PRIVATE
native/Web four-pose *isolated character* comparison at 960×540:
silhouette IoU 0.9554–0.9615, center delta 0.63–0.81 px, normalized
RGB delta 0.0940–0.1022. That comparison is **not** a matched
Containers gameplay frame and not a 1:1 certificate. It must not be
silently substituted for a full-scene reference.

**Three VISIBLE convergence criteria for SH-05:** (1) independently
match active native Containers scene/frame/pose/FOV/viewport and Web
rendered-frame camera (SH-04/05/15); (2) pair private native/Web
**actual PNGs** with identical player/enemy/weapon pose, evaluate
missing instances, centroids and silhouette IoU, report uncertainty
(SH-05/14/15); (3) quantify RGB/luminance, lightmaps/tonemapping and
**time evolution** after the same stimulus with justified thresholds,
sample-phase and timeScale (SH-01/02/03/05/13/15). Without that pair,
native-vs-Web visual status remains **INCONNU**, not REJECTED.
R=replay, Containers physical 120 vs 60 initializer, time max/cap/override,
player deltaTime and projectile phases also remain provisional until
native *runtime* context is tied to the tested browser route.




## CURRENT P0 visual gate — playable Containers main after SH-05 #128 (2 November 2026)

**Supersedes the historical #98/#105 two/four-draw notes below.** The
public homepage / now starts a **playable Web fallback** for Containers, not
the native game. Five level28 source-derived collider AABBs connect to a Web
solver; locally selected source-converted cargo produces **six** indexed
submissions from **two** source files: Mesh6 group47 ×3 placements and Mesh7
three independent ranges (48/46/77), for **9,276** submitted source-derived
triangles. This is not an authentic native frame, shader, collision or pose.
Authenticated local EnemyMerged pathID284 (2,254 triangles) or Headless
pathID285 (2,132) can appear as **one static shootable Web fallback**; this
does NOT verify an MCD spawn, rig, skin, AI, material or animation.

**Manual Chromium/WebGL2 gate, NOT standard CI:** with the original files
already available through the owner's private loopback allowlist:

    node scripts/acceptance-live-capture.mjs --capture-web \
      --url http://127.0.0.1:4173/ \
      --out /tmp/sh10-containers-capture \
      --require-enemy

Or select all three authorized local private exports via CDP (no upload):

    node scripts/acceptance-live-capture.mjs --capture-web \
      --url http://127.0.0.1:4173/ \
      --out /tmp/sh10-containers-capture \
      --mesh6 /private/Mesh6.obj.gz --mesh7 /private/Mesh7.obj.gz \
      --enemy /private/EnemyMerged.obj.gz --enemy-variant merged

The Web-evidence gate requires the exact main #128 mode
CONTAINERS_SOURCE_GEOMETRY_WEB_GAMEPLAY_FALLBACK_NOT_MCD,
activeScreen=playing, browserMeasured=true and matchedNativeScene=false.
It requires two local cargo source groups and the app's reported
sourceQualifiedMesh6DrawPackets=3, verifiedLocalMesh7RangeDraws=3,
privateIndexedDraws=6, convertedTrianglesDrawn=9276, five connected
Web fallback collider AABBs, sampled positive p95 frame duration and at
least six app-reported WebGL2 draws. hiddenByPrivateMesh is recorded
but its value depends on camera culling; **zero is allowed**.

With --enemy or --require-enemy, the gate additionally needs exact
source owner/path/triangle evidence (sharedassets0.assets:284/2254 or
:285/2132), at least one app-reported indexed enemy draw, shootable
Web fallback and explicit false flags for native enemy spawn and
skin parity. All counters are app reports, NOT independent GPU readback.

The saved CDP PNGs are genuine **browser screenshot pixels** when actually
run. Two render-frame IDs bracket each screenshot using main's read-only
__superhotGetRenderedFrameSnapshot hook; it verifies a NEW rendered frame
after a bounded 300 ms KeyW stimulus. Bracketing does **not** identify one
exact original/native frame or prove scene/camera equivalence.
The optional __sh10AcceptanceSnapshot hook is still not a substitute for
a source-qualified **active native** scene, frame, time scale or camera.
Original-vs-Web comparison remains **INCONNU** until the paired original
PNG/pose/stimulus/frame-phase and operator thresholds exist privately.

### Three first VISIBLE convergence criteria and owners

| Priority | Current Web proof and gap | Native qualification | Owner/convergence |
| --- | --- | --- | --- |
| **P0.1 scene/camera** | Default Web Containers fallback, rendered Web frameId/pose and source-converted colliders, but no active native scene/FOV/spawn/pose pairing. | HANDOFF build28 binding is a report, not an original frame trace. | SH-04 + SH-05: align actual scene instance, camera position, yaw/pitch/FOV, viewport, initial state and frame phase; SH-15 independently captures. **NON-COMPARABLE** now. |
| **P0.2 shape/position** | Six cargo indexed submissions, and one local original static enemy if loaded; no authenticated original counterpart. | Mesh/owner/path exports are source-qualified; native runtime visibility, skin/pose and pixel bounds are not. | SH-05 + SH-14/15: two actual Web PNGs with cargo+enemy and two legitimate private MCD PNGs from the identical angle/scene/stimulus; compare missing objects, centroids (px) and contour F1. **INCONNU** now. |
| **P0.3 light/color/time** | Web material/light plus timed KeyW frame brackets, but native shader, exposure and time domain not matched. | Concrete source Point/Repeat sampler, Containers 120 denominator and time reports are not observed original GPU/runtime frames. | SH-13/15 + SH-01/02/03 + SH-05: same source material, two-frame delta, ROI chroma/luminance and time-domain agreement, with operator thresholds based on original samples. **INCONNU** now. |

The existing five cases R=Replay (profile) vs Web reload, Containers
physics denominator 120 vs 60 class initializer, max/cap/override time,
player Time.deltaTime and Update/FixedUpdate/LateUpdate projectiles
remain explicitly **PROVISIONAL**. No disagreement with a secondary
handoff is a measured refutation of original MCD runtime behavior.
The deliberately nonzero manual acceptance-report --gate stays **OUT OF CI**.

**Execution status:** new fixtures for updated counters were exercised in
an isolated V8 check, not a Chromium session. No genuine Web game screenshot
or paired MCD original capture was executed here; earlier local Chromium
navigation was denied by ERR_BLOCKED_BY_ADMINISTRATOR. Do not report 1:1
or a quantitative original pixel verdict from these fixtures.

---


Target: **SUPERHOT: MIND CONTROL DELETE** (Steam AppID 690040, build 20299547,
Unity 2018.4.14f1), **not** the original SUPERHOT. Source of the currently
recoverable native summary: PRIVATE TGrozner/superhot-research issue #2,
workflow 41424396779, artifact 13131037087, HANDOFF.md, retrieved text
SHA-256 6acfa468377373c1c3118e3eee599b115a2105bd01f6845bc18d745986d8bea3.
Assembly-CSharp SHA-256:
ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257.

**Evidence boundary:** the downloaded handoff is a *secondary research report*,
not a native code body, an active-scene observation, or a measured original-game
trace. Primary public SH-01 evidence independently covers only the
TimeControl.fixedTimestepDenominator **field initializer 60**, not the value of
an active Containers component. HANDOFF.md reports **120** for the Containers
instance, but that scene binding and runtime assignment have not been independently
reviewed by SH-10. At the original #74 cut, the Web exposed three generated levels. SH-05 #128
has since connected a playable Containers Web fallback, NOT native parity. Zero paired native/Web runtime measurements
are currently available. No proprietary assets, code excerpts, or original
game binaries are included in this harness.

## Run without lying to CI

    node scripts/acceptance-report.mjs
    node --test tests/acceptance-mcd-handoff.test.mjs

The first command emits deterministic JSON based on **actual Web module calls**
and checks anchored in the current browser entry-point source. It carries SHA-256
hashes of all inspected public Web files. It does **not** start a browser, run MCD,
or pretend that an imported pure helper has already been connected to the browser.
The standard Node tests assert correct reporting, source/reporter boundaries and
numeric Web probes; they are intended to stay green.

**Manual gate only (expected nonzero while native parity is not proven):**

    node scripts/acceptance-report.mjs --gate

This opt-in command reports the same JSON and exits 2 when any acceptance
scenario is unresolved. Do not call this gate from npm test or Actions until
source owners have connected and validated corresponding runtime paths.
A green normal test run is NOT a successful native comparison. A future
agreement with the secondary handoff is still
REPORTED_AGREEMENT_UNVERIFIED, not certified parity.

## Prioritized matrix

| ID | What the Web source/module demonstrably does | Native HANDOFF claim (not runtime-certified) | Current evaluation | Responsible |
| --- | --- | --- | --- | --- |
| MCD-ACCEPT-01-KEY-R | KeyR yields reload in src/input.js; the actual src/main.js handler calls reload, whose timer fills the 6-round magazine. | Recovered keyboard profile maps R to Replay; KillReloadMod adjusts delays/animations, not ammo. | REPORTED_CONFLICT if both source anchors still match; source unresolved otherwise. | SH-02 input contract; SH-05 browser wiring; SH-03 ammo behavior |
| MCD-ACCEPT-02-CONTAINERS-FIXED-STEP | A variable requestAnimationFrame delta drives the Web update; a 100ms stall is clipped to 50ms by the pure frame helper. | Containers RUN_LEVEL_6C / SHRL_ContainerPort / build28 binds denominator 120 (8.333…ms), unlike class initializer 60 (16.666…ms). | SCENE_UNMATCHED, not a direct numeric disagreement between two versions of Containers. | SH-01 native binding; SH-05 integration |
| MCD-ACCEPT-03-TIME-MAX-CAP-OVERRIDE | Web uses a max contribution plus smoothing. The Web target helper ignores injected cap/forced fields; pure pause freezes clocks but leaves current scale unchanged. | Maximum of shifter contributions, clamp, then forced override; zero pause is not raised to a positive minimum. | REPORTED_CAPABILITY_GAP; exact native values/branches remain unknown. | SH-01 native method; SH-02 time mechanics |
| MCD-ACCEPT-04-PLAYER-SCALED-DELTA | src/main.js moves the player with real dt, while world simulation advances with worldDt=dt*timeScale. A matched one-frame Web probe records both possible displacements in **Web units**, not native meters. | Active movement reportedly uses Unity Time.deltaTime and an AsymmetricSmoothLinearInstantTimeShifter binding. | REPORTED_CONFLICT for time domain only; native movement speed, collisions and scene not matched. | SH-02 movement; SH-05 browser |
| MCD-ACCEPT-05-PROJECTILE-PHASES | src/main.js updates enemy AI and projectile movement/collision in a single RAF update; src/combat/projectiles.js is an independent one-step helper and **not connected** to main. | Movement in Update, some sweeps in FixedUpdate, delayed AI firing after LateUpdate pose adjustment. | REPORTED_PHASE_GAP, not verified event-by-event ordering. | SH-03 combat/IA; SH-05 scheduler |

The report checks whether its specific src/main.js source anchors are still
present. A missing anchor yields WEB_SOURCE_UNRESOLVED; that is not an automatic
fix or native agreement. Source anchors establish which functions are *written*
into the current browser entry point, **not** that a browser interaction or native
run was observed.

## Reproducible acceptance stimuli and convergence gates

**ACCEPT-01 (P0, input):** In a matched active keyboard/mouse profile, start
with fewer than the full number of rounds, press R once, record dispatched action,
magazine, reload timer and replay/run transition. Convergence requires native
input-dispatch proof, active profile binding and a Web browser trace with equivalent
initial state. A verified native R-to-reload dispatch or magazine-filling
KillReloadMod refutes the handoff claim; a Web helper returning replay by itself
does not prove the browser path.

**ACCEPT-02 (P1, scene/physics):** Link native RUN_LEVEL_6C to the active
build28 Containers object and TimeControl component by (owner,path_id); inspect
serialized denominator, subsequent writes and the actual fixed tick stream.
Quantitative target **only if the native binding is confirmed**: 1/120 second
per fixed interval; the 1/60 initializer is not an active-scene measurement.
Do not compare that to a 50ms browser RAF cap as if both measured the same
quantity. SH-05 first needs a scene and fixed-step scheduler match.

**ACCEPT-03 (P0, time):** Use at least idle, movement, view activity, shot,
forced override above/below cap and paused-zero transitions with identical
time-shifter inputs. Record contributions, maximum, clamp, override, final
Time.timeScale, Time.deltaTime and fixed timestep separately at phase-stamped
points. A native method that overrides *before* clamping or clamps pause zero
would refute the reported order. An arbitrary Web rules injection is **only a
capability probe**, not an original MCD numerical target.

**ACCEPT-04 (P0, movement):** Record identical directional input across two
known native time scales, with scene collision and camera pose controlled.
Capture actual Time.deltaTime and player displacement on each update; compare
against the independently measured Web game delta and movement trace. The
script's counterfactual movementStep(..., worldDelta) is purely illustrative:
it cannot establish native walking speed or displacement. A native active
movement body using unscaledDeltaTime would refute the report; simply changing
the Web helper call without changing src/main.js would not converge.

**ACCEPT-05 (P0, phases):** Produce a controlled projectile crossing a wall
between render and fixed ticks, plus an AI shot requiring a LateUpdate pose
adjustment. Log Update, FixedUpdate, LateUpdate and the deferred fire producer
with monotonic event ids, collisions and phase timestamps. Compare *ordering
and results*, not just final world position. SH-03 must provide the exact bound
native producers and collision/sweep rules before SH-05 modifies the shared
browser loop. A native trace with no claimed phase separation for the selected
projectile type refutes that instance-specific handoff application, not
necessarily every projectile subclass.

## Decision rules

- **WEB_SOURCE_AND_PURE_MODULE** means a public Web source anchor and a
  deterministic Node invocation, *not* live browser gameplay.
- **SECONDARY_HANDOFF_NOT_PRIMARY_RUNTIME** means an attributed native-team
  summary. It may guide an experiment but cannot yield NATIVE_PROVEN.
- **REPORTED_CONFLICT / REPORTED_CAPABILITY_GAP / REPORTED_PHASE_GAP** means
  that the authored Web behavior conflicts with or omits the reported native
  behavior; **none** means a verified contradiction of an executed MCD trace.
- **SCENE_UNMATCHED** means the original scene and Web scene are not paired.
  A visually similar room is not a scene binding.
- **WEB_SOURCE_UNRESOLVED** means source anchors no longer support a Web
  claim. Do not promote it to a native match.
- **REPORTED_AGREEMENT_UNVERIFIED** means only that a Web probe agrees with a
  handoff statement; no original runtime equivalence is certified.
- **INCONNU** applies to native methods, active instance overrides, quantitative
  traces and facts not inspected. **REFUTED** requires actual contradictory
  method/binding/observation evidence with version and context. These are
  distinct from an unchanged Web-only regression.

For every purported convergence, require the *same native build*, active
scene binding, input profile, initial state, deterministic stimulus, time-domain
and sampling phase, plus explicit native and Web trace IDs. Preserve unit labels.
Do not invent an acceptable timing/position error tolerance before the
native measurements and clock quantization are known. The 354 passing Web
tests reported on main before this lane's PR do not address those obligations.

## Ownership and private bridge

SH-10 owns only docs/parity/acceptance.md, tests/acceptance-*.test.mjs,
scripts/acceptance-*.mjs. SH-05 (issue #5) alone owns src/main.js,
src/renderer.js, src/levels.js, tests/parity-* and integrations; SH-01 handles
native time/scene evidence; SH-02 input/time/movement; SH-03 combat/scheduler.
The focused private time request already exists as superhot-research issue #6,
and combat as private issue #8. SH-10 will **not duplicate** either while
pending. New data must be read via the private gateway, not copied into this
public repository. The SH-10 owner reports prioritized deltas on public issue
#73 and forwards a brief integration handoff to public issue #5.

## P0 visual gate — actual browser vs private native capture

**Priority change, 2026-11-02:** this section supersedes Web-only
getter/immutability work as the fidelity acceptance target. PR #74's five Node
scenarios remain **PROVISIONAL**: their successful tests do not launch a
browser or confront any original-game frames.

The target is one *actually loaded* MCD Containers / build28 subsection,
then the same subsection **actually drawn by the Web runtime**. Both
observations must share a reproducible stimulus, initial state, semantic
frame/phase, scene identity, camera pose, FOV, viewport and time sampling
schedule. Native screenshots, decompiled text, meshes/materials and reports
remain exclusively in private local storage. Never commit private frames,
scene payloads, captured originals, or derived proprietary imagery.

**Three first visible SH-05 integration criteria (strict order):**

1. **Scene + camera binding:** SH-04 provides an active instance hierarchy
   with (owner,path_id) and runtime loading evidence, not a serialized asset
   inventory alone. SH-05 renders *one identifiable subsection* and exposes
   **read-only** browser telemetry for exact active scene, camera position,
   orientation, FOV, viewport and frame phase. Require explicit same-scene
   identity and coordinates before comparing pixels. The current Web scenes
   THE ATRIUM / THE CROSSING / THE GALLERY are not Containers.
2. **Position + silhouette:** capture a **real browser WebGL2 canvas
   screenshot** at a fixed stimulus and its matched private original-game
   reference, at identical resolution and aligned angle. Measure per-object
   or per-semantic-region center offset in pixels, edge/silhouette F1, number
   of mapped/visible/unmapped objects and draw calls. Report substituted,
   missing and unknown primitives separately. Edge F1 is a visual proxy, not
   proof that mesh topology is identical.
3. **Color + lighting + temporal change:** for the same region and matching
   native/Web capture pair, measure normalized chroma error, luminance
   error, and *change between two displayed frames*, with explicit
   time-scale, input and sampling phase. Record WebGL renderer, frame
   duration p95/FPS and whether software rendering was used; no guessed
   numeric tolerances or native timing values. A still image cannot certify
   TimeControl, projectiles or animation phase.

### Comparison protocol, fail-closed

The **manual/off-CI** gate must produce two Web PNG frames through a real
browser (idle then a controlled KeyW movement window), and accept a private
reference manifest only via local file paths outside the repository. The
reference needs native build/version, runtime observation ID, active scene
binding, camera telemetry, FOV, viewport, stimulus timestamps/phases and
semantic ROIs; the browser evidence needs a real WebGL2 render and observed
scene/camera telemetry (not a source-file regex). Output should be numerical
**only after** scene, pose, viewport and sampling context are matched.
Metrics are *position pixel error, shape edge F1, chroma L1, luminance delta,
temporal variation delta, camera translation/angle/FOV and frame timing
drift*. Tolerances are versioned locally and chosen after inspection of
original captures; never substitute arbitrary pass thresholds.

Missing native reference, unbound Web scene, absent runtime camera, invalid
provenance, mismatched phases or missing thresholds => **INCONNU /
NON-COMPARABLE**, and a strict gate exits nonzero. A measured mismatch
against a confirmed corresponding capture => **MEASURED_VISIBLE_GAP**;
it does not refute the native source. Even a measurement below operator
thresholds is **NOT an official 1:1 certification**. Synthetic PNGs are
allowed for parser/math unit tests only and can never satisfy the gate.
Do not add a deliberately red native-comparison gate to GitHub CI.

### Present observed blockers (not conjectural MCD gaps)

- `src/renderer.js` builds only cube and octahedron meshes and draws through
  `box`/`shard`; its shader uses scale + Euler rotation, hard-coded directional
  illumination/fog, and has no actual native mesh/material/skin/shadow pipeline.
  `src/visual/scene-plan.js` can produce affine packets but
  `src/main.js` does not import it. SH-05 alone owns renderer/level/browser
  integration; SH-04 alone owns scene-graph/visual producers.
- No browser screenshot or WebGL2 FPS/p95 from the actual public prototype
  has been validated in this lane. A sandbox Chromium attempt was
  **blocked by environment policy** (`net::ERR_BLOCKED_BY_ADMINISTRATOR`
  on localhost); this is **not** an application rendering failure.
- The private corpus gateway issued a `SUCCESS` for SH-04's schema query #10 (run 41426522641, artifact 13133542861), but **artifact contents, native scene binding and any actual MCD PNG are unreviewed by SH-10**. Reuse #10/SH-04 rather than duplicating a private query. SH-01/02/03's
  existing requests remain with their owners.

SH-10 owns this document and isolated visual-acceptance scripts/tests only.
SH-05 issue #5 must coordinate the render hookup and the private scene
handoff before anyone promotes a pixel delta from NON-COMPARABLE to
measured native-vs-Web evidence. No runtime source or original asset may be
changed as part of this gate.


## SH-10 follow-up — real Containers Web route, still NO paired native frame

**Verification 2026-11-02 (~11:20 UTC), status INCONNU/NOT CERTIFIED:**

- The statement above that the Web has *only* THE ATRIUM/THE CROSSING/THE GALLERY
  is now **stale**. Main has a real opt-in browser route
  \`?scene=containers\` (#88; SH-05), drawing SH-04 build28 **collider
  AABB proxy** shapes via WebGL2. Its label explicitly says
  \`CONTAINERS_COLLIDER_PROXY_NOT_MCD_RUNTIME\`; it does not establish
  a matched active MCD scene. Current preview clears both
  \`state.solids=[]\` and \`state.enemies=[]\`; there is no claimed native
  interaction, collision, weapon/projectile or player acceptance.
- \`window.__superhotSceneMetrics\` is **read-only browser telemetry**
  when a preview is actually running: mode, matchedNativeScene=false, p95
  frame time / FPS and draw calls. It is not an active camera pose trace.
  SH-05 needs an independent read-only camera/scene/time snapshot before
  a native/Web pixel comparison becomes admissible.
- SH-12 indexed GPU modules (#87/#93) and SH-13 serialized material/fog
  contracts (#89/#92) exist, but no proof currently shows a **native mesh**
  or original texture/shader being rendered by the main browser path.
  SH-04/SH-11 identified candidate native cargo OBJ exports in
  private corpus #59/#63, not publishable here and not a Web draw.
  Native build28 RenderSettings \`m_Fog=false\` (#41) while Web generated
  renderer fog remains on unless SH-05 deliberately wires the serialized
  fog-off uniform. Treat this as a specific **SERIALIZED-vs-WEB-source
  candidate gap**, not a measured native runtime color delta.
- SH-01's private #62 gives an **observed qualitative** native Containers
  movement after 0.35s of D and Escape pause, but does not provide
  camera XYZ/yaw/pitch/FOV, timeScale or paired pixels. No exact
  position, physics denominator or timed projectile parity follows.
  A recovered \`PlayerController\` with \`m_Enabled=0\` in serialized
  level28 (#38) specifically prevents promotion of its \`Update\` body
  to an *active-runtime* movement proof without an enable trace.
- The only verified Chromium exercise in SH-10's isolated environment
  rechecked a **locally served synthetic WebGL2 fixture**, HTTP 200,
  then CDP navigation failed with \`net::ERR_BLOCKED_BY_ADMINISTRATOR\`.
  This is a browser-environment block, **not a crash/render verdict for
  superhot-web**. A standalone PNG/diff prototype passed four synthetic
  tests; a reduced SH-10 harness is now committed on this branch in
  `scripts/acceptance-live-capture.mjs` and
  `tests/acceptance-live-capture.test.mjs` (three local synthetic tests
  passed). No actual superhot-web screenshot and **no native MCD PNG**
  were acquired or manufactured.

**Visual acceptance matrix, pending native frame pairing:**

| Criterion / owner | Web present | Native/reference present | Current honest status | Convergence condition |
| --- | --- | --- | --- | --- |
| Same scene + camera / SH-04, SH-05 | Containers AABB proxy, demo camera, no active native binding | Native build28 serialization and OBJ metadata, no matched runtime pose | **INCONNU / NON-COMPARABLE** | Active scene identity + camera position/orientation/FOV/viewport + phase from *both* executions |
| Position + silhouettes / SH-11, SH-12, SH-05 | Drawn boxes, not original meshes | Mesh metadata/private OBJ, no paired PNG | **INCONNU / NON-COMPARABLE** | Native and Web screenshot pair, ROI mapping, position px and edge-F1 scores; no proxy mislabeled as original |
| Color + light / SH-13, SH-05 | Generated color/shader/fog; contract exists but integration unverified | Serialized fog off, lighting/color at runtime unknown | **SERIALIZED SOURCE GAP; pixel delta INCONNU** | Show fog-off before/after **browser** frames first; compare to original only at matched camera/lighting |
| Time variation + playable response / SH-01, SH-02, SH-03, SH-05 | Screenshot automation ready off-repo; no executed game frame here | Qualitative D/Escape, no per-frame native trace | **INCONNU** | Identical initial state/stimulus and paired frame timestamps/Update/FixedUpdate/LateUpdate; screenshot plus event trace |

**Minimal read-only browser adapter requested from SH-05** (not a SH-10 edit):
\`window.__sh10AcceptanceSnapshot()\` returns an immutable snapshot with
\`scene:{key,binding}\`, \`camera:{source:'RUNTIME_OBSERVED',x,y,z,yaw,pitch,fovYDegrees}\`,
\`coordinateFrameId\`, \`initialStateId\`, \`timeScale\`, and frame phase.
No claim \`ACTIVE_SCENE_PROVEN\` for a collider preview. This is only
an instrumentation contract, not a request to add guessed behavior.

**Private comparison input** must be independently acquired MCD 20299547
native PNGs outside the public checkout plus an attested capture manifest,
matching initial state, scene, pose, dimensions and 2 frame phases. Reject
missing/mismatched provenance as \`INCONNU\`, not \`REFUTED\`; compare ROI center
(px), edge F1, chroma L1, luminance, temporal luma change, pose and timing
only after matching the context. Thresholds remain operator-local and
versioned, never invented. A result within thresholds would be
\`OPERATOR_THRESHOLDS_MET_NOT_CERTIFIED\`, **never 1:1 proven**.

Existing source-only R/reload, Containers denominator 120 vs initializer
60, max/cap/override, player Time.deltaTime and projectile phase tests
remain **PROVISIONAL**. SH-10 will not duplicate other agents'
private corpus requests or edit any shared runtime module. No new failing
gate is added to GitHub Actions.


### SH-10 isolated implementation (branch only; manual browser gate)

A read-only Chromium CDP capture records two actual **Web** canvas PNGs
(idle then KeyW 300 ms), a JSON manifest, SHA-256, the opt-in
\`window.__superhotSceneMetrics\` when present, and optional SH-05-owned
read-only \`window.__sh10AcceptanceSnapshot()\` metadata.

    node --test tests/acceptance-live-capture.test.mjs
    node scripts/acceptance-live-capture.mjs --capture-web \
      --url 'http://127.0.0.1:3000/?scene=containers' --out /tmp/sh10-web
    node scripts/acceptance-live-capture.mjs \
      --web /tmp/sh10-web/web-capture.json \
      --native /private/native-mcd-capture.json \
      --thresholds /private/native-thresholds.json --gate

The native manifest and PNG frames must stay private, outside the public
repository. A normal run of these Node tests checks only synthetic pixels,
metadata rejection and the parser; **it does not run Chromium or MCD**.
The strict comparator rejects unmatched scene, missing runtime camera,
initial state, stimulus, timeScale, viewport, frame phases or tolerances
as \`INCONNU\`. It reports camera pose errors, ROI center/edge/color/luma,
timing and temporal change **only after** operator-provided context pairing.
Any reported score is *operator-attested, not independent certification*;
\`nativeParityCertified\` is always false.

The new files live on the SH-10 branch only. They have not been merged,
there is no completed browser capture and no native reference paired.
Do **not** run the strict native gate as part of CI.

## SH-10 — opt-in two-OBJ browser proof (2026-11-02)

**This is a NEW Web-visible gate, not native parity.** SH-05 merged public #98
(local File API + indexed WebGL2 draw) and #97 (source-neutral OBJ adapter).
The current Containers preview can replace exactly two generated proxies with
two source-qualified, operator-supplied **private** local OBJ/OBJ.gz files:
mesh level28:6 / group47 and mesh level28:7 / group48. Each requires an
exactly verified 1,546-triangle source group. The OBJ bytes are **never**
shipped from this repository, fetched by the game, or included in the report.

The isolated SH-10 script now supports a **local-only** CDP file-input smoke
test on the *same machine* that holds the private exports. Both inputs are
mandatory together, because a 1-of-2 preview is not a valid two-group draw
observation. Inputs must resolve outside the public checkout (symlinks checked,
256MB maximum per file). The command below is illustrative, **NOT executed
against the owner's game or proprietary files in SH-10's environment**:

    node scripts/acceptance-live-capture.mjs --capture-web \
      --url 'http://127.0.0.1:3000/?scene=containers' \
      --mesh6 /private/exports/mesh6.obj.gz \
      --mesh7 /private/exports/mesh7.obj.gz \
      --out /tmp/sh10-live-obj-capture

The script uses `DOM.setFileInputFiles`, waits for **actual browser-reported**
`locallyLoadedSourceGroups=2`, `generatedManifest.privateIndexedDraws=2`,
at least two suppressed proxy packets (`hiddenByPrivateMesh>=2`), measured
WebGL draw calls and nonzero sampled frame timings. It rejects source-file
presence alone, a one-file load, synthetic fixtures, or a preview where the
indexed GPU draw is not reported. Afterward it captures two actual Web PNG
frames (idle → KeyW 300ms) and records SHA-256. No original bytes or source
file names are written to the public checkout. Local browser access and this
CDP file-input path **still require a real end-to-end execution**; Chromium
navigation was previously blocked in SH-10's sandbox.

A successful local-OBJ result is exactly
`WEB_LOCAL_MESH_GPU_DRAW_OBSERVED_NOT_MCD_PARITY`, **never** NATIVE_PROVEN or
1:1. The browser still has **no independently attested original MCD active
scene, camera pose, field of view, materials, frame phase or native counterpart
PNG**. Therefore the native compare gate must still return **INCONNU**. PR
#101 (SH-15) reports a *serialized* build28 60.0000267° vertical FOV versus
the current Web shader's analytical ~64.66°; without a native active-camera
trace this is a source-qualified framing candidate, not a measured pixel gap.
The public #99 TimeControl and R-profile models are isolated source contracts,
not yet activated browser bindings; the existing five handoff checks remain
**PROVISIONAL**.

**Three visible acceptance priorities for SH-05** remain strictly ordered:
(1) two-group local OBJ **GPU draws + scene/camera/FOV read-only snapshots**
at both frames; (2) corresponding native private frames with the same
scene, angle, viewport and semantic ROIs, then centroid/silhouette metrics;
(3) color, light and time variation with the same input and frame phase.
The optional read-only `window.__sh10AcceptanceSnapshot()` hook remains
SH-05's responsibility; SH-10 does not change entrypoint/renderer/levels.
No native screenshots or operator tolerance values are invented, and no
native corpus request, runner job, or GitHub Actions workflow is launched.
No intentionally red assertion enters CI.

### SH-10 2026-11-02 — corrected live browser gate, native still unpaired

**Corrected real Web integration contract:** SH-05's merged #105 draws THREE
source-qualified placements from ONE locally loaded Mesh6 group47, plus ONE
Mesh7 group48 indexed draw. The old SH-10 acceptance gate incorrectly demanded
two private indexed draws from two files and was therefore stale. The corrected
manual-only gate requires exactly two locally selected source groups, three
Mesh6 placement packets, four indexed draw calls, at least two suppressed
generated-proxy packets, nonzero frame-time measurements and explicit
`sourceConvertedApproximationOnly=true`, `localFilePreviewOnly=true`,
`nativeMeshMatch=false`. It returns
`WEB_APP_REPORTED_FOUR_INDEXED_DRAWS_NOT_MCD_PARITY` only when the current
application counters agree. These are **app-reported draws, not independent
GPU readback**, and still do not prove visible native fidelity.

The same Chromium/CDP capture, once runnable on the operator's machine, records
two real Web PNG frames and `webOnlyPixelVariation` (centroid displacement,
edge-F1, color and luminance). No synthetic image, shader, mesh or source
corpus is deposited here. No native reference image or threshold was obtained.
An original MCD pair remains **INCONNU / NON_COMPARABLE** until scene, camera,
frame phase, stimulus, initial state and viewport are paired.

**Enemy-body P0 pending SH-05 + SH-14**: private research #80/#81 establishes
the original candidates `sharedassets0.assets:pathID284` (5237 vertices)
and headless 285 (4895 vertices). Their OBJ.gz exports remain exclusively
private. Current public Containers has no original-enemy File input, no
source-qualified enemy indexed draw and no active rig/skin: therefore a Web
enemy screenshot and a native comparison are **NOT OBSERVED**, not refuted.
After SH-05 exposes an opt-in local enemy input and proof counters, SH-10 can
gate an actual browser screenshot with original owner/path, indexed draw and
proxy replacement. Static original geometry alone does not prove pose/AI.

**Top three visible owner criteria:** (1) SH-05 + SH-04 scene, camera, FOV,
initial pose and no artificial first-frame jump: SH-15 #109 found a Web
source-level z=31 spawn versus z<=21.8 move clamp (9.2-unit discontinuity
predicted, *not measured in pixels*); (2) SH-05 + SH-11/12/14 actual Chromium
cargo **and enemy** source-qualified draws with screenshot; (3) SH-05 +
SH-13/15 and SH-01/02/03 original paired pixels, color, lighting and
time variation. R/Replay, Containers 120 vs initializer 60, time
cap/override, player Time.deltaTime and projectile phases stay provisional
until a matching original runtime trace is available. No CI workflow, runtime,
research request, runner or private asset touched.

### SH-10 — P0 intégrité des paires PNG (2026-11-02, gate manuelle)

La gate Web/natif ne peut plus déclarer un écart mesuré simplement parce
que deux manifests désignent des noms de fichiers compatibles. Chaque frame
Web **et** native doit désormais déclarer le SHA-256 exact de son PNG.
Le comparateur vérifie les octets effectivement lus avant tout pixel,
impose deux frames chronologiques et les IDs de rendu Web qui encadrent
chacune, refuse les noms de fichier traversant les répertoires, les symlinks
sortants, les ROI invalides et les images absentes. Tout manque retourne
`INCONNU` avec une raison explicite, non `REFUTED`.

La recherche des contours 3×3 respecte désormais les limites de chaque ROI :
aucun voisin n'est artificiellement trouvé sur la ligne précédente/suivante.
Une région sans aucun contour dans les deux sources est `INCONNU` pour la
position/silhouette, et non automatiquement un écart mesuré. Un autre
écart visible et correctement observé peut toujours être déclaré.

Vérification automatisable (images PNG **synthétiques**, métadonnées de
référence fictives réservées au test ; aucune capture MCD) :

    node --test tests/acceptance-image-integrity.test.mjs

Les quatre tests couvrent la matrice PNG appariée, l'altération des octets,
les entrées non sûres/incomplètes et l'absence d'une frame. Un test unitaire
vert certifie la logique de la gate, **jamais** un screenshot MCD.
Aucune exécution Chromium/natif n'est revendiquée et aucun seuil natif
n'est inventé. Le script manuel reste isolé de la CI de parité rouge.

**Handoff P0 SH-05, trois critères visibles :** (1) obtenir la même instance
Containers et la même caméra/projection/phase sur Web et MCD ; (2) comparer
les vrais PNG de silhouettes cargo+ennemi et leurs centroïdes/contours ;
(3) mesurer couleur, lumière et deux instants temporels sur les mêmes ROI.
Le jeu Web affiche des meshes source locaux mais la vraie instance native,
les matériaux/lumières et les mouvements/réactions demeurent non appariés.
