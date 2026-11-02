# SH-15 — Comparaison visuelle MCD ↔ Web (protocole, **pas** un certificat 1:1)

**État au 2 novembre 2026 :** comparateur et tests sur PNG synthétiques, et audit analytique de projection ; **aucune paire native/Web réellement capturée**. La cible est SUPERHOT: MIND CONTROL DELETE (MCD), **Containers / buildIndex 28**, et non le SUPERHOT original. SH-15 ne touche qu'à `scripts/visual-*`, `tests/visual-*` et ce document. SH-05 conserve le raccord runtime partagé ; SH-10 conserve la validation gameplay.

## Les trois priorités visuelles à SH-05 — mise à jour après #98

**Aucune différence sur captures natives/Web n'a encore été mesurée.** Les écarts ci-dessous sont des différences de **code / paramètres / couverture** constatables sans image, pas un score de fidélité perceptuelle.

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

La racine a été exercée dans Chromium/WebGL2 avec 360 instances de décor,185037 triangles,68 meshes,17 textures, personnage original skinné et pistolet original. Marche, pause et impact ont été exercés ; l'impact utilise une caméra de scénario contrôlée, pas une assertion sur un parcours natif. Aucune erreur GL n'a été observée.

Quatre références isolées ont été rendues dans le moteur MCD original : idle0, walk0.25, walk0.75 et hit0.25, à960×540, caméra(0,1.15,4), orientation vers−Z et même projection. Leurs62 poses locales ont été revalidées contre l'échantillonnage natif (écart maximal observé0). La référence utilise `SkinnedMeshRenderer.BakeMesh` et les matériaux originaux afin d'éviter le cache de skinning d'une capture immédiate. Le Web utilise son véritable pass de skinning GPU, sans redimensionnement des images.

Les masques de silhouette, définis par un écart RGB maximal supérieur à32 par rapport au fond, donnent une intersection/union de **0.9554 à0.9615** ; les centres diffèrent de **0.63 à0.81 pixel**. La différence RGB moyenne normalisée sur l'union du personnage est **0.0940 à0.1022**. Ces nombres sont limités aux quatre vues isolées ; l'antialiasing diffère. **Ils ne sont pas un pourcentage de fidélité du jeu.**

Écarts visibles restant établis : (1) matériau rouge cristallin natif contre lumière/couleur Web simplifiées ; (2) contours/antialiasing différents ; (3) absence du contexte de lumière, ombres et post-traitement d'une vraie frame de gameplay Containers. Aucun rendu complet1:1 n'est revendiqué.


Les notes d'audit ci-dessous décrivent les constats antérieurs à ce raccord.
Le saut de caméra y mentionné a depuis été corrigé et vérifié dans le navigateur.

## Requalification après le merge #105 et audit SH-15 du 2 novembre 2026

**État des sources publiques relues :** `main` intègre désormais [#105](https://github.com/TGrozner/superhot-web/pull/105), puis [#102](https://github.com/TGrozner/superhot-web/pull/102). Le `File` privé `mesh6:g47` produit **trois** appels `renderer.drawPrivateMesh` (cargos `cargo-22`, `cargo-7`, `go1003`) avec translations explicites. Le second `File` `mesh7:g48` donne **un** draw supplémentaire. Il faut distinguer **2 fichiers locaux**, **4 draw calls indexés**, **3 placements de mesh6**, et **6 liaisons source MeshRenderer** au total; **4 draws ≠ 4 fichiers Mesh chargés**. Les compteurs `hiddenByPrivateMesh` dépendent du culling des proxies et ne sont pas un minimum fixe pour toutes les caméras. Utiliser `scripts/integration-vertical.mjs:assessContainersBrowserMetrics` déjà livré par SH-16 ; SH-15 ne duplique pas son validateur. Le harness navigateur de SH-10 conserve son propre périmètre ; **ne pas figer l'ancien critère `privateIndexedDraws===2`**.

**Nouvelle contre-lecture indépendante des données privées (aucune extraction publiée) :** recherche `superhot-research#63` artifact `13135277646`, `result.json` d'opération `bytes` réellement lu ; archive gzip analysée localement pour groupes `2_24`, `2_32`, `2_47`. Les trois groupes contiennent chacun **1 546 faces** et **2 402 sommets position référencés**. Après recentrage AABB par groupe, le parcours des **4 638 coins de triangles** est identique à précision `1e-4` simultanément sur position, UV0 et normales, **avec même ordre et winding**. Différences *maximales non arrondies* par composante : `g24↔g47` position **1.01e−6**, UV **0**, normales **0** ; `g32↔g47` position **2.00e−6**, UV **0**, normales **9.54e−7**. Recherche `#68` artifact `13136407658`, `result.json` SQL réellement relu : **6 Renderer→submesh**, `truncated=false`, incluant g24/32/47. Cette preuve **renforce la légitimité géométrique** du triple draw Web, sans prouver shader, matériau `fileID5:pathID3`, apparence native, FPS GPU ni exécution originale. Aucun asset, octet binaire, fichier original ou capture native publié. Ne créer aucun doublon de requête.

**Nouvel écart de caméra visualisable à vérifier par SH-05, identifié statiquement sans capture :** `CONTAINERS_BUILD28_DEMO_CAMERA = {x:11,y:7,z:31,yaw:0,pitch:-0.19}`, tandis que `src/main.js` applique `state.camera.z=clamp(next.z,-33.8,21.8)` après tout premier mouvement. La position initiale `z=31` est donc **9.2 unités hors de la limite**, d'où une correction prédite de **−9.2 unités en Z** à la première entrée directionnelle (à laquelle s'ajoute le pas demandé). `node scripts/visual-camera-boundary.mjs` produit ce diagnostic depuis la version de code réellement lue, avec verdict `...PREDICTED_NOT_OBSERVED` et tests unitaires. Il s'agit d'un **défaut de cadrage/mouvement Web potentiel**, pas d'une observation visuelle native ni d'un résultat de gameplay SH-10. SH-05 seul décide la correction des bornes dans ses fichiers partagés.

**Top 3 à SH-05, ordre d'action sans faux chiffres d'image :** (1) obtenir la capture Web réelle HUD-off, contrôles locaux de mesh6/mesh7 et journal de métriques `2 fichiers/4 draws` ; puis la capture MCD **avec caméra active et même pose/état** pour un vrai delta RGB/IoU ; (2) corriger le saut de caméra Web prédictible de **9.2 unités** avant toute capture reproductible en mouvement ; (3) calibrer la perspective Web théorique **64.66037°** vs caméra Unity *sérialisée* **60.00003°** (et near/far), puis couvrir les autres meshes/matériaux avant d'attribuer des écarts de couleur. **Aucune différence de pixels native/Web observée** et aucune parité 1:1 revendiquée.

**Blocage matériel de cette session :** la passerelle navigateur utilisateur n'a pas de contexte/extension accessible. Un essai **isolé** de Chromium headless depuis cet environnement contre un petit serveur HTTP local *synthétique* a répondu `net::ERR_BLOCKED_BY_ADMINISTRATOR` sur `Page.navigate` ; **aucune capture de l'application réelle n'a été obtenue**. Ni l'essai synthétique ni le succès des tests Node ne doivent être présentés comme une image MCD/Web.
