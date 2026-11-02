import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceFragment } from '../src/vfx/procedural-fragments.js';

const particle = (velocityX = 0, lifetime = 4) => ({
  position: { x: 0, y: 0, z: 0 },
  velocity: { x: velocityX, y: 0, z: 0 },
  age: 0, lifetime,
});

test('large finite acceleration has a finite displacement despite intermediate product overflow', () => {
  const result = advanceFragment(particle(), 1.5, { x: 1e308, y: 0, z: 0 });
  assert.equal(result.velocity.x, 1.5e308);
  assert.equal(result.position.x, 1.125e308);
  assert.equal(result.age, 1.5);
});

test('negative acceleration remains finite with equally large negative displacement', () => {
  const result = advanceFragment(particle(), 1.5, { x: -1e308, y: 0, z: 0 });
  assert.equal(result.velocity.x, -1.5e308);
  assert.equal(result.position.x, -1.125e308);
});

test('small acceleration and giant step preserve a finite quadratic displacement', () => {
  const result = advanceFragment(particle(0, 1e156), 1e155, { x: 1e-308, y: 0, z: 0 });
  assert.ok(Math.abs(result.position.x - 50) < 1e-12, `${result.position.x}`);
  assert.equal(result.age, 1e155);
});

test('genuinely non-finite particle outputs still fail explicitly', () => {
  assert.throws(() => advanceFragment(particle(), 2, { x: 1e308, y: 0, z: 0 }), /overflow/);
});
