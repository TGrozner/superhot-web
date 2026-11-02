# SH-13 — Materials and lighting: source-aware Web contracts

**Status (2026-11-02):** pure, testable contracts for generated Web material
colors, lightmap UV2 transforms, directional/ambient shading, linear fog,
exposure and color-space experiments. **No native MCD material color,
shader, texture, lightmap image, lighting/fog, exposure or postprocessing
has been reproduced or visually validated.** New modules are not yet wired
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
