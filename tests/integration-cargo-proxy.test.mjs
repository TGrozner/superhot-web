import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTAINERS_BUILD28_HULLS, CONTAINERS_BUILD28_DEMO_CAMERA } from '../src/scenes/containers-build28.js';
import { resolveWalk, segmentAabb } from '../src/math.js';
import { buildContainersProxySolids, assessLegacySpawnBounds } from '../scripts/integration-cargo-proxy.mjs';

test('SH16 maps exactly the five source-indexed envelopes, no artificial ribs or ground', () => {
  const solids = buildContainersProxySolids(CONTAINERS_BUILD28_HULLS);
  assert.equal(solids.length, 5);
  assert.deepEqual(solids.map(s => s.id), CONTAINERS_BUILD28_HULLS.map(h => h.id));
  assert.ok(solids.every(s => s.solid && s.min.x < s.max.x && s.min.y < s.max.y && s.min.z < s.max.z));
  assert.deepEqual(solids[0].min, {x: 15.95, y: 2.575 - 3.198 / 2, z: 13.975 - 8.21 / 2});
  assert.deepEqual(solids[0].max, {x: 18.95, y: 2.575 + 3.198 / 2, z: 13.975 + 8.21 / 2});
  assert.ok(Object.isFrozen(solids));
});

test('SH16 mapped cargo contacts are accepted by BOTH current movement and bullet collision APIs', () => {
  const solids = buildContainersProxySolids(CONTAINERS_BUILD28_HULLS);
  const cargo = solids[0];
  const spawnInside = { x: cargo.x, y: cargo.y, z: cargo.z };
  const resolved = resolveWalk(spawnInside, .34, [cargo]);
  assert.ok(Math.abs(resolved.x - cargo.x) >= cargo.w / 2, 'horizontal proxy solver must push outside');
  const start = { x: cargo.x, y: cargo.y, z: cargo.max.z + 3 };
  const end = { x: cargo.x, y: cargo.y, z: cargo.min.z - 3 };
  const t = segmentAabb(start, end, cargo.min, cargo.max);
  assert.ok(t !== null && t > 0 && t < 1, 'segment must hit the rendered cargo envelope');
  assert.equal(segmentAabb({ ...start, x: 30 }, { ...end, x: 30 }, cargo.min, cargo.max), null);
});

test('SH16 rejects invented geometry, duplicate ids and malformed/unrepresentable AABB sizes', () => {
  assert.throws(() => buildContainersProxySolids([{id: 'generated-ground',center:[0,0,0],size:[2,2,2]}]), /exactly five/);
  assert.throws(() => buildContainersProxySolids([...CONTAINERS_BUILD28_HULLS.slice(0, 4), CONTAINERS_BUILD28_HULLS[0]]), /duplicate/);
  assert.throws(() => buildContainersProxySolids(CONTAINERS_BUILD28_HULLS.map((x,i) => i === 0 ? { ...x, size: [0, 1, 1] } : x)), /positive/);
  assert.throws(() => buildContainersProxySolids(CONTAINERS_BUILD28_HULLS.map((x,i) => i === 0 ? { ...x, center: [1e300, 0, 0] } : x)), /float32/);
});

test('SH16 proves legacy movement clamps would teleport the DEMO camera; does not invent native spawn', () => {
  const solids = buildContainersProxySolids(CONTAINERS_BUILD28_HULLS);
  const report = assessLegacySpawnBounds(CONTAINERS_BUILD28_DEMO_CAMERA,
    {x: [-14.9, 14.9], z: [-33.8, 21.8]}, solids);
  assert.equal(report.cameraOutsideLegacyMovementBounds, true);
  assert.equal(report.outsideLegacyX, false);
  assert.equal(report.outsideLegacyZ, true);
  assert.deepEqual(report.centersBeyondLegacyX, ['cargo-22','cargo-upper']);
  assert.deepEqual(report.centersBeyondLegacyZ, []);
  assert.equal(report.nativeSpawnProven, false);
});
