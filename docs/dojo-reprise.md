# Dojo — reprise après stabilisation

## Décision de livraison

À la demande du propriétaire, priorité à une version stable sur `main`, plutôt qu’à publier les raccordements 1:1 inachevés. La base conservée est `af46193a6f8d33889eb940dda032988a365fcc3d` (`feat: wire source-backed Dojo encounters, collisions and pickups`), augmentée des sons source et de cette documentation. **La vertical slice 1:1 n’est pas terminée.**

Cible exacte : **SUPERHOT: MIND CONTROL DELETE**, Steam AppID `690040`, build `20299547`, Unity `2018.4.14f1`, scène `SHRL_Dojo2`, build index `10`, fichier sérialisé `level10`. Ne pas confondre avec SUPERHOT original ni avec Containers.

## Ce qui reste actif sur le localhost de base

- Géométrie originale du Dojo : 178 éléments rendus, 312 boîtes de collision sélectionnées, navigation et trois portes source. La sélection tient compte des deux observations du replay ; ne pas réintroduire tous les objets désactivés de la scène sérialisée.
- Masques de collision distincts joueur/ennemi/projectile/objet. La couche 21 bloque le joueur, pas les ennemis entrant par les portes.
- Rencontre au pistolet, objectif source de 6–7 éliminations selon le tirage, quatre ennemis simultanés au maximum. Ce n’est pas encore la sélection native complète des armes et comportements.
- Bols, tasses, bouteilles, bonsaïs, éventails, shurikens et katanas : prise, lancer, impacts et fragments d’origine. Objets contondants : étourdissement/désarmement ; objets tranchants : élimination et récupération après fixation.
- Katana tenu dans sa pose de repos source ; pose ennemie figée à la mort. Pas de mains animées ni de chute physique native.
- Audio source : prise/lancer/bris des objets, étourdissement, contact du katana et trois ambiances de porte. Le son de porte est une boucle continue liée à la distance, **pas** un avertissement ponctuel de spawn. Les groupes audio source déterminent quels sons suivent le ralentissement du monde.
- Aucun interrupteur de fonctionnalité supplémentaire. Démarrer `node server.mjs`, puis ouvrir `http://localhost:4173/`.

Les originaux restent sous `private/`, exclus de Git. Le dépôt public ne fournit ni modèles commerciaux ni code décompilé. Sans configuration privée, il ne faut pas présenter les salles générées comme le jeu original.

## Vérifications réellement effectuées pour cette livraison

`npm run check` : **1 058 tests réussis, aucun échec ni test ignoré**.

Scénario dans Chromium sur le vrai localhost, par commandes souris/clavier, sans déplacement artificiel des personnages :

1. Ouverture du Dojo et démarrage du combat ; trois sources d’ambiance WebAudio actives.
2. Déplacement jusqu’à la tasse `pickup_6606`, prise avec `E` ; lecture démarrée de `AC_Melee_pickup`, `sharedassets0.assets:614`.
3. Lancer avec `F` ; lecture démarrée de `AC_Throwable_Item_Throw`, `sharedassets0.assets:627`.
4. Bris de la tasse, 25 fragments affichés ; lecture spatialisée de `AC_Level_Shatter`, `resources.assets:1768`.
5. Pause puis nouvelle partie : tasse rétablie, aucun objet tenu, exactement trois sources natives/ambiances, sans accumulation.
6. Aucune erreur JavaScript collectée pendant ce scénario ; capture visuelle du Dojo et des fragments examinée.

Cela prouve le déclenchement et le décodage dans WebAudio, **pas une écoute sur les haut-parleurs physiques**. Les nouveaux raccordements d’étourdissement et de contact katana ne sont pas prouvés par ce scénario navigateur. Aucune victoire complète n’a été vérifiée. Les tests ne prouvent ni la parité graphique ni l’équivalence avec Unity PhysX.

La livraison précédente avait exercé entrées ennemies, escaliers, bol, shuriken récupérable, katana, récupération/tir au pistolet et mort/reprise ; ne pas transformer ces observations en preuve d’une partie entière terminable.

## Sauvegarde des travaux non publiés

Archive locale, **à conserver privée** :

`C:/dev/superhot-web/private/checkpoints/dojo-fidelity-before-stabilization/work-in-progress.zip`

