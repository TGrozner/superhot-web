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
| MCD-ACCEPT-01-KEY-R | The unconnected prototype input helper yields reload; current Dojo src/main.js processes KeyR **only when !nativeGameplay()**, so active Dojo has no Replay handler. Non-native reload refills the six-round magazine. | Recovered keyboard profile maps R to Replay; KillReloadMod adjusts delays/animations, not ammo. | REPORTED_CONFLICT for active Dojo Web source, **not** an original gameplay trace. | SH-02 active input profile; SH-05 browser dispatch |
| MCD-ACCEPT-02-CONTAINERS-FIXED-STEP | A variable requestAnimationFrame delta drives the Web update; a 100ms stall is clipped to 50ms by the pure frame helper. | Containers RUN_LEVEL_6C / SHRL_ContainerPort / build28 binds denominator 120 (8.333…ms), unlike class initializer 60 (16.666…ms). | SCENE_UNMATCHED, not a direct numeric disagreement between two versions of Containers. | SH-01 native binding; SH-05 integration |
| MCD-ACCEPT-03-TIME-MAX-CAP-OVERRIDE | Web uses a max contribution plus smoothing. The Web target helper ignores injected cap/forced fields; pure pause freezes clocks but leaves current scale unchanged. | Maximum of shifter contributions, clamp, then forced override; zero pause is not raised to a positive minimum. | REPORTED_CAPABILITY_GAP; exact native values/branches remain unknown. | SH-01 native method; SH-02 time mechanics |
| MCD-ACCEPT-04-PLAYER-SCALED-DELTA | Active Dojo Web passes **worldDt=tick.worldDelta** to mcdSourcePlayerPreConstraintMove; only non-native fallback uses real dt. Pure movementStep probes are **unconnected demo helpers**, not actual Dojo motion. | Active native movement is reported to use Unity Time.deltaTime and an AsymmetricSmoothLinearInstantTimeShifter. | REPORTED_AGREEMENT_UNVERIFIED for Web scaled-delta wiring only; no native/Dojo movement pair or collision proof. | SH-02 clocks/movement; SH-05 browser |
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

**ACCEPT-04 (P0, movement):** Active Dojo Web already sends tick.worldDelta
to pre-constraint motion; the old real-dt claim applies only to the demo
fallback. Compare identical directional input across two known native time
scales with scene collision/camera controlled. Measure actual native
Time.deltaTime and player displacement against independently observed Web
worldDelta, positions and phase. The pure movementStep probes are illustrative,
not Dojo samples. A native movement body using unscaledDeltaTime would refute
the reported source time-domain claim; source-aligned Web wiring alone cannot
establish runtime or collision parity.

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

**Legacy v1 diagnostic (limited milestones only):** on Pages or `http://localhost:4173/`, open DevTools BEFORE Start. Prefer the stronger v2 procedure below for the complete game loop:

```js
const { startDojoCapture } = await import(new URL('./scripts/acceptance-dojo-browser.mjs', document.baseURI));
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

### Owner-browser procedure: public Pages or localhost (not executed by SH-10)

The read-only browser recorder is included in the **standalone Pages package**
since SH-05 PR #417 (first merged SHA `2b4c953`), but packaging alone is
not an HTTP, browser, FPS or complete-run result. Public site:
`https://tgrozner.github.io/superhot-web/`. The same procedure works on
`http://localhost:4173/` when running the existing `node server.mjs`.

**Optional HTTP-only site preflight** (no game launched, no private file
uploaded, no commercial assets downloaded):

```sh
node scripts/acceptance-dojo-pages.mjs
# Or: node scripts/acceptance-dojo-pages.mjs --site http://localhost:4173/
```

It checks the actual HTTP responses for index, Dojo/build10 manifest, browser
recorder and FPS recorder. `WEB_QA_HTTP_READY_NOT_BROWSER_VERIFIED` (exit 0)
means these resources were served and recognizable, not that the game loads or
plays. HTTP 404/invalid content reports `WEB_QA_HTTP_GAP` (exit 2);
inaccessible network is `WEB_QA_HTTP_UNKNOWN` (exit 3), **not** proof the
site is broken. This command runs only on the machine invoking it and does
not use the original MCD executable or a research runner.

In the browser DevTools console **before clicking Start**, arm the opt-in
recorder once. Use a URL relative to `document.baseURI`, not absolute
`/scripts/...`: Pages lives under `/superhot-web/` while localhost is
usually at `/`:

```js
const { inspectDojoCaptureReadiness, startDojoCapture } =
  await import(new URL('./scripts/acceptance-dojo-browser.mjs', document.baseURI));
inspectDojoCaptureReadiness(); // pre-Start preview is NOT a started combat
window.dojoRun = startDojoCapture({
  intervalMs: 50, maxFrames: 30000, waitForStart: true,
});
```

