# SH-03 — MCD combat / enemy behavior parity ledger

**Scope:** SUPERHOT: MIND CONTROL DELETE (MCD), **not** SUPERHOT (2016). Last checked: 2026-11-02.

## Evidence policy

- **NATIVE-PROVEN** = specific native assembly/serialized prefab value or traced runtime observation with exact artifact/path, file hash, member/field and contextual provenance.
- **HANDOFF-REPORTED** = a claim summarized in the native team's private handoff, not yet cross-checked in this lane against member/serialized object and runtime proof. It is useful direction, **not** NATIVE-PROVEN.
- **WEB-OBSERVED** = behavior in the current public `superhot-web` source only. This is **not** evidence that MCD behaves the same way.
- **PROVISIONAL** = independently designed Web-only numerical or interface decision needed for a testable primitive.
- **UNKNOWN** = there is not yet sufficient native evidence to claim any target behavior or value.

### Available primary evidence

- Private gateway: `TGrozner/superhot-research`, `.github/workflows/corpus-query.yml`, manually dispatched against self-hosted `superhot-local`, with read-only operations `status`, `list`, `read`, `bytes`, `query`. It does **not** run the original game or guarantee a parity measurement.
- Successful private runs inspected: `41367631061` (Unity type counts), `41367755041` (lines 1–25 of `decompiled/TimeControl.decompiled.cs`), `41367855635` (partial PNG byte slice), and **`41368361512` (`HANDOFF.md`, lines 1–100)**. The handoff supplies native team observations but does not expose their underlying combat method/member proof here; there are **zero independently NATIVE-PROVEN combat values in this ledger**. Do not publish the private artifacts in this public repository.
- Web baseline: `TGrozner/superhot-web@9f01f92411b4e125b2c992deee53602a8c67c416`, `src/main.js` and `src/math.js` (read before this branch).

### Combat facts HANDOFF-REPORTED, awaiting source-level verification

The private native team's handoff (`HANDOFF.md`, run `41368361512`, lines 1–100) identifies MCD Steam AppID `690040`, build `20299547`, Unity `2018.4.14f1` and Assembly-CSharp SHA-256 `ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257`. It directs combat investigators to `spec/combat/combat-specification.md`, `serialized-settings.md`, `implementation-extension.md`, `ai-and-powers.md`, `modifiers-catalogue.md`, `unknowns.json` and `coverage-expanded.json` **inside the private corpus**. Those files have not been read by this lane.

- **HANDOFF-REPORTED**: the recovered keyboard/mouse binding maps **R to Replay**, not to magazine reload; `KillReloadMod` resets delays/animations without refilling ammunition. This contradicts the Web demo's R-to-reload behavior, so it must **not** be treated as a faithful MCD input mapping.
- **HANDOFF-REPORTED**: the native `ShotGun` emits **1 + pelletsCount** projectiles and some dispersion vectors are **not** normalized. The actual `pelletsCount` depends on the instantiated/serialized weapon, not merely the class default.
- **HANDOFF-REPORTED**: projectile travel uses `Update`, some sweeps use `FixedUpdate`, and delayed enemy shots are emitted after pose adjustment in `LateUpdate`. This lane's pure `advanceProjectile` deliberately **does not model this native multi-phase scheduling**.
- **UNKNOWN here**: collision layer masks, hit reactions, enemy aim/LOS/navigation, spawn timing, actual damage, projectile speed and per-weapon setup. Inspect the referenced private reports and serialized overrides before configuring them.

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

Issue #3 requests the dedicated `superhot-research` gateway to read the handoff-named `spec/combat/` reports first, then inspect scoped code/serialized values and obtain repeatable native observations. Suitable initial JSON requests (one per workflow dispatch):

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

## Second SH-03 audit — 2026-11-02 (primary proof gate)

The *private* `TGrozner/superhot-research` workflow run `41368361512` returned
`HANDOFF.md` lines **1–100** (artifact `13108420851`, result text SHA-256
`408cec616a4e1399120a72df8014e237073b649ab781da688b304df3b7e060a7`,
bridge commit `be6d535e608f66c93db3acc422385035d1281063`).
The handoff identifies MCD build **20299547**, Assembly-CSharp SHA-256
`ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257`
(line **7**), and reports these **unverified** rules:

