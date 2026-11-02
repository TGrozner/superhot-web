# SH-13 — Materials and lighting: source-aware Web contracts

**Status (2026-11-02):** owner-qualified source identities, compiled D3D11 programs and selected clean Web reconstructions are active for Containers Concrete MAIN and the EnemyMerged Red Crystal default-focus base pass. Authentic private texture/lightmap payloads remain local-only. Runtime variant selection, live shader globals, exposure/postprocessing and matched native framebuffer appearance remain incomplete; no whole-frame or 1:1 material parity is claimed.

## Evidence boundary: Containers build28

This agent read the **private result.json** (not just CI notifications) for:
- research #10, artifact 13133542861: indexed corpus table schemas.
- research #16, artifact 13132978778: build28 serializes owner level28.
- research #30, artifact 13133248533: bounded container GameObjects.
- research #32, artifact 13134550402: MeshRenderer/MeshFilter records.
- research #37, artifact 13133293087: four enabled serialized cargo renderers,
  each one material slot; lightmap index and UV scale/offset, shadow flags.
- research #39, artifact 13133778193: serialized object activation.

These observations establish **serialized source metadata**, not that a
renderer drew the objects or that a particular shader, material or color
was used during MCD gameplay. The referenced material was external to
the level28 scene object records. Neither lightmap texture bytes nor an
external fileId mapping were proven.

One **bounded private** follow-up for materials and render settings,
research #41 (artifact **13134492119**, result.json inspected), succeeded.
It establishes scene-level serialized fog OFF and ambientIntensity zero,
plus Light and LightmapSettings records. These do NOT prove ambient black,
or remove baked lightmaps, skybox, probe lighting or runtime overrides.
The scene has a serialized baked-lightmap reference but its texels are not
available to the browser. Material pathId 3 candidates in other owners
are NOT matched to the cargo MeshRenderer's external fileId 5 without
an external dependency map. Do not request this query again. The original raw object trees, textures and other proprietary
assets stay in the private corpus.

## Contract to SH-12 and SH-05

Source modules: src/render/material-model.js and
src/render/lighting-model.js.

1. createSerializedMaterialSlot({id, owner, rendererPathId,
   materialReference:{fileId,pathId}, slot, rendererEnabled,
   receiveShadows, castShadows, lightmapIndex, lightmapTilingOffset,
   evidence}) records a serialized reference **without guessing RGB,
   shader or texture**. The external material identity needs separate
   proof. Object identity (owner,pathId) != external ref (fileId,pathId).
2. createGeneratedMaterial({id,color:'#RRGGBB',alpha}) creates explicitly
   generated Web paint. materialDrawPacket(nativeSlot) rejects unknown
   RGB. materialDrawPacket(nativeSlot,{fallback:generatedMaterial})
   yields {color:rgba, colorEncoding:'srgb', fallbackUsed:true,
   colorProvenance:'generated-fallback-not-mcd', serializedRenderer,
   lightmap, lightmapSamplingEnabled:false}. Such placeholders MUST be
   visibly labeled synthetic, never original MCD materials.
3. transformLightmapUV([u,v],lightmap) returns
   [u*scaleX+offsetX,v*scaleY+offsetY]. Stored index/ST **does not**
   authorize lightmap sampling until an actual source-qualified texture
   is resolved and decoded. Static shadow/receive/enabled flags belong
   to the serialized scene; live runtime activation is unverified.
4. createGeneratedLighting() and lightingUniformPacket(profile)
   return {ambient,diffuse,direction,fogColor,fogStart,fogEnd,
   fogStrength,exposure,colorSpaceMode,source}. Defaults reproduce the
   CURRENT WEB prototype shader (ambient 0.64, diffuse 0.36,
   directional light [-.55,.90,.42], fog from 14 to 70, strength 0.72,
   color [.927,.948,.966], exposure 1, display-srgb). These are **not
   native MCD values**. createUnresolvedNativeLighting({scene,evidence})
   refuses to emit invented uniforms.
5. sampleGeneratedLighting(profile,{color,normal,position,
   cameraPosition}) is a CPU reference of the generated shader math.
   srgbToLinear/linearToSrgb support an experimental linear-srgb mode,
   explicitly not a certified Unity color pipeline.

### Raccordement requested; no shared-file changes in this PR

SH-12 accepts the material draw packet next to its future indexed mesh,
model matrix/normal matrix, optional UV2 stream and uniform packet. SH-05
connects the values to its existing WebGL2 shaders in renderer.js
(exclusive reservation) and chooses an explicit generated fallback
until native material/shader values are proven.

To demonstrate actual visual progress, pick one fixed build28
container with proven transform/mesh identity and render the same
camera before/after integration, recording screenshots and frame
draw-call counters. Once native references are resolved, compare
colors/geometry/camera against a **real original capture** in SH-15.
No screenshot or native runtime measurement was available in this PR;
Node behavior tests cannot certify visual parity.


## P0 improvement newly unlocked: source-serialized fog OFF

The verified private #41 record for build28 includes a scene RenderSettings
with m_Fog=false. The existing **generated Web** fragment shader applies
fog from distance 14..70 at strength .72 everywhere. Thus there is now a
specific, testable **source mismatch** on the opt-in Containers viewport.

new API:

- createSerializedRenderSettings({scene,owner,pathId,fogEnabled,
  ambientIntensity,evidence}) records the source property and explicitly
  marks runtime activation unverified.
- generatedUniformsWithSerializedFogOff(createGeneratedLighting(),
  serializedSettings) returns a packet with fogStrength=0 and provenance
  'generated-web-plus-serialized-fog-off'; other ambient/diffuse/exposure
  values stay generated. It rejects fog ON or missing evidence.

**SH-05 integration request:** apply this only for the explicitly
source-derived Containers build28 scene, not the Web-authored levels. Set
the WebGL2 fog multiplier to zero for the opt-in scene through the shared
renderer uniform path; then produce two same-camera Web screenshots and
measure changed pixel count/average delta. Source proof here is the
*serialized* scene flag, not an observed original frame. No reconstructed
native skybox, baked illumination, shadows or final tonemapping is claimed.

Other source metadata include several enabled serialized lights with
different colors, strengths, culling masks and baked/dynamic markings.
Do **not** simply sum their intensities: transforms, layer masks, GI
bakes, probes, actual active state and color pipeline are not established
at runtime.


## P0 source-addressable bindings for the two local Containers OBJ groups (2026-11-02)

SH-13 re-opened **actual private `result.json`**, not workflow green status:

