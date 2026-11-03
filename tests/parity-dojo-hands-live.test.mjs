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
  assert.match(renderer,/if \(!nativePlayerHands \|\| heldItem\?\.isKatana !== true\) return null/);
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

test('accepted katana attack/throw and applied clock feed real source pose; static sword remains until socket basis proof',()=>{
  assert.match(main,/nativeHandsController\.update\(dt, tick\.appliedTimeScale\)/);
  assert.match(main,/nativeHandsController\.action\('attack'\)/);
  assert.match(main,/nativeHandsController\.action\('throw'\)/);
  assert.match(main,/if \(nativeItems\.held\.isKatana && nativeHandsController/);
  assert.match(main,/const modelMatrix = multiplyMatrices\(basis, sample\.handsMatrix\)/);
  assert.match(main,/descriptor:sample\.descriptor/);
  assert.match(main,/for\(const draw of nativeItemDraws\(nativeItems,camera\)\.held\)renderer\.drawNativeInstance/);
  assert.match(main,/nativeHands: nativeHandsStats/);
  assert.match(main,/DOJO_HANDS_DRAWN_WEB_CAMERA_DIAGNOSTIC_NOT_1_TO_1/);
  assert.doesNotMatch(main,/katanaMeshLocalMatrix:sample\.itemMatrix/);
  assert.doesNotMatch(main,/phase:'swing'|phase:"swing"/);
});