| Handoff line | Status in SH-03 | Testable/native disproof required |
| --- | --- | --- |
| 74 — R=Replay; KillReloadMod adjusts delays/animations | **HANDOFF-REPORTED** | Check the concrete keyboard profile, action handler, and weapon/ammo mutation paths; observe the active native build with a nonempty and an empty magazine. |
| 75 — ShotGun emits one primary plus `pelletsCount`; dispersal not necessarily normalized | **HANDOFF-REPORTED** | Inspect the exact method/IL token and active weapon instance `(owner,path_id)`; count emitted spawn calls and log each raw vector magnitude in a controlled native shot. |
| 76 — movement Update / sweeps FixedUpdate / deferred enemy shot after LateUpdate | **HANDOFF-REPORTED** | Identify producer methods and actual call order, then capture phase-stamped projectile and AI traces. A single Web tick is **not** a verified substitute. |

Zero combat mechanics are classified **NATIVE-PROVEN** on this branch: neither
`spec/combat/combat-specification.md` nor member-level IL/serialized overrides
have been returned to SH-03. The linked reports are private, not absent. The
connected GitHub actions can **read** workflow runs and download existing
artifacts, but do **not** expose a `workflow_dispatch` write action. Minimal
private query, once an authorized dispatcher is available:

```json
{"operation":"read","path":"spec/combat/combat-specification.md","start":1,"count":200}
```

Follow with `spec/combat/serialized-settings.md` and `spec/combat/ai-and-powers.md`
using the same read API (paginate with `next_start`); only then inspect scoped
methods and serialized active objects, and distinguish source defaults,
instance overrides, and executed runtime. No local scanner/game run was performed.

### Provisional Web safety regression (this branch only)

`firstImpact` rejects non-array geometry and inverted AABBs rather than
silently skipping them or reporting an invalid wall hit. `advanceProjectile`
retains the supplied direction's magnitude (its preexisting numeric behavior,
now explicitly tested) and does **not** normalize shotgun spread or implement
any MCD pellet/AI policy. Five additional `tests/combat-regression.test.mjs`
cases verify these contracts, thin-wall swept traversal and noncollision step
composition. These are tests of authored **WEB-PROVISIONAL** code only; they do
not raise the native-evidence status.

## SH-03 precision-sweep regression (Web only, 2026-11-02)

**PROUVÉ — source Web** (branch based on `main`): `src/math.js`, Git blob
`5d200c382306b0ee69c13e69218f5fb5e2a694de`, `segmentSphere` line 27 (point-like cutoff
`a < 1e-10` line 31), and `segmentAabb` line 42
(parallel cutoff `abs(delta) < 1e-8` line 46).
Those thresholds make nonzero, very short segments miss suitably small
synthetic spheres and AABBs even when the mathematical sweep crosses them.
Two deterministic tests failed before the SH-03 correction.

**PROUVÉ — Web implementation/tests only**: `src/combat/trace.js`
now uses combat-local fraction solvers that distinguish *exactly zero*
movement from short, nonzero movement. `tests/combat-microsweep.test.mjs`
checks a tiny solid, a tiny sphere, an unobstructed/zero-length control,
and `advanceProjectile` expiry/age on impact. The original `src/math.js`
and all integrator files are unchanged. The inputs are artificial regression
fixtures, **not** MCD weapon sizes or hitbox settings.

**INCONNU — MCD**: Native physics substep precision, hit test order,
collision layers, projectile scale, damage rules, and whether MCD ever
produces such microscopic world-space sweeps. No native result is implied
by this fix. The primary-report request remains the private read-only
`corpus-query` of `spec/combat/combat-specification.md:1-200`, followed by
member-level Unity/IL and instantiated scene overrides. SH-05 alone can
consider any browser integration after independent checks.

## SH-03 overflow-safe slab regression — 2026-11-02 (Web only)

