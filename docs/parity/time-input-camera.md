# SH-01 — temps, entrées, caméra (MIND CONTROL DELETE)

**État : inventaire de preuves partielles, pas un contrat de parité exécutable.** 2026-11-02. La cible est **SUPERHOT: MIND CONTROL DELETE** (Steam app 690040), pas le jeu SUPERHOT original. Les affirmations sont classées PROUVÉ (déclaration décompilée), OBSERVÉ (exécution native), INCONNU. Ce dépôt public ne reproduit pas le code décompilé ni les assets originaux.

## Provenance et périmètre

- Corpus **privé** `TGrozner/superhot-research`, commit `be6d535e608f66c93db3acc422385035d1281063`, passerelle en lecture seule.
- Inventaire `status` : [run #41367571984](https://github.com/TGrozner/superhot-research/actions/runs/41367571984). Snapshot achevé le 2026-11-02 à 00:05:57 UTC, **511 fichiers**, `allMatched: true`. Cela ne démontre aucune parité sémantique.
- Lecture native disponible : `decompiled/TimeControl.decompiled.cs`, **lignes 1–25 seulement**, longueur totale du fichier 3565 octets, [run #41367755041](https://github.com/TGrozner/superhot-research/actions/runs/41367755041), artifact privé `13108091209`, SHA256 **du texte extrait** `2dd2d1465e860ce6f69b0cd652550bd7ff4bbe25d1ba56e579d8a1207281a596`. Reprise ligne 26.
- Registre machine-readable : [time-input-camera.evidence.json](./time-input-camera.evidence.json), avec identifiants et plages de lignes. Une valeur initialisée dans une classe Unity n'est **pas** nécessairement la valeur d'une instance de scène sérialisée.

## PROUVÉ — uniquement comme déclaration / constante décompilée

| ID | Symbole | Valeur déclarée | Ligne | Ne prouve pas |
| --- | --- | ---: | ---: | --- |
| TC-001 | `TimeControl.minTimescale` | 0.01 | 10 | vitesse minimale runtime |
| TC-002 | `TimeControl.minTimescaleStep` | 0.001 | 12 | algorithme d'application |
| TC-003 | `TimeControl.maxTimescale` | 1 | 14 | absence d'override sérialisé |
| TC-004 | `TimeControl.fixedTimestepDenominator` | 60 | 16 | cadence réelle du pas physique |
| TC-005 | `TimeControl.forcedTimeScale` | -1 | 22 | signification/priorité du sentinelle |
| TC-006 | `TimeControl.referenceFixedDeltaTime` | 1/60 | 24 | règle d'assignation du fixed timestep |

Les lignes 5–6 déclarent un composant Unity `TimeControl` (`MonoBehaviour`). Les lignes 8, 18 et 20 exposent un champ d'instance statique, un champ d'override du timestep fixe et un registre statique de `ITimeShifter`. **Aucun parcours effectif du registre, aucun tick et aucune unité de mesure n'est établi** par ces seules lignes.

## Relève privée consultée — éléments **rapportés**, pas encore preuves primaires SH-01

Un second artifact privé a été effectivement lu : `HANDOFF.md` **lignes 1–100**, [run #41368361512](https://github.com/TGrozner/superhot-research/actions/runs/41368361512), artifact `13108420851`, SHA-256 du texte UTF-8 `408cec616a4e1399120a72df8014e237073b649ab781da688b304df3b7e060a7`. Le rapport cible MCD **build 20299547**, Unity **2018.4.14f1**, Assembly-CSharp SHA-256 `ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257`. C'est un **rapport de transmission secondaire** : SH-01 n'a pas encore relu les méthodes CIL, l'instance de scène ni les captures associées. La classification native des six hypothèses reste donc **INCONNU**, même si leur *présence dans le rapport* est vérifiée.

| ID | Information rapportée (à contre-lire) | Rapport privé | Preuve native minimale / réfutation |
| --- | --- | --- | --- |
| TC-R01 | Agrégation des shifters par maximum, clamp, puis override forcé ; pause zéro distincte du ralentissement minimal | `HANDOFF.md:69–71` | Branches de `TimeControl`, ordre des écritures de `Time.timeScale` ; réfuter si override appliqué avant clamp. |
| TC-R02 | Mouvement joueur en `Time.deltaTime` ; composant actif `AsymmetricSmoothLinearInstantTimeShifter`, pas `WalkingTimeShifter` | `HANDOFF.md:72` | Méthode active et binding de scène ; réfuter si mouvement en temps non scalé ou autre shifter réellement lié. |
| TC-R03 | Containers : `RUN_LEVEL_6C → SHRL_ContainerPort → build 28` ; dénominateur physique d'instance **120**, contre **60** comme initialiseur | `HANDOFF.md:73` | `(owner,path_id)` de la scène active + champ sérialisé + éventuels overrides ; réfuter si instance ou valeur différente. |
| TC-R04 | Profil clavier/souris : **R → Replay**, pas rechargement ; `KillReloadMod` affecte délais/animations | `HANDOFF.md:74` | Profil et dispatcher effectifs + écritures du mod ; réfuter si R recharge ou si le mod remplit les munitions. |
| TC-R05 | Index caméra/joueur : 467 composants managés et 269 objets natifs dans `spec/player-camera-bindings.json` | `HANDOFF.md:46` | Lire l'index, identifier caméra active et méthode+paramètres ; les nombres seuls ne prouvent aucune cinématique. |
| TC-R06 | Cinq observations/captures, **pas de mesure numérique** du pas ou de la caméra | `HANDOFF.md:55` | Lire `runtime/observations.json` ; réfuter cette absence si des mesures horodatées y figurent. |

Ces points ne sont **ni OBSERVÉ** (exécution quantitative contrôlée) ni **PROUVÉ par SH-01** (corps de méthode/valeur sérialisée contre-lus). Ils ne doivent **pas** entrer comme paramètres de gameplay avant les lectures primaires. Les métadonnées, identifiants de source, critères de réfutation et niveaux de preuve sont dans `time-input-camera.evidence.json`.

### Demandes complémentaires minimales

Le workflow privé `corpus-query.yml` reste déclenchable via `workflow_dispatch` pour une session disposant des droits, **mais ce connecteur n'expose que la lecture** des runs/artifacts. Aucune nouvelle interrogation n'a été lancée dans ce cycle. Priorité aux lectures déjà demandées ci-dessous, puis `{"operation":"read","path":"spec/player-camera-bindings.json","start":1,"count":250}` pour établir la sélection de la caméra. Les éventuelles lignes dépassant la limite retournée doivent être paginées ; ne jamais publier ces sources originales dans le repo Web.

## OBSERVÉ — exécution native

**Aucune observation quantitative du contrôle temporel, des entrées ou de la caméra n'est encore disponible dans les artifacts lus par SH-01.** L'inventaire d'objets Unity et les captures d'autres sujets ne sont pas des mesures de vitesse du monde. Le fichier `runtime/observations.json` est à consulter avant toute conclusion.

## INCONNU — blocages pour la parité

- **TC-U01** : formule et phase d'actualisation de `Time.timeScale`, temps réel vs temps monde, interpolation.
- **TC-U02** : valeurs effectives des composants `TimeControl` sérialisés dans la scène/prefab active.
- **TC-U03** : signification et priorité de `forcedTimeScale = -1`.
- **TC-U04** : caméra : axes et coefficients de souris/manette, sensibilité, FOV, pitch clamp, smoothing.
- **TC-U05** : contribution séparée du déplacement, visée, tir, recharge, saut et pause sur l'accélération temporelle.

### Baseline Web : **pas une preuve native**

Au commit Web initial `9f01f92411b4e125b2c992deee53602a8c67c416`, `src/main.js` initialise `state.speed` à 0.04 et utilise un plancher de 0.035, puis interpole une cible augmentée par déplacement, visée, tir et recharge. La caméra utilise des coefficients souris fixés en dur. Ce sont des **comportements provisoires**. Comparer directement le plancher Web à l'initialiseur `0.01` de MCD **ne suffit pas** à prouver une divergence, car la sérialisation et l'algorithme natif sont encore inconnus.

## Expériences minimales avec réfutation explicite

| Cas | Mesure native (sans injection ni patch) | Hypothèse réfutée si… |
| --- | --- | --- |
| E-01 repos | valeur temporelle stable après plusieurs secondes sans aucune entrée, même scène, fps horodatés | différent de 0.01, ou override actif : « le runtime atteint toujours 0.01 » |
| E-02 entrées | cinq séquences isolées : repos, mouvement seul, regard seul, tir seul, recharge seule ; comparer 60/120 Hz | les courbes diffèrent : « viser = bouger en coefficient » |
| E-03 timestep | identifier écritures/lectures de `Time.fixedDeltaTime` et tracer pendant repos/action | valeur variable : « le fixed step vaut toujours 1/60 » |
| E-04 caméra | même delta souris avec plusieurs pitches et vitesses du temps ; trouver le contrôleur actif | delta angulaire variable : « .00245 rad/pixel constant » (baseline Web) |
| E-05 sérialisation | retrouver composant actif par `(owner,path_id)` et relever ses champs | valeurs différentes : « initialiseur = scène » |

### Requêtes privées manquantes (ordre de priorité)

Le connecteur GitHub de SH-01 permet **lecture** des Actions/artifacts, mais n'expose pas le déclenchement `workflow_dispatch`. Les requêtes ci-dessous **n'ont pas été lancées**. Depuis l'interface Actions du dépôt privé, déclencher **séparément** `corpus-query.yml` avec les JSON suivants :

```json
{"operation":"read","path":"decompiled/TimeControl.decompiled.cs","start":26,"count":160}
```

Puis :
```json
{"operation":"read","path":"spec/time-input-camera.md","start":1,"count":600}
```
et
```json
{"operation":"read","path":"runtime/observations.json","start":1,"count":250}
```

**Gate SH-02 / SH-05 :** les tests `tests/time-contract-evidence.test.mjs` vérifient seulement la traçabilité du registre, **pas** la fidélité gameplay. Parité recevable uniquement avec branche native identifiée, instance active, échantillon original mesuré, API Web testable et comparaison différentielle. Réservation exclusive SH-01 : ce document, son registre et le fichier de tests cité. `src/main.js` reste réservé à l'intégrateur.