**Now click Start / Play original in the actual UI without reopening DevTools.**
The armed recorder does not save frames from the initial rendered
`activeScreen='playing'` preview. It starts sampling only when the source
identity and prerequisites match, the Web screen is `playing`, the
encounter counter is still zero **and** `#scene-controls.hidden === true`.
This last flag is controlled by `setScreen('playing')` on the actual
`start() → resetGame()` path in `src/main.js`; in the initial preview the
controls are still visible. A paused/won or partially played run is rejected.
The recorder's `dojoRun.ready` property becomes true after the first valid
post-start sample. There is no need to inspect it during pointer lock.

The recorder is a **read-only browser timer**, using the already exposed
`__superhotGetRenderedFrameSnapshot()`; it does not automate the original
game, move characters or create fake kills. With `waitForStart: true`,
a preflight failure means **zero frames collected until readiness becomes
true**, not a fabricated preview playthrough. Without this option,
`startDojoCapture()` fails immediately with specific reason codes:
`DOJO_COMBAT_NOT_STARTED`, `DOJO_NOT_PLAYING`,
`DOJO_RUN_NOT_FRESH` or missing scene/encounter/items/feet/audio telemetry.
The controls-hidden witness is a mutable **Web DOM/UX indicator**,
not independent proof of a click, an executable original, or native parity.
No private files are uploaded.

After Start, shoot once to observe ammo consumption, then
**press F to throw the equipped pistol** (the current main's `nearbyPickup()`
refuses all pickups while `state.weapon` is true), face a source item and
press **E** to pick it up, then **F** again to throw that same item. Continue
through 6–7 actual kills, victory and restart. This is a Web reproduction
sequence, not a native/MCD behavior claim.

**Do not repeatedly open DevTools mid-game:** leaving the pointer-locked canvas
can pause the game and contaminate collision measurements. Instead keep focus
on the game and press the following physical number-row keys (one press per
endpoint) **while the Web screen is playing**:

| Key | Route marker |
| --- | --- |
| 1 | `door-before` |
| 2 | `door-after` |
| 3 | `stairs-bottom` |
| 4 | `stairs-top` |
| 5 | `wall-press-start` |
| 6 | `wall-press-end` |

Mark door/stair endpoints while moving at their true locations. For the wall,
hold forward into the blocked wall during the 5→6 segment. These are local
operator labels, not authenticated native geometry. The alternate manual
`dojoRun.mark(...)` calls remain supported **only if they don't interrupt
live gameplay**:

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
and scene initialization to settle, and capture the reset screen. Before
saving, inspect `dojoRun.markers` (6 distinct points) and
`dojoRun.markerWarnings` (ideally empty); repeated number-row keys do not
overwrite earlier evidence. Save the trace to a **private local file** with:

```js
dojoRun.save('dojo-full-run.json');
```


For a **second complete encounter**, save the first trace *after its REJOUER*
reset, then stop that recorder and arm a fresh v2 capture **before the next
kill**, while the restarted game is fresh (zero kills). Alternatively, reload
the page and arm in preview before START. Each v2 trace covers **one** victory plus
its restart (including unique route markers 1–6); concatenating two traces
or reusing the first recorder's consumed markers does **not** constitute a
valid second full-run receipt. Verify both JSON files locally and keep them
out of Git.

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

### SH-10: gun discard must not satisfy the firing gate (3 November 2026)

**Observed Web-source behavior:** in `src/main.js` the actual `shoot()`
path decrements `state.ammo` while the pistol remains equipped; `throwWeapon()`
also sets `state.ammo = 0`, but **clears `state.weapon`**. Previously the
vertical gate could accept a Dojo trace with an initial armed pistol and a later
ammunition decrease caused *only by pressing F to discard the gun*. That is
a false firing receipt, even if spawn/kill/victory/restart are otherwise recorded.

The gun criterion now requires **two consecutive sampled playing frames, both
armed, with a positive pre-transition ammo count and lower post-transition
ammo count**. A transition from `weapon=true` to `false` never certifies a
gunshot. The synthetic positive fixture now models the actual Web order:
armed ammo drop → disarm via gun throw → pick up source item unarmed →
release same item → 6/7 kills → win → reset. A source item held while the
pistol is still equipped is rejected as invalid for **current Web wiring**,
because `nearbyPickup()` explicitly rejects pickup while armed.

**Remaining evidence limit:** frame sampling may miss an instantaneous
gunshot, or conceal intervening discard/re-pickup between two screenshots;
an ammo transition alone still does **not independently certify a projectile
or its impact**. The opt-in acceptance gate reports INCOMPLETE on
insufficient sampling, not a native contradiction. For a stronger browser
receipt SH-05 may expose a read-only *monotonic shot counter* from the active
runtime, stamped in the rendered-frame snapshot; SH-10 cannot modify that
shared file. No native executed gun event or original screenshot is claimed.

