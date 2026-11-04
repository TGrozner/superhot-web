# SH-06 — Animation et VFX : registre de preuve

## SH-06 — huit fenêtres source distinctes de coup de poing (03/11/2026)

**PROUVÉ sur données sérialisées, pas sur une attaque Dojo jouée :** relecture directe de l'artifact privé `superhot-research #46`, run `41432965583`, artifact `13135780460`, `spec/animation/damage-window-writes.json`, SHA256 du contenu `94118dc244fccce15614038fd0945f9a4bd809be5a0f87d902cff2fc9c791110`. Sur le propriétaire `sharedassets0.assets`, huit clips de poing ont chacun une écriture `MeleeDamage=true` puis `false`. Les couples `path_id: début→fin` (secondes de clip) sont : 429 et 468 : `0.4686083197593689→0.7319236993789673` ; 440 : `0.36084142327308655→0.5744336247444153` ; 448 : `0.2970873713493347→0.41553398966789246` ; 457 : `0.3728155493736267→0.4535922706127167` ; 475 : `0.35922330617904663→0.5582523941993713` ; 483 : `0.28446266055107117→0.43558305501937866` ; 489 : `0.3588349521160126→0.45980581641197205`. Les identités des variantes MR et non-MR sont conservées, sans généralisation depuis leurs noms.

**Implémentation Web limitée :** `src/animation/mcd-punch-damage-events.js` étend le planificateur existant #174 à ces huit identités, sans extrapoler aux autres clips. La porte `dojo-punch-contact-gate.js` hérite des vraies bornes du clip sélectionné et refuse un contact hors fenêtre, sans émettre de dégâts automatiquement. Les tests `animation-mcd-punch-damage-events.test.mjs` et `animation-dojo-punch-contact-gate.test.mjs` couvrent les autres variantes, les fenêtres plus courtes et les preuves absentes.

**INCONNU / critère de raccord #5 :** les huit clips ne sont pas tous nécessairement utilisés par les ennemis Dojo. Un intervalle sérialisé, même avec le vrai `PejAiAnimator.MeleeDamageStart/End` (research #152) et le scanner natif (research #29), ne prouve ni la sélection de la transition Mecanim, ni la réception de l'événement, ni un contact physique ou les dégâts. SH-05 doit d'abord relever l'identité du clip réellement actif, son temps d'évaluation et le balayage géométrique horodaté, puis substituer la requête Web conditionnelle au `damagePlayer()` immédiat. Aucun test CI ne constitue un test navigateur/natif de ce raccord.


**Périmètre :** SUPERHOT: MIND CONTROL DELETE (Steam app `690040`), pas SUPERHOT 2016. Ce document accompagne les primitives Web indépendantes. Il ne constitue **pas** une certification de parité native.


## SH-06 — réaction avec force avant mort (preuve native 2026-11-02)

