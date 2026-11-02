import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PROTOTYPE_TIME_RULES,
  createTimeState,
  getTargetTimeScale,
  stepTime,
} from '../src/time.js';
import {
  PROTOTYPE_INPUT_RULES,
  keydownAction,
  movementStep,
  applyMouseLook,
} from '../src/input.js';

// These are differential *questions* for SH-01, not native parity assertions.
// Primary evidence covers TimeControl field declarations ONLY. HANDOFF.md
// reports remain INCONNU until methods, scene bindings and runtime are read.
const ledger = JSON.parse(await readFile(
  new URL('../docs/parity/time-input-camera.evidence.json', import.meta.url),
  'utf8',
));
const nativeDeclaration = (symbol) => ledger.claims.find((c) => c.symbol === symbol);
const secondary = (id) => ledger.secondaryReport.findings.find((c) => c.id === id);
const closeTo = (actual, expected) => assert.ok(
  Math.abs(actual - expected) < 1e-12,
  `expected ${actual} to be approximately ${expected}`,
);

test('TC-G01: Web idle target is not promoted from a native field initializer', () => {
  const native = nativeDeclaration('TimeControl.minTimescale');
  assert.equal(native.classification, 'PROUVE');
  assert.equal(native.scope, 'decompiled-field-initializer');
  assert.equal(native.runtimeValidated, false);
  assert.equal(native.value, 0.01);
  assert.equal(PROTOTYPE_TIME_RULES.minimumScale, 0.035);
  assert.notEqual(PROTOTYPE_TIME_RULES.minimumScale, native.value);
  assert.equal(getTargetTimeScale(), PROTOTYPE_TIME_RULES.minimumScale);
  assert.equal(secondary('TC-R01').classification, 'INCONNU');
});

test('TC-G02: real/world clocks and pause are measured for Web only', () => {
  const before = createTimeState();
  const active = stepTime(before, { dt: 1 / 60, moving: true });
  closeTo(active.realDelta, 1 / 60);
  closeTo(active.worldDelta, active.realDelta * active.timeScale);
  assert.equal(active.targetScale, PROTOTYPE_TIME_RULES.movingScale);
  const paused = stepTime(active, { dt: 1, paused: true });
  assert.equal(paused.realDelta, 0);
  assert.equal(paused.worldDelta, 0);
  assert.equal(paused.timeScale, active.timeScale);
  assert.equal(paused.realClock, active.realClock);
  assert.equal(paused.worldClock, active.worldClock);
  assert.equal(secondary('TC-R01').classification, 'INCONNU');
  assert.deepEqual(ledger.observations, []);
});

test('TC-G03: KeyR reload is solely the existing Web mapping, not proven MCD Replay', () => {
  assert.equal(keydownAction({ code: 'KeyR', screen: 'playing' }), 'reload');
  assert.equal(keydownAction({ code: 'KeyR', screen: 'playing', repeat: true }), null);
  const report = secondary('TC-R04');
  assert.equal(report.classification, 'INCONNU');
  assert.match(report.reportedClaim, /Replay/);
  assert.match(report.requiredPrimaryEvidence, /dispatch/);
});

test('TC-G04: Web movement currently uses unscaled dt; native binding is unknown', () => {
  const keys = new Set(['KeyW']);
  const a = movementStep(keys, 0, 1 / 60);
  const b = movementStep(keys, 0, 1 / 30);
  closeTo(a.dz, -PROTOTYPE_INPUT_RULES.walkSpeed / 60);
  closeTo(b.dz, 2 * a.dz);
  assert.equal(secondary('TC-R02').classification, 'INCONNU');
  assert.match(secondary('TC-R02').requiredPrimaryEvidence, /scene/);
});

test('TC-G05: Web camera is bounded; no native controller/fov/pitch contract yet', () => {
  const a = applyMouseLook({ yaw: 0, pitch: 0, movementX: 10, movementY: 5 });
  closeTo(a.yaw, 10 * PROTOTYPE_INPUT_RULES.mouseSensitivity);
  closeTo(a.pitch, -5 * PROTOTYPE_INPUT_RULES.mouseSensitivity);
  const upper = applyMouseLook({ yaw: 0, pitch: 0, movementX: 0, movementY: -10000 });
  assert.equal(upper.pitch, PROTOTYPE_INPUT_RULES.pitchLimit);
  assert.equal(secondary('TC-R05').classification, 'INCONNU');
  assert.equal(ledger.unknowns.find((c) => c.id === 'TC-U04').classification, 'INCONNU');
});