### SH-10 P0: pre-Start preview must not count as a played Dojo (3 November 2026)

`src/main.js` calls `loadLevel(0); setScreen('playing')` at page
initialization, *before* `start()` sets `nativeCombatStarted=true` and
resets the scene. The previous sampler only required a matching Dojo
scene, finite encounter, items, feet and an integer ambience count;
these can be visible in the initial, **non-combat** preview. Recording
then could silently label a preview frame as the first started run.
The new opt-in `waitForStart:true` mode arms before the owner clicks
Start, without touching gameplay or pointer lock, and ignores preview,
paused/win and already-progressed states until a fresh playing
encounter's DOM receipt is present.

**Acceptance proof level:** authored Node fixtures demonstrate the
recorder gating and deferred activation, **not** that a full browser
Dojo run was executed. The DOM hidden state can be changed manually
and does not authenticate the session. SH-05 must still check a
single real owner-local browser trace with spawn, armed ammo decrease,
same-item pickup/release, 6/7 kills, win and restart; any missing step
remains **INCOMPLETE** until observed. The native Dojo visual, gameplay
and timing deltas remain **UNKNOWN** without paired original runtime evidence.

### SH-10 P0: six or seven *distinct* dead Web actors (3 November 2026)

The Dojo vertical gate now requires at least the configured **6 or 7 distinct
Web encounter IDs observed with `alive:false`** before victory. The current
Web owner retains corpses in `state.enemies` until restart, and its encounter
assigns unique `native-encounter-N` IDs. A trace that repeats one dead actor
while the kill counter climbs to six is **INCOMPLETE**, not a completed run.
Duplicate IDs in one sampled frame, invalid liveness, or resurrection of a
previously dead actor before restart is invalid telemetry. The result reports
`distinctDeadActorIdsBeforeWin` separately from the kill counter.

This is a stricter **Web-only observation**: a rendered dead actor is not proof
of a native kill or its projectile/weapon cause. Sparse samples or a future Web
cleanup policy that removes corpses may produce INCOMPLETE; do not fabricate
missing actors or weaken the gate automatically. Authored Node tests validate
the checker only; the owner-local Chromium 6–7 kill → win → restart and matched
native/Web screenshots are still NOT OBSERVED by these tests.


### SH-10: Dojo living-spawn → death receipts (3 November 2026)

A distinct corpse ID alone did not prove its actor was seen alive during the
captured encounter: the previous synthetic positive trace introduced five of
six enemies **already dead**. The strict vertical gate now requires a sampled
`alive:true` followed later by `alive:false` for **each of the 6 or 7 distinct
Web actor IDs**, in addition to the existing per-kill counter, win, route and
restart gates. It reports both `distinctDeadActorIdsBeforeWin` and
`distinctAliveThenDeadActorIdsBeforeWin`. A death first seen without its
living predecessor is **INCOMPLETE** (sampling may have missed the spawn), not
`REFUTED` native behavior. The authored 6/7 fixtures now contain individual
spawn/death pairs, not dead-on-arrival enemies. These are sampled Web telemetry
receipts, not actual Chromium execution, projectile causality or a matched
MCD native observation. A completed owner-local Dojo playthrough and the
same-scene/angle original visual reference remain **UNKNOWN**.


### SH-10: trusted in-browser Start and victory Replay receipts (3 November 2026)

The public runtime can start by `start-button` / `play-original` calling
`start()`, **or by the first primary mousedown on the actual `#scene` canvas**
while the Dojo/build10 preview is rendered and `#scene-controls` is visible.
The latter path in `src/main.js` sets `nativeCombatStarted` and requests
pointer lock, but does **not** fire the pistol. A button-only recorder wrongly
classified this legitimate owner-started 6/7-kill run as INCOMPLETE.

The read-only recorder now records a canvas-start receipt as
`{type:'start', buttonId:'scene', ...}` only on a *trusted primary gesture*
targeting the canvas, with validated Dojo source identity, active preview and
pre-start controls. It does not count control-panel/scene-mode events, synthetic
mouse events, right clicks or the first pointer-lock press as a gunshot. Normal
button Start receipts remain accepted. On victory, `again-button` must still
produce a separate trusted click before the sampled restart; counters alone
cannot prove Replay. Missing receipts are **INCOMPLETE**, invalid receipt schemas
are INVALID, and user-supplied traces remain unauthenticated.

**Operator requirement:** arm `startDojoCapture({waitForStart:true})` *before*
the intended button or canvas Start; after victory press actual **REJOUER**.
An unrelated pre-start click on a visible UI control currently may also trigger
combat in the runtime (SH-01 has already escalated this to SH-05), but the
acceptance harness never credits that as an intentional canvas Start.
Browser-trusted clicks are not cryptographic proof. Node fixtures do not certify
a Chromium 6/7-kill run or native MCD parity: both remain **UNKNOWN**.


