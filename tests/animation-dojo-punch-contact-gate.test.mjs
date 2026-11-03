import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDojoPunchContactGate,
  advanceDojoPunchContactGate,
} from '../src/animation/dojo-punch-contact-gate.js';

const ON = 0.4686083197593689;
const OFF = 0.7319236993789673;
const proof = Object.freeze({
  clipOwner: 'sharedassets0.assets', clipPathId: 468,
  activeClipConfirmed: true, preparedIntervalConfirmed: true,
  activeGameObjectConfirmed: true, methodReceiverConfirmed: true,
});
const begin = (initialClipTime = 0, strikeId = 'punch-1') =>
  createDojoPunchContactGate({ attackerId: 'enemy-1', strikeId, initialClipTime });
const hit = (clipTime, changes = {}) => ({
  attackerId: 'enemy-1', strikeId: 'punch-1', victimId: 'player',
  clipTime, provenance: 'web-hitbox-sweep',
  geometryContactConfirmed: true, ...changes,
});
const step = (state, currentClipTime, contact = null, changes = {}) =>
  advanceDojoPunchContactGate(state, {
    ...proof, currentClipTime, contact, ...changes,
  });

test('intent alone never hits: gate is closed before source MeleeDamageStart', () => {
  const result = step(begin(), ON - 0.01, hit(0.2));
  assert.equal(result.contactStatus, 'damage-window-closed');
  assert.deepEqual(result.requests, []);
  assert.equal(result.state.damageEnabled, false);
});

test('MeleeDamageStart opens the next qualified Web contact and emits one request', () => {
  const open = step(begin(), 0.5);
  assert.deepEqual(open.eventWrites.map(e => [e.callback, e.value]),
    [['MeleeDamageStart', true]]);
  assert.equal(open.state.damageEnabled, true);
  const result = step(open.state, 0.6, hit(0.57));
  assert.equal(result.contactStatus, 'requested-web-preview');
  assert.deepEqual(result.requests, [{
    op: 'request-web-player-melee-contact',
    attackerId: 'enemy-1', strikeId: 'punch-1', victimId: 'player',
    clipTime: 0.57,
    provenance: 'source-window-plus-qualified-web-sweep',
    parity: 'WEB_PREVIEW_NOT_NATIVE_VERIFIED',
  }]);
  assert.equal(result.state.contactIssued, true);
});

test('MeleeDamageEnd closes the window; contacts after the end do not damage', () => {
  const open = step(begin(), 0.6);
  const end = step(open.state, 0.8, hit(0.77));
  assert.deepEqual(end.eventWrites.map(e => [e.callback, e.value]),
    [['MeleeDamageEnd', false]]);
  assert.equal(end.state.damageEnabled, false);
  assert.equal(end.contactStatus, 'damage-window-closed');
  assert.deepEqual(end.requests, []);
});

test('one large animation step can cross both events and still gate a mid-window contact', () => {
  const result = step(begin(0.3), 0.9, hit(0.65));
  assert.deepEqual(result.eventWrites.map(e => [e.callback, e.value]),
    [['MeleeDamageStart', true], ['MeleeDamageEnd', false]]);
  assert.equal(result.contactStatus, 'requested-web-preview');
  assert.equal(result.requests.length, 1);
  assert.equal(result.state.damageEnabled, false);
});

test('crossing both events does not allow a contact after the end', () => {
  const result = step(begin(0.3), 0.9, hit(0.8));
  assert.equal(result.contactStatus, 'damage-window-closed');
  assert.deepEqual(result.requests, []);
});

test('simultaneous event and contact timestamps are conservatively rejected', () => {
  const first = step(begin(), 0.6, hit(ON));
  assert.equal(first.contactStatus, 'same-time-order-unknown');
  assert.deepEqual(first.requests, []);
  const second = step(first.state, 0.9, hit(OFF));
  assert.equal(second.contactStatus, 'same-time-order-unknown');
  assert.deepEqual(second.requests, []);
});

test('a single swing cannot request duplicate damage across animation frames', () => {
  const first = step(begin(), 0.6, hit(0.55));
  const next = step(first.state, 0.68, hit(0.64));
  assert.equal(first.requests.length, 1);
  assert.equal(next.contactStatus, 'already-requested-this-strike');
  assert.deepEqual(next.requests, []);
  const newStrike = step(begin(0, 'punch-2'), 0.6,
    hit(0.55, { strikeId: 'punch-2' }));
  assert.equal(newStrike.requests.length, 1);
});

