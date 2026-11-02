# SH-07 sound evidence ledger

> Current status (2026-11-02): exact Containers pistol, enemy-shot,
> player-hit, enemy-shatter and ready-cue bindings now drive a private local
> `AudioBufferSourceNode` path. Earlier synthetic-only/access-blocked passages
> below are retained as historical evidence and are superseded by the final
> integration section.

Scope: SUPERHOT: MIND CONTROL DELETE, Steam app 690040,
build 20299547, Unity 2018.4.14f1 (Mono Windows x86).
This ledger distinguishes native evidence from the independent Web prototype.

## Exact provenance

- Private research repository: TGrozner/superhot-research.
- Read-only inventory run 41367571984, artifact 13107847231:
  511 verified source files, 842307 Unity objects, 3703 scripts, 77 scenes;
  snapshot 2026-11-02T00:05:57.026Z.
- Private handoff run 41368361512, artifact 13108420851, path HANDOFF.md:
  Assembly-CSharp SHA-256
  ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257.
  Its preferred native audio research entry is
  spec/world/audio-vfx-deep.md. Related source:
  spec/world/replays-deep.md, resources/resources-report.md and
  runtime/observations.json. The latter contains five menu/run/movement/pause
  captures, not a verified per-sound playback trace.
- Handoff inventories 479 FSB5 payloads and 479 WAV gzip conversions.
  This is an ASSET INVENTORY claim only. It neither establishes a producer,
  the active clip, routing nor audibility. Original payload identity remains
  authoritative over conversions; no payload is published here.
- Web baseline commit: 9f01f92411b4e125b2c992deee53602a8c67c416,
  src/audio.js blob 952d399dfbd07da782ebff9ccfdbbcd394d041e2.
  This implementation synthesizes feedback and does not use game recordings.

Private handoff: https://github.com/TGrozner/superhot-research/actions/runs/41368361512
Private inventory: https://github.com/TGrozner/superhot-research/actions/runs/41367571984

## Claim ledger

| Question | Status | Evidence / missing proof |
| --- | --- | --- |
| Web methods shoot, enemyShoot, shatter, pickup, hit, empty, win are synthesized | PROUVÉ (WEB ONLY) | Public src/audio.js blob SHA above |
| Original installed audio-related resource inventory exists | PROUVÉ (SOURCE INVENTORY ONLY) | Private HANDOFF.md, run 41368361512 |
| Original playback producer identities and call sites | INCONNU | Native assembly/method/token and verified call chain |
| Guards, cooldowns, interruption, duplicate policy | INCONNU | Branch paths and positive/negative scenarios |
| Clip-to-producer binding, gain, spatial routing | INCONNU | Source file checksum and serialized object identity |
| Audio scaled/unscaled/DSP time semantics | INCONNU | Exact original time source per sound |
| Sound heard at output device | INCONNU | Offline synchronized playback observation |

PROUVÉ means exact source or reproduced test. OBSERVÉ means captured
behavior with scenario/version. INCONNU means evidence is insufficient.
Event presence, method invocation and audible output are separate claims.

## Next private, read-only work

1. Read spec/world/audio-vfx-deep.md first, then related world reports;
   do not rediscover existing reverse engineering with a broad scan.
2. Correlate described producers with managed-metadata.json, and where
   necessary the original managed/ and il/Assembly-CSharp.il methods.
3. Resolve sound objects with the Unity serialization inventory using
   (owner, path_id), not display name alone. Record exact original SHA,
   assembly/method token, branch guard, parameters, event time domain.
4. Prove one complete producer → guard → playback call → linked resource,
   then capture an offline audible positive case and a falsifying negative.
5. Treat unresolved StoryApps audio correspondences as unresolved;
   do not silently fill the gap from the existing Web synth.

The current GitHub connector reads private workflow runs and artifacts,
but offers no workflow-dispatch operation. No new audio-specific query
was launched during this pass. Earlier corpus queries retrieved unrelated
type counts, a TimeControl excerpt and a screenshot.

