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
