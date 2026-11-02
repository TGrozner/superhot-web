import test from 'node:test';
import assert from 'node:assert/strict';
import { planBulletPairContact } from '../src/combat/bullet-pair-contacts.js';

const v = (x = 0, y = 0, z = 1) => ({ x, y, z });
const b = (o = {}) => ({
  shotgunPellet: false, shotId: 1, didRicochet: false,
  deflected: false, firedByPlayer: false, sniperBullet: false,
  forward: v(), ...o,
});
const input = (o = {}) => ({
  ignored: false, current: b({ shotId: 7 }), encountered: b({ shotId: 9, firedByPlayer: true }),
  collisionPoint: v(2, 3, 4), otherCanCollideCurrent: true, ...o,
});
test('successful pair requests two moves, two slices and two alerts', () => {
  const r = planBulletPairContact(input());
  assert.equal(r.nativeHandlerReturn, false);
  assert.equal(r.requiresDestroyedProbe, true);
  assert.deepEqual(r.events.map(e => e.type),
    ['alert-request','position-request','position-request','slice-request','slice-request','alert-request']);
  assert.deepEqual(r.events[0].parameters, [5, .05, 2]);
  assert.deepEqual(r.events.at(-1).parameters, [5, .2, 5]);
  assert.deepEqual(r.events[3].direction, v());
});
test('ignored and missing Bullet component do not request slices', () => {
  assert.deepEqual(planBulletPairContact(input({ignored:true})).events, []);
  assert.equal(planBulletPairContact(input({encountered:null})).events.length, 1);
});
test('same-shot shotgun pellets are excluded before CanCollide call', () => {
  const a = b({shotgunPellet:true,shotId:77});
  assert.equal(planBulletPairContact(input({current:a,encountered:a,otherCanCollideCurrent:undefined})).outcome,
    'same-shot-pellets-ignored');
  assert.equal(planBulletPairContact(input({current:a,encountered:b({shotgunPellet:true,shotId:78})})).outcome,
    'bullet-pair-contact-requests');
});
test('double ricochet excludes same actual allegiance only', () => {
  const a = b({didRicochet:true,firedByPlayer:false});
  assert.equal(planBulletPairContact(input({current:a,encountered:b({didRicochet:true})})).outcome,
    'same-side-ricochets-ignored');
  assert.equal(planBulletPairContact(input({current:a,encountered:b({didRicochet:true,firedByPlayer:true})})).outcome,
    'bullet-pair-contact-requests');
});
test('double deflected pair excluded even across different shots', () => {
  assert.equal(planBulletPairContact(input({current:b({deflected:true}),encountered:b({deflected:true,shotId:9})})).outcome,
    'both-deflected-ignored');
});
test('unknown or false CanCollide result cannot invent a collision', () => {
  assert.equal(planBulletPairContact(input({otherCanCollideCurrent:undefined})).outcome,
    'other-can-collide-unverified');
  assert.equal(planBulletPairContact(input({otherCanCollideCurrent:false})).outcome,
    'other-can-collide-rejected');
});
test('a sniper skips only its own slice command', () => {
  const r = planBulletPairContact(input({current:b({sniperBullet:true})}));
  assert.deepEqual(r.events.filter(e => e.type==='slice-request').map(e => e.target), ['encountered']);
  assert.equal(r.requiresDestroyedProbe, true);
});
test('invalid flags, contact and slice direction are rejected', () => {
  assert.throws(()=>planBulletPairContact(input({ignored:0})), TypeError);
  assert.throws(()=>planBulletPairContact(input({current:b({shotId:NaN})})), TypeError);
  assert.throws(()=>planBulletPairContact(input({collisionPoint:v(Infinity)})), TypeError);
  assert.throws(()=>planBulletPairContact(input({encountered:b({forward:null})})), TypeError);
});
test('synthetic opposing-shot interception emits no gameplay state change', () => {
  const enemy=b({shotgunPellet:true,shotId:15,firedByPlayer:false});
  const player=b({shotId:16,firedByPlayer:true});
  const r=planBulletPairContact(input({current:enemy,encountered:player}));
  assert.equal(r.events.filter(e=>e.type==='slice-request').length,2);
  assert.equal(r.nativeHandlerReturn,false);
  assert.equal(r.requiresDestroyedProbe,true);
});
