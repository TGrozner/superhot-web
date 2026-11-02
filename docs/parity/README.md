# SH-05 — Reproductible Web baseline (pas un certificat de parité)

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

Le rendu expérimental est activé **uniquement** par `?scene=synthetic`
(exemple en local : `http://localhost:4173/?scene=synthetic`, adapter le port du
serveur). Sans ce paramètre, la progression, la géométrie et les draw calls
hérités restent inchangés.

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
également sans `?scene=synthetic`. Ne pas annoncer de FPS, de réduction de
draw calls ou de fidélité visuelle sans cette mesure.

Cette préparation est un **contrat de rendu autonome** ; les données réelles de
scène et les mesures natives sont toujours `INCONNUES`. Les comparaisons
avec les 354+ tests Node Web verts restent strictement côté prototype.
