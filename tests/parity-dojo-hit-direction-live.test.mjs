import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// SH-05 integration guard: SH-14 exercises the actual per-actor skin runtime.
// This test ensures the live gameplay/renderer call chain supplies accepted
// stun evidence instead of mistaking the victim collision point for an origin.
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const renderer=readFileSync(new URL('../src/renderer.js',import.meta.url),'utf8');

test('Dojo accepted nonlethal stun reaches actor skin as live incoming direction and event ID',()=>{
  const contact=main.slice(main.indexOf('function applyNativeEnemyContact('),
    main.indexOf('// Normal source Kill toggles'));
  assert.ok(contact.length>0);
  assert.match(contact,/if\(!result\.actions\.some\(other=>other\.type==='kill'\)\)/);
  assert.match(contact,/enemy\.hitIncomingDirection=Number\.isFinite\(speed\) && speed>1e-6/);
  assert.match(contact,/enemy\.hitEventId=\(enemy\.hitEventId\?\?0\)\+1/);
  const draw=main.slice(main.indexOf('function drawEnemy('),main.indexOf('  const { x,z }=enemy;',main.indexOf('function drawEnemy(')));
  assert.match(draw,/const activeHit=!dying && animation\.state==='hit' && enemy\.reaction\?\.stunRemaining>0/);
  assert.match(draw,/hitIncomingDirection: activeHit \? \(enemy\.hitIncomingDirection\?\?null\) : null/);
  assert.match(draw,/hitEventId: activeHit \? \(enemy\.hitEventId\?\?null\) : null/);
  assert.doesNotMatch(draw,/hitOrigin:\s*hit\.point/);
  const skin=renderer.slice(renderer.indexOf('function drawNativeActorSkin('),
    renderer.indexOf('let nativePlayerHands'));
  assert.match(skin,/if \(hitIncomingDirection !== null\) pose\.hitIncomingDirection = hitIncomingDirection/);
  assert.match(skin,/if \(hitEventId !== null\) pose\.hitEventId = hitEventId/);
});