import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Source-wiring regression only. GPU visibility and native camera parity need
// a real owner-local browser/source-paired capture, never this Node test.
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

test('SH-05 Dojo hands consume source item profiles, applied clock and controller descriptor', () => {
  assert.match(main, /createNativePlayerAnimation\(packet\)/);
  assert.match(main, /renderer\.replaceDojoPlayerHands\(packet, rig\)/);
  assert.match(main, /nativeHandsController\.equip\(heldId, \{ animate:heldId !== 'unarmed' \}\)/);
  assert.match(main, /nativeHandsController\.update\(dt, tick\.appliedTimeScale\)/);
  assert.match(main, /nativeHandsController\.action\('attack'\)/);
  assert.match(main, /nativeHandsController\.action\('throw'\)/);
  assert.match(main, /const modelMatrix = multiplyMatrices\(basis, sample\.handsMatrix\)/);
  assert.match(main, /descriptor:sample\.descriptor/);
  assert.match(main, /nativeItemDraws\(nativeItems,camera\)\.held/);
  assert.doesNotMatch(main, /packet\.profiles\?\.katana/);
  assert.doesNotMatch(main, /nativeHandsCameraLocal/);
});
