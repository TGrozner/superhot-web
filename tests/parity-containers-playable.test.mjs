import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTAINERS_WEB_FALLBACK_SPAWN, buildContainersCollisionSolids,
  containersWalkSolids,
} from '../src/levels.js';
import { CONTAINERS_BUILD28_HULLS } from '../src/scenes/containers-build28.js';
import { planLocalMesh6Draws } from '../src/scenes/containers-mesh6-local-plan.js';
import { LOCAL_MESH7_GROUPS, planLocalMesh7Draws } from '../src/scenes/containers-mesh7-local-plan.js';
import { resolveWalk, segmentAabb } from '../src/math.js';

test('five source-derived Containers hulls retain independent 3D collider bounds', () => {
  const solids = buildContainersCollisionSolids();
  assert.equal(solids.length, 5);
  assert.deepEqual(solids.map(s => s.id), CONTAINERS_BUILD28_HULLS.map(h => h.id));
  for (const solid of solids) {
    assert.equal(solid.max.x - solid.min.x, solid.w);
    assert.ok(Math.abs((solid.max.y + solid.min.y) / 2 - solid.y) < 1e-12);
    assert.ok(Math.abs(solid.max.z - solid.min.z - solid.d) < 1e-12);
    assert.match(solid.provenance, /BoxCollider-AABB-Web-fallback/);
  }
  solids[0].min.x = -999;
  assert.notEqual(buildContainersCollisionSolids()[0].min.x, -999);
});

test('temporary player spawn is outside all cargo walls and remains unteleported', () => {
  const start = CONTAINERS_WEB_FALLBACK_SPAWN;
  const solids = containersWalkSolids(buildContainersCollisionSolids(), start.y);
  assert.equal(solids.some(s => start.x > s.min.x && start.x < s.max.x
    && start.z > s.min.z && start.z < s.max.z), false);
  const next = resolveWalk({ ...start }, 0.34, solids);
  assert.equal(next.x, start.x);
  assert.equal(next.z, start.z);
  assert.notEqual(start.z, 21.8, 'must not use old synthetic z clamp');
});

test('walking hits grounded source hull but not an overhead stacked container', () => {
  const solids = buildContainersCollisionSolids();
  const grounded = containersWalkSolids(solids, CONTAINERS_WEB_FALLBACK_SPAWN.y);
  assert.equal(grounded.some(s => s.id === 'cargo-upper'), false);
  assert.equal(grounded.some(s => s.id === 'cargo-7'), true);
  const stopped = resolveWalk({ x: 10, y: 2.65, z: 21 }, .34, grounded);
  assert.ok(stopped.z > 22, 'body cannot walk through cargo-7 from the front');
  assert.equal(containersWalkSolids(solids, 5.6).some(s => s.id === 'cargo-upper'), true);
  const sourceContact = segmentAabb(
    { x: 10, y: 2.5, z: 25 }, { x: 10, y: 2.5, z: 20 },
    solids.find(s => s.id === 'cargo-7').min,
    solids.find(s => s.id === 'cargo-7').max,
  );
  assert.ok(sourceContact !== null && sourceContact > 0 && sourceContact < 1);
});

test('Mesh6 triple placements + Mesh7 distinct 48/46/77 require six range draws', () => {
  const mesh6 = planLocalMesh6Draws({ group47Loaded: true });
  const ranges = LOCAL_MESH7_GROUPS.map((group, i) => ({
    groupName: group.groupName, firstIndex: i * 4638, indexCount: 4638,
  }));
  const mesh7 = planLocalMesh7Draws({ drawRanges: ranges });
  assert.equal(mesh6.drawPackets.length, 3);
  assert.equal(mesh7.drawPackets.length, 3);
  assert.equal(mesh6.expectedTriangles + mesh7.expectedTriangles, 9276);
  assert.deepEqual(mesh7.drawPackets.map(p => p.nativeSubmesh), [48, 46, 77]);
  assert.deepEqual(mesh7.drawPackets.map(p => p.generatedProxyCandidate),
    ['cargo-upper', 'cargo-86', 'cargo-21']);
  assert.notEqual(mesh7.drawPackets[0].drawRange.firstIndex,
    mesh7.drawPackets[1].drawRange.firstIndex);
});

test('only actual five source-qualified hull IDs may suppress generated preview cargo', () => {
  // The source list, not arbitrary mesh filenames, is the suppression authority.
  const ids = new Set(buildContainersCollisionSolids().map(s => s.id));
  for (const group of LOCAL_MESH7_GROUPS) assert.equal(ids.has(group.generatedProxyId), true);
  assert.equal(ids.has('generated-ground'), false);
});
