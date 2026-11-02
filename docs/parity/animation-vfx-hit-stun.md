# SH-06 — Bullet body-part contact → Stun, source-gated Web composition

This is a **conditional request chain**, **not an observed native Containers hit**, executed animation, fragment, or audible sound. It supplements [animation-vfx.md](animation-vfx.md) without copying Unity code or MCD assets.

## Source provenance, MCD Steam build 20299547

- **PROUVÉ (static method branch):** [private research #127](https://github.com/TGrozner/superhot-research/issues/127), artifact `13158822845`, `managed/Assembly-CSharp/Bullet.cs:785–970`, bounded read-text SHA256 `6051142396c9bef59e1795f5da69f0f9ebba61d7bba30f8eba03f6eb0c79561e`. In `Bullet.EnemiesCollisionHandle`, a qualified live `PejAiBodyPart` can request **Stun instead of Kill** in bulletproof or armored cases, under owner, exclusion, boss, piercing and existing-stun predicates; the armor branch first asks for armor break. An ordinary vulnerable body-part instead requests `PejAiBody.Kill(DeathSource.Bullet,...)`. Projectile cleanup is separately gated. This is a source-code branch, not evidence that the browser's two synthetic spheres are real body parts.
- **PROUVÉ (static callee contract):** [private research #105](https://github.com/TGrozner/superhot-research/issues/105), artifact `13144030637`, `managed/Assembly-CSharp/PejAiBody.cs:478–536`, bounded SHA256 `578030aa9ee719e10eb61b454d5379f47237a15160875c9eb6852237207f29ca`. `PejAiBody.Stun` conditionally requests enemy-controller Stun, `_Focus=0` on non-null renderers, focus reset on material, pickup-effect fade, and cooldown-gated `EnemyStun`/`EnemyStunConcrete` audio prefab at body position + Y 1.5. Its kamikaze timer can return early after setting StunType. See the already shipped `src/animation/enemy-stun-command-plan.js` and SH-07's `src/sound/mcd-enemy-stun-prefab.js`.
- Assembly-CSharp SHA256 for this build (private handoff): `ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257`.

## New bounded adapter

`src/animation/bullet-to-body-stun.js::planBulletBodyPartStun` **reuses**, never copies, SH-03's `planEnemyBodyPartBulletContact` and SH-06's `planPejAiBodyStun`. It accepts an explicit `contactIsQualified` boolean, source-state snapshots of the bullet/body part, the controller instance identifier of the Stun receiver and the complete Stun invocation state. It never deduces armor, boss, collider, renderer, realtime or camera state from browser geometry or defaults.

For an unqualified contact, it stops before any source planner. Only `enemy-stun-request` in the SH-03 contact intents runs the SH-06 Stun command planner; an ordinary body-kill request, already-stunned target, excluded/self collision or unresolved BossMind branch **must not** produce stun/material/audio intents. The two controller IDs must agree. A verified source Stun *request* may itself end in the kamikaze early-return branch; there is no implicit assertion of visible focus or audio.

`tests/animation-bullet-to-body-stun.test.mjs` checks these divergent branches using **synthetic source-shaped values**. Successful Node CI tests mean this Web adapter is internally consistent, not that MCD Containers instantiated these states or that `RendererWrapper.SetFloat` affected pixels.

## SH-05 integration gate / falsifiable same-hit experiment

**INCONNU:** real Containers scene/build identity at hit time; actual `PejAiBodyPart` component and corresponding `PejAiController.GetInstanceID`; owner/piercing/bulletproof/armor/boss/stunned flags; sampled Stun arguments; active renderer wrappers and `_Focus` bindings; whether an executed Animator or a native sound makes a visible/audible output. There is **no** browser GPU proof or native frame pair in this patch.

For one observed native shot, capture a single ordered receipt `shotId → collider/PejAiBodyPart/controller ID → branch flags → BreakArmor/Stun OR Kill → renderer _Focus / controller response → framebuffer and audio`, with `Update` and `FixedUpdate` timestamps separate. In Web, first replace the synthetic `closestImpact` sphere with a bound body-part collider qualified by SH-03/SH-05; only then hand the same instance's state to this adapter, hand `renderer-focus-zero` to SH-05's rendering integration, and pass a sound request to SH-07's separately gated audio plan. SH-06 does **not** modify `src/main.js` or `src/renderer.js`.

**Refutations:** an armored native hit that calls `Body.Kill` without Stun under the captured state invalidates this scenario's premise; a kamikaze guard returning before `_Focus` refutes any unconditional visual flash; a browser shot producing 23 random shards on armored-only Stun is not native fracture parity. No proprietary material, mesh, C# or audio has been published.
