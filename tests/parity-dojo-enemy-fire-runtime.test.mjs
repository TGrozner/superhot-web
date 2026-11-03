import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Web source-wiring regression. Native MCD frame ordering, heard speaker
// audio, real projectile pooling and Chromium gameplay are NOT certified here.
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const late=main.slice(main.indexOf('function flushDojoEnemyLateShots()'),
  main.indexOf('// Open the local-model view immediately'));

test('accepted Dojo gun attack requests an independent sound before late pose',()=>{
  const update=main.slice(main.indexOf('function update(dt)'),main.indexOf('function drawEnemy(enemy)'));
  assert.match(update,/runNativeEnemyGunAttack\(/);
  assert.match(update,/if\(attack\.shot\)\s*\{/);
  assert.match(update,/nativeEnemyFireAttackRequests\(attack,family,shooterPosition\)/);
  assert.match(update,/request\.type==='fire-sfx-request'\)audio\.enemyShoot\(/);
  assert.doesNotMatch(update,/nativeSegmentHit\(nativeShotCollision,shot\.position/);
});

test('rendering samples a current-frame muzzle but cannot emit the bullet or audio',()=>{
  const draw=main.slice(main.indexOf('function drawEnemy(enemy)'),main.indexOf('function drawPickup(drop)'));
  assert.match(draw,/enemy\.muzzlePoseFrame=null/);
  assert.match(draw,/enemy\.muzzlePosition=vec\(/);
  assert.match(draw,/enemy\.muzzleForward=normalize3\(/);
  assert.match(draw,/enemy\.muzzlePoseFrame=renderedFrameId\+1/);
  assert.doesNotMatch(draw,/consumeNativeEnemyShot\(/);
  assert.doesNotMatch(draw,/addBullet\(/);
  assert.doesNotMatch(draw,/audio\.enemyShoot\(/);
});

test('post-render late volley consumes only same-frame live pose and preserves requested speed',()=>{
  assert.match(main,/render\(\);\s*if\(state\.screen==='playing'\) flushDojoEnemyLateShots\(\)/);
  assert.match(late,/if\(enemy\.muzzlePoseFrame!==renderedFrameId\)continue/);
  assert.match(late,/nativeEnemyFireLateRequests\(enemy\.runtime,settings,\{/);
  assert.match(late,/request\.type!=='projectile-spawn-request'/);
  assert.match(late,/bullet\.speed=request\.speed/);
  assert.doesNotMatch(late,/nativeSegmentHit|nativeSphereHit|\.target\)/);
});
