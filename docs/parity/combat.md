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


## SH-03 — ShotGun source-bounded volley (2026-11-02)

**PROUVÉ PAR RAPPORT DE SOURCE STATIQUE MCD, NON OBSERVÉ EN JEU :**
MCD Steam build `20299547`, Unity `2018.4.14f1`,
`Assembly-CSharp` SHA-256
`ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257`.
La lecture **privée** `superhot-research#8`, run `41425737208`,
artifact `13132969099`, `spec/combat/combat-specification.md:40–56`
(source rapportée `Gun.Attack:99–147`, `ShotGun.Fire:51–92`)
établit que le chemin ShotGun à munition positive décrémente **une**
munition mais produit **un projectile initial + `pelletsCount` suppléments**.
Le premier vecteur est rapporté comme direction normalisée × 1,16 +
échantillon / 35 ; les suivants comme direction d'entrée + échantillon × 2/15.
Le résultat **n'est pas renormalisé** avant la multiplication par la vitesse.
L'ordre du `ShotId` et la résolution de l'aléa/muzzle native restent hors du
module et ne sont pas inventés.

**PROUVÉ PAR ASSET UNITY DÉCODÉ, INSTANCE ACTIVE INCONNUE :** lecture
privée `superhot-research#21`, run `41430166074`, artifact `13133798009`,
`spec/combat/serialized-settings.md:21–27` :
`sharedassets0.assets:4850` est un **candidat** `ShotGun` avec
`pelletsCount=8`, ammo 2/2 et `bulletSpeed=36`. En combinant cette
instance candidate avec le corps de méthode décrit ci-dessus, la projection
statique est **9 projectiles / pression de détente**, pas 8 ni 12. Les
overrides, `(owner,path_id)` de l'arme réellement tenue dans Containers,
les mods et les effets de pooling/réutilisation sont **INCONNUS**.

**PROVISOIRE WEB (et isolé du navigateur) :**
`src/combat/shotgun-volley.js` expose `planShotgunVolley` :
cinq prédicats de permission injectés explicitement, ammo positif requis,
origines des 9 projectiles et échantillons de dispersion fournis par l'appelant,
vitesses non renormalisées et une seule consommation de munition.
Les branches `NoShooting`, arme jetée, tir bloqué et arme vide sont
**non modélisées**, jamais converties silencieusement en tir.
Aucune distribution aléatoire n'est supposée. `pelletIndex` est une
étiquette **Web**, pas la preuve du champ `ShotId` natif.

Les tests `tests/combat-shotgun-volley.test.mjs` couvrent un scénario
**synthétique de bout en bout** : 9 bullet plans → mouvement Update de
la balle centrale → collision Web FixedUpdate → demande de mort
`kill-enemy` sur une cible ordinaire, et contrôle d'occlusion solide.
Ils ne sont **ni** des tests du `SphereCast` PhysX, **ni** une observation
native de projectiles/ragdoll, **ni** une capture d'un tir dans Containers.
La réussite CI doit être vérifiée séparément à la SHA exacte de la PR.