## Independent Web audio modules (not native parity)

- src/sound/timeline.js: explicit caller-selected REAL and WORLD clocks,
  bounded deterministic queue, pause, cancellation and diagnostics.
  Cross-clock simultaneous dispatch follows enqueue order by Web policy,
  not a measured native guarantee.
- src/sound/prototype-sink.js: only the seven synthesized Web methods
  above; callback accepted does not prove an audible waveform.
- tests/sound-*.test.mjs: Node tests for clocks, pause, cancellation,
  ordering, failure diagnostics and adapter mappings.

The modules are deliberately not wired to src/main.js or src/audio.js;
SH-05 owns integration. No game audio or binary is included here.
The first verified original producer/guard/clip chain is the next
parity gate before native event mappings can be asserted.

## SH-07 follow-up: independent Web metadata

**PROUVÉ (WEB ONLY):** src/sound/params.js recursively snapshots and freezes event parameters before the timeline assigns the event ID. Nested arrays and objects cannot be changed through the caller's original references. Invalid inputs fail before enqueue; tests/sound-params.test.mjs checks mutation, cycles, accessors, invalid numbers, and size limits.

**INCONNU (NATIVE MCD):** this is a defensive Web policy, not evidence of native time domains, producer conditions, playback parameters or audible output. The private handoff referenced above names spec/world/audio-vfx-deep.md as the next targeted read; primary method bodies and observed playback have not been obtained. Accepted Web dispatch is not proof of a heard sound.

## Dispatch-time cancellation (Web only)

PROUVÉ (Web): `src/sound/timeline.js` now allows a delivery callback to cancel later events already eligible in the same flush. `cancel`, `clear`, and `reset` suppress the remaining events, and the returned count includes only callbacks invoked. Nested flushes return zero; new callback-scheduled events await a subsequent flush. Four cases are covered in `tests/sound-inflight-cancel.test.mjs`.

INCONNU (MCD): none of these policies attest native Unity producer guards, sound scheduling, playback, or audibility. The research handoff and exact provenance in the earlier ledger remain the only known leads. No additional primary MCD audio evidence was obtained.


## SH-07: finite clock precision (independent Web policy)

**PROUVÉ (Web logic and tests only):** the former fixed 1e-9 second
eligibility tolerance could dispatch an event delayed by 1e-10 seconds at
clock time zero, before *any* advance. The timeline now compares clock
values with relative IEEE-754 machine precision, and its enqueue timestamp
prevents a positive-delay event from dispatching before that clock advances.
It rejects positive delays and clock increments too small to be represented
at the current clock magnitude, with atomic validation for both clocks.

The near-due precision allowance can still schedule a callback up to roughly
one representable clock quantum before its computed due timestamp **after**
clock progression; it is a stated numeric tradeoff, not a physical audio
latency claim. No callback acceptance is interpreted as audible playback.

**Tests:** `tests/sound-clock-precision.test.mjs` isolates subnanosecond
delays, one-ULP delay at a nonzero clock, lost-precision enqueue and advance,
atomicity and fractional time accumulation. Other sound timeline tests remain
applicable. This is synthetic Node/Web behavior only.

**INCONNU (MCD):** native audio producer methods, their guards, real/DSP/world
clock source and audible output remain unverified. Private provenance remains
Assembly-CSharp SHA-256
`ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257`,
handoff run 41368361512 / artifact 13108420851; none of those sources
proves this Web policy. Primary bounded read still needed via private
`corpus-query`: `operation=read, path=spec/world/audio-vfx-deep.md,
start=1, count=200` (private result only). No proprietary asset or PCM
is included in this repository.

## SH-07: synthetic sound provenance gate (Web-only)

