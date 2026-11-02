# SH-03 — MCD combat / enemy behavior parity ledger

**Scope:** SUPERHOT: MIND CONTROL DELETE (MCD), **not** SUPERHOT (2016). Last checked: 2026-11-02.

## Evidence policy

- **NATIVE-PROVEN** = specific native assembly/serialized prefab value or traced runtime observation with exact artifact/path, file hash, member/field and contextual provenance.
- **WEB-OBSERVED** = behavior in the current public `superhot-web` source only. This is **not** evidence that MCD behaves the same way.
- **PROVISIONAL** = independently designed Web-only numerical or interface decision needed for a testable primitive.
- **UNKNOWN** = there is not yet sufficient native evidence to claim any target behavior or value.

### Available primary evidence

- Private gateway: `TGrozner/superhot-research`, `.github/workflows/corpus-query.yml`, manually dispatched against self-hosted `superhot-local`, with read-only operations `status`, `list`, `read`, `bytes`, `query`. It does **not** run the original game or guarantee a parity measurement.
- Successful private runs inspected: `41367631061` (Unity type counts), `41367755041` (only lines 1–25 of `decompiled/TimeControl.decompiled.cs`), `41367855635` (a partial PNG byte slice). These artifacts contain **no evidence of combat or enemy AI semantics**, so there are **zero NATIVE-PROVEN combat claims in this ledger**. Do not publish the private artifacts in this public repository.
- Web baseline: `TGrozner/superhot-web@9f01f92411b4e125b2c992deee53602a8c67c416`, `src/main.js` and `src/math.js` (read before this branch).

### Existing Web prototype, not native MCD

| Area | WEB-OBSERVED behavior in baseline | MCD parity |
| --- | --- | --- |
| Bullets | Discrete segment swept against axis-aligned level boxes and spherical character volumes; nearest `t` wins | **UNKNOWN** |
| Enemy hit volumes | Two spheres at height `1.26` radius `.58`, height `1.91` radius `.37` in Web coordinates | **UNKNOWN** |
| Player hit volume | Sphere centered `0.35` below camera, radius `.51` in Web coordinates | **UNKNOWN** |
| Projectile speeds | Web `37` (friendly), `8.4` (enemy), `30` (thrown weapon), world units/second | **UNKNOWN** |
| Fire/reload | Web cooldown `.19 s` armed, `.36 s` unarmed, reload `.85 s`, magazine `6` | **UNKNOWN** |
| Hits | Web enemy shatters in one hit, player starts at 3 health, thrown gun also kills enemy | **UNKNOWN** |
| Enemy actions | Web AI advances/strafe when far, fires with randomized delay, activation based on room wave time | **UNKNOWN** |
| Weapon pickup | Web drops a pickup at an enemy death / a thrown-weapon wall hit | **UNKNOWN** |

### This PR: pure building blocks

- `src/combat/trace.js`: finite segment against caller-provided AABBs and spheres; returns hit entity, fraction and point; solids win numerical ties (`1e-9` tolerance). Tie semantics are **PROVISIONAL**, not MCD collision-layer proof.
- `src/combat/projectiles.js`: moves a projectile using caller-provided **world** seconds, speed, direction, TTL and collision geometry; freezes when `worldDelta=0`; expiry clamps travel. No MCD speed/ammo/damage constants are embedded. The exact end-of-life/collision ordering remains **PROVISIONAL**.
- `src/combat/sight.js`: line-of-sight geometry helper only; **not** an implementation of native enemy AI or target acquisition.
- `tests/combat-*.test.mjs`: 13 deterministic unit cases; stand-alone local run on Node 22: **13 passing, 0 failing**. These verify our own algorithms, not MCD equivalence.

These modules are intentionally **not wired into `src/main.js`**. The integrator owns shared files and must first assess behavior differences and native evidence.

## Next native research requests (private only)

Issue #3 requests the dedicated `superhot-research` gateway to inventory the relevant source paths, then inspect scoped code/serialized values and obtain repeatable native observations. Suitable initial JSON requests (one per workflow dispatch):

```json
{"operation":"list","path":"spec","offset":0,"limit":200}
```

```json
{"operation":"list","path":"managed","offset":0,"limit":200}
```

```json
{"operation":"read","path":"runtime/observations.json","start":1,"count":200}
```

```json
{"operation":"query","sql":"SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name","limit":100}
```

Only after confirming concrete paths and table columns, enumerate members/configuration for weapon firing, muzzle, bullet/projectile movement, collision layers, life/damage, hit reaction, thrown and dropped weapons, enemy aiming/LOS/navigation, waves and spawns. For each observed value, pin the file hash + member/owner/path_id and distinguish serialized scene overrides from code defaults. Runtime measurements must name the native build, capture conditions, frame timing, input and observation.

## Integration contract for SH-05

1. Keep ownership of `src/main.js`, `src/levels.js` and `src/renderer.js` with integration lane #5.
2. Feed the function `firstImpact(start, end, { solids, targets })` geometry shaped as `{min,max}` / `{center,radius}`; prefer explicit owner/team filters **before** calling it. Do not assume friendly fire rules.
3. `advanceProjectile(projectile, worldDelta, geometry)` expects a finite nonnegative **world** delta; movement `direction` already normalized by the caller. It returns `{ projectile, impact, expired }` without mutating its input. Do not integrate until a regression scenario validates expiry timing, first-hit order and scale switching.
4. Do not claim the Web simulation is MCD-faithful based on these 13 unit tests. Replace PROVISIONAL mechanics only when native evidence becomes available.
