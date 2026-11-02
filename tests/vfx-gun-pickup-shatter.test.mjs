import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planGunPickupShatter, sampleGunPickupShatterProxy,
} from '../src/vfx/gun-pickup-shatter.js';

const near = (actual, expected) => assert.ok(
  Math.abs(actual - expected) < 1e-10, `expected ${expected}, got ${actual}`,
);
const options = () => ({
  alreadyShattered: false, hasShardInstance: true, attachedToEnemy: false,
  parentVelocity: { x: 10, y: 5, z: -20 },
  shardCenters: [{ x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }],
  torqueSamples: [{ x: 0, y: 0.5, z: 0 }, { x: 0.25, y: 0, z: 0 }],
  fadeDelays: [0.5, 1.75],
});
const webStyle = () => ({ gravity: { x: 0, y: -9, z: 0 }, size: 0.2, color: '#dddddd' });

test('source branch emits two shard commands centered on shard positions, not impact origin', () => {
  const plan = planGunPickupShatter(options());
  assert.equal(plan.status, 'planned');
  assert.deepEqual(plan.centroid, { x: 0, y: 0, z: 0 });
  assert.deepEqual(plan.shards.map(s => s.impulse), [
    { x: -0.25, y: 0, z: 0 }, { x: 0.25, y: 0, z: 0 },
  ]);
  assert.deepEqual(plan.shards[0].velocity, { x: 1, y: 0.5, z: -2 });
  assert.equal(plan.shards[0].mass, 0.15);
  assert.equal(plan.shards[0].angularDrag, 0);
  assert.equal(plan.shards[0].impulseMode, 'Impulse');
  assert.equal(plan.shards[0].interpolation, 'Interpolate');
  assert.deepEqual(plan.shards[0].disappear, { duration: 0.125, delay: 0.5 });
  assert.equal(plan.audioRequest, 'ShatterSoundPrefab');
});

test('source empty and missing-physics paths are not invented into a burst', () => {
  assert.deepEqual(planGunPickupShatter({ ...options(), alreadyShattered: true }),
    { status: 'already-shattered', shards: [] });
  assert.deepEqual(planGunPickupShatter({ ...options(), hasShardInstance: false }),
    { status: 'no-shard-instance', shards: [] });
  assert.deepEqual(planGunPickupShatter({ ...options(), parentVelocity: null }),
    { status: 'native-fallback-unmodeled', shards: [] });
  const attached = planGunPickupShatter({ ...options(), parentVelocity: null, attachedToEnemy: true });
  assert.deepEqual(attached.shards[0].velocity, { x: 0, y: 0, z: 0 });
});

test('coincident centers keep zero impulse without inventing direction', () => {
  const c = { x: 3, y: 2, z: 0 };
  const plan = planGunPickupShatter({ ...options(), shardCenters: [c, c] });
  assert.deepEqual(plan.centroid, c);
  assert.ok(plan.shards.every(s => Object.values(s.impulse).every(n => n === 0)));
});

test('command positions and random inputs are snapshotted rather than shared', () => {
  const input = options();
  const plan = planGunPickupShatter(input);
  input.shardCenters[0].x = 100;
  input.torqueSamples[0].y = -1;
  input.fadeDelays[0] = 9;
  assert.equal(plan.shards[0].position.x, -1);
  assert.equal(plan.shards[0].torque.y, 0.5);
  assert.equal(plan.shards[0].disappear.delay, 0.5);
});

test('original Web proxy is visible at collision and fades after caller supplied delays', () => {
  const plan = planGunPickupShatter(options());
  const zero = sampleGunPickupShatterProxy(plan, 0, webStyle());
  assert.equal(zero.active, true);
  assert.equal(zero.primitives.length, 2);
  near(zero.primitives[0].x, -1);
  near(zero.primitives[0].size, 0.2);
  const atHalf = sampleGunPickupShatterProxy(plan, 0.5, webStyle());
  near(atHalf.primitives[0].x, -1 + (1 - 0.25 / 0.15) * 0.5);
  near(atHalf.primitives[0].size, 0.2);
  assert.equal(sampleGunPickupShatterProxy(plan, 0.625, webStyle()).primitives.length, 1);
  assert.deepEqual(sampleGunPickupShatterProxy(plan, 1.875, webStyle()),
    { active: false, primitives: [] });
});

test('proxy is deterministic for same time, source physical integration is NOT asserted', () => {
  const plan = planGunPickupShatter(options());
  const p = sampleGunPickupShatterProxy(plan, 0.25, webStyle());
  assert.deepEqual(p, sampleGunPickupShatterProxy(plan, 0.25, webStyle()));
  near(p.primitives[0].y, 0.5 * 0.25 - 4.5 * 0.25 * 0.25);
  assert.equal(p.primitives[0].color, '#dddddd');
});

test('rejects fabricated samples, non-finite commands and oversized Web batches', () => {
  assert.throws(() => planGunPickupShatter({ ...options(), torqueSamples: [] }), /per shard/);
  assert.throws(() => planGunPickupShatter({ ...options(), fadeDelays: [-1, 0] }), /fadeDelays/);
  assert.throws(() => planGunPickupShatter({ ...options(), torqueSamples: [{ x: 2, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }] }), /unit sphere/);
  assert.throws(() => planGunPickupShatter({ ...options(), parentVelocity: { x: Infinity, y: 0, z: 0 } }), /finite/);
  assert.throws(() => planGunPickupShatter({ ...options(), shardCenters: Array(257).fill({ x: 0, y: 0, z: 0 }) }), /budget/);
  assert.throws(() => sampleGunPickupShatterProxy(planGunPickupShatter(options()), 0, { ...webStyle(), size: 0 }), /size/);
});
