import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NATIVE_PROVENANCE, VERDICT,
  createAcceptanceReport,
  hasUnresolvedAcceptance,
  qualifyReportedGap,
} from '../scripts/acceptance-report.mjs';
import {
  PROTOTYPE_TIME_RULES, createTimeState, getTargetTimeScale,
  sampleFrameDelta, stepTime,
} from '../src/time.js';
import { keydownAction, movementStep } from '../src/input.js';
import { advanceProjectile } from '../src/combat/projectiles.js';

const report = createAcceptanceReport();
const scenarios = new Map(report.scenarios.map((entry) => [entry.id, entry]));
const almost = (actual, expected) => assert.ok(
  Number.isFinite(actual) && Math.abs(actual - expected) < 1e-12,
  'expected ' + actual + ' to equal ' + expected,
);

test('SH10 provenance cannot silently promote handoff to original runtime measurement', () => {
  assert.equal(NATIVE_PROVENANCE.game, 'SUPERHOT: MIND CONTROL DELETE');
  assert.equal(NATIVE_PROVENANCE.steamBuild, '20299547');
  assert.equal(NATIVE_PROVENANCE.handoff.artifactId, 13131037087);
  assert.equal(NATIVE_PROVENANCE.handoff.evidenceLevel, 'SECONDARY_HANDOFF_NOT_PRIMARY_RUNTIME');
  assert.match(NATIVE_PROVENANCE.handoff.retrievedTextSha256, /^[0-9a-f]{64}$/);
  assert.equal(report.numericNativeRuntimeTraceCount, 0);
  assert.equal(report.comparisonsToOriginalRuntimeExecuted, 0);
  assert.equal(report.source.browserSessionExecuted, false);
  assert.equal(report.counts.certifiedParity, 0);
  assert.equal(report.scenarios.length, 5);
  assert.equal(new Set(report.scenarios.map((entry) => entry.id)).size, 5);
  for (const item of report.scenarios) {
    assert.equal(item.native.evidenceLevel, 'SECONDARY_HANDOFF_NOT_PRIMARY_RUNTIME');
    assert.equal(item.native.nativeRunMeasured, false);
    assert.equal(item.parityCertified, false);
    assert.ok(item.native.primaryNeeded.length > 20);
    assert.ok(item.convergence.length > 20);
    assert.ok(['P0', 'P1'].includes(item.priority));
  }
  for (const hash of Object.values(report.source.sha256ByPath)) {
    assert.match(hash, /^[0-9a-f]{64}$/);
  }
});

test('SH10 Dojo KeyR unhandled despite unconnected prototype reload helper', () => {
  const result = scenarios.get('MCD-ACCEPT-01-KEY-R');
  assert.ok(result);
  assert.equal(result.web.moduleActionOnKeyR, keydownAction({ screen: 'playing', code: 'KeyR' }));
  assert.equal(result.web.moduleActionOnKeyR, 'reload');
  assert.equal(result.web.moduleActionBoundToDojo, false);
  assert.equal(result.web.browserDojoKeyRDispatch, 'UNHANDLED_IN_DOJO_WEB');
  assert.equal(result.web.browserNonNativeKeyRCallsReload, true);
  assert.equal(result.web.browserNonNativeReloadRefillsMagazine, true);
  assert.equal(result.web.browserMeasurement, false);
  assert.equal(result.verdict, qualifyReportedGap({
    sourceVerified: result.web.sourceAnchorsPresent,
    comparison: 'action',
    differs: result.web.browserDojoKeyRDispatch === 'UNHANDLED_IN_DOJO_WEB',
  }));
  assert.ok([VERDICT.CONFLICT, VERDICT.WEB_UNRESOLVED].includes(result.verdict));
});

test('SH10 Containers separates class initializer 60, reported scene 120, variable Web frame', () => {
  const result = scenarios.get('MCD-ACCEPT-02-CONTAINERS-FIXED-STEP');
  assert.ok(result);
  assert.equal(result.web.classInitializerDenominator, 60);
  assert.equal(result.web.classInitializerIsRuntime, false);
  assert.equal(result.web.containersReportedDenominator, 120);
  almost(result.web.containersReportedSecondsPerPhysicsStep, 1 / 120);
  almost(result.web.webFrameProbeSeconds, sampleFrameDelta(0, 100).dt);
  assert.equal(result.web.nativeContainersMappedToWebLevel, false);
  assert.ok([VERDICT.SCENE_UNMATCHED, VERDICT.WEB_UNRESOLVED].includes(result.verdict));
});