**PROUVÉ — WEB UNIQUEMENT:** before this change, `src/sound/prototype-sink.js`
selected methods by `event.name` alone. An event labeled `unverified` or
`native-proven` but named `shoot` invoked the synthetic `audio.shoot()`
callback. It could therefore appear in timeline diagnostics as *accepted* even
though its declared origin was not prototype. The baseline behavior is directly
visible in the former method dispatch condition, public blob
`3ad2d91f94877f22c6fedfc18af5bddb14f18a7e`.

The adapter now invokes a synthetic effect only if
`event.evidence === SOUND_EVIDENCE.PROTOTYPE` **and** the name is on the
existing seven-name allowlist **and** the method exists. Other classifications
are rejected explicitly by the timeline. `tests/sound-evidence-gate.test.mjs`
covers the same-name mismatch, an explicit prototype event, direct adapter
invocation and accepted-versus-rejected queue diagnostics. Reproduced locally
against a minimal module fixture: baseline 2 failing tests out of 3; corrected
adapter 3/3 passing. CI on the actual repository is the integration verdict.

**PROUVÉ (meaning limited):** “accepted” only means the JavaScript callback
returned without throwing or returning `false`. This is *not* an audible output
test; even the explicit prototype event may be silent (e.g. browser audio
context suspended or not initialized). The adapter does not synthesize or
claim a replacement for unknown native clips.

**INCONNU — MCD:** no conclusion about Unity method identity, serialized clip,
guard, timestamp, audio engine output or perception follows from this defensive
Web classification. `SOUND_EVIDENCE` is caller-supplied metadata, not a proof
certificate. The bounded private read remains
`{"operation":"read","path":"spec/world/audio-vfx-deep.md","start":1,"count":200}`,
with follow-up assembly methods / Unity `(owner,path_id)` only if the report
identifies them. Source build and Assembly SHA are recorded above. No native
payload, recording or extracted method body is published.

## SH-07: asynchronous sound callback results (Web-only safety gate)

**PROUVÉ — source Web et scénarios synthétiques :** the synchronous queue
previously treated a `Promise` returned by `dispatch(event)` as accepted,
even if it later resolved to `false` or rejected. Similarly, the prototype
sink always returned `true` after invoking a recognized synthetic method,
even when that replacement returned a rejected Promise. The starting public
blobs are `src/sound/timeline.js` `93bb4298484becf24fa5f9ffde4d9d71d110413a`
and `src/sound/prototype-sink.js` `3d79a7ce81ed171d19ede68e2c0ebb19d880b591`.

Both adapters now require a **synchronous** completion. A Promise or thenable
is counted as a failed delivery; its rejection is observed to avoid an
unhandled-rejection leak. Remaining queued events continue dispatching.
No background completion is inferred and the queue never retries the event.
This does not cancel an asynchronous side effect that a faulty callback may
have started before returning. The pre-existing `src/audio.js` synth returns
synchronously and remains untouched. Regression cases reside in
`tests/sound-async-dispatch.test.mjs`. A successful test proves only these Web
accounting rules, **not sound emitted, heard, or native behavior**.

**INCONNU — MCD native producer/guard/timing/audibility:** unchanged. Private
source baseline remains build 20299547 / Unity 2018.4.14f1, installed
`Assembly-CSharp` SHA-256
`ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257`,
handoff run 41368361512 / artifact 13108420851. No native method/clip
identity or audible test was obtained by this Web-only change. The bounded,
private `corpus-query` read of `spec/world/audio-vfx-deep.md` lines 1–200
is still the required next input; do not publish proprietary content.

## SH-07: unprintable callback diagnostics (Web prototype)

**PROUVÉ (source Web):** `src/sound/timeline.js` previously formatted
callback exceptions inside an unguarded catch. If the thrown object's
`message` getter or string conversion raised another exception, a flush
stopped early. The formatter now uses its own error boundary and records a
fixed fallback diagnostic. The two regressions are covered in
`tests/sound-async-dispatch.test.mjs`.

