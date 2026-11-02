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

## SH-06 — mélange de poses caller-authored (prototype Web, non natif)

**PROUVÉ — uniquement dans notre Web :** `src/animation/pose-blend.js` fournit `blendBonePoses(fromPose, toPose, weight)`. Un os est un identifiant texte, une translation 3D et un quaternion ; la correspondance s'effectue par identifiant, indépendamment de l'ordre des tableaux. Les translations sont interpolées linéairement et les rotations par interpolation sphérique sur l'arc court (quaternions antipodaux traités comme une même orientation). Les entrées restent intactes ; doublons, rigs non correspondants, valeurs non finies, rotations nulles, poids invalides ou plus de 2048 os sont refusés. **Tous ces choix sont techniques et originaux** ; aucun nom d'os, rig, interpolation, durée ou coefficient MCD n'est attribué au jeu.

**OBSERVÉ — tests du prototype :** `tests/animation-pose-blend.test.mjs` couvre appariement des os réordonnés, demi-tour quaternion, équivalence des signes opposés, extrémités et immutabilité, refus des rigs invalides et positions extrêmes finies. Test ciblé local Node 22.16.0 : 6/6 réussis avant publication. La CI de la PR doit être vérifiée sur le SHA GitHub exact ; **aucun test natif ni benchmark GPU n'a été exécuté**.

**INCONNU — MCD :** poses effectivement chargées, liaisons de bones/avatars, hiérarchie rig, contraintes IK, retargeting, poids de blend ou conditions de transition. L'inventaire d'animation du build MCD `20299547` est toujours **rapporté** (HANDOFF privé, run `41368361512`, artifact `13108420851`, lignes 7, 52 et 90 ; Assembly-CSharp SHA-256 `ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257`) ; ce n'est pas une mesure de pose native.

**Blocage / requête non invasive :** la lecture du corpus est possible uniquement via les artifacts privés déjà produits. Le déclenchement `workflow_dispatch` n'est pas exposé par les outils GitHub accessibles à SH-06 ; dernier run privé `41368361512` (2026-11-02 00:39 UTC). Demander `{"operation":"list","path":"spec/animation","offset":0,"limit":100}` puis les lectures paginées ciblées de `verification.json`, `link-verification.json` et `closure/README.md`. Rechercher **une** paire de poses liée à un rig `(owner,path_id)`, un état/transition et une observation runtime (ou absence explicitement déclarée) avant toute tentative de portage. Le module reste **non raccordé** à `src/main.js` et `src/renderer.js` (#5).


## SH-06 — VFX procédural : stabilité du terme quadratique (Web seulement)

**PROUVÉ — défaut de notre implémentation Web, pas une règle MCD :** dans `src/vfx/procedural-fragments.js`, l'ordre des opérations IEEE-754 `acceleration * step * step * 0.5` faisait déborder un **intermédiaire** pour une accélération finie de `±1e308` et un pas de `1.5`, bien que le déplacement théorique `±1.125e308` et la vitesse finale `±1.5e308` soient finis. Le calcul `acceleration * (step / 2) * step` préserve ces cas, sans changer la loi analytique affichée ni les paramètres utilisateur. Les sorties finales non finies restent rejetées, et aucune contrainte native Unity n'est inférée.

**Test réfutable :** `tests/vfx-finite-kinematics.test.mjs`, quatre scénarios : accélérations positives/négatives extrêmes, accélération minuscule et grand pas, débordement final légitime. Sur la copie locale de `main@4b86c9ffaafc6e6a439334af643058492309eebf`, deux des quatre nouveaux tests échouaient avant correction ; 4/4 passent après ; 8/8 avec les tests VFX préexistants sous Node 22.16.0. Le bilan CI de la PR et son commit exact doivent être vérifiés séparément. Ce ne sont ni des mesures GPU ni un essai du jeu commercial.

**INCONNU — SUPERHOT: MIND CONTROL DELETE :** producteur natif de fracture, émission de shards, vitesse, gravité, rigidbodies, durée, déclenchement par animation et observabilité VFX. Les seules références privées *réellement disponibles à cette tranche* sont la transmission (`TGrozner/superhot-research`, run `41368361512`, artifact `13108420851`, `HANDOFF.md` lignes 7, 52, 90, build `20299547`, Assembly-CSharp SHA-256 `ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257`) et le workflow de passerelle en lecture. Les comptes rapportés ne démontrent pas une règle VFX exécutée.

**Prochaine lecture privée minimale :** `{"operation":"list","path":"spec/animation","offset":0,"limit":100}`, puis pages ciblées de `spec/animation/verification.json`, `link-verification.json` et `closure/README.md` pour localiser une chaîne clip → événement/condition → fracture/VFX, et enfin tester un scénario qui pourrait l'infirmer. Les actions exposées ne permettent pas actuellement de déclencher `workflow_dispatch`; aucune extraction supplémentaire n'est revendiquée. Aucun binaire ni asset original n'est publié.


