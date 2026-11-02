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

## SH-07 P0 — AudioManager.PlayClip: native request gate and mixer intent

**PROUVÉ, managed source only** — SUPERHOT: MIND CONTROL DELETE Steam
build 20299547, Unity 2018.4.14f1, Assembly-CSharp SHA-256
`ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257`.
Three **private bounded reads**, SHA-256 independently checked:

- Research [#111](https://github.com/TGrozner/superhot-research/issues/111):
  `AudioManager.cs:179–358`, run 41462927229 / artifact 13150122330,
  UTF-8 excerpt SHA-256 `99389e315cdcbbf5bbee01482f33df113ab05ba86158221bd716352986cb879d`.
- Research [#112](https://github.com/TGrozner/superhot-research/issues/112):
  `AudioManager.cs:359–533`, run 41463059993 / artifact 13149727115,
  SHA-256 `f75f9293ead262b90f1ec9f65534cd15b503aee50d3d9f413c15f02d2125c6b4`.
- Research [#113](https://github.com/TGrozner/superhot-research/issues/113):
  `AudioManager.cs:534–643`, run 41463176601 / artifact 13148839109,
  SHA-256 `0f5ace43712f182a9961ce6088bfc50f03580d7c433a28bae5a9f189b7be0b89`.

`AudioManager.PlayClip(AudioClip,...)` at lines 499–573 returns its empty
effect **in this order** if the clip is null, the mixer channel is null, or
the clip is still on cooldown. `CheckCooldownActive` walks tracked instances
whose clip instance ID matches and returns the result of the **first enabled**
`SetCooldown`; matching instances with the effect disabled are skipped. Thus
an already-playing match alone is not a cooldown, and these weapon producers
must not acquire an invented overlap guard.
Passing those checks requests a pooled AudioSource;
if the pool reused an instance, it first pauses it. The source is configured
with the requested volume, priority, loop flag, pitch and mixer channel,
a 0-second clip playhead, logarithmic rolloff, and spatialBlend=1 **only**
when a position was supplied (otherwise 0). Explicit bypass OR the interface
SFX channel sets all three audio bypass switches. A **strictly positive**
playDelay requests `AudioSource.PlayDelayed`; zero/negative requests
`AudioSource.Play`. Pitch zero **warns**, but is not a blocking guard.
`PlayClip(AudioResource,...)` forwards that resource's serialized fields;
their presence alone does not prove a particular clip played.

**PROUVÉ, additional native mixer request:** `AudioManager.Update` calls
`CalculateSoundScale` before `UpdateMixers`. The former uses custom audio
timescale when strictly greater than -0.5; otherwise each Update uses
`Lerp(previous, Clamp01(aggregateTargetTimescale/0.65), 0.1)`, snapping
values strictly above 0.99 to 1. Mixer writes are skipped when
`Time.unscaledDeltaTime > 0.2`; otherwise `UpdateMixerScale` requests
the Pitch/Reverb parameters via `ScaleMapping(soundScale)` at
`AudioManager.cs:378–414`. This is **not** a measured audio pitch, and
the 0.1 Lerp factor is per Update, not per second. Initial/scene
overrides and actual mixer responses remain unverified.

**PROUVÉ, Web integration:** `src/sound/mcd-playclip-intent.js` models the
ordered early exits and AudioSource request. `src/audio.js` now invokes that
planner in the real original-mode producers for player shot, dry fire, pickup,
ready tick, throw and player hit. An `empty-effect` result returns before a Web
`AudioBufferSourceNode` is created. Enemy fire and enemy shatter deliberately
bypass this planner because their recovered native producers use
`PlayPrefabSound`, not `PlayClip`.

The accepted request supplies Web-applicable source volume, pitch, loop,
spatial choice and immediate/delayed start. Web Audio has no per-source Unity
priority equivalent, so priority remains diagnostic rather than a playback
control. Pitch zero remains a valid request and produces a zero playback rate;
it is not converted into a rejection.
The browser graph has no Unity mixer DSP/reverb chain, so interface/explicit
bypass flags have nothing real to disconnect and are not exposed as fake Web
mixer parity. Ready timing remains the separately recovered caller-fed WORLD
delay with its callback-time `Thrown` guard. Throw remains clip
`sharedassets0.assets:600` with base pitch 1.5 plus absolute ±.2
randomization.

The concrete Containers pistol bindings are the owner/path IDs in the table
above: primary/alternate/empty/pickup/reloaded-pickup/ready/throw are
`sharedassets0.assets:604/623/605/606/621/626/600`; player hit is
`resources.assets:1720`. Nine distinct private WAVs back ten bindings because
enemy fire and the primary pistol shot share clip 604. No commercial audio,
decompiled source, or captured output is committed.

The integrated weapon producer calls do not chain `SetCooldown`, so their
planner input is false even while another matching browser source is active.
This follows the native first-enabled-effect lookup rather than treating
“any matching clip is playing” as cooldown. Planner tests cover ordered guards
and source settings independently; synthetic AudioContext behavior tests cover
unloaded-file refusal, overlapping ordinary shots, shared waveform caching,
throw randomization and callback-time ready guards. They do not establish
speaker output or MCD runtime execution.

**Observed after integration:** the actual root's keyboard throw removed the
held weapon and started clip600 through the integrated planner. A separate
browser scenario invoked the real production audio API and real AudioContext:
primary shot604 produced a measured peak0.58589; advancing its explicitly fed
world delay by0.6 seconds started ready626. This API scenario is not a
pointer-lock gameplay shot: the current verification browser refused pointer
lock, so the post-merge mouse-shot path was not replayed. Earlier root-shot
evidence above predates this planner integration.

**Remaining boundary:** Unity pool reuse/pause, actual mixer DSP and reverb,
platform output and human audibility are not reproduced. A successful request
or nonzero graph signal remains weaker than physical speaker audibility or
synchronized native/Web parity.

## SH-07 P0 — EnemyShatter is a pooled AudioPrefab request, not PlayClip

**PROUVÉ (managed static path; source request, not audible output).** MCD Steam
build `20299547`, Unity `2018.4.14f1`; Assembly-CSharp SHA-256
`ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257`.
The original body-kill producer and two complementary manager/type definitions
were read privately in bounded excerpts, with content SHA-256 recorded here:

- Private research [#89](https://github.com/TGrozner/superhot-research/issues/89)
  (run `41442138603`, artifact `13139513152`),
  `PejAiBody.cs:565–602`, excerpt SHA-256
  `2f938d5c65af66128acd324d52b6fb542c2ca369bf2e6f1bb298227c5e913c60`.
- Private research [#113](https://github.com/TGrozner/superhot-research/issues/113)
  (run `41463176601`, artifact `13148839109`),
  `AudioManager.cs:579–612`, excerpt SHA-256
  `0f5ace43712f182a9961ce6088bfc50f03580d7c433a28bae5a9f189b7be0b89`.
- Private research [#120](https://github.com/TGrozner/superhot-research/issues/120)
  (run `41470731503`, artifact `13154468332`),
  `AudioGameObjectResources.cs:1–46`, excerpt SHA-256
  `2c5a4f14fe7747063cd86b4a402d19550d5a7cf81f8cdd471794753046255ef5`.
- Private research [#121](https://github.com/TGrozner/superhot-research/issues/121)
  (run `41470858938`, artifact `13154858152`),
  `AudioPrefab.cs:1–6`, excerpt SHA-256
  `783adfce973e033b8c22b27a82eae8112080d023277423d1289c76444fbd5112`.

**Native order/guards:** `PejAiBody.Kill` exits when the controller was already
dead; otherwise after the controller kill it asks `PlayPrefabSound` for
`AudioGameObjectResources.EnemyShatter` at enemy position + (0,1.5,0).
The static initializer declares `AudioPrefab("EnemyShatter", 5)`; the 5
is a *declared pool size*, not an observed available pool. The prefab overload
returns empty when its named pool is missing; on reuse it pauses the existing
source before `Play`, otherwise registers a new active source. The request
is spatial, unmuted, and (only for positive randomization) adjusts its
preexisting pitch additively. The unrelated `PlayClip` null-channel/clip
cooldown guards must **not** be applied to this overload.

**PROUVÉ (serialized binding, separate evidence):** the owner's privately
verified `spec/world/browser-audio/manifest.json` connects
`AudioGameObjectResources.EnemyShatter` to
`resources.assets:1898` → AudioSource `:27523` → commercial
`AC_Enemy_Death` clip `resources.assets:1579`; the public inventory above
records the binding, never the original bytes. This resolves the serialized
clip identity but still does not prove that the runtime pool was initialized.

**OBSERVÉ (Web, not native parity):** SH-05's current
`src/audio.js` can play this locally supplied original WAV via
`audio.shatter()` as an `AudioBufferSourceNode` after a browser user gesture.
That implementation does **not** execute the Unity prefab pool guard; the
mainline Chromium analyser result documented above concerns a *weapon throw*,
not a measured enemy-death event. No speaker audibility, identical Unity
mixer effects, or native paired timing is claimed.

**INCONNU / acceptance gate:** runtime pool membership and activation; the
actual Containers enemy's native `PejAiBody.Kill` dispatch; native/Unity clip
start and audible output under a paired encounter. The pure
`src/sound/mcd-prefab-sound-intent.js` requires the pool state explicitly and
never guesses it. SH-05 alone may wire the native death-event policy to the
existing local-only playback, after qualifying the enemy path and performing
a real browser capture. No shared integration file or original media is
altered by this PR.

### SH-07 pool registration source — private research #124

**NEW PROUVÉ (static source, build `20299547`):** bounded read
[research #124](https://github.com/TGrozner/superhot-research/issues/124),
run `41477755387`, artifact `13156944529`,
`managed/Assembly-CSharp/AudioManager.cs:1–178`.
The private `result.json` SHA-256 is
`e27e22ca999d554ed87f055fe163d71f7b39047df84b1f5859aa8d78f6c8dadf`;
the UTF-8 extracted source segment SHA-256 is
`17669c58516f42155a59c1cbfc3972c4f39cae2880a6c9f2a7a7bd5ef0cc2b1d`.
No source text is published.

`AudioManager.Instance` lazily creates a persistent manager and calls
`Initialize`; **pool initialization comes before mixer lookup**.
`InitializeAudioObjectsPools` reflects `AudioGameObjectResources` fields.
For each distinct prefab name it tries the exact resource path
`Sounds/GameObjects/<Name>`; when `Resources.Load<GameObject>` returns
null it logs an error **without registering a pool**, otherwise creates
`ObjectPool(prefab, AudioPrefab.PoolSize, parent)`. An already-registered
name skips resource lookup. The separate generic `AudioClip` pool has declared
size 25; do not apply that capacity to `EnemyShatter`. Source locations:
`AudioManager.cs:96–115,137–168`.

**PROUVÉ composition:** the static `EnemyShatter` field name and declared
size 5 from #120/#121, together with #124, establish a conditional
registration attempt for `Sounds/GameObjects/EnemyShatter`. This is a
stronger, testable gate than "all AudioPrefab fields are registered."

**INCONNU:** whether the resource was successfully loaded in the actual
Containers run, whether Unity created/reused this particular pool instance,
and whether this enemy-death event produced audible output. Serialized
asset presence does not substitute for observing `Resources.Load`.
`planMcdAudioPrefabPoolInitialization` mirrors only the source decision
with **explicit** runtime inputs; it never assumes pool presence. SH-05 may
use this gate at the native/Web join, but no native runtime pool, AudioContext
trace for enemy-death, or sampled speaker output is established here.


## SH-07 P0 — Stun audio : provenance primaire et raccord sans duplication SH-06

**PROUVÉ — contrat source statique, PAS son audible.** SUPERHOT: MIND CONTROL
DELETE Steam build `20299547`, Unity `2018.4.14f1`, Assembly-CSharp
SHA-256 `ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257`.
Relecture réelle des trois artifacts privés **existants**, sans nouvelle issue
ni requête générale (chaque extrait SHA-256 UTF-8 vérifié) :

- [research #105](https://github.com/TGrozner/superhot-research/issues/105),
  artifact `13144030637`, `PejAiBody.cs:478–519`, source SHA-256
  `578030aa9ee719e10eb61b454d5379f47237a15160875c9eb6852237207f29ca`.
- [research #120](https://github.com/TGrozner/superhot-research/issues/120),
  artifact `13154468332`, `AudioGameObjectResources.cs:1–46`, source SHA-256
  `2c5a4f14fe7747063cd86b4a402d19550d5a7cf81f8cdd471794753046255ef5`.
- [research #113](https://github.com/TGrozner/superhot-research/issues/113),
  artifact `13148839109`, `AudioManager.cs:579–612`, source SHA-256
  `0f5ace43712f182a9961ce6088bfc50f03580d7c433a28bae5a9f189b7be0b89`.
- Pool initialization already proved by [research #124](https://github.com/TGrozner/superhot-research/issues/124),
  artifact `13156944529`, `AudioManager.cs:137–168`, SHA-256
  `17669c58516f42155a59c1cbfc3972c4f39cae2880a6c9f2a7a7bd5ef0cc2b1d`.

**Exact native chain:** only AFTER an actual `PejAiBody.Stun` invocation
passes the kamikaze early return, `stunSoundRest < Time.realtimeSinceStartup`
(strict) requests either `EnemyStunConcrete` when `isConcrete` is true
(declared prefab pool size **2**) or `EnemyStun` otherwise (declared pool
size **3**), at the body GameObject position + **(0, 1.5, 0)**.
With normal return from `PlayPrefabSound`, `stunSoundRest` advances to
`realtimeSinceStartup + 0.25`, **even when the named pool is missing and the
request returns an empty effect**. This timer is Unity realtime, not world
time or Web audio context time. Calling `Controller.Stun` on a boss is a
separate later guard, and does not suppress the earlier audio request.
The default pitchRandomization argument for this call is **0**. No
`PlayClip` clip-null/mixer/cooldown gate applies to this `AudioPrefab`
overload. Declared pool sizes are **not** runtime pool occupancy.

**WEB ONLY — new bounded composition:** existing
`src/animation/enemy-stun-command-plan.js` (SH-06) already emits the
source-qualified `request-stun-prefab-sound` then `set-stun-sound-rest`
commands, including the world-space Y offset and strict time gate. New SH-07
`src/sound/mcd-enemy-stun-prefab.js` converts **only** that prior command
into the existing `planMcdAudioPrefabPlay` request. It never rechecks
kamikaze, adds a second 1.5-unit offset, reimplements the timer, or assumes
a prefab pool exists. Explicit `poolExists`, `reused` and
`pitchBeforeRequest` are required where appropriate. No sound is generated
or loaded; a returned `audio-prefab-play-request` is not playback.
`tests/sound-mcd-enemy-stun-prefab.test.mjs` exercises the full
source-command → audio-plan chain with normal/concrete, strict equality,
kamikaze, boss, missing pool and reuse cases. These are Node behavior
tests, not a native execution or a browser/speaker recording.

**INCONNU — blockers before SH-05 wiring:** whether the gameplay enemy in
Containers actually dispatches `PejAiBody.Stun` for a given projectile;
the original `Resources.Load<GameObject>` outcome for either Stun prefab;
runtime pool instances, prefab AudioSource/clip owner+path_id, mixer response,
the actual activation timestamp and any **audible** native or browser sound.
No original bytes, PCM or managed source are present in this public repo.
SH-05 may feed an **observed** Stun command stream to the adapter and,
only with a locally supplied licensed sample, add the sound in its
reserved `src/audio.js`/`src/main.js`. The browser acceptance gate is:
confirmed Stun invocation → chosen prefab with body-position offset →
pool/asset readiness → nonzero Web Audio graph trace and (separately) a
native run comparison. Never substitute a generic `killEnemy` callback.


**NEW PRIVATE INVENTORY CHECK (2026-11-02):** bounded [research #141](https://github.com/TGrozner/superhot-research/issues/141)
SUCCESS, run `41507466400`, artifact `13171486453`; read
`spec/world/browser-audio/manifest.json:1–82`, complete result
(`next_start=null`, text SHA-256
`e19d4893ecb3e61c8bd46d5de2814cb5667a6b615856a5ab387a88ca`,
result.json SHA-256
`dd31714e2cd86515b70ec096a2dacf61ed4de9043c34547eadaf4105e158b657`).
The **existing selected browser-audio binding manifest** describes pistol,
enemy fire, player hit and EnemyShatter but has **no** EnemyStun or
EnemyStunConcrete mapping. This is proof of a **manifest gap only**, not
proof that native sound assets or serialized prefab objects do not exist.
Do not reuse the EnemyShatter WAV for either Stun cue or infer an original
sample from an AudioPrefab field name. A future **index-backed, bounded**
Unity owner/path_id mapping is required before local original-clip playback.

## SH-07 — Source-bound EnemyStun/EnemyStunConcrete clip identity (2026-11-02)

**PROUVÉ — serialized Unity data, NOT runtime pool or audition.** The previous
source-qualified Stun guards and the two declared AudioPrefab pool sizes
remain as documented above. Four **new, strictly bounded** private SQL
queries against `resources/pass-01/corpus.sqlite`, all completed SUCCESS:

- [research #144](https://github.com/TGrozner/superhot-research/issues/144),
  artifact `13175332382`, result.json SHA256
  `e2d14446a34bdaccb189c27eea108b9278a49b6a634c015bb73d4c88779cc0e7`:
  three named GameObject identities, including the EnemyShatter control.
- [#145](https://github.com/TGrozner/superhot-research/issues/145),
  artifact `13175172636`, SHA256
  `ce6ca8cb0a970ebf7eeb4305dabec390facc1fecea3857f4e6b5c1061029be02`:
  GameObject component pointers and serialized active flags.
- [#146](https://github.com/TGrozner/superhot-research/issues/146),
  artifact `13174448535`, SHA256
  `3f51ae2914870167d914b1358a7ff544f08f3f65b2655e58ceff084f6265eca1`:
  corresponding AudioSource clip references and starting source values.
- [#147](https://github.com/TGrozner/superhot-research/issues/147),
  artifact `13174882773`, SHA256
  `0693cca5ec2424bbec6e5ea12cc464a42f6e0f772d8532c619e876c7788ba144`:
  exact AudioClip identities and serialized audio metadata.

**Native serialized pointer chains, without commercial bytes:**

| Stun AudioPrefab | Active serialized GO | AudioSource | AudioClip | Serialized starting volume | Clip metadata |
| --- | --- | --- | --- | --- | --- |
| EnemyStun (declared pool 3) | `resources.assets:1860` | `resources.assets:27512` | `resources.assets:1675` — `AC_Enemy_Stun` | 0.6340000033 | mono, 96000 Hz, 0.74374 s |
| EnemyStunConcrete (declared pool 2) | `resources.assets:1886` | `resources.assets:27520` | `resources.assets:1611` — `AC_Enemy_Hit` | 0.6999999881 | mono, 48000 Hz, 0.38375 s |

Both serialized AudioSources reference mixer fileID `3`, pathID `659`.
The same query independently recovers the already-known EnemyShatter control:
GO `resources.assets:1898` → AudioSource `:27523` → clip `:1579`
(`AC_Enemy_Death`). This is a cross-check of the reference path, not an
observation of any pool playing. The mixer reference's active channel, effects,
any runtime modifications to starting gain/pitch, and actual prefab
`Resources.Load` success remain **INCONNU**.

**Delivered source-to-Web contract:** `src/sound/mcd-stun-serialized-clips.js`
composes the *existing* SH-06 Stun and SH-07 prefab planners, adding the
correct local-private clip identity *only when* the latter returns
`audio-prefab-play-request`. If the pool is reported missing, the native
0.25-second realtime sound-rest update still occurs but **no local clip request**
is emitted. No sample is fetched, uploaded, embedded or synthesized by this
module. `serializedStartingVolume` is explicitly not a final gain.
The matching `tests/sound-mcd-stun-serialized-clips.test.mjs` asserts normal
versus concrete contacts, cooldown equality, missing-pool silence and runtime
pitch retention. These are Node source-contract tests, **not** browser audio
or native execution measurements.

**SH-05 integration gate:** first prove a specific executed Containers body
part/armor contact reaches the SH-06 Stun branch; qualify the runtime pool and
load the owner-local `resources.assets:1675` / `:1611` clip without publishing
it. Only then route the emitted private-local clip request to
`AudioBufferSourceNode`; measure actual decoded buffer metadata, playback
start and analyser nonzero peak in Chromium, plus the absent-pool negative case.
A graph signal is weaker than physical speaker audibility. The active
Containers scene, pool, native mixer output and paired runtime timing are still
**INCONNU**. Do not use `audio.shatter()` or a synthetic pistol cue as a
substitute for a Stun sound.

## SH-07 — opt-in local browser Stun pool/clip preview (2026-11-02)

**PROUVÉ (static source/serialized identities, not executed native audio):**
private research #105, #113, #120, #124 and #144–#147, MCD build
20299547, Assembly-CSharp SHA256
`ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257`.
The clip bindings above are `EnemyStun → resources.assets:1675` and
`EnemyStunConcrete → resources.assets:1611`. The source declares pools
of 3 and 2, but their **runtime Resources.Load success is unverified**.

**WEB-ONLY, intentionally diagnostic:** `src/sound/mcd-stun-scene-plan.js`
adapts these *existing* source IDs to the existing
`createAudio().configureSceneAudio` contract, yielding the allowlisted local
manifest keys `audioNative_resources_assets_1675` and
`audioNative_resources_assets_1611`. It does NOT fetch/play audio or
modify `src/main.js`/`src/audio.js`. Both named prefabs require an explicit
`resourcePresent` decision from the owner: `false` or `'unknown'`
does not install a Web pool; `true` authorizes a *local diagnostic pool
assumption only*, NOT a claim about the actual MCD runtime. An explicit
positive `diagnosticMaxDistance` is required for Web spatialization.
Initial serialized source volume is used as a preview gain, not a verified
final gain; the native mixer/effects, pitch-timescale route and attenuation
remain unknown. Pre-existing private package bindings are never overwritten.

**SH-05 integration handoff:** after `prepareNativeScene`, pass the
owner-qualified `gameplay.audio` and resource decisions through
`planMcdLocalStunSceneAudio` before
`audio.configureSceneAudio(plan.sceneAudio)`; map the generated
`localManifestKeys` to *owner-local*, ignored WAV paths in
`private/browser-assets.json`, restart the local server, then use the
existing user-gesture `audio.init() → loadLocalAssets()`. The current
Containers gameplay already calls `audio.stun` on a Web reaction, but the
source-qualified PejAiBodyPart contact from SH-03/06 remains a separate
necessary gate. Test both guarded normal/concrete Stun and absent-pool/
missing-WAV cases. Collect Chromium `AudioContext` state, actual decoded
buffer identity, `lastPlayback`, a **nonzero analyser graph signal** and an
actual audible output observation separately. Node tests are NOT an audio
measurement. No native sample, bytes, game asset or mixer is published.


## SH-07 — Dojo/build10 qualified bullet-contact → Stun audio bridge (2026-11-02)

**PROUVÉ (SOURCE STATIQUE, PAS UNE EXÉCUTION DOJO):** le chemin
`Bullet.EnemiesCollisionHandle` → `PejAiBody.Stun` produit une intention
`EnemyStun` ou `EnemyStunConcrete` seulement après un contact qualifié et
les gardes respectives. Provenance : build 20299547 / Assembly-CSharp SHA256
`ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257` ;
private research #127, artifact `13158822845`,
`managed/Assembly-CSharp/Bullet.cs:785–970`, texte SHA256
`6051142396c9bef59e1795f5da69f0f9ebba61d7bba30f8eba03f6eb0c79561e` ;
research #105, artifact `13144030637`,
`managed/Assembly-CSharp/PejAiBody.cs:478–536`, texte SHA256
`578030aa9ee719e10eb61b454d5379f47237a15160875c9eb6852237207f29ca`.
AudioPrefab #113 et liaisons Unity #144–147 documentés précédemment.
Le flag de lecture `isConcrete` **vient de l'argument de cet appel Stun**,
pas du champ persistant `stunedConcretePart` : en cas de Stun déjà actif,
celui-ci peut conserver sa valeur antérieure.

**PROUVÉ (WEB, CONTRAT PUR):** le module
`src/sound/dojo-bullet-stun-audio.js` réutilise les plans déjà possédés
par SH-06 (`planBulletBodyPartStun`) et SH-07
(`planMcdSourceBoundStunClip`) pour distinguer les cas :
contact non qualifié / pas de Stun ; garde `stunSoundRest` ou
kamikaze sans audio ; pool explicitement absent ; requête clip locale.
Si et seulement si une requête Stun source est produite, le module
fournit au raccord SH-05 le sélecteur `webConcreteSelector`.
Pour une requête audio valide et un pool affirmé présent,
`EnemyStunConcrete` correspond à `resources.assets:1611` et
`EnemyStun` à `resources.assets:1675`; **aucun son n'est fabriqué**.
Les huit tests `tests/sound-dojo-bullet-stun-audio.test.mjs` sont conçus
pour exercer l'intégration réelle des plans SH-03/06/07, mais leur succès
CI ne serait pas une preuve de déclenchement natif ni de sortie audible.

**ÉCART WEB CONSTATÉ AU HEAD PUBLIC `1462e5889`:**
`src/main.js`, branche `applyNativeEnemyContact`, appelle
`audio.stun({bodyId:enemy.id,position:enemy,realtimeSeconds:state.runClock})`
sans `concrete`. L'API `src/audio.js` utilise
`concrete=false` par défaut. Un véritable contact conduisant à
`PejAiBody.Stun(isConcrete=true)` prendrait donc systématiquement
l'option **non-concrete** dans ce chemin Web si aucun autre raccord
ne corrige la sélection.

**Contrat SH-05, sans toucher aux fichiers partagés :**
faire remonter un contact partie-du-corps avec couple
`(PejAiBodyPart,controller)` réellement qualifié, produire
`planBulletBodyPartStun`, puis consommer
`planDojoBulletStunAudio` uniquement pour ce même événement.
Si `status==='source-local-clip-request'` et si le clip est réellement
chargé, transmettre `webConcreteSelector` à `audio.stun` avec
identité/body position/horloge du gameplay qualifiées. Conserver
les délais/cooldowns et `source-pool-absent` comme blocages, ne pas
supposer qu'un `isBulletProof` Web ou un flag persistant équivaut à
l'argument natif. Les tirs/collisions Dojo n'ont **pas** encore été
observés avec ce chaînage dans Chromium.

**KATANA — PROUVÉ (HANDOFF) / INCONNU (RUNTIME):** le document
`docs/dojo-reprise.md` constate les trois références de swing
nulles dans le katana de cette scène. Le code `src/audio.js` refuse
déjà un `itemCue('swing')` sans clip, couvert par
`tests/audio-native.test.mjs` ; ne pas dupliquer ce test ni inventer
un bruit de swing. La lecture du clip de contact/slice et la sortie
d'AudioContext dans un Dojo complet restent à mesurer par SH-05 et
Thomas sur leur session locale. Les observations antérieures ont
seulement démontré WebAudio pickup/throw/shatter et les trois boucles
d'ambiance de porte.
