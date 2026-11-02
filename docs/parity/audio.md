# SH-07 sound evidence ledger

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
