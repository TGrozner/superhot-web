# SH-04 — scènes, transforms et rendu (état initial)

**Statut : infrastructure testée, fidélité MCD non établie.** Ce dépôt public ne contient ni asset extrait, ni shader original, ni résultat brut du corpus privé. Aucun objet, placement, matériau ou niveau du jeu original n'est revendiqué comme reproduit.

## Sources et niveau de preuve

- La passerelle autorisée de TGrozner/superhot-research décrit un corpus privé Unity indexé dans resources/pass-01/corpus.sqlite, avec notamment des tables objects, hierarchy, scenes, serialized, sources, pointers. **PROUVÉ comme interface d'inventaire**, pas comme reconstruction fonctionnelle.
- La requête de contrôle dans le run privé 41367631061 (2026-11-02, operation=query, objets de types Camera/AnimationClip/NavMeshData) a réussi. **PROUVÉ : interrogation du corpus opérationnelle**. Les résultats restent dans l'artifact privé ; ils ne sont pas recopiés ici. Ces objets n'établissent aucun placement ni rendu fidèle.
- Pour les scènes réellement utilisées, les transforms sérialisés, les overrides de prefab, les références (owner,path_id), les dépendances mesh/material/shader et les observations in-game : **INCONNU / À MESURER**. Une valeur par défaut d'un script ne suffit pas à prouver la valeur effective du prefab.
- L'approche quaternion/TRS et conversion du signe Z dans src/scenes/graph.js est une **convention d'adaptation testée sur cas synthétiques**, pas une validation native sur MCD. Un test Unity↔Web devra confirmer convention, unités et orientation des rotations avant exploitation de données natives.

## Ce qui est livré

- src/scenes/graph.js : identité de références Unity composée (owner,path_id), multiplication 4x4 en convention column-major, TRS hiérarchiques avec protection contre cycles/doublons, réflexion Z et boîtes englobantes avec rotation, shear, échelles négatives.
- src/visual/scene-plan.js : palette **originale et synthétique** sans shader commercial, culling conservateur par sphère et frustum, tri par matériau. Produit des paquets pour futur rendu affine ou des paramètres directement compatibles avec renderer.box() **pour les boîtes strictement axis-aligned seulement**. Les rotations ne sont **jamais** aplaties silencieusement.
- tests/scene-*.test.mjs : contrôle des transformations, parents, visibilité, culling et compatibilité des commandes. Aucun test ne lance le jeu original ou ne garantit un rendu 1:1.

## Contrat d'intégration

Le coordinateur SH-05 conserve l'exclusivité de src/main.js, src/renderer.js, src/levels.js. Pour raccorder un niveau généré, il peut appeler buildSceneGraph(nodes, {coordinates:'web'}), puis planSceneDraws(graph, camera), puis renderer.box(...packet.legacyBoxArgs) **uniquement** si legacyBoxArgs !== null. Le nombre affineRequired indique les transformations non supportées par le renderer actuel ; la prochaine étape est un uniform mat4 et une normal matrix pour gérer toute la hiérarchie, puis la comparaison native.

La palette et les formes actuellement disponibles sont des substitutions, pas des interprétations de matériaux du jeu. Les surfaces transparentes nécessiteront en plus un tri de profondeur / pipeline séparé.

## Recherches privées prioritaires (sans publier les réponses)

1. Identifier schémas et clés de scenes, hierarchy, objects, serialized via SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name. Réduire le périmètre à une scène MCD précise avec preuves de chargement/exécution.
2. Rattacher chaque Transform à son GameObject via (owner,path_id), inspecter parent chain, m_LocalPosition, m_LocalRotation, m_LocalScale, overrides et nested prefabs.
3. Suivre MeshFilter/MeshRenderer/SkinnedMeshRenderer, material slots, shader GUID et paramètres sérialisés, mais ne produire publiquement que des métadonnées et des substitutions générées autorisées.
4. Valider un petit jeu de repères en comparaison native (axes, échelles, orientation, clips caméra) puis formaliser la tolérance numérique. Les screenshots d'analyse restent dans le corpus privé.
5. Mesurer p95 frame time, nombre de draw calls et objets visibles sur WebGL2 dans une scène reproduite de façon autorisée ; sans capture native, **aucun verdict visuel 1:1**.

