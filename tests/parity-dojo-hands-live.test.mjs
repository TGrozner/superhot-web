import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The source adapter already has GPU-mock tests in character-native-player-animation.
// These checks cover the SH-05 executable wiring only; no owner-local assets
// or browser pixels are available to hosted CI.
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const renderer=readFileSync(new URL('../src/renderer.js',import.meta.url),'utf8');

test('Dojo hands pass is created on the existing WebGL2 context and disposed on replacement',()=>{
  assert.match(renderer,/createDojoPlayerAnimationPass\(gl, \{ playerPacket, rig, clips \}\)/);
  assert.match(renderer,/nativePlayerHands\?\.dispose\(\)/);
  assert.match(renderer,/function replaceDojoPlayerHands/);
  assert.match(renderer,/if \(!nativePlayerHands \|\| heldItem\?\.isKatana !== true\) return null/);
  assert.match(renderer,/drawCalls \+= report\.handsDrawCalls/);
  assert.match(main,/renderer\.replaceDojoPlayerHands\(null\)/);
});
test('live source packet must carry exact Dojo identity, explicit clips and authored camera-local matrix',()=>{
  assert.match(main,/prepared\.source\.sceneBuildIndex === 10/);
  assert.match(main,/prepared\.source\.serializedOwner === 'level10'/);
  assert.match(main,/\.endsWith\('\/SHRL_Dojo2\.unity'\)/);
  assert.match(main,/typeof clips\?\.held === 'string'/);
  assert.match(main,/typeof clips\?\.swing === 'string'/);
  assert.match(main,/const modelMatrix = multiplyMatrices\(basis, nativeHandsCameraLocal\)/);
  assert.match(main,/nativeHandsStatus = 'DOJO_HANDS_SOURCE_CLIPS_OR_MATRIX_MISSING'/);
});
test('a held katana requests sampled hands without inventing a swing, pistol hands or second sword',()=>{
  assert.match(main,/if \(nativeItems\.held\.isKatana && nativeHandsCameraLocal\)/);
  assert.match(main,/phase:'held'/);
  assert.match(main,/sourceClipTime:state\.worldClock/);
  assert.match(main,/for\(const draw of nativeItemDraws\(nativeItems,camera\)\.held\)renderer\.drawNativeInstance/);
  assert.match(main,/nativeHands: nativeHandsStats/);
  assert.match(main,/nativeHandsStatus/);
  assert.match(renderer,/sourceClipTime, modelMatrix/);
  assert.doesNotMatch(main,/phase:'swing'|phase:"swing"/);
});
