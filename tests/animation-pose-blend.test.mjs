import test from 'node:test';
import assert from 'node:assert/strict';
import { blendBonePoses } from '../src/animation/pose-blend.js';

const unit = { x: 0, y: 0, z: 0, w: 1 };
const position = (x = 0, y = 0, z = 0) => ({ x, y, z });
const bone = (id, pos = position(), rot = unit) => ({ id, position: pos, rotation: rot });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10,
  `${actual} != ${expected}`);

test('matches bones by id independently of target pose order, preserving source order', () => {
  const from = [bone('head', position(0, 2, 0)), bone('arm', position(2, 0, 0))];
  const to = [bone('arm', position(4, 0, 0)), bone('head', position(0, 4, 0))];
  const result = blendBonePoses(from, to, 0.5);
  assert.deepEqual(result.map(b => b.id), ['head', 'arm']);
  assert.deepEqual(result.map(b => b.position), [position(0, 3, 0), position(3, 0, 0)]);
});

test('quaternion half-turn blends along shortest path and retains unit length', () => {
  const from = [bone('arm')];
  const to = [bone('arm', position(), { x: 0, y: 0, z: 1, w: 0 })];
  const half = blendBonePoses(from, to, 0.5)[0].rotation;
  near(half.z, Math.SQRT1_2);
  near(half.w, Math.SQRT1_2);
  near(Math.hypot(...Object.values(half)), 1);
});

test('opposite-sign quaternions represent the same rotation without a spurious spin', () => {
  const from = [bone('head')];
  const to = [bone('head', position(), { x: 0, y: 0, z: 0, w: -1 })];
  assert.deepEqual(blendBonePoses(from, to, 0.5)[0].rotation, unit);
});

test('weights at endpoints and source data stay independent/immutable', () => {
  const from = Object.freeze([Object.freeze(bone('hip', position(1), unit))]);
  const to = Object.freeze([Object.freeze(bone('hip', position(3), unit))]);
  assert.deepEqual(blendBonePoses(from, to, 0)[0].position, position(1));
  assert.deepEqual(blendBonePoses(from, to, 1)[0].position, position(3));
  const mid = blendBonePoses(from, to, 0.5);
  mid[0].position.x = 90;
  assert.equal(from[0].position.x, 1);
  assert.equal(to[0].position.x, 3);
  assert.deepEqual(blendBonePoses([], [], 0.5), []);
});

test('rejects mismatched, duplicated and malformed bone IDs or rotations', () => {
  assert.throws(() => blendBonePoses([bone('A')], [bone('B')], 0.5), /identical bone IDs/);
  assert.throws(() => blendBonePoses([bone('A'), bone('A')], [bone('A')], 0.5), /duplicate bone/);
  assert.throws(() => blendBonePoses([bone('A')], [bone('A')], 1.1), RangeError);
  assert.throws(() => blendBonePoses([bone('A')], [bone('A')], NaN), TypeError);
  assert.throws(() => blendBonePoses([bone('A', position(), { x: 0, y: 0, z: 0, w: 0 })],
    [bone('A')], 0.5), /nonzero norm/);
  assert.throws(() => blendBonePoses([bone('A', position(), { x: Infinity, y: 0, z: 0, w: 1 })],
    [bone('A')], 0.5), TypeError);
});

test('finite but extreme translations do not produce Infinity and do not cancel via overflow', () => {
  const from = [bone('a', position(-1e308))];
  const to = [bone('a', position(1e308))];
  assert.equal(blendBonePoses(from, to, 0.5)[0].position.x, 0);
  assert.equal(blendBonePoses(from, to, 0.25)[0].position.x, -5e307);
});
