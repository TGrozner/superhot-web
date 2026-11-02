# SH-15 — Comparaison visuelle MCD ↔ Web (protocole, **pas** un certificat 1:1)

**État courant :** six paires native/Web de personnages isolés ont été capturées et comparées ; les résultats et leurs limites figurent dans « Vérifications effectivement observées ». Aucune paire complète de gameplay n'établit la fidélité1:1. La cible est SUPERHOT: MIND CONTROL DELETE (MCD), Containers/buildIndex28. Les sections d'audit initial ci-dessous sont historiques.

## P0 actuel — capture Web d'une frame réellement exécutée (SH-15 #125, révision 2)

Les notes historiques **après #98** plus bas ne décrivent plus le mode racine actuel.
Sur `main` au 02/11/2026, `/` peut charger un **package original privé via loopback** :
`metrics.mode === 'CONTAINERS_ORIGINAL_GEOMETRY_WEB_GAMEPLAY'`, avec 68 meshes,
360 instances, 17 textures et environ 185037 triangles soumis lors du smoke
Chromium *rapporté*, et non une mesure d'écart par rapport à une frame native de
Containers. Les compteurs servent à qualifier un rendu Web, pas une fidélité de
shaders ou de physique. Le fallback sans package garde un mode distinct.

### Correctif de provenance pixel et mode opératoire

Le précédent `canvas.toBlob()` était **asynchrone** sur un canvas WebGL
constamment redessiné : un `frameId` enregistré avant l'encodage pouvait ne
pas être celui des pixels. La version SH-15 ajoute maintenant le chemin strict
`WebGL2.readPixels` **synchrone**, appelé dans le rAF suivant *après* une
nouvelle frame terminée par l'application, avec comparaison de `frameId`,
`activeScreen` et `worldClock` autour du readback. Si le rendu du jeu n'a pas
progressé pendant ce rAF, s'il laisse un FBO hors écran lié, si les dimensions
réelles divergent, si l'API retourne une erreur, ou si l'image est uniforme,
la capture échoue explicitement. Aucun fallback silencieux vers `canvas.toBlob`.

Les pixels RGBA WebGL proviennent du coin **bas gauche** : un flip vertical
transforme les lignes, puis on les copie vers un canvas 2D privé stable et on
encode un PNG sRGB. Pendant l'encodage asynchrone, l'application peut continuer
à dessiner sans altérer la copie figée. Le PNG contient `SH15Capture` et les
empreintes SHA256 du **PNG brut** (`rawCanvasSha256`) et du tampon RGBA figé
(`rawFrameRgbaSha256`). Les octets d'image ne sont **pas** publiés ni uploadés.

**Procédure reproductible, machine du propriétaire uniquement :**

1. Démarrer `npm start` et ouvrir `http://localhost:4173/` dans Chrome/Edge.
   Charger le package local via la route localhost privée. Fixer le viewport
   **1920×1080**, DPR **1** et faire disparaître les contrôles/overlays de la
   zone canvas. Ne pas redimensionner la capture.
2. Choisir **au préalable** une caméra connue et reproductible dans le repère
   Web, avec `{x,y,z,yaw,pitch}`. Ne pas copier un frame aléatoire pour feindre
   une correspondance. Garder le même état d'ennemi et même phase.
3. Dans DevTools sur la page, lire `window.__superhotGetRenderedFrameSnapshot()`
   et `window.__superhotSceneMetrics`, vérifier `activeScreen:'playing'` et
   `mode:'CONTAINERS_ORIGINAL_GEOMETRY_WEB_GAMEPLAY'`.
4. Capturer **après** un frame GPU réellement complété :

```js
const { captureContainersWeb } = await import('/scripts/visual-web-capture.mjs');
const receipt = await captureContainersWeb({
  expectedCamera: {x: X_VERIFIE, y: Y_VERIFIE, z: Z_VERIFIE,
                   yaw: YAW_VERIFIE, pitch: PITCH_VERIFIE},
  expectedScreen: 'playing', strictViewport: true,
  webCommit: 'REMPLACER_PAR_SHA_GIT_REEL',
});
console.log(receipt.captureMethod, receipt.frameId, receipt.rawFrameRgbaSha256);
```

Les valeurs en majuscules sont **des espaces réservés** ; les remplacer par
des nombres effectivement retenus, pas par des chaînes, et le SHA par le commit
de la version ouverte. La sortie attendue est
`captureMethod:'WEBGL2_READ_PIXELS_SYNCHRONOUS_COMPLETED_FRAME'`, un
`frameId>0` vérifié, un fichier PNG local non uniforme et `nativeCameraMatched:false`.
L'absence de screenshot dans l'environnement SH-15 **n'est pas corrigée** par
la réussite des tests Node.

5. Capturer **MCD exécuté** dans la même scène build28 et pose de caméra
   native **réellement active**, après conversion explicitement prouvée des axes
   et unités; relever état, temps d'animation, projection, FOV, near/far et
   résolution. Garder le PNG, les données de pose et matrices **dans le privé**.
6. Fournir les deux `manifest.json` privés `schemaVersion:1`, leurs masques
   de silhouette construits de manière identique, et lancer
   `node scripts/visual-compare.mjs --native <privé>/native/manifest.json
   --web <privé>/web/manifest.json --out <privé>/aggregate.json`.
   Une matrice incohérente ou une phase différente doit donner
   **UNREGISTERED**, pas un score. Aucun PNG/objet natif dans une PR.

