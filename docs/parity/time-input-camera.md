# SH-01 — temps, entrées, caméra (MIND CONTROL DELETE)

**État : inventaire de preuves partielles, pas un contrat de parité exécutable.** 2026-11-02. La cible est **SUPERHOT: MIND CONTROL DELETE** (Steam app 690040), pas le jeu SUPERHOT original. Les affirmations sont classées PROUVÉ (déclaration décompilée), OBSERVÉ (exécution native), INCONNU. Ce dépôt public ne reproduit pas le code décompilé ni les assets originaux.


> **Mise à jour P0 — 2 novembre 2026 :** les issues privées #6 (artifact `13134400167`), #13 (`13134370412`) et #15 (`13133497389`) ont maintenant réussi. Le corps `TimeControl.Awake/LateUpdate/GetAggregateTargetTimescale` est relu directement en #13 ; la scène `level28` et ses liens temps/caméra sont contre-lus par SQL indexé en #38 (`13134630168`) ; les méthodes caméra le sont en #40 (`13133293284`). **Le 60 de l'initialiseur n'est pas le 120 sérialisé de `TimeControl18679` dans Containers.** Aucun échantillonnage temporel ni test 1:1 natif n'est démontré. Le compte rendu dans [SH-01 #1](https://github.com/TGrozner/superhot-web/issues/1#issuecomment-6575143801) donne les méthodes, SHA, limites et réfutations. Les indications « en attente » ci-dessous décrivent des contrôles historiques, non le statut actuel.

## Provenance et périmètre