test('a lost playback/receiver proof closes even an already opened Web gate', () => {
  const opened = step(begin(), 0.55);
  for (const flag of [
    'activeClipConfirmed', 'preparedIntervalConfirmed',
    'activeGameObjectConfirmed', 'methodReceiverConfirmed',
  ]) {
    const result = step(opened.state, 0.6, hit(0.58), { [flag]: false });
    assert.equal(result.status, 'unqualified-dispatch');
    assert.equal(result.state.damageEnabled, false);
    assert.deepEqual(result.requests, []);
  }
});

test('wrong clip never borrows the source-authored punch interval', () => {
  const result = step(begin(), 0.6, hit(0.55), { clipPathId: 424 });
  assert.equal(result.status, 'unsupported-clip');
  assert.equal(result.state.damageEnabled, false);
  assert.deepEqual(result.requests, []);
});

test('wrong actor/strike and unqualified geometry cannot create a hit receipt', () => {
  const s = begin();
  for (const contact of [
    hit(0.56, { attackerId: 'enemy-other' }),
    hit(0.56, { strikeId: 'different' }),
    hit(0.56, { victimId: null }),
  ]) {
    const r = step(s, 0.6, contact);
    assert.equal(r.contactStatus, 'wrong-actor-or-strike');
    assert.deepEqual(r.requests, []);
  }
  for (const contact of [
    hit(0.56, { provenance: 'web-radius-proximity' }),
    hit(0.56, { geometryContactConfirmed: false }),
  ]) {
    const r = step(s, 0.6, contact);
    assert.equal(r.contactStatus, 'unqualified-geometry');
    assert.deepEqual(r.requests, []);
  }
});

test('contact must be sampled inside the prepared forward clip interval', () => {
  const state = begin();
  for (const clipTime of [-0.1, 0, 0.7]) {
    const r = step(state, 0.6, hit(clipTime));
    assert.equal(r.contactStatus, 'outside-prepared-interval');
    assert.deepEqual(r.requests, []);
  }
});

test('reverse and paused clip time never request a Web contact', () => {
  const reverse = step(begin(0.9), 0.3, hit(0.6));
  assert.deepEqual(reverse.eventWrites.map(e => [e.callback, e.value]),
    [['MeleeDamageEnd', false], ['MeleeDamageStart', true]]);
  assert.equal(reverse.contactStatus, 'reverse-or-paused');
  assert.deepEqual(reverse.requests, []);
  const paused = step(begin(0.6), 0.6, hit(0.6));
  assert.equal(paused.contactStatus, 'reverse-or-paused');
  assert.deepEqual(paused.requests, []);
});

test('attaching after Start without its event does not manufacture an active gate', () => {
  const result = step(begin(0.55), 0.65, hit(0.60));
  assert.equal(result.state.damageEnabled, false);
  assert.deepEqual(result.eventWrites, []);
  assert.deepEqual(result.requests, []);
});

test('invalid state/clip/contact timestamps fail rather than guess', () => {
  assert.throws(() => createDojoPunchContactGate({ attackerId: 'enemy-1', strikeId: 'punch-1' }), /initialClipTime/);
  assert.throws(() => createDojoPunchContactGate(), /attackerId/);
  assert.throws(() => step(begin(), Infinity), /currentClipTime/);
  assert.throws(() => step(begin(), 0.6, hit(NaN)), /contact.clipTime/);
  assert.throws(() => step(null, 0.6), /state/);
  assert.throws(() => step(begin(), 0.6, 1), /contact must/);
  assert.throws(() => step(begin(), 0.6, null,
    { preparedIntervalConfirmed: undefined }), /boolean/);
});

test('Dojo fist-02 gate uses its own shorter serialized window, not fist-01 timing', () => {
  const variant = { ...proof, clipPathId: 448 };
  const first = step(begin(), 0.35, hit(0.31), variant);
  assert.equal(first.requests.length, 1);
  assert.equal(first.requests[0].clipTime, 0.31);
  const after = step(begin(), 0.6, hit(0.50), variant);
  assert.equal(after.contactStatus, 'damage-window-closed');
  assert.deepEqual(after.requests, []);
  const laterFist01 = step(begin(), 0.35, hit(0.31), proof);
  assert.equal(laterFist01.contactStatus, 'damage-window-closed');
});