test('SH10 max/cap/override remains an unverified native feature question', () => {
  const result = scenarios.get('MCD-ACCEPT-03-TIME-MAX-CAP-OVERRIDE');
  assert.ok(result);
  const target = getTargetTimeScale({ moving: true });
  almost(result.web.webMovingTarget, target);
  const overrideProbe = getTargetTimeScale(
    { moving: true, forcedTimeScale: 0.2 },
    { ...PROTOTYPE_TIME_RULES, maxTimescale: 0.4, forcedTimeScale: 0.2 },
  );
  almost(result.web.probeWithForeignMaxAndForceFields, overrideProbe);
  assert.equal(result.web.injectedFieldsAffectWebTarget, overrideProbe !== target);
  const pause = stepTime(createTimeState(), { dt: 1, paused: true });
  assert.equal(result.web.webPauseRealDelta, pause.realDelta);
  assert.equal(result.web.webPauseWorldDelta, pause.worldDelta);
  assert.equal(result.web.webPauseRetainsPriorScale,
    pause.timeScale === PROTOTYPE_TIME_RULES.initialScale);
  assert.equal(result.web.nativeActualCapValue, null);
  assert.equal(result.web.nativeActualOverrideValue, null);
  assert.equal(result.verdict, qualifyReportedGap({
    sourceVerified: result.web.sourceAnchorsPresent,
    comparison: 'capability',
    differs: !result.web.injectedFieldsAffectWebTarget,
  }));
});

test('SH10 Dojo time domain uses scaled worldDelta while old movement helper stays illustrative', () => {
  const result = scenarios.get('MCD-ACCEPT-04-PLAYER-SCALED-DELTA');
  assert.ok(result);
  const tick = stepTime(createTimeState(), { dt: 1 / 60, moving: true });
  const webReal = movementStep(new Set(['KeyW']), 0, tick.realDelta);
  const counterfactual = movementStep(new Set(['KeyW']), 0, tick.worldDelta);
  almost(result.web.tickInputRealSeconds, 1 / 60);
  almost(result.web.webWorldScaleAfterTick, tick.timeScale);
  almost(result.web.webWorldDeltaSeconds, tick.worldDelta);
  assert.equal(result.web.webDojoDeltaDomain, 'tick.worldDelta (scaled frame delta)');
  assert.equal(result.web.webDojoUsesScaledWorldDelta, true);
  assert.equal(result.web.webDojoMeasuredDisplacementMeters, null);
  almost(result.web.prototypeOnlyRealSeconds, tick.realDelta);
  almost(result.web.prototypeOnlyHelperDistanceWorldUnits, Math.hypot(webReal.dx, webReal.dz));
  almost(result.web.prototypeOnlyScaledCounterfactualWorldUnits,
    Math.hypot(counterfactual.dx, counterfactual.dz));
  assert.equal(result.web.counterfactualIsNativeMeasurement, false);
  assert.equal(result.web.browserMeasurement, false);
  assert.equal(result.verdict, qualifyReportedGap({
    sourceVerified: result.web.sourceAnchorsPresent,
    comparison: 'movement',
    differs: false,
  }));
  assert.equal(result.verdict, VERDICT.AGREEMENT_UNVERIFIED);
});

test('SH10 projectile helper is not mislabeled as native FixedUpdate/LateUpdate timing', () => {
  const result = scenarios.get('MCD-ACCEPT-05-PROJECTILE-PHASES');
  assert.ok(result);
  const oneStep = advanceProjectile({
    pos: { x: 0, y: 0, z: 0 },
    direction: { x: 1, y: 0, z: 0 },
    speed: 10, ttl: 1, age: 0,
  }, 1 / 60);
  almost(result.web.helperExampleWorldSeconds, 1 / 60);
  almost(result.web.helperExampleTravelWorldUnits, oneStep.projectile.pos.x);
  assert.equal(result.web.helperExampleHit, false);
  assert.equal(result.web.nativePhaseTraceMeasured, false);
  assert.ok([VERDICT.PHASE_GAP, VERDICT.WEB_UNRESOLVED].includes(result.verdict));
});

test('SH10 verdict taxonomy distinguishes absent source, report-only mismatch and aligned inputs', () => {
  const arg = { comparison: 'action', differs: true };
  assert.equal(qualifyReportedGap({ ...arg, sourceVerified: false }), VERDICT.WEB_UNRESOLVED);
  assert.equal(qualifyReportedGap({ ...arg, sourceVerified: true }), VERDICT.CONFLICT);
  assert.equal(qualifyReportedGap({ sourceVerified: true, comparison: 'scene', differs: true }),
    VERDICT.SCENE_UNMATCHED);
  assert.equal(qualifyReportedGap({ sourceVerified: true, comparison: 'capability', differs: true }),
    VERDICT.CAPABILITY_GAP);
  assert.equal(qualifyReportedGap({ sourceVerified: true, comparison: 'phase', differs: true }),
    VERDICT.PHASE_GAP);
  assert.equal(qualifyReportedGap({ sourceVerified: true, comparison: 'action', differs: false }),
    VERDICT.AGREEMENT_UNVERIFIED);
  assert.equal(hasUnresolvedAcceptance(report), true);
});

test('SH10 default CLI is green diagnostic JSON; opt-in --gate is NOT invoked by CI', () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const output = execFileSync(
    process.execPath,
    [resolve(root, 'scripts/acceptance-report.mjs')],
    { cwd: root, encoding: 'utf8' },
  );
  assert.deepEqual(JSON.parse(output), report);
  assert.equal(report.schemaVersion, 1);
});