**PROUVÉ — code natif statique, non observé dans une partie Containers.** MCD build `20299547`. `PejAiController.AddBlowForce` est lu dans la source privée [research #87](https://github.com/TGrozner/superhot-research/issues/87), artifact `13139513073` (`PejAiController.cs:5835–5849`, SHA du texte `a9d6ba64589baabde7a908eacece546fde248fd23a0eda6c5b69f053fe846ebc`), puis sa continuation [research #123](https://github.com/TGrozner/superhot-research/issues/123), run `41476466212`, artifact `13157108175` (`PejAiController.cs:5840–5939`, SHA256 du texte `b1e3f974e4f171684e4180a372de6774225c0d09d1817f7ee2affffa71b5f0e7`). La source complète reste privée.

**Chemin de méthode PROUVÉ :** si l'Animator existe, le contrôleur prend le premier Rigidbody de la partie demandée (Head par défaut), **appelle `_animator.Kill()`**, abandonne son arme, récupère ou ajoute `ConstantForce`, puis choisit la direction locale `normalize(Random.Range(-0.15, 0.15), Random.Range(-0.25, 0.25), 1)`. Il applique la partie linéaire de la matrice `StandardCameraTransform.localToWorldMatrix` à cette direction, multiplie par la force reçue et active le composant. Si **`blowInterval > 0`**, il demande de désactiver la force et de remettre son vecteur à zéro après le délai, via `DelayedInvokeMarshal` avec `isRealtime:false`; sans Animator, il retourne null. **`KillWithBlowForce`** appelle cette méthode, puis demande `Invoke("Kill", blowInterval)` même si l'Animator est absent. Une demande d'Invoke n'est pas la preuve d'un callback exécuté à l'écran.

**Contrat Web pur :** `src/animation/enemy-blow-force-plan.js` exporte `planPejAiAddBlowForce` et `planPejAiKillWithBlowForce`. Les deux n'émettent que les commandes natives demandées après **invocation confirmée de cette méthode précise**. L'instance de caméra (basis), les deux tirages RNG, la force, l'intervalle, la partie touchée et la présence d'Animator/ConstantForce sont fournis par l'appelant : aucun spawn, impact, pose ni hasard MCD inventé. `tests/animation-enemy-blow-force-plan.test.mjs` couvre ordre Animator→arme→force→timer, transformation directionnelle, absence d'Animator, intervalle nul/négatif et garde des données inconnues. La simulation PhysX des rigidbodies et la lecture de leur état ne sont **pas** implémentées.

**INCONNU — conditions d'activation et résultat visible :** callsite réel d'un hit Containers vers `AddBlowForce` ou `KillWithBlowForce`, valeur active de `force`/intervalle, matrice caméra à l'instant de l'impact, samples RNG, présence des parties/rigidbodies, cinématique PhysX et effet rendu. L'assemblage `Body.Kill → Controller.Kill` **ne suffit pas** à établir ce chemin : il n'appelle pas directement Animator.Kill (research #87/#89). Le module doit rester non raccordé à `src/main.js` sans trace indépendante du callsite. **Scénario de réfutation :** une mort Containers traverse uniquement `PejAiBody.Kill` sans `AddBlowForce`; la force et les commandes d'Animator.Kill ne doivent alors pas être émises. Une trace positive doit enregistrer ID de contrôleur, méthode appelée, arguments, samples caméra et moment de désactivation avant test visuel.


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

## Raccord visible des armes originales

Les paquets privés v9 conservent les poses v8 et ajoutent l'attache droite du
pistolet : WeaponSocket5567/Transform2227, enfant du poignet1973. Le rendu compose
la pose finale du poignet et l'attache source, puis dessine le pistolet tenu.
Repos, marche, course et tir isolé ont été affichés dans Chromium ; les variantes
complète et sans tête conservent leur arme. La visée IK et le ragdoll restent distincts.

Le joueur n'utilise plus ce modèle de pickup : son modèle actif est
`sharedassets0.assets::149`, via Container1723 et modèle2232 du PistolGun711.
La position de main vient de Gun4849 ; la projection20° vient de
`level28::24367`, avec le shader8 et le matériau10. L'orientation a été observée
dans la racine, puis après changement yaw/pitch et tir5→4. Le recul Web reste
une approximation ; aucun alignement temporel complet des tweens natifs n'est revendiqué.

## SH-06 — PejAiBody.Kill : garde de tête brisée, focus, son et IK (2026-11-02)

**PROUVÉ — méthode statique, pas exécution Containers :** TGrozner/superhot-research issue privée #89, run `41442138603`, artifact `13139513152`, source `managed/Assembly-CSharp/PejAiBody.cs:565–602`, SHA-256 de la lecture UTF-8 `2f938d5c65af66128acd324d52b6fb542c2ca369bf2e6f1bb298227c5e913c60`, MCD Steam build `20299547` (Assembly-CSharp SHA-256 `ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257`). Les lignes originales de l'artifact ont été relues localement, sans publier la source propriétaire.

Le chemin `PejAiBody.Kill` retourne **sans effet** si `controller.IsDead`. Sinon, la demande de découpe **Head/Shatter est conditionnelle à `shouldExplodeFromDog`** ; le flag est ensuite effacé. Le boss réactive son renderer de tête et ses meshes. Pour chaque RendererWrapper non nul, les paramètres `_Focus` puis `_HotswitchFocus` sont remis à zéro ; les deux paramètres du gestionnaire de matériaux le sont aussi, puis le pickup effect est demandé en fade-out. **Ensuite seulement** la méthode invoque `controller.Kill(deathSource, bullet)`, **demande** `EnemyShatter` à la position du corps + (0,1.5,0), met à zéro les poids des deux IK de mêlée puis désactive leurs GameObjects. Une **demande de son** ne démontre ni déclenchement réussi ni audibilité, une **demande Shatter** ne démontre ni mesh coupé ni rendu.

**Contrat Web conditionnel :** `src/animation/enemy-body-kill-plan.js::planPejAiBodyKill` produit exclusivement les commandes directes ci-dessus, sans exécuter Unity, l'animation, les découpes ni l'audio. Les tests couvrent les gardes, le dog, le boss, le focus, le son demandé et les IK. Il ne faut pas confondre absence de commande directe `Animator.Kill` et absence de réaction transitive : `Body.Kill` appelle `Controller.Kill`, qui déclenche `OnKill` ; l'Animator abonné y appelle son propre `Kill` (`PejAiAnimator.cs:557,735–738`). Il ne faut donc ni exclure cette réaction, ni ajouter un deuxième appel direct au plan Body.Kill. La découpe Head/Shatter directe reste conditionnée au flag dog ; `Body.Explode` et `Body.Stun` demeurent des chemins distincts.

**INCONNU / réfutation et intégration #5 :** prouver un appel réel à `PejAiBody.Kill` sur l'ennemi chargé dans Containers, `shouldExplodeFromDog`, `IsDead`, rendu des RendererWrapper, sortie du `Controller.Kill`, et mesurer son/image sur vrai navigateur. Si un tir appelle seulement un autre chemin, ce plan n'est **pas applicable**. Si la tête est visiblement fracturée sans flag dog dans une trace native, chercher un autre producteur (notamment `Explode` / `RemoveBodyPart`) plutôt que rendre chaque mort shatter par défaut. SH-05 reste seul owner de `main.js`/`renderer.js` ; aucune intégration navigateur ni parité 1:1 n'est revendiquée ici.


## SH-06 — Dojo source pose→combat / source pose→death GPU bridge (2026-11-03)

**Implementation owner SH-06**: `src/animation/native-gameplay-pose-bridge.js` and
`tests/animation-gameplay-pose-bridge.test.mjs`. This is a callable integration
path, **not a browser validation or native PhysX equivalence claim**. SH-05
alone integrates into `src/main.js`/`src/renderer.js`; SH-14 owns GPU pass.

- `advanceRenderedDojoPunchGate` feeds **actual GPU draw receipt
  `report.sampledTime`** (source-clip seconds already multiplied by the
  controller state speed in SH-05's renderer) into the existing SH-06
  `advanceDojoPunchContactGate`. It refuses a different clip, a partially
  blended crossfade, an active solved/death pose, missing receiver/preparation
  evidence, and any unqualified geometry contact. No distance-only damage or
  unverified source clip binding is inferred. It emits requests for SH-05,
  never directly changes player health. Source windows: private research #46
  / artifact 13135780460, method mapping #152, event order #29.
- `advanceDojoDeathSkinFrame` advances the existing source-parameterized Web
  death solver, checks authored bone order and parent indices against SH-14's
  active pass-specific rig, then returns a **copy of model-space bone matrices**
  and that exact `rig` for PR #242's opt-in `solvedPose` GPU input. Source
  Rigidbody/joint definition and provenance are mandatory at construction.
  If no runtime exists, it returns `solvedPose:null` and retains the present
  freeze fallback; **never synthesize masses, joints or impulses**.

**SH-05 wiring needed for a visible delta:** after the rendered enemy frame,
use the real `report.clip` / `report.sampledTime`, a privately verified
owner/pathID binding and a timestamped SH-03 hitbox sweep; consume the gate's
single contact request rather than calling `damagePlayer()` at attack intent.
Upon an actual native-source-qualified death, construct the existing death
runtime from the full private actor definition + sampled pose, then advance
it with scaled world time, forward `solvedPose` to SH-14's draw override and
use the same returned matrices for hitboxes and weapon socket. If the complete
binding is absent, leave the current frozen death pose untouched. No arbitrary
VFX are spawned by this bridge; existing native item/shard path is unchanged.

**Evidence boundary (new)**: existing private research #172 yielded the
`browser-scene/` directory inventory. Private research #202/#203 read the
same directory's `manifest.json` (SHA/source recorded privately); it contains
package paths, assets and scene counts but **no authored death-body/joint
physics definition**. A full source-qualified Dojo physics packet is still
missing. Separate owner receipt must verify bone names/parents and the actual
active enemy prefab, not just the source-wide 22/21/18 counts. IK, native
crossfade dispatch and PhysX/CCD remain UNKNOWN.

### SH-06 follow-up — source action-layer contact clock and independent actors

Source-composed actions are **not** the renderer's base clip. An enemy may draw
`idle` or `walk` with an explicit `punch` action layer; the GPU pass reports
`sampledTime` for the base and `actionTime` for the overlaid action. SH-06's
gate now accepts an explicit, mutually exclusive `drawAction` binding (owner +
path ID still mandatory) and samples `actionTime` only when the SH-14 actor
receipt identifies the **same attacker** and an exact, non-approximate full
action weight. Missing actor ownership, partial weights, unqualified transition
or a solved death pose fail closed. This prevents the other enemy's animation
clock or the idle clip time from producing a melee damage request. Source
windows and callback provenance remain private research #46, #152 and #29.

This is a **Web safety condition**, not a claim that the native Animator would
dispatch callbacks only at weight 1. Native transition-event and partial-blend
dispatch are still unverified. SH-05 must wire this request to a real same-frame
hitbox sweep before any observable melee damage changes. No native fragments,
new assets or PhysX behavior are manufactured. The source death exporter is
now connected locally by #250 to a qualified private package; the browser
must still guard actual package/rig identity, while public asset distribution
remains separately subject to authorization.

### SH-06 — quiescence du PBD après l'échéance Kill (2026-11-03)

**Preuve native bornée :** `PejAiAnimator.Kill(killTime)` désactive l'Animator et les IK, rend non-kinématiques les Rigidbody des membres, puis programme une décision de disparition/pooling à `killTime` en **temps non réel**. Le défaut source est 3,5 s. Lorsque la branche HDR demande une disparition différée, le pooling peut être repoussé d'une seconde supplémentaire ; ses paramètres visuels et ses conditions effectives doivent encore être fournis au Web. Provenance privée : research #86 (artifact 13140401513, Kill lignes 1008–1111) et #217 (artifact 13236749185). Aucun extrait propriétaire n'est reproduit.

**Défaut Web corrigé, mesurable en charge :** `advanceNativeDeathRuntime` continuait à résoudre articulations et contacts de chaque corps après avoir émis une fois `cleanupRequested`, parce que l'hôte n'a pas encore consommé ce signal. Désormais, les sous-étapes PBD sont limitées à la première échéance de cleanup attestée ; ensuite, le dernier packet osseux est conservé sans nouveau solveur, sans nouveaux contacts, et l'horloge scaled continue. Le compteur de temps de simulation abandonné ne comptabilise que le vrai plafond de budget Web, pas le temps après disparition demandée. Test de régression ciblé dans `tests/animation-native-death-runtime.test.mjs` : dépassement de deadline, pose stable, signal unique, forces post-deadline inactives.

**Limites, raccord SH-05 :** c'est un **fallback de performance Web**, pas une équivalence de Unity PhysX ni une disparition native déjà rendue. Pour masquer/pooler effectivement l'acteur, le propriétaire de `main.js` doit consommer `cleanupRequested` et connaître les flags HDR, l'identité rig/prefab et la branche d'effet source. En l'absence du packet physique/rig actif, la pose figée reste le fallback. Ne créer ni particules commerciales ni shader de disparition inventé. Aucun smoke navigateur n'est déduit du test Node.

### SH-06 — couplage articulé des impacts de mort (Web J4, 2026-11-03)

**Défaut visible ciblé :** une balle localisée faisait accélérer son unique os
physique ; le reste du corps était ensuite déplacé seulement par projection des
contraintes, avec des réactions de membre trop isolées. Le moteur conserve la
localisation du contact et l'impulsion existante mais, lorsqu'un contact monde
qualifié est fourni, redistribue **22 % de l'impulsion linéaire** aux voisins
directs reliés par les CharacterJoint déjà présents dans la définition source.
La masse de chaque voisin détermine sa part, sans ajouter d'impulsion totale ;
les 78 % restants et leur couple restent sur l'os touché. Un Kill sans contact
qualifié conserve strictement l'ancien comportement, sans kick inventé.

**Niveau de preuve :** la topologie joints/corps et les masses proviennent du
paquet Dojo source-lié déjà publié (22 Rigidbody / 21 articulations, identité
rig vérifiée par la chaîne Pages). La répartition 78/22 est un **réglage
créatif Web**, non un prédicat MCD/Unity/PhysX. Le solveur conserve son budget
de quatre sous-étapes Web, la décision de cleanup et l'absence de fragments
artificiels. Test ciblé : impulsion linéaire totale conservée et voisinage
limité à un saut, absence d'effet pour un hit sans point, pose finie après PBD.

**À observer sur Pages après merge SH-05 :** sur un tir latéral bras/torse,
le tronc devrait accompagner davantage la réaction et éviter l'effet « bras
seul ». Comparer kill avec et sans point d'impact, au moins six morts à FPS
stable, puis victoire/rejouer. Aucun smoke navigateur ou gain FPS ne découle
de la CI ; pas de revendication PhysX 1:1.

### SH-06 — coût VFX après hitch : quatre sweeps maximum par shard visible (Web J4, 03/11/2026)

Les morceaux **déjà présents et autorisés** issus d'un GunPickup passent par `advanceGunPickupShardRuntime` et `advanceNativeFragmentBody` dans le Dojo live (`src/combat/native-items.js`). Avant cette modification, un fragment simulait autant de pas fixes que nécessaires pour rattraper un long `worldDt`. À 150 Hz, un intervalle de 300 ms provoquait environ 45 sweeps **par morceau** ; plusieurs objets brisés pouvaient amplifier une chute de FPS.

**Réglage créatif Web, pas une propriété native :** le runtime de fragments visibles conserve les petits pas issus du paquet physique sur les frames ordinaires et limite à **quatre pas balayés par frame** les grandes durées, en répartissant le temps total sur les pas plus grands. Pas d'accumulation de dette simulée : position et durée HDR suivent toujours le temps passé. Après disparition HDR, le morceau n'exécute plus aucun sweep. L'API de simulation hors runtime conserve par défaut les sous-pas source pour les simulations/testeurs qui en ont besoin. Tous les contacts utilisent toujours les colliders de la scène hébergée, pas un sol inventé.

**Test ciblé :** après une pause de 300 ms, la translation libre conserve la distance et utilise au moins cinq fois moins d'accès à la scène de collision ; la disparition à expiration HDR ne fait aucun accès. La trajectoire avec rebonds peut changer légèrement sur un gros hitch, compromis Web assumé pour fluidifier le combat. **À mesurer sur Pages :** briser plusieurs objets avec les touches F/E, provoquer un ralentissement/retour d'onglet, puis contrôler les fragments, les collisions, les FPS, victoire et REJOUER. Les tests Node/CI ne valent pas mesure navigateur, et aucune équivalence PhysX n'est revendiquée.

## SH-06 — J4: ragdoll source-box interval broadphase (Web-only, 03/11/2026)

**Défaut Web concret** : avant ce changement, chaque balayage de sphère de chaque os relisait **toute** la liste des collider boxes du Dojo pour obtenir les quelques AABB autour du corps. Cette opération se répétait à chaque correction de joint/contact et sur chaque cadavre actif. La chaîne live existante reste `main.js → advanceDojoDeathSkinFrame → advanceNativeDeathRuntime → moveNativeFragmentSphere` ; aucun raccord renderer ou asset supplémentaire.

**Amélioration** : un arbre d'intervalles sur les bornes X des **mêmes** collider boxes pré-calculés élimine les boîtes éloignées avant les calculs de collision. La requête finale conserve les bornes Y/Z, le champ `enabled` dynamique et l'ordre d'origine des colliders pour les égalités de temps de contact. L'index est partagé entre les ragdolls qui utilisent la même vue de collision et reconstruit si le tableau de boxes change. Test ciblé : plusieurs centaines de scans éliminés pour un contact local, collision de support conservée, désactivation et ajout de source box observables.

**Limite** : indexation calculée à partir de la géométrie statique du Dojo; une boîte qui change ses coordonnées en place sans remplacer le tableau n'est pas supportée par cet index. Les transitions des portes restent gérées par l'activation des colliders existants. Cette optimisation est une décision **Web**, sans donnée PhysX ou règle MCD revendiquée. Aucun navigateur/FPS mesuré par la CI ; vérifier après merge six morts, impacts bras/torse, stabilité au sol, F/E, victoire et REJOUER avec FPS p95. Pas de nouvelle extraction privée, d'asset ou de script propriétaire.


### SH-06 / J4 — cadence ragdoll 30 Hz (choix Web, 03/11/2026)

**Défaut jouable ciblé :** dans le bridge Dojo déjà raccordé, le mode PBD limité à quatre sous-pas de `fixedDelta=1/150` seconde ne simulait que 26,7 ms pour une frame de 33,3 ms. À 30 FPS, le corps pouvait tomber plus lentement que le temps du jeu. **Réglage créatif Web, non natif :** les frames normales gardent les pas source ; à 30 Hz, quatre pas balayés légèrement plus grands couvrent la frame entière. Après un hitch plus long, le solveur abandonne toujours le temps de rattrapage au-delà du budget de 33,3 ms, tandis que l'horloge de nettoyage reste en temps réel du jeu. Le nombre de sous-pas reste borné à quatre ; les collisions continuent à utiliser les colliders fournis par le pack. La précision des articulations à pas allongé est un compromis Web, **pas** une équivalence PhysX ni une nouvelle information du corpus privé.

**Régression ciblée :** `tests/animation-native-death-runtime.test.mjs` compare la chute à 30 Hz avec l'intégration sans budget, vérifie que le temps PBD n'est plus abandonné sur une frame normale 30 Hz et que 300 ms de hitch ne lancent pas 45 étapes pour chacun des ragdolls. Après fusion par SH-05 : vérifier en navigateur plusieurs morts et leur vitesse de chute à 30/60 FPS, contacts au sol et absence d'étirement, 6–7 kills, victoire et REJOUER ; aucune mesure FPS ni smoke navigateur ne découle du test Node.


### SH-06 / J4 — mise en sommeil des ragdolls au sol (04/11/2026)

**Défaut visé (Web) :** après une mort, chaque corps continue à exécuter ses contraintes articulées et ses balayages de collision pendant toute la durée de visibilité, même lorsqu'il est immobile sur le sol. Les cadavres s'accumulent pendant les 6–7 kills du Dojo ; ces passes PBD ne font alors que consommer du CPU. **Politique de jeu Web assumée, non extraite de PhysX** : après 300 ms de contact statique ascendant confirmé, tous les Rigidbody doivent avoir vitesse linéaire et angulaire très faibles et pose résolue quasi identique d'une frame à l'autre. Le solveur met alors ce corps au repos, conserve sa pose skinnée et laisse courir l'horloge Kill/cleanup. Pas de repos en chute libre, en rotation, sous force active ou sans collision qualifiée. Un nouvel impact/force réveille immédiatement le corps ; la désactivation du collider de support le réveille également. Aucun changement d'assets, de rendu ou de durée d'existence.

**Test ciblé :** `tests/animation-native-death-runtime.test.mjs` couvre une sphère corporelle au repos sur la véritable géométrie de collision du test, l'absence de passes physiques pendant le sommeil, un nouvel impact qui déplace le corps, et le retrait du support qui réactive la chute. Ce n'est ni un algorithme native-PhysX ni une mesure FPS. Après merge, contrôler sur Pages chutes, impacts successifs, désactivation de portes et p95 FPS avec plusieurs corps ; maintenir F/E, victoire et REJOUER.

### SH-06 — glissement latéral au réveil sur contacts t=0 (Web J4, 04/11/2026)

**Bug reproductible :** après endormissement d'un corps au sol, un impact latéral réveille bien le solveur, mais la sphère déjà tangente au support produit un contact à `t=0`. Le facteur de collision unique gelait alors **tous** les axes de la pose, y compris le déplacement tangentiel horizontal. Le test de repos antérieur n'exerçait que le réveil vertical ; cette correction cible précisément l'impulsion horizontale.

**Correction Web, sans règle PhysX inventée :** à une première collision `t≈0`, conserver prudemment l'orientation précédente, projeter le déplacement sur les tangentes des contacts réels et rebalayer chacune des sphères du Rigidbody contre les **mêmes colliders source** avant d'admettre le déplacement. La friction/impulsion et la politique de sommeil existantes restent conservées. Le test ciblé vérifie le mouvement latéral depuis le repos et l'absence de traversée d'un mur adjacent. Ces règles de résolution sont un compromis de moteur Web ; ni valeurs MCD ni fidélité native annoncées.

**Limites :** le second balayage ne s'exécute que pour un contact initial bloquant avec translation tangentielle, donc coût supplémentaire sur les chocs rasants ; l'orientation au point de contact est conservatrice, pas une CCD angulaire native. Après merge SH-05, tester dans le Dojo Pages une impulsion sur corps tombé, la stabilité des contacts mur/sol, plusieurs cadavres/FPS, victoire et REJOUER. Aucun smoke navigateur, mesure p95 ou certificat de parité n'est fourni par les tests Node.

### SH-06 / J4 — rotation visible des fragments réels (Web, 04/11/2026)

**Défaut perceptible :** la rupture de GunPickup appliquait déjà la vitesse, le recul radial, les colliders du Dojo et l'effacement HDR aux morceaux autorisés du pack, mais le vecteur de couple prélevé dans la commande `ShatterInternal` restait seulement stocké : **aucun fragment ne tournait à l'écran**. Le rendu paraissait rigide malgré des éclats qui se déplaçaient correctement.

**Modification active dans la chaîne gameplay :** `native-items → advanceGunPickupShardRuntime → modelMatrix` fait maintenant tourner **les meshes de fragments déjà sourcés** sur l'axe du couple existant, dans le même modèle ESM servi local/Pages. Une rotation Rodrigues sur la matrice d'origine est recalculée depuis l'horloge des fragments ; elle ne s'accumule pas d'une frame à l'autre et ne dépend pas de la fréquence d'affichage. Si le centre de collision extrait est décalé par rapport au pivot du mesh, la translation de la matrice est corrigée de manière à garder ce centre sur la trajectoire déjà résolue par les colliders de la scène. Aucun nouveau mesh, draw call, collider, asset, fallback ou hook `main.js` n'a été ajouté.

**Source et choix Web séparés :** le vecteur `torque`, sa limite de norme et la demande native `AddTorque` sont issus du contrat privé `GunPickup.ShatterInternal` (research #76, artifact 13137959097), mais leur conversion en vitesse angulaire est inconnue sans le tenseur d'inertie et PhysX. La cadence **un tour/seconde pour une norme 1** est une règle artistique Web, non une valeur Unity/MCD. L'axe et les meshes viennent du plan existant, aucune rotation native 1:1 n'est revendiquée.

**Régression ciblée :** rotation à 90° en 250 ms avec couple unitaire, centre de collision conservé malgré un pivot décalé, invariance entre deux découpages de frame et absence de rotation lorsque le couple vaut zéro. Après merge SH-05, smoke sur Pages : briser une arme à proximité, observer rotation et impacts contre sol/mur (sans éclats qui orbitent autour d'un faux pivot), répéter à 30/60 FPS, mesurer p95, puis 6–7 kills, victoire et REJOUER. Test Node/CI ≠ validation visuelle ou FPS.


## SH-06 — stabilisation angulaire des fragments sur contact (Web, 04/11/2026)

Un fragment de `GunPickup` reçoit déjà le couple échantillonné et des contacts avec les boîtes du Dojo, mais sa rotation visuelle restait constante même après le premier choc. Le runtime Web conserve maintenant la pose angulaire au **premier contact physique effectivement rapporté** par `advanceNativeFragmentBody`, puis amortit analytiquement sa rotation (décroissance 12/s, **réglage créatif Web**). Sans collision, la rotation reste celle du temps absolu; une pause de temps de jeu ne change rien. Un test de régression distingue contact sol, libre vol et subdivision de frames. Pas de nouvelle géométrie, asset, draw call ou source privée.

**Limites :** un premier contact est horodaté à la fin du pas navigateur, pas au temps exact de l'impact sous-frame. Le rayon de collision reste sphérique; aucune résolution du couple PhysX, des faces de mesh ou de contacts entre fragments n'est revendiquée. Le rendu Pages, le ressenti et les FPS ne sont pas vérifiés par la seule CI. L'effet est déjà consommé via le chemin existant `main.js → advanceGunPickupShardRuntime` ; aucun fichier partagé à modifier.

### SH-06 / J4 — amortissement angulaire après contact au sol (Web, 04/11/2026)

**Défaut visible ciblé :** un corps mort peut garder une rotation résiduelle très longtemps après avoir touché le sol, puisque ses `angularDrag` de source et la projection PBD ne fournissent pas à elles seules une friction angulaire de contact crédible. Cela retarde le repos et consomme des calculs physiques pour des membres qui oscillent encore.

**Changement déjà branché sur Dojo :** dans `advanceNativeDeathRuntime`, lorsqu'un Rigidbody a eu un contact **réel** avec un collider statique et une normale ascendante (>0,55), la rotation résiduelle est amortie par une exponentielle indépendante du framerate (7/s, **réglage Web**). En vol libre, aucune friction supplémentaire n'est appliquée ; les impulsions ultérieures peuvent réveiller le corps. Les joints, masses, gravité, collisions, poses skinnées et horloge Kill sont inchangés. Aucun asset, hook `main.js` ou draw call ajouté.

**Provenance et limites :** collision réelle = solveur Web sur les boîtes de scène source-qualifiées, définition 22 corps / 21 joints du pack Dojo ; la **friction angulaire 7/s est créative**, ni PhysX ni une constante MCD démontrée. Le test isolé vérifie contact sol, décroissance de spin et conservation de rotation hors contact. Une collision inclinée avec normale Y <= 0,55 ne bénéficie pas de cet amortissement : choix conservateur à évaluer en jeu. Après merge SH-05, vérifier impacts sur cadavres, atterrissages, stabilité au sol, sommeil PBD, p95 FPS avec 6–7 corps et REJOUER sur Pages ; tests Node/CI ne prouvent ni FPS ni ressenti navigateur.

### SH-06 / J4 — contact de départ dans la géométrie Dojo (Web, 04/11/2026)

**Défaut de collision observable :** lorsqu'un éclat naît avec son centre **déjà dans** une boîte source du Dojo, le solveur le dépénètre vers la face la plus proche, mais rapportait un `contact.point` sur le **mauvais côté** de la face. La vitesse encore dirigée vers la boîte pouvait provoquer une nouvelle pénétration au pas suivant. Ces contacts alimentent aussi la chaîne VFX et ragdoll déjà raccordée ; il ne faut pas les inventer hors de la scène source.

**Correction active :** `src/vfx/native-fragment-physics.js::recoverPenetration` place désormais le point d'impact **sur la face réellement empruntée** pour sortir d'une boîte et annule uniquement la composante de vitesse qui rentre encore dans cette face. Une vitesse tangentielle ou sortante reste inchangée : les éclats peuvent glisser ou repartir normalement. `moveNativeFragmentSphere` est déjà utilisé par les fragments GunPickup et les sphères de contact des ragdolls ; aucun fichier commun, asset, shader ou nouvelle passe de collision.

**Preuve/limite :** boîtes `prepareNativeCollision` du pack Dojo source-qualifié, points et normales du solveur Web. Le choix de dé-pénétration non énergisant est **créatif Web** et ne prétend ni retrouver les impulsions/restitution de PhysX ni générer de nouveaux effets natifs. Régression ciblée `tests/vfx-native-fragment-physics.test.mjs` : sortie sur face supérieure du sol et face latérale d'un mur, normale, vitesse entrante supprimée et vitesse tangentielle préservée. Le test navigateur (casser des armes près du sol/mur, plusieurs cadavres, p95 FPS, F/E, 6–7 kills, victoire et REJOUER) reste à faire après fusion/déploiement par SH-05.

### SH-06 / J4 — friction cohérente sur le balayage restant d'un impact (Web, 04/11/2026)

**Défaut visible :** dans `moveNativeFragmentSphere`, un impact pouvait ramener instantanément la vitesse tangentielle d'un éclat à zéro via le vrai matériau de collision, tandis que **le déplacement résiduel de la même frame** utilisait encore le vecteur d'avant contact. Lors d'une frame lente, un fragment immobilisé par le sol continuait donc à glisser plusieurs mètres avant de s'arrêter au pas suivant. Le même adapter de contacts sert également aux spheres du ragdoll.

**Correctif Web réellement raccordé :** après un `nativeSphereHit` source-qualifié, le sol/mur garde sa restitution et la normale sortante, mais le déplacement tangentiel restant est réduit de la **même fraction de friction que la vitesse tangentielle**. Les matériaux sans friction continuent de laisser glisser et chaque déplacement conservé est balayé contre les colliders réels. Aucun nouveau paramètre, asset, draw call, connexion au PC ni changement `main.js`/renderer. Le test `vfx-native-fragment-physics.test.mjs` compare arrêt sur sol rugueux et glissement sur sol lisse au cours de la même frame, en conservant l'absence de traversée.

**Preuve/limite :** les colliders proviennent du paquet Dojo et les paramètres `dynamicFriction`/`staticFriction` sont transmis par les définitions physiques déjà chargées. L'application de cette friction au **reste du déplacement Web** est une approximation de moteur, pas un ordre prouvé du solveur PhysX ni une mesure MCD. Validation navigateur nécessaire après fusion SH-05 : briser une arme au ras du sol sous charge, vérifier contact sans long glissement différé, rebonds normaux, ragdolls, FPS et baseline F/E, kills, victoire, REJOUER.

### SH-06 — relecture directe des preuves statiques d'animation (04/11/2026)

**PROUVÉ — inventaire et vérification structurelle, pas exécution en jeu :** les deux artifacts privés existants ont été relus sans relancer de runner ni requête corpus. `superhot-research #11` (run `41426635850`, artifact `13133782424`, `spec/animation/verification.json`, texte SHA-256 `22ac2e6e87887f84cfc2d57be5d8ea10000465c1c69791945d24ecdd72d0f71b`) confirme **511 AnimationClip, 15 AnimatorController, 25 Avatar, 135 états, 292 transitions et 213 événements déclarés**. Ce sont des objets/liaisons statiques vérifiés, **pas** les transitions effectivement traversées en Dojo. La vérification rapporte cinq chemins de binding non résolus et trois noms d'événement dont le destinataire précis n'est pas établi : `BlockHand`, `CutHand`, `CutThrowable`.

**Liens et inconnues :** `superhot-research #12` (run `41426647047`, artifact `13133383280`, `spec/animation/link-verification.json`, texte SHA-256 `6d23cbe93310da72e01cd44f707358ea410b0d16cee17c5dbd2496c1cd71dd54`) rapporte **660 références de feuilles de contrôleur, 36 séquences d'événements de dégâts et 243 jointures explicites de courbes**, toutes fondées sur les identités `owner/path_id`. **404** résolutions de destinataires d'événements restent non prouvées faute d'héritage statique/configuration runtime ; **1 028** appariements de binding ne sont pas présents dans le sous-arbre de l'instance examinée. Zéro hash de binding non résolu **ne signifie donc pas** zéro chemin d'animation inconnu. La validation privée certifie les jointures et la structure sérialisée, **ni** la sélection live d'un clip, **ni** un callback exécuté, **ni** le timing de ses transitions, **ni** une fracture visible. Pour le Dojo, SH-05/SH-14 doivent qualifier acteur, couche/état actifs et événements/contact réels ; l'absence de preuve reste un refus de parité, pas un trigger inventé.

## SH-06 — rebond de fragments dans la frame de contact (Web, 04/11/2026)

**Défaut observable du solveur Web :** avant cette correction, `moveNativeFragmentSphere` appliquait déjà la restitution du matériau Dojo à la vitesse de l'éclat mais supprimait la composante normale du déplacement restant dans la frame. Lors d'une collision sol sous charge (frame longue), l'éclat restait visuellement au sol jusqu'à la frame suivante, puis rebondissait. Le même adaptateur est appelé par les contacts des corps ragdoll.

**Correction limitée et déjà raccordée :** conserver le CCD sur les vraies boîtes du Dojo et réintégrer, dans le reste du balayage, la composante *sortante* issue de la restitution calculée sur la vitesse entrante. Une surface inélastique n'acquiert pas de rebond ; la friction tangentielle livrée par #368 reste inchangée. Le test ciblé vérifie le départ au rebond dans la même frame et le repos avec restitution nulle. Aucun nouveau collider, effet, asset ni hook `main.js` / renderer.

**Provenance et limite :** `material.bounciness`, `bounceThreshold` et les colliders arrivent du pack Dojo existant ; la répartition du temps de sweep est une **politique physique Web**, PAS le scheduler PhysX/MCD. CI et tests ne prouvent ni le ressenti réel ni les FPS : contrôler après merge sur Pages les rebonds après bris d'armes à 30/60 Hz, contacts sol/plafond, les ragdolls et la boucle 7/7.


## SH-06 — glissement des corps après contact dans une sous-étape (Web 2026-11-04)

**Défaut observable ciblé :** le solveur PBD de `src/animation/native-death-runtime.js` conservait une fraction de trajet jusqu'à la première collision (sol/mur), mais abandonnait tout déplacement restant lorsqu'un hit se produisait strictement à l'intérieur d'une sous-étape. Un ragdoll pouvait ainsi s'arrêter brièvement en longeant un sol ou un mur même si la friction n'avait pas arrêté sa vitesse tangentielle.

**Correction Web, pas native :** après le premier TOI balayé, l'orientation reste conservativement bornée, tandis que la translation résiduelle est projetée sur les normales de contact. La vitesse post-contact déjà modifiée par le matériau borne ce reste (friction forte = aucun glissement). Une seconde requête bornée sur les **mêmes** sphères et colliders Dojo interdit de traverser un mur voisin. Aucune pose supplémentaire, aucun objet, aucune ressource commerciale ni modification de `main.js`/`renderer.js`.

**Test falsifiable :** un corps à sphère source unique, allant diagonalement au sol, doit parcourir sa tangente dans la même frame sans friction, s'arrêter plus tôt avec friction, et rester du bon côté d'un second BoxCollider. Le test ne prouve ni la cinématique PhysX native ni les FPS réels : ces deux points et le comportement interactif restent inconnus jusqu'au smoke sur GitHub Pages. Les valeurs, tolérances et la projection sont une conception de physique **Web**.


## SH-06 — contact sol déjà présent, glissement après friction (Web, 04/11/2026)

**Défaut visé dans le Dojo live :** la branche de contact initial t=0 de `contactsFor` autorisait correctement une impulsion latérale sur un cadavre posé au sol (livraison #322), mais réutilisait encore le déplacement latéral **pré-impact** même lorsque `moveNativeFragmentSphere` avait déjà réduit la vitesse via le matériau de contact. Sur une sous-étape Web chargée, un corps pouvait ainsi glisser trop loin sur un sol rugueux avant de ralentir.

**Correctif directement consommé par SH-05 :** la branche t=0 garde son projeté tangentiel et son second balayage anti-mur, mais multiplie son déplacement résiduel par la rétention de vitesse tangentielle réellement calculée au contact. Un sol sans friction conserve le glissement; une friction suffisante supprime le faux trajet de la frame. Le test `animation-native-death-runtime` construit la même impulsion latérale et descendante sur un collider de sol source pour comparer les deux matériaux, sans aucune scène/asset supplémentaire.

**Provenance et inconnues :** sphère, collision et `dynamicFriction/staticFriction` sont consommés de la définition/du collider Dojo existants. L'application de friction à la translation dans la même sous-étape est une **politique Web**, et ne démontre ni timing PhysX/MCD, ni sélection live d'état Mecanim, ni gain FPS/rendu navigateur. Le patch reste limité à SH-06, aucun changement SH-05/SH-04/SH-14, pas de runner ni nouvel asset.


## SH-06 — éviter les catapultages de ragdolls extrêmes (04/11/2026)

**Défaut en jeu ciblé :** un impact ou une force sur un membre de masse relativement faible peut accélérer le solveur Web jusqu'à projeter la pose sur plusieurs mètres en une seule frame, créant des cadavres élastiques ou volants. Le Dojo passe déjà `limitWebFrameWork:true` au solveur ; les collisions/rigs et leurs données restent ceux du paquet standalone.

**Politique créative Web, PAS native :** au moment de l'intégration temps-réel, après les forces et le drag source mais avant la résolution CCD, les vitesses extrêmes sont bornées à **24 m/s linéaires** et **16 rad/s angulaires**, direction conservée. Une impulsion ordinaire ne change pas, et un appel non budgété conserve l'entrée complète. Ce plafonnement ne reproduit pas PhysX et ne constitue pas un réglage extrait de MCD. Les masses, joints, impacts, scènes et horloge Kill restent inchangés ; aucun asset supplémentaire ou fichier SH-05 modifié.

**Test ciblé :** `tests/animation-native-death-runtime.test.mjs` vérifie une impulsion extrême, une force soutenue extrême, une impulsion ordinaire et la simulation explicitement non budgétée. **À contrôler après merge :** le ressenti de 6–7 morts au Dojo à 30/60 FPS, des réimpulsions sur corps posés, l'absence de membres lancés à travers la pièce, les collisions sol/mur et victoire/REJOUER. La CI ne prouve pas ces sensations. Les valeurs du solveur natif effectif et la sélection live des transitions Mecanim demeurent inconnues ; les rapports `spec/animation/verification.json` et `link-verification.json` ne doivent pas être interprétés comme preuve d'exécution d'un état.


### Web combat VFX clock after a browser hitch (SH-06, 2026-11-04)

`advanceWebImpactFeedback` now consumes the *full* active real-time delta given by
its host instead of truncating each update to 50 ms. This prevents the hit marker
and short hit/kill/wall sparks from surviving twice as long at 10 FPS. The
particle trajectory uses the analytic constant-gravity step (Web-authored
1.6 units/s²), which agrees across a 100 ms frame and two 50 ms frames. No
new particles, textures, draw calls or source claims. **SH-05 integration**:
`src/main.js` currently passes its capped `dt` (update around line 1208);
pass the already-computed `activeRealDt` on native Dojo gameplay updates,
while preserving pause behavior and legacy timing. Until that shared-file
change lands, a 10 FPS frame may still look capped. This is an intentionally
original Web visual policy, **not** a reconstructed Unity HDR/VFX timing.

### SH-06 / 2026-11-04 — Performance des débris au sol dans le Dojo

`advanceNativeFragmentBody` suspends now its **Web-only** CCD workload after
at least 0.2 seconds of consecutive, slow (<0.06 m/s) upward contact with
the **existing sourced static Dojo collider**. The resting shard keeps its
last collision-admitted position while `advanceGunPickupShardRuntime` still
advances the authored disappearance/HDR clock and its existing Web visual
spin. Contact time starts at the swept impact fraction, **not** at the
beginning of a long hitch frame. A changed shard velocity/position, a disabled
support collider, or an unbudgeted simulation call immediately wakes it.
Airborne fragments and frictionless moving shards cannot sleep by elapsed
time alone. This avoids repeated collision sweeps for settled fragments in
multi-kill scenes without introducing assets or additional draw calls.

The 0.2 s / 0.06 m/s thresholds are **creative browser performance policies,
not MCD PhysX sleep parameters**. Source identity remains the active scene
collision boxes; no new original physics data, animated play state, or
fracture asset is inferred. Validate visually on standalone Pages after
SH-05 merge: multiple kills and thrown items, resting vs sliding fragments,
re-enabled/disabled collision surfaces, FPS at 30/60 Hz and replay. Node CI
only proves the deterministic code path, not real browser frame times.


### SH-06 / 2026-11-04 — Broadphase des fragments à scènes Dojo chargées

Pour les grandes vues de BoxColliders déjà préparées (16+), les balayages des débris
interrogent désormais un index d'intervalles X construit une seule fois, puis
filtrent les limites AABB Y/Z avant le test géométrique exact existant. L'ordre
initial des colliders est préservé pour les impacts ex aequo ; les collisions,
frictions et normales finales restent calculées par le même solveur. L'index
est reconstruit si la liste des colliders change de référence ou de taille ;
les bascules `enabled` sont prises en compte à chaque requête. Le détachement
des corps et les portes conservent donc leur état collision courant. C'est une
**optimisation Web originale**, pas un ordre ni un accélérateur PhysX observé.

Un test ciblé compare collision et réponse avec/sans 96 colliders éloignés,
contrôle l'absence de parcours intégral après échauffement de l'index et la
désactivation du plancher. Cela vise le coût CPU des premières frames de
multiples fractures, avant le sommeil des fragments livré précédemment. Aucun
asset, maillage, draw call, timing natif Mecanim ou événement MCD n'est ajouté.
**Non vérifié** : FPS et rendu en navigateur sur Pages après merge SH-05.
