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

## Dojo/build10 full-run gate — user-controlled, Web-only

A separate **Web trace protocol** now verifies the observable sequence start → at least one living spawn → recorded kill → victory with the six/seven-kill target → restart with cleared kill count and enemy list. It does **not** certify MCD native parity, AI correctness, or that a browser run was executed.

SH-10 owns three files:
- `scripts/acceptance-dojo-playthrough.mjs`: pure trace validator plus `--trace` local JSON command. Fails closed on wrong source scene (`SHRL_Dojo2`, `sceneBuildIndex:10`), missing stages, changing kill target or kill counter reset.
- `scripts/acceptance-dojo-browser.mjs`: explicitly imported browser-only sampler that serializes *only* screen, native scene identity, kill target, kills and enemy id/alive fields. No pixels, matrices, user paths, audio or original assets.
- `tests/acceptance-dojo-playthrough.test.mjs`: synthetic positive and negative fixtures, never a browser success claim.

At the user's final localhost test, open DevTools on `http://localhost:4173/` BEFORE starting the Dojo encounter:

```js
const { startDojoCapture } = await import('/scripts/acceptance-dojo-browser.mjs');
window.dojoRun = startDojoCapture();
```

Play normally to victory and then restart. Once the fresh game has rendered, save to a local file:

```js
window.dojoRun.save('dojo-full-run.json');
```

The save call merely requests a browser download; independently verify that the file exists. The trace must stay on the owner's machine.

```bash
node scripts/acceptance-dojo-playthrough.mjs --trace private/dojo-full-run.json
node --test tests/acceptance-dojo-playthrough.test.mjs
```

Successful validation only means supplied sampled frames cover the five milestones in order, and the validator has no way to authenticate the source of an arbitrary JSON trace. Sampling can miss very brief states; it cannot infer missing events. This is *not* a test of movement, collision, visual fidelity, or an original-native comparison. Ordinary CI runs only authored tests, not the private full-run gate.

**Status at submission:** no owner browser full run, no measured native/Web gameplay pair. SH-05 alone owns the shared gameplay fixes and final integration.


## Dojo/build10 strict full-run gate v2 (SH-10; opt-in, no native success claim)

