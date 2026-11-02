# SH-08 — Native ending: replay → defrag (MCD Containers)

This note supplements docs/parity/flow.md. The connector blocked an in-place update to that existing large file, so a focused new document records this source-qualified discovery without publishing proprietary material.

## PROUVÉ — static decompiled source, NOT MCD runtime execution

Private provenance: TGrozner/superhot-research issue #66; run 41435120619; artifact 13135917213; SHA256(result.json) 5281b599c67f03f7918ce48b6b559aebba43b1fcfcc4e537ec086869664a7aec. Reported MCD Steam build 20299547; Assembly-CSharp.dll SHA256 ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257. Paths and line numbers below refer to the private decompiled Assembly-CSharp/LevelFlowControl.cs, not original author source.

- EndProgressLevel:899–904 hides the crosshair and blocks player actions before requesting the outro. Its normal caller EndRunLevel:829–859 requires AllKilled and excludes ENDLESS_LEVEL (see containers-gates.js). Zero visible enemies is NOT the required manager quota.
- RunLevelEndingWithoutSuperhot:945–980 enters the win state once and schedules a callback. If finishWithoutReplay, TUTORIAL_RUN, END run ID or BlockReplays is set, the callback marks startReadingInput, inputRead and replayEnded after 0.45 × duration. Otherwise after 0.5 it marks startReadingInput and requests the replay-return prompt. Duration is BlockReplays ? slowmoTimer : 4f.
- RunLevelEndingWithoutSuperhot:982–1003 next schedules startSuperAnimation after 0.45 × duration. Subject to other guards, it requests ReplayStart audio and ErrorPunch, then replay playback after ErrorPunch stops. Scheduling a callback is NOT equivalent to immediately running it.
- RunLevelEndingWithoutSuperhot:1004–1029 waits until the player is no longer in replay. Either accepted input before effect start or replayEnded can progress. SUPER is skipped on the last level or when SkipSuperTextAfterLevel; recording stops. A callback after 0.35 × duration requests defrag UI or SkipDefragBetweenLevels.
- HandleSkippingDefrag:1038–1057 moves to at least one next cell, skips intervening Shop cells, saves, and loads the next level or marks run won and loads SHMenu. The actual serialized next cell and run layout have NOT been resolved.
- The sampled method continues returning Status.Running. Its returned status is NOT a signal that the next level was loaded.

## Implementation and observation grades

PROUVÉ — new src/flow/ending-intents.js models the source predicates as side-effect-free, single-invocation action INTENTS. planMcdProgressEndingInvocation(flags, signals) yields next, effects and status. Enqueued callbacks are descriptions, never auto-fired. PrepareWinState groups the source actions from lines 952–961; BeginPreparedReplay represents the source calls from lines 998–1001. These are not audio, scene, gameplay, save, or UI implementations.

OBSERVÉ Web — tests/flow-ending-intents.test.mjs exercises 11 behavioral cases for initial win, with/without replay, deferred callbacks, ErrorPunch, replay exit, SUPER and skip defrag. Independent Node execution and CI status must be checked against the PR head; neither proves native gameplay or audible sound.

INCONNU — loaded Containers MonoBehaviour identity, live run and manager quota, GameType, slowmoTimer, replay/player flags, DelayedInvokeMarshal scaled/unscaled clock and callback execution trace, next LevelInfo, persistent saves. A further private scheduler read was refused by connector safety checks. delaySeconds is the C# float32 Enqueue argument, not an observed wall-clock delay. SH-02 owns actual input bindings; acceptedFinishButton is supplied as a boolean rather than inferred here.

## SH-05 integration boundary

Connect only after SH-03 provides the manager quota, SH-04 resolves the loaded scene/flow instance, and SH-05 owns the shared main, renderer and UI. Use isMcdLevelClear, not the Web three-room enemies.length or two-second countdown. Invoke the planner only on the native progress-ending branch, feed real flags, and schedule synthetic UI/audio actions through a separate, explicitly labeled replacement layer. Verify an observable Containers scene from a matched MCD/Web trace before any 1:1 statement. No original audio/video/asset/code is published.
