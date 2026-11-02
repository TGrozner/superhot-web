import test from 'node:test';
import assert from 'node:assert/strict';
import { planPejAiBodyExplode } from '../src/vfx/enemy-explode-plan.js';

const state = () => ({
  deathSource: 'Other',
  bodyPartIds: ['arm-left', 'head', 'leg-right'],
  randomValues: [0.89, 0.9, 1],
  nonCivilian: true,
  hasAnimator: true,
});

test('source order: body Kill, unconditional head Shatter, each cutter, Animator.Kill(0)', () => {
  const p = planPejAiBodyExplode(state());
  assert.equal(p.sourceMethod, 'PejAiBody.Explode');
  assert.deepEqual(p.actions, [
    { op: 'body-kill', deathSource: 'Other' },
    { op: 'remove-body-part', partId: 'Head', cutMode: 'Shatter' },
    { op: 'remove-body-part', partId: 'arm-left', cutMode: 'None', deadPhase: true, spawnParticles: true },
    { op: 'remove-body-part', partId: 'head', cutMode: 'Shatter', deadPhase: true, spawnParticles: true },
    { op: 'remove-body-part', partId: 'leg-right', cutMode: 'Shatter', deadPhase: true, spawnParticles: true },
    { op: 'animator-kill', killTime: 0, clock: 'scaled-not-realtime-queue' },
  ]);
});

test('absent Animator omits only the Animator.Kill call', () => {
  const p = planPejAiBodyExplode({ ...state(), hasAnimator: false });
  assert.equal(p.actions.filter(v => v.op === 'remove-body-part').length, 4);
  assert.ok(!p.actions.some(v => v.op === 'animator-kill'));
});

test('empty cutter list still requests Head Shatter and conditional Animator.Kill', () => {
  const p = planPejAiBodyExplode({
    ...state(), bodyPartIds: [], randomValues: [], nonCivilian: false,
  });
  assert.deepEqual(p.actions.map(v => v.op), [
    'body-kill', 'remove-body-part', 'animator-kill',
  ]);
});

test('samples are caller-supplied, not synthesized or collapsed to a hit effect', () => {
  assert.throws(() => planPejAiBodyExplode({ ...state(), randomValues: [0.5] }), /one Random/);
  assert.throws(() => planPejAiBodyExplode({ ...state(), randomValues: [NaN, 0.5, 0.5] }), /randomValues/);
  assert.throws(() => planPejAiBodyExplode({ ...state(), nonCivilian: undefined }), /booleans/);
  assert.throws(() => planPejAiBodyExplode({ ...state(), bodyPartIds: ['x', '', 'y'] }), /nonempty/);
});

test('nonCivilian input is forwarded only as RemoveBodyPart.spawnParticles', () => {
  const p = planPejAiBodyExplode({ ...state(), nonCivilian: false });
  const cuts = p.actions.filter(a => a.op === 'remove-body-part').slice(1);
  assert.equal(cuts.length, 3);
  assert.ok(cuts.every(a => a.spawnParticles === false));
  assert.ok(cuts.every(a => !Object.hasOwn(a, 'nonCivilian')));
  // The separately requested head Shatter uses native default args.
  assert.ok(!Object.hasOwn(p.actions[1], 'spawnParticles'));
});
