import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSceneGraph } from '../src/scenes/graph.js';
import { isBoundsVisible, planSceneDraws } from '../src/visual/scene-plan.js';

const camera = { x:0, y:1.7, z:12, yaw:0, pitch:0 };
const box = {kind:'box',size:{x:2,y:2,z:2}};
const scene = (z, transform = {}) => buildSceneGraph([{id:'test', primitive:box, transform:{position:{x:0,y:1.7,z},...transform}}]);

test('front visible, behind culled, and far plane culled',()=>{
  assert.equal(planSceneDraws(scene(0),camera).packets.length,1);
  assert.equal(planSceneDraws(scene(30),camera).culled,1);
  assert.equal(planSceneDraws(scene(-200),camera).culled,1);
});
test('bounding radius conservatively keeps objects near viewport edge',()=>{
  const b = {center:{x:13,y:1.7,z:0},radius:3};
  assert.equal(isBoundsVisible(b,camera),true);
});
test('diagonal boxes map exactly to legacy renderer arguments',()=>{
  const result = planSceneDraws(scene(0),camera);
  assert.deepEqual(result.packets[0].legacyBoxArgs,[0,1.7,0,2,2,2,'#e6ecf0']);
  assert.equal(result.estimatedLegacyDrawCalls,1);
});
test('rotated boxes preserve affine matrix and cannot be flattened',()=>{
  const a = Math.PI/4;
  const result = planSceneDraws(scene(0,{rotation:{x:0,y:Math.sin(a),z:0,w:Math.cos(a)}}),camera);
  assert.equal(result.affineRequired,1);
  assert.equal(result.packets[0].legacyBoxArgs,null);
});
test('unknown materials are rejected rather than silently using an asset',()=>{
  const g=buildSceneGraph([{id:'x',primitive:box,material:'original-unknown',transform:{position:{x:0,y:1.7,z:0}}}]);
  assert.throws(()=>planSceneDraws(g,camera),/Unknown generated material/);
});
test('invalid projection raises and hidden nodes never produce draw calls',()=>{
  assert.throws(()=>isBoundsVisible({center:{x:0,y:0,z:0},radius:1},camera,{aspect:0}),/Invalid/);
  const g=buildSceneGraph([{id:'x',visible:false,primitive:box}]);
  const p=planSceneDraws(g,camera);
  assert.equal(p.hidden,1); assert.equal(p.packets.length,0);
});
test('culling a synthetic room reduces estimated CPU draw submissions',()=>{
  const nodes=Array.from({length:1000},(_,i)=>({
    id:'b'+i, material: i%2===0?'chalk':'red', primitive:{kind:'box',size:{x:1,y:1,z:1}},
    transform:{position:{x:i%2===0?0:200, y:1.7,z:-5-i%8}},
  }));
  const plan=planSceneDraws(buildSceneGraph(nodes),camera);
  assert.equal(plan.packets.length,500);
  assert.equal(plan.culled,500);
  assert.equal(plan.estimatedLegacyDrawCalls,500);
});