### SH-10: browser input attempts must accompany the Dojo actions (3 November 2026)

The local Dojo source (`src/main.js`) binds primary fire to a left mouse-down
**only after pointer lock**; the first mouse click merely requests the lock.
`E` requests pickup and `F` throws an equipped gun or held source item.
The v2 owner-local capture now adds bounded `inputActions` receipts (only
`fire`, `pickup`, `throw`, rendered frame ID and screen), excludes synthetic
`isTrusted=false` events and editable targets, and marks 256-action overflow
with `inputActionsTruncated`. No original assets, names or raw key data are
serialized. A receipt is an **input attempt**, never independent proof of
successful firing, item interaction or native MCD behavior.

The vertical gate now requires the actual Web state changes **and** a matching
browser input attempt between adjacent samples: equipped ammo decrease with
pointer-locked primary fire, the same source item becoming held after `E`, and
that held item being released after `F`. A gun-drop `F` cannot satisfy the
separate item-release receipt; an early fire click cannot validate a later
ammo decrease. Older v2 traces without input receipts (or with a truncated
input buffer) yield **INCOMPLETE**, not an invented successful playthrough.
Transient actions that begin and end between captures may also yield
INCOMPLETE; increase capture frequency within the supported 50–5000 ms range
rather than inventing unseen transitions. Synthetic Node fixture passes
remain tests of the detector only, not a complete localhost Chromium run.



### SH-10 P0: Kill counters and observed deaths must coincide (3 November 2026)

The Dojo Web source `src/main.js:killEnemy()` changes `enemy.alive=false`
and increments `state.kills` **in the same synchronous function call**. A
trace with 0→6 individual counter values and six distinct living→dead Web
actor IDs could previously pass even if the six count increments happened
*before* (or after) the six deaths. That is not a witnessed sequence of six
eliminations. This is a **Web source consistency requirement**, not proof of
a native damage path.

The opt-in `assessDojoVertical` now additionally requires **each adjacent
rendered-frame interval** to have matching deltas:

- Change in observed kill counter = number of actor IDs **first** observed
  dead in that frame after being observed alive earlier in this run.
- No count change may silently accompany a newly observed death, and no
  counter increase may occur without the corresponding new death receipt.
- The report includes `checks.killCounterAlignedWithWitnessedDeaths` and
  up to twenty `observed.killDeathDesyncedFrameIds` for owner-local diagnosis.
  These IDs are Web frame counters, not original-native evidence.

A mismatch is `WEB_DOJO_VERTICAL_INCOMPLETE`, **not native REFUTED**.
Sparse sampling, a skipped rendered frame, actor despawn or telemetry delay
can make an otherwise completed playthrough **incomplete as evidence**. The
owner may repeat the game capture at 50 ms and inspect the first flagged
frame; SH-05 should investigate a reproducible counter/death discrepancy in
the actual browser path, without weakening the gate or modifying SH-10
runtime. Counter alignment does **not** establish weapon causality, hitbox
parity, MCD physics or an executable-native observation. The accompanying
Node fixtures deliberately include counter-before-death and
counter-after-death traces; they are authored fixtures, **not Chromium games**.


### SH-10 P0: a settled Web reset, not a 0→0 ambience false positive (3 November 2026)

The first rendered frame after win-screen `REJOUER` can arrive before the
asynchronous `initializeAudio() → startSceneAmbience()` promise finishes.
The previous gate compared **one initial and one post-restart**
`sceneAmbienceSources` count; **0 === 0 could pass despite zero scene
ambiences**, and a later second set of WebAudio sources could be missed.
This is a real gap in what the browser acceptance protocol *measures*, not
an observed leak in an executed Dojo session.

The source-qualified owner-local Dojo run described in
`docs/dojo-reprise.md` observed **three persistent Web ambience sources**
in the selected Dojo package. The strict Web-only gate now requires two
consecutive pre-victory samples with count **3**, and two consecutive
post-restart samples with count **3**, including the final recorded sample.
A count **greater than 3 at any observed pre-victory or post-restart sample**
is a potential Web duplicate/leak; an initial post-restart 0 is allowed
while audio initializes **only if** two subsequent renders settle to 3.
This count is a source/owner **Web baseline, NOT a native MCD sound proof**,
nor an acoustic listening test.

At least **two post-restart rendered samples** are mandatory. All of the
post-restart samples must still show original item pool size, no held/broken
item state or fragments, and restored starting weapon/ammo. A leak or stale
item appearing *after* an immediately clean reset can therefore fail the
gate. The opt-in recorder already collects these frames: after clicking
`REJOUER`, **allow at least a few 100 ms samples for WebAudio to settle**
while staying in the new playing run, without touching weapons/items;
only then call `dojoRun.save('dojo-full-run.json')`. Do **not** make
a test pass by fabricating audio counts or snapshots. If local assets are
absent or the browser blocks audio, the result is **INCOMPLETE** with
diagnostic `postRestartAudioSourceCounts` and bounded
`overBudgetAudioFrameIds`, *not* REFUTED native parity.

