# SH-15 — Comparaison visuelle MCD ↔ Web (protocole, **pas** un certificat 1:1)

**État au 2 novembre 2026 :** comparateur et tests locaux sur PNG synthétiques ; **aucune paire native/Web réellement capturée**. La cible est SUPERHOT: MIND CONTROL DELETE (MCD), **Containers / buildIndex 28**, et non le SUPERHOT original. SH-15 ne touche qu'à `scripts/visual-*`, `tests/visual-*` et ce document. SH-05 conserve le raccord runtime partagé ; SH-10 conserve la validation gameplay.

## Les trois écarts visuels à remonter à SH-05 (priorités, pas amplitudes mesurées)

1. **P0 — Containers n'est pas encore une vue appariée native/Web.** Le prototype jouable propose des niveaux inventés ; `?scene=synthetic` est une fixture générée, pas un décor MCD. La [PR SH-04 #86](https://github.com/TGrozner/superhot-web/pull/86) prépare cinq unités Containers sérialisées ; SH-05 doit encore en faire une scène effectivement visible/jouable. Réfutation : sélection build28 par le navigateur, capture avec repères/état caméra certifiés.
2. **P0 — silhouette des meshes inconnue.** La proposition #86 exploite les volumes des BoxColliders et des primitives Web générées (avec nervures et sol générés), **pas** le mesh original et ses triangles/UV. Un MeshRenderer activé dans l'index ne prouve pas le mesh ou les bounds réellement dessinés. Réfutation : mesh de substitution autorisée fondé sur une preuve native, puis masque d'objets appariés et IoU.
3. **P1 — matériaux, éclairage et projection native non validés.** Palette et shader générés, aucun screenshot du jeu MCD dans le même angle, pas de pipeline natif de colorimétrie attesté. Réfutation : view/projection natives effectivement actives et couleurs sous exposition documentée, puis différence RGB/luminance à caméra identique.

**Aucun chiffre de fidélité** n'est disponible : il s'agit de risques manifestes dans le code et les handoffs, pas d'erreurs mesurées. Références : [SH-05 #5](https://github.com/TGrozner/superhot-web/issues/5), [SH-04 #4](https://github.com/TGrozner/superhot-web/issues/4), [#81](https://github.com/TGrozner/superhot-web/pull/81) (synthetic) et [#86](https://github.com/TGrozner/superhot-web/pull/86) (proposition Containers).

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
