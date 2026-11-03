# SUPERHOT Web: strict TypeScript migration

**Policy (Thomas, 2026-11-03): real TypeScript, no `any`, no hiding diagnostics.** Migration remains incremental because the browser and private-asset loader currently consume native ES modules without bundling. Each converted module is **authored in `.ts`**. Its checked-in `.js` counterpart is generated output, never a second manually maintained implementation.

## First working slice

- **Source of truth:** `src/math.ts` (typed `Vec3`, `WalkSolid` and all 13 exported math functions).
- **Browser/Node runtime:** generated `src/math.js`; existing imports ending in `.js` stay valid.
- **Every file under `src/**/*.ts`** is part of the compiler check automatically; no single-file allowlist.
- **No runtime dependencies:** TypeScript 5.8.3 is dev-only; the deployed game consumes ordinary JavaScript.
- `tsconfig.json` enables `strict`, `noImplicitAny`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns`, `noUnusedLocals`, `noUnusedParameters`, `noPropertyAccessFromIndexSignature`, `noFallthroughCasesInSwitch`, `noUncheckedSideEffectImports`, `noImplicitOverride`, `useUnknownInCatchVariables`, `isolatedModules`, `verbatimModuleSyntax`, and `erasableSyntaxOnly`.
- `scripts/enforce-types.mjs` additionally fails on **explicit `any`**, and `@ts-ignore`, `@ts-nocheck`, `@ts-expect-error` in TypeScript source. Compiler `strict` by itself does **not** ban explicit `any`.
- `npm run check` includes typechecking and checks that every emitted runtime `.js` file is byte-for-byte synchronized with its `.ts` source.

## Commands

```bash
npm ci
npm run typecheck       # strict TS + no-any/suppression policy
npm run build:typed     # compile TS and refresh the checked-in JS runtime files
npm run check           # current Node tests, typecheck, generated-output freshness
```

You still start the game with `npm start` and without a production build. The intermediate `.generated/ts` directory is ignored.

## Mandatory instructions to every SH lane

1. Continue gameplay, visuals, native parity and tests. **No big-bang rewrite.** Existing non-migrated `.js` stays runnable. Avoid extra build steps on the user's play path.
2. For new modules or explicitly converted leaf modules, **prefer `.ts`**. No explicit `any`, no implicit any, no blanket `@ts-` suppressions, no disabling strictness. Unknown external data starts as `unknown`, then receives runtime validation before narrowing.
3. Do not introduce untyped public APIs to a migrated TypeScript module. Type cross-lane input/output boundaries; for untyped JS dependencies, coordinate conversion or a precise `.d.ts` backed by runtime evidence rather than silently accepting an `any` boundary.
4. JS output generated from TypeScript must stay committed for zero-build web loading. After editing `.ts`, run `npm run build:typed` and commit both typed source and generated JS. **Never manually patch generated `.js`.**
5. SH-05 owns the shared toolchain files (`tsconfig.json`, `package.json`, `package-lock.json`, scripts/checks, and CI). Other lanes propose narrow PRs, keep reserved modules in their lanes, and coordinate when changing files used by other agents.
6. Proven native structure is distinct from guessed semantics. Types describe what evidence supports, not imagined game behavior. Preserve runtime guards, tests, proof provenance and private-data restrictions.
7. SH-05 merges only when the exact head CI is green. A green TS check covers the `.ts` files, **not yet the rest of the legacy JS application**. Expand source coverage as modules are migrated, without unsound casts.

Next candidates: pure utility/domain leaf modules, then combat events and animation/rig contracts, then rendering/audio boundaries with owners' agreement. Scope every migration as a testable behavior-preserving change.