Five new authored Node regressions cover no settled reset, 0→0 missing
ambience, late duplicate nodes, asynchronous 0→3→3 recovery and
late changed-item residue. They test the **validator** alone, not a real
Chromium victory/restart, physical speaker output or matched MCD frame.
Owners: SH-10 acceptance protocol; SH-05 owns any runtime fix after an
actual failed private owner-local trace, and SH-07 owns native/Web audio
source-provenance questions.

### SH-10 P0: F pistol discard is not the same as F object throw (3 November 2026)

The Dojo/build10 owner-browser vertical gate requires the **ordered** sequence
**armed primary-fire click and ammo decrease → F pistol discard with a witnessed
armed-to-unarmed state change → E source-item pickup → F same-item release**.
The real Web `src/main.js` `nearbyPickup()` refuses a pickup while armed;
`throwWeapon()` drops the gun on F only while the player holds no source item.
A later F that releases the held item **cannot** stand in for the earlier F.
Input receipts are browser-recorded attempts and retain order even if both
key presses occur between two render samples. An absent/incorrectly ordered F
or missing weapon-state transition is **WEB_DOJO_VERTICAL_INCOMPLETE**, never
native refutation. Authored Node fixtures validate the gate, not a live run.

For SH-05/Thomas: record the actual owner-local run with the existing
`startDojoCapture({ waitForStart:true, intervalMs:50, maxFrames:30000 })`
before clicking Start, preserve the private `dojo-full-run.json`, and run
`node scripts/acceptance-dojo-vertical.mjs --trace private/dojo-full-run.json`.
A failure reports the *first reproducible Web receipt gap*; it does not prove
whether the original MCD behaves identically. No new native asset, code or
reference image is included.



### SH-10 Dojo browser clock-rate receipt (3 November 2026)

The Dojo rendered snapshot exposes `gameplay.timeScale` (the **next** Web
scale) and `worldClock` (already accumulated using the **applied** scale).
The opt-in browser sampler now records `sampledAtMs` from
`window.performance.now()` and the app-reported `gameplay.timeScale`.
These are bounded scalar metadata, never pixels or original assets. The
independent `scripts/acceptance-dojo-clock.mjs` reports measured Web
world-seconds/real-sampler-second for a stable idle span and a stable moving
span, with 250 ms switch exclusion and >=300 ms observation per span:

```sh
node scripts/acceptance-dojo-clock.mjs --trace private/dojo-full-run.json
```

This is **diagnostic**, not a new mandatory 6–7 kill acceptance condition.
Missing clocks/older recordings are INCOMPLETE, wrong Dojo scene or malformed
timestamps INVALID, and sampled regimes merely OBSERVED. The sampler runs
on a timer (not in the rAF callback); background throttling, look/shoot pulses,
sampling gaps, shifter smoothing and the previous-scale application can bias
ratios. Never assert `timeScale * sampledSeconds == worldDelta` as if one
Web snapshot held the applied scale. No numeric MCD target is invented; the
native replay's actual clock/time phase and matched inputs are still UNKNOWN.
Five/six authored Node regressions validate only the observer, not a browser
playthrough. SH-05/SH-02 own any runtime/time adjustment after a real
owner-local trace identifies a reproducible discrepancy.


### SH-10 — Dojo GPU receipts for real hands and warning lights (3 November 2026)

**Purpose:** make actual Web rendering changes measurable without confusing a
Node fixture, a GPU draw submission or a clicked button with native 1:1 parity.
The recorder now includes bounded scalar-only `gameplay.visual` metadata from
the same already-rendered browser frame: number of source-world draw calls,
hands draw calls/triangles, the reported hand pose/socket flags, and whether
the source warning, projector draw receipts and separate creative Web red-wash
GPU draw receipts are active. Submission is **not** visible pixel proof.
It does **not** store original textures, model names, IDs, shader contents, pixel images,
proprietary meshes, camera paths, or assets. Missing fields stay `null`.
Known warning status tokens are allowlisted, not copied from arbitrary source
strings.

Record the existing private owner-local run as before, then evaluate:

`node scripts/acceptance-dojo-visible.mjs --trace private/dojo-full-run.json`

This is an **opt-in diagnostic** and has no unconditional red CI gate.
Results distinguish:

- `WEB_RENDERED_VISUAL_HOOKS_SAMPLED_NOT_NATIVE_PARITY` — actual browser
  snapshot-shaped Web receipts were supplied, **not** an independently
  executed/verified Chromium session and **not** a native screenshot match.
