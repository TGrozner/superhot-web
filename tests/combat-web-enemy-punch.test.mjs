import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWebEnemyPunchState,advanceWebEnemyPunch,
} from '../src/combat/web-enemy-punch.js';

test('J3 melee: telegraph before contact; cancel behind cover/stun; one hit and recovery per actor',()=>{
  const first=createWebEnemyPunchState();
  const second=createWebEnemyPunchState();
  const input=(overrides={})=>({
    scaledDeltaTime:0.08,attackerActive:true,attackerAlive:true,
    playerAlive:true,unarmed:true,stunned:false,inReach:true,lineClear:true,
    ...overrides,
  });
  let playerDamage=0;
  const tick=(state,overrides={})=>{
    const event=advanceWebEnemyPunch(state,input(overrides));
    if(event.event==='contact')playerDamage++;
    return event;
  };

  assert.equal(tick(first,{scaledDeltaTime:0}).event,'none');
  const start=tick(first);
  assert.equal(start.event,'started');
  assert.equal(first.phase,'windup');
  assert.equal(playerDamage,0); // Current live main damaged on this frame.
  assert.equal(tick(first,{scaledDeltaTime:.12}).event,'none');
  assert.equal(tick(first,{scaledDeltaTime:.08,lineClear:false}).event,'cancelled');
  assert.equal(playerDamage,0);
  assert.equal(tick(first,{scaledDeltaTime:.33}).event,'none');
  assert.equal(first.phase,'ready');

  // A second enemy has its own clock and can attack while the first recovers.
  assert.equal(tick(second).event,'started');
  assert.equal(tick(second,{scaledDeltaTime:.12}).event,'none');
  assert.equal(tick(second,{scaledDeltaTime:.13}).event,'contact');
  assert.equal(playerDamage,1);
  assert.equal(tick(second,{scaledDeltaTime:.03}).event,'none');
  assert.equal(tick(second,{scaledDeltaTime:.75}).event,'none');
  assert.equal(second.phase,'ready');

  assert.equal(tick(first).event,'started');
  assert.equal(tick(first,{scaledDeltaTime:.27,stunned:true}).event,'cancelled');
  assert.equal(playerDamage,1);
  assert.equal(tick(second,{scaledDeltaTime:.08,inReach:false}).event,'none');
  assert.equal(tick(second).event,'started');
  assert.equal(tick(second,{scaledDeltaTime:.25,inReach:false}).event,'cancelled');
  assert.equal(playerDamage,1);
  assert.equal(first.attackId,2);
  assert.equal(second.attackId,2);
});
