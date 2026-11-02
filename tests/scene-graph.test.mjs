import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSceneGraph, boxBounds, composeLocalMatrix, mirrorZ, multiplyMatrices, unityObjectKey } from '../src/scenes/graph.js';

const approx = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, String(a) + ' != ' + String(b));
const box = { kind: 'box', size: { x: 2, y: 4, z: 6 } };

test('Unity identities combine owner and exact path_id, no float corruption', () => {
  assert.notEqual(unityObjectKey('a', '1'), unityObjectKey('b', '1'));
  assert.equal(unityObjectKey('owner', 5n), unityObjectKey('owner', '5'));
  assert.throws(() => unityObjectKey('a', Number.MAX_SAFE_INTEGER + 2), /Unsafe/);
  assert.throws(() => unityObjectKey('a', '1.5'), /integer/);
});
test('TRS uses column-major matrices; identity and translation are exact', () => {
  const m = composeLocalMatrix({ position: { x: 2, y: 3, z: 4 } });
  assert.deepEqual(m.slice(12, 16), [2, 3, 4, 1]);
  assert.deepEqual(m.slice(0, 12), [1,0,0,0,0,1,0,0,0,0,1,0]);
  assert.deepEqual(multiplyMatrices(composeLocalMatrix(), m), m);
});
test('parent transforms compose regardless of node ordering', () => {
  const graph = buildSceneGraph([
    { id: 'child', parentId: 'root', transform: { position: {x:1,y:0,z:2} }, primitive: box },
    { id: 'root', transform: { position: {x:4,y:5,z:6}, scale: {x:2,y:2,z:2} } },
  ]);
  assert.deepEqual(graph[0].worldMatrix.slice(12, 15), [6,5,10]);
  assert.deepEqual(graph[0].bounds.halfExtents, {x:2,y:4,z:6});
});
test('Unity coordinate reflection reverses Z without changing X/Y', () => {
  const matrix = composeLocalMatrix({position:{x:1,y:2,z:3}});
  assert.deepEqual(mirrorZ(matrix).slice(12,15), [1,2,-3]);
  const graph = buildSceneGraph([{id:'root',transform:{position:{x:1,y:2,z:3}},primitive:box}], {coordinates:'unity'});
  assert.deepEqual(graph[0].worldMatrix.slice(12,15), [1,2,-3]);
  assert.deepEqual(mirrorZ(mirrorZ(matrix)), matrix);
});
test('rotations and nonuniform scale enlarge true world bounds', () => {
  const angle = Math.PI/4, q = {x:0,y:Math.sin(angle),z:0,w:Math.cos(angle)};
  const m = composeLocalMatrix({rotation:q,scale:{x:2,y:1,z:1}});
  const b = boxBounds(m,box.size);
  approx(b.halfExtents.x,3); approx(b.halfExtents.y,2); approx(b.halfExtents.z,2);
});
test('negative scale and zero-sized boxes are safe; zero quaternion is not', () => {
  const m = composeLocalMatrix({scale:{x:-2,y:1,z:0}});
  assert.deepEqual(boxBounds(m,{x:2,y:4,z:0}).halfExtents,{x:2,y:2,z:0});
  assert.throws(() => composeLocalMatrix({rotation:{x:0,y:0,z:0,w:0}}), /zero/);
});
test('unknown parents, cycles, duplicates, invalid primitive rejected', () => {
  assert.throws(() => buildSceneGraph([{id:'a',parentId:'b'}]), /Missing/);
  assert.throws(() => buildSceneGraph([{id:'a',parentId:'b'},{id:'b',parentId:'a'}]), /Cycle/);
  assert.throws(() => buildSceneGraph([{id:'a'},{id:'a'}]), /distinct/);
  assert.throws(() => buildSceneGraph([{id:'x',primitive:{kind:'mesh'}}]), /Unsupported/);
});
test('visibility inherits from parents', () => {
  const g = buildSceneGraph([{id:'b',parentId:'a',primitive:box},{id:'a',visible:false}]);
  assert.equal(g[0].visible,false);
});