- `WEB_DOJO_WARNING_ACTIVE_NO_LIGHT_SUBMITTED_NEEDS_VIEWPORT_CHECK` —
  the same sampled warning frame reports **zero source projector AND zero Web
  false-light GPU draws** (`exit 1`). This is a potential missing shader
  submission, not proof of a visible red-light bug: offscreen/per-mesh culling
  may legitimately yield zero. Reproduce at a fixed angle near the actual
  doorway and inspect real pixels. The creative Web red wash introduced in
  #340/#355 uses `generatedManifest.warningWebFalseLightDrawCalls` separately
  from `doorWarning.renderedSpotlights`: zero native spotlights is not by
  itself a regression. Missing new counters in older traces stay UNKNOWN.
- `WEB_RENDERED_VISUAL_HOOKS_NOT_OBSERVED` — older capture or no world GPU
  draw evidence (`exit 2`). Invalid/mislabeled source data is also rejected
  (`exit 2`). A pistol-only run with zero hands is **unexercised**, not a
  katana regression.

For P0 VISUAL, SH-05/SH-13/SH-14 still need three **visible** paired checks:
(1) **same camera/world scene angle/placement** on real Dojo browser and
licensed private native frames, (2) **silhouette and animation** of enemy,
hands and katana at the same action/time, (3) **color and illumination**,
especially door warning ROI, and a second time-separated frame. The
snapshot-only report has **no pixels, no matched native camera and no
reference RGB/light measurements**. Visual parity stays **UNKNOWN**. The
SH-10 script does not edit a gameplay/renderer owner file; the first proven
Any no-light GPU submission candidate goes to SH-05/SH-13 only after an
actual doorway/camera viewport check; contact/physics issues go to SH-03/SH-06.

**Clock recorder correction:** `gameplay.moving` is now a **Web keyboard
axis intent** (physical `KeyboardEvent.code`) matching the real
`src/main.js` axes: `KeyW/KeyZ/ArrowUp` vs `KeyS/ArrowDown`,
`KeyD/ArrowRight` vs `KeyA/ArrowLeft`. Opposing axes cancel;
`KeyQ` is ignored, since Q printed on AZERTY emits `KeyA`. This
fixes the measurement-label bug in #230 without touching game inputs.
Holding an axis against a wall **does not prove translation**; the
clock-slope observer remains only an input-regime diagnostic, not a native
movement/physics verdict. Existing 6–7 kill/restart acceptance is unchanged;
no game/corpus binary or private runner was invoked for authored Node tests.


### SH-10 — opt-in *real pixel* Dojo/build10 pair, not only GPU draw counters (3 November 2026)

The existing `acceptance-dojo-visible.mjs` sees **GPU receipts only**. It
cannot show whether the Dojo looks like MCD. The independent **owner-local**
`scripts/acceptance-dojo-pixels.mjs` consumes **four actual screenshots**,
two browser and two *separately captured, owner-authorized, privately retained*
MCD native screenshots, with identical dimensions and chosen ROI rectangles:
*before* and *after* the same event (e.g. door light OFF → ON).
It reads local PNGs only; there is **no native screenshot in Git, CI,
this document or the script**. It neither executes the native game nor
requests Unity/Frida, a runner or a private corpus workflow.

Capture using the browser's **real tab screenshot** (not
`canvas.toDataURL()` after a WebGL draw with
`preserveDrawingBuffer:false`, which may be blank), ideally in Chromium at a
fixed resolution, alongside the browser receipt's frame ID. Collect the
native screenshot *legally and privately*, from the **same MCD Dojo scene,
viewpoint, actor pose, action phase, viewport and HUD inclusion**. Native
camera pose/FOV and precise action timing are currently **UNKNOWN**, so
don't mark either as independently verified. Disable automatic OS scaling,
avoid cursor/DevTools overlays, use the same crop and do not upload originals.

Place only an **untracked private** manifest and PNGs in the same directory,
such as `private/dojo-visual/`:

```json
{
  "schemaVersion": 1,
  "target": {
    "game": "SUPERHOT: MIND CONTROL DELETE",
    "scene": "SHRL_Dojo2",
    "sceneBuildIndex": 10,
    "serializedOwner": "level10"
  },
  "rois": [
    {"id": "world", "x": 0, "y": 0, "width": 1280, "height": 720},
    {"id": "door", "x": 200, "y": 80, "width": 260, "height": 250},
    {"id": "enemy", "x": 620, "y": 140, "width": 220, "height": 460}
  ],
  "pairs": [
    {
      "id": "before", "webFrameId": 120,
      "webPng": "web-before.png", "nativePng": "native-before.png",
      "webProvenance": "owner-local-browser",
      "nativeProvenance": "owner-authorized-native",
      "cameraMatch": "unknown", "timeMatch": "unknown"
    },
    {
      "id": "after", "webFrameId": 178,
      "webPng": "web-after.png", "nativePng": "native-after.png",
      "webProvenance": "owner-local-browser",
      "nativeProvenance": "owner-authorized-native",
      "cameraMatch": "unknown", "timeMatch": "unknown"
    }
  ]
}
```

