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

## SH-08 — traçage Web et pistes natives ciblées (2026-11-02)

**PROUVÉ (provenance uniquement).** L'artifact privé du workflow `corpus-query` (run `41368361512`, artifact `13108420851`, lecture `HANDOFF.md:1–100`, SHA-256 du `result.json` : `49db909ca1692e3b1e21a2e538b81a7bab11cbb01763f5977fcdb6f2fe832052`) identifie MCD build `20299547` et l'assembly `ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257`. Ce n'est **pas** un certificat de comportement.

**OBSERVÉ DANS UN RAPPORT PRIVÉ (non contre-vérifié en exécution).** `HANDOFF.md:49` pointe `spec/world/README.md` comme index des contrats de niveaux, progression, sauvegardes, HUD, interfaces et **132 timelines**. `HANDOFF.md:55` indique cinq captures dans `runtime/observations.json` (menu, run Containers, déplacement, pause) ; les images/observations elles-mêmes n'ont pas été relues ici. `HANDOFF.md:67,77` identifie `spec/world/semantic-coverage-current.json` comme couverture actuelle et avertit qu'un graphe de progression ne se réduit pas à un menu.

**INCONNU (MCD).** Les nœuds/runs actifs, gardes des transitions, checkpoints, sauvegardes, retour après mort, ordre des écrans, délais et conséquences persistantes restent sans méthodes/instances/observations primaires accessibles. Un dénombrement de timelines ne prouve pas la succession réellement empruntée.

**Requête privée minimale non exécutée** (le connecteur permet de lire les artifacts mais n'expose pas `workflow_dispatch`) :

1. `{"operation":"read","path":"spec/world/README.md","start":1,"count":180}` — identifier les rapports précis par famille avant toute lecture additionnelle.
2. `{"operation":"read","path":"runtime/observations.json","start":1,"count":150}` — séparer les observations réellement effectuées des scénarios envisagés.
3. `{"operation":"read","path":"spec/world/semantic-coverage-current.json","start":1,"count":120}` — sélectionner uniquement les méthodes, données sérialisées et trous de preuve du flux de progression.

**PROUVÉ (Web uniquement).** Le nouveau `src/flow/scenario-trace.js` rejoue sans effets de bord des événements du reducer prototype et enregistre avant/après, champs modifiés et événements ignorés. `tests/flow-scenario-trace.test.mjs` couvre une boucle à trois salles, pause, événements dupliqués, mort/redémarrage, entrées mutées et erreurs. Test ciblé local Node 22.16.0 : **6/6 réussis**. Ce diagnostic n'est ni une sauvegarde, ni un checkpoint natif, ni une mesure de parité. Aucun raccord `src/main.js` (réservé SH-05).

## SH-08 — garde de génération des notifications Web (2026-11-02)

**PROUVÉ — source Web uniquement.** Le reducer existant `src/flow/state-machine.js` (blob `a42ed9136e6208412f231643ee5c6d19d2edf9f8`, `ROOM_CLEARED` et `DAMAGE` dans `reduceFlow`) ne transporte pas d'identifiant de run/room dans ces événements. Les appels `killEnemy` (`src/main.js:223–232`), `damagePlayer` (`:234–239`) et la transition de salle (`:358–365`), blob Web `61be3504577084c863b5ca8e99d4cb0f8ddd582a`, décrivent le prototype mais ne prouvent **aucun callback tardif réellement survenu**. Scénario réfutable Web : une notification de l'ancienne salle délivrée après `RESTART` dans la salle 0 ou après changement de salle doit être comparée au reducer brut (qui l'accepterait) et à l'adaptateur (qui la rejette).

**PROUVÉ — contrat de l'adaptateur Web ajouté, pas une règle MCD.** `src/flow/room-scope.js` expose `createRoomScopedFlow`, `captureRoomScope` et `reduceRoomScopedFlow`. Le jeton gelé `{generation, roomIndex}` est prélevé **lors de la création du producteur** ; `DAMAGE` et `ROOM_CLEARED` exigent ce jeton, sinon erreur explicite. Une portée ancienne renvoie le même objet session sans effet. `START` valide, `RESTART` et changement de salle incrémentent la génération ; pause/reprise la conservent. Les `TICK` restent sans portée et sans changement de sémantique : calcul du temps = lane SH-02. Ce garde ne permet **pas** d'authentifier une provenance entre deux sessions indépendantes et n'est ni un checkpoint, ni une sauvegarde, ni une intégration browser.

**OBSERVÉ — vérification Node locale, exclusivement Web.** `node --check src/flow/room-scope.js` et `node --test tests/flow-room-scope.test.mjs` sur Node `22.16.0` : **7/7 tests passent**. Le module `state-machine.js` testé avait le blob Git exact `a42ed9136e6208412f231643ee5c6d19d2edf9f8` de `main`. Cas couverts : invalidation après relance même salle, après passage de salle, mort/reprise, pause, duplication, entrées invalides, et distinction prise de jeton à la création/à l'arrivée. CI distante et intégration navigateur : à qualifier séparément, **pas** présumées.

**INCONNU — MCD natif.** Il n'existe dans les artifacts actuellement consultés aucune preuve d'une génération de salle, d'une notification tardive, d'un ordonnancement des transitions, de checkpoints ou d'un mécanisme de reprise équivalent. Le build rapporté `20299547` / Assembly-CSharp SHA-256 `ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257` est une provenance, pas une garantie sémantique. Une lecture de `spec/world/README.md`, `runtime/observations.json` et méthodes Unity/instances identifiées, puis une trace native d'origine → garde → transition → sauvegarde, réfuterait ou préciserait cette règle. Le `workflow_dispatch` privé demeure inaccessible à ce connecteur ; **aucune nouvelle requête native** n'a été exécutée pendant cette tranche. Toute connexion au runtime central reste soumise à l'accord de SH-05.
