import test from 'node:test';
import assert from 'node:assert/strict';
import { blendBonePoses } from '../src/animation/pose-blend.js';

const identity = Object.freeze({ x: 0, y: 0, z: 0, w: 1 });
const normal = (x) => ({ id: 'bone', position: { x, y: 0, z: 0 }, rotation: identity });

test('reads each translation coordinate once (validated value is the blended value)', () => {
  let xReads = 0;
  const position = {
    get x() { xReads++; return xReads === 1 ? 2 : NaN; },
    y: 0, z: 0,
  };
  const result = blendBonePoses([{ id: 'bone', position, rotation: identity }], [normal(4)], 0.5);
  assert.equal(result[0].position.x, 3);
  assert.equal(xReads, 1);
});

test('reads pose position property once, rather than validating one object and blending another', () => {
  let reads = 0;
  const bone = {
    id: 'bone',
    get position() { reads++; return reads === 1 ? { x: 2, y: 0, z: 0 } : { x: NaN, y: 0, z: 0 }; },
    rotation: identity,
  };
  assert.equal(blendBonePoses([bone], [normal(4)], 0.5)[0].position.x, 3);
  assert.equal(reads, 1);
});

test('normalizes the rotation from one validated component snapshot', () => {
  let wReads = 0;
  const rotation = {
    x: 0, y: 0, z: 0,
    get w() { wReads++; return wReads === 1 ? 2 : NaN; },
  };
  const result = blendBonePoses([
    { id: 'bone', position: { x: 0, y: 0, z: 0 }, rotation },
  ], [normal(0)], 0.5);
  assert.deepEqual(result[0].rotation, identity);
  assert.equal(wReads, 1);
});

test('reads changing bone id once for validation and matching', () => {
  let idReads = 0;
  const bone = {
    get id() { idReads++; return idReads === 1 ? 'bone' : 'other'; },
    position: { x: 2, y: 0, z: 0 },
    rotation: identity,
  };
  assert.equal(blendBonePoses([bone], [normal(4)], 0.5)[0].id, 'bone');
  assert.equal(idReads, 1);
});
