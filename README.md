# FRAME//BREAK — SUPERHOT MCD Dojo sur Web

**Adaptation WebGL2 jouable de la scène `SHRL_Dojo2` / build 10 de SUPERHOT: MIND CONTROL DELETE.** Le site est désormais autonome sur GitHub Pages, avec son pack de scène, les textures, les modèles, rigs, animations et clips présents dans le manifeste hébergé. **Non affilié à SUPERHOT Team ; aucune parité native 1:1 complète revendiquée.**

## Objectif produit

**Un FPS Web inspiré de MCD, mais libre de devenir meilleur.** Depuis le 3 novembre 2026, la priorité n'est plus la parité 1:1 avec Unity : on favorise le ressenti des armes et des impacts, des ragdolls crédibles et variés, une IA intéressante, un rendu soigné et des FPS stables. Les modèles et données source conservés constituent une base ; les réglages et améliorations propres au Web sont autorisés, sans les faire passer pour des comportements natifs.

Les critères de livraison sont désormais la qualité réelle du Dojo jouable, le bon fonctionnement sur Pages et en local, et les performances mesurées. Les études de parité restent de la documentation historique, pas un passage obligé.

## Jouer

**[Ouvrir le Dojo — GitHub Pages](https://tgrozner.github.io/superhot-web/)**

Thomas a confirmé le 3 novembre 2026 que la démo Pages démarrait et fonctionnait. Le premier pack standalone comporte **52 assets (47 872 002 octets)** sous `local-assets/`, plus `manifest.json` ; les hashes et fichiers ont été publiés avec le commit `876a2cdde01845b685a81ccf818d965c78fb0c56` (jalon historique, non nécessairement le HEAD courant). La construction et le déploiement GitHub Pages ont réussi sur ce commit.

Les visiteurs n'ont besoin ni du PC du propriétaire, ni de Node, ni d'un tunnel ni du dossier `private/`. Le navigateur charge les fichiers depuis l'origine Pages, sous `/superhot-web/local-assets/`.

Pour jouer localement et vérifier la même version déjà packagée :

```powershell
npm start
# http://localhost:4173/
```

Le serveur Node local privilégie le pack `local-assets/` s'il est présent ; `private/browser-assets.json` est un **outil de sourcing/export**, pas une dépendance de production. Ne pas ouvrir `index.html` avec `file://`.

Si un asset indispensable manque ou si la scène n'est pas le Dojo attendu, l'interface doit afficher **une erreur explicite** et ne jamais basculer silencieusement sur les anciennes salles générées / proxies « Roblox ».

### Comment livrer une mise à jour

- **Code uniquement :** travailler en branche/PR, valider la CI, fusionner sur `main` via SH-05. Le workflow GitHub Pages redéploie automatiquement le site à la même adresse.
- **Nouveaux assets / nouvelles animations / nouveaux sons :** ils ne sont **pas** synchronisés depuis le poste local lors des merges. Préparer un pack source-qualifié, mettre à jour `local-assets/manifest.json`, et publier explicitement les fichiers autorisés. Depuis la machine qui possède le corpus : `node scripts/vendor-dojo-assets.mjs` puis `node scripts/publish-dojo-pages.mjs`.
- **Après livraison :** vérifier la CI **et** le déploiement Pages sur le SHA, puis faire un smoke navigateur du Dojo. CI verte n'est pas preuve d'un rendu correct.

Procédure complète : [Standalone / GitHub Pages](docs/standalone-dojo-pages.md). Consignes applicables à **tous les agents** : [AGENTS.md](AGENTS.md).

### Assets et recherche

La publication est **statique** : les 52 fichiers publiés sont téléchargeables depuis le dépôt ou Pages. Aucune dépendance technique au corpus de recherche privé ne subsiste pour les visiteurs. La recherche inverse, les dumps, les scripts propriétaires, les fichiers secrets et les versions locales non publiées restent dans leurs espaces privés. Vérifier les droits de redistribution avant d'ajouter de nouveaux fichiers issus du jeu : licence MIT du code Web ≠ licence des assets originaux.

## Playable prototype controls

| Key | Action |
| --- | --- |
| WASD / ZQSD | Move |
| Mouse | Look |
| Left click | Shoot / punch if disarmed; throw a held object or strike with a katana |
| R | Reload in the generated prototype rooms |
| F / right click | Throw the held gun or object |
| E | Pick up an aimed, reachable gun or usable object |
| Space | Jump |
| Shift | Sprint in the generated prototype rooms |
| Escape | Pause / release mouse |
| Enter | Start / restart on menu |

**Time scales with movement, aiming and shooting.** Native sampled poses advance on the Web world clock and freeze during pause. The older generated rooms retain their own prototype rules.

The configured Dojo encounter uses the source navigation polygons and connected doorways, source startup/door delays and difficulty limits. Enemy, player, projectile and object collisions use their distinct source layer masks. Movement sweeps a finite capsule against transformed source boxes, including stairs, slopes and ceilings; combat contacts follow the sampled enemy bone colliders. This is a Web implementation, not Unity PhysX or the complete native AI.

Source-authored bowls, cups, bottles, bonsai, fans, shurikens and katanas can be picked up and thrown. Picking up an object removes its original world draw and colliders rather than duplicating it. Ordinary blunt hits stun and disarm; sharp objects can kill and remain recoverable after sticking. Breakable objects use their authored fragments, not random substitute debris. Enemy weapons drop from their current animated socket. Death freezes the sampled enemy pose; native ragdolls are not reproduced.

The encounter currently equips enemies with pistols rather than reproducing the complete weighted native weapon selection. The original red-light doorway warning is not rendered, although its source delay is retained. Katana held placement uses its original sampled idle weapon-bone pose; animated player hands and katana swings are not reproduced. Stuck-object attachment does not follow a native ragdoll, and fragment motion is ballistic rather than a full fragment-to-world rigid-body simulation.

When the private scene package supplies recovered audio descriptors, object pickup/throw/break, enemy stun and katana contact use their original local clips. The three doorway sounds are continuous distance-gated ambience, not spawn-warning one-shots. Source mixer groups determine which sounds follow the world clock; Unity reverb, mixer DSP and spatial spread are not reproduced. Missing source clips are not replaced with invented sounds.

**Reprise du travail : [état vérifié, sauvegarde des travaux incomplets et prochaines étapes](docs/dojo-reprise.md).** This is a stabilized Web adaptation, not a completed 1:1 vertical slice.

## Structure et validation

- `index.html`, `style.css`, `src/main.js`, `src/renderer.js` : client WebGL et gameplay.
- `local-assets/manifest.json` et fichiers voisins : pack **hébergé**, autonome, même origine.
- `server.mjs` : serveur HTTP de développement uniquement ; `private/` est un dossier d'extraction non requis en production.
- `scripts/vendor-dojo-assets.mjs` : export source-qualifié depuis la configuration locale vers le pack statique.
- `scripts/publish-dojo-pages.mjs` : publie explicitement le pack vérifié depuis un clone Git isolé, sans toucher aux autres worktrees.
- `.github/workflows/verify.yml` : CI de validation ; publication Pages sur les commits de `main`.
- `docs/dojo-reprise.md` : historique de la reprise du Dojo ; les consignes de déploiement actuelles sont dans `AGENTS.md`.

Validation du code : `npm run check` (vérifications JS/TS et tests). Les changements visuels/jouables demandent également un smoke navigateur.

## Known limitations

Le site standalone exécute **une adaptation Web** et non Unity/PhysX. IA, gameplay, collisions, IK, transitions Mecanim, ragdoll natif, shaders et audio peuvent encore différer du jeu source. Une capture Dojo fonctionnelle ne prouve pas une parité native 1:1. Contrôler l'état des chantiers et les preuves dans `docs/parity/`.

## License

MIT pour le code original de cette adaptation et les éventuels éléments créés spécifiquement pour elle ; les fichiers commerciaux provenant de SUPERHOT ne sont **pas** couverts par cette licence MIT. SUPERHOT et les noms associés sont des marques de leurs propriétaires respectifs.
