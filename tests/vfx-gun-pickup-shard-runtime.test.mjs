import test from 'node:test';
import assert from 'node:assert/strict';
import { createGunPickupShardRuntime, advanceGunPickupShardRuntime } from '../src/vfx/gun-pickup-shatter.js';

const matrix = x => [1,0,0,0, 0,1,0,0, 0,0,1,0, x,2,0,1];
const config = () => ({
  shards: [
    { id: 'authored-left', modelMatrix: matrix(-1), originalScale: 1 },
    { id: 'authored-right', modelMatrix: matrix(1), originalScale: 1 },
  ],
  parentVelocity: { x: 10, y: 0, z: 0 }, attachedToEnemy: false,
  torqueSamples: [{ x: 0, y: 0.5, z: 0 }, { x: 0, y: -0.5, z: 0 }],
  fadeDelays: [2, 2], gravity: { x: 0, y: -9.81, z: 0 },
});
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('authored IDs and world geometry placement survive source impulse initialization', () => {
  const runtime = createGunPickupShardRuntime(config());
  assert.deepEqual(runtime.shards.map(s => s.id), ['authored-left', 'authored-right']);
  near(runtime.shards[0].velocity.x, 1 - 0.25 / 0.15);
  near(runtime.shards[1].velocity.x, 1 + 0.25 / 0.15);
  const draws = advanceGunPickupShardRuntime(runtime, 0.2);
  near(draws[0].modelMatrix[12], -1 + (1 - 0.25 / 0.15) * 0.2);
  near(draws[1].modelMatrix[13], 2 - 9.81 * 0.2 * 0.2 / 2);
  assert.equal(draws[0].visible, true);
  assert.equal(draws[0].hdrPhase, 0);
  assert.match(runtime.physics, /no-angular-or-collision/);
});

test('paused scaled time freezes translation and source disappearance progression', () => {
  const runtime = createGunPickupShardRuntime(config());
  advanceGunPickupShardRuntime(runtime, 0.1);
  const before = Array.from(runtime.shards[0].modelMatrix);
  advanceGunPickupShardRuntime(runtime, 0);
  assert.deepEqual(Array.from(runtime.shards[0].modelMatrix), before);
  assert.equal(runtime.elapsed, 0.1);
});

test('native quadratic scale and HDR curve are not a fabricated 0.125-second linear fade', () => {
  const runtime = createGunPickupShardRuntime({ ...config(), fadeDelays: [0, 0] });
  advanceGunPickupShardRuntime(runtime, 0.1);
  near(runtime.shards[0].localScale, 1 - (1 / 3) ** 2);
  near(runtime.shards[0].hdrPhase, 0.45 ** 2);
  assert.equal(runtime.shards[0].destroyed, false);
  advanceGunPickupShardRuntime(runtime, 0.21);
  assert.equal(runtime.shards[0].visible, false);
  assert.equal(runtime.shards[0].destroyed, false);
  advanceGunPickupShardRuntime(runtime, 0);
  assert.equal(runtime.shards[0].destroyed, true);
});

test('motion is frame partition independent until source per-update destruction gate', () => {
  const once = createGunPickupShardRuntime(config());
  const split = createGunPickupShardRuntime(config());
  advanceGunPickupShardRuntime(once, 0.25);
  advanceGunPickupShardRuntime(split, 0.125);
  advanceGunPickupShardRuntime(split, 0.125);
  assert.deepEqual(Array.from(once.shards[0].modelMatrix), Array.from(split.shards[0].modelMatrix));
});

test('source matrices and native random samples are snapshotted without replacing missing geometry', () => {
  const supplied = config();
  const runtime = createGunPickupShardRuntime(supplied);
  supplied.shards[0].modelMatrix[12] = 500;
  supplied.torqueSamples[0].y = 1;
  advanceGunPickupShardRuntime(runtime, 0);
  assert.equal(runtime.shards[0].modelMatrix[12], -1);
  assert.equal(runtime.shards[0].torque.y, 0.5);
  assert.throws(() => createGunPickupShardRuntime({ ...config(), shards: undefined }), /authored/);
  const duplicate = config();
  duplicate.shards[1].id = duplicate.shards[0].id;
  assert.throws(() => createGunPickupShardRuntime(duplicate), /unique/);
  assert.throws(() => createGunPickupShardRuntime({ ...config(), torqueSamples: [] }), /one torque/);
  assert.throws(() => advanceGunPickupShardRuntime(runtime, -1), /nonnegative/);
});
