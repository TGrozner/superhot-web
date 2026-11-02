# SH-11 — Containers/build28 native mesh and renderer inventory

**2026-11-02. PROUVÉ : static Unity mesh→renderer mappings and six selected submesh bounds. OBSERVÉ dans un export privé : groupes OBJ convertis 24/47. INCONNU : draw runtime, matériaux résolus et parité native/Web.** This public ledger contains only source-qualified identifiers, counts, bounds, transformations and hashes. No original OBJ, vertex, index, texture, shader, export path or corpus output is committed.

## Source, version, primary provenance

- Unity **2018.4.14f1**, serialized owner **`level28`** (build index 28), source SHA-256 **`e0dae9e43ce59ff8f53e157bae277c382602efdf8b34386cacf8c34995b2db91`**: private research #48, artifact `13135476021`. Unity object identity is **(owner, path_id)**; a bare numeric ID is not global.
- Object/component hierarchy: private #30/#32/#37; MeshFilter pointers: #42/artifact `13134488644`; Mesh metadata: #43 `13134688163`; external data streams: #45 `13135470613`; initial submesh AABBs: #47 `13134284374`.
- **NEW primary, indexed and bounded JOIN**: private [research #68](https://github.com/TGrozner/superhot-research/issues/68), `corpus-query SUCCESS`, run `41435932125`, artifact **`13136407658`**. The `result.json` has six rows (`truncated=false`) joining the six known renderer and Mesh identities to `MeshRenderer.m_GameObject`, `m_StaticBatchInfo.firstSubMesh`, `subMeshCount`, `m_Materials[0]` and the selected `Mesh.m_SubMeshes[*]` AABBs. This confirms all six bindings rather than inferring neighboring submesh indices.
- Existing private converted OBJ: #60 `13134799393`, and gzip bytes for mesh6 #63 **`13135277646`**. Independently re-read in this cycle; the **632318-byte gzip SHA-256** matches the private result's `ff59d8e1548448926a6431d27578310f3a68f6e35d272cbe63576a1df8034941`. The UnityPy conversion **mirrors X and reverses face winding** compared with the original Unity representation. It is not a byte-exact runtime mesh.

## PROUVÉ — actual selected static-batch submeshes of serialized models

| Model GameObject | MeshFilter | Mesh `(level28,path_id)` | MeshRenderer | `firstSubMesh` | `indexCount` | Web preview proxy |
| ---: | ---: | --- | ---: | ---: | ---: | --- |
| 336 | 10570 | (level28,6) | 7837 | **47** | 4638 | `cargo-22` |
| 459 | 10673 | (level28,7) | 7940 | **48** | 4638 | `cargo-upper` |
| 461 | 10674 | (level28,7) | 7941 | **46** | 4638 | `cargo-86` |
| 673 | 10856 | (level28,7) | 8123 | **77** | 4638 | `cargo-21` |
| **839** | 11005 | (level28,6) | 8272 | **24** | 4638 | **`cargo-7`** |
| 1003 | 11150 | (level28,6) | 8417 | **32** | 4638 | not in five-hull preview |

All six MeshRenderer components have `m_Enabled=true`, exactly one static submesh in `m_StaticBatchInfo`, and serialized material pointer `(m_FileID=5,m_PathID=3)`. All six selected submesh AABBs match their serialized positions; the first five match their corresponding generated proxy hulls after mirroring Web Z to <0.001 world units. The **sixth instance is not drawn** by the present five-hull preview. These are static serialized records, **not proof that any renderer becomes visible at runtime**.

Mesh6 reports **44,030 vertices / 61 submeshes**; Mesh7 **60,874 / 85**; both `indexFormat=0`. Vertex stream is external `level28.resS`: mesh6 offset `0`, size `1,937,320`; mesh7 offset `1,937,320`, size `2,921,952`. An existing conversion provides geometry for offline examination, but the original external stream is still the source of truth.

## OBSERVÉ — OBJ groups 24/47 bound to specific Unity renderers

The same **private** converted `level28:6` OBJ contains 61 triangle groups, 44,030 `v`, 44,030 `vt`, 44,030 `vn`, and 29,809 triangles. Offline parsing of its `g`/`f` groups established:

| Converted OBJ group | Triangles | Unique referenced positions | Converted OBJ AABB center (rounded) | Unity renderer identification | Proof status |
| --- | ---: | ---: | --- | --- | --- |
| `... 2_24` | 1546 | 2402 | (−10.100, 2.575, −18.475) | `GO839 → renderer8272 → mesh6:24` | **GO_BOUND** (#68) |
| `... 2_47` | 1546 | 2402 | (−17.450, 2.575, −13.975) | `GO336 → renderer7837 → mesh6:47` | **GO_BOUND** (#32/#68) |

**Correction importante :** group24 is **GO839, not GO1003**. The prior AABB-only `cargo-7` match is now joined to an actual serialized renderer through `firstSubMesh=24`. The group numbers are corroborated by the bounds and the selected native index count `4638=3×1546`. Group32 belongs to GO1003.

The two private OBJ groups exhibit the same face sequence, UVs and normals after corresponding face/corner indices are read; after subtracting each group's AABB center, **maximum per-coordinate positional difference is about 1.01×10⁻⁶** (verified on the complete private gzip in this cycle). Thus they are **numerically near-congruent under translation**, not declared byte-identical. A WebGL2 renderer may **reuse one decoded VBO/EBO** for two instances, with separate transforms and two draw calls, once explicit local authorized loading is in place.

## Private OBJ → optional Web transform contract for SH-12/SH-05

The converted source includes **world-space static-batch positions**, not a prefab-local mesh that should be translated by the GameObject TRS again. To reuse one centered group's geometry for GO839 and GO336:

1. In private/local-only decoding, **select `g ... 2_24` or `g ... 2_47`** from mesh6 OBJ and validate `1546` triangles, `2402` distinct referenced positions and their respective bounds. Reject wrong or missing group; no silent fallback to a generated box as a native draw.
2. Subtract the selected OBJ-space AABB center from each position, then convert its coordinates and normal **OBJ→generated Web = `(-x, y, -z)`**. Apply distinct translation matrices **`cargo-7: (10.1, 2.575, 18.475)`** and **`cargo-22: (17.45, 2.575, 13.975)`**, using source-precision centers when possible. This is a **declared conversion for the current Web coordinate convention**, not evidence of a measured native camera.
3. OBJ→Web negates two axes, so determinant is positive; **no additional triangle index reversal is implied solely by this conversion**. However original Unity→OBJ already changed X and winding; require a WebGL2 culling/normal/front-face screenshot test before asserting orientation or lighting correctness.
4. Material pointer `5:3` is still unresolved. Use an explicitly **synthetic** material as a visibly labeled preview, do not claim the native shader or texture. Keep the existing box-proxy fallback without any local file.
5. User-supplied, authorized, local-only File API source may be decoded in browser; **never commit, upload to a public server, cache or embed** original/converted commercial mesh data. Only SH-05 may wire `src/main.js`, `src/renderer.js` or `src/levels.js`; SH-12 owns the parser/GPU adapter.

## INCONNU / acceptance gate

There is still **no** evidence of an actual native-vs-Web matched screenshot, active camera and loaded frame, runtime material resolution, true shader/lighting, occlusion or GPU p95. Tests of metadata counts do not certify displayed pixels.

**Binary access answer:** the private mesh6 OBJ payload is **accessible (YES)** through the previously completed #63 artifact; the exact GO/submesh bindings for the two selected groups are now **PROVEN (YES)** by #68. **Public shipping permission for mesh bytes remains NO**. A **local, explicitly authorized** import is the intended next path. The bottleneck is now SH-12's group decoder and SH-05's opt-in local-file browser wiring/capture — **not another broad native mesh search**.

`scripts/native-mesh-index-build28.mjs` exposes only scrubbed IDs, selected bounds, source digests and `OBJ_GROUP_BINDINGS`; `publicDrawable:false` remains explicit. `tests/native-mesh-containers-build28.test.mjs` checks the six joins and five hull envelopes, not GPU parity. No asset is embedded.