**INCONNU (MCD native):** playback producers, Unity methods, guards, clips,
clock domains, mixing, and audibility are unverified. This is a Web-only
safety improvement, not evidence of an original-game event or audible sound.
No original audio, asset, or binary is included.


## SH-07 P0 — source-native Gun audio branches (2026-11-02)

**Bridge status:** historical passages above about missing `workflow_dispatch` are
superseded. The authorized PRIVATE issue-triggered `corpus-query` bridge now works.
Private issue #9, run `41425740901`, artifact `13133582906` returned
`spec/world/audio-vfx-deep.md` (50 lines; UTF-8 text SHA-256
`bf67f8f38a00b191a3bfbaf5aa69fa09f24be7f410e174838e6e58229fc3d691`).
The separate #7 returned the same report. No raw corpus result is copied here.

**PROUVÉ — native managed *source branches*, not their runtime activation:**
private issue #34 / run `41430553462` / artifact `13134122741`,
`managed/Assembly-CSharp/Gun.cs:99–147,158–204,206–217`, retrieved
text SHA-256 `ae7d70585e54e8c7887357a49aa2b86e384001c89ebdba6b36021bf605b1fdbf`.
Build `20299547`, Assembly SHA-256 recorded above. After the `Gun.Attack`
early exit (Thrown, not ready, or failing optional shooting check), positive
ammo and inactive NoShooting reach the virtual `Fire` call; positive ammo
with NoShooting instead goes to Throw. At exactly zero ammo, `FireNoAmmo`
executes and decrements ammo; with NoShooting inactive its branch requests
`PlayClip` for `SFXNoAmmo` at explicit gain `0.4` through the
`mixerSfxEnvironment` field. Below zero ammo goes to a different throw
path. This proves a request site, not the final waveform.

In the **base `Gun.Fire` implementation**, selection of secondary shot SFX
requires **both** `Random.value > 0.6` (strict) and non-null `SFXAttack2`;
otherwise the primary `SFXAttack` is selected. Both branches request
`PlayClip` at `0.6` through `mixerGunshots`, followed by randomized audio
parameters `(0.15, 0.15, startFromBeginning: true, relativePitch: true)`.
The virtual `Fire` may be overridden by a derived gun: **do not** generalize
the base sound selection to every weapon family. A separate optional
`SFXReadyToShoot` schedules a later method at the attack delay in
`Gun.Attack:120–123`; this PR does **not** reproduce that deferred sound.

**PROUVÉ — separate native layer source:** private issue #19 / artifact
`13133617525`, `AudioClipChangerGroupPlay.cs:1–70` text SHA-256
`9ad76fa465849c52ab78a1536a1600519da3739a58291802767ed6fa543f17aa`;
issue #28 / artifact `13133373200`, `AudioClipChanger.cs:1–41`
text SHA-256 `5cc071c17f4ac855ee6d4dd6417e19c761ca7a0c17c1a62dbbb374d0465c4c04`.
The group starts both AudioSources at Awake, ramps its progress toward slow
only below timescale 0.1 or toward fast only above 0.1 with nonzero player
velocity, stepping with **unscaled** delta; at exactly 0.1 neither branch
changes it. The pair maps progress to respective volumes and periodically
synchronizes clip positions. The C# field initializers for ramp times are
1 and 0.5 seconds, but scene-serialized overrides and actually instantiated
pairs remain **INCONNU**; no layer audio was ported in this gun-focused PR.

**PROUVÉ — independent Web mapping only:**
`src/sound/mcd-gun-cues.js` provides pure explicit-argument branch selection
and a generated-sound adapter to the *pre-existing Web oscillator methods*
`shoot` and `empty`. Both native shot variants deliberately reuse the
same **synthetic** Web sound. `tests/sound-mcd-gun-cues.test.mjs` verifies
the strict branch guards and callback accounting (7/7 local Node tests).
This validates source-level rule translation only, not scene or auditory parity.

