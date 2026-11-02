# SH-11 — Containers/build28 native meshes (serialized, not Web geometry)

**2026-11-02. Status: PROVEN object identities/selected submesh bounds; 1:1 appearance UNKNOWN.** This public ledger contains only minimal object IDs, counts, bounds and SHA-256 provenance. Private OBJ exports, original meshes, textures, shaders, and raw corpus-query outputs are **not** published.

The serialized Unity source is `level28`, Unity **2018.4.14f1**, SHA-256 `e0dae9e43ce59ff8f53e157bae277c382602efdf8b34386cacf8c34995b2db91` (private issue #48/artifact `13135476021`). The corresponding scene is build index 28. `(owner,path_id)` is always the identity; numeric `path_id` alone is ambiguous.

## Verified source chain

| GameObject | MeshFilter | Mesh (owner:path_id) | MeshRenderer | Static submesh | Source status |
| ---: | ---: | --- | ---: | ---: | --- |
| 336 | 10570 | level28:6 | 7837 | 47 | verified bounds |
| 459 | 10673 | level28:7 | 7940 | 48 | verified bounds |
| 461 | 10674 | level28:7 | 7941 | UNKNOWN | mesh pointer only |
| 673 | 10856 | level28:7 | 8123 | UNKNOWN | mesh pointer only |
| 839 | 11005 | level28:6 | 8272 | UNKNOWN | mesh pointer only |
| 1003 | 11150 | level28:6 | 8417 | UNKNOWN | mesh pointer only |

All six models are **serialized-active** with enabled renderers, but active **runtime visibility** remains unobserved. Their renderer material pointer has `m_FileID=5,m_PathID=3`; the actual external Material/Shader binding is UNKNOWN and must **not** be inferred from unrelated assets with `path_id=3`.

Mesh `level28:6` records **44,030 vertices / 61 submeshes**, mesh `level28:7` **60,874 / 85**, both with `indexFormat=0`. For the first two verified renderer links, the static-batch submeshes have **4,638 indices apiece**. Their 3D bounds match, after Web Z-mirror and rounding, the **two first generated collider hulls** of `src/scenes/containers-build28.js`. This checks bounded geometry envelopes only, **not** face topology, skinning or texture appearance.

The Unity mesh metadata points to the streamed vertex resource `level28.resS`: mesh6 offset 0, size 1,937,320 bytes; mesh7 offset 1,937,320, size 2,921,952. Vertex data is not inline in the indexed JSON. However, private `media_final` explicitly marks **both meshes `converted_obj`**: UnityPy generated OBJ products with positions/normals/UV0/faces, but mirrored X and inverted winding. These conversions are **not original byte-exact Unity meshes**, and no private OBJ, URL, asset bytes or original topology is included here.

## Evidence taxonomy and provenance

- **PROVEN**: database schema #10/artifact 13133542861; build28 scene #16; hierarchy #20/#27; GameObject and renderer/collider chains #30/#32/#37; serialized-active flags #39; remaining mesh-filter references #42/artifact 13134488644; combined mesh fields #43/artifact 13134688163; external stream #45/artifact 13135470613; exact selected static-submesh AABBs #47/artifact 13134284374; source Unity version/SHA #48/artifact 13135476021; conversion inventory #53/#56/#59, latest artifact 13134903203.
- **OBSERVED in Web source**: SH-04 PR #86 was merged. SH-05 PR #88 added opt-in `?scene=containers` using synthetic floor and ribs, and collider-derived **proxy** boxes. Not a native mesh import.
- **UNKNOWN**: byte-equivalent vertices/channels of the active runtime mesh, exact OBJ-to-static-submesh correspondence after export, runtime activation or camera, external Material/Shader identity, real lighting/fog/occlusion, authorized Web assets, WebGL2 p95/frame captures, and native-vs-Web 1:1.

## Integration contract and blocker

`scripts/native-mesh-index-build28.mjs` is a source-qualified **metadata ledger**, deliberately returning `publicDrawable:false` for every record. `tests/native-mesh-containers-build28.test.mjs` verifies stable component joins, source IDs, the two AABB/proxy matches, and the no-public-asset gate. Neither file parses or distributes an original asset.

**For SH-12 (#76):** inspect one OBJ **privately and in a bounded manner**, compare its coordinate conversion/submesh ranges to the serialized source, and use only an independently generated or explicitly authorized geometry in the WebGL2 VBO/EBO pipeline. Do not directly publish converted OBJ content.

**For SH-13 (#77):** resolve the `5:3` material pointer through level28's actual external reference table before selecting shader, color or texture; private #41 has candidate materials/light metadata but does not establish this dependency.

**For SH-05 (#5):** existing `?scene=containers` is already demonstrable; keep its `COLLIDER PROXY` disclosure. Gather real browser screenshot and `window.__superhotSceneMetrics` first, then compare the same camera/phase with authenticated native observations before any parity claim. No edits to `src/main.js`, `src/renderer.js` or `src/levels.js` in SH-11.
