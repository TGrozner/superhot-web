# SH Web — instructions communes aux agents

**État vérifié le 3 novembre 2026 : le Dojo SHRL_Dojo2 (build index 10) est accessible en standalone sur GitHub Pages.** Thomas a confirmé que la démo fonctionne depuis le site public : https://tgrozner.github.io/superhot-web/ . Déploiement initial validé sur `main`, commit `876a2cdde01845b685a81ccf818d965c78fb0c56` (historique, **toujours relire HEAD**). Ce fait ne prouve **pas** une parité native 1:1.

## Invariants de livraison

- **Public = autonome.** Le navigateur doit charger le code et les assets de la même origine, sous `/superhot-web/` sur Pages. Pas de connexion au PC de Thomas, pas de tunnel Cloudflare, pas de dépendance runtime à `private/` ou à un serveur Node. `npm start` reste un outil de développement local.
- Le pack hébergé a été généré avec `scripts/vendor-dojo-assets.mjs`, puis publié avec `scripts/publish-dojo-pages.mjs` ; `local-assets/manifest.json` répertorie **52 assets source-qualifiés**, avec noms, tailles et SHA-256 (47 872 002 octets au premier export). `local-assets/` est désormais **commité dans le dépôt public**. Ne pas supposer qu'un asset local supplémentaire est déjà disponible sur Pages.
- **Aucun fallback « Roblox ».** Si la scène, les personnages, les textures, les rigs ou les animations indispensables sont absents ou invalides, erreur explicite et arrêt du chargement. Ne pas remettre en service les anciennes salles générées ou les colliders/proxies comme fausse scène principale. Toute nouvelle scène/feature doit conserver ce garde-fou.
- **Code-only :** intégrer sur `main` après CI entraîne le redéploiement Pages par GitHub Actions, sans intervention PC. **Nouveaux assets / clips / textures :** intégrer un pack complet et cohérent avec le manifeste, vérifier les hashes et l'identité de scène, puis déployer les fichiers statiques correspondants ; une merge de code ne copie jamais `private/`.
- **Vérification :** contrôler CI SHA exact **et** workflow GitHub Pages, disponibilité du manifeste sur le site, et smoke navigateur Dojo (décor, modèles/rigs, input, tirs, F/E, victoire/rejouer) selon ce que la feature modifie. CI verte ≠ rendu testé. Lorsqu'un smoke manuel n'est pas fait, le signaler.
- **Propriété / licences :** le dépôt public et Pages exposent les octets des assets à toute personne qui ouvre le site. Ne pas y pousser d'exécutable original, code décompilé, données de recherche privées, secrets, chemins locaux ou nouveaux assets sans droits de redistribution vérifiés. L'autorisation de publier du code Web ne constitue pas une licence sur les assets commerciaux déjà présents.
- **Coordination :** SH-05 est responsable de `src/main.js`, `src/renderer.js`, fichiers d'intégration partagés et merge-train. Chaque agent reste dans son périmètre réservé, ouvre une branche/PR, et conserve le fonctionnement standalone. Pas de remplacement de la démo publique par une scène inventée. Privilégier les fonctionnalités visibles avec données source prouvées ; TypeScript strict sans `any` pour les modules migrés et JS généré conforme.
- Les outils locaux / runner de recherche ne servent **pas** les visiteurs. Les recherches restent privées ; réutiliser les preuves existantes, ne pas lancer un autre runner, ne jamais repackager automatiquement tout `private/`.

## Single source of truth — Dojo et ragdoll (migration 2026-11-03)

- **Une seule source à l'exécution :** `local-assets/manifest.json` + `local-assets/scenePackage.json.gz` + `local-assets/enemyRig.json`, identiques en local (`npm start`) et sur Pages. `private/` n'est qu'un **input de build**, jamais une source de gameplay de secours. Le navigateur refuse un manifeste non standalone ou une empreinte rig/physique non concordante.
- **Publication atomique et complète :** depuis le PC autorisé, `npm run sync:dojo` extrait les paramètres physiques source depuis le corpus privé et **reconstruit** `local-assets/`. `npm run publish:dojo` suit exactement le même chemin, vérifie la scène et la définition 22 Rigidbody / 21 joints + empreinte SHA-256 du rig, puis publie les assets statiques vers `main`. Aucun push de `private/`.
- **Bloquer le retour arrière :** `scripts/vendor-dojo-assets.mjs` refuse d'écraser `local-assets/` si la source physique est absente ; `scripts/publish-dojo-pages.mjs` refuse un ancien pack ; le workflow Pages exécute `verify-pages-pack.mjs --require-ragdoll`. La vérification de code PR reste indépendante tant que le pack canonique actuel n'a pas été migré. **Une CI code verte ne certifie pas la physique.**
- **Ordre de migration :** publier d'abord le pack enrichi à partir de la machine propriétaire (bootstrap possible avec les scripts `prepare-dojo-ragdoll.mjs` puis `publish-dojo-pages.mjs` de l'ancien `main`), puis fusionner la PR de garde-fous runtime. Tant que le pack 52-assets historique n'est pas remplacé, tout nouveau déploiement Pages doit échouer sans remplacer la version servie. Ne pas contourner ce verrou.
- **Respect de la propriété :** un `--publish` rend tout le contenu du pack accessible publiquement. Exiger une autorisation de redistribution pour chaque asset ; aucun export automatique de toute la recherche.

## Liens et commandes

- Site : https://tgrozner.github.io/superhot-web/
- Déploiements : https://github.com/TGrozner/superhot-web/actions
- Documentation détaillée : [docs/standalone-dojo-pages.md](docs/standalone-dojo-pages.md)
- Vérification locale : `npm start` puis `http://localhost:4173/`
- Si un asset autorisé change, depuis le poste propriétaire : `npm run publish:dojo` après préparation et autorisation des assets. Ce sont des **opérations explicites de publication publique**, pas une étape normale du merge-train.
