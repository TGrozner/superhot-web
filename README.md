# FRAME//BREAK — browser FPS prototype

**A playable, dependency-free browser FPS prototype inspired by the time-manipulation mechanic of SUPERHOT.** Original source code, generated geometry, synthesized audio and custom levels. **Not affiliated with SUPERHOT Team.** No copyrighted game files, character models, textures or sounds are included.

![License: MIT](https://img.shields.io/badge/license-MIT-darkred) ![WebGL 2](https://img.shields.io/badge/rendering-WebGL%202-222) ![No dependencies](https://img.shields.io/badge/runtime_dependencies-0-brightgreen)

## Play

Open the published GitHub Pages URL once Pages is enabled. On Windows, unzip the project and double-click `start.cmd` (Node.js 20+ required). For local play from a terminal:

```bash
npm start
```

Then visit **http://localhost:4173/**, with no query parameters. The homepage opens the original-model inspection view immediately. On the owner's configured machine, original cargo geometry, concrete texture and EnemyMerged load automatically from the loopback-only server. They are **not distributed in this repository**. No `npm install` needed; do not open `index.html` as `file://`.

The visible **Vue** menu switches to **Prototype jouable** (the original three-arena game) or **Scène de contrôle générée**. There are no URL feature flags. The original-model view is currently static geometry inspection, not reconstructed native gameplay or animation.

### Local original-asset configuration

The ignored `private/browser-assets.json` maps `mesh6`, `mesh7`, `texture`,
`enemyMerged`, and `enemyHeadless` to relative paths inside `private/`.
Only those configured files are exposed through `/local-assets/<id>`, on
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
| Left click | Shoot / punch if disarmed |
| R | Reload |
| F / right click | Throw gun (instantly kills on hit) |
| E | Pick up a dropped gun |
| Space | Jump |
| Shift | Sprint |
| Escape | Pause / release mouse |
| Enter | Start / restart on menu |

**Time scales with your movement, aiming, shooting and reloading**. When standing still, bullets and enemies crawl. You move at full speed. Shoot crystals, dodge enemy bullets, clear three original arenas. Three hits = game over. Enemies drop weapons. Your ammo replenishes between rooms.

## Files

- `index.html` — entry point and UI
- `style.css` — responsive HUD / menus
- `src/renderer.js` — tiny WebGL 2 renderer, procedural box and crystal geometry
- `src/main.js` — simulation, player controls, enemies, hit detection, levels
- `src/levels.js` — original level layouts and procedural architecture
- `src/math.js` — camera, collision and vector math
- `src/audio.js` — generated Web Audio sound effects
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

The playable prototype remains **an early gameplay prototype**, not a full recreation of SUPERHOT: three compact rooms, one gun type, basic geometric enemies, simple level collision, minimal enemy tactics, no multiplayer, saved progress or replay system. The default original-model view displays authentic local static exports, but native animation, materials, lighting and gameplay fidelity remain unverified. Desktop keyboard/mouse only. A static host can serve the code; automatic private-original loading requires the local Node server.

## License

MIT for original project code and assets generated by this project. SUPERHOT and related names are trademarks of their respective owners. This project makes no claim over them.
