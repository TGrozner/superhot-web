# Dojo/build10 standalone static hosting

Target: deploy the **same browser runtime and original SHRL_Dojo2 source package** that the owner currently loads locally. No network access to the owner's machine is needed after deployment. No substitute geometry or procedural fallback is selected when assets are missing.

## Build the static package (one-time on the machine holding the files)

Prerequisites: Node.js 20+, an up-to-date `superhot-web` checkout with this change, and the complete source-qualified local Dojo export referenced by `private/browser-assets.json`.

```powershell
cd C:\dev\superhot-web
node scripts/vendor-dojo-assets.mjs
```

This **reads** the owner-local allowlist and copies the same source bytes into `local-assets/`. Its `manifest.json` lists file IDs, filenames, MIME types, SHA-256 and sizes. It checks SHRL_Dojo2 / scene build index 10, required models/rig/textures, configured file containment and GitHub file/site size limits. The source directory is not modified. When vendoring succeeds, the public HTML loads a source-qualified scene from its same-origin `./local-assets/` URL. `src/main.js` and the HUD resolve all referenced files relative to the site root. On the local Node server, the static package takes priority over `private/` so the rendered asset source is consistent.

**Do not upload the local project corpus, private research, source game binaries, reverse-engineering dumps, local absolute paths, or any assets you lack authorization to redistribute.** Publishing a public Pages site makes *all its static files freely downloadable*, even if the repo is private. The local export is not itself a redistribution license, nor a claim of native 1:1 gameplay.

## Publication

GitHub Pages is already configured through `main` / `/(root)`. Only when rights to redistribute the included files are established, include the generated `local-assets/` directory in an authorized deployment. The web application cannot be standalone on GitHub Pages until the complete `local-assets/manifest.json` and its listed files are actually hosted.

For a local offline smoke check after vendoring:

```powershell
npm start
# Open http://localhost:4173/
```

The local server now prefers the standalone package if present. Start from a clean server process after pack generation.

## Diagnostic invariants

- If `manifest.json` is missing, the page shows **Dojo original indisponible** and does not draw the old Roblox-style collider proxies.
- If the scene isn't SHRL_Dojo2/build10, loading fails.
- If the animated enemy source or referenced textures are missing, loading fails.
- For production, file access is same-origin: `/superhot-web/local-assets/…` (Pages), not `/local-assets/…` on the visitor's computer.
- Node's existing loopback-only `/local-assets/manifest` remains available for local development without a vendored pack.
- The runtime is the currently built Web adaptation, not an assertion of complete Unity/MCD gameplay or rendering parity.

## GitHub Pages size and legal constraints

GitHub repository individual file limits and Pages publication limits apply. A build containing an oversized original scene package cannot be made to fit by enabling Git LFS; Pages does not support directly serving LFS objects as normal files. Use a separately hosted, authorized static asset distribution if the complete site cannot fit.

Asset hashes prove byte identity between the input files and staged copies; they do **not** prove that the rendered WebGL frame equals the native frame. Browser and source-capture comparison are still required for any such claim.
