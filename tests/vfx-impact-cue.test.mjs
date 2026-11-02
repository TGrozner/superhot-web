import test from 'node:test';
import assert from 'node:assert/strict';
import { createImpactCue, sampleImpactCue } from '../src/vfx/impact-cue.js';

const config = () => ({
  origin: { x: 2, y: 1, z: -3 }, startedAt: 10,
  duration: 0.25, radius: 0.7, count: 6, seed: 42, color: '#f5f5ff',
});

test('a confirmed hit has renderable opaque shards only in its active window', () => {
  const cue = createImpactCue(config());
  const atHit = sampleImpactCue(cue, 10);
  assert.equal(atHit.active, true);
  assert.equal(atHit.primitives.length, 7);
  assert.ok(atHit.primitives.every((p) => p.size > 0 && p.color === '#f5f5ff'));
  assert.equal(atHit.primitives[0].x, 2);
  assert.ok(Math.abs(atHit.primitives[0].size - 0.245) < 1e-12);
  assert.equal(sampleImpactCue(cue, 9.99).active, false);
  assert.deepEqual(sampleImpactCue(cue, 10.25), { active: false, primitives: [] });
});

test('absolute-time cue sample is deterministic across frame subdivision', () => {
  const cue = createImpactCue(config());
  assert.deepEqual(sampleImpactCue(cue, 10.125), sampleImpactCue(cue, 10.125));
  const start = sampleImpactCue(cue, 10);
  const mid = sampleImpactCue(cue, 10.125);
  assert.ok(mid.primitives[0].size < start.primitives[0].size);
  assert.ok(mid.primitives[1].x !== start.primitives[1].x);
});

test('cue snapshots collision origin and leaves original object unchanged', () => {
  const input = config();
  const cue = createImpactCue(input);
  input.origin.x = 999;
  assert.equal(sampleImpactCue(cue, 10).primitives[0].x, 2);
});

test('reject unbounded VFX budgets rather than inventing MCD defaults', () => {
  assert.throws(() => createImpactCue({ ...config(), count: 33 }), /count/);
  assert.throws(() => createImpactCue({ ...config(), duration: 0 }), /duration/);
  assert.throws(() => createImpactCue({ ...config(), color: 'original-red' }), /color/);
  assert.throws(() => sampleImpactCue(createImpactCue(config()), Infinity), /finite/);
});