### Les trois plus grands écarts ou manques VISUELS à SH-05

**P1 — acteur isolé, apparence :** les *quatre comparaisons déjà consignées* dans
ce document donnent un écart RGB moyen sur le masque union de **0.0940–0.1022**,
et une apparence rouge cristallin/éclairage Web encore simplifiée. Mesure limitée
aux poses idle/walk/hit isolées, pas une couleur moyenne de la scène.

**P1 — acteur isolé, contours :** silhouette IoU **0.9554–0.9615** et décalage
de centroïde **0.63–0.81 px**, dans le protocole 960×540 cité plus bas.
L'antialiasing peut contribuer, mais cette décomposition n'est **pas mesurée**.

**P0 — scène et caméra actives :** **aucune** frame native Containers complète
appariée à une frame Web complète avec le même état, la même caméra active,
les mêmes lightmaps et le même rendu final. Il n'existe donc **aucun** RGB MAE
ni IoU de la scène et aucun classement quantifié des écarts du niveau. SH-05
doit d'abord fournir ce couple privé de vues et les matrices réellement
utilisées; SH-15 établira alors les trois écarts *mesurés* de la scène.

**Contrat SH-05 exact :** conserver `__superhotGetRenderedFrameSnapshot()` avec
`{frameId,activeScreen,camera:{x,y,z,yaw,pitch},projection:{verticalScale,
near,far,aspect,viewProjection:[16]},worldClock,generatedManifest,
totalWebGLDrawCalls,nativeScene}`, cohérent avec la frame dessinée; exposer
`__superhotSceneMetrics` avec `browserMeasured:true` et le mode **exact** ;
laisser `canvas#scene` avec son framebuffer par défaut après rendu. SH-15
ne modifie ni `src/main.js`, ni `src/renderer.js`, ni les tests SH-10.
Le flux `readPixels` ne fait aucun fetch privé supplémentaire.

---

## Les trois priorités visuelles à SH-05 — mise à jour après #98

**Audit historique, avant le raccord des originaux et les captures isolées ci-dessous.** Les écarts suivants décrivent les paramètres et la couverture à cette ancienne étape, pas l'état courant ni un score perceptuel.

1. **P0 — pas de vue native/Web appariée.** `?scene=containers` existe sur main depuis #88 ; #98 (squash `b6d7ed8`) permet désormais de charger localement les groupes OBJ sourcés `mesh6:g47` / `mesh7:g48` via `File`. Mais la vue n'a ni même pose native vérifiée, ni capture GPU Web avec les fichiers privés, ni image MCD exécutée et appariée. Les volumes non remplacés restent générés, et ce mode n'est pas le gameplay MCD. **Prouver** : navigateur réel, `locallyLoadedSourceGroups=2`, `sourceQualifiedMesh6DrawPackets=3`, `privateIndexedDraws=4`, screenshot propre et camera/mode explicités.
2. **P0 — perspective différente, écart **analytique** quantifiable.** Le shader Web actuel utilise `f=1.58`, soit **64.66037° vertical** ; la caméra Unity sérialisée de `level28` indiquée par le résultat privé #15 vaut **~60.00003° vertical**, `near=0.03`, `far=1000`. Web: `near=0.045`, `far=120`. À pose/viewport/profondeur identiques, un objet face caméra serait projeté **8.78 % plus petit en hauteur** côté Web. Ce n'est **pas** une mesure de capture, et la caméra Unity sérialisée n'est **pas confirmée active au moment d'une image native**. **Prouver** : caméra réellement active, poses/projections appariées, avant de lancer le comparateur PNG.
3. **P0/P1 — objets/couleurs encore incomplets.** Le résultat privé #68 relie 6 groupes à des Renderer/MeshFilter, tous à **4 638 indices** et le même material slot déclaré ; le mode Web charge optionnellement seulement **2 fichiers sources** de ces 6 sous-groupes, réutilisant depuis #105 le groupe mesh6:g47 pour **3 instances** et dessinant mesh7:g48 comme quatrième draw, sans couleurs/shaders/textures natifs vérifiés. L'OBJ privé mesh6 contient également les groupes **24** et **32** (1 546 triangles chacun). Depuis #105, les positions de ces deux instances sont obtenues en réutilisant le g47 importé : c'est une approximation contrôlée, pas trois exports distincts chargés. Le reste du décor combine approximations de collision, nervures artificielles et palette/lumière Web générées. **Prouver** : instances supplémentaires, matériaux qualifiés par owner, photos comparées. Aucun `RGB MAE`, IoU ou SSIM réel disponible.

