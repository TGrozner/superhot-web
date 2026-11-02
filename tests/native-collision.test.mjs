import test from 'node:test';
import assert from 'node:assert/strict';
import { segmentAabb } from '../src/math.js';
import {
  prepareNativeCollision, nativeCollisionView, nativeSegmentHit, nativeSphereHit, nativeCapsuleHit,
  nativeGroundAt, nativeCeilingAt, moveNativeCharacter,
} from '../src/scenes/native-collision.js';

const point = (x, y, z) => ({ x, y, z });
const close = (actual, expected, tolerance = 2e-5) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const body = { radius: .4, height: 1.8, stepOffset: .15, slopeLimit: 45, groundSnap: .05 };
function box(id, center, size, yaw = 0, extra = {}) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return {
    id, center: [0, 0, 0], size,
    worldMatrix: [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, ...center, 1],
    initial: { enabled: true, activeInHierarchy: true }, isTrigger: false, ...extra,
  };
}
const floor = () => box('floor', [0, -.5, 0], [100, 1, 100]);

test('rotated thin source box rejects broad-AABB false positives', () => {
  const scene = prepareNativeCollision([box('diagonal', [0, 0, 0], [4, 2, .1], Math.PI/4)]);
  const start = point(1, -2, 1), end = point(1, 2, 1);
  assert.notEqual(segmentAabb(start, end, scene.boxes[0].min, scene.boxes[0].max), null);
  assert.equal(nativeSegmentHit(scene, start, end), null);
  assert.equal(nativeSphereHit(scene, start, end, .1), null);
  assert.equal(nativeCapsuleHit(scene, point(1, -3, 1), point(1, 3, 1), body), null);
});

test('projectile returns the nearest box, impact point and outward normal independent of input order', () => {
  const scene = prepareNativeCollision([
    box('far', [8, 0, 0], [1, 2, 2]), box('near', [3, 0, 0], [1, 2, 2]),
  ]);
  const hit = nativeSegmentHit(scene, point(0, 0, 0), point(10, 0, 0));
  assert.equal(hit.collider.id, 'near');
  close(hit.t, .25); close(hit.point.x, 2.5);
  close(hit.normal.x, -1); close(hit.normal.y, 0); close(hit.normal.z, 0);
});

test('preparation applies local center, nonuniform scale, mirrored shear and hierarchy flags', () => {
  const shape = box('sheared', [0, 0, 0], [2, 2, 2], 0, {
    center: [1, 0, 0],
    worldMatrix: [-2, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 4, 0, 0, 1],
    worldAabb: { min: [-100, -100, -100], max: [100, 100, 100] },
  });
  const scene = prepareNativeCollision([
    shape,
    box('disabled', [-4, 0, 0], [1, 2, 2], 0, { initial: { enabled: false, activeInHierarchy: true } }),
    box('inactive', [-3, 0, 0], [1, 2, 2], 0, { initial: { enabled: true, activeInHierarchy: false } }),
    box('trigger', [-2, 0, 0], [1, 2, 2], 0, { isTrigger: true }),
  ]);
  assert.equal(scene.boxes.length, 1);
  const hit = nativeSegmentHit(scene, point(-5, .5, 0), point(10, .5, 0));
  close(hit.point.x, .5);
  close(hit.normal.x, -Math.SQRT1_2); close(hit.normal.y, Math.SQRT1_2);
  assert.equal(nativeSegmentHit(scene, point(-.8, .9, -2), point(-.8, .9, 2)), null);
});

test('finite-radius body continuously stops at thin walls and slides along them', () => {
  const scene = prepareNativeCollision([floor(), box('wall', [2, 2, 0], [.02, 4, 100])]);
  const result = moveNativeCharacter(scene, point(0, 0, 0), point(1000, 0, 3), body);
  close(result.position.x, 1.59); close(result.position.z, 3); close(result.position.y, 0);
  assert.equal(result.grounded, true);
  assert.equal(result.contacts[0].collider.id, 'wall');
});