**These numbers are a schema example, NOT recovered Dojo camera/ROI
coordinates or a native reference.** Replace all four PNGs, frame IDs and ROIs
with genuine private evidence. `owner-declared-matched` is accepted instead of
`unknown` for camera/time metadata only if the owner manually aligned them;
it still is **not independently authenticated**.

```sh
node scripts/acceptance-dojo-pixels.mjs --manifest private/dojo-visual/pairs.json
```

Output is JSON scalar metrics only: RGB/brightness MAE per ROI,
edge-map overlap and centroid position drift (**generic pixel structure,
not automatically a person silhouette, nor a camera matrix**),
and native/Web *before→after* brightness changes with differential error.
Comparison of the door ROI at both times can expose a **real lighting gap**;
world/enemy ROIs help prioritize placement/shape/color. The PNG reader
rejects alpha, palette, non-8-bit/interlaced or malformed files instead
of guessing the display composite. No thresholds, viewport registration,
native-trust proof, sRGB-linear photometric calibration or gameplay/physics
equivalence have been invented.

- `OWNER_SUPPLIED_PRIVATE_PNG_DELTA_MEASURED_NOT_PARITY` (exit 0) means
  **pixels were decoded and metrics computed**, **NOT** a passing 1:1 gate.
- `PRIVATE_NATIVE_WEB_IMAGE_PAIR_MISSING_OR_UNDECODABLE` (exit 2) means
  no usable pair: e.g. absent private native screenshot, unsupported PNG,
  mismatched dimensions or invalid ROI. This is **INCOMPLETE**, not refuted.
- `PRIVATE_PIXEL_PAIR_METADATA_INVALID` (exit 2) means wrong build,
  unsupported provenance or inconsistent capture ordering.
- `nativeParityVerdict:"UNKNOWN"` remains invariant. Native execution and
  a camera pose verified independently of owner-provided labels remain absent.

CI only runs *synthetic in-memory PNG* tests proving decoder, gap arithmetic
and fail-closed behavior. It does **not** ship, process or claim any original
screenshot. This is a **nonblocking diagnostic** until SH-05/Thomas supply
real private matched frames; there is no red pixel threshold on routine PRs.
Owner assignments: **SH-05** native-world warning GPU cookie/layer8 hook;
**SH-14/SH-06** animated body/hands/death clips; **Thomas/SH-15** owner-local
and native matching/ROI evidence; **SH-10** acceptance metrics/provenance
and first reproducible differences. Protect the previously manually validated
7/7 Dojo loop, including F/E, kills, victory and REJOUER.

## Focused Dojo browser FPS gate (SH-10; gameplay-first, opt-in)

The built-in `__superhotSceneMetrics.p95FrameMs` rolls over up to 240 recent
rAF timestamps, **including non-gameplay states**. It cannot by itself provide
a clean idle-versus-combat comparison: its rolling window can mix pauses,
menus, and fights. The optional SH-10 profiler instead groups *real browser*
`requestAnimationFrame` intervals by an **operator-marked phase**. It only
records when the Dojo HUD is visible, combat controls are hidden, the page is
visible and `__superhotSceneMetrics.mode` reports native-source Dojo Web
gameplay. It reads app-reported draw counts at most once per second. No
renderer hook, native asset, private runner, new dependency or CI browser
claim is introduced.

After loading **SHRL_Dojo2 / build10 on Pages**, open DevTools and arm
**before** clicking Start. **Do not reopen DevTools during the fight:** releasing
pointer lock can pause the game and distort the FPS sample. Once playing,
use physical **number-row 7 = idle, 8 = combat, 9 = ragdolls, 0 = save** to
switch phases and export the trace without losing focus. These keys are scoped
to this opt-in capture, ignored while hidden/inactive or typing in editable
controls, and removed after save/stop. Route markers 1–6 remain separate.
A key-0 export is an owner-browser file download; it does not upload anything.
You may still mark from the console while paused; samples resume only when
Dojo gameplay is visible:

```js
const { startDojoFpsCapture } = await import(new URL('./scripts/acceptance-dojo-fps.mjs', document.baseURI));
window.sh10fps = startDojoFpsCapture();
window.sh10fps.mark('idle');      // arm now, click Start, then stand still for >=120 frames
// During actual gameplay, press 8 to start combat and 9 for ragdolls.
// After >=120 visible rAF frames in each of idle + combat, press 0 to save.
// The following manual calls remain an alternative ONLY when focus is not lost:
// window.sh10fps.mark('combat'); window.sh10fps.mark('ragdolls');
// window.sh10fps.save('dojo-fps.json');
```