**PROUVÉ — bug du code Web précédent :** `src/combat/trace.js` blob
`f93fcd867f56ff8f842c9c516d66dfc3364cd70d` calculait les fractions AABB
avec `(boundary - start) / (end - start)`, puis la position d'impact avec
`start + (end - start) * t`. Des endpoints tous deux finis mais de signes
opposés (fixtures synthétiques `±1e308`) peuvent déborder pendant ces
soustractions. Une boîte traversée à mi-chemin était annoncée à `t=0` ;
les impacts immédiats pouvaient renvoyer une coordonnée `NaN`.
Sur Node 22.16.0, trois des quatre tests
`tests/combat-overflow-slabs.test.mjs` échouaient **avant** le correctif.

**PROUVÉ — comportement Web corrigé :** le traceur de combat utilise
les fractions originales pour les nombres intermédiaires finis et une
normalisation d'échelle locale seulement lorsqu'une soustraction intermédiaire
déborde. Les coordonnées d'impact à `t=0` et `t=1` sont des copies exactes
des endpoints ; les fractions intermédiaires dont le déplacement déborde
utilisent une combinaison convexe. Les quatre régressions synthétiques passent
en Node 22.16.0 dans une reproduction isolée du module. Les seuils,
priorités de collisions et constantes de gameplay ne changent pas.
Une validation du dépôt complet/CI doit être relevée séparément.

**INCONNU — SUPERHOT MCD :** aucune vitesse, dimension de hitbox, politique de
collision, ordre Unity, dégât, arme ni comportement IA n'est déduit de cette
correction numérique. Les intersections de sphères à valeurs extrêmes
restent hors du périmètre de ce test (seule la reconstruction du point
lorsque `t=0` est couverte). L'extraction primaire est toujours bloquée :
lecture privée bornée via `corpus-query` de
`spec/combat/combat-specification.md:1-200`, puis membres IL et
configurations sérialisées actives. Pas d'exécution du jeu natif et aucune
publication d'asset ou de corpus original.