## SH-06 — validation cohérente d'un lot VFX vide (prototype Web, 2026-11-02)

**PROUVÉ (code Web, pas natif) :** `advanceFragments([], dt, acceleration)` validait auparavant uniquement le type du tableau, et renvoyait `[]` même pour `dt` négatif/non fini ou une accélération invalide. L'API batch contrôle désormais `dt` et les trois composantes de l'accélération **avant** son parcours ; l'accélération omise reste le vecteur nul. Les particules non vides gardent le calcul scalaire `advanceFragment` existant ; aucun paramètre physique ou comportement de fracture n'a été changé. Le contrat est vérifiable dans `tests/vfx-batch-validation.test.mjs` (quatre tests ciblés, dont les entrées malformées sur zéro particule et l'équivalence batch/scalar).

**INCONNU (MCD) :** émetteur de shards, conditions de fracture, durées/accélérations effectivement instanciées, et visibilité GPU. Aucune similitude avec les VFX natifs n'est inférée. Provenance privée inchangée : `TGrozner/superhot-research`, run `41368361512`, artifact `13108420851`, `HANDOFF.md` lignes 7/52/90 (build `20299547`, Assembly-CSharp SHA-256 `ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257`) ; les comptages rapportés ne sont pas des transitions observées. Le passage nécessaire reste la lecture ciblée via `corpus-query` de `spec/animation/verification.json`, `link-verification.json` et `closure/README.md`, puis une chaîne déclenchement → VFX réfutable. Sans `workflow_dispatch` autorisé, cette lecture ne peut être exécutée depuis cette lane ; aucun scan n'a été lancé.

## SH-06 — instantané de pose validé avant mélange (Web uniquement, 2026-11-02)

**PROUVÉ — défaut du prototype Web :** avant cette tranche, `blendBonePoses()` pouvait valider un `bone.position`/quaternion puis relire des getters qui renvoyaient une autre valeur lors du mélange. Les identifiants d'os pouvaient changer entre validation et appariement. Le correctif prend chaque ID, chaque composante de translation et de quaternion une seule fois, valide ces valeurs et conserve un instantané numérique par pose. Le mélange n'utilise plus de référence directe vers `bone.position` fournie par l'appelant. Les poses ordinaires conservent le même contrat d'interpolation et les mêmes bornes.

**Reproduction locale :** source publique `src/animation/pose-blend.js` blob `6b9ba9c2432259525f189dd5b7b1177f843cf523` copiée sans autre dépendance ; quatre tests à getters changeants échouent **4/4 avant** la correction, puis réussissent **4/4 après**, `node --test` et `node --check` sous Node v22.16.0. La CI complète doit être vérifiée séparément sur le commit distant exact ; ces tests ne prouvent pas un comportement Unity ni un rendu GPU.

**INCONNU — MCD :** aucun nouveau clip, rig, système de fractures, transition native exécutée ou producteur VFX n'a été extrait. Source de transmission privée inchangée : `TGrozner/superhot-research`, run `41368361512`, artifact `13108420851`, `HANDOFF.md` lignes 7/52/90, build `20299547`, Assembly-CSharp SHA-256 `ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257`. Les compteurs de clips et d'états restent *rapportés*, pas des conditions Animator observées.

**Blocage / petit chemin falsifiable :** pas de déclenchement `workflow_dispatch` disponible dans ce connecteur. Par la passerelle privée autorisée, `{"operation":"list","path":"spec/animation","offset":0,"limit":100}`, puis lecture paginée des rapports `verification.json`, `link-verification.json` et `closure/README.md`. Isoler une transition avec `(owner,path_id)`, méthode IL et garde, suivie d'une observation runtime falsifiable ; ne pas transposer le mélange ci-dessus sans ces preuves. Aucun asset original exporté.

## SH-06 — instantané d'horloge et de marqueurs (Web uniquement, 2026-11-02)

**PROUVÉ — défaut du prototype Web :** dans `src/animation/event-markers.js` (blob précédent `6fbbdd6f3ac9d8c02b593a66afe387f45c177aeb`), `advanceAnimationMarkers()` appelait `advanceClipClock(clock, dt)`, puis relisait `clock.duration/rate/time/loop/paused`. Il validait `marker.id` et `marker.time` avant de les relire pour émettre l'événement. Un getter changeant pouvait ainsi produire une horloge avancée d'une certaine durée mais des marqueurs calculés avec une autre durée, ignorer un marqueur, émettre un autre ID ou relire un timestamp devenu non fini. Le correctif construit un instantané des champs d'horloge et un instantané `{index,id,time}` par marqueur ; tous les calculs réutilisent uniquement les valeurs validées. Ni le mode de parcours, ni le calcul des boucles, ni les constantes ne sont présentés comme natifs.

**Test reproductible :** `tests/animation-marker-snapshot.test.mjs`, cinq scénarios (rate changeant, durée de boucle changeante, ID changeant, timestamp changeant, mutation du tableau en cours de validation). Reproduction isolée avec copie du module `main` sous Node v22.16.0 : **0/5 réussis avant la correction, 5/5 après**, `node --check` OK. Les résultats complets CI de la PR et son commit exact doivent être vérifiés séparément. Ces tests ne prouvent ni le rendu navigateur ni le comportement de l'Animator Unity.

**OBSERVÉ — provenance du corpus privé, sans extraction primaire nouvelle :** `TGrozner/superhot-research/.github/workflows/corpus-query.yml` (workflow `workflow_dispatch` à runner `superhot-local`), `README.md` (chemins d'animation et pagination), et artifact `13108420851` du run `41368361512` (passation `HANDOFF.md`, build `20299547`, SHA-256 Assembly-CSharp `ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257`). Le passage `HANDOFF.md` lignes 52 et 90 désigne `spec/animation/` et rapporte des compteurs, **pas** des transitions réellement observées.

**INCONNU — MCD :** conditions et ordre réels des événements Animator, identité de rigs, délais, transitions et fractures/VFX exécutés. Le rapport `spec/animation/verification.json` n'est pas un fichier du dépôt privé : il réside sur le runner local et demande `corpus-query`. Cette session peut consulter dépôt et anciens artifacts mais ne peut pas déclencher `workflow_dispatch`. Requête minimale : `{"operation":"list","path":"spec/animation","offset":0,"limit":100}`, puis `read` ciblé et paginé de `verification.json` / `link-verification.json` / `closure/README.md`, pour identifier **une** transition avec `(owner,path_id)`, méthode IL, garde et une observation native falsifiable. Aucun scan, asset commercial ou contenu d'artifact privé n'est versé dans le public.


## Snapshot des vecteurs VFX validés (SH-06, 2026-11-02)

**PROUVÉ — prototype Web uniquement.** Au blob de base `src/vfx/procedural-fragments.js@7ed9cb41bb9f523dfdb2a8ba238c2cb0832ac90a`, les vecteurs étaient validés par lecture de leurs composantes, puis lus une seconde fois au calcul. Une origine disposant d'un getter évolutif variait donc entre les fragments et pouvait transmettre des champs non géométriques par `{ ...origin }`. De même, la position, la vitesse et l'accélération pouvaient changer après validation, et les fragments d'un même lot n'utilisaient pas nécessairement la même accélération. Ces cas ont été reproduits en Node 22.16.0 : les quatre premiers tests de `tests/vfx-snapshot-contract.test.mjs` échouent sur le blob précédent et réussissent après correction.

Le correctif capture seulement `x/y/z` de chaque vecteur et vérifie exactement les valeurs utilisées ensuite ; l'accélération d'un lot est capturée une fois pour tous les fragments, tandis que `age` et `lifetime` sont figés avec les autres champs nécessaires au pas. Les métadonnées génériques du fragment restent conservées. Cinq tests Node ciblés réussissent après correction, mais la CI complète et le navigateur sont à vérifier séparément sur la PR. Les entrées ordinaires restent soumises aux mêmes équations analytiques et bornes de durée qu'avant ; aucune donnée de fracture native n'est déduite de ces choix Web.

**OBSERVÉ — références de transmission privées, sans lecture nouvelle.** Le handoff `TGrozner/superhot-research`, Actions `41368361512`, artifact `13108420851`, `HANDOFF.md` lignes 7/52/90, mentionne le build `20299547`, Assembly-CSharp SHA-256 `ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257` et les inventaires d'animation déjà consignés plus haut. Ces références ne révèlent ni trajectoire de débris, ni contrôleur actif, ni garde de fracture.

**INCONNU — MCD :** règles de création des fragments, masse, force, seed, accélération, lifetime, ordre des événements Animator/VFX et restitution WebGL2. Un contre-exemple discriminant serait une observation native datée montrant que deux fragments issus de la même frappe suivent des champs d'accélération différents ou que leur activation dépend d'un état Animator : cela réfuterait l'utilisation directe du contrat de lot Web comme comportement MCD. La collecte requiert d'abord `list spec/animation`, puis des lectures paginées de `spec/animation/verification.json` et `link-verification.json`, plus une méthode IL et une observation associées à une transition `(owner,path_id)`. La passerelle GitHub connectée ne fournit pas le déclenchement `workflow_dispatch`; aucun scan ou runner privé n'a été exécuté.

## SH-06 — instantané des pistes scalaires auteur (Web uniquement)

**PROUVÉ — prototype Web :** `sampleLinearScalar` devait valider une piste puis interpoler avec les mêmes instants et valeurs. Avant ce correctif, les accesseurs de `key.time` et `key.value` étaient relus après la validation ; des accesseurs modifiant un tableau pouvaient aussi changer son nombre de clés durant la recherche. Une valeur validée pouvait ainsi devenir `NaN` lors de l'interpolation. La fonction fige désormais la **liste d'entrées**, puis copie et valide **une fois chaque paire numérique** avant sa recherche dichotomique. Ce contrat reste limité à des pistes scalaires linéaires fournies par l'appelant, sans émulation de `UnityEngine.AnimationCurve`.

**Test réfutable :** `tests/animation-track-snapshot.test.mjs` couvre les timestamps et valeurs à getters variables, les mutations de tableau pendant lecture et le refus d'une valeur initiale infinie. Sur la source précédente `src/animation/clip-clock.js` (blob `d4eccb6e3bd553801beb00daa32efad2df0662a3`), **3/4 tests nouveaux échouaient** ; sur la source corrigée (blob `139683343231641d5a37d0554d5204b24f597804`), **4/4 passent** sous Node v22.16.0, et `node --check` réussit. La CI du dépôt doit être contrôlée sur le commit exact de la PR pour qualifier le résultat global.

**OBSERVÉ — accès de provenance privée :** la passerelle `corpus-issue.yml` a permis une lecture seule non invasive de l'inventaire du dossier `spec/animation` (run privé `41424923806`, artifact `13130968293`). Les preuves détaillées ne sont pas recopiées ici. La présence de `verification.json` et `link-verification.json` ne certifie pas les conditions de transition ou les trajectoires exécutées ; chaque lecture doit être inspectée avant toute assertion.

**INCONNU — MCD :** pistes instanciées, tangentes, échantillonnage, conditions d'état, time scaling, liaisons de rig, fracture et VFX effectifs. Pour un contrat natif, il faut relier une source versionnée et un `(owner,path_id)` à une méthode/garde et une observation réfutable. Aucun raccord aux fichiers partagés de #5 n'est autorisé par cette preuve de robustesse Web.


## SH-06 — preuves primaires clôturées, événements natifs et retour de hit Web (2026-11-02)

**Identité source.** MCD build **20299547**, Unity **2018.4.14f1** ;
`Assembly-CSharp` SHA-256 `ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257`.
La route native analysée appartient à `UnityPlayer.dll`, SHA-256
`bf707463943762db64a67f5b61ed75ed3fdb8220afdc9539c09dd2af25e29290`,
PDB apparié GUID `AEBAD5BD-F711-488A-B83C-CD402DFC1228`, age 1.
La preuve est **statique** (sérialisation, CIL, tables natives + PDB), pas un replay du jeu.

**PROUVÉ — inventaire/décode, pas temps d'exécution.**
Les deux lectures indépendantes de `spec/animation/verification.json`
(issues privées #4 et #11, artifacts `13134300647` et `13133782424`)
ont renvoyé le même texte SHA-256
`22ac2e6e87887f84cfc2d57be5d8ea10000465c1c69791945d24ecdd72d0f71b`.
Ce rapport comptabilise 511 clips, 15 contrôleurs, 25 Avatars,
135 états, 292 transitions et 213 événements; leur présence ne prouve
pas une lecture de clip pendant une partie. L'autre rapport
`spec/animation/link-verification.json` (issue privée #12, artifact
`13133383280`, SHA-256 du texte
`6d23cbe93310da72e01cd44f707358ea410b0d16cee17c5dbd2496c1cd71dd54`)
décrit 36 séquences d'événements associées aux dommages et 15 857
paires clip-instance issues de jointures **statiques** ; l'héritage
de certaines méthodes et la sélection runtime restent distincts.

**PROUVÉ — chaîne moteur à conditions, pas occurrence observée.**
La lecture privée de `spec/animation/closure/README.md` (issue #18,
artifact `13134221322`, SHA-256 texte
`9bdffa8683b22915b7b7d2dd52d2c661f437f217e5fb40e616313384af5ca8ab`)
renvoie aux contrats natifs. `events-mecanim-contract.md:5-24`
(issue #25, artifact `13133114713`, SHA texte
`ecd2d8604860fdf7767f3b167979011cacb1f91d8371eda4f4d6c4cc4e2dbbf9`)
identifie 19 occurrences de trois noms d'AnimationEvent sans déclaration
dans les 100 assemblies expédiées, sur 14 clips référencés.
L'attaque de mêlée citée par le rapport est représentée dans
`Attack_BlendTree` ; des chemins sérialisés et des écritures de paramètres
existent, mais **aucun contact, déclenchement de fracture ni clip joué
pendant un run n'a été observé**. Ne jamais transformer un callback
absent en effet de hit implicite.

**PROUVÉ — sous-contrat algorithmique natif borné.**
`spec/animation/closure/native-events-contract.md:7-37`
(issue privée #29, artifact `13133602811`, SHA-256 texte
`07b23e8182166e8630a90f1020e8906ba4f3325a479b98a8bc6be2775f2272f6`)
relie le préparateur d'événements, le balayage temporel et la recherche
littérale du callback sur les MonoBehaviours actifs. En intervalle
déjà préparé, fini, **sans boucle**, le moteur parcourt
`last < event <= current` en avant et `current <= event < last`
en arrière, sans balayage si les deux temps sont égaux. Un callback
non déclaré n'est pas automatiquement converti en une commande de
l'Animator. **Limites explicites :** à l'activation initiale, les
événements reçoivent des ajustements de bord de fenêtre ; les clips
pondérés, boucles, transitions interrompues, vitesse inversée,
masquage/culling et instances actives nécessitent le contexte de
`PrepareAnimationEvents`. Ces règles supplémentaires ne sont **pas**
implémentées dans notre scanner.

**Contrat Web restreint prêt à tester :**
`src/animation/native-event-interval.js` expose uniquement le
balayage de fenêtres `scanNativeEventInterval(events, lastTime, currentTime)`.
Il accepte des marqueurs fournis par l'appelant, triés et non bouclés ;
il ne déclenche pas les callbacks. Tests d'intervalles avant/arrière,
égalité et bornes dans `tests/animation-native-event-interval.test.mjs`.
Ne pas l'utiliser à la place de l'Animator tant que l'intégrateur n'a
pas prouvé la préparation du temps/poids et le clip actif.

**Substitut visible Web — NON NATIF :**
`src/vfx/impact-cue.js` génère une couronne d'octaèdres au point d'une
**collision Web confirmée**. `createImpactCue` exige coordonnées, heure,
durée, rayon, nombre de fragments, seed et couleur **tous choisis par
l'appelant** ; `sampleImpactCue` rend un plan de primitives opaques
compatibles avec `renderer.shard`, déterministe et éteint hors fenêtre.
La limite de 32 satellites est un budget **Web**, non un paramètre MCD.
Il n'y a aucun mesh, texture, clip, palette ou VFX original fourni.
Les tests `tests/vfx-impact-cue.test.mjs` valident la présence du cue
au hit, sa disparition et son échantillonnage indépendant des sous-pas.
Ce module corrige un **manque de feedback perceptible potentiel** dans
le prototype, mais il ne corrige pas encore une parité MCD démontrée.

**Demande à SH-05 (issue #5) :** décider d'un raccord seulement
à partir de `closestImpact`/événements de collision effectivement
résolus côté Web, jamais depuis les clips inventoriés. Lors d'un vrai
impact, conserver les paramètres visuels explicitement provisoires ;
échantillonner avec un domaine d'horloge choisi explicitement puis
dessiner `primitives` via `renderer.shard`. Mesurer le nombre de
draw calls WebGL2 et comparer une capture avant/après pour établir un
gain **visible Web**. SH-06 ne modifie ni `src/main.js` ni
`src/renderer.js`. L'effet n'est pas une preuve de hit MCD.

**INCONNU, condition de réfutation :** quel Animator/clip est actif à
un hit réel, la sélection d'un événement avec poids non nul, le
callback effectivement dispatché, la garde de fracture et la pose/rig
visible. Un traceur natif read-only montrant l'absence d'un événement
alors que notre scanner le rapporte réfuterait l'utilisation directe du
scanner sans préparation du graphe. Une capture Web sans changement
perceptible après raccord réfuterait l'intérêt visuel de la couronne.

**Validation locale initiale :** Node v22.16.0, `node --check` sur les
deux modules nouveaux et 9/9 tests ciblés du prototype réussis.
La CI GitHub sur SHA de PR et le rendu WebGL2 réel doivent être
vérifiés **séparément** ; aucun test Unity runtime n'a été exécuté.

## SH-06 — fracture d'un pickup : commandes natives et substitution Web (2026-11-02)

**PROUVÉ — source managed MCD, branche statique bornée, non runtime** :
`TGrozner/superhot-research` issue privée #76, Actions run `41440214616`, artifact `13137959097`, `managed/Assembly-CSharp/GunPickup.cs:784–855` (`ShatterInternal`, texte de lecture SHA-256 `35ffad2da51ce910f65a18e094b0437a187e2b92e6ed23a7cbd7b7b2865c11b6`). Version de corpus MCD build `20299547`; aucune sortie C# brute ni géométrie n'est publiée. La source rejette une seconde fracture, exige la présence de `shatteredInstance` pour manipuler des morceaux et emprunte un appel de repli non modélisé si le Rigidbody parent manque hors `attachToEnemy` (lignes 784–816). Pour le chemin avec morceaux, le centre des impulsions est **la moyenne des positions des shards**, pas le centre d'impact (lignes 817–828). Chaque shard reçoit la vitesse parent/10, masse `0.15`, drag angulaire `0`, interpolation `Interpolate`, puis un `ForceMode.Impulse` radial de magnitude `0.25` et un couple `Random.insideUnitSphere` (lignes 829–837). Un effet de disparition est demandé avec durée `0.125` et délai aléatoire `0..2`, et un son est **demandé** pour `ShatterSoundPrefab` (lignes 838–842) ; ce n'est pas une preuve de son audible, de pixel ni de débris visibles.

**PROUVÉ — code Web, substitution non native** : `src/vfx/gun-pickup-shatter.js` expose `planGunPickupShatter`, qui produit des **commandes** sur des positions de morceaux et échantillons aléatoires *fournis par l'appelant*, pas des assets originaux. Il refuse les dimensions non finies, borne à 256 shards (**budget Web inventé**, pas limite MCD), et ne simule pas le repli natif. `sampleGunPickupShatterProxy` retourne des packets de couleur/taille compatibles avec une primitive `renderer.shard` de SH-05. Sa position analytique (`v + impulse/mass`, gravité paramétrée) et sa réduction **linéaire** de taille après délai sont un choix original Web : aucune équivalence PhysX, `HDRPhaseManager`, rotation, collision ou shader n'est revendiquée.

**OBSERVÉ — validation uniquement Node** : sept tests ciblés `tests/vfx-gun-pickup-shatter.test.mjs` vérifient centroïde, impulsion, héritage de vitesse, portes de branche, absence d'invention en cas de Rigidbody manquant, échantillons, approximation Web et entrées invalides. `node --check` et `node --test` exécutés en environnement local isolé avec **7/7** succès avant publication ; la CI GitHub et le navigateur doivent être vérifiés séparément sur le commit exact.

**INCONNU — intégration réelle** : existence du pickup actif dans Containers/build28, identité/transform de ses shards, garde qui déclenche une vraie fracture pendant une partie, graines du RandomManager, forces PhysX et courbe/disparition réellement affichées. Le rendu Web et l'audio restent **non observés**. L'ancienne `shatterAt` après mort d'ennemi n'est **pas** une fracture `GunPickup` ; ne pas les confondre.

**Contrat à SH-05 (#5)** : n'appeler le plan qu'après confirmation d'une fracture de pickup (pas à la seule collision ni à un `AnimationClip` inventorié) ; fournir centres de shards autorisés/générés, vitesse parent, flags Rigidbody/attachToEnemy et échantillons aléatoires ; émettre `sampleGunPickupShatterProxy` via le renderer existant, puis capture navigateur et métriques GPU. **Ne pas brancher un rendu commercial original** ni proclamer une parité 1:1.


## SH-06 — PejAiAnimator.Kill : plan de réaction différée (2 novembre 2026)

**PROUVÉ — algorithme statique de la méthode, pas exécution dans Containers.** Source primaire privée : MCD Steam build **20299547**, Assembly-CSharp SHA-256 `ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257`; `PejAiAnimator.cs:1008–1112`, issue de recherche [#86](https://github.com/TGrozner/superhot-research/issues/86), artifact `13140401513`, lecture SHA-256 UTF-8 `59de7289c050892f92e150f09f4529741708188ffcbace14ec92573a56083026`. `PejAiAnimator.Kill(killTime=3.5)` désactive immédiatement NavMeshAgent, Animator et IK existants, marque le corps en cours de mort, puis lit `toKill`. Si ce flag est déjà actif, il retourne **avant** de relibérer les membres et de reprogrammer le nettoyage. Sinon il rend les Rigidbody des membres dynamiques, change les layers, met `frameDelay=5`, notifie les sockets/LookAtIK existants et demande un callback après `killTime` avec `isRealtime:false`. Le délai n'est **pas** un temps réel mural prouvé.

**PROUVÉ — sélection à la callback, non à l'entrée.** La callback lit `HDRReactionTriggered`, `isNewMesh`, `wholebody.enabled`, `headlessBody.activeSelf`. Si HDR n'est pas déclenché, ou si HDR est déclenché avec nouveau mesh et wholebody/headless actif, elle demande des disparitions de chaînes et morceaux éligibles : deux tirages `RandomManager` dans **[0.1, 0.4] seconde** pour durée/délai par effet, échelle finale **1** (chaîne) ou **0.8** (partie). La désactivation des colliders de partie est attachée à la callback de disparition. Une demande de pool suit après **1 seconde** non realtime. Sinon, appel direct à `PoolObject(..., deactivate:false)`, **sans temporisateur**. Les paramètres HDR et échantillons sont à fournir au moment du callback, jamais extrapolés d'une capture initiale.

**PROUVÉ — la porte d'entrée n'est PAS toute mort ennemie.** `PejAiController.Kill` (recherche [#87](https://github.com/TGrozner/superhot-research/issues/87), artifact `13139513073`, `PejAiController.cs:5766–5832`, SHA texte `a9d6ba64589baabde7a908eacece546fde248fd23a0eda6c5b69f053fe846ebc`) ne déclenche pas directement `PejAiAnimator.Kill`, alors que `AddBlowForce` à la ligne 5839 le fait quand `_animator != null`. `PejAiBody.Kill` (recherche [#89](https://github.com/TGrozner/superhot-research/issues/89), artifact `13139513152`, `PejAiBody.cs:550–654`) appelle Controller.Kill sans appel direct à Animator.Kill. Un hit ou un mort ne suffit donc jamais à invoquer ce plan par défaut.

**Livrable Web borné :** `src/animation/enemy-kill-timeline.js` renvoie des **commandes**, sans effets Unity exécutés. `planPejAiAnimatorKillStart` expose les opérations immédiates et l'attente non realtime ; `planPejAiAnimatorKillCleanup` résout les branches HDR à partir des flags et des échantillons fournis par l'appelant. `tests/animation-enemy-kill-timeline.test.mjs` couvre l'ordre initial, les gardes, les deux branches de pool, les durées et les valeurs absentes. Ce n'est pas un ragdoll, une animation de mesh, une physique, un shader ou un effet audible natif.

**INCONNU / scénario réfutable :** quel appel effectif déclenche `AddBlowForce` ou `Animator.Kill` dans la scène Containers, son `killTime` réel, la cadence de `DelayedInvokeMarshal`, l'état HDR à la callback, les random samples, les rig parts actives et le rendu d'un passage de mort. Une trace contrôlée `hit -> AddBlowForce -> Animator.Kill -> callback -> PoolObject`, avec timestamps, ID d'instance, input de hit et HDR, serait nécessaire avant raccord à `src/main.js`. Toute trace où une mort traverse uniquement `Body.Kill -> Controller.Kill` mais invoque notre plan réfuterait ce raccord. Le prochain prélèvement natif minimal doit identifier **les callsites de `PejAiController.AddBlowForce`** et leurs gardes, pas relancer l'inventaire de tous les clips. Aucun fichier partagé de SH-05 modifié, aucune ressource commerciale publiée.


### SH-06 — nouvelle porte native de fracture : PejAiBody.Explode (preuve distincte)

**PROUVÉ — méthode native statique, NON observée dans Containers :** lecture privée [research #105](https://github.com/TGrozner/superhot-research/issues/105), run `41448614625`, artifact `13144030637`, `managed/Assembly-CSharp/PejAiBody.cs:462–475`, SHA-256 du texte de lecture `578030aa9ee719e10eb61b454d5379f47237a15160875c9eb6852237207f29ca` (MCD build 20299547, même Assembly-CSharp SHA indiqué plus haut). `PejAiBody.Explode` appelle d'abord `Kill(deathSource)`, demande explicitement `CutMode.Shatter` sur la partie Head, puis parcourt les `bodyPartMeshCutters` avec `CutMode.Shatter` lorsque `Random.value>=0.9`, sinon `CutMode.None`, en mode `deadPhase:true` et avec le flag `!controller.IsCivilian()`. **Si `animator != null`**, elle appelle ensuite directement `animator.Kill(0f)`. Ce chemin est différent d'un simple `PejAiBody.Kill`, qui n'appelle pas directement l'Animator. Le `0f` est transmis à `DelayedInvokeMarshal.Enqueue(..., isRealtime:false)` : **délai zéro demandé ne prouve pas exécution synchrone**, ni destruction visible. Le test `PejAiBody.Explode...` assure que notre plan ne remplace pas ce zéro par le délai par défaut de 3.5s.

**INCONNU / réfutation :** qui appelle `Explode` sur la scène active, les instances/cutters réellement présents, les tirages RNG, la topologie découpée, l'ordonnancement exact de `DelayedInvokeMarshal` et ce qui apparaît à l'écran. Cette lecture **n'autorise pas** de substituer `Explode` à chaque tir ou décès. Une trace native d'un hit qui appelle seulement `Kill` sans `Explode` empêcherait d'associer les commandes de Shatter à cet hit. Aucun shader/mesh/asset MCD livré dans le Web.


**Plan de commandes fracture source-borné :** `src/vfx/enemy-explode-plan.js::planPejAiBodyExplode` reflète uniquement **l'ordre des appels de `PejAiBody.Explode`**, sans créer de shards : `body-kill` → demande `Head/Shatter` inconditionnelle → chaque `bodyPartMeshCutter` avec `CutMode.Shatter` si sample `Random.value >= 0.9`, sinon `None`, `deadPhase:true` et troisième argument booléen `!IsCivilian()` → `animator-kill(0)` si l'Animator existe. Chaque roll et identifiant de cutter est fourni par le caller ; aucun nombre de parties, seed ou topologie n'est inventé. Le cutter Head peut apparaître également dans la boucle : la source ne déduplique pas. `tests/vfx-enemy-explode-plan.test.mjs` teste l'ordre, la borne `0.9`, l'Animator absent et l'absence de hasard synthétique. **Attention :** `CutMode.Shatter` est une demande au système de fracture, pas la preuve qu'un fragment a été rendu. Le callback `animator-kill(0)` reste planifié via `DelayedInvokeMarshal`, pas supposé instantané. Ne pas déclencher ce plan depuis n'importe quelle mort ennemie.


## SH-06 — `PejAiBody.Stun` : garde de transition et remise à zéro du focus (2026-11-02)

**PROUVÉ — corps de méthode, pas une trace de Containers.** Source privée primaire : SUPERHOT MCD Steam build **20299547**, Assembly-CSharp SHA-256 `ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257`; `managed/Assembly-CSharp/PejAiBody.cs:478–536`, lecture [research #105](https://github.com/TGrozner/superhot-research/issues/105), artifact `13144030637`, SHA-256 UTF-8 du texte `578030aa9ee719e10eb61b454d5379f47237a15160875c9eb6852237207f29ca`. Cette méthode est distincte de `PejAiBody.Explode` (lignes 462–475) et de `Kill`.

**Prédicats et ordre exacts dans la méthode statique :** l'argument `stun` est mémorisé avant la garde kamikaze ; lorsque `kamikazeAnimFired && kamikazeStunCurrentTime >= __kamikazeStunableTime`, retour immédiat. Sinon, une animation kamikaze active déclenche `onStunEnd`, `EndStun`, un réglage Animator `LeftRight`, puis la remise à zéro des champs kamikaze. Point important : `EndStun` remet le timer de stun à−1 avant le test suivant. Le flag `stunedConcretePart` devient donc `isConcrete` après cette annulation, même si l'état d'entrée était déjà stunned. Sans annulation, un ennemi déjà stunned conserve son flag sur impact concret ; `isConcrete=false` le remet à false.

**PROUVÉ — commandes visuelles et sonores demandées :** si `stunSoundRest < Time.realtimeSinceStartup` (comparaison stricte), demande de l'une des ressources `EnemyStunConcrete` / `EnemyStun` à `bodyPosition + (0,1.5,0)`, puis `stunSoundRest = realtime + 0.25s`. Le code marque `stunnedThisFrame` et `HasEverBeenStunned` ; `PejAiController.Stun(direction)` n'est appelé que si le contrôleur existe et n'est pas boss. Les `RendererWrapper` non nuls reçoivent une demande `_Focus=0`, ainsi que `enemyModManager.SetMaterialFloat(focusMaterialValueHandle,0)` et `AvailablePickupEffectFadeOut`. **Ce sont des commandes de méthode**, pas la preuve qu'un shader a dessiné un changement ni qu'un clip a été audible.

**Livraison bornée :** `src/animation/enemy-stun-command-plan.js::planPejAiBodyStun` prend tous les états, temps Unity réels, IDs de renderers et vecteurs en arguments ; elle émet des commandes ordonnées et n'exécute aucune action Unity. `tests/animation-enemy-stun-command-plan.test.mjs` couvre la garde au seuil, l'annulation kamikaze, la comparaison stricte audio, boss/hors boss, les renderers nuls et la remise à zéro du focus. Aucune durée d'animation, clip de réaction, coefficient shader ni effet audio synthétique n'est inventé.

**INCONNU / scénarios réfutables :** aucun chemin `tir → hit → PejAiBody.Stun` n'est établi sur l'instance réellement chargée de Containers. Les paramètres kamikaze et la présence des renderers actifs restent à vérifier pour cette instance. Une mort appelée seulement via `PejAiBody.Kill` ne doit pas être rejouée comme Stun. Le runtime Web fige désormais la pose au moment du décès au lieu d'utiliser le clip `hit`, avec des fragments encore provisoires : ce comportement ne valide ni un événement Stun ni un ragdoll natif. Le plan reste réservé à une invocation Stun confirmée.
