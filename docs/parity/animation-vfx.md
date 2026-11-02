# SH-06 — Animation et VFX : registre de preuve

**Périmètre :** SUPERHOT: MIND CONTROL DELETE (Steam app `690040`), pas SUPERHOT 2016. Ce document accompagne les primitives Web indépendantes. Il ne constitue **pas** une certification de parité native.

## Preuves disponibles au 2026-11-02

| Statut | Assertion précise | Source et limite |
| --- | --- | --- |
| **PROUVÉ — inventaire seulement** | La requête privée de base Unity a retourné `AnimationClip: 511` éléments. | `TGrozner/superhot-research`, Actions run `41367631061`, artifact `corpus-result/result.json`, opération `query`, base `resources/pass-01/corpus.sqlite`, colonnes `type,count`. Cette valeur ne prouve ni quelles animations sont jouées, ni leurs transitions, ni leur rig. |
| **PROUVÉ — intégrité de snapshot** | L'opération `status` a retourné `files: 511`, `allMatched: true`, extraction terminée `2026-11-02T00:05:57.026Z`. | Run privé `41367571984`, `result.json`. Les 511 fichiers du snapshot ne sont **pas** les 511 `AnimationClip` : catégories distinctes, nombres seulement égaux. |
| **OBSERVÉ — prototype Web préexistant** | Dans `src/main.js`, `shatterAt` génère des fragments pseudo-aléatoires; `update` les fait avancer. | `TGrozner/superhot-web`, `src/main.js` à `9f01f92411b4e125b2c992deee53602a8c67c416`. Ce comportement appartient à FRAME//BREAK, non au jeu commercial. |
| **INCONNU — natif** | Rigs/squelettes réellement actifs, durées des clips, blend trees, transitions, animation events, conditions de fracture, topologie des shards, trajectoires et effets shader. | Les compteurs d'inventaire Unity ne permettent pas de conclure. Nécessite données sérialisées ciblées + chaînes IL et observations runtime. |

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
