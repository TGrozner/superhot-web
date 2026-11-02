import test from 'node:test';
import assert from 'node:assert/strict';
import { planBodyPartShatterBranch } from '../src/vfx/body-part-shatter-branch.js';

const source = (extra = {}) => ({
  isRemoved: false, hasShatterMeshes: true,
  hdrChainReactionTriggered: false, hasCustomEnemyHead: false,
  readyToShatter: true, armored: false, bulletproof: false,
  spawnParticles: true, deadPhase: true, ...extra,
});
const plan = extra => planBodyPartShatterBranch(source(extra));

test('only an eligible native Shatter branch requests CrystalCrush and slices', () => {
  const p = plan();
  assert.equal(p.branch, 'shatter-requests');
  assert.deepEqual(p.actions.filter(a => a.op === 'audio-prefab-request'),
    [{ op: 'audio-prefab-request', resource: 'CrystalCrush' }]);
  assert.deepEqual(p.actions.filter(a => a.op === 'align-shatter-parent-to-first-skinned-bone'),
    [{ op: 'align-shatter-parent-to-first-skinned-bone' }]);
  assert.ok(p.actions.some(a => a.op === 'add-force-to-slices-request'));
  assert.deepEqual(p.actions.slice(-2), [
    { op: 'disable-attach-glass-breaker-on-rigidbody-parts' },
    { op: 'enable-hdr-chain-reaction-on-shatter-renderers' },
  ]);
});

test('already removed, missing ShatterMeshes and HDR trigger block this branch only', () => {
  for (const [extra, reason] of [
    [{ isRemoved: true }, 'already-removed'],
    [{ hasShatterMeshes: false }, 'missing-shatter-meshes'],
    [{ hdrChainReactionTriggered: true }, 'hdr-chain-already-triggered'],
  ]) {
    const p = plan(extra);
    assert.equal(p.branch, 'shatter-not-entered');
    assert.equal(p.reason, reason);
    assert.equal(p.actions.length, 0);
    assert.equal(p.otherNativeEffectsPossible, true);
  }
});

test('spawnParticles third argument is passed into BreakJoints', () => {
  assert.deepEqual(plan({ spawnParticles: false }).actions.find(a => a.op === 'break-joints'),
    { op: 'break-joints', destroyJoints: false, spawnParticles: false });
  assert.deepEqual(plan({ spawnParticles: true }).actions.find(a => a.op === 'break-joints'),
    { op: 'break-joints', destroyJoints: false, spawnParticles: true });
});

test('custom head path excludes normal-head ShatterObjects and HideOriginalMesh', () => {
  const p = plan({ hasCustomEnemyHead: true, readyToShatter: true });
  assert.equal(p.actions.some(a => a.op === 'custom-enemy-head-shatter-request'), true);
  assert.equal(p.actions.some(a => a.op === 'add-force-to-slices-request'), false);
  assert.equal(p.actions.some(a => a.op === 'setup-separated-body-parts'), false);
  assert.equal(p.actions.some(a => a.op === 'hide-original-renderer'), false);
  assert.equal(p.actions.some(a => a.op === 'enable-hdr-chain-reaction-on-shatter-renderers'), false);
});

test('not-ready branch selects material by native priority armor, bulletproof, base', () => {
  const expected = [
    [{ armored: false, bulletproof: false }, 'Parent.BaseMaterial'],
    [{ armored: false, bulletproof: true }, 'bulletproofMat'],
    [{ armored: true, bulletproof: false }, 'Parent.ArmorMaterial'],
    [{ armored: true, bulletproof: true }, 'Parent.ArmorMaterial'],
  ];
  for (const [flags, material] of expected) {
    const p = plan({ readyToShatter: false, deadPhase: false, ...flags });
    assert.deepEqual(p.actions.find(a => a.op === 'setup-separated-body-parts'),
      { op: 'setup-separated-body-parts', material, deadPhase: false });
    assert.equal(p.actions.some(a => a.op === 'add-force-to-slices-request'), false);
  }
});

test('never asserts audible sound or rendered shards', () => {
  const p = plan();
  assert.equal(p.renderedShardsNotObserved, true);
  assert.equal(p.actions.some(a => a.op === 'sound-heard' || a.op === 'render-completed'), false);
});

test('requires observed source-state booleans; no invented defaults', () => {
  for (const prop of Object.keys(source())) {
    assert.throws(() => plan({ [prop]: undefined }), TypeError, prop);
  }
});

test('ineligible Shatter is not a claim of zero native effects', () => {
  const p = plan({ isRemoved: true });
  assert.equal(p.otherNativeEffectsPossible, true);
  assert.equal(p.enclosingMethodPreludeUnmodeled, true);
});
