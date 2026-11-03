import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Source-wiring checks only. SH-14 has separate synthetic GPU tests; real
// Dojo screenshot, camera parity and player Animator execution remain unverified.
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const renderer=readFileSync(new URL('../src/renderer.js',import.meta.url),'utf8');

test('Dojo hands WebGL2 pass is replaced/disposed and accepts source descriptors only',()=>{
  assert.match(renderer,/createDojoPlayerAnimationPass\(gl, \{ playerPacket, rig, clips \}\)/);
  assert.match(renderer,/nativePlayerHands\?\.dispose\(\)/);
  assert.match(renderer,/function replaceDojoPlayerHands/);
  assert.match(renderer,/const sourceUnarmed=heldItem == null && profileId === 'unarmed'/);
  assert.match(renderer,/\(!sourceUnarmed && heldItem\?\.isKatana !== true\)/);
  assert.match(renderer,/heldItem, profileId, phase, sourceClipTime/);
  assert.match(renderer,/drawCalls \+= report\.handsDrawCalls/);
  assert.match(main,/renderer\.replaceDojoPlayerHands\(null\)/);
  assert.match(main,/renderer\.replaceDojoPlayerHands\(packet, rig\)/);
});

test('Dojo live packet must identify source scene and select authored item profiles, no invented global clip alias',()=>{
  assert.match(main,/isDojoBuild10Source\(prepared\.source\)/);
  assert.match(main,/createNativePlayerAnimation\(packet\)/);
  assert.match(main,/nativeHandsController\.equip\(heldId, \{ animate:heldId !== 'unarmed' \}\)/);
  assert.match(main,/nativeHandsEquippedId !== heldId/);
  assert.doesNotMatch(main,/packet\.profiles\?\.katana/);
  assert.doesNotMatch(main,/nativeHandsCameraLocal/);
  assert.match(main,/DOJO_HANDS_SOURCE_PACKET_REJECTED_FALLBACK/);
});

test('accepted katana source pose uses the exact Web camera basis, sampled blade socket and safe static fallback',()=>{
  assert.match(main,/nativeHandsController\.update\(dt, tick\.appliedTimeScale\)/);
  assert.match(main,/nativeHandsController\.action\('attack'\)/);
  assert.match(main,/nativeHandsController\.action\('throw'\)/);
  assert.match(main,/const heldItem=nativeItems\.held/);
  assert.match(main,/projectDojoPlayerFrame\(\{\s*pose:sample,heldItem,cameraWorldMatrix/);
  assert.match(main,/modelMatrix:frame\.modelMatrix,descriptor:frame\.descriptor/);
  assert.match(main,/receipt\?\.handsDrawCalls>0/);
  assert.match(main,/if\(frame\.bladeSocketAvailable\) sampledKatanaLocalMatrix=frame\.itemCameraLocalMatrix/);
  assert.match(main,/const staticHeldMatrix=heldItem\.heldMatrix/);
  assert.match(main,/if\(sampledKatanaLocalMatrix\)heldItem\.heldMatrix=sampledKatanaLocalMatrix/);
  assert.match(main,/finally \{\s*heldItem\.heldMatrix=staticHeldMatrix/);
  assert.match(main,/for\(const draw of nativeItemDraws\(nativeItems,camera\)\.held\)/);
  assert.match(main,/webKatanaSocketApplied:Boolean\(sampledKatanaLocalMatrix\)/);
  assert.match(main,/nativeHands: nativeHandsStats/);
  assert.doesNotMatch(main,/katanaMeshLocalMatrix:sample\.itemMatrix/);
  assert.doesNotMatch(main,/phase:'swing'|phase:"swing"/);
});

test('real unarmed throw source sample can draw hands but cannot leave behind a katana',()=>{
  assert.match(main,/if\(!state\.weapon && nativeHandsController && nativeHandsEquippedId==='unarmed'\)/);
  assert.match(main,/projectDojoPlayerFrame\(\{\s*pose:sample,heldItem:null,cameraWorldMatrix/);
  assert.match(main,/heldItem:null,profileId:frame\.profileId/);
  assert.match(main,/DOJO_UNARMED_HANDS_DRAWN_WEB_CAMERA_DIAGNOSTIC_NOT_1_TO_1/);
  assert.match(renderer,/const sourceUnarmed=heldItem == null && profileId === 'unarmed'/);
});
