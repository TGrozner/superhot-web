import test from 'node:test';
import assert from 'node:assert/strict';
import { planPejAiAddBlowForce, planPejAiKillWithBlowForce } from '../src/animation/enemy-blow-force-plan.js';

const cameraBasis = Object.freeze({
  right: Object.freeze({ x: 1, y: 0, z: 0 }),
  up: Object.freeze({ x: 0, y: 1, z: 0 }),
  forward: Object.freeze({ x: 0, y: 0, z: 1 }),
});
const base = () => ({ hasAnimator: true, existingConstantForce: false,
  force: 12, randomX: 0, randomY: 0, cameraBasis });

const operationNames = result => result.commands.map(command => command.op);

test('confirmed AddBlowForce path orders Animator.Kill, drop, force, timed disable', () => {
  const p = planPejAiAddBlowForce(base());
  assert.equal(p.branch, 'force-requested');
  assert.deepEqual(operationNames(p), [
    'use-body-part-rigidbody-zero', 'invoke-animator-kill-default',
    'drop-weapon', 'add-constant-force', 'set-constant-force',
    'enable-constant-force', 'enqueue-force-disable',
  ]);
  assert.deepEqual(p.commands[4].vector, { x: 0, y: 0, z: 12 });
  assert.deepEqual(p.commands[6], {
    op: 'enqueue-force-disable', afterSeconds: 0.5,
    clock: 'non-realtime', clearVector: true,
  });
});

test('existing ConstantForce is reused; native non-head part remains caller selected', () => {
  const p = planPejAiAddBlowForce({ ...base(), existingConstantForce: true, bodyPart: 'Torso' });
  assert.equal(p.commands[0].bodyPart, 'Torso');
  assert.ok(operationNames(p).includes('reuse-constant-force'));
  assert.ok(!operationNames(p).includes('add-constant-force'));
});

test('source RNG samples are normalized before camera basis transform', () => {
  const p = planPejAiAddBlowForce({
    ...base(), force: 3, randomX: 0.15, randomY: -0.25,
    cameraBasis: { right: { x: 0, y: 0, z: -1 }, up: cameraBasis.up,
      forward: { x: 1, y: 0, z: 0 } },
  });
  const r = Math.hypot(0.15, -0.25, 1);
  const v = p.commands.find(c => c.op === 'set-constant-force').vector;
  assert.ok(Math.abs(v.x - 3 / r) < 1e-12);
  assert.ok(Math.abs(v.y - (-0.25 * 3 / r)) < 1e-12);
  assert.ok(Math.abs(v.z - (-0.15 * 3 / r)) < 1e-12);
});

test('zero or negative blowInterval does not schedule disabling the native force', () => {
  for (const blowInterval of [0, -0.1]) {
    const p = planPejAiAddBlowForce({ ...base(), blowInterval });
    assert.ok(!operationNames(p).includes('enqueue-force-disable'));
    assert.ok(operationNames(p).includes('enable-constant-force'));
  }
});

test('AddBlowForce without Animator returns null and issues no force commands', () => {
  assert.deepEqual(planPejAiAddBlowForce({
    hasAnimator: false, force: 2, blowInterval: 0.5,
  }), { branch: 'no-animator', commands: [], returns: null });
});

test('KillWithBlowForce schedules Kill after the force request, including missing Animator', () => {
  const p = planPejAiKillWithBlowForce({ ...base(), blowInterval: 0.7 });
  assert.deepEqual(p.commands.at(-1), {
    op: 'invoke-controller-kill', method: 'Kill', afterSeconds: 0.7, scheduler: 'Unity Invoke',
  });
  assert.ok(operationNames(p).indexOf('invoke-animator-kill-default') < p.commands.length - 1);
  const absent = planPejAiKillWithBlowForce({ hasAnimator: false, force: 2 });
  assert.equal(absent.commands.length, 1);
  assert.equal(absent.addBlowForceReturn, null);
});

test('invalid camera/samples/unknown animator cannot be treated as a verified blow route', () => {
  assert.throws(() => planPejAiAddBlowForce({ ...base(), hasAnimator: undefined }), /boolean/);
  assert.throws(() => planPejAiAddBlowForce({ ...base(), randomX: 0.151 }), /ranges/);
  assert.throws(() => planPejAiAddBlowForce({ ...base(), randomY: -0.251 }), /ranges/);
  assert.throws(() => planPejAiAddBlowForce({ ...base(), cameraBasis: undefined }), /cameraBasis/);
  assert.throws(() => planPejAiAddBlowForce({ ...base(), force: Infinity }), /finite/);
});

test('plans do not mutate caller camera basis; source transform remains an injected instance', () => {
  const p = planPejAiAddBlowForce(base());
  assert.equal(p.commands[4].vector.z, 12);
  assert.deepEqual(cameraBasis.forward, { x: 0, y: 0, z: 1 });
});
