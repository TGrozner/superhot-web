import test from 'node:test';
import assert from 'node:assert/strict';
import { planPejAiBodyKill } from '../src/animation/enemy-body-kill-plan.js';

const sample = () => ({
  controllerIsDead: false,
  shouldExplodeFromDog: false,
  isBoss: false,
  rendererIds: ['merged', null, 'headless'],
  deathSource: 'Bullet',
  bulletToken: 'bullet-12',
  bodyPosition: { x: -3, y: 4, z: 5 },
});

const ops = (plan) => plan.commands.map(x => x.op);

test('already-dead source guard requests no side effects, including sound', () => {
  const p = planPejAiBodyKill({ ...sample(), controllerIsDead: true, shouldExplodeFromDog: true });
  assert.equal(p.branch, 'already-dead');
  assert.deepEqual(p.commands, []);
});

test('ordinary Body.Kill emits no direct head Shatter or Animator.Kill command', () => {
  const p = planPejAiBodyKill(sample());
  assert.equal(p.branch, 'body-kill-commands-requested');
  assert.ok(!ops(p).includes('remove-head-body-part'));
  assert.ok(!ops(p).includes('animator-kill'));
  assert.ok(!ops(p).includes('spawn-shards'));
});

test('dog explosion flag requests head cut before clearing the flag and controller kill', () => {
  const p = planPejAiBodyKill({ ...sample(), shouldExplodeFromDog: true });
  assert.deepEqual(p.commands.slice(0, 2), [
    { op: 'remove-head-body-part', cutMode: 'Shatter' },
    { op: 'clear-should-explode-from-dog' },
  ]);
  assert.ok(ops(p).indexOf('clear-should-explode-from-dog') < ops(p).indexOf('controller-kill'));
});

test('boss head and all mesh enable requests precede focus reset', () => {
  const p = planPejAiBodyKill({
    ...sample(), isBoss: true, bossHeadRendererId: 'boss-current-head', bossMeshIds: ['B0', 'B1'],
  });
  assert.deepEqual(p.commands.slice(0, 3), [
    { op: 'enable-boss-current-head-renderer', rendererId: 'boss-current-head' },
    { op: 'enable-boss-mesh', rendererId: 'B0' },
    { op: 'enable-boss-mesh', rendererId: 'B1' },
  ]);
});

test('all non-null wrappers receive both focus zeros in native iteration order', () => {
  const p = planPejAiBodyKill(sample());
  const r = p.commands.filter(x => x.op === 'renderer-set-float');
  assert.deepEqual(r.map(x => [x.rendererId, x.property, x.value]), [
    ['merged', '_Focus', 0], ['merged', '_HotswitchFocus', 0],
    ['headless', '_Focus', 0], ['headless', '_HotswitchFocus', 0],
  ]);
});

test('controller kill precedes sound request; neither claims playback, then exact IK order', () => {
  const p = planPejAiBodyKill(sample());
  const tail = p.commands.slice(-6);
  assert.deepEqual(tail, [
    { op: 'controller-kill', deathSource: 'Bullet', bulletToken: 'bullet-12' },
    { op: 'request-prefab-sound', resource: 'EnemyShatter', position: { x: -3, y: 5.5, z: 5 } },
    { op: 'melee-IK-left-weight-zero' }, { op: 'melee-IK-right-weight-zero' },
    { op: 'melee-IK-left-deactivate' }, { op: 'melee-IK-right-deactivate' },
  ]);
  assert.deepEqual(ops(p).slice(-9, -6), [
    'material-focus-zero', 'material-hotswitch-focus-zero', 'available-pickup-effect-fade-out',
  ]);
});

test('no boss meshes are enabled for non-boss, even with optional IDs supplied', () => {
  const p = planPejAiBodyKill({ ...sample(), bossMeshIds: ['unused'] });
  assert.ok(!ops(p).includes('enable-boss-mesh'));
});

test('invalid state, missing branch IDs and nonfinite position are rejected', () => {
  assert.throws(() => planPejAiBodyKill({ ...sample(), isBoss: 1 }), /isBoss must be boolean/);
  assert.throws(() => planPejAiBodyKill({ ...sample(), isBoss: true }), /bossHeadRendererId/);
  assert.throws(() => planPejAiBodyKill({ ...sample(), rendererIds: ['x', 4] }), /rendererIds\[1\]/);
  assert.throws(() => planPejAiBodyKill({ ...sample(), bodyPosition: { x: 1, y: Infinity, z: 0 } }), /bodyPosition.y/);
  assert.throws(() => planPejAiBodyKill({ ...sample(), deathSource: '' }), /deathSource/);
});
