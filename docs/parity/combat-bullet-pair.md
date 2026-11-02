# SH-03 — MCD projectile ↔ projectile contacts (bounded)

**PROUVÉ par lecture statique (non exécutée)** : SUPERHOT: MIND CONTROL DELETE
build 20299547, Unity 2018.4.14f1, Assembly-CSharp SHA-256
`ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257`.
Source privée déjà existante, sans nouvelle requête : research #102,
run 41444508326, artifact 13141705847, `managed/Assembly-CSharp/Bullet.cs:180–324`,
SHA-256 UTF-8 du texte lu
`db8afed911d821ef53acab8b072c736a63cad3779a663a771b1ed292f3e83d74`.
Aucun code original, asset ou dump privé publié.

**Garde native** — `HandleCollision:231–238,282–317` :
- collider ignoré → pas d'alerte. Sinon, une alerte (5, 0.05, 2)
  précède l'inspection de la couche `Bullets` ;
- composant projectile adverse requis ;
- exclusion dans l'ordre : pellets shotgun du même `ShotId`,
  deux ricochets avec le même booléen `firedByPlayer`,
  deux projectiles `deflected` ;
- si `other.CanCollide(current)` autorise : déplacement des deux
  positions au contact, demande de tranchage de chaque projectile
  **non sniper** selon l'orientation de l'autre, puis seconde alerte
  (5, 0.2, 5) ;
- cette branche retourne **false** : ce n'est pas un contact `handled`
  pour l'arrêt automatique de la boucle. Un `destroyed` effectif
  pourrait cependant arrêter `FixedUpdate:198–207`.

**WEB PROVISOIRE :** `planBulletPairContact` produit uniquement des
*demandes* d'effets, jamais une fracture, un son, une collision PhysX
ni un retrait des projectiles. Le booléen du `CanCollide` natif doit
être fourni explicitement ; faute de lui, le plan renvoie
`other-can-collide-unverified`. Les métadonnées d'instance réellement
chargées, la disposition des collisions, le tri, les side effects
de `SliceInHalf` et le sort des projectiles sont **INCONNUS**.
Le code utilise le `firedByPlayer` effectif, jamais le tag d'objet.

**OBSERVÉ dans les seuls tests Node** : neuf scénarios synthétiques
sur exclusions, ordre des commandes, sniper, inconnues, validation
et paire de tirs adverses. Ce n'est PAS une trace native ou browser GPU.

**Demande à SH-05 (issue #5) :** sans modifier `src/main.js` dans cette
lane, fournir les états natifs des deux projectiles, leur
`CanCollide`, l'ordre SphereCast, le point de collision et le résultat
de destruction avant d'intégrer. Tester une interception visible avec
fichiers locaux autorisés puis comparer à une capture native appariée.
Un test Node vert ne prouve pas la parité 1:1.
