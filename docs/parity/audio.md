# SH-07 sound evidence ledger

Scope: SUPERHOT: MIND CONTROL DELETE (Steam app 690040).
This document separates source evidence from the independent Web prototype.

## Verified material

- Private research repository: TGrozner/superhot-research.
- Read-only inventory run: 41367571984 (artifact 13107847231).
- Inventory completed 2026-11-02T00:05:57Z: 511 verified files,
  842307 Unity objects, 3703 scripts and 77 scenes.
- Web baseline: commit 9f01f92411b4e125b2c992deee53602a8c67c416,
  src/audio.js blob 952d399dfbd07da782ebff9ccfdbbcd394d041e2.
- The Web implementation synthesizes seven feedback methods:
  shoot, enemyShoot, shatter, pickup, hit, empty and win.

This is Web-source evidence only. It does not demonstrate the original
engine's sound routing, trigger conditions or audible output.

## Unresolved source claims

| Question | Status | Needed proof |
| --- | --- | --- |
| Original sound-producing method | INCONNU | Source assembly, method/token and verified call sites |
| Guards, cooldown and interruption | INCONNU | Branch paths plus positive/negative scenarios |
| Clip identity and parameters | INCONNU | Per-file digest plus serialized object identifiers |
| Scaled vs real-time clocks | INCONNU | Exact method time source and test |
| Output audible to listener | INCONNU | Synchronized offline observation |

PROUVÉ means exact source or reproducible test. OBSERVÉ means captured
behavior with scenario/version. INCONNU means evidence is insufficient.
Event presence, method invocation and audible output are distinct claims.

## Next private, read-only investigation

Use the existing corpus-query gateway to inspect a bounded listing of
spec/ and managed/, then query the Unity SQLite type inventory for audio
components. Resolve objects by (owner, path_id), not by display name.
Trace one sound producer through its guard, playback call and serialized
parameters; record the corresponding source checksum and a falsifying case.

The available GitHub connector can read workflow results but cannot start
a new query. Prior visible runs inspected inventory, TimeControl source
and a screenshot, not a native sound producer; no audio query is claimed.

## Independent Web implementation

- src/sound/timeline.js: two explicit caller-selected clocks, bounded
  deterministic event scheduling, cancellation, pause and diagnostics.
- src/sound/prototype-sink.js: compatibility with seven existing synthetic
  methods only. A successful callback is NOT a listening measurement.
- tests/sound-*.test.mjs: Node tests for scheduling and adapter contract.

These modules are intentionally not connected to src/main.js or src/audio.js,
which remain reserved to the SH-05 integrator. No source audio is included.
The timeline's clock and ordering policies are provisional Web choices,
not asserted properties of the original game.
