# SH-06 — Animation et VFX : registre de preuve

**Périmètre :** SUPERHOT: MIND CONTROL DELETE (Steam app `690040`), pas SUPERHOT 2016. Ce document accompagne les primitives Web indépendantes. Il ne constitue **pas** une certification de parité native.

## Preuves disponibles au 2026-11-02

| Statut | Assertion précise | Source et limite |
| --- | --- | --- |
| **PROUVÉ — inventaire seulement** | La requête privée de base Unity a retourné `AnimationClip: 511` éléments. | `TGrozner/superhot-research`, Actions run `41367631061`, artifact `corpus-result/result.json`, opération `query`, base `resources/pass-01/corpus.sqlite`, colonnes `type,count`. Cette valeur ne prouve ni quelles animations sont jouées, ni leurs transitions, ni leur rig. |
| **PROUVÉ — intégrité de snapshot** | L'opération `status` a retourné `files: 511`, `allMatched: true`, extraction terminée `2026-11-02T00:05:57.026Z`. | Run privé `41367571984`, `result.json`. Les 511 fichiers du snapshot ne sont **pas** les 511 `AnimationClip` : catégories distinctes, nombres seulement égaux. |
| **OBSERVÉ — prototype Web préexistant** | Dans `src/main.js`, `shatterAt` génère des fragments pseudo-aléatoires; `update` les fait avancer. | `TGrozner/superhot-web`, `src/main.js` à `9f01f92411b4e125b2c992deee53602a8c67c416`. Ce comportement appartient à FRAME//BREAK, non au jeu commercial. |
| **INCONNU — natif** | Rigs/squelettes réellement actifs, durées des clips, blend trees, transitions, animation events, conditions de fracture, topologie des shards, trajectoires et effets shader. | Les compteurs d'inventaire Unity ne permettent pas de conclure. Nécessite données sérialisées ciblées + chaînes IL et observations runtime. |

## Rapport de transmission natif retrouvé

Une lecture privée supplémentaire donne un point d'entrée bien plus ciblé : run Actions `41368361512`, artifact `corpus-result/result.json`, opération `read` de `HANDOFF.md` lignes 1–100, SHA-256 du texte UTF-8 `408cec616a4e1399120a72df8014e237073b649ab781da688b304df3b7e060a7`.

- Ligne 7 : référence de build MCD `20299547`, Unity `2018.4.14f1`, Assembly-CSharp SHA-256 `ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257`. Provenance de transmission, pas preuve comportementale.
- Ligne 52 : dossier à lire en priorité `spec/animation/` ; `verification.json`, `link-verification.json`, graphes et jointures. Leur existence rapportée **n'autorise pas** à prétendre les avoir consultés.
- Ligne 90 : le rapport annonce **511 clips, 15 controllers, 25 avatars, 1 534 401 clés streamed, 135 états, 292 transitions et 213 événements**. **Statut : RAPPORTÉ par la transmission native / vérification détaillée NON relue dans ce cycle** ; aucun chiffre n'est une mesure d'exécution de l'Animator ni une reconstruction des graphes/blend trees.

La prochaine lecture vraiment discriminante est `list spec/animation`, puis `read spec/animation/verification.json` et `read spec/animation/link-verification.json` si leurs tailles permettent une pagination. Elle doit isoler **un** chemin état → condition → transition → effet, rattaché à un contrôleur et à un clip utilisés dans un run observé ; le compte global de 292 transitions ne suffit pas à en valider une seule.

## Contrats Web **techniques**, non natifs

- `src/animation/clip-clock.js` expose une horloge de clip répétable en secondes, un compteur de boucles et une interpolation **linéaire numérique**. Unity utilise éventuellement d'autres courbes/interpolations : aucune équivalence n'est revendiquée.
- `src/vfx/procedural-fragments.js` offre une émission sphérique déterministe par seed et une intégration balistique analytique à accélération constante. **Loi de distribution, limite 4096, vitesses, durées et accélération sont exclusivement des choix d'infrastructure**, jamais des paramètres attribués à MCD.
- Les fonctions sont pures, testables dans Node et le navigateur, sans DOM ni ressources originales. Aucun raccord à `src/main.js` / `src/renderer.js` n'est fait dans cette PR; ces fichiers sont réservés à l'intégrateur SH-05.

## Expérience native minimale encore nécessaire

1. Avec la passerelle privée autorisée (workflow `corpus-query.yml`), `list` sur `spec/` puis `read` des rapports traitant animation/fracture. Consigner source, empreinte, lignes et définition exacte du champ/méthode.
2. Interroger en lecture seule `resources/pass-01/corpus.sqlite` pour un petit ensemble **identifié** de `AnimationClip` et de comportements associés, avec `(owner,path_id)`, type, scène et clé sérialisée; vérifier les colonnes via `sqlite_master` avant SQL. Ne pas confondre nom de clip et identifiant unique.
3. Rattacher au moins une transition native à sa méthode IL et à un scénario réellement observé; documenter précisément états d'entrée, condition et sortie ainsi qu'un contre-exemple. Pour la fracture, établir déclencheur/paramètres avant toute adaptation du module Web.

