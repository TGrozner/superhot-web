# TypeScript migration — incremental JS typechecking

Status: **initial opt-in, not a TypeScript rewrite**. This public browser game continues to run native JavaScript ES modules with no runtime dependencies or transpilation. Original game assets stay private.

## Current enforced baseline

- `npm ci` installs **dev-only** TypeScript 5.8.3.
- `npm run typecheck` runs `tsc --noEmit -p tsconfig.json`.
- `npm run check` now includes syntax checks, the existing Node test suite, and this typecheck. CI runs `npm ci` first.
- `tsconfig.json` deliberately lists **only `src/math.js`** for now. It has explicit JSDoc contracts for numbers, vectors, solids, and geometric intersections. The remaining repository is **not** claimed type-safe.
- Runtime behavior, URLs, script loading, WebGL, the private asset bridge, and the owners of existing files are unchanged.

## Rules for all SH agents

1. **Keep implementing gameplay, graphics and parity work.** Do not wait for a rewrite, change the game bootstrap, add a bundler, or blanket-convert files to `.ts`.
2. Existing reserved files remain owned by their assigned lanes. Do not modify `tsconfig.json`, `package.json`, `package-lock.json`, or `.github/workflows/verify.yml` independently; coordinate changes with SH-05, the integrator, before editing shared tooling.
3. For *new or modified public JS APIs*, document meaningful inputs and outputs using JSDoc (`@typedef`, `@param`, `@returns`, and explicit `null` / optional values). Prioritize module boundaries: combat intent/state, animation/rig transforms, geometry, material uniforms, audio event requests, and local-asset manifest data.
4. **Do not treat inferred native data as a type fact.** Encode only proven field structure and optionality; uncertain semantics remain documented as uncertain and validated at runtime. Types do not replace parity evidence, input validation, or tests.
5. A file enters the enforced baseline **only in a focused SH-05-coordinated PR** after `npm run typecheck` and `npm run check` pass. Expand the `files` list incrementally rather than enabling `checkJs` across the whole repository in one go. Imported dependencies may also need JSDoc.
6. Do not hide problems with broad `any`, blanket `@ts-nocheck`, `@ts-ignore`, or disabled strictness. If a boundary is too dynamic, document the open issue and keep it out of the checked baseline until its contract is proven.
7. No private research files, proprietary assets, or code from decompilation should be committed. SH-05 alone coordinates cross-lane integration and merges.

**First next candidates:** small leaf utility modules, then explicit contracts around the combat/animation/render/audio boundaries. Validate each slice; never claim full-game TypeScript coverage before it is actually checked.