- **#32**, artifact `13134550402`: `level28` MeshRenderer `7837` (GO336) and `7940` (GO459) each have one material reference **(fileID=5,pathID=3)**, are serialized enabled, receive shadows, cast-shadows enum 1, and have **`m_LightmapIndex=0`** with *different* `m_LightmapTilingOffset`.
- **#68**, artifact `13136407658`: GO336→renderer7837→Mesh6 static submesh **47** and GO459→renderer7940→Mesh7 static submesh **48**, each **4,638 indices / 1,546 triangles**.
- **#41**, artifact `13134492119`: scene LightmapSettings `level28:18622` serializes atlas slot 0 reference **(fileID=9,pathID=2)**, with no directional lightmap and no shadowmask. This is an *index+pointer*, NOT decoded lightmap texels, and does not prove visible runtime bake.
- **#50**, artifact `13134569214`: rendering closure material/property inventory and owner-qualified links exist in the **private** corpus, but the specific `level28:7837 → (5,3) → target_owner` edge has not yet been retrieved. No material(3) under another scene may be relabeled as the cargo material.
- **#67**, artifact `13136407236`: first 32 lines of the 37.8 MB `rendering/closure/rendering-links.json` proved the schema, but not the cargo's edge. **#72**, run `41439740776`, artifact `13137548726`, extends *only* to lines 33–1032. This read showed a distinct owner-qualified `level28` RenderSettings cubemap link but **not** renderer7837's material. No duplicate scan.

Precise atlas placement for the first two source-matched cargo submeshes:

| GO / renderer | Static mesh:group | Serialized UV2 lightmap ST (scaleX,scaleY,offsetX,offsetY) |
| --- | --- | --- |
| 336 / 7837 | level28:6 / 47 | (0.15870319306850433, 0.15870319306850433, 0.7985754013061523, -0.00025011622346937656) |
| 459 / 7940 | level28:7 / 48 | (0.15870319306850433, 0.15870319306850433, -0.00025011622346937656, 0.6481873989105225) |

**New concrete API, only owner files changed:**

```js
import {
  containersBuild28CargoMaterialBinding,
  createGeneratedMaterial, materialDrawPacket, transformLightmapUV,
} from './render/material-model.js';

const source = containersBuild28CargoMaterialBinding(7837);
// source.geometry: {owner:'level28',meshPathId:6,staticSubmesh:47,indexCount:4638,triangleCount:1546}
// source.material.materialReference: {fileId:5,pathId:3}, with owner UNKNOWN
// source.material.lightmap: {index:0,tilingOffset:[...],textureResolved:false}
// source.bakedLightmap.atlasReference: {fileId:9,pathId:2}; samplingAuthorized:false
const diagnostic = materialDrawPacket(source.material,{
  fallback:createGeneratedMaterial({id:'cargo-web-fallback',color:'#485761'}),
}); // colorProvenance='generated-fallback-not-mcd'; lightmapSamplingEnabled=false
```

**SH-12 exact interface requirement (do not edit SH-12 files here):** source OBJ adapter `position/normal/uv0` does **not** expose the separately authored **UV2/lightmap channel**. The source mesh stream layout and actual UV2 bytes must be verified privately; provide source-qualified `uv2:Float32Array` aligned per rendered vertex, or fail closed on baked-lightmap sampling. `uv2Atlas=(uv2*ST.xy)+ST.zw` only after atlas `fileID9:pathID2` is owner-resolved, decoded, authorized and gamma/linear encoding verified. A Web material shader must distinguish albedo/uv0 from the baked texture/uv2. Do not infer UV2=UV0 or bake directly from `m_LightmapIndex`.

**SH-05 integration contract (owner of `src/main.js`, `src/renderer.js`, `src/levels.js`):** on opt-in `?scene=containers` and **only** after exact local OBJ group acceptance, match each indexed draw to `source.geometry.meshPathId/staticSubmesh`. Keep `materialDrawPacket`'s explicit generated fallback; instrument `materialReference=(5,3)`, `nativeMaterialOwner=null`, `lightmapAtlas=(9,2)`, UV2+texels unavailable, rather than presenting a placeholder as the MCD material. Existing fog hook **already merged** via #95 (`fogStrength=0` for build28 only); do not rewrite it. SH-15 should capture paired same-camera frames and measure actual visual deltas once source material & bake are available.

**Blocking native evidence:** full owner-qualified `level28:7837:m_Materials[0] → (5,3)` edge, linked `Material.m_Shader`, `m_SavedProperties` _Color/_MainTex with per-property scale/offset, all Texture2D payload locations/color encodings, `LightmapSettings` (9,2) resolved texture bytes, and UV2 buffer channel/stride. Exposure and runtime GI still UNKNOWN. Serialized `ambientIntensity=0` cannot override SH/probes/lightmap (do not force black), and four red type0 spotlights at intensity30 have layer mask 256 only (do not apply indiscriminately to cargo).

This change is a **real, joined source identity and lightmap-placement contract**, not a measured appearance fix: no new native/Web screenshot or proof of 1:1.


## 2026-11-02 — P0 **RESOLVED owner-qualified six-Renderer material identity** (supersedes the older unresolved-owner sections above)

This is a **new factual source resolution**, not a browser visual delta. The older statements that `fileID5:pathID3` has an unknown target are now historical, superseded by direct evidence below.

