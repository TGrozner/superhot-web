# SH-10 — MCD acceptance matrix (source-qualified, not 1:1)

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
reviewed by SH-10. The public Web game uses its own three generated levels;
none is certified as Containers. Zero paired native/Web runtime measurements
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