**Intégration :** modules purs uniquement ; le câblage `src/main.js` et
les mesures navigateur restent réservés à SH-05 (issue #5).

## SH-03 finite sphere sweep — 2026-11-02 (Web numerical safety, not MCD parity)

**PROUVÉ / WEB ONLY (baseline)**: `src/combat/trace.js` blob
`99e72e69611967d927dfdad9d6bc57cd83ae3dd1` evaluates
`dot3(offset,offset) - radius²` and the quadratic discriminant directly.
For finite synthetic segment endpoints `±1e200` and sphere radius `1e199`,
intermediate squares overflow and the test misses the sphere. For
`±1e-200` and radius `1e-201`, squared terms underflow and an exterior
start appears to hit at `t=0`. With endpoints `±1e308`, vector subtraction
overflows before the quadratic. The analytic entry in all three cases is
`t≈0.45`. Baseline outcomes were reproduced under Node with the original
sphere-sweep formula: respectively `null`, `0`, `null`.

**Implementation / PROVISIONAL**: `src/combat/trace.js` retains the existing
ordinary-input quadratic and uses a relative-coordinate, scaled fallback
only when intermediates are not representable. `Math.hypot` distinguishes
an interior start without squaring subnormal distances; the fallback
rationalizes the entry root. `tests/combat-sphere-dynamic-range.test.mjs`
checks three crossings, an off-axis near miss and an interior start.
The fallback returns `null` rather than inventing an immediate hit if a
positive entry separation disappears after scaling. This is a numerical
guard, **not** a native collider or physics rule. CI and browser performance
must be reported separately from isolated reproduction.

**INCONNU / MCD**: actual projectile/collider data, hit layers, timing,
weapon/projectile producer callsites, damage and enemy AI, including whether
any native trajectory approaches these magnitudes. Last accessible private
combat reference remains the *secondary* `HANDOFF.md` from workflow run
`41368361512`, artifact `13108420851`. The authorized read-only
`corpus-query` workflow requires unavailable `workflow_dispatch`; private
request remains `{"operation":"read","path":"spec/combat/combat-specification.md","start":1,"count":200}`.
No original assets or private reports are copied here. SH-05 alone owns
`src/main.js` integration.

## SH-03 near-tangent numerical regression — 2026-11-02 (Web only)

**PROUVÉ — prototype Web**: `src/combat/trace.js`, pre-change Git blob
`77e716f83417a78f771f4de9c3a86eb4f3cd4627`, computes a quadratic
discriminant as `b*b - a*c`. At ordinary finite scale, a line from
`(0,0,0)` to `(100,0,0)` with a unit sphere centered at
`(50, 1+1e-14, 0)` falsely yielded an impact at `t=0.5`: subtraction
erased the slight exterior separation. Centering at `y=1-1e-14`
likewise yielded `t=0.5` rather than an entry before closest approach.
An `1e-100`-scale crossing with radius `1e-101` yielded `t=0.5`
instead of `0.45`. Three of five regression tests failed on the
unmodified pure module under Node **22.16.0** in an isolated reproduction.

**PROUVÉ — Web proposed fix**: the finite ordinary branch now checks
the perpendicular closest approach and computes the half-chord using
dimensionless radius ratios to avoid cancellation and squared underflow.
`tests/combat-near-tangent.test.mjs` covers a just-outside miss, an exact
tangent, a just-inside entry, a small-scale crossing, and ordinary/near-end/
away controls. In the same isolated reproduction all **5/5** tests pass,
`node --check src/combat/trace.js` passes. Full repository CI must
be verified independently on the PR head; these numbers are **not** native
combat observation or proof of browser WebGL performance.

**INCONNU — MCD**: Unity sphere colliders, real weapon/projectile size,
physics layer/ordering, damage/AI, runtime scheduling, and any native
tangency convention. No original Unity code, assets, scan or native runtime
observation is included. Private primary read remains blocked until
an authorized `superhot-research` workflow dispatcher executes only
`{"operation":"read","path":"spec/combat/combat-specification.md","start":1,"count":200}`
and returns the result privately. SH-05 exclusively owns `src/main.js`
integration; numerical correctness is not a 1:1 MCD claim.


## SH-03 — projectile snapshot regression (2026-11-02, WEB ONLY)

**PROUVÉ (source Web)**: pre-change `src/combat/projectiles.js` Git blob
`df57edeedab1f55c6e753c7a22385326ecadc26d` checks the input's numeric components, then re-reads
`pos`, `direction`, `speed`, `ttl`, and `age` during integration.
Changing getters can replace the validated values with different or nonfinite
ones. This was reproduced in synthetic Node 22.16.0 fixtures: **3 failing
regressions out of 4** on the prior integration (one ordinary control passed).

**WEB-PROVISIONAL correction**: snapshot each kinematic input only once,
validate the snapshot, use it for movement, lifetime, impact and output.
Other enumerable metadata is retained. No damage, weapon, AI, scheduling,
collision priority or firing constant was changed. The four isolated
regressions pass after the correction; repository CI is a separate gate.

**INCONNU (MCD)**: no new Unity method/IL or active serialized projectile,
damage, weapon, or agent configuration was retrieved. Private
`superhot-research` run `41368361512` remains a *secondary handoff*, not
a native firing proof. The narrow read-only private request remains
`spec/combat/combat-specification.md` lines 1–200 via the authorized gateway;
its `workflow_dispatch` action is not exposed by this connector.
No original resources are copied. SH-05 alone owns browser integration.


## SH-03 trace-input snapshot regression — 2026-11-02 (WEB only)

**PROUVÉ dans la source Web antérieure** : `src/combat/trace.js` blob
`85abd605e99821fe4013106c112c8040567fbafb` validait les coordonnées
des extrémités et des volumes avec `isFinitePoint`, puis relisait
`start/end`, `solid.min/max` et `target.center/radius` pendant les
intersections. Des getters changeants pouvaient donc remplacer une valeur
validée par une valeur non finie, différente, ou déplacer artificiellement
une collision. Ce constat concerne uniquement la cohérence des entrées du
prototype JavaScript.

**WEB-PROVISIONAL correctif** : `firstImpact()` recopie exactement une fois
chaque composante d'extrémité, borne et centre, et chaque rayon, avant de
valider et d'utiliser ces instantanés pour les intersections et le point
d'impact. Il continue de renvoyer les entités originales (identité conservée)
et conserve priorités, tolérance `IMPACT_EPSILON`, rayons et fonctions de
balayage précédentes. Aucun changement de règle d'IA, dégâts, arme, tir,
scheduling, couche de collision ou valeur native.

**Régression** : `tests/combat-trace-snapshot.test.mjs` contient cinq
scénarios synthétiques (extrémités, AABB, sphère, getters imbriqués,
validation d'une première valeur invalide). La CI complète et le résultat
avant/après doivent être relevés sur la PR avant d'affirmer une validation.

**MCD INCONNU** : aucune méthode Unity, instance de prefab, projectile,
hitbox, ou observation de dégâts/IA supplémentaire n'est prouvée ici.
Le rapport primaire privé `spec/combat/combat-specification.md:1-200`
nécessite toujours la passerelle `corpus-query` avec `workflow_dispatch`,
non exposée par cette connexion. Ne copier ni données du corpus privé ni
assets natifs dans le dépôt public. SH-05 est seul propriétaire de
l'intégration `src/main.js` et des mesures de parité.


## SH-03 geometry candidate membership — Web regression (2026-11-02)

**WEB-PROVEN, not native:** `src/combat/trace.js` at baseline Git blob
`57317b999b5033796a9b7f42343c394729b5e33a` used dynamic
`solids.length` and `targets.length` while invoking getters on collider
properties. A getter could append or remove a collider from either array
during a single `firstImpact` call, changing which entities were tested.

The Web trace now snapshots both candidate arrays **before** reading any
collider properties. The original entity references, initial array indices,
collision shapes, tie tolerance, first-hit ordering and point calculations
are unchanged. Only candidate *membership* is stable for that call;
collider values themselves continue to be sampled once per candidate.
The primitive does not snapshot arbitrary external side effects.

`tests/combat-geometry-membership.test.mjs` contains five synthetic
Node scenarios for appending/removing solids, inserting targets across
collections, mutating targets during their own sweep and a frozen-array
projectile control. These are authored Web fixtures and do not encode
MCD geometry, AI, weapon, damage or timing values.

**NATIVE UNKNOWN:** MCD collider membership/scene update phases, hitbox
definitions and impact ordering have not been observed or linked to Unity
methods here. Do not use this regression to claim 1:1 parity. The
minimum outstanding private-only read is
`spec/combat/combat-specification.md` lines 1–200 through the authorized
`corpus-query` gateway, followed by exact Unity member references and
instantiated overrides. SH-05 alone may integrate into `src/main.js`.


## SH-03 P0 native-source report recovered: bounded pistol encounter (2026-11-02)

The private **issue-triggered** corpus bridge is working (the older statements in
this ledger about unavailable `workflow_dispatch` are historical and superseded).
Original reports, C# and serialized assets remain in `TGrozner/superhot-research`;
**no private raw content is copied to this public repository**.

**PROUVÉ — native static-code report, not execution:** MCD build `20299547`,
Unity `2018.4.14f1`, `Assembly-CSharp` SHA-256
`ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257`.
Private issue **#8**, run `41425737208`, artifact `13132969099`,
`spec/combat/combat-specification.md:1-120` (returned text SHA-256
`a6541443d3b745155c4e2341ed6fdd601956be88bb31240838fca87b7748d8db`):

- `PlayerActions.Update:129-223` gates input; `CanPlayerAttack:568+` and
  `Weapon.isWeaponReady:889-904` are not equivalent to a constant cooldown.
- `Gun.Attack:99-147` gates Thrown/readiness/AdditionalShootingCheck,
  fires when ammunition is positive, then consumes **one** round;
  `NoShooting`, zero-ammo click and negative-ammo throw have **different** paths.
  `PistolGun.cs:1-17` delegates to `Gun.Fire:158-204`.
- `Gun.SpawnPooledBullet:228-257` sets `firedByPlayer` and uses a
  noisy muzzle; `Bullet.LaunchInDirectionWithSpeed:396+` stores
  `direction × speed` without a final normalization. The test injects
  muzzle and direction rather than inventing their runtime resolution.
- `Bullet.Update:320-371` translates by velocity × scaled `Time.deltaTime`,
  while `Bullet.FixedUpdate:184-215` separately SphereCasts the swept
  motion (native radius `0.02` in this report). Neither a single RAF
  collision pass nor the existing Web segment tracer equals PhysX SphereCast.
- `Bullet:785-970` takes the ordinary, unarmored/non-concrete/non-boss enemy
  route to `PejAiBody.Kill:565-603`, then `PejAiController.Kill:5766-5832`.
  The follow-on ragdoll/animation is `PejAiAnimator.Kill:1008-1112`;
  **no invented enemy numeric HP subtraction** is introduced for this path.
  Armored, concrete, boss, owner and modifier cases remain separate.

**PROUVÉ — decoded Unity candidate data, not active scene binding:** private
issue **#21**, run `41430166074`, artifact `13133798009`,
`spec/combat/serialized-settings.md:1-120` (text SHA-256
`e40dbffcad81ffadd6b986746b13acd41366e95c79f9fe6a9c5bfa1938f4cfa6`).
Candidate `PistolGun` at `sharedassets0.assets:4849` has serialized
`ammoMin=5`, `ammoMax=5`, `bulletSpeed=36`, `attackDelay≈0.6`.
Candidate `ShotGun` at `sharedassets0.assets:4850` has
`pelletsCount=8`, ammunition `2/2`, speed `36`: paired with
`ShotGun.Fire:51-92` in the code report, the **static** count is
`1 + 8 = 9` projectiles, **not** the code initializer default 12.
Presence in sharedassets does **not** establish that either prefab is
instantiated in a specific MCD level or selected run.

**PROUVÉ — additional source paths reported:** issue **#22**, run
`41430169938`, artifact `13133014952`,
`combat-specification.md:121-163` (text SHA-256
`b6b74c87c9dd15af25f54314d928bc906309e33afa7923cbe9273c27893dc5c3`),
and issue **#23**, run `41430174654`, artifact `13134326224`,
`implementation-extension.md:1-100` (text SHA-256
`a9b0e000ce276260f5321e371dff60bdb5afe47c179338dcb450720ba6664c41`).
Enemy spawn and weapon lifecycle use `PejAiFactory.SpawnForReal:82-130`,
`EnemyPooler.Create:22+` and `HandManager.Pickup:106+`. These
reports contain **static paths**, not proof that our fixture was observed
in a running native game.

**WEB-TESTED, PROVISIONAL end-to-end fixture:**
`src/combat/shot-phases.js` keeps `beginPistolFire`,
`advanceBulletUpdate`, `traceBulletFixedStep` and
`classifyOrdinaryEnemyImpact` separate. With injected gates, muzzle and
serialized-candidate speed `36`, a five-round Pistol plan emits one
projectile and leaves four rounds. An artificial unobstructed sphere at
`x=5` is contacted after a Web step of `0.2` scaled seconds, leading
only to a `kill-enemy(deathSource=Bullet)` **command request**. A wall
blocks it; armor/concrete/boss/owner/special rules do not silently kill.
The fixture's enemy coordinates/radius, simple Web segment intersection,
clock step and guards are **synthetic**, not MCD scene observations.
Tests: `tests/combat-shot-phases.test.mjs` (six cases). Neither native
animation nor actual browser integration is claimed.

**INCONNU / native parity gates:** actual `(owner,path_id)` scene
activation and weapon selection; active modifiers, shot muzzle perturbation
and spread; physics masks, PhysX contacts, pooling and lifecycle; Unity
inter-component scheduling; native runtime trace and enemy ragdoll timings.
`PejAiAnimator.LateUpdate:1114-1211` defers **enemy** bullet spawn until
pose/IK adjustment, and is not modeled by this player-Pistol fixture.
No clone of original C#, model, textures, sounds or prefabs is published.

**SH-05 integration request (#5):** do not change `src/main.js` in this
lane. After code review, feed real input/readiness/scene-derived muzzle,
all shot modifiers, world `Time.deltaTime` and collision geometry into the
pure module; route `kill-enemy` to an existing death/reaction handler only
for a proven unprotected-target context. Preserve Update/FixedUpdate phase
boundary, avoid interpreting Web Node tests as 1:1 parity, and require a
visible browser acceptance plus native capture before declaring fidelity.
