import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareNativeScene } from '../src/scenes/native-scene-local.js';

// Entire scene and animation object below are authored test fixtures.
// No original Unity model, animation, texture, shader or source bytes.
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const rgba = [0, 0, 0, 1];
function syntheticScene(playerAnimation) {
  return {
    schemaVersion: 1,
    coordinateSpace: {
      geometry: 'right-handed browser geometry; finalized UnityPy OBJ mirrors source Unity X',
      matrices: 'flat column-major arrays, column vectors, Float32Array-compatible',
      browserFromUnity: 'browserWorld = H * sourceUnityWorld * H, H=diag(-1,1,1,1)',
    },
    source: {
      sceneBuildIndex: 10,
      scenePath: 'Tests/SyntheticDojo.unity',
      serializedOwner: 'level10',
    },
    initialEquipment: { armed: false },
    meshes: [],
    materials: [],
    textures: [{ id: 'authored_texture' }],
    lightmaps: [],
    concreteLighting: {
      schema: 'mcd-concrete-main-forward-v1',
      sourceMaterial: 'resources.assets::3',
      sourceShader: 'globalgamemanagers.assets::25',
      variant: 'FORWARDBASE DIRECTIONAL LIGHTMAP_ON',
      textures: {
        microseamTextureId: 'authored_texture',
        poreTextureId: 'authored_texture',
        fogGradientTextureId: 'authored_texture',
      },
      globals: {
        lightLocalAmbient: rgba,
        lightLocalMinusAmbient: rgba,
        lightLocalAmbientMultiplier: 1,
        localDynamicConcreteAmbient: rgba,
        localAttenuationOutsideShadowDistance: 1,
        localShowFog: 1,
        localFogColor: rgba,
        localFogScale: 1,
        localFogPower: 1,
        localShowGroundFog: 0,
        localGroundFogColor: rgba,
        localGroundFogZero: 0,
        localGroundFogScale: 1,
        localSecondaryFogDistance: 0,
        worldSpaceLightDirection: [0, 1, 0],
      },
    },
    cameras: [{ id: 'authored_camera', worldMatrix: identity, initial: { enabledAndActive: true } }],
    instances: [],
    ...(playerAnimation === undefined ? {} : { playerAnimation }),
  };
}

test('Dojo scene preparation preserves its optional authored first-person animation handoff', () => {
  const animation = {
    profiles: { authoredKatana: { attackDelay: 0.5 } },
    fixture: 'not a native animation or controller',
  };
  const source = syntheticScene(animation);
  const prepared = prepareNativeScene(source);
  assert.equal(prepared.source.sceneBuildIndex, 10);
  assert.equal(prepared.source.serializedOwner, 'level10');
  assert.strictEqual(prepared.playerAnimation, animation);
  assert.strictEqual(source.playerAnimation, animation);
});

test('missing first-person animation stays absent, without generated poses', () => {
  const prepared = prepareNativeScene(syntheticScene(undefined));
  assert.equal(prepared.playerAnimation, null);
  assert.equal(prepared.instances.length, 0);
  assert.equal(prepared.auxiliaryInstances.length, 0);
});