- 43 entrées, 230 079 octets ; contrôle CRC de l’archive réussi.
- SHA-256 : `7c9358d4eacb0bbf05d75bd46c0068faa4b9dc078b55fc6b8c925e225d3e349c`.
- Contient `checkpoint.json`, `tracked-changes.patch`, les fichiers publics modifiés/créés et les outils privés de cette passe.
- Base du patch : `af46193a6f8d33889eb940dda032988a365fcc3d`.
- **Ne pas appliquer le patch entier sur le nouveau main.** Il contient aussi la version audio désormais intégrée et des raccordements partiels de `src/main.js`. Extraire ailleurs, comparer au code courant, reprendre un lot à la fois.
- Le `extract.py` archivé active tous les lots inachevés. L’exporteur actuellement présent dans le corpus a volontairement été réduit au lot audio vérifié. Ne pas le remplacer aveuglément.

Travaux conservés dans l’archive mais retirés du code actif :

| Lot | Fichiers à reprendre | Prérequis / limite |
| --- | --- | --- |
| Mains et katana animés | `src/characters/native-player-animation.js`, modifications de `native-skin-pass.js` et du renderer ; outil privé `player_animation.py` | Raccorder l’horloge, les événements et le rendu première personne ; vérifier les vrais clips visuellement |
| HUD source | `src/render/native-hud.js`, `dojo_hud.py` | Textures et rendu encore non intégrés au lot stable |
| Mort et fragments | `src/animation/native-death-runtime.js`, `src/vfx/native-fragment-physics.js`, `extract_death_physics.py` | Solveur Web expérimental, pas PhysX ; raccordement des paramètres physiques/bornes géométriques incomplet |
| Armes et apparitions ennemies | `src/combat/native-enemy-weapons.js`, `native-initial-spawn.js`, `src/animation/native-melee-events.js`, `enemy_weapons.py`, `enemy_weapon_animation.py` | Capture des familles d’animations préparée mais non exécutée ; raccordement du runtime incomplet |
| Lumières de porte | `src/sound/mcd-door-warning.js` et son test | Courbes source récupérées ; pas de rendu intégré. Ne pas confondre lumière d’avertissement et ambiance audio |

Les tests de ces lots ont été archivés avec eux, pas conservés dans la suite active. Ils ne constituent pas une validation de leur intégration.

## Où se trouvent les données

Corpus principal : `C:/dev/superhot-web/private/analysis/2026-11-02-mcd`.

- Commencer par `HANDOFF.md` et `delivery-status.json` pour l’état général du reverse engineering.
- SQLite récupéré : `resources/pass-01/corpus.sqlite`.
- Scène locale active : `rendering/closure/browser-scene-level10/package.json.gz`.
- Exporteur et nouveaux outils privés : `rendering/closure/browser-scene/`.
- Replays de référence : `runtime/dojo-replay-01/scene.json` et `runtime/dojo-replay-02/scene.json`.
- Rig actif : `spec/animation/enemy-merged-browser/enemy-merged-animated-v9.json` ; ne pas perdre ses clips/couches déjà vérifiés en important une nouvelle capture.
- Liste blanche du serveur : `C:/dev/superhot-web/private/browser-assets.json`, objet plat d’identifiants vers chemins relatifs à `private/`. Le serveur doit être redémarré après modification.

L’exporteur `dojo_audio.py` réutilise les arbres et WAV déjà récupérés, sans nouvelle injection dans le jeu. Il produit 16 identifiants `audioNative_*`. Le serveur n’admet que les propriétaires `resources_assets` et `sharedassets0_assets`, via des chemins privés configurés et les protections d’origine existantes.

Commande exécutée avec succès depuis la racine du dépôt :

```powershell
python private/analysis/2026-11-02-mcd/rendering/closure/browser-scene/extract.py --scene-build-index 10 --bridge-dir private/analysis/2026-11-02-mcd/rendering/closure/scene-render-bridge-level10 --output-dir private/analysis/2026-11-02-mcd/rendering/closure/browser-scene-level10 --runtime-snapshot private/analysis/2026-11-02-mcd/runtime/dojo-replay-01/scene.json --runtime-variant-snapshot private/analysis/2026-11-02-mcd/runtime/dojo-replay-02/scene.json
```