- Corpus **privé** `TGrozner/superhot-research`, commit `be6d535e608f66c93db3acc422385035d1281063`, passerelle en lecture seule.
- Inventaire `status` : [run #41367571984](https://github.com/TGrozner/superhot-research/actions/runs/41367571984). Snapshot achevé le 2026-11-02 à 00:05:57 UTC, **511 fichiers**, `allMatched: true`. Cela ne démontre aucune parité sémantique.
- Lecture native disponible : `decompiled/TimeControl.decompiled.cs`, **lignes 1–25 seulement**, longueur totale du fichier 3565 octets, [run #41367755041](https://github.com/TGrozner/superhot-research/actions/runs/41367755041), artifact privé `13108091209`, SHA256 **du texte extrait** `2dd2d1465e860ce6f69b0cd652550bd7ff4bbe25d1ba56e579d8a1207281a596`. Reprise ligne 26.
- Registre machine-readable : [time-input-camera.evidence.json](./time-input-camera.evidence.json), avec identifiants et plages de lignes. Une valeur initialisée dans une classe Unity n'est **pas** nécessairement la valeur d'une instance de scène sérialisée.

## Passerelle privée réellement opérationnelle — contrôle du 2 novembre 2026

- **PROUVÉ — transport, pas comportement MCD :** `TGrozner/superhot-research/.github/workflows/corpus-issue.yml` (blob Git `34a5c0daae3d238c41414279221b639a1be25cff`) reçoit les issues privées à titre préfixé `[corpus-query]`, avec corps JSON brut, puis sollicite le runner `superhot-local` en **lecture seule**. La transmission a effectivement réussi pour [l'issue privée #2](https://github.com/TGrozner/superhot-research/issues/2), run `41424396779`, artifact privé `13131037087`. Le `result.json` téléchargé contient `HANDOFF.md:1–104` ; SHA-256 **du texte retourné** recalculé : `6acfa468377373c1c3118e3eee599b115a2105bd01f6845bc18d745986d8bea3`. **C'est un handoff secondaire, non une contre-lecture des méthodes exécutées.**
- **OBSERVÉ — transport et état de file uniquement :** [l'issue privée SH-01 #6](https://github.com/TGrozner/superhot-research/issues/6), créée le `2026-11-02T09:59:04Z`, demande `read spec/time-input-camera.md start=1 count=160`. Au contrôle effectué vers 10:05 UTC, **aucun commentaire au contrôle historique** ; issue #6 depuis résolue avec artifact `13134400167`. Ne pas créer d'issue identique ni de rafale de requêtes tant que celle-ci attend. D'autres lanes attendent également ce runner.
- **INCONNU — jeu natif :** aucune méthode de calcul du temps, instance sérialisée réellement active, liaison effective des touches ou contrôleur caméra n'est nouvellement prouvée par ces messages. La valeur `120` de Containers et `R → Replay` restent rapportées, non vérifiées par SH-01 sur une source primaire. Pour les éprouver : inspecter les corps/métadonnées CIL, le binding `(owner,path_id)`, puis des traces horodatées annotées en unité, horloge, phase et build. Une branche active contradictoire ou une autre instance réfute l'hypothèse.
- **État post-réponse #6 :** #13 a déjà couvert le corps TimeControl ; restent les observations natives horodatées et les liaisons actives. Les requêtes historiques étaient `read` privées **séquentielles et bornées** pour `decompiled/TimeControl.decompiled.cs:26+160`, `runtime/observations.json:1+250` et `spec/player-camera-bindings.json:1+250`, dans cet ordre à réévaluer suivant les chemins/méthodes réellement cités par le rapport. Aucun binaire, code décompilé ou asset ne doit sortir du dépôt privé.

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

Mise à jour : le déclencheur par issue privée `corpus-issue.yml` est désormais **fonctionnel et vérifié** (section « Passerelle privée réellement opérationnelle »). Une lecture SH-01 est déjà demandée en issue privée #6, **sans résultat reçu** lors du contrôle ; ne pas la dupliquer. Priorité aux lectures déjà demandées ci-dessous, puis `{"operation":"read","path":"spec/player-camera-bindings.json","start":1,"count":250}` pour établir la sélection de la caméra. Les éventuelles lignes dépassant la limite retournée doivent être paginées ; ne jamais publier ces sources originales dans le repo Web.

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

La requête `spec/time-input-camera.md:1+160` est **déjà en attente** dans l’issue privée #6 via `corpus-issue.yml`. Les exemples ci-dessous sont **historiques : la lecture TimeControl #13 est déjà terminée** : ouvrir une seule issue privée `[corpus-query]` à la fois, avec corps JSON strict, **après** le résultat précédent ; l’ancien obstacle `workflow_dispatch` ne s’applique plus.

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


## Tests de frontière Web ↔ MCD (SH-01, 2026-11-02)

Le fichier [`tests/time-contract-web-gaps.test.mjs`](../../tests/time-contract-web-gaps.test.mjs) exécute **cinq canaris Web** contre les fonctions publiques de SH-02, puis vérifie que l'affirmation native correspondante **n'a pas été promue** de son niveau de preuve. Il ne contient aucune donnée brute du jeu, ne lance aucun original, n'infère aucune équation native. Ces tests doivent être remplacés/ajustés lorsque SH-01 aura une preuve primaire et que SH-05 approuvera le raccord ; leur succès ne vaut **jamais** certificat de parité.

| Cas | Ce que le test prouve sur notre Web actuel | Pointeur MCD, classification et scénario de réfutation |
| --- | --- | --- |
| **TC-G01** | `src/time.js:getTargetTimeScale` utilise actuellement `minimumScale=0.035` au repos. | **PROUVÉ, déclaration uniquement** : `decompiled/TimeControl.decompiled.cs:10`, TC-001, initialise `minTimescale=0.01` (artifact `13108091209`). **INCONNU runtime** : `HANDOFF.md:69–71`, TC-R01. Réfuter toute assimilation des planchers en identifiant l'instance active puis la branche et la valeur effectivement écrite dans `Time.timeScale`. |
| **TC-G02** | `src/time.js:stepTime` produit une horloge réelle et monde distinctes ; `paused` gèle les deux dans le prototype. | **INCONNU** : TC-R01, `HANDOFF.md:69–71`, pause native et ordre max/clamp/override non contre-lus. Réfuter l'équivalence avec une trace native horodatée repos→action→pause→reprise et les méthodes `TimeControl`. |
| **TC-G03** | `src/input.js:keydownAction` conserve `KeyR → reload` dans le prototype. | **INCONNU** : TC-R04, `HANDOFF.md:74` rapporte `R → Replay`. Lire profil actif + dispatcher + `KillReloadMod` ; réfuter par un binding actif ou un effet munition opposé au rapport. **Ne pas changer le contrôle Web en se fondant sur ce seul handoff.** |
| **TC-G04** | `src/input.js:movementStep` est linéaire en `dt` fourni et n'accepte aucun facteur temps monde. | **INCONNU** : TC-R02, `HANDOFF.md:72` rapporte `Time.deltaTime` et `AsymmetricSmoothLinearInstantTimeShifter`. Identifier la méthode et le composant actifs par scène, puis comparer déplacements à 60/120 Hz ; réfuter si le temps non-scalé ou un autre shifter est réellement utilisé. |
| **TC-G05** | `src/input.js:applyMouseLook` utilise le coefficient et le clamp du prototype. | **INCONNU** : TC-R05, `HANDOFF.md:46` renvoie à `spec/player-camera-bindings.json`. Identifier `(owner,path_id)`, scène et contrôleur actifs, puis mesurer angle/delta souris aux pitches extrêmes ; réfuter toute constante supposée par ces traces. |

**Provenance native inchangée** : MCD build `20299547`, Unity `2018.4.14f1`, assembly SHA-256 `ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257`, corpus privé commit `be6d535e608f66c93db3acc422385035d1281063`. Les références primaires et secondaires exactes (runs, artifact IDs, SHA-256 des textes) figurent plus haut et dans `time-input-camera.evidence.json`. **OBSERVÉ natif : aucun élément quantitatif supplémentaire.** Ce cycle ne déclenche pas `workflow_dispatch` ni le runner ; les quatre requêtes privées bornées décrites dans l'issue #1 restent nécessaires.



## Qualification d'une comparaison temporelle (SH-01, TC-Q01 à TC-Q05)

Le test [`time-contract-qualification.test.mjs`](../../tests/time-contract-qualification.test.mjs) définit une **porte de recevabilité méthodologique**. Il ne déduit aucune règle supplémentaire de MCD : le résultat `COMPARABLE` signifie uniquement que l'on dispose des données nécessaires pour tenter une comparaison différentielle, **jamais** une parité 1:1 certifiée.

| ID | Entrée auditée et statut actuel | Source exacte / version | Réfutation ou critère de levée |
| --- | --- | --- | --- |
| **TC-Q01** | **PROUVÉ — déclaration seulement** : `fixedTimestepDenominator = 60`. **INCONNU — runtime** : un rapport signale 120 sur une instance Containers. | `decompiled/TimeControl.decompiled.cs:16`, TC-004, artifact privé `13108091209` / run `41367755041` ; `HANDOFF.md:73`, TC-R03, artifact `13108420851` / run `41368361512` ; cible build `20299547`. | Lire l'instance active `(owner,path_id)`, la valeur sérialisée et les écritures sur `Time.fixedDeltaTime`. Une autre instance ou un override runtime réfute l'utilisation de 60 ou de 120 comme contrat universel. |
| **TC-Q02** | **INCONNU — méthode effectivement exécutée** : une entrée du handoff n'est pas le corps IL/CIL d'une méthode ni une mesure. | `HANDOFF.md:69–74`, TC-R01 à TC-R04, SHA-256 du texte lu `408cec616a4e1399120a72df8014e237073b649ab781da688b304df3b7e060a7`. | Fournir corps de méthode + identifiant + lignes/token, SHA de l'assembly et branche d'appel effectivement liée à la scène. Réfuter l'hypothèse par une branche effective différente. |
| **TC-Q03** | **INCONNU — observation quantitative** : aucune trace native admissible n'a été lue. Une suite d'images ou des timestamps hors unité ne vaut pas mesure. | `runtime/observations.json` **non lu** ; source signalée par `HANDOFF.md:55` (TC-R06). | Deux échantillons au minimum, temps en secondes strictement croissant, valeur finie avec unité explicite, build et scène ; vérifier une trace contradictoire ou une mesure non calibrée. |
| **TC-Q04** | **COMPARABLE uniquement sur fixture synthétique** ; **INCONNU pour MCD**, aucune certification de parité. | `tests/time-contract-qualification.test.mjs`, fixture de test artificielle ; version Web déterminée par le SHA du commit de la PR, **pas** un original MCD. | Pour un test réel, exiger aussi une trace Web horodatée et versionnée, même scène et événement ; même une concordance locale ne prouve pas 1:1 sur toutes les branches. |

| **TC-Q05** | **INCONNU / non comparable** si scènes ou unités physiques diffèrent, même avec des séries numériques bien formées. | `tests/time-contract-qualification.test.mjs`, fixture artificielle sans observation MCD. | Réfuter un appariement en changeant l'identifiant de scène ou l'unité de la grandeur mesurée ; exiger la concordance des deux avant comparaison. |

Les contrôles automatisés exigent simultanément : déclaration de source explicitement limitée ; méthode avec type, nom, bornes et SHA d'assembly ; binding d'instance active `(scene,owner,pathId)` ; traces native et Web finies, horodatées et versionnées, avec unités de mesure identiques et scène native correspondant au binding. **Ils vérifient la présence/cohérence de métadonnées, pas l'authenticité du corpus ni l'exécution de la méthode.** Seules les lectures privées et les observations originales permettent de relever réellement le niveau de preuve.

### Audit de disponibilité de la passerelle (2026-11-02)

Historique de l’audit antérieur à `corpus-issue.yml` — lecture des exécutions du workflow privé `corpus-query.yml` : six runs visibles, dont le dernier succès `41368361512` démarré à **00:39:56 UTC** ; **aucun run plus récent** au moment de cet audit. L'artifact `13108150429` (run `41367855635`) est une tranche de **262144 octets d'une capture PNG**, pas une lecture des méthodes temps/entrées/caméra ; il ne permet pas une mesure chiffrée. Cet audit est **historique** ; depuis, la passerelle par issue privée fonctionne (issue #2 prouvée) et SH-01 a ouvert #6, encore sans réponse au dernier contrôle.

La demande minimale reste quatre lectures privées `read` (séparées, sans scan) : `decompiled/TimeControl.decompiled.cs:26+160`, `spec/time-input-camera.md:1+600`, `runtime/observations.json:1+250`, `spec/player-camera-bindings.json:1+250`. Les contenus originaux restent privés. Ni `src/main.js` ni les modules SH-02 ne sont modifiés.


## Qualification des scénarios et fenêtres (SH-01, TC-Q06 à TC-Q09)

**PROUVÉ — uniquement pour le test de recevabilité Web** : la porte `assessComparisonReadiness` de `tests/time-contract-qualification.test.mjs` vérifie désormais, en plus de Q01–Q05, que les deux traces portent un même `scenarioId`, une empreinte SHA-256 identique du stimulus canonique (`inputSha256`) et le même `observable` (Q06–Q08). Leurs fenêtres **relatives à l'événement** doivent commencer à `t=0` et se terminer au même instant (Q09). Les fréquences d'échantillonnage intermédiaires peuvent différer. Le succès reste seulement `COMPARABLE` et conserve obligatoirement `parityCertified=false` ; les tests utilisent des **fixtures intégralement synthétiques**. L'égalité de deux empreintes ne démontre pas l'authenticité de leur entrée native.

**INCONNU — MCD** : aucune nouvelle trace native horaire, entrée ou caméra n'a été acquise. Provenance encore limitée à `decompiled/TimeControl.decompiled.cs:1–25` (en particulier `TC-004`, initialiseur 60 à la ligne 16 ; lecture privée run `41367755041`, artifact `13108091209`, SHA-256 `2dd2d1465e860ce6f69b0cd652550bd7ff4bbe25d1ba56e579d8a1207281a596`) et au rapport secondaire `HANDOFF.md:69–74` (run `41368361512`, artifact `13108420851`). Version MCD rapportée : Steam build `20299547`, Unity `2018.4.14f1`, Assembly-CSharp SHA-256 `ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257`. Aucun de ces documents ne prouve l'identité des stimuli ou fenêtres d'un enregistrement effectif.

**Scénarios réfutables Q06–Q09** : deux traces quantitativement égales mais issues de repos contre déplacement doivent échouer (Q06) ; de commandes distinctes sous un nom identique doivent échouer si leurs empreintes diffèrent (Q07) ; comparer deux phénomènes de même unité mais de nature différente doit échouer (Q08) ; comparer les mêmes commandes sur des durées ou origines temporelles différentes doit échouer (Q09). Pour lever les inconnues natives, il faut toujours l'instance de scène active, la méthode réellement liée, le stimulus horodaté **normalisé et versionné**, les traces natives/Web séparées et une vérification explicite de leur provenance. Les quatre petites lectures privées déjà demandées dans l'issue #1 restent la priorité ; aucun scan ni exécution originale n'est lancé par ces tests.


## Identité des sources avant toute comparaison (SH-01, TC-Q10 à TC-Q15)

**PROUVÉ — comportement du garde méthodologique Web uniquement.** Les tests `tests/time-contract-qualification.test.mjs` rejettent désormais les métadonnées incohérentes qui pouvaient auparavant afficher `COMPARABLE` sur une fixture synthétique : plages de lignes inversées/non entières ou commençant à zéro (TC-Q10), SHA d'assembly différent de la cible (TC-Q11), build natif différent de la cible (TC-Q12), chemin de source de méthode absent/vide (TC-Q13), version Web non identifiée par un SHA de commit à 40 caractères (TC-Q14) et propriétaire d'instance vide (TC-Q15). Ces six tests ne requièrent aucun original ; ils vérifient des **rejeteurs de comparaison**, pas la fidélité des comportements MCD.

**Provenance du référentiel de contrôle :** `TC-004`, `decompiled/TimeControl.decompiled.cs:16`, lecture privée [run 41367755041](https://github.com/TGrozner/superhot-research/actions/runs/41367755041), artifact `13108091209`, SHA-256 du texte `2dd2d1465e860ce6f69b0cd652550bd7ff4bbe25d1ba56e579d8a1207281a596` (**PROUVÉ comme initialiseur seulement**). L'identité cible MCD build `20299547` et Assembly-CSharp SHA-256 `ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257` est **rapportée secondairement** dans `HANDOFF.md:1–8` ([run 41368361512](https://github.com/TGrozner/superhot-research/actions/runs/41368361512), artifact `13108420851`, SHA-256 du texte `408cec616a4e1399120a72df8014e237073b649ab781da688b304df3b7e060a7`). Les tests prennent ces identifiants comme **cibles d'appariement**, jamais comme preuve d'exécution native.

**OBSERVÉ — runtime natif : aucun nouveau résultat.** Une fixture peut volontairement utiliser des étiquettes correspondant à ces SHA/builds tout en étant 100 % fabriquée : `COMPARABLE` reste un prédicat sur la **forme des métadonnées** et `parityCertified=false` est obligatoire. Les tests ne calculent ni ne vérifient cryptographiquement l'empreinte du jeu ou d'un stimulus enregistré. **INCONNU** : méthode TimeControl effectivement exécutée, composant Unity actif `(owner,path_id)`, observations chiffrées temps/entrées/caméra, et authenticité de leurs traces.

**Réfutations minimales :** une méthode réellement contre-lue dans une autre assembly cible, un nouveau build natif explicitement choisi, ou une scène active dont l'identifiant diffère imposera de **versionner le contrat et adapter ces portes**, jamais de convertir silencieusement un rejet en parité. Les quatre lectures privées toujours nécessaires et non déclenchées ici sont `decompiled/TimeControl.decompiled.cs:26+160`, `spec/time-input-camera.md:1+600`, `runtime/observations.json:1+250` et `spec/player-camera-bindings.json:1+250` via `corpus-query` en lecture seule. Aucun fichier `src/` partagé modifié.


## Qualification des conditions initiales (SH-01, TC-Q16 à TC-Q18)

**PROUVÉ — uniquement pour la porte de comparaison Web** : la fixture *entièrement synthétique* de `tests/time-contract-qualification.test.mjs` ne peut être classée `COMPARABLE` que lorsque (1) la scène canonique de la trace Web correspond au binding de scène, (2) les deux traces portent le même SHA-256 de l'état initial choisi, (3) leur profil d'entrées et leur graine déterministe entière non négative concordent. **Même si elles concordent, `parityCertified` reste `false`.** Il s'agit de cohérence déclarative, pas d'authentification des captures.

| Cas | Statut, données contrôlées | Scénario falsifiable |
| --- | --- | --- |
| **TC-Q16** | **PROUVÉ (test Web)** : une trace Web associée à une scène canonique différente est `INCONNU` (`web-measurement`). | Garder le même échantillon, les mêmes unités et commandes, puis changer uniquement `webTrace.scene`. |
| **TC-Q17** | **PROUVÉ (test Web)** : un état initial absent, mal formé ou différent est `INCONNU` (`matched-initial-context`). | Préserver les commandes et les horodatages, puis changer uniquement `initialStateSha256`. |
| **TC-Q18** | **PROUVÉ (test Web)** : profil d'entrées et graine déterministe doivent coïncider ; une graine native négative/non entière invalide aussi la recevabilité. | Comparer mêmes commandes avec clavier/souris contre manette, puis varier une graine ou sa validité. |

**INCONNU — native MCD** : la construction d'un état initial canonique, le profil réellement actif, les seeds des producteurs et le mapping de la scène Web à l'instance Unity. Le digest de fixture ne doit jamais être présenté comme une preuve d'identité native. Un seed arbitraire `0` peut représenter un scénario synthétique sans tirage aléatoire, mais ne permet pas de supposer l'absence de hasard dans le jeu.

**Provenance des questions (pas des réponses runtime)** : `decompiled/TimeControl.decompiled.cs:16` (TC-004, initialiseur `60`, run privé `41367755041`, artifact `13108091209`, SHA-256 du texte `2dd2d1465e860ce6f69b0cd652550bd7ff4bbe25d1ba56e579d8a1207281a596`) et `HANDOFF.md:72–74` (TC-R02 à TC-R04, rapport secondaire, run `41368361512`, artifact `13108420851`, MCD build `20299547` rapporté). Le rapport de scène Containers avec instance `120` reste **INCONNU** comme propriété runtime tant que `(owner,path_id)`, sérialisation active et méthode exécutée ne sont pas contre-lus. **OBSERVÉ natif quantitatif : aucun** à partir des artifacts consultés.

**Lectures privées minimales encore nécessaires, sans scan ni copie publique** : quatre appels `corpus-query` `read` séparés : `decompiled/TimeControl.decompiled.cs` ligne 26, 160 lignes ; `spec/time-input-camera.md` ligne 1, 600 lignes ; `runtime/observations.json` ligne 1, 250 lignes ; `spec/player-camera-bindings.json` ligne 1, 250 lignes. Le déclencheur par issue privée est opérationnel : **la première lecture de rapport est déjà demandée en #6**, sans résultat à ce contrôle ; le corps TimeControl (#13) est désormais lu, et l'index caméra a été demandé en #24.


## Provenance de l'horloge et phase de capture (SH-01, TC-Q19 à TC-Q22)

**PROUVÉ — contrôle du protocole Web uniquement (fixtures synthétiques)** : le validateur de `tests/time-contract-qualification.test.mjs` refuse désormais une comparaison de traces qui ont la même unité, le même stimulus et la même fenêtre mais pas le même `clockDomain` (Q19) ou la même `samplingPhase` (Q20). Un champ absent/blanc sur **l'une ou l'autre trace** la rend non comparable (Q21). Les noms de scénario et d'observable constitués uniquement d'espaces, ainsi que les unités de valeur blanches, sont rejetés (Q22). La granularité d'échantillonnage peut différer, mais pas la **phase sémantique** à laquelle la grandeur est observée. Le verdict `COMPARABLE` reste une simple condition de recevabilité : `parityCertified=false` même pour une fixture admissible.

**Pourquoi cette frontière est nécessaire :** `Time.deltaTime`, `Time.fixedDeltaTime`, une horloge non-scalée et des callbacks de simulation distincts peuvent tous être rapportés en secondes tout en représentant des grandeurs/instants différents. Le contrôle précédent pouvait déclarer comparables des séries de même unité sans démontrer leur origine temporelle. **Cela ne prouve aucune règle native supplémentaire.**

**Sources/version disponibles :** déclaration primaire `decompiled/TimeControl.decompiled.cs:16,24` (TC-004/TC-006 ; lecture privée run `41367755041`, artifact `13108091209`, SHA-256 du texte `2dd2d1465e860ce6f69b0cd652550bd7ff4bbe25d1ba56e579d8a1207281a596`). Rapport secondaire `HANDOFF.md:69–73` (TC-R01 à TC-R03 ; run `41368361512`, artifact `13108420851`) ; **INCONNU** pour l'exécution effective des horloges et phases. Build MCD rapporté `20299547`, Unity `2018.4.14f1`, Assembly-CSharp SHA-256 `ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257`. `clockDomain` et `samplingPhase` doivent être renseignés à partir des méthodes natives et de la capture horodatée **indépendamment**, pas devinés d'après leurs noms.

**Réfutations :** Q19 — une trace de clock monde confrontée à une capture d'horloge réelle doit rester `INCONNU` même avec les mêmes valeurs ; Q20 — une capture avant le callback de simulation contre une capture après ne devient pas comparable grâce à un même `dt` ; Q21 — absence d'identification de l'horloge/phase interdit l'admission ; Q22 — des identifiants ou unités blancs ne désignent ni un stimulus ni un observable. Ces tests ne démontrent ni lecture native nouvelle, ni équivalence réelle des domaines simplement parce que les chaînes correspondent.

**Blocage de preuve native inchangé :** le dépôt privé `TGrozner/superhot-research` ne contient publiquement que la passerelle, non le corpus local. Le connecteur permet désormais un lancement borné via `corpus-issue.yml` (transport validé dans l’issue privée #2). La requête SH-01 #6 existe mais son résultat est **en attente** ; aucun scan invasif effectué. Reprendre les quatre lectures minimales déjà réservées dans l'issue #1, notamment `TimeControl.decompiled.cs:26+160`, puis relier la méthode active, le binding d'instance et les mesures originales avant toute application dans SH-02 ou SH-05.


## Cohérence déclaration ↔ méthode (SH-01, TC-Q23 à TC-Q24)

**PROUVÉ — validateur Web uniquement** : la fixture synthétique de `tests/time-contract-qualification.test.mjs` ne peut plus recevoir `COMPARABLE` si la déclaration TC-004 est substituée par une autre déclaration, ou si son identifiant, symbole, initialiseur ou emplacement de source est altéré (**TC-Q23**). Pour la question ciblée `TimeControl.fixedTimestepDenominator`, le propriétaire de méthode déclaré doit être `TimeControl` et le chemin du corps doit correspondre à `decompiled/TimeControl.decompiled.cs` (**TC-Q24**). Six rejets sont testés ; `parityCertified=false` demeure obligatoire. Ce rapprochement est une **cohérence de métadonnées déclarées**, jamais une preuve d'appel effectif ou d'authenticité du corps.

**Source de comparaison : PROUVÉ uniquement comme déclaration décompilée** — TC-004, `decompiled/TimeControl.decompiled.cs:16`, valeur initiale `60`, `corpus-query` privé run `41367755041`, artifact `13108091209`, SHA-256 du texte UTF-8 `2dd2d1465e860ce6f69b0cd652550bd7ff4bbe25d1ba56e579d8a1207281a596`, corpus commit `be6d535e608f66c93db3acc422385035d1281063`. Contrôle du ZIP et du SHA répété ce cycle. **INCONNU — exécution MCD** : la méthode active, ses appels et ses éventuels overrides de scène. `HANDOFF.md:73` (artifact `13108420851`, SHA-256 `408cec616a4e1399120a72df8014e237073b649ab781da688b304df3b7e060a7`) mentionne une instance Containers à `120` mais reste secondaire. Le build Steam `20299547` et SHA de l'assembly `ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257` proviennent également de ce rapport.

**Réfutation :** remplacer uniquement l'ID de déclaration, sa valeur, ses lignes, le type de composant ou le fichier de méthode doit faire échouer le rapprochement, même à traces numériques égales. Pour dépasser ce contrôle synthétique, lire `TimeControl.decompiled.cs:26+160` via la passerelle privée, puis la sérialisation de l'instance active `(owner,path_id)` et une trace temporelle native avec unité, horloge et phase. Les lectures `spec/time-input-camera.md:1+600`, `runtime/observations.json:1+250` et `spec/player-camera-bindings.json:1+250` restent nécessaires ; requête par issue privée disponible, première lecture #6 en attente. Aucun original publié, aucune valeur gameplay modifiée.

### TC-Q25 — ne pas substituer les initialisateurs au corps d'une méthode (2026-11-02)

**PROUVÉ — défaut du validateur Web avant correction :** `assessComparisonReadiness()` acceptait dans la fixture synthétique une `method.sourceLines=[16,16]`, pourtant uniquement la ligne de déclaration de `TimeControl.fixedTimestepDenominator`, et produisait `COMPARABLE` avec les autres métadonnées fictives inchangées. Le validateur exige désormais que la plage déclarée pour le corps de méthode commence **au-delà de la tranche primaire déjà lue** : `evidence.source.nextUnreadLine=26`. Les plages `[16,16]`, `[10,25]`, `[1,200]` et `[25,30]` sont rejetées avec `method-body`. Les fixtures légitimes de test utilisent `[26,30]` **sans prétendre que ce corps y existe**.

**Provenance :** registre public `docs/parity/time-input-camera.evidence.json` (champ `source.nextUnreadLine`, claim TC-004), résultat de lecture privée `decompiled/TimeControl.decompiled.cs:1–25` (run `41367755041`, artifact `13108091209`, texte SHA-256 `2dd2d1465e860ce6f69b0cd652550bd7ff4bbe25d1ba56e579d8a1207281a596`), corpus `be6d535e608f66c93db3acc422385035d1281063`, MCD build rapporté `20299547` (SHA assembly rapporté `ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257`). Le garde ne valide ni l'identité effective d'une méthode ni l'exécution d'une branche.

**OBSERVÉ en exécution native :** aucune nouvelle trace. **INCONNU :** méthode CIL concernée, branche active, instance sérialisée et cadence réellement mesurée. **Critère réfutable :** lire en privé `decompiled/TimeControl.decompiled.cs:26+160`, identifier un corps de méthode et ses références au champ, retrouver son appelant et le `(owner,path_id)` actif, puis comparer des traces natives et Web avec horloge/phase/unités identiques. Si la lecture révèle une méthode valide dans la tranche 1–25, revoir ce garde : il est volontairement conservateur, pas un axiome sur le moteur Unity.

Aucune source décompilée, ressource MCD, transition 1:1 ou changement de gameplay n'est intégré. SH-02 et SH-05 conservent leurs fichiers respectifs.
