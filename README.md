# FRAME//BREAK — browser FPS prototype

**A playable, dependency-free browser FPS prototype inspired by the time-manipulation mechanic of SUPERHOT.** Original source code, generated geometry, synthesized audio and custom levels. **Not affiliated with SUPERHOT Team.** No copyrighted game files, character models, textures or sounds are included.

![License: MIT](https://img.shields.io/badge/license-MIT-darkred) ![WebGL 2](https://img.shields.io/badge/rendering-WebGL%202-222) ![No dependencies](https://img.shields.io/badge/runtime_dependencies-0-brightgreen)

## Play

Open the published GitHub Pages URL once Pages is enabled. On Windows, unzip the project and double-click `start.cmd` (Node.js 20+ required). For local play from a terminal:

```bash
npm start
```

Then visit **http://localhost:4173/**, with no query parameters. On the owner's configured machine, the selected private scene currently opens **Dojo (`SHRL_Dojo2`, build index 10)** with original local scenery and textures, from the viewpoint observed in the running replay. Click **Jouer dans SHRL_Dojo2** to start the Web encounter. The source equipment baseline is unarmed; common original pistol models remain available for enemy weapons and pickups. **Cadrer le modèle** isolates the character for inspection. Original data is **not distributed in this repository**. No `npm install` needed; do not open `index.html` as `file://`.

The visible **Vue** menu also offers **Anciennes salles de démonstration** and **Scène de contrôle générée**. These retain their generated geometry. There are no URL feature flags. Original geometry and sampled animations do not imply native gameplay, physics, lighting or shader parity.

### Local original-asset configuration

The ignored `private/browser-assets.json` maps `mesh6`, `mesh7`, `texture`,
`enemyMerged`, `enemyHeadless`, `enemyRig`, `enemyHeadlessRig`, `scenePackage`,
numbered `sceneTexture_NNN` IDs, `sceneLightmap_000`, `sceneLightmapBc3`,
and the `sceneConcrete*` textures to relative paths inside `private/`.
The rig JSON contains original geometry, skin weights, inverse binds, a 62-bone
hierarchy and native sampled local poses. The gzip scene package contains
source-qualified geometry, submeshes, materials, placements and collider records,
scene identity, initial equipment, lightmap dimensions/mips and an optional observed
entry camera. Captured map-variant exclusions retain their separate runtime provenance.
Only configured, recognized IDs are exposed through `/local-assets/<id>`, on
`127.0.0.1`; host and same-origin checks reject cross-site access. The private
directory itself is not served. Restart `npm start` after changing this map.
No original data or machine-specific paths should be committed.

Without that private configuration (including a public static deployment),
the page explicitly reports that originals are unavailable. Personal files
can still be selected under **Remplacer les fichiers locaux**; it does not
upload them. The generated playable prototype remains available in **Vue**.

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

## Files

- `index.html` — entry point and UI
- `style.css` — responsive HUD / menus
- `src/renderer.js` — tiny WebGL 2 renderer, procedural box and crystal geometry
- `src/main.js` — simulation, player controls, enemies, hit detection, levels
- `src/levels.js` — original level layouts and procedural architecture
- `src/math.js` — camera, collision and vector math
- `src/audio.js` — local source-backed native audio and separate procedural prototype effects
- `server.mjs` — zero-dependency local HTTP server
- `tests/` — Node native unit tests
- `.github/workflows/verify.yml` — lightweight CI
- `publish.ps1` — GitHub repository creation and GitHub Pages setup

## Private research material

Local reverse-engineering evidence and original game material belong in the ignored `/private/` directory, outside this public project's distributable files. Authorized research access uses a separate private, read-only corpus gateway. Never publish that corpus, decompiled source, or original assets in this repository, its issues, logs, or GitHub Pages; they are not covered by this project's MIT license.

## Validation

```bash
npm run check
```

It runs JavaScript syntax checks and built-in Node tests. GitHub Actions runs this on every push and PR.

## Publish to GitHub in one step

**Windows:** double-click `publish.cmd`. Or run this from PowerShell in the project directory:

```powershell
powershell -ExecutionPolicy Bypass -File .\publish.ps1
```

Requires [GitHub CLI](https://cli.github.com/) (`gh`) and Git installed; the script checks and guides you. It creates the **public** repository `TGrozner/superhot-web` on your account (if missing), commits, pushes `main`, enables GitHub Pages from root, and prints the expected page URL. GitHub Pages may take a minute to build the first time; the URL is not verified until deployed.

> Publishing as a public repository is intentional so GitHub Pages is accessible without account-specific paid entitlements. The script will not overwrite a nonempty unrelated repository.

## Known limitations

This is **not a full recreation of SUPERHOT MCD**. The configured local route uses original assets and original leaf-clip poses, but AI, movement/collision, gun rules, spawning, death physics and audio remain Web implementations. Original controller transitions, layered blending, FinalIK, root motion, native lighting/shadows/post-processing and complete shader equivalence are not reproduced. Desktop keyboard/mouse only. Public static hosting cannot automatically access the owner's private files; automatic original loading requires the loopback Node server.

## License

MIT for original project code and assets generated by this project. SUPERHOT and related names are trademarks of their respective owners. This project makes no claim over them.
