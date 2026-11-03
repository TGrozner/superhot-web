# Déploiement standalone du Dojo SHRL_Dojo2 / build 10

**État au 3 novembre 2026 : en production, confirmé jouable par Thomas.**

- URL stable : **https://tgrozner.github.io/superhot-web/**
- Repo : `TGrozner/superhot-web`, branche de déploiement `main`, dossier `/(root)`
- Premier commit qui publie les assets : `876a2cdde01845b685a81ccf818d965c78fb0c56` (historique ; ne pas supposer que c'est le HEAD actuel)
- Pack initial : **52 assets, 47 872 002 octets**, sous `local-assets/` + `manifest.json`, avec SHA-256 par fichier
- GitHub Actions : `Verify prototype` + `pages build and deployment` ; publication du SHA initial réussie
- Après téléchargement initial, **aucune connexion au PC du propriétaire** ni au repo privé de recherche n'est nécessaire pour jouer.

## Architecture et règles invariantes

```text
GitHub Pages: /superhot-web/
  index.html + style.css + src/                  code du jeu
  local-assets/manifest.json                     liste des assets + SHA
  local-assets/<id>.<extension>                   meshes, scène, rigs, PNG, WAV
```

Le client charge `manifest.json` par URL relative à son propre `import.meta.url`, puis les assets par chemins de la même origine. Il ne doit **jamais** demander `/local-assets/manifest` à la machine d'un visiteur, ni un dossier `C:\dev\...`, ni un tunnel Cloudflare. Le serveur `server.mjs` reste utile en développement ; s'il trouve le pack déjà publié il le sert en priorité, sans exiger `private/`.

**Pas de fallback graphique :** le pack doit identifier `SHRL_Dojo2`, build 10, et fournir scène, modèle ennemi, rig animé, textures et références nécessaires. S'il manque des données, afficher l'erreur et arrêter, **pas** les anciennes salles générées/proxies/cubes. Le chargement incomplet n'autorise aucune affirmation de parité.

## Changements de code (fréquents)

1. L'agent travaille exclusivement dans sa lane avec une branche/PR. **SH-05 est propriétaire des fichiers communs et du merge** ; relire la dernière version de `main`.
2. Contrôler `npm run check` et la CI sur le SHA de PR. Fusionner sur `main` sans faire de reset/force push et sans toucher au poste du propriétaire.
3. Le workflow GitHub Pages reconstruit automatiquement le site à la **même URL**. Les visiteurs recevront la nouvelle version du code au rechargement.
4. Après fusion, vérifier le workflow Pages pour **ce SHA** puis une scène Dojo fonctionnelle dans un navigateur. Pas de « testé en navigateur » si seules la CI et les métriques statiques ont été lues.

Les fonctionnalités qui réutilisent des assets **déjà présents dans** `local-assets/manifest.json` ne nécessitent **aucun nouvel export** ni intervention de Thomas.

## Nouveaux assets, animations, matériaux ou sons

L'hébergement Pages **n'a pas accès aux exports restés privés**. L'agent doit d'abord vérifier si l'asset existe déjà dans le manifeste publié ; un asset identifié dans le corpus de recherche ne l'est pas nécessairement.

Sur le poste propriétaire, **uniquement pour les fichiers dont la redistribution est autorisée** :

```powershell
cd C:\dev\superhot-web
git fetch origin main
git restore --source=origin/main -- scripts/vendor-dojo-assets.mjs scripts/publish-dojo-pages.mjs
node scripts/vendor-dojo-assets.mjs
node scripts/publish-dojo-pages.mjs
```

- `vendor-dojo-assets.mjs` lit `private/browser-assets.json`, valide scène `SHRL_Dojo2` / build 10, couvre les IDs requis, vérifie chemins et limites de taille, puis régénère le pack `local-assets/` et ses SHA-256.
- `publish-dojo-pages.mjs` **vérifie tailles et hashes**, refuse les fichiers inattendus, copie **uniquement** `local-assets/` dans un clone Git temporaire puis pousse ce commit vers `main`. Il ne modifie pas les worktrees locaux et ne force jamais un push.
- Vérifier ensuite le workflow **pages build and deployment** pour le nouveau SHA et charger le site. Le site ne nécessite plus le PC lorsque les fichiers sont hébergés.

**Important :** ces commandes rendent les fichiers accessibles publiquement. Le fait qu'un jeu soit installé et que ses données aient été extraites ne démontre pas le droit de les redistribuer. Ne jamais publier de fichiers de recherche privée, code décompilé, exécutable natif, secrets ou nouveaux fichiers commerciaux sans autorisation vérifiée.

## Checklist de sortie

- [ ] `main` contient bien les fichiers et le manifeste référencés par la nouvelle feature, et les sommes correspondent.
- [ ] CI et workflow **GitHub Pages** terminés en succès sur le SHA attendu.
- [ ] L'URL de la démo sert le vrai Dojo (pas la scène générée), avec ressources réseau servies depuis le site, pas le PC.
- [ ] Smoke navigateur ciblé : décor, textures, ennemis animés, tir, F/E, mort, victoire et REJOUER selon les changements effectués.
- [ ] Signaler honnêtement les tests non exécutés et les écarts à l'original. CI « success » n'est pas une capture ni une preuve 1:1.

## Sources et garde-fous

Le travail de reverse engineering continue dans le dépôt de recherche privé et son runner autorisé. Les agents ne doivent ni démarrer une deuxième instance locale ni republier le corpus. Les descriptions de données natives restent source-qualifiées sans extrapoler leur comportement.

Les instructions globales à lire au début de **chaque cycle agent** sont à la racine : [AGENTS.md](../AGENTS.md). L'historique de récupération `docs/dojo-reprise.md` est conservé pour référence, sans supplanter ce fonctionnement.