**Private `result.json` files actually inspected:** research [#73](https://github.com/TGrozner/superhot-research/issues/73) artifact `13137943790`, [#75](https://github.com/TGrozner/superhot-research/issues/75) artifact `13137203925` (six rows, `truncated=false`), and [#85](https://github.com/TGrozner/superhot-research/issues/85) run `41441833067`, artifact `13140636598` (`query`, one row, `truncated=false`). Previous artifacts #41, #50, #67 and #72 were re-read before asking #85; no duplicate query for the already-resolved pointer was made.

### Exact dependency chain

| Source field | Verified native target | Evidence and exact status |
| --- | --- | --- |
| `level28:7837/7940/7941/8123/8272/8417 $.m_Materials[0]` | `(fileID5,pathID3) → resources.assets:3` | #75, six `pointers.status=resolved`, external row `resources.assets` |
| `resources.assets:3 Material` | `CONCRETE MAIN 0.2 doublebeton porowaty 0.2` | #75 + #85: Unity serialized Material object; **not a GPU surface** |
| `Material.m_Shader=(fileID1,pathID25)` | `globalgamemanagers.assets:25 Shader`, name **`XULM FULLFORWARD/Concrete 2019 MAIN`** | #85 joined resolved `pointers`, **no shipped variant selected/decoded for this draw** |
| `m_SavedProperties.m_TexEnvs[0]._MainTex=(fileID0,pathID248)` | `resources.assets:248 Texture2D`, name `doublebeton_diffuse-barcodezacieki` | #85 pointer resolved; UV0 scale **(0.10000000149, 0.10000000149)** and offset **(0,0)**; **no texels/format/encoding** |
| `level28:18622 LightmapSettings.m_Lightmaps[0].m_Lightmap=(fileID9,pathID2)` | `sharedassets28.assets:2 Texture2D` named `Lightmap-0_comp_light` | #85 link resolved; **no decoded atlas pixels or UV2 channel** |

**Source shader settings** from `resources.assets:3`: `m_ShaderKeywords=_STRIPESONOFF_ON`, `m_LightmapFlags=5`, `m_EnableInstancingVariants=true`, `m_DoubleSidedGI=false`, `m_CustomRenderQueue=-1`. Serialized float fields include `_Alpha=0.25`, `_DIFFUSE=0.5`, `_Emmisive=0.5`, `_RAMP_POWER=0.7200000286`, `_RAMP_SIZE=4.1599998474`, `_StripesOnOff=1`, `_SPEC_INTENSITY=0`; `_Color=(1,1,1,1)`, `_TINT=(1,0.80689638853,0,1)`, plus `_ShadowColor`, `_HighlightColor`, `_LocalAmbient`. **These are authored serialized inputs, not a claim that the rendered material is white/yellow, alpha blended, or uses standard Lambert illumination.** A proprietary `XULM` shader, keyword/stage selection, textures, lightmaps and Unity color pipeline determine the actual pixels.

All six Renderer→Mesh→submesh static bindings remain as independently proved by private #68:

| GO → Renderer | Mesh ID : submesh | Material | Verified UV2 atlas ST? |
| --- | --- | --- | --- |
| 336 → 7837 | 6 : 47 | resources.assets:3 | Yes: (0.1587031931, 0.1587031931, 0.7985754013, −0.0002501162) |
| 459 → 7940 | 7 : 48 | resources.assets:3 | Yes: (0.1587031931, 0.1587031931, −0.0002501162, 0.6481873989) |
| 461 → 7941 | 7 : 46 | resources.assets:3 | Not independently obtained |
| 673 → 8123 | 7 : 77 | resources.assets:3 | Not independently obtained |
| 839 → 8272 | 6 : 24 | resources.assets:3 | Not independently obtained |
| 1003 → 8417 | 6 : 32 | resources.assets:3 | Not independently obtained |

Every row has **4,638 source indices / 1,546 triangles**, serialized enabled. Scene runtime visible/selected state is still not proved by this static extraction. UV2 for the last four must not be guessed.

### SH-12 exact API boundary (no edits to SH-12-owned files)

```js
import {
  containersBuild28CargoMaterialBinding,
  containersBuild28ConcreteMaterialSource,
} from './render/material-model.js';
const b = containersBuild28CargoMaterialBinding(7837);
const src = containersBuild28ConcreteMaterialSource();

b.geometry; // {owner:'level28',meshPathId:6,staticSubmesh:47,indexCount:4638,triangleCount:1546}
b.nativeMaterialOwner; // 'resources.assets' (PROVED owner)
b.material.materialAsset; // {owner:'resources.assets',pathId:3,name,evidence,...}
src.shader; // {owner:'globalgamemanagers.assets',pathId:25,name:'XULM ...',nativeShaderProgramDecoded:false}
src.mainTexture; // {owner:'resources.assets',pathId:248,property:'_MainTex',uvScale:[.1,.1],...}
src.lightmapTexture; // {targetOwner:'sharedassets28.assets',targetPathId:2,...imagePixelsDecoded:false}
```

**Transport requirements:** preserve per-draw `rendererPathId`, `materialSlot=0`, exact Mesh:submesh identity, and `uv0` (the decoded texture sample coordinate will be `uv0 * mainTexture.uvScale + mainTexture.uvOffset` **when pixels/shader become available**). Do **not** use `_Color` as final display RGB, `_Alpha` as physical opacity, or UV0 as baked UV2. If UV2 source bytes arrive, carry a distinct vertex channel and apply each verified ST *only after* atlas owner/texels/encoding are resolved. No prefab enemy material may be inferred from cargo `resources.assets:3`.

### SH-05 exact integration contract (exclusive `main.js` / `renderer.js` / `levels.js`)

Use `containersBuild28CargoMaterialBinding(rendererPathId)` to log **source-resolved identity** on the local `?scene=containers` group draw, and `materialDrawPacket(b.material,{fallback:createGeneratedMaterial(...)})` for the **unchanged visibly generated color** until source shader+texture pixels can be loaded privately and used in a verified renderer. The packet now carries `materialAsset` (the source identity), while `colorProvenance='generated-fallback-not-mcd'`, `lightmapSamplingEnabled=false`, and `nativeMaterialMetadata.webShadingReady=false` remain explicit. Existing source-backed scene `fogStrength=0` from #95 is unchanged; ambient/GI, exposure, tonemap and dynamic point/spot light selection remain **unknown**, not auto-applied.

**P0 requested measurable next delta:** obtain *privately* actual `resources.assets:248` texels (source channel/format/encoding, stream locator), `globalgamemanagers.assets:25` shader variant/pass state or readable stage algorithm, and `sharedassets28.assets:2` lightmap pixels/UV2. Then build a local-only resource bridge and collect native/Web paired frames in SH-15. The next measurable target is source-textured container surfaces **versus** the current generated flat Web fallback, with pixel statistics at the same camera—not another synthetic test count. If only the references are present, keep the current visible fallback. One bounded private #85 query was used this cycle, no new runner or public source bytes.


## 2026-11-02 P0 — authentic EnemyMerged Red Crystal shader *identity*, visible diagnostic hook

**New source proof (not repeated bridge work):** private artifact `result.json` actually reopened for [research #93](https://github.com/TGrozner/superhot-research/issues/93) / `13139554254` (two enabled source `SkinnedMeshRenderer` records), [#95](https://github.com/TGrozner/superhot-research/issues/95) / `13141157351` (Material13 properties), and [#98](https://github.com/TGrozner/superhot-research/issues/98) / `13141163607` (qualified external Shader28 pointer). Existing #88/#90 validate private OBJ shape/triangle counts. The #95 float field SQL is truncated at 1200 characters, so only the *visible* fields reported here are asserted; no invented late property list. This is serialized data, **not runtime draw evidence**.

| Real Unity source | Exact identity and observed serialized state |
| --- | --- |
| `sharedassets0.assets:SkinnedMeshRenderer4748` | enabled; mesh `sharedassets0.assets:284 EnemyMerged` (source OBJ `EnemyMerged_0`: 5237 `v`, 2254 triangles), one material slot `(fileID0,pathID13)`, root bone2257, 60 bones, lightmap index65535 |
| `sharedassets0.assets:SkinnedMeshRenderer4749` | enabled; mesh `sharedassets0.assets:285 EnemyMergedHeadless` (4895 `v`, 2132 triangles), same material `(0,13)`, root bone2257, 59 bones, lightmap index65535 |
| `sharedassets0.assets:Material13` | `MAIN RedCrystalNuEnemyMaterial`; shader pointer `(fileID1,pathID28)`, **no serialized `m_TexEnvs` entries**, keyword `_ALLOWLOCALFOG_ON` |
| `globalgamemanagers.assets:Shader28` | pointer resolved, name **`XULM FULLFORWARD/Red Crystal`**; the selected pass-0 `DIRECTIONAL` program identities are now source-recovered and its default-focus static terms are active as documented below, while live globals and final output remain unverified |
| Serialized material input properties | `_Color=(0.720588207244873,0,0,1)`, `_EmissionColor=(0.5220588445663452,0,0,1)`, `_FogColor=(0.6838235259056091,0,0,1)`; `_IsEnemy=1`, `_Alpha=0`, `_AllowLocalFog=1`, `_FogDistance=5`, `_FogLength=7` |

**Important fog distinction:** `level28:RenderSettings18511.m_Fog=false` is source-serialized *scene-level Unity fog OFF*. Enemy material keyword `_ALLOWLOCALFOG_ON` and `_AllowLocalFog=1` are independent custom XULM shader inputs. The recovered pass proves a local-fog mix exists, but its per-vertex runtime inputs are not captured or bound in the active skin pass; scene fog OFF is not evidence that this custom term is zero. Likewise, `_Alpha=0` is a custom shader property, not proof of zero raster alpha: the compiled base pass writes opaque alpha. `_EmissionColor` is not assumed to add directly to `_Color`.

**Historical note:** the diagnostic-only limitations in this section describe the earlier static-OBJ stage. The active skinned/default-focus implementation and its narrower remaining limits are documented at the end of this file.

### New SH-13 API / exact independent SH-12 + SH-05 handoff

`src/render/material-model.js` now exports `enemyRedCrystalMaterialBinding(rendererPathId)` for **4748 or 4749 only**, and `enemyRedCrystalDiagnosticWebPacket(rendererPathId)`. The latter intentionally forwards raw serialized `_Color` to the existing Web material uniform *as a diagnostic display-sRGB experiment*:

```js
import {
  enemyRedCrystalMaterialBinding, enemyRedCrystalDiagnosticWebPacket,
} from './render/material-model.js';
const source = enemyRedCrystalMaterialBinding(4748);
// source.mesh: {owner:'sharedassets0.assets',pathId:284,
//   objGroup:'EnemyMerged_0',sourceVertexCount:5237,sourceTriangleCount:2254,
//   staticObjOnly:true,skinWeightsAvailable:false,poseProven:false}
// source.materialSource.material: {owner:'sharedassets0.assets',pathId:13,...}
// source.materialSource.shader: {owner:'globalgamemanagers.assets',pathId:28,...}
const diagnostic = enemyRedCrystalDiagnosticWebPacket(4748);
diagnostic.colorHex; // '#b80000' (round(_Color.r * 255); *NOT* native final RGB)
diagnostic.color; // [0.7205882072,0,0,1] — FORCE opaque diagnostic Web alpha
diagnostic.colorProvenance; // 'native-serialized-color-parameter-web-diagnostic-NOT-MCD-fragments'
```

**SH-12: no additional mesh code requested.** Current merged [#111](https://github.com/TGrozner/superhot-web/pull/111) `parseEntireObjIntoIndexedMesh` is sufficient for a privately selected original `EnemyMerged` OBJ, as long as source-triangle and bounds gates remain enforced and UnityPy's independently verified axis conversion is preserved. Never apply the cargo concrete `resources.assets:3` shader or UV2 lightmap atlas to this enemy. No bone weights, bind poses, animated skinned surface or runtime instance are proven by the OBJ.

**SH-05 alone** owns `main.js/renderer.js/levels.js`: after verified local `File` load and WebGL2 indexed upload, associate source renderer4748/mesh284 with `enemyRedCrystalDiagnosticWebPacket(4748).colorHex` for `renderer.drawPrivateMesh('enemy-merged',colorHex)` (renderer slot name and actual implementation are SH-05's decision). Count a distinct indexed enemy draw and show `STATIC NATIVE-SOURCE GEOMETRY — DIAGNOSTIC RED, UNRIGGED, NO NATIVE SHADER`. Position may be a clearly labeled diagnostic placement only; **do not** present it as a native Containers instance or modify the game progression automatically. Same hook for renderer4749/headless. Keep `fogStrength:0` only as the verified scene-level setting; do not implement the local fog branch without shader evidence. `#b80000` is an **input-palette delta** from an arbitrary Web red, not a measured native/Web pixel delta.

**Actual visual acceptance:** on `?scene=containers`, with owner-provided `.obj.gz`, verify `nativeEnemyLoaded=1`, `privateIndexedDraws` rising by one, a browser screenshot showing the enemy geometry, capture a same-camera *generated Web red* vs *source-param diagnostic red* pair, and calculate actual per-pixel delta/changed-pixel fraction in SH-15. Only after a native MCD capture at matched camera/pose/lighting may a native similarity score be claimed. Node CI on metadata cannot replace that observation.

**Separate Concrete texture / bake blocker:** existing [research #85](https://github.com/TGrozner/superhot-research/issues/85) owner-qualified `resources.assets:248` diffuse and `sharedassets28.assets:2` lightmap identities, but **no texels, encoding or UV2**. One bounded private issue [research #100](https://github.com/TGrozner/superhot-research/issues/100) has been requested to inspect **two exact Texture2D stream descriptors only**, not extract/copy pixels into this public repo. Its `result.json` must be inspected before any new claim. This request does **not** repeat #41/#50/#73/#75/#85. Keep all native binaries, shaders and images private.


### P0 native RGB24 diffuse / DXT5 lightmap stream discovery, PRIVATE #100 completed

The **only** new bounded private corpus query this cycle, [research #100](https://github.com/TGrozner/superhot-research/issues/100), run **41443954188**, artifact **13141079714**, returned SUCCESS. Its actual `result.json` was read: `operation=query`, exactly **2 rows**, `truncated=false`, both exact `Texture2D` owners. **This resolves actual stream offsets and compressed formats, not pixels.**

| Source texture | Unity serialized record | External payload location (private PC only) |
| --- | --- | --- |
| Concrete diffuse `resources.assets:248` | `128 × 128`, `m_TextureFormat=3` = **RGB24**, `m_MipCount=8`, `m_ColorSpace=1` | `resources.assets.resS` offset **59500780**, length **65535** bytes |
| Baked `sharedassets28.assets:2` | `2048 × 2048`, `m_TextureFormat=12` = **DXT5/BC3**, `m_MipCount=12`, `m_ColorSpace=1` | `sharedassets28.assets.resS` offset **0**, length **5592432** bytes |

The serialized `image data` field has zero inline bytes in both records; actual image bytes are **not present in any public artifact or this public repository**. The width/mip count and stream length independently cross-check format layout: `Σ_{level=0..7}(128>>level)^2*3 = 65535` RGB24 bytes; `Σ_{level=0..11} ceil(max(1,2048>>level)/4)^2*16 = 5592432` DXT5 bytes. These equations are tested using synthetic metadata only. Numeric `m_ColorSpace=1` is preserved as serialized; **Unity/runtime transfer/tonemapping is not inferred from it**.

The Unity enum numbers are documented as [RGB24 = 3](https://docs.unity.com/en-us/engine/6000.5/script-reference/unityengine/textureformat/rgb24) and [DXT5 = 12](https://docs.unity.com/en-us/engine/6000.6/script-reference/unityengine/textureformat/dxt5). They do not independently identify the selected MCD shader pass, the baked-lightmap decoding interpretation, or a native screenshot. The external resource paths/offsets are local original-file metadata, **not a request to publish game assets**.

**SH-05 exact first genuinely source-textured Web experiment (SH-05-owned files only):**

```js
import {
  containersBuild28ConcreteMaterialSource,
  decodeContainersConcreteRgb24Mip0,
} from './render/material-model.js';

const tex = containersBuild28ConcreteMaterialSource().mainTexture.nativeStream;
// Input: a user-selected LOCAL File object for the original resources.assets.resS.
// Never fetch from GitHub, commit it, send it to a server, or persist it.
const exactSection = await localResSFile.slice(
  tex.sourceByteOffset,
  tex.sourceByteOffset + tex.sourceByteCount,
).arrayBuffer();
const decoded = decodeContainersConcreteRgb24Mip0(exactSection);
// decoded.width=128, .height=128, .pixelsRgba=Uint8Array(65536)
// Bind via gl.texImage2D(...gl.RGBA,...decoded.pixelsRgba), with an
// explicitly generated DIAGNOSTIC UV-sampling shader in SH-05's renderer;
// sample uv0 * [0.10000000149,0.10000000149] + [0,0].
// Do not claim native XULM shading, mip/filter/origin or gamma equivalence.
```

Only the **first RGB24 mip** is decoded; lower mips remain in the private input and are ignored. The byte order is copied RGB→RGBA with alpha255, without a gamma transform or vertical flip. **Vertical orientation, native wrap/filter behavior, Unity gamma/color space and XULM shader vertex/fragment logic are still UNVERIFIED.** SH-05 should capture two **real browser screenshots** at the same camera, generated flat cargo vs source texel diagnostic, quantify changed pixels and frame p95, and label the experiment honestly. This is the shortest viable path to a *real source-image versus flat fallback visual delta* without inventing texture pixels.

**SH-12 contract:** preserve verified source UV0 for `Mesh6:g24/g47`, `Mesh7:g48` group draw ranges; do not replace with UV2. The decoded diffuse uses the source-authored `_MainTex` 0.1× UV0 transform. Atlas is DXT5/BC3, but **no native UV2 channel or atlas orientation has been transported**; do not decode/sample as if native until source-qualified UV2, bake encoding and original shader sample rules are recovered. Browser local texture upload, palette, shader draw belongs exclusively to SH-05, not SH-13.

No native screenshot, original texture bytes, actual browser draw with this PNG-equivalent stream, or 1:1 measurement has been observed. This PR adds metadata and a deterministic pure decoder, **not the GPU integration**.


### SH-13 P0 — native Concrete Point sampler versus the CURRENT Web trilinear pass (2026-11-02)

**Fresh direct source check (not a second corpus query):** Reopened the actual PRIVATE `result.json` from research [#41](https://github.com/TGrozner/superhot-research/issues/41) artifact `13134492119` and [#100](https://github.com/TGrozner/superhot-research/issues/100) artifact `13141079714`, and the original [#50](https://github.com/TGrozner/superhot-research/issues/50) artifact `13134569214` closure documentation. Source Texture2D `resources.assets:248` metadata, independent of inferred Unity runtime frames:

| Serialized Unity field | Native metadata | Web implementation at `main=09b14932` |
| --- | --- | --- |
| `m_TextureSettings.m_FilterMode` | **0 = Point**, verified 2018.4 Unity enum | `src/renderer.js` uses `LINEAR_MIPMAP_LINEAR` + `LINEAR` |
| `m_TextureSettings.m_WrapU/V` | **0 / 0 = Repeat / Repeat** | `REPEAT / REPEAT` (already consistent) |
| `m_TextureSettings.m_Aniso`, `m_MipBias` | 1, 0.0 | source sampler not currently represented in Web |
| `m_MipCount` | **8 original RGB24 levels**, 65,535 bytes total | Web invokes **`gl.generateMipmap()`** after PNG ImageBitmap upload, *new synthetic mips* |
| `m_ColorSpace` | serialized integer **1** | Web uses `SRGB8_ALPHA8` + a generated transfer shader; native transfer remains unverified |
| diffuse source | `resources.assets.resS` `[59500780, 59566315)` | UI asks for **PNG**, not the original `.resS` slice |

**Concrete discrepancy:** the authored diffuse has **Point** filtering, while the Web prototype currently displays interpolated/trilinear filtered pixels. Even using the original texture image as PNG, that produces a visible difference on high-frequency boundaries. In an intentionally synthetic black/white two-texel example, point sampling returns 255 and linear sampling returns 127.5 at the chosen boundary; this is a **calculated diagnostic delta**, NOT an MCD screenshot/1:1 claim. The source metadata does not prove an absence of runtime texture quality overrides or XULM sampler overrides.

**NEW SH-13 pure API (this PR):** `decodeContainersConcreteRgb24MipChain(exactBytes)` accepts exactly 65,535 private bytes and emits `levels[0..7]` with `{level,width,height,pixelsRgba,sourceByteOffsetWithinStream}`. No resampling, no synthesized pixels, no native assets in Git. Assumes a conventional largest-first contiguous Unity mip order; original byte content/UV orientation and output color transfer remain unobserved. `containersConcreteGpuSamplerPacket({mipLevels:8})` returns enum names `NEAREST_MIPMAP_NEAREST`, `NEAREST`, `REPEAT`, `REPEAT`, `generateMipmaps:false`; `mipLevels:1` disables source-mip sampling and returns `NEAREST` minification. Old single-mip decoder stays backward-compatible.

**SH-05 ONLY — exact native RGB24 File API/GPU integration hook** (this lane **does not modify** `src/main.js`, `src/renderer.js`, `src/levels.js`):

```js
import {
  containersBuild28ConcreteMaterialSource,
  decodeContainersConcreteRgb24MipChain,
  containersConcreteGpuSamplerPacket,
} from './render/material-model.js';

const src=containersBuild28ConcreteMaterialSource().mainTexture.nativeStream;
// localResSFile selected via <input type=file>; never HTTP upload, storage or Git.
if(localResSFile.size < src.sourceByteOffset + src.sourceByteCount) {
  throw new RangeError('Original local resources.assets.resS is truncated');
}
const bytes=await localResSFile.slice(
  src.sourceByteOffset, src.sourceByteOffset + src.sourceByteCount,
).arrayBuffer();
const decoded=decodeContainersConcreteRgb24MipChain(bytes);
const sampler=containersConcreteGpuSamplerPacket({mipLevels:decoded.mipsDecoded});
// Inside SH-05-owned renderer while gl.TEXTURE_2D is bound:
gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
for (const mip of decoded.levels) {
  // RGBA8 is an *explicit linear diagnostic hypothesis*; SRGB8_ALPHA8 is
  // an alternate hypothesis. m_ColorSpace=1 does not prove MCD's transfer.
  gl.texImage2D(gl.TEXTURE_2D, mip.level, gl.RGBA8,
    mip.width, mip.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, mip.pixelsRgba);
}
gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl[sampler.minFilter]);
gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl[sampler.magFilter]);
gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl[sampler.wrapS]);
gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl[sampler.wrapT]);
gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAX_LEVEL,sampler.maxLevel);
// DO NOT call gl.generateMipmap(); source chain already contains eight levels.
// UV0 ST: * [0.10000000149, 0.10000000149] + [0,0] (source authored).
```

**SH-12 boundary:** keep original OBJ mesh UV0 and submesh separation. These RGB24 mip levels are diffuse UV0; they do not supply baked UV2 or solve the unrelated BC3 lightmap. `sharedassets28.assets:2` is DXT5 with 12 source mips, but its texels, RGBM/XULM interpretation, UV2 and bake/lighting remain separate, so no fake lightmap sample is permitted.

**Measurement request for SH-05 / SH-15:** with the owner's PRIVATE `.resS` and authorized OBJ, run a fixed Containers camera 1920×1080 DPR1; screenshot A with current trilinear/generated mips and B with exact source mips plus Point sampler, same RGB transfer choice. Compute changed-pixel fraction and MAE over cargo pixels and compare p95 frame time; log sampler settings and GPU draw count. Then compare against an actual MCD native frame **only after matching native camera/pose/material**. Until GPU A/B is executed, this remains a concrete, source-proved sampler mismatch plus an analytic synthetic demonstration, **not a measured visual result**. No second bridge request is necessary.


### P0 native build28 BC3 lightmap atlas — original compressed pixels, local only (2026-11-02)

**Actual primary source re-read, no duplicate bridge request:** private research [#41](https://github.com/TGrozner/superhot-research/issues/41), artifact `13134492119` original `result.json`: `level28:18511` RenderSettings has `m_Fog=false`; `level28:18622` lightmap slot0 points through owner-qualified `fileID=9,pathID=2`. Private [#50](https://github.com/TGrozner/superhot-research/issues/50) artifact `13134569214` original `result.json` was READ: rendering/closure/README.md, first 150 lines; its pass-program map, cubemap streams and material closure do not themselves establish pixel parity. Private [#85](https://github.com/TGrozner/superhot-research/issues/85) artifact `13140636598` actual `result.json` closes the material and lightmap owner-qualified pointers; [#100](https://github.com/TGrozner/superhot-research/issues/100) artifact `13141079714` actual `result.json`, **2 rows, truncated=false**, provides source `Texture2D` fields and compressed stream range. All four existing requests were reused, **none rerun**.

**Exact source-proved atlas descriptor:** `sharedassets28.assets:2 Lightmap-0_comp_light`, 2048×2048, Unity TextureFormat `12` = DXT5/BC3, `m_MipCount=12`, source file `sharedassets28.assets.resS` offset **0**, length **5,592,432 bytes**. Serialized `m_TextureSettings`: **FilterMode=1 Bilinear**, **WrapU=1 / WrapV=1 Clamp**, `m_Aniso=3`, `m_MipBias=0`, `m_StreamingMipmaps=true`, `m_ColorSpace=1`. Unlike the Concrete diffuse `resources.assets:248` (Point/Repeat, RGB24), lightmap source filtering is Bilinear/Clamp. These are **authored Texture2D fields**, not verified effective original runtime device settings. Note that Unity source's `m_ColorSpace=1` does not by itself establish XULM's texture sampling, RGBM reconstruction, gamma or exposure.

**New strictly local source-block API** in `src/render/material-model.js`:

```js
import {
  containersBuild28ConcreteMaterialSource,
  sliceContainersBuild28LightmapBc3Mips,
  containersBuild28LightmapBc3GpuPacket,
} from './render/material-model.js';

// SH-05-only File API: owner-selected ORIGINAL sharedassets28.assets.resS.
// No HTTP fetch, upload, local storage or committed game asset.
const meta=containersBuild28ConcreteMaterialSource().lightmapTexture.nativeStream;
if(localResSFile.size<meta.sourceByteOffset+meta.sourceByteCount) {
  throw new RangeError('Original local lightmap resS is truncated');
}
const raw=await localResSFile.slice(
  meta.sourceByteOffset,meta.sourceByteOffset+meta.sourceByteCount,
).arrayBuffer();
const originalBlocks=sliceContainersBuild28LightmapBc3Mips(raw);
// originalBlocks.levels: 12 Uint8Array views, exact BC3 blocks,
// mip0 2048x2048/4194304 bytes; mip11 1x1/16 bytes.
// All 12 compressed levels sum to exactly 5592432 bytes.
// No original pixels are present in code or public tests.

const diagnostic=containersBuild28LightmapBc3GpuPacket({
  colorTransfer:'unorm-diagnostic', // ALTERNATE: 'srgb-diagnostic'
  mipLevels:12,
});
const extension=gl.getExtension(diagnostic.extensionName);
if(!extension) throw new Error('BC3 extension unavailable, no fake fallback');
const texture=gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D,texture);
for(const mip of originalBlocks.levels) {
  gl.compressedTexImage2D(gl.TEXTURE_2D,mip.level,
    extension[diagnostic.internalFormatName],
    mip.width,mip.height,0,mip.compressedBytes);
}
gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl[diagnostic.minFilter]);
gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl[diagnostic.magFilter]);
gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl[diagnostic.wrapS]);
gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl[diagnostic.wrapT]);
gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAX_LEVEL,diagnostic.maxLevel);
// NO gl.generateMipmap(): original BC3 chain is already complete.
```

**Superseded on 2026-11-02 by the source-backed active path below.** The diagnostic-only restriction was correct while UV2 and the compiled bake decode were unknown; it no longer describes the private browser package. The active browser scene now reuses the raw-BC3 helpers above to upload all 12 source mip levels where S3TC is supported, with a local UnityPy-decoded mip-0 PNG fallback otherwise.

### Active Containers Concrete MAIN forward path — source composition, globals and textures (2026-11-02)

The former bake-only implementation was incomplete. Both the source BC3 chain and its UnityPy PNG mip-0 fallback produced the same dark result because texture transfer was not the missing term: the compiled Concrete pass adds the decoded bake to a large local-ambient accumulator and then runs its pore/microseam, directional, stylized-color and local-fog compositor. Row orientation and the unresolved native resource-view transfer remain valid comparison questions, but neither explains a failure shared by raw BC3 and decoded PNG.

The active path remains connected to the schema-1 private scene package:

- `extract.py` retains exact source `TEXCOORD1`, renderer `m_LightmapTilingOffset`, COLOR0 and the full BC3 RGBM atlas contract described above. It now also recovers source TANGENT0 from Unity vertex data. Browser conversion is `(-x,y,z,-w)`: X follows the already-mirrored geometry and W flips the tangent-frame handedness. All 121 lightmapped `resources.assets::3` world draws have source UV0, UV2, normals and TANGENT0; 120 have source COLOR0, while the one source-absent COLOR0 uses the graphics API's `(0,0,0,1)` generic attribute rather than invented mesh data.
- Three source global textures are package assets, still private: `sceneConcreteMicroseam` (`resources.assets::227`, PNG SHA-256 `cc7cee10a6b682c79194ab62863eb1fa7cfc21f7f8420ece018d751332fc309d`), `sceneConcretePore` (`resources.assets::185`, `9a7639a3b1e219a5f3d5a9cd43efb55252d4fd079ca000011a783cc741616136`) and `sceneConcreteFogGradient` (`sharedassets2.assets::8`, `ae93788dc13f6bfb46bbe07a585775caf6e7965d25f9a08b81f0ce8074fa004a`). The first two use Bilinear/Repeat; fog uses Bilinear/Clamp. These PNGs carry authentic mip 0; source mips for pore and microseam are not claimed.
- The private browser asset map must expose those three IDs in addition to `scenePackage`, `sceneLightmapBc3`, `sceneLightmap_000` and the existing material textures. No public asset or original shader byte is embedded in the renderer.
- The regenerated private package is `rendering/closure/browser-scene/package.json.gz`, SHA-256 `374673814c719e633d956ebfa640e5e22e9a21be340de9f1ec5f44c647b82463`; decompressed SHA-256 `74b581a9703925fe897f341573b9ef7ef21907a52926642f0e49276fd3a14fa0`. It contains 68 meshes, 382 instances, 21 textures and one source lightmap.

Source authority is the exact `FORWARDBASE DIRECTIONAL LIGHTMAP_ON` fragment program `rendering/blobs/2a/2ab2b7c3fd426d7e063c40b0144bd75d4dd19175c1b2ad0ed51be7731e566d2b.dxbc.txt` and vertex program `rendering/blobs/24/2436a3f7c116ed34559b6c47aff415ccc5dcbb524b7725fabab3903372177bdc.dxbc.txt`. The clean Web formula reconstructs, in compiled order:

1. `_MainTex` seam gating from UV0/world-XZ and COLOR0 magenta control.
2. Microseam address/sample and distance-blended triplanar pore normal.
3. `3 * (_LightLocalAmbient.a * _LightLocalAmbient.xyzx) * _LightLocalAmbientMultiplier - 3 * (_LightLocalMinusAmbient.a * _LightLocalMinusAmbient.xyzx)`, optional COLOR0-red dynamic ambient, and `lightmap.rgb * (lightmap.a * 5)`, followed by the compiled `vec4(0.2,0.2,0.2,0.25)` scale.
4. The compiled pore power, directional normal response, cap/rim/microseam bands, screen-space stripe, COLOR0 blue controls and opaque output.
5. The compiled local distance fog and source gradient lookup.

The source `level28::18730` `SetLocalAmbient` component supplies `_LightLocalAmbient=(0.8602941036,0.8602941036,0.8602941036,1)`, multiplier `1.1000000238`, `_LocalDynamicConcreteAmbient=(0.2080811411,0.2437618971,0.2641509175,1)`, local fog `(0.7019608021,0.8549019694,0.9176470637,1)`, scale `35`, power `1`, secondary distance `25`, ground fog `0`, and attenuation-outside-shadow-distance `0`. `SetLocalAmbient.Start` sets `_LocalShowFog=1`. The recovered realtime directional transform gives browser direction-to-light `(-0.3516539250,0.8712174635,-0.3425195591)`. `_LightLocalMinusAmbient` remains the zero engine default: no writer occurs in the recovered managed corpus.

`native-world-pass.js` selects this composition only for the exact Concrete MAIN source material plus authentic UV0, UV2, normals, tangent and lightmap. It reports `sourceConcreteLightmappedDrawCalls`; the expected Containers root count is 121. The two other lightmapped draws use distinct Cutoff/focusable shader families and remain explicitly outside this program rather than borrowing Concrete MAIN equations.

**Exact remaining scope:** four serialized-active `XulmFalseLight` components compete for three runtime slots, so `_GlobalFalseLight0/1` slot order and current-frame values require a matched runtime capture and are omitted. Katana recall, void/glitch/screenshot/vertex deformation, the moving stripe's native clock phase, runtime material property blocks, non-Concrete lightmap variants, pore/microseam source mips beyond PNG mip 0, post-processing/exposure and final framebuffer transfer also remain outside this static initial composition. No matched native-camera pixel comparison has yet established whole-frame parity; `nativeLightingParity` therefore remains false.

**Browser observation after integration:** the default root rendered360 world
instances/185037 triangles, including121 source Concrete MAIN compositions,
zero unsupported Concrete-composition draws and239 generic-lighting draws.
The dark bake-only appearance was replaced by the source ambient/fog composition.
The normal S3TC path uploaded all12 BC3 levels; an independently launched
S3TC-disabled browser used the PNG mip-0 fallback (`s3tc-unavailable`).
Both produced visible frames with WebGL error0 and no page errors. These checks
do not establish native color-transfer, shadows or matched whole-frame parity.

### Active EnemyMerged Red Crystal default-focus base pass (2026-11-02)

The GPU-skinned character no longer feeds generated Web Lambert RGB only into the recovered final compositor. `native-skin-pass.js` now consumes the package's authentic `mesh.uv0` next to the unchanged positions, normals, weights, compact joint palette and v8 clip/action sampling. The new clean `red-crystal-pass.js` formula is called by the live skinned fragment shader; it is not a detached diagnostic helper.

Private source authority is `globalgamemanagers.assets::28`, pass tag **FORWARDBASE**, keyword **DIRECTIONAL**: vertex program SHA-256 `71feb502061abdcf39ba56c30b3ceff9275cc15ec06dfe61f6df817add331614` and fragment program SHA-256 `6491cc828a2024182a3dc26d2d682c975ad5fefd47fd421d74916f0ee033f61d`. The clean public implementation does not contain the original DXBC or an authored/decompiled shader dump. Material authority is `sharedassets0.assets::13` (`MAIN RedCrystalNuEnemyMaterial`), whose serialized `_Focus`, `_HotswitchFocus` and `_BlackFocus` are all zero. The active reconstruction therefore follows that compiled default-focus branch:

1. the source UV0 cell/gate equations and exact constants, including object-space camera-forward, world camera-forward and view-space normal seeds derived from the active model/view-projection matrices;
2. compiled view-reflection and reflected-light highlight powers from skinned world normal, skinned world position, caller camera position and the source directional vector;
3. the moving screen-space fifth-power band using `_GlobalUnscaledTime × 3`;
4. the compiled world-phase/directional gate using the recovered Containers direction-to-light `(-0.3516539250, 0.8712174635, -0.3425195591)`;
5. the compiled distance blend toward `(0.77, 0.05, 0.12)`, polynomial RGB remap, conditional green-channel term and opaque alpha.

Material13 serializes `_HDRPhase=0` and `_HDRPhaseB=0`. The remaining COLOR0 threshold `(r−b>0.7 && r>0.7 && g>0.7)` was checked directly against the original Mesh284/285 using UnityPy MeshHandler:5237/4895 RGBA values, channel3 dimension4 format2 stream1, UNorm8 divided by255,30 distinct colors in each mesh. **Zero vertices match the threshold in either mesh.** Thus this additive term is source-proven zero for these two original meshes and the serialized default HDR state; omitting its GPU attribute does not discard a nonzero contribution here. This does not generalize to other meshes or runtime HDR changes.

`shaderTime` and `cameraPosition` are explicit draw inputs. Existing callers remain valid: absent `shaderTime` uses animation sample time and absent camera uses the world origin, with both fallbacks reported as unmatched. Default gameplay now supplies the Web unscaled run clock and current Web camera, but the v5 six-pose native manifest contains no shader-global/time capture. Consequently the moving band phase is still not matched to the original six images even when geometry/pose is.

The compiled default branch needs no material texture: Material13 has zero `m_TexEnvs`; `_GlobalGlitchMap` belongs to the inactive focus path. A package without source UV0 retains the previous generated-lit fallback and its legacy report shape; the real merged/headless animated-v8 packages contain source UV0, enter the recovered path and report `redCrystalSourceDefaultForward=true`.

**Per-term remaining boundaries:** `_GlobalFalseCrystalLight0..5`, local-fog varying production, focus/hotswitch/black-focus transitions and `_GlobalGlitchMap` are omitted without invented values. Forward-add lights, shadow caster output, runtime material property blocks, void/glitch/screenshot deformation, local fog gradient binding, post-processing/exposure and final framebuffer transfer remain outside this pass. The static Containers directional vector is source-recovered but its applicability to every native reference pose is not runtime-proved. Generic package diagnostics conservatively retain COLOR0 among unbound inputs; its default contribution has now been independently proved zero specifically for original Mesh284/285.

The v5 reference manifest establishes original-engine BakeMesh, Gamma color space, Direct3D11, ARGB32 and AA1, and identifies this exact material/shader, but records no shader clock or globals. Existing six-pose silhouette IoU remains geometry evidence only; future RGB comparisons must label clock/global phase unmatched unless a corresponding native capture supplies them. `materialParity` and `redCrystalNativeInputsVerified` therefore remain false.

**Observed after integration:** actual Chromium/WebGL2 compiled and drew the
recovered path at the root and in the character inspection view, with visible
red/black striations and GL error0. All six960×540 pose draws used the original
view/projection, explicit Web shader time0 and source UV0; silhouette metrics
were unchanged from the v8 comparison. Foreground RGB MAE spans0.07162–0.08074,
but the native shader-global phase and light state are unmatched. One pose's
RGB difference increased despite better material structure; these metrics are
not a monotonic fidelity score. Exact per-pose values are in `visual.md`;
images and the `native-web-red-crystal-comparison-v1.json` report remain private.

The later PR142 normal fix is retained in this full composition: only the
reflection normal is flipped toward the camera. Concrete seam/diffuse inputs
retain their geometric normal, including the recovered unnormalized Concrete
varying. The merged root again rendered360 world draws/121 Concrete draws with
Red Crystal active and GL error0. Source-text regex checks of old GLSL variable
names were removed rather than repinned to the reconstructed shader.

### Visible world and player-weapon composition

The default draw now consumes reconstructed BlackCrystal reflection/specular/fog,
static RedCrystal hazards, the fence's serialized alpha cutoff and monitor atlas
animation. Qualified opaque/cutout passes apply source blend/depth state and restore
inherited state. World and weapon clocks are supplied by the actual main loop.
The latest root drew121 full Concrete,94 BlackCrystal,5 static RedCrystal,1 cutout
and1 monitor with GL error0;51 compositions remain partial, including48 unlightmapped
Concrete draws. This is not proof of all shader variants or postprocessing parity.

The actual first-person baked hand/glock uses mesh149/material10/shader8 and a
separate20° source projection, with foreground depth compression. It does not
reuse the dropped-pistol mesh230 or its attachment chain. Root screenshots and
a controlled yaw/pitch+shot scenario show the corrected forward-facing weapon.
Private source package SHA-256:
`ecff89ced2ea574f8b95824ee8d29fa3c0cae80f8f8611060db1cb3f4eefa0af`.