test('two walls block a corner without oscillation or movement through either wall', () => {
  const scene = prepareNativeCollision([
    floor(), box('x-wall', [2, 2, 0], [.1, 4, 100]), box('z-wall', [0, 2, 2], [100, 4, .1]),
  ]);
  const result = moveNativeCharacter(scene, point(0, 0, 0), point(10, 0, 10), body);
  close(result.position.x, 1.55); close(result.position.z, 1.55);
  assert.ok(result.contacts.some(hit => hit.collider.id === 'x-wall'));
  assert.ok(result.contacts.some(hit => hit.collider.id === 'z-wall'));
});

test('capsule has a circular footprint through rotated narrow doorways', () => {
  const yaw = Math.PI/4, c = Math.cos(yaw), s = Math.sin(yaw);
  const rotate = (x, y, z) => point(c*x+s*z, y, -s*x+c*z);
  const scene = prepareNativeCollision([
    box('left-jamb', Object.values(rotate(-1.45, 1, 0)), [2, 2, .4], yaw),
    box('right-jamb', Object.values(rotate(1.45, 1, 0)), [2, 2, .4], yaw),
  ]);
  assert.equal(nativeCapsuleHit(scene, rotate(0, 0, -5), rotate(0, 0, 5), body), null);
  assert.notEqual(nativeCapsuleHit(scene, rotate(.1, 0, -5), rotate(.1, 0, 5), body), null);
});

test('raised floor query returns only reachable support and does not teleport between floors', () => {
  const scene = prepareNativeCollision([
    floor(), box('upper-floor', [0, 3, 0], [10, .4, 10]),
  ]);
  const below = nativeGroundAt(scene, point(0, .1, 0), { ...body, maxDrop: .2, maxRise: 5 });
  close(below.y, 0); assert.equal(below.collider.id, 'floor');
  const above = nativeGroundAt(scene, point(0, 3.3, 0), { ...body, maxDrop: .2 });
  close(above.y, 3.2); assert.equal(above.collider.id, 'upper-floor');
  assert.equal(nativeGroundAt(scene, point(0, 2, 0), { ...body, maxDrop: .1 }), null);
  const airborne = moveNativeCharacter(prepareNativeCollision([floor()]), point(0, 5, 0), point(1, 0, 0), body);
  close(airborne.position.y, 5); assert.equal(airborne.grounded, false);
});

test('finite height detects overhead surfaces and stops upward movement', () => {
  const scene = prepareNativeCollision([floor(), box('ceiling', [0, 2.5, 0], [10, .2, 10])]);
  const ceiling = nativeCeilingAt(scene, point(0, 0, 0), { ...body, maxRise: 5 });
  close(ceiling.y, 2.4); close(ceiling.feetY, .6); close(ceiling.normal.y, -1);
  const result = moveNativeCharacter(scene, point(0, 0, 0), point(0, 10, 0), body);
  close(result.position.y, .6); assert.equal(result.ceiling, true);
  assert.equal(result.grounded, false);
});

test('source-sized stair is traversable with headroom; a higher riser is blocked', () => {
  const stair = box('stair', [2, .05, 0], [2, .1, 4]);
  const scene = prepareNativeCollision([floor(), stair]);
  const result = moveNativeCharacter(scene, point(0, 0, 0), point(2, 0, 0), body);
  close(result.position.x, 2); close(result.position.y, .1); assert.equal(result.grounded, true);
  const high = prepareNativeCollision([floor(), box('high-step', [2, .5, 0], [2, 1, 4])]);
  const blocked = moveNativeCharacter(high, point(0, 0, 0), point(2, 0, 0), body);
  assert.ok(blocked.position.x < 1); close(blocked.position.y, 0);
});

test('a stair cannot lift the capsule through a low ceiling', () => {
  const scene = prepareNativeCollision([
    floor(), box('stair', [2, .05, 0], [2, .1, 4]),
    box('low-ceiling', [0, 1.9, 0], [20, .1, 20]),
  ]);
  const result = moveNativeCharacter(scene, point(0, 0, 0), point(2, 0, 0), body);
  assert.ok(result.position.x < 1); assert.ok(result.position.y <= .05 + 2e-5);
});