Références : [#5](https://github.com/TGrozner/superhot-web/issues/5), [#4](https://github.com/TGrozner/superhot-web/issues/4), [#72](https://github.com/TGrozner/superhot-web/issues/72), [#98](https://github.com/TGrozner/superhot-web/pull/98). SH-15 ne modifie **aucun** fichier de rendu partagé et ne redéclenche pas de requête privée déjà exécutée.

## Sources privées réellement inspectées

SH-15 a téléchargé **l'artifact privé 13133542861** du run `41426522641` (research issue [#10](https://github.com/TGrozner/superhot-research/issues/10)) et lu son `result.json` : opération SQL `query`, tables `hierarchy`, `objects`, `scenes`, `serialized`, `sources`, `truncated=false`. Ce succès prouve le **schéma et l'accès**, **pas** les meshes, les transforms jouées ni la vue native. SH-04 possède les requêtes indexées suivantes : #16 scène owner/build28, #20 TRS, #27 repères, #30 GameObjects, #32/#37 composants mesh/colliders et #39 activation sérialisée. Ne créer aucune requête doublon, ne publier aucun `result.json`, asset, screenshot ou identifiant brut du jeu natif.

Une valeur Unity sérialisée (même authentique) ne prouve pas à elle seule qu'elle fut appliquée au runtime. Pour une paire admissible, il faut une **capture native exécutée** associée à son build, état exact, frame, scène active, caméra active, et les captures Web prises sur la même scène/état/angle. Garder les sources et captures natives **dans le privé**.

## Manifeste JSON **privé** — `schemaVersion: 1`

Deux répertoires privés **distincts** `native/` et `web/`, chacun avec image PNG opaque, masque de silhouette facultatif (noir=0 / blanc=255), et un `manifest.json` du type ci-dessous. **Les matrices identité ne sont qu'un exemple de format ; ne jamais les faire passer pour la caméra MCD.**

```json
{
  "schemaVersion": 1,
  "origin": "native",
  "evidence": { "captureId": "ID_NATIF_PRIVÉ", "buildId": "BUILD_VÉRIFIÉ" },
  "scene": { "id": "Containers", "buildIndex": 28, "stateId": "ÉTAT_ET_FRAME_COMMUNS" },
  "camera": {
    "convention": "column-major-world-to-camera",
    "coordinateSpace": "matched-web",
    "viewMatrix": [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1],
    "projectionMatrix": [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]
  },
  "capture": {
    "viewport": [1920,1080], "colorSpace": "srgb", "hud": "off",
    "png": "native.png", "mask": "native-mask.png"
  },
  "objects": [
    { "id": "OWNER_PATH_ID_PRIVÉ", "worldMatrix": [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1] }
  ]
}
```

Pour `web/`, `origin` = `"web"` et `png`/`mask` pointent sur les fichiers Web ; `evidence` n'est obligatoire que pour `origin:"native"`. Les objets peuvent être `[]`, mais chaque identifiant commun doit représenter **la même instance** (clé native `owner,path_id` transformée en identifiant privé commun). `origin:"synthetic"` est réservé aux tests. Le champ `stateId` doit désigner le **même instant et les mêmes états** des deux côtés, pas juste le nom du niveau.

**Enregistrement obligatoire :** convertir les matrices Unity/Web dans une **même convention** column-major, repère et axe vérifiés, sans copier artificiellement les matrices Web dans le manifeste natif. Vérifier view/projection réelles, near/far, viewport, mouvements caméra, blur, tonemapping et HUD. Le script n'aligne pas automatiquement les images. Si ces données ne sont pas connues, **pas de comparaison quantitative**.

PNG : 8 bits, RGB/RGBA/gris/gris+alpha, **opaques**, non entrelacés, résolution strictement égale (≤ 8 millions pixels), sRGB. Pas de scaling/recadrage caché. Les masques facultatifs doivent représenter **exactement la même classe de silhouettes** des deux côtés, seuil fixe 128 et mêmes dimensions. Une segmentation heuristique par couleur n'est pas une preuve native.

## Commandes et sémantique

```bash
node --test tests/visual-compare.test.mjs
node scripts/visual-compare.mjs --native /private/native/manifest.json --web /private/web/manifest.json --out /private/visual-aggregate.json
```

Sans `--out`, rapport JSON d'agrégats uniquement sur stdout ; avec `--out`, création **sans écrasement** en mode 0600. Exit **0** = paire valide pour calcul, **jamais** une déclaration 1:1. Exit **2** = fichier illisible, entrée non conforme ou vue non enregistrée. `UNREGISTERED` signale un problème de scène, état, résolution, vue ou projection : **les statistiques de pixels restent nulles**. Tolérance `1e-5` sur chaque coefficient de matrice. Refus explicite de lire deux fois **le même fichier image** pour empêcher une auto-comparaison trompeuse.

Pour une paire vérifiable : RGB MAE/RMSE `[0,1]`, MAE par canal, moyennes RGB `[0,255]`, luminance Rec.709 **linéarisée depuis sRGB**, p95 de l'écart maximal par canal ; deux masques explicites → IoU/centroïdes des silhouettes ; objets appariés → effectif manquant/excédentaire, p95 déplacement et écart de coefficients des matrices. Pas de SSIM prétendu. Sans preuve de conversion d'unités, l'erreur de translation ne signifie que « unités du repère déclaré ». **Aucune sortie** ne contient les pixels, chemins privés, matrices natives ou IDs d'objets.

Statuts `PAIRED_NOT_PARITY_VERIFIED` / `UNREGISTERED`, classe `SYNTHETIC_ONLY` / `CAPTURE_PAIR_USER_ATTESTED`. Même une capture déclarée native dans le manifeste n'est **pas authentifiée indépendamment par ce script**. Les tests verts valident le comparateur, **pas** le jeu. Pas de seuil universel d'acceptation ni de « 1:1 » sur une scène seule.

## Handoff vérifiable à SH-05

Avant de revendiquer le moindre progrès visuel chiffré : fournir le **HEAD SHA Web**, preuve d'une scène build28 réellement sélectionnée dans le navigateur, `buildId`/identifiant/empreinte de capture **privés** MCD, scène, état, matrices de caméra et viewport **appariés**, PNG/masks privés, agrégat JSON, puis les **trois principaux écarts constatés sur ces captures**. Ne publier que des **agrégats suffisamment anonymisés** et le verdict « parité non vérifiée ». Aucun changement de `src/main.js`, `src/renderer.js`, `src/levels.js` par SH-15.


## Audit de projection reproductible (sans image, sans certificats 1:1)

**Entrées réellement relues** : `superhot-research#15` (run `41427087945`, artifact privé `13133497389`, `result.json` = `read spec/time-input-camera.md`, 110 lignes), et `#68` (artifact `13136407658`, `result.json` = SQL `query`, **6 lignes**, `truncated=false`). La source #15 fournit pour Camera7605/GO1274, `level28`, les valeurs **sérialisées** 60.0000267°, near 0.03, far 1000 ; elle mentionne des observations et captures natives stockées dans le corpus, **pas livrées à SH-15 sous forme de paire utilisable**. La lecture #68 associe Mesh6:g47 et Mesh7:g48 à leurs Renderer/objets, 4 638 indices chacun ; ces données sont des liaisons sérialisées, pas un draw natif exécuté. Le `result.json` de #10 (artifact `13133542861`) a également été relu, `truncated=false`, pour le schéma seulement. Des sources privées supplémentaires nécessaires à gameplay/audio relèvent de leurs owners ; **aucun nouveau corpus-query demandé**.

L'audit utilise maintenant la projection de la **frame réellement rendue**, et non une expression GLSL recherchée dans le texte du renderer. Enregistrer le résultat privé de `window.__superhotGetRenderedFrameSnapshot()` :

```bash
node scripts/visual-framing.mjs --web-frame private/frame.json --native-vfov 60.0000267 --native-near 0.03 --native-far 1000 --height 1080 --reference-height 1 --reference-depth 10
```

Le descripteur contient le numéro de frame, la caméra, le champ `projection` et la matrice `viewProjection` effectivement envoyée au GPU. L'analyse calcule FOV, near/far et taille idéale projetée ; son verdict `PROJECTION_..._NO_PIXEL_MEASUREMENT` reste structurel, pas une comparaison d'images.

Containers utilise la projection sérialisée 60.0000267° / near0.03 / far1000. Sa position de départ vient d'un point de départ auteur ; le transform sérialisé de la caméra, situé hors du niveau sous Core Mechanics, n'est pas ajouté à ce point. Ce choix Web ne prouve pas la sélection aléatoire faite par le jeu natif.

## Capture Web actuelle, sans flags

1. Lancer `npm start`, ouvrir **http://localhost:4173/** et attendre le chargement des originaux configurés. La scène complète remplace le précédent aperçu de quatre cargos.
2. Pour une capture, conserver une caméra fixe et relever `window.__superhotGetRenderedFrameSnapshot()`. Passer sa caméra exacte et son `activeScreen` à `captureContainersWeb({expectedCamera,expectedScreen,webCommit,strictViewport})`, importé depuis `/scripts/visual-web-capture.mjs`. Le mode strict demande un canvas1920×1080 et DPR1.
3. Le script vérifie la caméra et la phase pendant l'encodage PNG. Il conserve projection, horloge et compteurs de la frame lorsque disponibles. Le dernier draw ennemi n'est **pas** la pose de tous les acteurs. L'horloge du monde peut avancer : aucune correspondance de pose native n'en est déduite.
4. `downloadRequested` indique une demande de téléchargement, pas un fichier effectivement enregistré. Les images, modèles, données de pose et références originales restent privés.

## Vérifications effectivement observées

La racine a été exercée dans Chromium/WebGL2 avec360 instances de décor,185037 triangles,68 meshes,21 textures, personnage original skinné et pistolet original. Marche, pause, tir, lancer et impact ont été exercés ; les contrôles de scénario ne prouvent pas un parcours natif. Le décor compte121 compositions Concrete MAIN sourcées et239 draws génériques. Les chemins BC3 à12 mips et PNG de repli sans S3TC ont tous deux été observés sans erreur GL.

Six références isolées ont été rendues dans le moteur MCD original : idle0, walk0.25, walk0.75, hit0.25, fire0.25 et punch0.5, à960×540, caméra(0,1.15,4), avec les mêmes matrices de vue/projection. La référence utilise `SkinnedMeshRenderer.BakeMesh` et les matériaux originaux. Le Web utilise son véritable pass de skinning GPU et le shader Red Crystal reconstruit, sans redimensionnement, antialiasing désactivé. Le temps du shader Web est fixé à0 ; la phase globale native et son état lumineux ne sont pas enregistrés dans ces références. Les images et le rapport `native-web-red-crystal-comparison-v1.json` restent privés.

Les masques utilisent un écart RGB maximal supérieur à32 par rapport au fond de chaque image. L'intersection/union mesure la superposition des silhouettes, pas la fidélité globale du jeu.

| Pose (secondes du clip) | Intersection/union | Écart des centres (pixels) | Écart RGB moyen normalisé |
|---|---:|---:|---:|
| idle0 |0.99815|0.00697|0.07162|
| walk0.25 |0.99880|0.01500|0.07776|
| walk0.75 |0.99866|0.00866|0.07899|
| hit0.25 |0.99172|0.23010|0.07611|
| fire0.25 |0.99403|0.12517|0.08074|
| punch0.5 |0.99610|0.13933|0.07470|

Ces six rendus n'ont produit aucune erreur GL. Ils remplacent la précédente mesure à quatre poses, dont l'antialiasing et l'alignement différaient : l'amélioration numérique ne doit donc pas être attribuée uniquement au modèle. Le tir additif pendant la marche a également été observé dans le navigateur, mais ne fait pas partie de ces six comparaisons isolées.

Le matériau Web présente maintenant les stries rouges/noires récupérées, mais les lumières additionnelles, le brouillard local du personnage, les effets de focus, les ombres et le post-traitement restent incomplets. La différence RGB d'une pose a augmenté malgré cette amélioration structurelle : une phase non appariée empêche d'en faire un score global de fidélité. Aucune fidélité complète1:1 n'est revendiquée.


Les notes d'audit ci-dessous décrivent les constats antérieurs à ce raccord.
Le saut de caméra y mentionné a depuis été corrigé et vérifié dans le navigateur.

## Requalification après le merge #105 et audit SH-15 du 2 novembre 2026

**État des sources publiques relues :** `main` intègre désormais [#105](https://github.com/TGrozner/superhot-web/pull/105), puis [#102](https://github.com/TGrozner/superhot-web/pull/102). Le `File` privé `mesh6:g47` produit **trois** appels `renderer.drawPrivateMesh` (cargos `cargo-22`, `cargo-7`, `go1003`) avec translations explicites. Le second `File` `mesh7:g48` donne **un** draw supplémentaire. Il faut distinguer **2 fichiers locaux**, **4 draw calls indexés**, **3 placements de mesh6**, et **6 liaisons source MeshRenderer** au total; **4 draws ≠ 4 fichiers Mesh chargés**. Les compteurs `hiddenByPrivateMesh` dépendent du culling des proxies et ne sont pas un minimum fixe pour toutes les caméras. Utiliser `scripts/integration-vertical.mjs:assessContainersBrowserMetrics` déjà livré par SH-16 ; SH-15 ne duplique pas son validateur. Le harness navigateur de SH-10 conserve son propre périmètre ; **ne pas figer l'ancien critère `privateIndexedDraws===2`**.

**Nouvelle contre-lecture indépendante des données privées (aucune extraction publiée) :** recherche `superhot-research#63` artifact `13135277646`, `result.json` d'opération `bytes` réellement lu ; archive gzip analysée localement pour groupes `2_24`, `2_32`, `2_47`. Les trois groupes contiennent chacun **1 546 faces** et **2 402 sommets position référencés**. Après recentrage AABB par groupe, le parcours des **4 638 coins de triangles** est identique à précision `1e-4` simultanément sur position, UV0 et normales, **avec même ordre et winding**. Différences *maximales non arrondies* par composante : `g24↔g47` position **1.01e−6**, UV **0**, normales **0** ; `g32↔g47` position **2.00e−6**, UV **0**, normales **9.54e−7**. Recherche `#68` artifact `13136407658`, `result.json` SQL réellement relu : **6 Renderer→submesh**, `truncated=false`, incluant g24/32/47. Cette preuve **renforce la légitimité géométrique** du triple draw Web, sans prouver shader, matériau `fileID5:pathID3`, apparence native, FPS GPU ni exécution originale. Aucun asset, octet binaire, fichier original ou capture native publié. Ne créer aucun doublon de requête.

**Nouvel écart de caméra visualisable à vérifier par SH-05, identifié statiquement sans capture :** `CONTAINERS_BUILD28_DEMO_CAMERA = {x:11,y:7,z:31,yaw:0,pitch:-0.19}`, tandis que `src/main.js` applique `state.camera.z=clamp(next.z,-33.8,21.8)` après tout premier mouvement. La position initiale `z=31` est donc **9.2 unités hors de la limite**, d'où une correction prédite de **−9.2 unités en Z** à la première entrée directionnelle (à laquelle s'ajoute le pas demandé). `node scripts/visual-camera-boundary.mjs` produit ce diagnostic depuis la version de code réellement lue, avec verdict `...PREDICTED_NOT_OBSERVED` et tests unitaires. Il s'agit d'un **défaut de cadrage/mouvement Web potentiel**, pas d'une observation visuelle native ni d'un résultat de gameplay SH-10. SH-05 seul décide la correction des bornes dans ses fichiers partagés.

**Top 3 à SH-05, ordre d'action sans faux chiffres d'image :** (1) obtenir la capture Web réelle HUD-off, contrôles locaux de mesh6/mesh7 et journal de métriques `2 fichiers/4 draws` ; puis la capture MCD **avec caméra active et même pose/état** pour un vrai delta RGB/IoU ; (2) corriger le saut de caméra Web prédictible de **9.2 unités** avant toute capture reproductible en mouvement ; (3) calibrer la perspective Web théorique **64.66037°** vs caméra Unity *sérialisée* **60.00003°** (et near/far), puis couvrir les autres meshes/matériaux avant d'attribuer des écarts de couleur. **Aucune différence de pixels native/Web observée** et aucune parité 1:1 revendiquée.

**Blocage matériel de cette session :** la passerelle navigateur utilisateur n'a pas de contexte/extension accessible. Un essai **isolé** de Chromium headless depuis cet environnement contre un petit serveur HTTP local *synthétique* a répondu `net::ERR_BLOCKED_BY_ADMINISTRATOR` sur `Page.navigate` ; **aucune capture de l'application réelle n'a été obtenue**. Ni l'essai synthétique ni le succès des tests Node ne doivent être présentés comme une image MCD/Web.


## 2026-11-02 — P0 : ne PAS apparier le fallback Z et le package original X sans conversion

**Source indépendante :** [SH-04 #4](https://github.com/TGrozner/superhot-web/issues/4) et [SH-05 #5](https://github.com/TGrozner/superhot-web/issues/5) ont établi une divergence *de convention*, non une erreur numérique de moteur. Le fallback AABB `containers-build28.js` stocke des centres **déjà Z-réfléchis** et les transmet au graphe avec `coordinates:'web'`, donc **pas** de `mirrorZ` supplémentaire à cette étape. À l'inverse, le package original `native-scene-local.js` exige `browserWorld=H_X M_Unity H_X` où `H_X=diag(-1,1,1,1)`. La voie générique `graph.js:mirrorZ` est `H_Z M_Unity H_Z`, `H_Z=diag(1,1,-1,1)`, mais les proxies préconvertis ne l'appellent pas.

Pour un **même point natif identifié** : `p_package=R p_fallback`, `R=H_X H_Z=diag(-1,1,-1,1)`, soit une rotation de 180° autour de Y. Pour une **même matrice Unity complète et effectivement liée à la source**, `M_package=R M_fallback R`. La transformation complète ne peut **PAS** être reconstruite à partir de l'AABB du proxy. Ne pas appliquer R une deuxième fois au package **déjà** converti. Et **ne pas** inventer une pose native MCD depuis la caméra démo ou sa valeur `yaw` uniquement : la caméra doit être prouvée active puis convertie via sa matrice complète.

Exemple source-derived **de convention, pas d'observation pixel** : le centre fallback `cargo-22 (17.45, 2.575, 13.975)` correspond à `(-17.45,2.575,-13.975)` dans le package. Une comparaison naïve sans R conclurait à **44.712554 unités d'erreur de position**, entièrement artificielles. Ce nombre n'est **pas** une erreur visible mesurée en image : il démontre que le protocole pourrait disqualifier à tort une scène correcte.

Le module SH-15 autonome `scripts/visual-coordinate-frames.mjs` fournit un **précontrôle**, sans image ni source originale embarquée. Dans un répertoire privé, établir des paires réellement identiques par `owner,path_id`, sans mélanger les visuels AABB avec de vraies matrices. JSON minimal **fictif** pour illustrer l'interface, avec un point source déjà connu :

```json
{
  "schemaVersion": 1,
  "contract": "CONTAINERS_FALLBACK_Z_TO_PACKAGE_X",
  "pairs": [
    {
      "sourceKey": "SOURCE_KEY_PRIVEE_ET_QUALIFIEE",
      "kind": "serialized-object",
      "fallback": {
        "coordinates": "fallback-z-reflected",
        "position": [17.45, 2.575, 13.975]
      },
      "package": {
        "coordinates": "package-x-reflected",
        "position": [-17.45, 2.575, -13.975]
      }
    }
  ]
}
```

```bash
node scripts/visual-coordinate-frames.mjs --pairs /private/containers/qualified-coordinate-pairs.json
node --test tests/visual-coordinate-frames.test.mjs
```

Seules les valeurs **agrégées** `p95UnconvertedPositionDeltaWorldUnits`, `p95ConvertedPositionDeltaWorldUnits`, `completeMatrixPairs` et le verdict `SOURCE_POINT_FRAME_CONSISTENT_NOT_PIXEL_PARITY` sont imprimés ; ni identifiant ni matrice ni chemin privé ne sortent. Une erreur > tolérance donne le verdict `SOURCE_POINT_FRAME_MISMATCH_BLOCKS_PIXEL_REGISTRATION` et exit 2. Les matrices ne sont acceptées **que** quand les deux transformations originales complètes sont établies ; les centres de boîtes générées permettent un test **de point uniquement**. Aucun résultat d'image/pixel/matériau/silhouette ne découle de ce précontrôle.

**Contrat d'intégration exact SH-05 :** exporter, dans le diagnostic **privé** owner-local, une liste de paires `{sourceKey,kind,fallback,package}` uniquement pour des **identités source communes** ; qualifier le repère de chaque extrémité ; fournir les matrices des deux côtés seulement si les deux sont complètes et attestées (ajouter `matrixSource:'complete-serialized-transform'` ou `'executed-camera-transform'`). Exécuter ce précontrôle local **avant** les manifestes de `visual-compare.mjs`, puis utiliser la caméra effectivement rendue issue de `__superhotGetRenderedFrameSnapshot()` et la caméra native exécutée pour une vraie paire de PNG. Le précontrôle n'exige ni nouveau query corpus ni changement de `main/renderer/levels`.

**Classement VISUEL actuel, sans extrapolation :** (1) matériau/éclairage d'acteur isolé, RGB MAE masque union **0.0940–0.1022** *dans les quatre anciennes paires uniquement* ; (2) silhouette acteur isolé, IoU **0.9554–0.9615**, centros **0.63–0.81 px** *dans ces mêmes paires* ; (3) rendu scène Containers complet **non mesuré**, faute de paire native/Web authentifiée avec caméra active. La divergence de repère démontrée ici est un **risque de faux appariement**, pas un quatrième résultat visuel observé. La parité globale 1:1 reste **non vérifiée**.


## SH-15 — scorecard spatial PRIVÉ des écarts réellement visibles (2 novembre 2026)

**Nouveau module réservé :** `scripts/visual-region-scorecard.mjs`, tests `tests/visual-region-scorecard.test.mjs`. Il ne substitue ni le test gameplay SH-10, ni le comparateur global `visual-compare.mjs`, ni l'intégration SH-05. Il corrige un défaut d'interprétation important d'un simple RGB MAE : la comparaison brute confond les **différences de géométrie/silhouette** (pixels du fond à la place de l'objet) avec les différences de **matériau/éclairage** sur l'objet réellement visible. Le module rapporte les deux séparément pour chaque région **appariée à une identité de source**, sans fabriquer de masque ou de capture.

**Préconditions strictes :** deux manifestes déjà compatibles avec `visual-compare.mjs`, exactement le même `scene.id/buildIndex/stateId`, même viewport sRGB HUD-off, matrices `viewMatrix` et `projectionMatrix` équivalentes dans `matched-web`. La conversion de repère d'objets se fait *avant* ces manifestes avec `visual-coordinate-frames.mjs` ; **ne jamais** considérer la caméra Unity sérialisée comme une caméra native exécutée. Les masques locaux sont des PNG gris 8 bits aux dimensions des images, **un masque par côté** et par zone, où intensité >=128 sélectionne le sujet. Les régions identifiées par `actor`, `cargo`, `floor`, `architecture`, `shadow` exigent `sourceObjectId` présent **dans les deux** manifestes; `background` et `lighting` peuvent être des zones non associées à un objet. Le script refuse les masques vides, colorés, dépareillés et un même fichier masque natif/Web. Les fichiers restent sur le poste privé.

Fichier de régions **fictif**, à créer avec ses propres captures privées et identités communes (l'exemple ne contient aucun ID original) :

```json
{
  "schemaVersion": 1,
  "regions": [
    {"kind":"actor","slot":0,"sourceObjectId":"PRIVATE_MATCHED_ACTOR_ID","nativeMask":"actor-native.png","webMask":"actor-web.png"},
    {"kind":"cargo","slot":0,"sourceObjectId":"PRIVATE_MATCHED_CARGO_ID","nativeMask":"cargo-native.png","webMask":"cargo-web.png"},
    {"kind":"lighting","slot":0,"nativeMask":"lights-native.png","webMask":"lights-web.png"}
  ]
}
```

Les PNG de masques ci-dessus sont **relatifs au dossier du manifeste de leur côté**, pas au dossier du fichier régions. Commande entièrement hors ligne :

```sh
node scripts/visual-coordinate-frames.mjs --pairs /private/scene/source-pairs.json
node scripts/visual-region-scorecard.mjs --native /private/scene/native.json --web /private/scene/web.json --regions /private/scene/regions.json --out /private/scene/visual-regions-report.json
```

Le rapport agrégé comporte pour chaque `kind/slot` : paires d'objets présentes, erreur de translation dans le repère déjà aligné, aire native/Web, IoU et distance des centroïdes en pixels ; `materialIntersection.rgbMae01` et luminance **uniquement sur les pixels où les DEUX masques montrent l'objet** ; `silhouetteUnion.rgbMae01` sur l'union, qui comprend donc erreurs de contours et pixels du fond. Si l'intersection est vide, `materialIntersection=null` : ne jamais affirmer que deux matériaux ont été comparés. Les trois classements `topMaterialColorDifferences`, `topSilhouetteDifferences` et `topUnionColorDifferences` sont **séparés** car MAE RGB et (1−IoU) ne constituent pas une échelle unique de gravité perceptive. Aucune image, chemin privé, ID objet ou matrice native n'est contenu dans la sortie. L'exit code 2 marque les erreurs et les couples NON ENREGISTRÉS : sans registration, aucun pixel n'est lu.

**Contrat SH-05 exact :** produire pour la scène Containers/build28 une véritable paire **HUD off** PNG Web `captureContainersWeb` (lecture GPU sur frame identifiée), PNG MCD issu d'un **render exécuté**, matrice active native convertie vers la même convention que Web, FOV/aspect/near/far, `stateId` attesté pour les deux frames et manifestes avec quelques **identités de GameObjects communes**. Fournir pour chaque zone des masques **provenant de ces deux vraies captures**, pas un contour généré que l'on prétendrait original. Faire tourner le scorecard sur la machine privée ; partager seulement les **trois plus grands écarts réellement observés** avec métrique, zone, méthode et provenance. Les anciennes quatre paires d'acteur isolé (IoU 0.9554–0.9615 et RGB union 0.0940–0.1022, telles que rapportées dans la documentation précédente) ne sont PAS une mesure de la scène Containers entière. **Pas de seuil 1:1** proclamé sur ces valeurs.

**État du présent cycle :** le connecteur Browser refuse le contexte utilisateur (absence d'extension du navigateur d'origine). Les `result.json` privés existants de research **#8–#15** ont été téléchargés et inspectés, sans nouvelle demande au corpus : #10 contient **5 lignes de schéma SQLite, pas de capture**, #15 une lecture **110 lignes d'une spécification caméra, pas de caméra exécutée/capture**, les autres sont des lectures de spécifications, code ou contrats. Aucun de ces huit artifacts ne contient une paire de PNG MCD/Web identifiables. Les **tests synthétiques du module ne sont pas une observation visuelle réelle** ; aucune nouvelle erreur RGB/IoU Containers n'est mesurée. Avant toute généralisation 1:1, la paire caméra/état natif exécutée reste indispensable.


### SH-15 — état visuel prioritaire au 2 novembre 2026, après six comparaisons SH-05

Le `main` relu contient désormais le rapport **six** acteurs isolés idle/walk/hit/fire/punch rendu par SH-05 ; il **remplace comme référence récente** l'ancien rapport de quatre poses, mais AA, Red Crystal et protocole ont changé : **aucune amélioration quantitative causale ne peut être attribuée** à un correctif isolé. IoU rapportée **0.99172–0.99880**, centres **0.00697–0.23010 pixel**, erreur RGB moyenne normalisée **0.07162–0.08074**. La présente lane n'a pas relu les images natives ni `native-web-red-crystal-comparison-v1.json` privés ; ce sont **des mesures publiées par SH-05**, pas une nouvelle observation SH-15. Les images restent privées.

**Trois écarts VISUELS à corriger/qualifier par SH-05 :** (1) **matériau/éclairage Red Crystal isolé**, erreur RGB **0.07162–0.08074** selon pose (lumières/phases temporelles ne sont pas appariées) ; (2) **contour/silhouette isolée**, point le plus faible `hit0.25` IoU **0.99172**, centroïde **0.23010 px** ; (3) **occlusion, sols, lumière/ombres et post-traitement de toute la scène Containers**, **aucune** paire native/Web world-run appariée avec caméra exécutée — erreur RGB/IoU globale **inconnue**. Le nouveau scorecard par régions ne remplacera le point (3) qu'après capture et masques réellement obtenus. Parité MCD 1:1 **non vérifiée**.


## SH-15 — P0: rank real *screen-space impact* without mislabeling pose as material (2026-11-02)

The region scorecard now separates **visible footprint** from **relative error rate**. On genuine owner-private matched PNGs, two additional independent top-three lists are produced:

- `topAbsoluteSilhouetteDifferences`: per-region **symmetric-difference pixel count** (mask native XOR mask Web). Large objects with many genuinely displaced pixels rise above tiny objects with poor IoU but negligible image footprint.
- `topScreenWeightedUnionColorDifferences`: per-region `silhouetteUnion.rgbMae01 × unionPixels / (viewportWidth × viewportHeight)`. This is the fraction-weighted RGB contribution of **that one region** to the whole viewport. Overlapping regions are not additive, and this is **not** a perceptual SSIM score or a substitute for the exact global RGB metric.

Per-region output adds `symmetricDifferencePixels`, `sharedFractionOfSmallerMask`, `screenWeightedUnionRgbMae01`, `sourcePoseAligned`, `sourceMaxNonTranslationCoefficientDelta`, `materialMeasurementStatus`. The report adds `sourcePoseMismatchCount`. Existing normalized `topMaterialColorDifferences`, `topSilhouetteDifferences`, and `topUnionColorDifferences` remain for independent diagnostic use.

**Material provenance gate:** common source IDs alone cannot prove the surfaces were rendered at the same pose. After prior frame conversion and camera registration, a matched object's *full* 4×4 world matrices must agree within `1e-3` (world translation Euclidean and all nontranslation coefficients maximum); otherwise material-intersection RGB is **suppressed**, with `BLOCKED_SOURCE_POSE_MISMATCH`. The silhouette/union differences remain observable, classified as a possible pose/geometry/occlusion gap rather than claimed shader error. Even with aligned matrices, if the binary masks overlap by **<50% of the smaller visible area**, intersection RGB is suppressed with `BLOCKED_LOW_SHARED_SILHOUETTE_COVERAGE`: a tiny shared sliver is not a representative material sample. No shared pixels gives `NO_SHARED_SURFACE`. Eligible regions are marked `COMPARABLE_INTERSECTION_RGB`. This conservative overlap threshold is a **measurement policy**, not a source-derived MCD constant. Skin/bone pose differences can persist despite an aligned root matrix; do not interpret `sourcePoseAligned:true` as proof of identical vertex skinning.

**SH-05 wiring contract:** Do **not** change `main.js`, `renderer.js`, `levels.js` or create dummy native frames. Capture an actually rendered same-tick native camera and a same-scene Web GPU framebuffer as described above; provide private scene manifests with the real same-source object 4×4 matrices in a common coordinate frame plus per-source grayscale silhouette masks. Run existing `scripts/visual-coordinate-frames.mjs` first and then `scripts/visual-region-scorecard.mjs` locally. Share only the three highest *actual measured* screen-area, silhouette and mutually-visible material deficits, explicitly marking source-pose-mismatched regions as **not material-comparable**. SH-10 still owns gameplay acceptance. Old static `~60°` Camera7605 must not stand in for an executed native camera: SH-01's more recent private hierarchy evidence #129/#130 distinguishes `CameraLook18825` player branch from the `StandardCamera7605` branch under `CameraEffectManager`.

**Evidence boundary this cycle:** re-opened the eight original private artifacts research #8–#15 and inspected each real `result.json` (read operations with validated SHA of the returned text for #8/#9/#11–#15; #10 = 5 SQLite schema rows, `truncated:false`). These are source/metadata reads, not a synchronized native MCD frame. Browser tab access returned `Browser access requires the originating browser context`; no browser image, active native camera or Containers full-scene matched PNG was captured or scored. New tests use exclusively synthetic PNGs and matrices. Therefore this feature improves **classification of future real visual differences**, not measured MCD/Web fidelity today.
