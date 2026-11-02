# SH-13 — Materials and lighting: source-aware Web contracts

**Status (2026-11-02):** owner-qualified source metadata for six genuine Containers renderers, plus pure contracts for generated Web material
colors, lightmap UV2 transforms, directional/ambient shading, linear fog,
exposure and color-space experiments. **The native material, shader and texture references are now owner-resolved (#75/#85); their executable shader/pixel payloads, runtime selection and resulting MCD surface appearance remain UNVERIFIED. No native material shading, lightmap image, exposure or postprocessing has been reproduced or visually validated.** New modules are not yet wired
into the browser renderer. SH-05 owns that integration.

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
