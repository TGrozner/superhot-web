import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nativeEnemyFireAttackRequests, nativeEnemyFireLateRequests } from '../src/combat/native-enemy-fire-phase.js';

// These are Web-only wiring/contract tests. The default encounter selects one
// explicit 'web-pistol' template; original MCD factory/weapon allocation is
// unresolved (private corpus #173). No browser sound or native shot is proven.
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');

test('Dojo fallback actor binds a Web pistol explicitly at spawn, not a native factory inference',()=>{
  assert.match(main,/event\.enemy\.activeWeaponSettings=Object\.freeze\(\{\s*\.\.\.nativeEncounter\.enemySettings,\s*family:nativeEncounter\.enemySettings\.family \?\? 'Pistol'/);
  assert.match(main,/state\.enemies\.push\(event\.enemy\)/);
});

test('accepted Attack and deferred volley consume the same selected per-actor weapon settings',()=>{
  assert.match(main,/const activeWeaponSettings=enemy\.activeWeaponSettings \?\? nativeEncounter\.enemySettings;/);
  assert.match(main,/advanceNativeEnemyWeapon\(enemy\.runtime,activeWeaponSettings,worldDt\)/);
  assert.match(main,/runNativeEnemyGunAttack\(enemy\.runtime,activeWeaponSettings,\{/);
  assert.match(main,/const family=activeWeaponSettings\.family;/);
  assert.match(main,/nativeEnemyFireAttackRequests\(attack,family,shooterPosition\)/);
  const late=main.slice(main.indexOf('function flushDojoEnemyLateShots()'),
    main.indexOf('// Open the local-model view immediately'));
  assert.match(late,/const settings=enemy\.activeWeaponSettings \?\? nativeEncounter\.enemySettings;/);
  assert.match(late,/if\(typeof settings\?\.family!=='string'\)continue/);
  assert.match(late,/nativeEnemyFireLateRequests\(enemy\.runtime,settings,\{/);
});

test('selected provisional Web pistol emits Attack sound request before delayed pose-dependent bullet',()=>{
  const family='Pistol', shooter={x:1,y:2,z:3};
  const attack=nativeEnemyFireAttackRequests({shot:true},family,shooter);
  assert.equal(attack[0].type,'fire-sfx-request');
  assert.equal(attack[0].family,'Pistol');
  assert.equal(attack[1].type,'enemy-alert-request');
  const settings={family,projectileSpeed:36};
  const state={pendingShot:{target:{x:0,y:1,z:10},speed:36,shooterHaveBeenSeen:false}};
  assert.equal(nativeEnemyFireLateRequests(state,settings,{}).status,'awaiting-late-pose');
  assert.ok(state.pendingShot,'early Attack must retain deferred shot');
  const late=nativeEnemyFireLateRequests(state,settings,{
    muzzlePosition:{x:0,y:1,z:0},
  });
  assert.equal(late.status,'spawn-requests');
  assert.equal(late.requests.length,1);
  assert.equal(late.requests[0].type,'projectile-spawn-request');
  assert.equal(late.requests[0].speed,36);
  assert.equal(state.pendingShot,null);
});
