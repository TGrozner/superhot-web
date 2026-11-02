import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planPejAiAnimatorKillStart,
  planPejAiAnimatorKillCleanup,
} from '../src/animation/enemy-kill-timeline.js';

const start = () => ({
  alreadyScheduled: false, limbCount: 4, hasIKSolverX: true,
  hasGrounder: true, hasMeleeWeaponIK: true,
  hasWeaponSocket: true, hasLookAtIK: false,
});
const cleanup = () => ({
  hdrReactionTriggered: false, isNewMesh: false,
  wholebodyEnabled: false, headlessBodyActive: false,
  meshRenderers: [{ id: 'r0', shatterParentActive: false, rendererNull: false }],
  hdrChain: [{ id: 'chain1', rendererAvailable: true, duration: 0.3, delay: 0.1 }],
  bodyParts: [{ id: 'arm1', skinnedRendererEnabled: true, duration: 0.4, delay: 0.2 }],
});

test('direct Animator.Kill call disables animation/IK before scheduling cleanup', () => {
  const actual = planPejAiAnimatorKillStart(start());
  assert.equal(actual.status, 'scheduled');
  assert.deepEqual(actual.immediate.slice(0, 5).map(v => v.op), [
    'disable-nav-agent', 'disable-animator', 'zero-and-disable-FinalIK',
    'disable-IK-grounder', 'mark-body-being-killed',
  ]);
  assert.deepEqual(actual.cleanupRequest, {
    afterSeconds: 3.5, clock: 'scaled-not-realtime', sampleStateAtCallback: true,
  });
  assert.ok(actual.immediate.some(v => v.op === 'set-frame-delay' && v.frames === 5));
  assert.ok(actual.immediate.some(v => v.op === 'enable-limb-rigidbodies' && v.count === 4));
  assert.ok(actual.immediate.some(v => v.op === 'weapon-socket-on-kill'));
  assert.ok(!actual.immediate.some(v => v.op === 'look-at-IK-on-kill'));
});

test('toKill early return follows disables but prevents rescheduling', () => {
  const actual = planPejAiAnimatorKillStart({ ...start(), alreadyScheduled: true });
  assert.equal(actual.status, 'already-scheduled');
  assert.equal(actual.cleanupRequest, null);
  assert.ok(actual.immediate.some(v => v.op === 'disable-animator'));
  assert.ok(!actual.immediate.some(v => v.op === 'enable-limb-rigidbodies'));
});

test('explicit killTime is preserved; elapsed clock is not wall time', () => {
  const actual = planPejAiAnimatorKillStart({ ...start(), killTime: 0.75 });
  assert.equal(actual.cleanupRequest.afterSeconds, 0.75);
  assert.equal(actual.cleanupRequest.clock, 'scaled-not-realtime');
});

test('false HDRReactionTriggered selects source fade branch and delayed pool', () => {
  const actual = planPejAiAnimatorKillCleanup(cleanup());
  assert.equal(actual.branch, 'register-disappear-effects');
  assert.deepEqual(actual.restoreRendererIds, []);
  assert.deepEqual(actual.poolRequest, {
    afterSeconds: 1, clock: 'scaled-not-realtime', deactivate: false,
  });
  assert.deepEqual(actual.effects, [
    { id: 'chain1', type: 'HDRChain', duration: 0.3, delay: 0.1, startScale: 1,
      endScale: 1, destroyOnAnimationEnd: false, disableCollidersOnCompletion: false },
    { id: 'arm1', type: 'BodyPart', duration: 0.4, delay: 0.2, startScale: 1,
      endScale: 0.8, destroyOnAnimationEnd: false, disableCollidersOnCompletion: true },
  ]);
});

test('triggered HDR with active merged/headless restores eligible fragment renderers', () => {
  const actual = planPejAiAnimatorKillCleanup({
    ...cleanup(), hdrReactionTriggered: true, isNewMesh: true,
    wholebodyEnabled: true, headlessBodyActive: true,
    meshRenderers: [
      { id: 'visible', shatterParentActive: false, rendererNull: false },
      { id: 'shattered', shatterParentActive: true, rendererNull: false },
      { id: 'missing', shatterParentActive: false, rendererNull: true },
    ],
  });
  assert.equal(actual.branch, 'register-disappear-effects');
  assert.deepEqual(actual.restoreRendererIds, ['visible']);
  assert.equal(actual.hideWholebody, true);
  assert.equal(actual.hideHeadless, true);
});

test('triggered HDR without an eligible new mesh pools synchronously without fake fade', () => {
  for (const flags of [
    { hdrReactionTriggered: true, isNewMesh: false, wholebodyEnabled: true },
    { hdrReactionTriggered: true, isNewMesh: true, wholebodyEnabled: false, headlessBodyActive: false },
  ]) {
    const actual = planPejAiAnimatorKillCleanup({ ...cleanup(), ...flags });
    assert.equal(actual.branch, 'pool-immediately');
    assert.deepEqual(actual.effects, []);
    assert.deepEqual(actual.poolRequest, { when: 'now', deactivate: false });
  }
});

test('only renderer-qualified effects consume caller-provided samples', () => {
  const actual = planPejAiAnimatorKillCleanup({
    ...cleanup(),
    hdrChain: [{ id: 'missing', rendererAvailable: false }],
    bodyParts: [{ id: 'disabled', skinnedRendererEnabled: false }],
  });
  assert.deepEqual(actual.effects, []);
  assert.throws(() => planPejAiAnimatorKillCleanup({
    ...cleanup(), hdrChain: [{ id: 'bad', rendererAvailable: true, duration: 0.6, delay: 0.1 }],
  }), /duration/);
});

test('unknown flags, invalid time and absent callback evidence cannot be silently defaulted', () => {
  assert.throws(() => planPejAiAnimatorKillStart({ ...start(), alreadyScheduled: undefined }), /boolean/);
  assert.throws(() => planPejAiAnimatorKillStart({ ...start(), killTime: NaN }), /killTime/);
  assert.throws(() => planPejAiAnimatorKillCleanup({ ...cleanup(), hdrReactionTriggered: null }), /boolean/);
});


test('PejAiBody.Explode directly calls Animator.Kill(0) when animator exists; zero remains queued', () => {
  // Private native evidence: research #105, PejAiBody.cs:462-475.
  // This is NOT evidence that a normal Body.Kill goes through Animator.Kill.
  const actual = planPejAiAnimatorKillStart({ ...start(), killTime: 0 });
  assert.equal(actual.status, 'scheduled');
  assert.deepEqual(actual.cleanupRequest, {
    afterSeconds: 0, clock: 'scaled-not-realtime', sampleStateAtCallback: true,
  });
  assert.ok(actual.immediate.some(v => v.op === 'set-to-kill'));
});