## Limites de performances

Le culling actuel est volontairement conservateur et CPU. Le tri par couleur n'est **pas** de l'instancing GPU ; le renderer existant reste une draw call par primitive. Le test synthétique contrôle la réduction du nombre de paquets, pas un gain FPS. Pour les assets plus complexes, instancing, occlusion et cache de hiérarchie devront être mesurés avant optimisation.


## Tranche de garde WebGL2 — échelles reflétées (2026-11-02)

- **PROUVÉ (source Web, pas MCD)** : `src/renderer.js`, blob SHA `b16ba3a9a430fe24f3c1f7e86355cee277a32189`, lignes 28 et 35, applique `uScale` aux positions mais n'applique pas le signe de `uScale` aux normales. Les faces d'une boîte reflétée peuvent donc recevoir un éclairage incorrect. Le code de SH-04 refuse désormais `legacyBoxArgs` si une diagonale de la matrice monde est nulle ou négative ; le paquet affine reste disponible. Scénarios réfutables : reflets selon chacun des axes et axe de taille nulle sont non legacy ; échelles positives non uniformes restent legacy. Voir `tests/scene-legacy-scale.test.mjs`. Une scène à rotation/shear était déjà refusée par ce chemin.
- **PROUVÉ (source Web, pas MCD)** : le shader Web actuel fixe `f=1.58`, `near=.045`, `far=120` dans `src/renderer.js` lignes 31–34, même blob. Les valeurs par défaut du frustum SH-04 visent donc **ce renderer précis**. Tout changement du shader doit entraîner un test de cohérence, sinon le culling pourrait devenir incorrect.
- **OBSERVÉ (passation privée uniquement)** : l'artifact `TGrozner/superhot-research`, run `41368361512`, artifact `13108420851`, `result.json → HANDOFF.md` lignes 59–65 et 84–88, build MCD `20299547`, Assembly-CSharp SHA-256 `ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257`, décrit l'index Unity et les exports convertis. **Ce sont des assertions du rapport, non une vérification de scène, de renderer ou de shader MCD en exécution**. La conversion OBJ y est signalée comme non équivalente à la géométrie Unity native (ligne 78), donc aucune reconstruction Web ne peut prendre ces exports pour des maillages/skins certifiés identiques.
- **INCONNU (natif)** : objet actif, hiérarchie instanciée, coordonnées, visibilité, slots matériaux, variantes de shader, paramètres effectifs, performances GPU et écart de rendu pour une scène MCD. Réfutation minimale : lecture ciblée privée de `scenes`, `hierarchy`, `objects`, `serialized`, `sources` avec jointures `(owner,path_id)`, puis capture/mesures natives d'une scène effectivement chargée. Aucune lecture SQL supplémentaire n'a été déclenchée ici.
- **OBSERVÉ (technique)** : le test synthétique à 1000 boîtes vérifie les *comptages* de soumission CPU après culling et la séparation `affineRequired`/`estimatedLegacyDrawCalls` ; il ne mesure pas `p95` frame time, appels GPU effectivement émis, draw-call reduction grâce à l'instancing, ni FPS WebGL2. Ces mesures restent à faire dans un navigateur avec le raccord SH-05.

**Blocage passerelle** : `.github/workflows/corpus-query.yml` du dépôt privé reste limité à `workflow_dispatch`. Ce connecteur permet de lire workflow et artifacts préexistants, mais ne propose pas ici de dispatch autorisé. Demande minimale à exécuter par un détenteur du droit de dispatch, dans le dépôt **privé uniquement** :
`{"operation":"query","sql":"SELECT name,sql FROM sqlite_master WHERE type='table' AND name IN ('scenes','hierarchy','objects','serialized','sources') ORDER BY name"}`.
Il faut ensuite une requête bornée sur une scène MCD identifiée, sans sortie brute/asset dans le dépôt public. Cette absence de dispatch n'est pas un échec de recherche ni une preuve que les données manquent.
