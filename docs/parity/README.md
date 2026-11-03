# SH-05 — Reproductible Web baseline (pas un certificat de parité)

> **Mise à jour déploiement (2026-11-03) :** le vrai pack source-qualifié SHRL_Dojo2/build10 est hébergé en autonome sur [GitHub Pages](https://tgrozner.github.io/superhot-web/) ; voir [AGENTS.md](../../AGENTS.md) et [standalone-dojo-pages.md](../standalone-dojo-pages.md). Le rapport Web ci-dessous est un **outil historique de tests**, pas la description de l'actuel rendu Pages et toujours pas une preuve de parité 1:1.

Ce dossier sert au merge train de [superhot-web](https://github.com/TGrozner/superhot-web/issues/5).
Le projet actuel est **FRAME//BREAK**, un prototype original de FPS navigateur. Son code, ses
scènes et ses règles ne sont **pas** une copie validée de SUPERHOT: MIND CONTROL DELETE.

## Commandes

Avec Node.js 20+ depuis la racine du dépôt :

```sh
npm run check
node scripts/parity-report.mjs > web-baseline.json
```

Le fichier `web-baseline.json` est un instantané déterministe de calculs **Web uniquement**
(caméra, intersections, évitement d'obstacles et comptages des salles du prototype).
`tests/parity-baseline.test.mjs` est inclus automatiquement par `npm test`. Il vérifie
la cohérence et des invariants de ces calculs, **pas** la fidélité au jeu natif.

Pour cette première version, chaque scénario possède `nativeEvidence: null` et
`parityVerdict: "UNASSESSED"`. Le champ global `nativeComparison: "NOT_RUN"`
reste fixe. Ne jamais transformer un test Web réussi en verdict `1:1`.

## Référentiel des preuves

Le corpus original réside **uniquement** dans le dépôt privé
`TGrozner/superhot-research` et sur la machine autorisée, derrière la passerelle
de lecture `corpus-query.yml`. Les données extraites et les artifacts de recherche
restent privés. Le dépôt Web public ne contient ni binaire, ni scène, ni shader,
ni son original ni données brutes issues des assets.

Classification obligatoire des contrats proposés pour intégration :

| État | Sens | Acceptation |
| --- | --- | --- |
| PROUVÉ | Valeur/règle issue d'un contrat natif traçable avec provenance, version et contexte d'utilisation | Tests reproductibles + revue de la provenance |
| OBSERVÉ | Comportement vu dans une capture native explicitement identifiée | Scénarios et limites consignés ; pas une garantie universelle |
| PROVISOIRE | Comportement du prototype Web ou hypothèse de travail | Uniquement comme approximation, clairement étiquetée |
| INCONNU | Pas de preuve native suffisante, ou configuration manquante | Ne pas déclarer de parité |

Éviter absolument de déduire les réglages d'une scène à partir des seuls *defaults*
d'un script Unity. Les instances/valeurs sérialisées priment, et l'IL/les tests
natifs peuvent être nécessaires pour distinguer les chemins d'exécution.

## Protocole d'intégration

1. Les lanes SH-01 à SH-04 travaillent sur leurs fichiers réservés et livrent des
   PR autonomes. **Seule SH-05** raccorde `src/main.js`, `src/renderer.js`
   et `src/levels.js`, après lecture des contrats et tests.
2. Pour chaque PR : regarder sa base, son head SHA, la liste des fichiers, ses
   dépendances, les preuves citées et les checks GitHub Actions. Rejouer
   `npm run check` quand le code est accessible ; pas de merge de CI rouge
   ni de PR en conflit, ni de assertions native non vérifiées.
3. Merger souvent **les petites PR validées** ; recontrôler la branche principale
   après chaque fusion et ne pas forcer des branches concurrentes. Aucun changement
   du runner privé ni exécution native ne fait partie de cette lane.
4. Chaque mesure future doit fournir : identifiant de scénario stable, version et
   contexte natifs, entrée reproductible, sortie observée côté Web, tolérance
   numérique justifiée et décision avec limites. Un score global de parité
   est interdit sans couverture explicitement définie.

## Limites connues du prototype actuel

- Les scènes, le combat, les sons et la progression sont des créations originales,
  sans mapping natif vérifié.
- `src/main.js` reste une simulation couplée au navigateur, avec des tirages aléatoires
  et des mises à jour selon le temps écoulé. La présente suite ne démontre donc ni
  déterminisme de la partie complète, ni comportement natif sous différents FPS.
- Aucune trace originale n'est rejouée ici ; pas de comparaison native exécutée,
  pas de validation visuelle WebGL, pas de preuve d'équivalence des animations,
  projectiles, dégâts ou IA.

Le prochain raccord doit suivre les contrats issus des lanes SH-01/SH-03 et
seulement ensuite proposer des métriques supplémentaires de parité mesurable.


## Intégration verticale WebGL2 — fixture **SYNTHETIC / NOT MCD**

La fixture générée s'ouvre depuis **Vue → Scène de contrôle générée** sur
`http://localhost:4173/`. Aucun paramètre d'URL n'active les fonctionnalités.
La page d'accueil montre par défaut les modèles originaux disponibles localement ;
le prototype jouable reste accessible dans le même menu.

Chemin d'exécution réellement raccordé :

`src/main.js → buildSyntheticManifest() → buildSceneGraph() → planSceneDraws() → drawGeneratedManifest() → renderer.box()/renderer.affineBox()`.

Cette fixture est **100 % générée**, n'est ni Containers ni une scène d'origine.
Elle contient des volumes imbriqués et une composition TRS (translation,
quaternion, scale) produisant des transformations non diagonales et du shear
avec un parent non uniforme. Le shader WebGL2 reçoit la matrice affine complète
et une inverse-transposée 3×3 pour les normales (y compris les réflexions) ;
aucune rotation/shear n'est réduite à une boîte AABB. Les paquets purement
axis-alignés continuent par l'ancien moteur. Les matériaux utilisent
`GENERATED_PALETTE`, pas des textures ou shaders commerciaux.

Les objets supplémentaires sont **visuels uniquement** : ils ne participent
pas encore aux obstacles, contacts, tirs ni occlusions du gameplay. Un décor
rendu sans collision n'est pas une scène MCD jouable. L'intégration d'une vraie
géométrie Containers build28 dépend des jointures Unity vérifiées par SH-04,
avec identité `(owner,path_id)`, TRS, mesh assigné, matérialisation autorisée,
et ensuite une politique collision explicite.

Tests Node : `node --test tests/parity-scene-manifest.test.mjs`.
Ces tests vérifient la composition/dispatch et les normales numériques,
**pas** la compilation du shader sur GPU ni une capture native. En navigateur,
la session opt-in expose `window.__superhotSceneMetrics` (objet et draw-call
counts, échantillons rAF, `p95FrameMs`, `fpsAtP95FrameMs`, `p95Fps`).
Les compteurs sont mesurés **dans cette session Web** et actualisés à ~1 Hz,
sans recourir au runner natif. Ils n'ont pas encore de valeur mesurée ni de
capture réelle attachée à cette documentation. Pour relever une mesure :
démarrer une session jouable, parcourir la fixture, noter résolution et GPU,
capturer l'écran et copier les métriques après plusieurs secondes. Comparer
également avec **Vue → Prototype jouable**. Ne pas annoncer de FPS, de réduction de
draw calls ou de fidélité visuelle sans cette mesure.

Cette préparation est un **contrat de rendu autonome** ; les données réelles de
scène et les mesures natives sont toujours `INCONNUES`. Les comparaisons
avec les 354+ tests Node Web verts restent strictement côté prototype.


## Containers/build28 — preview WebGL2 de volumes dérivés (SH-04 → SH-05)

Ouvrir `http://localhost:4173/` après `npm start`. La visite des modèles locaux
est la vue par défaut. Le menu **Vue** donne accès au prototype jouable et à la
scène de contrôle générée, sans commutateurs cachés dans l'URL.

**PROUVÉ en statique, pas en exécution native :** SH-04 a relié cinq objets
cargo `level28` avec MeshRenderer/BoxCollider activés et leurs
transformations dans le corpus privé de MCD build `20299547` (artifacts des
issues privées #16/#20/#27/#30/#32/#37/#39). Le code public ne reproduit que
des **AABB arrondies et réfléchies de colliders**, jamais les vrais meshes,
matériaux, couleurs ou shaders. `src/scenes/containers-build28.js` ajoute
40 nervures et un sol **purement inventés** : 46 primitives au maximum, avec
culling avant les draw calls.

**Raccord visible :** `main.js → drawContainersBuild28Preview() →
createContainersBuild28DrawPlan() → renderer.box()`. La caméra initiale de
preview est également **inventée** : elle vise le groupe depuis
`CONTAINERS_BUILD28_DEMO_CAMERA`. On voit les cinq enveloppes de cargo,
dont une surélevée, sans charger les assets commerciaux. L'UI annonce
« COLLIDER PROXY · NOT MCD GAMEPLAY ». Dans ce mode, les trois salles,
ennemis et obstacles **inventés** sont masqués et ne participent plus aux
contacts, mais aucun collider MCD n'a été intégré au gameplay non plus.
Cette vue est une **visite visuelle**, sans adversaires/progression ni
équivalence de physique/collision, pas une reproduction jouable 1:1.

À relever **en navigateur** après ouverture de la preview :
`window.__superhotSceneMetrics` (mode
`CONTAINERS_COLLIDER_PROXY_NOT_MCD_RUNTIME`, objets=46, enveloppes natives
dérivées=5, `visible`, `culled`, `legacyDraws`, total draw calls et
`p95FrameMs`). Ajouter capture, résolution, navigateur, GPU et l'angle
effectif avant d'avancer un FPS ou un gain graphique. **À la date de ce PR,
ni capture navigateur ni p95 GPU/rAF mesuré ne sont disponibles** : seuls
les tests Node de plan et de dispatch ont été soumis.

`node --test tests/parity-containers-preview.test.mjs` couvre le raccord,
la non-publication des assets, le culling et l'exclusion des niveaux Web
inventés. Même si la CI est verte, cela ne prouve **ni la couleur des vrais
containers, ni la silhouette mesh, ni l'échelle de la caméra native**, ni
l'exécution en jeu de l'instance sérialisée. La suite exige une comparaison
visuelle avec caméra native réellement observée et, séparément, une
reconstruction physique autorisée/sourcée.

## SH-05 — brouillard Containers dérivé du sérialisé (2 novembre 2026)

Preuve statique primaire **privée** : `TGrozner/superhot-research#41`,
artifact `13134492119`, champ Unity build28 RenderSettings `m_Fog=false`.
Cela établit un état **sérialisé** de la scène, pas une capture du rendu
natif ni l'absence de modifications en jeu. La valeur `ambientIntensity=0`
ne suffit **pas** à reconstruire les éclairages indirects, lightmaps et shaders.

Dans la vue par défaut **Modèles originaux locaux**, le shader WebGL2 applique
`uFogStrength=0`. Le prototype jouable et la scène de contrôle générée préservent
le brouillard Web de force `0.72`, issu de `src/render/lighting-model.js`.
Les géométries et textures originales restent privées et ne sont pas distribuées.

Contrôle ciblé : `node --test tests/parity-containers-fog.test.mjs`
vérifie les valeurs envoyées à l'uniform dans un **WebGL2 simulé** et
l'activation exclusivement Containers. Ce n'est **pas** une capture GPU.
Pour juger le changement visuel, une personne doit comparer des captures
du même angle/résolution avant/après sur navigateur réel, puis associer
une capture MCD native privée avec paramètres contrôlés. p95 FPS, décompte
des appels WebGL2 et correspondance pixel native ne sont pas encore mesurés.


## Chargement des groupes OBJ locaux (SH-05, 2026-11-02)

Open `/`. Configured private files load automatically. **Remplacer les fichiers locaux** also accepts a personal `.obj` or `.obj.gz` for each verified Combined Mesh group:

- `Mesh level28:6`, OBJ group suffix `_47`, expected **1546** triangles / cargo center `[17.45,2.575,13.975]` in the *Web* preview coordinate convention.
- `Mesh level28:7`, OBJ group suffix `_48`, expected **1546** triangles / cargo center `[17.475,5.725,15.8]`.

Loading either file decompresses/parses it in the browser, converts the OBJ's mirrored-X exported coordinates to the Web preview convention by reflecting X and Z, and validates triangle count and world bounds before WebGL2 upload. The matching generated hull and artificial ribs disappear only after successful upload. Other generated proxies remain.

**Privacy / rights:** original bytes are loaded from the same-origin loopback allowlist or personal File inputs; nothing is uploaded externally or persisted by the browser. No original asset is bundled in Git. The Node server exposes only configured files, not the private directory or its paths. Geometry and texture presence do not establish native shaders, lighting, runtime visibility, gameplay or pixel-level 1:1 fidelity. The metrics distinguish local originals from generated proxies.

**Private evidence (do not publish original resources):** `superhot-research#42/#43/#45/#47/#55/#60/#63` establishes the Unity indices, converted OBJ existence, first container submesh47 (4638 indices, 1546 triangles), and X-mirrored OBJ AABB matching its serialized source. Group48 has source-reported 4638 indices and corresponding collider envelope. This UI provides a real GPU rendering path but does not validate native material/shader/animation parity. Screenshots and performance should be assessed directly in a browser before claiming visible fidelity.

Run `npm run check` for syntax and regression tests; perform a real WebGL2 browser smoke test with user-selected files separately. The tests use synthetic miniature OBJ fixtures only.


## SH-05 — un seul OBJ6 privé, trois placements Containers source-qualifiés

**Aucune ressource originale publique.** Sur `/`, le serveur local fournit
l'export personnel Mesh6 configuré, ou l'utilisateur le sélectionne sous
**Remplacer les fichiers locaux** : groupe `_47` (1 546 triangles). Le navigateur
valide ce groupe par nombre de triangles et AABB, puis téléverse ses buffers
**uniquement vers le GPU du navigateur**, pas vers un serveur. Le programme
réutilise son unique VAO/VBO/EBO pour trois drawElements avec matrices
affines : GO336/mesh6:g47 (identity), GO839/mesh6:g24
(-7.35,0,+4.5), GO1003/mesh6:g32 (-1.4,-0.05,-25.2). Le mesh7:g48
demeure un second fichier local facultatif et une seule instance distincte.
Sans originaux configurés ni fichiers sélectionnés, la page indique leur absence et conserve les volumes générés.

**PROUVÉ par les données statiques** : jointures Unity des trois GOs/
MeshRenderers/submeshes dans `superhot-research#68` (artifact
`13136407658`), source `level28` Unity 2018.4.14f1 SHA256
`e0dae9e43ce59ff8f53e157bae277c382602efdf8b34386cacf8c34995b2db91`.
**OBSERVÉ dans le corpus privé converti** : mesh6 OBJ complet, research#63
artifact `13135277646`, groupes 24/32/47 de 1 546 triangles ; UVs/
faces équivalents, géométrie presque superposable après translation
(max delta centré ~2.01e-6). Réutiliser g47 pour les trois est une
**approximation visuelle contrôlable**, pas une preuve de byte-égalité
avec les trois groupes ni d'identité du rendu MCD.

Une fois g47 chargé avec succès, les proxies générés `cargo-22`
et `cargo-7` ainsi que leurs nervures inventées sont omis ; GO1003
est ajouté (il n'avait pas de proxy dans les cinq hulls du preview).
Quand mesh7:g48 charge également, son proxy `cargo-upper` est omis.
Les deux autres hulls, les surfaces décoratives restantes et le sol sont
toujours synthétiques. Les règles de combat, de collision et de progression
Containers restent **non connectées**.

**Contrôle visuel non encore exécuté :** relever sur la session réelle
`window.__superhotSceneMetrics` avec les deux fichiers sélectionnés.
Attendu dans un cadre où les instances sont dessinées :
`locallyLoadedSourceGroups=2`, `generatedManifest.privateIndexedDraws=4`,
`generatedManifest.sourceQualifiedMesh6DrawPackets=3`, et
`generatedManifest.hiddenByPrivateMesh>0` ; relever `totalWebGLDrawCalls`,
`p95FrameMs`, capture du canvas, résolution/DPR/GPU, puis comparer
à une capture MCD native **à pose/projection réellement appariées**.
Les compteurs de l'application ne remplacent pas une preuve GPU/pixel ;
aucun de ces nombres n'est présenté comme observé avant ce test.
La jointure statique matériau/texture est identifiée ci-dessous ; le shader et
l'éclairage Web restent générés, et **aucun 1:1 n'est validé**.

## Texture PNG locale facultative — Containers

Sur `/`, la texture configurée est chargée automatiquement. On peut aussi choisir
un PNG sous **Remplacer les fichiers locaux → Texture PNG locale — béton des conteneurs**. La texture
peut aussi être sélectionnée avant les OBJ : elle ne devient visible que sur
les meshes locaux chargés. Pendant la visite, **Échap** libère la souris pour
accéder aux sélecteurs. Le statut des meshes reste indépendant de celui de la
texture ; les deux groupes continuent de produire les quatre placements décrits
ci-dessus, sans nouveau mesh ni modification des proxies.

Le fichier doit être non vide, porter l'extension `.png` et ne pas dépasser
**16 Mio**. Le navigateur décode l'image avec
`createImageBitmap(file, { imageOrientation: 'flipY', premultiplyAlpha: 'none',
colorSpaceConversion: 'none' })`, puis appelle
`renderer.replacePrivateTexture(bitmap)`. Le renderer refuse les dimensions
invalides ou supérieures au `MAX_TEXTURE_SIZE` de la session WebGL2. Un échec de
décodage ou de transfert GPU conserve la dernière texture valide ; le statut
accessible annonce l'échec et l'état conservé. Une sélection plus récente
invalide les décodages en attente, et chaque bitmap décodé est fermé après
utilisation, y compris lorsqu'il est devenu obsolète. Recharger la page recharge
les originaux configurés sur le serveur ; les sélections manuelles ne sont pas persistées.

La texture utilise les UV présents dans l'OBJ, une échelle `(0.1, 0.1)` et un
offset `(0, 0)`, avec répétition, mipmaps et filtrage linéaire. L'échantillon
sRGB est converti en linéaire pour l'éclairage, puis la sortie texturée est
réencodée en sRGB. Seuls les draws des meshes privés consomment cette texture :
boîtes, nervures, sol, fragments et autres modes conservent leur rendu généré.

**Provenance statique privée :** mesh6/sub47 et mesh7/sub48 sont reliés au
matériau `resources.assets::3`, shader `XULM FULLFORWARD/Concrete 2019 MAIN`,
avec MainTex `resources.assets::248`, échelle approximative `(0.1, 0.1)` et
offset `(0, 0)`. Ces identifiants ne chargent aucune ressource automatiquement
et ne prouvent pas que le fichier choisi est la texture originale. Aucun octet
de texture ni code du shader original n'est ajouté au dépôt public.

`window.__superhotSceneMetrics.locallyLoadedTexture` vaut `null` sans texture
acceptée, sinon `{ width, height }` pour la dernière image transférée avec succès,
même si aucun OBJ n'est encore chargé. `locallyLoadedSourceGroups` et les
compteurs de draws restent indépendants. `nativeMaterialShaderMatch` et
`nativeLightingMatch` restent `false` : **texture présente ne signifie ni shader
natif, ni éclairage natif, ni parité pixel**. Cette implémentation ne constitue
pas une mesure GPU ni une comparaison native ; les vérifications navigateur
avec fichiers personnels et les contrôles de régression doivent être effectués
séparément.

## Modèles ennemis originaux — import local raccordé

La PR SH-14 #114 est raccordée à la page d'accueil `/`, sans flag ni bouton
d'activation. Le serveur local charge automatiquement EnemyMerged et les cargos.
Le sélecteur **Personnage** permet de charger aussi la variante sans tête.
Les sélecteurs de fichiers restent disponibles pour remplacer les originaux.
Le chargeur vérifie l'identité, le SHA-256, les bornes et les triangles avant le
transfert GPU ; une erreur conserve le modèle précédent. Aucun envoi externe.

Le modèle complet contient **2254 triangles**, la variante sans tête **2132**.
Ce sont les véritables exports de `sharedassets0.assets:284/285`, pas le
mannequin procédural. Le chargement local raccorde désormais le squelette
de 62 nœuds et les poses originales `idle`, `walk` et `hit` au temps du jeu.
Les apparitions, le combat, les débris et l'éclairage restent des adaptations
Web ; `hit` n'est pas une animation native de mort.

**Cadrer le modèle** ouvre une inspection sans collision. **Vue des conteneurs**
revient au point de départ auteur de la scène locale complète. Le bouton de
combat démarre la rencontre Web avec les modèles originaux. Les positions
auteur ne prouvent pas le choix des apparitions effectué par le moteur natif.

La texture béton ne s'applique qu'aux conteneurs, jamais à l'ennemi.
`window.__superhotSceneMetrics` décrit les modèles, le squelette et les draws
effectivement soumis. `skinAnimationVerified` indique le chargement du pass
animé ; `nativeEnemySpawnVerified` reste `false`.

**Vérification navigateur locale effectuée le 2026-11-02 :** Chromium/WebGL2
a affiché les deux vrais modèles, chacun avec un draw indexé, ainsi que les
quatre placements de conteneurs texturés depuis deux fichiers OBJ.
Une mauvaise sélection OBJ a été rejetée sans supprimer le modèle précédent ;
une image PNG illisible a conservé la texture précédente. Aucune erreur WebGL
observée dans ces scénarios. Un damier de contrôle GPU a confirmé l'orientation
des UV et l'absence de modification du rendu des boîtes générées.
Captures et fichiers originaux restent dans le corpus privé. Ce constat Web
ne vaut pas comparaison pixel avec MCD ni validation des animations.

Cette vérification statique est historique. Les vérifications actuelles du
monde complet, du skinning et des quatre références natives isolées sont
décrites dans [visual.md](visual.md) et [characters.md](characters.md).
Elles ne constituent toujours pas une validation de fidélité 1:1.

### SH-05 — Mode de secours sans package de scène complet (2 Nov 2026)

Les apports de la PR #128 sont conservés lorsque le package privé de scène
complète n'est pas disponible. Les paragraphes suivants concernent uniquement
ce mode de secours : avec le package complet, les colliders, points auteur,
armes et animations décrits plus haut prennent le relais.

The default original-local-file view now uses **five level28 serialized BoxCollider envelopes** as provisional AABB contact obstacles and a clearly **invented Web spawn** (11, 2.65, 28). The serialized overhead cargo is excluded from ground-level 2D walking, but remains eligible for 3D projectile contact. This is **not** a Unity PhysX CharacterController replay or a native player spawn. Source: private research #16/#27/#30/#32/#37/#39, published derived hulls in `src/scenes/containers-build28.js`.

When the owner supplies verified original OBJ6/OBJ7 through local File inputs or loopback allowlist, SH-05 draws three Mesh6 group47 placements and **three separately verified Mesh7 ranges** 48/46/77 (1546 triangles each, 9276 submitted triangles total if all six succeed). Only after a successful WebGL draw for each matching cargo does its generated proxy and decorative ribs disappear; other 3D scene substitutes remain clearly provisional. Mesh7 provenance: research #68/#103; contract `src/scenes/containers-mesh7-local-plan.js` (#121). No mesh/texture files enter the public repo.

After authenticated local EnemyMerged/Headless OBJ load, one **stationary, shootable Web fallback target** appears at diagnostic coordinates (11, .97, 24) with the real static mesh; player movement, ammunition, projectiles, hit spheres, fallback shatter FX and existing viewmodel weapon are prototype behaviours rather than MCD reverse-engineered runtime gameplay. No original enemy spawning/AI, PhysX hitbox, evaluated skin animation, native weapon model, XULM shader, or native paired-frame/FPS proof is claimed. A clear completes this one-target Web sandbox rather than silently progressing into the three invented prototype stages. Runtime details and provenance are available in `tests/parity-containers-playable.test.mjs`. Browser GPU source-file smoke remains a separate mandatory check, NOT replaced by green Node tests.