test('a landing uses continuous downward collision rather than the destination floor', () => {
  const scene = prepareNativeCollision([floor(), box('platform', [0, 2, 0], [4, .2, 4])]);
  const result = moveNativeCharacter(scene, point(0, 8, 0), point(0, -100, 0), body);
  close(result.position.y, 2.1); assert.equal(result.grounded, true);
});

test('throwable sphere hits an edge that the center ray misses and supplies surface contact', () => {
  const scene = prepareNativeCollision([box('edge', [2, 0, 0], [.02, 1, 1])]);
  const start = point(0, .65, 0), end = point(100, .65, 0);
  assert.equal(nativeSegmentHit(scene, start, end), null);
  const hit = nativeSphereHit(scene, start, end, .2);
  assert.ok(hit && hit.t < .02);
  close(hit.point.x, 1.99); close(hit.point.y, .5);
  close(Math.hypot(hit.normal.x, hit.normal.y, hit.normal.z), 1);
  assert.ok(hit.normal.x < 0 && hit.normal.y > 0);
});

test('non-walkable slopes do not become ground support', () => {
  const tilt = Math.PI/3, c = Math.cos(tilt), s = Math.sin(tilt);
  const scene = prepareNativeCollision([box('steep', [0, 0, 0], [10, .1, 10], 0, {
    worldMatrix: [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  })]);
  assert.equal(nativeGroundAt(scene, point(0, 2, 0), { ...body, maxDrop: 5 }), null);
});

test('pickup collider toggles affect every trace without rebuilding or changing source flags', () => {
  const source = box('pickup', [2, 1, 0], [.2, 2, 2]);
  const scene = prepareNativeCollision([source]);
  const start = point(0, 1, 0), end = point(5, 1, 0);
  assert.ok(nativeSegmentHit(scene, start, end));
  assert.ok(nativeSphereHit(scene, start, end, .2));
  assert.ok(nativeCapsuleHit(scene, point(0, 0, 0), point(5, 0, 0), body));
  assert.equal(scene.setEnabled('pickup', false), true);
  assert.equal(nativeSegmentHit(scene, start, end), null);
  assert.equal(nativeSphereHit(scene, start, end, .2), null);
  assert.equal(nativeCapsuleHit(scene, point(0, 0, 0), point(5, 0, 0), body), null);
  assert.equal(source.initial.enabled, true);
  assert.equal(scene.setEnabled('absent', false), false);
  assert.equal(scene.setEnabled('pickup', true), true);
  assert.ok(nativeSegmentHit(scene, start, end));
});

test('signed source dimensions retain the same solid and ground surface', () => {
  const positive=prepareNativeCollision([box('positive',[0,-.5,0],[8,1,8])]);
  const signedSource=box('signed',[0,-.5,0],[-8,1,-8]);
  const signed=prepareNativeCollision([signedSource]);
  const start=point(0,2,0),end=point(0,-2,0);
  close(nativeSegmentHit(signed,start,end).t,nativeSegmentHit(positive,start,end).t);
  close(nativeGroundAt(signed,point(0,.2,0),{...body,maxDrop:1}).y,0);
  assert.deepEqual(signedSource.size,[-8,1,-8]);
});

test('a player-only barrier does not stop enemies or shots and shared pickups stay disabled',()=>{
  const root=prepareNativeCollision([
    box('boundary',[2,1,0],[.1,2,2],0,{layer:{index:21}}),
    box('prop',[4,1,0],[.2,2,2],0,{layer:{index:8}}),
  ]);
  const player=nativeCollisionView(root,(1<<21)|(1<<8)),enemy=nativeCollisionView(root,1<<8);
  const start=point(0,1,0),end=point(6,1,0);
  assert.equal(nativeSegmentHit(player,start,end).collider.id,'boundary');
  assert.equal(nativeSegmentHit(enemy,start,end).collider.id,'prop');
  root.setEnabled('prop',false);
  assert.equal(nativeSegmentHit(enemy,start,end),null);
  assert.equal(nativeSegmentHit(player,start,end).collider.id,'boundary');
});