**Raccord SH-05 seulement :** dans `src/main.js` (fichiers exclusifs #5),
identifier d'abord une vraie arme tenue et ses valeurs actives ; passer
les gardes de `Gun.Attack` et le contexte de `ShotGun.Fire`, les origines
muzzle finales et les échantillons Unity-derived/sourcés ; instancier
chacun des 9 projectiles **uniquement** si cette configuration est réellement
active, puis séparer mouvement Update, balayage FixedUpdate, collision
et réaction ennemie. Une capture navigateur montrant neuf trajectoires
et un test natif apparié de cadence, diffusion, collision et dégâts sont
nécessaires avant toute revendication de parité MCD.

**INCONNU / réfutation directe :** une lecture source du corps exact
`ShotGun.Fire:51–92` ou une trace native de tir donnant un autre facteur
pour les directions infirmerait ce contrat ; une arme active avec une
valeur `pelletsCount` différente infirmerait les **neuf** projectiles
pour cette situation, sans infirmer la formule générale `1 + pelletsCount`.


## SH-03 — enemy shotgun deferred fire: native source proven (2026-11-02)

**PROUVÉ — code statique, PAS tir natif observé.** SUPERHOT MCD Steam build
`20299547`, Unity `2018.4.14f1`, `Assembly-CSharp` SHA-256
`ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257`.
New, deduplicated private reads (no original code or asset published):

| Private source | Returned report SHA-256 | Relevant native method |
| --- | --- | --- |
| `superhot-research#69`, artifact `13138341880` | `911ed644...43a416` | `spec/combat/ai-and-powers.md:61–84`; AI ordering/weapon family |
| `superhot-research#70`, artifact `13137622737` | `f2d98cdb...a46c56bd2` | `managed/Assembly-CSharp/ShotGunPejAiWeapon.cs:21–68` |
| `superhot-research#71`, artifact `13138660437` | `2b8166a7...0ca3754989` | `managed/Assembly-CSharp/GunPejAiWeapon.cs:74–117` |

**PROUVÉ — method bodies**:

- `ShotGunPejAiWeapon.Attack:39–56` always stores `haveBeenSeen`, but
  enters Shoot only if `IsAttackReady()`. The successful branch marks
  a **deferred** bullet spawn, calls a sound producer (NOT audible proof),
  notifies the bullet-spawn hook, resets attack delay and alerts radius **5**.
  The Attack target argument is not used to calculate this shotgun's spread.
- `ShotGunPejAiWeapon.UpdateDeferredBulletSpawn:21–37` emits a **first**
  spawn request followed by `pelletCount - 1` additional ones, then asks
  to ignore mutual bullet collisions and clears its deferred flag.
  `pelletCount = 6` at `:6` is a **C# INITIALIZER**, NOT a verified
  Containers instance: six requests is the conditional prediction for
  an active weapon retaining this value. Contrast: player `ShotGun.Fire`
  emits **1 + pelletsCount**, so the two policies must not share a counter.
- Primary direction candidate is `weaponForward × 1.16 + sphereSample / 35`.
  Later candidates are `weaponForward + sphereSample × 1.5 / 15`.
  Only extras vary speed by `Random.Range(-projectileSpeed/15,
  +projectileSpeed/15)`. `GunPejAiWeapon.SpawnBulletLate:85–96`
  **normalizes each direction** before launch; unlike the player ShotGun,
  effective AI launch velocity has the supplied speed magnitude. The
  actual spawn transform remains `bulletSpawnPoint.position` (no
  randomness requested in these calls), not the artificial target point.
- The first `SpawnBulletLate` requests default muzzle flash; all extras
  pass `muzzleFlash=false`. `IgnoreCollisions:59–68` forms every pair:
  for six non-null pooled bullets this is **15** pairwise requests.
  `SpawnBulletLate` returns null on unavailable pool, and the native
  pair loop does not protect null; do **not** assert six bullets existed,
  15 PhysX exclusions succeeded, or that the deferred flag cleared if
  execution throws.
- **Source report, NOT runtime trace:** `PejAiAnimator.LateUpdate:1114–1211`
  calls `UpdateDeferredBulletSpawn` after adjustment/IK of weapon pose.
  The globally relative order of all Unity Update/FixedUpdate methods is
  not established by this local call chain.

**WEB IMPLEMENTATION, NOT MCD 1:1:** `planEnemyShotgunAttack` also requires explicit `alreadyDeferred`: a failed readiness check must preserve a prior pending event, since the native method does not clear its flag on that path. Its `setShootHappenedTrue`, `setReloadedFalse` and `resetAttackDelayRequested` booleans denote **conditional assignments/calls**, not authoritative values of persistent native fields on a non-ready Attack. `src/combat/enemy-shotgun.js` adds
`planEnemyShotgunAttack` (one readiness-gated request) and
`planEnemyShotgunLateVolley` (post-pose candidate spawns, explicitly
injected active `pelletCount`, projectile speed, aim, muzzle and random
samples). The planner does **not** instantiate Bullet, implement
`Physics.SphereCast`, run PhysX, consume ammo, cause damage, play sounds,
or guarantee pool success. The `clearPendingOnSuccessfulCompletion`
field is a **conditional** normal-completion instruction, not a trace
that native completion happened. Input speed jitter factors in [-1,1]
are supplied by the caller, not generated or claimed to match Unity RNG.
Node tests use `pelletCount=6` and `speed=28` as **synthetic fixture
choices matching C# initializers**, never as active Containers settings.

**OBSERVÉ — test Web isolé:** eight deterministic cases locally passed
with Node 22.16.0, including a gated attack, six queued AI shots,
different normalized spread, muzzle taken from the *late* pose, velocity
variation, and 15 pair candidates. The full repository check / GitHub CI
and actual browser rendering must be reported separately on exact HEAD.

**INCONNU:** the enemy shotgun's active scene `(owner,path_id)`, prefab
overrides, active `pelletCount`, actual pose after IK, random samples,
pool returns, attacker/target collider masks, player hit/damage reaction,
audio audibility and visibility in Containers. No original Unity resource
was put into the public repository.

**Smallest falsifiable vertical for SH-05 only:** after identifying the
active enemy weapon and `pelletCount`, log one native attack's readiness,
frame phase, muzzle pose, number of successful pool bullet spawns, spread
and speeds; compare a browser run showing the same **count and trajectories**.
Use `src/main.js` only in lane SH-05 after code review; do not wire a
default enemy shotgun or invent a player damage outcome. A measured
native `pelletCount != 6` falsifies the six-shot scenario for that enemy,
not the source formula. Audio producer calls must not be labeled audible.


## SH-03 — enemy bullet → CustomCollider/PlayerController kill request (2026-11-02)

**PROUVÉ — source MCD statique, PAS observé en jeu :** build Steam
`20299547`, Unity `2018.4.14f1`, Assembly-CSharp SHA-256
`ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257`.
Lecture privée PRIMAIRE `superhot-research#102`, run `41444508326`,
artifact `13141705847`, fichier
`managed/Assembly-CSharp/Bullet.cs:180–324`, SHA-256 de la tranche UTF-8
`db8afed911d821ef53acab8b072c736a63cad3779a663a771b1ed292f3e83d74`.
Aucun code C# ni donnée propriétaire n'est recopié ici.

- `Bullet.FixedUpdate:184–215` neutralise temporairement la propre couche
  du projectile, balaie le déplacement échantillonné avec un
  `SphereCastNonAlloc` de rayon **0,02**, ignores triggers, traite un buffer
  de contacts triés par son comparateur, puis restaure/nettoie l'état. Il
  s'agit d'une phase séparée de `Bullet.Update`. L'ordre exact du
  comparateur, les masks sérialisés, les contacts et le résultat PhysX
  ne sont pas inférés par les tests Node.
- `Bullet.HandleCollision:231–281` ignore les colliders explicitement exclus
  **avant** l'appel d'alerte ; pour les autres il demande une alerte avec
  paramètres `(5, 0.05, 2)`, puis traite les layers. Un contact
  `Environment/Smashers` retourne handled après appel à son handler.
  Un contact `CustomCollider` ne demande
  `PlayerActions.CURRENT.Kill` que si **`!firedByPlayer`** ET si un
  `PlayerController` parent a été trouvé. La position transmise est
  `bullet.transform.position - normalized(velocity) * 5` et les trois
  options `switchToBlack/hardKill/forceKill` sont `false`.
  Un tag `EnemyBullet` n'est pas une preuve du booléen `firedByPlayer`.
- La boucle de `FixedUpdate:198–207` s'arrête si
  `(HandleCollision == true && !sniperBullet) || destroyed`. Un sniper
  peut poursuivre après un handler *uniquement* si le projectile reste vivant.
  Les couches `Enemies`, `DeadEnemies`, `Pickups`, `Glass` et
  `Bullets` ont d'autres branches qui ne sont PAS couvertes par le
  nouveau planificateur borné.

**WEB PROVISOIRE :** `src/combat/incoming-bullet-contacts.js` accepte
uniquement des contacts déjà triés, les flags explicites
`firedByPlayer` / `sniperBullet`, les gardes ignoré/parent contrôleur
et les vecteurs du projectile. Il produit des **demandes d'effets**,
jamais un vrai `PlayerActions.Kill`. Une couche non implémentée ou un
état de destruction sniper inconnu renvoie un blocage explicite.
`tests/combat-incoming-bullet-contacts.test.mjs` inclut un scénario
**synthétique** IA shotgun différé → projectile → translation Update →
contact FixedUpdate déjà injecté → demande kill-player, ainsi qu'un mur
antérieur, un collider ignoré, un projectile joueur et des branches
non prouvées. Les positions, pelletCount=1, horloge et hit buffer de ce
scénario sont inventés comme fixtures de test, PAS des observations Containers.

**INCONNU / critères de réfutation :** arme/IA réellement chargées dans
Containers (owner/path_id, vitesse et nombre de pellets actifs), provenance
du booléen `firedByPlayer` après pooling/mods, filtres de layers, ordre
effectif des contacts PhysX, présence et activation du collider joueur,
timings et animation de mort, comportement audio et trace de tirs natifs.
Une exécution native horodatée avec tir ennemi, SphereCast effectif,
ordre des collisions et appel de `PlayerActions.Kill` doit précéder toute
revendication de parité.

**Correction de lecture inter-lanes (SH-06) :** `PejAiBody.Kill` et
`PejAiController.Kill` ne déclenchent **pas directement**
`PejAiAnimator.Kill`; le chemin `AddBlowForce` l'appelle séparément
(sources privées #86/#87/#89). La mention historique du ragdoll dans le
rapport initial ne prouve donc PAS une animation automatique après
chaque balle. SH-05 décide seul du câblage dans `src/main.js`, après
un contact browser vérifié et une preuve native d'instance/phase.

## SH-03 — Ordered Bullet.FixedUpdate composition (2026-11-02)

**PROUVÉ PAR SOURCE STATIQUE, PAS PAR EXÉCUTION NATIVE :** private research
[#102](https://github.com/TGrozner/superhot-research/issues/102), run
41444508326 / artifact 13141705847, MCD build 20299547, Assembly-CSharp
SHA-256 `ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257`,
`managed/Assembly-CSharp/Bullet.cs:184–215,231–317`, returned-text SHA-256
`db8afed911d821ef53acab8b072c736a63cad3779a663a771b1ed292f3e83d74`.
FixedUpdate sweeps a radius-0.02 sphere through the displacement, sorts
contacts with its native comparer, and stops on `(handled && !sniperBullet) ||
destroyed`. The Bullets branch of HandleCollision returns **false** even
when it requests two slices: later contacts cannot be suppressed solely
because slicing was requested. Ignored colliders bypass the alert.

**WEB IMPLEMENTED, NOT NATIVE PARITY:** `src/combat/bullet-fixed-contact-sequence.js`
composes the existing bullet-pair and incoming-player planners on **caller
supplied, already ordered** contacts. The caller must supply the *evaluated*
`other.CanCollide(this)` and the post-handler `destroyed` state; unknown
values stop inference. Enemies, Glass, Pickups and other native branches are
**UNMODELED**, not silently skipped. The synthetic
`tests/combat-bullet-fixed-contact-sequence.test.mjs` covers enemy shotgun
request → Update displacement → two projectiles' contact requests → possible
player-kill request, with explicit alive/destroyed alternatives and source
phase separation. It exercises **pure plans**; no PhysX, audible hit, health
change, enemy reaction, or renderer proof.

**Correction de composition :** une demande de déplacement du projectile courant
lors d'un contact Bullets devient la position utilisée pour les contacts suivants.
Ainsi un sniper survivant transmet au hit joueur l'origine calculée depuis ce
nouveau point, sans modifier les données d'entrée. L'index du contact est conservé.

**Source complémentaire désormais disponible :** `Bullet.cs:524–527` définit
`CanCollide` par l'identité de l'arme parente ; `SliceInHalf` appelle
`DestroyBullet` (ligne510), qui marque `destroyed` (ligne471). L'environnement
appelle également la destruction (ligne782). Il ne faut plus qualifier ces corps
de méthodes d'inconnus. Le plan accepte toujours les résultats fournis par son
appelant et n'exécute pas ces effets Unity.

**UNKNOWN / REFUTATION:** concrete Containers projectile masks, PhysX contact
ordering, live parent-weapon identities, active shotgun prefab and timing remain
unverified. Enemies/Glass/Pickups are not yet composed into this bounded planner;
it is not substituted for the complete live collision path. A matched native
trace remains necessary for collision parity.


## SH-03 — parentWeaponId CanCollide, source-verified (2026-11-02)

**PROUVÉ par lecture statique, NON observé en gameplay natif :** build MCD
`20299547`, Assembly-CSharp SHA-256
`ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257`.
Private research [#122](https://github.com/TGrozner/superhot-research/issues/122),
run `41471599115`, artifact `13155566748`,
`managed/Assembly-CSharp/Bullet.cs:519–527`, SHA-256 du texte exact
`61ba0220e6e6d083a734407ba1b76a846eedc8b01f934d118064ce89d277ab17`.
La méthode `SetParentWeaponId` enregistre le `GetInstanceID` du
`GameObject` parent fourni. `CanCollide(Bullet b)`, appelée **sur la
balle rencontrée** par `Bullet.HandleCollision:301` (research #102,
artifact `13141705847`, texte SHA-256
`db8afed911d821ef53acab8b072c736a63cad3779a663a771b1ed292f3e83d74`),
accepte si les deux `parentWeaponId` sont distincts **ou** si celui du
receveur est zéro. Ainsi, deux IDs égaux NON NULS refusent la demande de
découpe; un ID nul du receveur l'autorise, même lorsque les deux sont
nuls. Il ne s'agit **ni** du `ShotId`, ni d'une comparaison de tags ou
des camps joueur/ennemi; les gardes same-shot, double-ricochet et
double-deflected sont évaluées séparément, en amont.

**Implémentation Web bornée :** `canEncounteredBulletCollideWithCurrent`
expose cette décision pour deux IDs `int32` explicitement fournis et
`planBulletPairContact` la consomme lorsque **les deux** états
`parentWeaponId` sont présents. Absence d'un champ ≠ zéro. Un résultat
externe `otherCanCollideCurrent` contradictoire donne
`parent-weapon-guard-conflict`; présence partielle donne
`parent-weapon-ids-incomplete`. Le compositeur
`planBulletFixedContactSequence` bloque alors les contacts suivants au
lieu d'inventer une mort. Les tests purement Node injectent phases
d'émission, déplacements, contacts classés et destruction après handler;
une demande `player-kill-request` ne prouve **pas** une mort jouée.

**PROUVÉ statiquement — deux producteurs d'identité réutilisant des
artifacts existants (aucune nouvelle requête) :** `Gun.SpawnPooledBullet:
228–257` renseigne le `parentWeaponId` du projectile à partir du
`GameObject` de l'arme du joueur, avant de le marquer
`firedByPlayer`, de le lancer et d'affecter séparément son `ShotId`.
Source privée [research #91](https://github.com/TGrozner/superhot-research/issues/91),
run `41442386881`, artifact `13141281736`, texte SHA-256
`e983e18faa3eba6b96581b4e22a12085ebb61ea62dd62b5ccc8f35c93b572fe3`.
De même, `GunPejAiWeapon.SpawnBulletLate:74–117` renseigne l'ID parent
avec son propre `GameObject` **après** obtention réussie d'une balle
dans le pool et avant activation. Source privée
[research #71](https://github.com/TGrozner/superhot-research/issues/71),
run `41439732334`, artifact `13138660437`, texte SHA-256
`2b8166a7ce25e3e93ad163c96326690853cc8244a937b4e5d3166f0ca3754989`.
Ce sont deux chemins distincts arme joueur / arme IA, et non une
valeur de `parentWeaponId` démontrée pour une instance Containers.
L'absence de balle disponible dans le pool IA signifie **pas de
renseignement ni de spawn réussi par ce chemin**.

**INCONNU, important pour la scène Containers :** quel objet appelle
`SetParentWeaponId`, la valeur runtime des deux IDs des vraies balles,
le résultat du pool, l'ordre des contacts PhysX, l'état `destroyed`
après `SliceInHalf`, et tout effet réellement visible/entendu. Le
`GetInstanceID` Unity ne doit pas être remplacé silencieusement par un
ID d'entité Web. Les indices de projet ou valeurs C# par défaut ne
prouvent pas les instances effectivement liées.

**Handoff SH-05 :** pour comparer un projectile à un autre, renseigner
les deux identités natives réelles ou une réponse native déjà vérifiée
au même appel; jamais `undefined → 0`. Injecter aussi le contact PhysX
réellement trié et `destroyedAfterHandler`. Tant que ces valeurs
n'existent pas pour Containers, garder la paire **diagnostique**, et ne
pas la câbler comme collision native dans `src/main.js`. Un scénario
réfutable consiste à capturer deux bullets d'une même arme, puis de
deux armes distinctes, relever les deux `parentWeaponId`, vérifier les
demandes `SliceInHalf`, et refaire le même ordre de contacts et de
destruction dans le Web. Aucun asset/code décompilé n'est publié.

## SH-03 — PejAiController visibility: source-backed, not sight-by-distance (2026-11-02)

**PROUVÉ — méthode C# statique, PAS frame de gameplay exécutée.**
MCD Steam build `20299547`, Assembly-CSharp SHA-256
`ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257`.
Relectures PRIVÉES bornées via la passerelle, sans copie du C# dans ce dépôt :
[research #134](https://github.com/TGrozner/superhot-research/issues/134),
artifact `13164851813`, `PejAiController.cs:4383–4458`,
SHA-256 du texte `aa08174c1bcc58da0d9217ea8cdedafb7e9eadd4b96f363031fec6391e090233` ;
[research #135](https://github.com/TGrozner/superhot-research/issues/135),
artifact `13164687081`, `PejAiController.cs:4459–4550`,
SHA-256 `d87e07c3e2f12495d3be78abdb06a1fd4b82d4e831c784fe99969c8c759e15a9`.
Contraste [research #133](https://github.com/TGrozner/superhot-research/issues/133),
artifact `13163638635`, `AIEnvironment.cs:219–245`,
SHA-256 `9791f6e263c9083ca24ab20c3189cae7d04e4ecf133a66c576ad1881af3877b1`.

**Point de confusion évité :** `AIEnvironment.IsPlayerInSight` raycaste
pour la navigation/probes ; ce n'est **pas** la méthode de visibilité du
contrôleur qui viserait le joueur. `PejAiController.CanSeeTarget` exécute
`SphereCastNonAlloc` rayon **0,2** depuis les yeux, le long de la direction
normalisée vers la cible, limité par `sightDistance` et
`eyesightLayerMask`. Ses propres colliders passent temporairement en layer
2, puis retrouvent leur couche. Sur plusieurs hits, la méthode choisit
**la distance minimale**, pas le premier ordre du buffer. Le hit doit être
la transform cible exacte, ou un `PejAiBodyPart` dont le contrôleur pointe
sur cette transform quand `isTargetEnemy` est vrai. Une collision sur un
simple enfant du joueur n'est **pas** qualifiée dans ce chemin. Hors mode
`disregardSightAngle`, l'angle avec `_eyes.forward` doit satisfaire à la
fois dot>=0 et angle<=`SightAngle`. Avec zéro hit, la méthode renvoie
false **avant** d'écrire le cache. Si `cache` est activé, un résultat
encore frais est réutilisé selon `Time.timeSinceLevelLoad` et
`CanSeeCacheRefreshTime` (expiration strictement `>`).

**PROUVÉ — wrappers distincts :** `CanSeePlayer` rafraîchit
`_currentCanSeeAfterGlow` lors d'une visibilité directe, et sinon utilise
son compte à rebours positif ; `CanSeePlayer360` peut réutiliser cet
afterglow sans le réinitialiser. Les variantes pour hotswitch ont d'autres
gardes : pas d'afterglow, et seul le mode non-360 admet le bypass spécifique
à l'AddictMind en hotswitch. Le fait qu'une méthode renvoie true **ne
prouve pas un tir** : l'arbre de comportement, le readiness de l'arme,
l'animation et l'IK restent des étapes séparées.

**Livraison Web (générique, PAS PhysX)** :
`src/combat/ai-visibility.js` expose un planificateur de cast et un
classificateur des hits source-qualifiés, plus la décision d'afterglow.
L'absence de vrai SphereCast renvoie `visible:null`, jamais un
fallback inventé. `tests/combat-ai-visibility.test.mjs` couvre notamment
mur plus proche que joueur, cible/partie corporelle, angle, 360, cache,
afterglow et valeurs manquantes. Ces fixtures **synthétiques** ne sont pas
des traces de Containers.

**INCONNU et bloqueur SH-05 :** objets `Player`/`_eyes` réellement
instanciés dans Containers, `sightDistance`, `SightAngle`,
`eyesightLayerMask`, `CanSeeCacheRefreshTime`, buffer/hits PhysX,
phase `CanSeeTarget` effectivement appelée, état afterglow, archetype,
conditions qui rendent `GunAttack` actif, tirs et réactions observés.
Le prototype public se déplace/tire encore selon distance/timer : raccorder
un cast Web **qualifié** uniquement après obtention des vraies couches,
masks et volumes, et comparaison d'une poursuite/tir de l'autre côté
d'un obstacle dans les deux jeux. Ne pas transformer les valeurs par
défaut d'une classe en paramètres natifs actifs. Aucun fichier SH-05
n'est modifié par ce lot.
