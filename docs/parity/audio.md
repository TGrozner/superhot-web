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