Le paquet généré pour cette livraison fait 3 504 085 octets, SHA-256 `1acfb33298ce76345365888ca0d0dee8e6f2fb800f738d490d2ac8d592718622`. Les chemins `browserAssets` renvoyés par l’exporteur sont actuellement mixtes : certains commencent par `private/`, les nouveaux sons sont déjà relatifs à `private/`. Ne pas recopier ce dictionnaire tel quel ; normaliser vers le format de la liste blanche.

## AssetRipper : utile, mais pas un jeu Web complet

Export complet existant :

`C:/dev/superhot-unity-poc/AssetRipperFull/ExportedProject`

Inventaire inspecté : 77 scènes, 511 clips, 15 contrôleurs, 271 prefabs, 265 matériaux, environ 3,86 Go. **Une autre session travaille dans ce dépôt** : coordonner avant toute écriture ou compilation concurrente.

Lors de l’inspection, le rapport `evidence/assetripper-webgl-build.json` signalait `Failed`, 80 erreurs et 599 avertissements. Les shaders du grand export étaient des remplacements `Dummy` ; le journal de compilation mentionnait notamment Mono.Cecil/Mono.Cecil.Mdb. Relire `VERDICT.md`, `BUILD_LOG.md` et les rapports actuels, car l’autre session peut avoir avancé.

Le petit prototype Unity WebGL existant fonctionne avec adaptation du gameplay, matériaux Standard et animation d’exemple : cela ne prouve pas que le jeu original exporté fonctionne. Ne pas remplacer le localhost JS avant d’avoir démontré le vrai joueur, un ennemi, le combat et le contrôleur d’animation dans le build WebGL complet.

### Pièges source déjà résolus

- Mains : utiliser la hiérarchie configurée **dans la scène Dojo**, pas `GameObject/bHands.prefab` seul. Animator `6333` → `AnimCtrl_PlayerMain`, HandManager `6545`, renderer `6378`, weapon-bone GameObject `1435` / Transform `2896`.
- Le pistolet source ne montre pas de mains le tenant ; prise/recul pilotés par DOTween. Ne pas inventer une pose de prise pour « corriger » cette absence.
- Katana : les trois références de sons de swing sont nulles. Ne pas leur substituer un son imaginé. Les clips complets sont récupérés, mais leur lecture n’est pas encore intégrée.
- Mort : bon prefab `EnemyMergedForPooler.prefab`, 22 corps, 21 articulations, 18 colliders de membres. L’autre prefab `EnemyMerged` comporte des listes runtime vides. `_Omni.feetWeight=1` remplace les masses des corps 4/8 par 20, traînée 0,1 ; boîtes des pieds désactivées.
- La factory de porte `6563` utilise une arme basée sur la difficulté et l’archétype `KamperOffensive`. La population initiale doit venir des `SpawningAreas` et du départ joueur choisi, pas des marqueurs de porte.
- Animations MG/sniper : paramètre Weapon 1, mélange pistolet 0 / shotgun 2. Attaque katana normale : clip 424, malgré son nom associé au baseball. Les noms de fichiers seuls ne sont pas une autorité suffisante.

## Ordre de reprise recommandé

1. Finir une partie complète du Dojo avec les règles actuelles et vérifier victoire/reprise ; noter les éventuels blocages de collision ou d’interaction avant d’élargir le contenu.
2. Reprendre **mains/katana et HUD**, lot visuel immédiatement perceptible, depuis les fichiers archivés et l’export AssetRipper. Comparer les mêmes poses/caméras au replay natif.
3. Capturer puis intégrer les familles d’armes/animations ennemies et les vrais spawns initiaux. `enemy_weapon_animation.py` prépare 24 séquences à 120 Hz ; le sampler et le pont Frida sont archivés mais **pas exécutés ni validés**. Revérifier PID, architecture, build et nettoyage avant toute capture ; ne pas relancer ou modifier le jeu du propriétaire sans nécessité.
4. Reprendre morts/fragments avec collisions, puis lumière des portes. Ne pas présenter le solveur JavaScript comme PhysX.
5. Ajuster éclairage, matériaux, post-traitement et composition finale à partir de comparaisons visuelles cadrées. La parité des shaders, éclairages, corps et animations reste ouverte.

Pour les agents Web, envoyer des contrats séparés avec fichiers propriétaires et critères visibles ; ne pas recréer les lots archivés ni faire travailler plusieurs agents sur `main.js`. Les originaux et outils contenant des données privées ne doivent jamais être joints au dépôt public. Un accès au corpus privé doit passer par le canal privé autorisé, pas par un commit public.