**INCONNU:** bindings of `SFXAttack`, `SFXAttack2` and `SFXNoAmmo` on a
specific weapon instance; the active channel and mixer output; clip identity,
filters, spatial attenuation, Unity mixer gain, exceptions, speaker output and
human audibility. No synchronized native/browser test has been conducted.
The synthesis adapter's returned `true` means **callback invoked only**.

**SH-05 integration request, NOT performed by this lane:** only when a specific
weapon/fire path and serialized fields are verified, pass the real readiness,
NoShooting, ammo and optional check state into `classifyMcdGunAttack`;
call `selectBaseGunFireCue` **only after actual base `Gun.Fire`**, or
`selectGunDryFireCue` for the confirmed dry-fire path, and pass the selected
cue to `createGeneratedMcdGunCueSink(audio)`. The existing `audio.init()`
needs a resumed browser AudioContext after user gesture. No changes to
`src/main.js` or `src/audio.js` are authorized here; SH-05 owns the
browser-side connection, explicit speaker test and resulting waveform check.
The current Web prototype reloads magazines and does not yet model native
weapon states, so wiring on matching labels alone would be a false parity claim.

## SH-07 — source-bounded movement-dependent slow/fast audio layers

**PROUVÉ (native managed code, static only):** private corpus issue #19 /
run `41430135614` / artifact `13133617525` read
`managed/Assembly-CSharp/AudioClipChangerGroupPlay.cs:1-70` (UTF-8 excerpt
SHA-256 `9ad76fa465849c52ab78a1536a1600519da3739a58291802767ed6fa543f17aa`).
Private #28 / artifact `13133373200` read
`AudioClipChanger.cs:1-41` (excerpt SHA-256
`5cc071c17f4ac855ee6d4dd6417e19c761ca7a0c17c1a62dbbb374d0465c4c04`).
Original Assembly-CSharp SHA-256 is at the top of this ledger. Original
methods, not their proprietary implementation text, are the evidence.

`AudioClipChangerGroupPlay.Awake` chooses the slow AudioSource of the first
changer as master and requests `Play` on both sources of every changer.
Its `Update` decreases progress toward 0 only while `timeScale < 0.1`
and progress > 0. It increases toward 1 only while `timeScale > 0.1`,
player velocity magnitude > 0 and progress < 1. At exactly 0.1 neither
branch advances; at a larger timescale with a stationary player progress
holds. Both ramps use `Time.unscaledDeltaTime`, with different durations.
The volume writes run only if progress differs from the previous progress;
the field initializer `lastProgress=-1` means the first Update writes
even when progress remains zero.

`AudioClipChanger.UpdateVolume` maps progress linearly to the fast
AudioSource and (1-progress) to the slow AudioSource using EACH changer's
min/max volume fields. The group periodically copies the master playhead
position into both sources for each changer, with `WaitForSecondsRealtime`
**between changer iterations**, rather than a single simultaneous sync
of the whole group. C# field initializers are slow-duration 1s,
fast-duration 0.5s, sync-frequency 0.1s, slow-max 0.8, fast-max 0.6 and
volume minimums 0. These are **not verified scene-serialized overrides**.

**PROUVÉ (WEB calculation only):** the new pure
`src/sound/mcd-movement-crossfade.js` translates the two source predicates,
MoveTowards progress and per-changer volume formulas, with explicit caller
durations, input timescale, player-speed magnitude and volume parameters.
`tests/sound-mcd-movement-crossfade.test.mjs` exercises initial Update,
both thresholds, stationary behavior, unscaled ramp, bounds and separate
volumes. No AudioContext is opened or clip played by these functions.

**INCONNU:** whether a specific `AudioClipChangerGroupPlay` and its
`AudioClipChanger` pair are active in Containers/build28, actual scene
overrides, linked clips `(owner,path_id)`, mixer output, runtime scheduling
of the coroutine, and any heard waveform. JS double calculations are not
bit-exact Unity float simulations. There is **no native playback trace**.

