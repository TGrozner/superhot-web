# SH-06 — Dojo/build10: source-timed punch contact candidate (Web-only)

Scope: **SUPERHOT: MIND CONTROL DELETE**, Steam build 20299547,
`SHRL_Dojo2` / `level10`, NOT Containers/build28. This is a
**small SH-06-owned integration module**, not a native execution claim.
No commercial meshes, clips, WAV files, source bodies, or captures are
included.

## Evidence ledger

- **PROUVÉ, primary serialized data** — the isolated SH-14 source punch
  clip `sharedassets0.assets:468` has `MeleeDamageStart` at
  **0.4686083197593689 clip s**, `MeleeDamageEnd` at
  **0.7319236993789673 clip s**. Private research [#46](https://github.com/TGrozner/superhot-research/issues/46),
  run 41432965583, artifact 13135780460,
  `spec/animation/damage-window-writes.json`, bounded text SHA256
  `94118dc244fccce15614038fd0945f9a4bd809be5a0f87d902cff2fc9c791110`.
  SH-14 sampled this clip **in isolated playables**, not an active Dojo
  combat trace.
- **PROUVÉ, managed method semantics** — `PejAiAnimator.MeleeDamageStart`
  writes `MeleeDamage=true`, and `MeleeDamageEnd` writes false. Private
  research [#152](https://github.com/TGrozner/superhot-research/issues/152),
  run 41523327988, artifact 13178856534,
  `PejAiAnimator.cs:1501–1509`, bounded text SHA256
  `787174a0188c3a47179e0b8652045d52fe59dfc45c7411e7888a3b9e6acc502c`.
  This does **not** prove a collision or damage is caused by either method.
- **PROUVÉ, bounded event interval** — an already prepared UnityPlayer
  non-looping event interval checks forward `(last,current]`, reverse
  `[current,last)`. Private research [#29](https://github.com/TGrozner/superhot-research/issues/29),
  artifact 13133602811,
  `spec/animation/closure/native-events-contract.md:24–37`,
  bounded text SHA256
  `07b23e8182166e8630a90f1020e8906ba4f3325a479b98a8bc6be2775f2272f6`.
  **Prepared clip interval and selected Animator state remain external facts.**
- **OBSERVÉ, Web source** — `src/main.js` at
  `b6746011beaaf12bdcc4f9e19faf60fbfb86d985` immediately calls
  `damagePlayer()` when the unarmed enemy's distance/line-of-sight and
  `nextPunchAt` allow a punch. Separately `drawEnemy()` selects
  `'punch'` for **0.5 world-clock seconds** after `punchAt`. That
  instantaneous damage is independent of an AnimationEvent and does not
  establish native timing. Current Web scene and actor rigs are described
  in `docs/dojo-reprise.md`.
- **INCONNU** — Dojo actor instance actually selects source clip 468,
  Unity state/layer/weight in that live actor, clip speed and event
  preparation, callback ordering relative to physics, native contact
  shape and hit-once policy, and a matched native/Web visual frame.
  The source clip's existence alone does not establish active play state.

## New public module

`src/animation/dojo-punch-contact-gate.js` **imports** the existing
`planMcdPunchDamageEvents()` (merged SH-06 PR #165); it deliberately
does not clone the interval scanner or establish damage from proximity.

A new gate needs `attackerId`, a unique `strikeId`, and an explicit
`initialClipTime` supplied by the current animation owner. Each
`advanceDojoPunchContactGate(state, ...)` requires the exact clip owner
and path ID, current **source-clip seconds**, and four positive Web
qualification flags (active selected clip, prepared interval, active
Web GameObject and mapped Web receiver). None may be inferred solely
from a prefab or a 0.5-second timer.

The optional contact receipt must identify the *same* attacker and
strike, a victim, an in-interval source-clip timestamp, explicit
`geometryContactConfirmed: true`, and
`provenance: 'web-hitbox-sweep'`. A proximity predicate does not qualify.
The module replays the source boolean writes in temporal order,
including both events in a single skipped frame. Same-timestamp
contact/event ordering is rejected because it is not proven. Reverse
traversal may report event writes but never sends gameplay contact.
On loss of qualifications the Web gate closes.

When eligible, the only output is
`{op:'request-web-player-melee-contact', parity:'WEB_PREVIEW_NOT_NATIVE_VERIFIED', ...}`.
This is **not** direct health loss or a native MCD hit, and has no
side-effects, GPU draws, playback or assets. One request per explicitly
created Web strike is a conservative **prototype policy**, not a
verified MCD multi-hit rule. `tests/animation-dojo-punch-contact-gate.test.mjs`
exercises the event/contact crossings and negative gates.

## SH-05: exact owner-only runtime handoff (NOT integrated by SH-06)

1. At the unarmed enemy attack branch in `src/main.js` (the
   `enemy.nextPunchAt` / `enemy.punchAt` branch), keep the **provisional**
   enemy AI choice but **remove the immediate `damagePlayer()`** only
   when a valid source-clipped strike is actually prepared. Create a
   unique strike receipt; preserve the old preview as an explicitly
   marked fallback until the positive animation bindings exist.
2. Have SH-14's actual Dojo animation playback supply the **selected**
   owner/path ID, clip speed, source-clip interval and mapped receiver.
   The `'punch'` state name or `punchAt` alone cannot certify clip 468.
   Do not pass Web elapsed seconds as clip seconds. Do not force all
   positive flags true solely to satisfy the adapter.
3. Sample a **real Web hitbox sweep** against the player geometry,
   timestamp the sample in the same clip domain, and pass the receipt.
   The existing distance/visibility check is an *AI attack condition*,
   not collision proof. SH-03 retains collision ownership.
4. Consume a returned `request-web-player-melee-contact` only when
   attacker/victim still exist and the scene is playing; then route to
   `damagePlayer()` in SH-05's shared main. Observe no damage on
   windup, one hit in the eligible window after a confirmed sweep, and
   no damage on an interrupted/disarmed swing. SH-14 retains character
   pose and masked-layer blending; SH-05 alone changes renderer/main.
5. Preserve `docs/dojo-reprise.md`'s katana scope separately: Dojo
   normal enemy katana attack refers to clip 424, **not punch clip 468**.
   The held-player katana/hands are in a PRIVATE archived unfinished
   checkpoint. The three swing sound references are null. Neither
   punch timestamps nor any speculative katana audio should be
   copied to those paths. SH-05/SH-14 must first recover the
   legitimate private playback package and demonstrate the correct
   pose before wiring player swing VFX.

**Acceptance tests for future SH-05 integration:** a controlled Web-only
Dojo enemy punch attempts within reach and stays non-damaging on intent;
a valid source playback + swept hit requests exactly one contact during
the source window; a miss, late contact, disabled enemy, unknown clip
or absent receiver requests nothing; interruption/restart resets strike
identity. Measure actual time/pose/damage via browser instrumentation
without claiming native parity. The proprietor's later localhost test is
**not** performed here.

## Restrictions followed / remaining blockers

This work uses only existing public metadata and previously reported
private proof hashes. No new research workflow, runner, original game,
owner PC, local browser or proprietary asset was accessed. GitHub-hosted
CI validates only Node behavior. The source Dojo animation instance and
private archive are still unavailable to a Web-only agent. Until SH-05
obtains those bindings and an actual swept contact, this PR is a
source-backed **callable integration seam**, not a visually completed
punch/katana animation.
