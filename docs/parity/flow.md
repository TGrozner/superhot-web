# SH-08 — Progression, transitions, menus, checkpoints (MCD)

**Scope:** SUPERHOT: MIND CONTROL DELETE (MCD), not the original SUPERHOT. Source snapshots and source-level claims must not be conflated with observed execution. **This PR adds a pure state-machine for the existing FRAME//BREAK prototype; it is not a verified MCD flow implementation.** No original game resources are embedded or published here.

## Provenance and evidence grades

- **PROUVÉ — corpus provenance only:** private `TGrozner/superhot-research` read-only `status` response, GitHub Actions run `41367571984`, private artifact `13107847231`, reports `edition: SUPERHOT: MIND CONTROL DELETE`, `steam_app_id: 690040`, `snapshot.completedUtc: 2026-11-02T00:05:57.026Z`, `511` files / `2613130032` bytes, `allMatched: true`, `77` inventoried scenes. Its `semantic_completion` explicitly states that those counts **do not prove semantic analysis**. The artifact has no original MCD flow-method trace, no menu transition table and no runtime flow observation. This provenance alone **does not** prove gameplay fidelity.
- **PROUVÉ — current Web baseline, not MCD:** `TGrozner/superhot-web` `src/main.js` blob `61be3504577084c863b5ca8e99d4cb0f8ddd582a`, via `setScreen` (line 40), `loadLevel` (50), `resetGame` (73), `start`/`resume`/`pause` (87–89), `finish` (90), `killEnemy` (223), `damagePlayer` (234), `update` transition (358–365). The prototype starts from room index 0, loads three authored rooms, has three hit points, resets on a new run, waits two **real-time** seconds after all enemies have died, heals one hit point capped at three on an intermediate-room transition, and marks a win after the final room. `stageBanner` starts at 2.2 seconds per room. These are **observations of Web source code**, not observations of MCD running.
- **OBSERVÉ — Web code execution:** the new pure module's behavior was executed in Node v22.16.0 with `node --test tests/flow-state-machine.test.mjs` (9/9 test cases passing at development time). This is a local test of our own code, not a measurement of the original game.
- **INCONNU — MCD native:** any actual MCD loop (sequences/nodes, runs, cores/unlocks, permadeath, checkpoints, scene-to-scene travel, retry and exit semantics, menus, pause restrictions, how counters persist, animation/transition timing). **No claim** about any of those is warranted by the available artifact. Do not infer behavior from the number of scene assets or a class name alone.

## Explicit provisional prototype contract (for safe integration)

`src/flow/state-machine.js` exports `createFlowRules`, `createFlowState`, `reduceFlow`, `FLOW_PHASE`, `FLOW_EVENT`, and configurable `PROTOTYPE_FLOW_RULES`. This is a DOM-free, event-driven reducer. State fields are `phase`, `roomIndex`, `health`, `clearRemainingSeconds`, `bannerRemainingSeconds`.

| Event | Current prototype rule | MCD parity |
| --- | --- | --- |
| `START` (from menu/dead/win), `RESTART` (any phase) | Fresh room index `0`, maximum health, no pending clear, playing | **INCONNU** |
| `PAUSE`/`RESUME` | Playing ⇄ paused; countdown freezes while paused | **INCONNU** |
| `DAMAGE` | Positive integer damage, floor HP at zero, death cancels pending clear | **INCONNU** |
| `ROOM_CLEARED` | First clear arms `2` real seconds; duplicates ignored | **INCONNU** |
| `TICK({realSeconds})` | Steps banner and room-clear countdown, does not apply world slowdown | **INCONNU** |
| Intermediate clear timeout | Increment room index once, heal `1` HP up to `3`, show room banner for `2.2s` | **INCONNU** |
| Last clear timeout | Phase `win`, no next room | **INCONNU** |

The rules are **configuration**, not native constants. Pausing during a pending transition, lethal damage on the final bullet, large elapsed steps, duplicate clear signals and a single-room campaign are covered by unit tests. The reducer throws on invalid amounts/time and unknown events instead of silently advancing an impossible state. It has **no** native persistence/checkpoint/unlock model and should not invent one.

## Minimum private native evidence request (bounded, read-only)

The research workflow is `TGrozner/superhot-research/.github/workflows/corpus-query.yml`. The connected GitHub interface in this lane can **read** private run artifacts but does not expose a `workflow_dispatch` action. No new corpus query was executed in this PR; the following are **requests**, not results:

1. `{"operation":"list","path":"spec","offset":0,"limit":200}` — identify progression/menu/level/transition reports by exact path, including any gaps. Follow only the relevant result paths with `read`, at most 200 lines per request, and record the artifact/run ID + snapshot provenance.
2. `{"operation":"read","path":"runtime/observations.json","start":1,"count":150}` — determine whether native start/menu/run/death/retry/screens were actually observed. Do not convert a *proposed scenario* into an executed observation.
3. `{"operation":"list","path":"decompiled","offset":0,"limit":200}` — discover relevant managed flow classes (do **not** assume one exists); read only matched classes. For data evidence, inspect `scenes`/`serialized` schema via `SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name` before bounded indexed queries.
4. For each candidate transition: connect initiating method/event → guard/condition → state mutation → rendered screen/scene switch → persistence side effect (if any). Capture source file, exact method, field, any serialized override and an observation (or label absence of observation). A class reference alone is **not** an executed transition.

**Refutation criteria:** a native trace contradicting any event guard/order/timer, a serialized scene value overriding a default, a persistence operation crossing runs, or a different ordering of death vs room clear invalidates that part of the prototype contract. Until this evidence exists, keep the contract labelled provisional.

## Ownership / integration boundary

- **SH-08 owns** `docs/parity/flow.md`, `src/flow/**`, `tests/flow-*.test.mjs`.
- **SH-05 owns** any changes to `src/main.js`, `index.html`, `style.css` and runtime integration. Suggested adapter: emit `START`, `RESTART`, `PAUSE`, `RESUME`, `DAMAGE`, `ROOM_CLEARED` at current game events, and `TICK` with **real seconds** from the existing simulation `update(dt)`. `WORLD_TICK`/time dilation remain under SH-02 ownership.
- All flow transitions are pure values; DOM visibility, pointer lock, audio, save data and scene asset loading remain the caller's responsibility. Integration must not substitute a passing unit test for a native MCD parity verdict.