The relative import works on both **Pages** (`/superhot-web/`) and localhost root; it does not require a second copy of the profiler.
Operator labels are *claims about the local activity*, not independently
verified combat intensity; the report also records maximum reported
`livingEnemies` and `activeRagdolls` for context. The browser requests a
download; confirm that it actually saved locally. The file contains only
rAF intervals, draw-count samples, Dojo identity, resolution and DPR; no
screen captures, geometry, source strings, paths, gameplay inputs or native
pixels. Do not commit real owner traces to Git.

```bash
node scripts/acceptance-dojo-fps-report.mjs --trace private/dojo-fps.json
# For ragdoll optimization reviews: opt-in strict observation gate.
node scripts/acceptance-dojo-fps-report.mjs --trace private/dojo-fps.json --require-ragdolls
node --test tests/acceptance-dojo-fps.test.mjs
```

The optional hotkeys are a capture ergonomics fix, not a gameplay feature; they have no effect until the module is imported and the recorder started. Avoid multiple simultaneous recorders. The CLI exits 2 on missing/corrupt/insufficient samples. It computes nearest-rank
p50/p95/p99 **browser frame intervals**, FPS at p95 frametime, hitch counts,
and reported WebGL draw calls for each operator-labelled segment. It requires
at least 120 active visible rAF intervals in each of idle and combat and at
least one draw sample in both. By default this does **not** require a
ragdolls segment, so its green status cannot validate ragdoll performance.
For ragdoll FPS reviews use `--require-ragdolls`: at least 120 rAF intervals
in the **ragdolls-labelled** segment plus a draw sample within that phase
observing >=2 concurrently active ragdolls. Draw counts are sampled at most
once per second; this does **not** prove two bodies remained active for all
120 measured frames. A positive status means **owner-supplied Web
samples analyzed**, not GPU timestamp-query measurements, not a human FPS
comfort verdict, not a passed full Dojo run, and not native MCD parity.
Compare two builds only at matching browser, resolution, DPR, GPU, workload
and capture rules; do not fabricate an FPS or assume that app-reported draw
counts measure all GPU work. During a restart, mark a new segment after
the next combat begins. Keep the existing SH-10 full-run recorder separate.


## SH-10 — enemy displacement receipt for blocked flank / breach baton (7 November 2026)

**Web gameplay-first diagnostic, not a MCD parity gate.** After PR #588 and
#589, the actual browser render snapshot already exposes live enemy
`x/y/z`, but the SH-10 full-run recorder previously dropped them. It could
witness kills/restart without distinguishing stationary enemies from an
enemy actually travelling after a failed flank. The v2 recorder now records
`motionFromFirstSampleMeters: {dx,dy,dz}` per actor on every rendered sample
when the host supplies finite Web coordinates. Each vector is **relative to
the first sampled Web position of the same actor ID**; absolute/world/source
spawn transforms are deliberately never serialized. Missing/unreasonable
coordinates are `null`, not zero. Precision is 0.00001 Web world unit; no
claim of native-unit calibration is made.

Use the **already documented** Start → F/E → 6/7 kills → win → REJOUER
capture on Pages/localhost. In the local validator output:

```bash
node scripts/acceptance-dojo-vertical.mjs --trace private/dojo-full-run.json
```

`observed.enemyMotion` now gives, for up to 12 actors, live-frame sample
count, cumulative sampled path length in Web world metres, maximum
single-sample step and net displacement from their first observation.
`actorsMovingOver5cm` is a **Web-only descriptive threshold**, not a
physics or MCD requirement. The diagnostic is also emitted for incomplete
full-run traces after the basic schema validates, making a blocked Dojo run
inspectable without forging a win. Missing telemetry gives the explicit
`UNKNOWN_NO_WEB_ENEMY_MOTION_TELEMETRY` status; available traces report
`WEB_ENEMY_MOTION_SAMPLED_OBSTACLE_CAUSE_UNKNOWN`.

**P0 SH-03 / SH-05 / Thomas:** in the real Dojo, place two equipped gunners
near an actual low pillar or cover, witness a failed optional flank and then
follow the **same enemy IDs**. Confirm one recovering gunner relinquishes
movement leadership and an eligible wingman visibly translates; check the
same situation at normal speed and TimeScale 0.005. A nonzero displacement
can demonstrate **Web translation occurred** but cannot identify the
obstacle, prove the fall-back algorithm caused it, certify muzzle
occlusion, collision safety or MCD-native behaviour. Pair this telemetry
with an operator-observed video/scene context, and treat lack of a viable
two-gunner scenario or sparse sampling as **INCONNU**, never native
refutation. SH-05 exclusively owns runtime repairs; this PR changes no
gameplay module, source geometry, commercial asset, renderer or CI config.

**Verification boundary:** Node tests for this diagnostic use authored
snapshots and are not actual browser execution. The opt-in owner WebGL
playthrough and FPS/draw-call measurements remain independently required
before any visible success claim.
