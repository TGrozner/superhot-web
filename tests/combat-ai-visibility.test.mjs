import test from 'node:test';
import assert from 'node:assert/strict';
import { planPejAiTargetSight, planPejAiPlayerSight } from '../src/combat/ai-visibility.js';

const v = (x, y = 0, z = 0) => ({ x, y, z });
const hit = (distance, colliderTransformId, enemyControllerTransformId = null) =>
  ({ distance, colliderTransformId, enemyControllerTransformId });
const base = () => ({
  eyePosition: v(0, 1, 0), eyeForward: v(1),
  targetPosition: v(5, 1, 0), targetInstanceId: 400,
  sightDistance: 15, sightAngleDegrees: 60, eyesightLayerMask: 1000,
  disregardSightAngle: false, isTargetEnemy: false, useCache: false,
  nowSinceLevelLoad: 8, cacheRefreshTime: .25, cached: null,
  castHits: [hit(5, 400)],
});
const plan = overrides => planPejAiTargetSight({ ...base(), ...overrides });

test('without a source-qualified cast, returns UNKNOWN and exact source cast request', () => {
  const r = plan({ castHits: null });
  assert.equal(r.visible, null);
  assert.equal(r.status, 'source-physics-required');
  assert.deepEqual(r.castRequest, { origin: v(0,1,0), direction: v(1),
    radius: .2, maxDistance: 15, layerMask: 1000,
    ownBodyColliderTemporaryLayer: 2 });
});

test('a nearer wall prevents player sight even if player is another hit', () => {
  const r = plan({ castHits: [hit(5, 400), hit(2, 83)] });
  assert.equal(r.visible, false);
  assert.equal(r.updateCache, true);
});

test('exact target transform passes; unknown child or grandchild does not', () => {
  assert.equal(plan().visible, true);
  assert.equal(plan({ castHits: [hit(5, 401)] }).visible, false);
});

test('PejAiBodyPart controller transform matches only when isTargetEnemy', () => {
  const castHits = [hit(4, 914, 400)];
  assert.equal(plan({ castHits }).visible, false);
  assert.equal(plan({ isTargetEnemy: true, castHits }).visible, true);
});

test('front half and source angle guard apply; 360 bypasses angle', () => {
  assert.equal(plan({ eyeForward: v(-1) }).visible, false);
  assert.equal(plan({ eyeForward: v(-1), disregardSightAngle: true }).visible, true);
  assert.equal(plan({ eyeForward: v(0,0,1) }).visible, false);
  assert.equal(plan({ eyeForward: v(0,0,1), sightAngleDegrees: 90 }).visible, true);
});

test('zero-hit SphereCast early returns before source cache update', () => {
  const r = plan({ castHits: [] });
  assert.equal(r.status, 'no-cast-hit');
  assert.equal(r.visible, false);
  assert.equal(r.updateCache, false);
});

test('cache is selected only if requested, and expires on strict > comparison', () => {
  const cached = { at: 7.75, value: false };
  assert.equal(plan({ useCache: true, cached }).visible, false);
  assert.equal(plan({ useCache: false, cached }).visible, true);
  assert.equal(plan({ useCache: true,
    cached: { at: 7.749, value: false } }).visible, true);
});

test('missing cast, degenerate pose and source gaps never imply visible', () => {
  assert.equal(plan({ castHits: null }).visible, null);
  assert.equal(plan({ eyePosition: v(5,1,0) }).visible, null);
  assert.throws(() => plan({ castHits: undefined }), /castHits/);
  assert.throws(() => plan({ sightDistance: undefined }), /source sightDistance/);
  assert.throws(() => plan({ isTargetEnemy: undefined }), /boolean/);
  assert.throws(() => plan({ castHits: [hit(-1,400)] }), /distance/);
});

const player = overrides => planPejAiPlayerSight({
  mode: 'normal', targetSight: true, addictHotswitchActive: false,
  afterglowRemaining: 0, afterglowDuration: .5, ...overrides,
});

test('CanSeePlayer sight success resets afterglow; otherwise it can persist', () => {
  assert.deepEqual(player(), { status: 'source-visible', visible: true,
    resetAfterglow: true, afterglowValue: .5 });
  assert.equal(player({ targetSight: false, afterglowRemaining: .001 }).visible, true);
  assert.equal(player({ targetSight: false, afterglowRemaining: 0 }).visible, false);
  assert.equal(player({ targetSight: null }).visible, null);
});

test('CanSeePlayer360 may reuse afterglow but never reset it', () => {
  assert.equal(player({ mode: 'all-directions' }).resetAfterglow, false);
  assert.equal(player({ mode: 'all-directions', targetSight: false,
    afterglowRemaining: .01 }).visible, true);
});

test('hotswitch override is not a generic afterglow/360 override', () => {
  assert.equal(player({ mode: 'hotswitch', targetSight: false,
    addictHotswitchActive: true }).visible, true);
  assert.equal(player({ mode: 'hotswitch', targetSight: false,
    afterglowRemaining: 1 }).visible, false);
  assert.equal(player({ mode: 'hotswitch-all-directions', targetSight: false,
    addictHotswitchActive: true }).visible, false);
  assert.equal(player({ mode: 'hotswitch-all-directions', targetSight: true }).visible, true);
});

test('invalid active settings cannot silently turn into invented defaults', () => {
  assert.throws(() => plan({ eyesightLayerMask: undefined }), /source sightDistance/);
  assert.throws(() => player({ afterglowDuration: undefined }), /afterglow/);
  assert.throws(() => player({ mode: 'arbitrary' }), /mode/);
});