**SH-05 hookup request (not performed):** first verify actual scene
instance and its serialized fields, then feed measured timeScale, player
velocity magnitude and unscaledDeltaTime into `stepMcdMovementLayer`
and apply `computeMcdMovementLayerVolumes` to generated (legally
authored) slow/fast layers only when `updateVolumes=true`.
The Web prototype's existing oscillator sounds are SYNTHETIC and
must not be relabeled as native MCD clips. Browser audible testing
requires a resumed user-gesture AudioContext and a captured, monitored
output; method invocation alone does not prove it.


## SH-07 — delayed \`Gun.PlayReadyToShootSound\` (native source; no audible claim)

**PROUVÉ — static source methods, not a recorded execution.** Steam MCD build
\`20299547\`, Unity \`2018.4.14f1\`; installed \`Assembly-CSharp\` SHA-256
\`ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257\`.
The PRIVATE bounded corpus read [research #34](https://github.com/TGrozner/superhot-research/issues/34)
(run \`41430553462\`, artifact \`13134122741\`; UTF-8 excerpt SHA-256
\`ae7d70585e54e8c7887357a49aa2b86e384001c89ebdba6b36021bf605b1fdbf\`)
establishes \`Gun.Attack:99–127\`: after the ready/thrown/optional-check
guards, on **positive-ammo** and **NoShooting inactive** it invokes virtual
\`Fire\`, decrements ammo, and only when \`SFXReadyToShoot != null\` requests
\`Invoke("PlayReadyToShootSound", GetAttackDelay())\`.
It is *not* a sound at the moment of shooting, nor a reload command.

**NEW PROUVÉ — separate callback-time guard.** PRIVATE [research #108](https://github.com/TGrozner/superhot-research/issues/108),
run \`41451009752\`, artifact \`13143868556\`,
\`managed/Assembly-CSharp/Gun.cs:356–365\`, excerpt UTF-8 SHA-256
\`a14cf65d953dfd5219ee07173e968cec0ac596b0fbe83c7dd9d2c432a5857c29\`.
At callback invocation, \`PlayReadyToShootSound\` **returns without requesting
audio when the weapon state is \`Thrown\`**. Otherwise it requests
\`AudioManager.PlayClip(SFXReadyToShoot, null, volume=1,
mixerSfxEnvironment)\`. The callback itself does not repeat the non-null clip
test. A gun thrown *after* firing but *before* callback must therefore not
request the ready cue via this method. The callback's exact fire time and
whether a particular Unity instance invokes it remain unobserved.

**PROUVÉ — isolated Web translation, not playback:** \`src/sound/mcd-gun-ready-cue.js\`
exposes \`planMcdGunReadyInvoke\` for the scheduling guard and
\`resolveMcdGunReadyCallback\` for the later thrown-state guard. It passes
through the explicit \`GetAttackDelay\` result **without choosing a duration,
clock domain, or automatic JavaScript timer**; even a zero delay remains only
a request to Unity's \`Invoke\`, not a claim of synchronous execution.
\`tests/sound-mcd-gun-ready-cue.test.mjs\` exercises the positive path,
counterfactual blocked/NoShooting/zero-ammo paths, clip-absent scheduling,
and throwing the gun between request and callback.

**OBSERVÉ:** no recorded native scene event, browser speaker output, waveform,
or paired timing measurement for this cue. Green Node tests would establish
only branching of the pure JS request adapter.

**INCONNU:** the active Containers weapon class and its \`SFXReadyToShoot\`
binding (asset owner/path_id), effective \`GetAttackDelay\` value, Unity
\`Invoke\` delivery/suppression/cancellation semantics under timescale and
pooling, clip identity, mixer gain/routing, attenuation and audibility.
A callback \`PlayClip\` request is **not** evidence that sound was heard.
No native clip, commercial asset, raw source excerpt or output bytes are
published.

**SH-05 integration handoff (not performed here):** verify a real weapon
instance and source path first; feed the already classified \`Gun.Attack\`
outcome and the actual ready-clip presence to the planner. Only after the
corresponding callback actually executes, check \`Thrown\` at **callback time**
and route a returned intent to an explicitly labeled **generated Web** cue.
Do not treat the prototype's magazine reload or \`R\` key as the native
ready-to-shoot callback. Explicit browser AudioContext-resume + output
measurement and native paired observation are the acceptance gate for
\`audible\`; \`src/main.js\` and \`src/audio.js\` remain SH-05-owned.

## SH-07 — original local browser playback integration

**PROUVÉ (static producer → serialized binding → converted media identity):**
Containers build 28 contains `level28:18701` (`GunPickup`, GameObject 167,
`PistolGunPickup`). Its `gunPrefab` resolves through file ID 4 to
`sharedassets0.assets:711`, whose `PistolGun` component is
`sharedassets0.assets:4849`. The component carries five rounds
(`ammoMin=ammoMax=5`), base `attackDelay=0.6000000238418579`, and these exact
clip pointers:

| Web event | Serialized source | Clip owner/path_id | Local manifest ID | Native request parameters |
| --- | --- | --- | --- | --- |
| pistol primary shot | `PistolGun:4849.SFXAttack` | `sharedassets0.assets:604` | `audioPistolFirePrimary` | gain .6, relative pitch ±.15, volume ±.15, Gunshots |
| pistol alternate shot | `PistolGun:4849.SFXAttack2` | `sharedassets0.assets:623` | `audioPistolFireAlternate` | selected only for `Random.value > .6`; same parameters |
| pistol empty | `PistolGun:4849.SFXNoAmmo` | `sharedassets0.assets:605` | `audioPistolEmpty` | gain .4, Env SFX |
| pistol pickup | `PistolGun:4849.SFXPickup` | `sharedassets0.assets:606` | `audioPistolPickup` | Containers pickup fields are null, so `Weapon.Pickup` reaches the weapon fallback; gain .9, pitch/volume ±.15 |
| empty/reloaded pickup | `PistolGun:4849.SFXPickupReloaded` | `sharedassets0.assets:621` | `audioPistolPickupReloaded` | gain .9, pitch/volume ±.15; not the default five-round pickup branch |
| ready tick | `PistolGun:4849.SFXReadyToShoot` | `sharedassets0.assets:626` | `audioPistolReady` | gain 1, Env SFX, requested after actual `GetAttackDelay` |
| pistol throw | `PistolGun:4849.SFXThrow`, throwaway pickup4858 has no override | `sharedassets0.assets:600` | `audioPistolThrow` | gain .8, initial pitch1.5 with additive ±.2, volume multiplier ±.2, Env SFX |
| enemy pistol fire | `AudioGameObjectResources.EnemyGunShot` → prefab `resources.assets:1853` → AudioSource `:27508` | `sharedassets0.assets:604` | `audioEnemyFire` | prefab volume .8, additive pitch ±.4, spatial, max distance 300 |
| player hit | `AudioResources.Player.Hit` in `resources.assets:29456` | `resources.assets:1720` | `audioPlayerHit` | volume .7, pitch 1, nonspatial |
| enemy shatter | `AudioGameObjectResources.EnemyShatter` → prefab `resources.assets:1898` → AudioSource `:27523` | `resources.assets:1579` | `audioEnemyShatter` | volume 1, pitch 1, spatial, max distance 30 |

The ignored private
`spec/world/browser-audio/manifest.json` records the source owner/path IDs,
producer/prefab chains, parameters and SHA-256 of each unpacked WAV. The WAV
bytes live only in `private/analysis/2026-11-02-mcd/spec/world/browser-audio/`;
neither bytes nor base64 are committed to the public source.

**PROUVÉ (public Web implementation; graph execution observed below):**
`src/audio.js` exports `MCD_AUDIO_ASSET_KEYS` and keeps
the existing `createAudio()` methods. `init()` is the only operation that
creates/resumes `AudioContext`, so the caller must invoke it from a user
gesture. `loadLocalAssets(manifest)` fetches and decodes the local manifest
URLs once per URL. `setOriginalMode(true)` makes recovered events create a
real `AudioBufferSourceNode`, gain node, and (when a position is supplied) a
bounded HRTF panner. This mode fails closed: no procedural waveform substitutes
for a known native binding when its local file is absent or fails to decode.
`setOriginalMode(false)` is the explicit default for the independent public
demo and preserves its existing oscillator/noise feedback, reported as
`procedural-fallback` with reason `original-mode-disabled`. `win()` remains
procedural in either mode because this integration did not establish its
native clip chain.

Each successful call returns source metrics: event and clip identity,
owner/path ID, decoded duration/sample rate/channel/frame counts, requested
native mixer group/priority, requested and bounded gain,
native/world/effective pitch, spatial bounds and actual AudioContext start
time. `getMetrics()` also exposes the selected original/demo mode, observed
fetched-WAV byte length and SHA-256 (when browser SubtleCrypto is available),
loaded-decoder facts, active source count, pending ready cues and the last
playback result. These are browser-graph observations, not proof that a
speaker or human listener heard the sound.

**Ready cue and source clock:** `scheduleReady({delaySeconds,
isWeaponThrown})` queues against the caller-fed WORLD clock;
`advanceWorldTime(worldDeltaSeconds)` advances it. The guard is called only
when due, reproducing the callback-time `Thrown` check rather than capturing
state at fire time. There is deliberately no `setTimeout` and no implicit
schedule inside `shoot()`. The root gameplay owner must schedule only after
the positive-ammo `Gun.Attack` fire branch using its actual delay, cancel on
weapon destruction, and feed the same source-world delta used for gameplay.

`updateWorldAudio({aggregateTargetTimescale, customAudioTimescale})` implements
the recovered `AudioManager.CalculateSoundScale` step (custom scale when
greater than -.5; otherwise .1 interpolation toward
`clamp01(aggregate/.65)`, snapping above .99), then the recovered mixer Pitch
mapping from `[.01,1]` to `[.3,1]`. It updates already-playing and subsequent
native buffer sources. The caller still owns exact Update/LateUpdate ordering
and the aggregate time-shifter calculation.

**Limits:** Web Audio HRTF/inverse distance is not Unity's mixer or
log-rolloff implementation; mixer group DSP, reverb and platform output are
not reproduced. Gain is capped at 1 for browser safety, so the upper tail of
the native pickup randomization (up to 1.035) is intentionally bounded and
reported as requested versus applied gain. Exact RNG stream parity depends on
the caller; a caller-resolved pistol variant can be passed explicitly.
Node behavioral tests exercise decode caching, graph API calls through a fake
AudioContext, metrics, panning, ready-cue world delay/callback guard and
active-source pitch updates. They are not a substitute for native Web Audio.

**OBSERVÉ in actual Chromium at `/`:** after clicking “Jouer dans Containers”,
the context reached `running`, nine distinct WAVs decoded across ten bindings,
and enemy/primary fire reused one URL. A player shot decremented5→4 and started
`sharedassets0.assets:623` as an `AudioBufferSourceNode`; moving through the
world-time cooldown started ready clip626 with no pending cue left.
Throwing consumed the held weapon and played original clip600, decoded as
48000Hz mono/27881 frames. An analyser connected before the action measured
a nonzero peak of0.66750 in the actual browser audio graph. Its WAV SHA-256 was
`8fab8e5d46cdbb9edd960634162e0898a8177e47f0375e386c1b71668c9dcb8e`.
This replaces the incorrect gunshot formerly emitted on throwing and proves
graph signal, not physical speaker audibility or native mixer parity.
