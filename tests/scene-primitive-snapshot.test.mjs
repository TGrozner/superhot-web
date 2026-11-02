import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSceneGraph } from '../src/scenes/graph.js';
import { planSceneDraws } from '../src/visual/scene-plan.js';

// All objects and coordinates below are generated Web test fixtures, NOT MCD.
const camera = { x: 0, y: 1.7, z: 12, yaw: 0, pitch: 0 };
const makeBox = (width = 2) => ({ kind: 'box', size: { x: width, y: 2, z: 2 } });
const atEdge = (primitive) => [{
  id: 'synthetic-edge', primitive,
  transform: { position: { x: 20, y: 1.7, z: 0 } },
}];

test('scene graph snapshots box dimensions rather than retaining authored references', () => {
  const authored = makeBox();
  const graph = buildSceneGraph(atEdge(authored));
  assert.notStrictEqual(graph[0].primitive, authored);
  assert.notStrictEqual(graph[0].primitive.size, authored.size);
  authored.size.x = 40;
  authored.size.y = 12;
  assert.deepEqual(graph[0].primitive.size, { x: 2, y: 2, z: 2 });
  assert.deepEqual(graph[0].bounds.halfExtents, { x: 1, y: 1, z: 1 });
});

test('derived primitive dimensions cannot be edited behind their cached bounds', () => {
  const graph = buildSceneGraph(atEdge(makeBox()));
  assert.equal(Object.isFrozen(graph[0].primitive), true);
  assert.equal(Object.isFrozen(graph[0].primitive.size), true);
  assert.throws(() => { graph[0].primitive.size.x = 40; }, TypeError);
  assert.throws(() => { graph[0].primitive.kind = 'other'; }, TypeError);
  assert.equal(graph[0].primitive.size.x, 2);
  assert.equal(graph[0].bounds.halfExtents.x, 1);
});

test('rebuilding after a size edit updates culling instead of leaving stale bounds', () => {
  const authored = makeBox();
  const original = buildSceneGraph(atEdge(authored));
  assert.equal(planSceneDraws(original, camera).culled, 1);
  authored.size.x = 40; // now a different, intentionally generated scene
  assert.equal(planSceneDraws(original, camera).culled, 1);
  const rebuilt = buildSceneGraph(atEdge(authored));
  assert.equal(rebuilt[0].bounds.halfExtents.x, 20);
  assert.equal(planSceneDraws(rebuilt, camera).packets.length, 1);
});

test('authored size getters are sampled once before both bounds and draw data', () => {
  const count = { x: 0, y: 0, z: 0 };
  const size = {};
  for (const axis of ['x', 'y', 'z']) {
    Object.defineProperty(size, axis, {
      get() { count[axis]++; return 2; },
    });
  }
  const graph = buildSceneGraph(atEdge({ kind: 'box', size }));
  assert.deepEqual(count, { x: 1, y: 1, z: 1 });
  assert.deepEqual(graph[0].primitive.size, { x: 2, y: 2, z: 2 });
  assert.equal(graph[0].bounds.halfExtents.x, 1);
});

test('generated box dimension validation still rejects invalid inputs', () => {
  for (const value of [NaN, Infinity, undefined, -1]) {
    assert.throws(() => buildSceneGraph(atEdge({ kind: 'box', size: { x: value, y: 2, z: 2 } })));
  }
  const valid = buildSceneGraph(atEdge(makeBox(0)));
  assert.equal(valid[0].primitive.size.x, 0);
});