The earlier `assessDojoPlaythrough` (PR #170) establishes only **start → living spawn →
some kills → win at source 6/7 quota → restart with empty enemy list** in
user-supplied Web snapshots. It does **not** prove actual gameplay execution,
pickup/fire, collision, audio, GPU pixels or MCD native parity. Do not replace
that limited result with an unqualified 1:1 claim.

The stronger **`scripts/acceptance-dojo-vertical.mjs`** consumes the new v2
recorder output and fails closed unless each observable milestone is present:
- Source tuple must stay **SHRL_Dojo2.unity / build10 / level10** on every
  sampled rendered frame; kill target remains 6 or 7 with **each intermediate
  kill-counter integer** sampled, no reset before victory, and a later
  playing state with zero kills and no enemies.
- Pistol must be visibly equipped in Web telemetry and ammo must decrease at
  least once (a Web ammo transition, **not** independently proven bullet hit).
  A single **same-ID** scene pickup must appear as held and later as a
  released item with changed Web state before victory.
- After restart, the count of original scene items must match initial state;
  no previously changed item should remain, and there must be no held item or
  live fragment count. Starting weapon and ammo return, the world clock
  resets, and `audio.sceneAmbienceSources` matches the initial count
  (WebAudio node count, **not** an audible waveform test).
- An **operator-marked** door/threshold traversal, stair ascent and blocked
  wall press must have monotonically ordered rendered-frame samples with
  bounded movement. Door displacement .65–5 m; stair elevation .2–3 m with
  grounded endpoints; wall-press displacement <= .15 m despite movement input.
  These are **Web collision sanity checks**, not a native PhysX contact
  comparison, not an automatically verified door/step identity, and not
  source-derived movement tolerances.

### Owner-local browser procedure (after SH-05 merges; not executed by SH-10)

Run the **existing** `node server.mjs` and open
`http://localhost:4173/` with the private Dojo scene configured. Before
starting the encounter, in DevTools (the recorder is opt-in):

```js
const { startDojoCapture } = await import('/scripts/acceptance-dojo-browser.mjs');
window.dojoRun = startDojoCapture({ intervalMs: 100 });
```

The recorder is a **read-only browser timer**, using the already exposed
`__superhotGetRenderedFrameSnapshot()`; it does not automate the original
game, move characters or create fake kills. Start the Dojo encounter, use the
pistol, take and throw a real in-scene item, traverse the door threshold and
stairs and walk against a blocked wall. For each physical location, call
`dojoRun.mark(...)` **while performing that step**:

```js
dojoRun.mark('door-before');      // on the approach
// Move through the door at the threshold.
dojoRun.mark('door-after');       // after crossing
dojoRun.mark('stairs-bottom');    // before the climb
// Walk up the stairs.
dojoRun.mark('stairs-top');       // after the climb
dojoRun.mark('wall-press-start'); // while pressing a blocked wall
// Keep walking into the same wall.
dojoRun.mark('wall-press-end');
```

All markers must occur **before victory**, without duplicate markers, and
should bound at least three collected frames per route. The operator must
choose appropriate actual scene locations. The v2 JSON is **unauthenticated
user-provided telemetry**; a marker merely labels a rendered Web frame, not a
source or native scene location. With high FPS or multiple kills between
samples, the gate can report *INCOMPLETE* even for a successful game session;
it never fills missing frames with invented evidence.

After all **6–7** kills, observe the victory screen, restart, allow audio
and scene initialization to settle, and capture the reset screen. Save the
trace to a **private local file** with:

```js
dojoRun.save('dojo-full-run.json');
```

The saved JSON contains only bounded actor IDs/states, event counters and
player feet coordinates; **no original assets, audio buffers, object names,
pixel captures, private paths or code**. Verify the browser download actually
exists. Run this opt-in command **only on the owner's checkout**:

```bash
node scripts/acceptance-dojo-vertical.mjs --trace private/dojo-full-run.json
```

Nonzero status means trace *invalid/incomplete* or a Web acceptance criterion
not observed; it **does not automatically refute the original MCD game**.
The authored CI fixtures (`node --test tests/acceptance-dojo-vertical.test.mjs
tests/acceptance-dojo-browser.test.mjs`) are all synthetic. A green hosted
CI reports tests of the **validator**, not a real Chrome playthrough.

### SH-05 delta handoff and native limitations

P0 owner **SH-05**: after main CI-verified merge, collect a single actual owner
localhost Dojo trace; distinguish reachability/win/restart faults from sparse
sampling. Failed route labels or player feet movement should be investigated
alongside real collision geometry (312 selected scene boxes and three doors
described in `docs/dojo-reprise.md`), never by changing these gate thresholds
to force green. SH-05 is the **sole owner** of shared runtime modifications.

P1 owners **SH-02/SH-03/SH-05**: if Dojo start/weapon/spawn/ammo/kill quota
or WebAudio reset fails the trace, reproduce on a stable scene and correct the
runtime in the designated lane, not in SH-10 acceptance scripts.

P1 owners **SH-04/SH-05/SH-13/SH-14/SH-15**: real browser pixels versus
matched executed MCD Dojo scene, camera/pose/time remain **UNKNOWN** without
two independently acquired and paired frames; use SH-15's visual protocol.
The prior private research #2 HANDOFF artifact 13131037087 is a **reported
source handoff**, not executed Dojo browser parity. Earlier **Containers**
build28 120-vs-60 TimeControl and R/Replay claims must not be applied to
Dojo/build10 without an active instance/profile and runtime evidence.
No private research workflow, native binary, Unity, Frida, owner PC or
new runner was invoked to build this Web-only gate.

**Delivery verification scope:** synthetic Node tests; no original-native
execution, owner-local browser playthrough, screenshot comparison, GPU pixel
score or native 1:1 claim.
