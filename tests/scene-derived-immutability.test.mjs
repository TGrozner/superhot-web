import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSceneGraph } from '../src/scenes/graph.js';
import { planSceneDraws } from '../src/visual/scene-plan.js';

// Generated fixtures only; no scene, mesh, material or transform from MCD.
const box = () => ({ kind: 'box', size: { x: 2, y: 2, z: 2 } });
const camera = { x: 0, y: 1.7, z: 12, yaw: 0, pitch: 0 };
const nodesAt = (x) => [{ id: 'generated-box', primitive: box(),
  transform: { position: { x, y: 1.7, z: 0 } } }];

test('built matrices and bounding values are immutable together', () => {
  const [item] = buildSceneGraph(nodesAt(0));
  for (const value of [item, item.sourceMatrix, item.worldMatrix, item.bounds,
    item.bounds.center, item.bounds.halfExtents, item.primitive, item.primitive.size]) {
    assert.equal(Object.isFrozen(value), true);
  }
  assert.throws(() => { item.worldMatrix[12] = 20; }, TypeError);
  assert.throws(() => { item.sourceMatrix[12] = 20; }, TypeError);
  assert.throws(() => { item.bounds.center.x = 20; }, TypeError);
  assert.throws(() => { item.bounds.halfExtents.x = 100; }, TypeError);
  assert.throws(() => { item.bounds.radius = 0; }, TypeError);
  assert.throws(() => { item.bounds = null; }, TypeError);
  assert.equal(item.worldMatrix[12], item.bounds.center.x);
});

test('a graph matrix cannot be moved behind cached culling bounds', () => {
  const graph = buildSceneGraph(nodesAt(20));
  assert.equal(planSceneDraws(graph, camera).culled, 1);
  assert.throws(() => { graph[0].worldMatrix[12] = 0; }, TypeError);
  assert.equal(planSceneDraws(graph, camera).culled, 1);
  assert.equal(graph[0].worldMatrix[12], graph[0].bounds.center.x);
});

test('editing authored transform requires an explicit rebuild', () => {
  const authored = nodesAt(20);
  const oldGraph = buildSceneGraph(authored);
  authored[0].transform.position.x = 0;
  assert.equal(planSceneDraws(oldGraph, camera).culled, 1);
  const newGraph = buildSceneGraph(authored);
  assert.equal(planSceneDraws(newGraph, camera).packets.length, 1);
  assert.equal(oldGraph[0].worldMatrix[12], 20);
  assert.equal(newGraph[0].worldMatrix[12], 0);
});

test('Unity-coordinate source and mirrored world matrices both stay immutable', () => {
  const graph = buildSceneGraph([
    { id: 'parent', transform: { position: { x: 4, y: 0, z: 3 } } },
    { id: 'child', parentId: 'parent', primitive: box(),
      transform: { position: { x: 1, y: 0, z: 2 } } },
  ], { coordinates: 'unity' });
  assert.notStrictEqual(graph[0].sourceMatrix, graph[0].worldMatrix);
  assert.equal(graph[0].sourceMatrix[14], 3);
  assert.equal(graph[0].worldMatrix[14], -3);
  assert.equal(graph[1].sourceMatrix[14], 5);
  assert.equal(graph[1].worldMatrix[14], -5);
  assert.throws(() => { graph[0].sourceMatrix[14] = 500; }, TypeError);
  assert.throws(() => { graph[1].worldMatrix[14] = 500; }, TypeError);
  assert.equal(graph[1].bounds.center.z, -5);
});

test('material and visibility are part of the built scene snapshot', () => {
  const authored = nodesAt(0);
  const oldGraph = buildSceneGraph(authored);
  assert.throws(() => { oldGraph[0].material = 'steel'; }, TypeError);
  assert.throws(() => { oldGraph[0].visible = false; }, TypeError);
  authored[0].material = 'steel';
  authored[0].visible = false;
  assert.equal(oldGraph[0].material, 'chalk');
  assert.equal(oldGraph[0].visible, true);
  const rebuilt = buildSceneGraph(authored);
  assert.equal(rebuilt[0].material, 'steel');
  assert.equal(rebuilt[0].visible, false);
});
