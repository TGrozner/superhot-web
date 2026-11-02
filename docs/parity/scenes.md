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