**Critère de promotion d'une règle au statut natif :** source native localisable et non ambiguë + valeur sérialisée réellement utilisée ou transition exécutée/observée + expérience qui pourrait réfuter l'affirmation. Une animation simplement présente dans l'inventaire n'est pas une preuve d'utilisation dans le gameplay.

**Sécurité des sources :** les originaux et sorties détaillées restent dans le dépôt privé; aucun asset, IL complet, mesh ou shader commercial n'est publié ici.


## Tranche SH-06 suivante — marqueurs d'animation (Web uniquement)

**PROUVÉ — contrat de notre code Web :** `src/animation/event-markers.js` traverse une liste de marqueurs **fournis par l'appelant** via `advanceClipClock`. Le domaine est `[0, duration)` pour un clip en boucle et `[0, duration]` sinon. Un événement est émis lors du franchissement `(avant, après]` ; un marqueur à `0` n'est pas émis au démarrage, uniquement au franchissement de la boucle. La sortie contient l'index du marqueur, son identifiant arbitraire, sa position, le cycle franchi et son temps relatif au pas. En cas de plus de 4096 occurrences (ou du plafond demandé inférieur), le module **rejette** la simulation plutôt que d'oublier des événements. Ces règles sont des décisions techniques Web, **pas des propriétés de l'Animator Unity ni des 213 événements rapportés pour MCD**.

**PROUVÉ — tests Web ciblés :** `tests/animation-event-markers.test.mjs` exécute 8 cas Node sur les frontières, les boucles multiples, les identifiants répétés, la pause, les multiplicateurs de vitesse, les dépassements, les données invalides et la cohérence par sous-pas. Aucune capture native ni test de rendu/audibilité n'en découle.

**INCONNU — contrat MCD :** présence effective et ordre des `AnimationEvent` sur les clips exécutés ; méthode de sélection des transitions et blends ; réémission des événements à l'entrée d'état, sur une boucle, ou lorsque l'Animator saute un intervalle ; lien avec fractures et VFX. Le point d'entrée privé reste `spec/animation/verification.json` et `link-verification.json` **rapportés dans `HANDOFF.md` ligne 52**, ainsi que l'annonce de **213 événements** à la ligne 90 (run privé `41368361512`, artifact `13108420851`, build `20299547`, Assembly-CSharp SHA-256 `ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257`). Les rapports eux-mêmes n'ont pas été relus faute de nouvelle requête `corpus-query` autorisée dans cette exécution.

**Expérience réfutable minimale :** sélectionner en privé **un** clip par `(owner,path_id)`, extraire pour lui marqueurs/temps et état référent dans les rapports détaillés, puis observer lors d'un seul parcours un déclenchement, son ordre et un cas de saut/pause. Si un marqueur est émis à l'entrée d'état sans franchissement, ou supprimé malgré le franchissement, notre règle `(avant, après]` n'est pas native. L'intégrateur #5 doit donc garder cette couche non raccordée à `src/main.js` et ne pas la présenter comme de la parité.

## SH-06 — stabilité numérique du sampler Web (cycle suivant)

**PROUVÉ — défaut et correction dans le prototype Web, pas dans MCD :** `sampleLinearScalar` utilisait une différence de valeurs `right.value - left.value` et une différence de temps `right.time - left.time`. Sur des nombres JavaScript finis mais de signes opposés proches de `1e308`, ces soustractions débordaient vers `Infinity`; un point milieu de valeurs finies retournait alors une valeur non finie, et une grande plage temporelle pouvait donner une interpolation bloquée sur la première clé. Le nouveau calcul utilise des poids barycentriques sur les valeurs et divise les temps par deux uniquement si l'écart initial est infini. Ces règles ne prétendent **pas** émuler `UnityEngine.AnimationCurve` ou ses tangentes.

**Validation réfutable :** `tests/animation-linear-extremes.test.mjs` teste explicitement deux échelles finies opposées (temps et valeurs), les résultats au milieu/quarts et la non-régression d'une piste usuelle. Le résultat attendu sur Web est fini et la piste normale reste inchangée. L'exécution de la CI doit être vérifiée sur le SHA exact de la PR ; le test ne démontre pas le moindre clip MCD exécuté.

**INCONNU — natif :** aucun nouvel enregistrement Animator/rig/VFX n'a été extrait dans ce cycle. Contrats, tangentes, interpolations et valeurs instanciées MCD restent inconnus. Au relevé GitHub du 2026-11-02, la dernière exécution privée `corpus-query` accessible reste le run `41368361512` (lecture `HANDOFF.md`, artifact `13108420851`), non une extraction de `spec/animation/verification.json`. La demande minimale en issue #6 demeure une lecture ciblée de ce dossier via la passerelle privée, puis une unique transition sourcée et observée.
