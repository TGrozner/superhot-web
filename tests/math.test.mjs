import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraAxes, clamp, normalize3, segmentSphere, segmentAabb, resolveWalk } from '../src/math.js';

test('camera faces -Z at zero yaw and pitch',()=>{
  const a=cameraAxes(0,0);
  assert.deepEqual(a.forward,{x:0,y:0,z:-1});
  assert.deepEqual(a.right,{x:1,y:0,z:0});
});
test('camera directions remain normalized',()=>{
  const a=cameraAxes(.83,.37);
  for(const direction of Object.values(a)) assert.ok(Math.abs(Math.hypot(...Object.values(direction))-1)<1e-9);
});
test('clamp handles both boundaries',()=>{
  assert.equal(clamp(-4,0,1),0); assert.equal(clamp(3,0,1),1);
});
test('normalization safe for zero vector',()=>{
  assert.deepEqual(normalize3({x:0,y:0,z:0}),{x:0,y:0,z:0});
});
test('segment-sphere: hit, miss, inside, and short segment',()=>{
  assert.equal(segmentSphere({x:0,y:0,z:0},{x:10,y:0,z:0},{x:5,y:0,z:0},1),.4);
  assert.equal(segmentSphere({x:0,y:0,z:0},{x:10,y:0,z:0},{x:5,y:4,z:0},1),null);
  assert.equal(segmentSphere({x:5,y:0,z:0},{x:10,y:0,z:0},{x:5,y:0,z:0},1),0);
  assert.equal(segmentSphere({x:0,y:0,z:0},{x:0,y:0,z:0},{x:0,y:0,z:0},1),0);
});
test('segment-AABB: enters, misses and starts inside',()=>{
  const min={x:4,y:-1,z:-1},max={x:6,y:1,z:1};
  assert.equal(segmentAabb({x:0,y:0,z:0},{x:10,y:0,z:0},min,max),.4);
  assert.equal(segmentAabb({x:0,y:4,z:0},{x:10,y:4,z:0},min,max),null);
  assert.equal(segmentAabb({x:5,y:0,z:0},{x:8,y:0,z:0},min,max),0);
});
test('walking collision pushes a player outside solids',()=>{
  const solids=[{x:0,z:0,w:2,d:2}];
  const result=resolveWalk({x:1.1,y:1.6,z:0},.4,solids);
  assert.ok(result.x>=1.4-1e-9);
});
