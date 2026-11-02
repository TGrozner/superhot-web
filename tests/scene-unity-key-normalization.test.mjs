import test from 'node:test';
import assert from 'node:assert/strict';
import { unityObjectKey } from '../src/scenes/graph.js';

// Synthetic reference identities only; no Unity corpus objects or game assets.
test('decimal encodings of the same path_id share one canonical key', () => {
  const k = (id) => unityObjectKey('generated-owner', id);
  for (const id of [42, 42n, '42', '00042', '0000000042']) {
    assert.equal(k(id), k('42'));
  }
  assert.equal(k('-00042'), k(-42n));
  assert.equal(k('-0'), k(0));
  assert.equal(k('0000'), k(0n));
});

test('large signed Unity-style integer IDs retain exact digits', () => {
  const max = '9223372036854775807';
  const min = '-9223372036854775808';
  assert.equal(unityObjectKey('owner', max), unityObjectKey('owner', BigInt(max)));
  assert.equal(unityObjectKey('owner', '000' + max), unityObjectKey('owner', max));
  assert.equal(unityObjectKey('owner', '-0009223372036854775808'), unityObjectKey('owner', min));
  assert.notEqual(unityObjectKey('owner', max), unityObjectKey('owner', min));
});

test('owner and signed integer remain identity components', () => {
  assert.notEqual(unityObjectKey('asset-a', '42'), unityObjectKey('asset-b', 42));
  assert.notEqual(unityObjectKey('asset-a', '42'), unityObjectKey('asset-a', '-42'));
});

test('unsafe float and noninteger input cannot silently alias objects', () => {
  for (const invalid of ['', ' 42', '+42', '42 ', '4.2', '1e3', null, undefined, {}, [], true]) {
    assert.throws(() => unityObjectKey('owner', invalid), TypeError);
  }
  assert.throws(() => unityObjectKey('owner', Number.MAX_SAFE_INTEGER + 1), /Unsafe Unity path_id/);
});
