/**
 * SH-10 — behavioral Web probes against MCD native *handoff questions*.
 *
 * This is NOT a native emulator and not a parity certificate. The only native
 * inputs are short, non-proprietary claims paraphrased from the private handoff.
 * Never import, publish, or execute the private game/corpus here.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  PROTOTYPE_TIME_RULES,
  createTimeState,
  getTargetTimeScale,
  sampleFrameDelta,
  stepTime,
} from '../src/time.js';
import { keydownAction, movementStep } from '../src/input.js';
import { advanceProjectile } from '../src/combat/projectiles.js';

const readPublic = (relativePath) => readFileSync(
  new URL(relativePath, import.meta.url), 'utf8',
);
const source = {
  'src/main.js': readPublic('../src/main.js'),
  'src/time.js': readPublic('../src/time.js'),
  'src/input.js': readPublic('../src/input.js'),
  'src/combat/projectiles.js': readPublic('../src/combat/projectiles.js'),
};
const ledger = JSON.parse(readPublic('../docs/parity/time-input-camera.evidence.json'));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

export const NATIVE_PROVENANCE = Object.freeze({
  game: 'SUPERHOT: MIND CONTROL DELETE',
  appId: 690040,
  steamBuild: '20299547',
  unityVersion: '2018.4.14f1',
  assemblyCSharpSha256: 'ecf928a3f773ad4a258022fe570f72ec97a13d77bf586cf113fd291b73d2b257',
  handoff: {
    evidenceLevel: 'SECONDARY_HANDOFF_NOT_PRIMARY_RUNTIME',
    path: 'HANDOFF.md',
    privateIssue: 'TGrozner/superhot-research#2',
    workflowRun: 41424396779,
    artifactId: 13131037087,
    retrievedTextSha256: '6acfa468377373c1c3118e3eee599b115a2105bd01f6845bc18d745986d8bea3',
  },
});

const main = source['src/main.js'];
const sourceAnchors = Object.freeze({
  keyR: /if\s*\(\s*event\.code\s*===\s*['"]KeyR['"]\s*\)\s*reload\(\s*\)/.test(main),
  reloadRefillsAmmo: /if\s*\(\s*state\.reload\s*<=\s*0\s*\)\s*\{\s*state\.reload\s*=\s*0;\s*state\.ammo\s*=\s*6/.test(main),
  playerUsesRealDt: /state\.camera\.x\s*\+\s*sx\s*\*\s*norm\s*\*\s*velocity\s*\*\s*dt/.test(main) &&
    /state\.camera\.z\s*\+\s*sz\s*\*\s*norm\s*\*\s*velocity\s*\*\s*dt/.test(main),
  worldScaleIsApplied: /const\s+worldDt\s*=\s*dt\s*\*\s*state\.speed/.test(main),
  singleAnimationFrameUpdate: /if\s*\(\s*state\.screen\s*===\s*['"]playing['"]\s*\)\s*update\(dt\)/.test(main) &&
    /requestAnimationFrame\(frame\)/.test(main),
  playerAndBulletInSameUpdate: /bullet\.speed\s*\*\s*worldDt/.test(main) &&
    main.indexOf('for (const enemy of state.enemies)', main.indexOf('function update(dt)')) >= 0 &&
    main.indexOf('for (let i=state.bullets.length-1', main.indexOf('function update(dt)')) >
      main.indexOf('for (const enemy of state.enemies)', main.indexOf('function update(dt)')),
  timeComposition: /const\s+wanted\s*=\s*Math\.max\(/.test(main) &&
    /state\.speed\s*=\s*lerp\(state\.speed,\s*wanted/.test(main),
});

export const VERDICT = Object.freeze({
  CONFLICT: 'REPORTED_CONFLICT',
  CAPABILITY_GAP: 'REPORTED_CAPABILITY_GAP',
  PHASE_GAP: 'REPORTED_PHASE_GAP',
  SCENE_UNMATCHED: 'SCENE_UNMATCHED',
  WEB_UNRESOLVED: 'WEB_SOURCE_UNRESOLVED',
  AGREEMENT_UNVERIFIED: 'REPORTED_AGREEMENT_UNVERIFIED',
});

/** A handoff disagreement is NOT equivalent to native runtime refutation. */
export function qualifyReportedGap({ sourceVerified, comparison, differs }) {
  if (!sourceVerified) return VERDICT.WEB_UNRESOLVED;
  if (comparison === 'scene') return VERDICT.SCENE_UNMATCHED;
  if (!differs) return VERDICT.AGREEMENT_UNVERIFIED;
  if (comparison === 'capability') return VERDICT.CAPABILITY_GAP;
  if (comparison === 'phase') return VERDICT.PHASE_GAP;
  return VERDICT.CONFLICT;
}

const claim = (summary, handoffLines, primaryNeeded) => ({
  summary,
  handoffLines,
  evidenceLevel: 'SECONDARY_HANDOFF_NOT_PRIMARY_RUNTIME',
  primaryNeeded,
  nativeRunMeasured: false,
});
const scenario = (id, priority, owner, native, web, verdict, convergence) => ({
  id, priority, owner, native, web, verdict, convergence,
  parityCertified: false,
});

export function createAcceptanceReport() {
  const keys = new Set(['KeyW']);
  const rAction = keydownAction({ screen: 'playing', code: 'KeyR' });
  const realSeconds = 1 / 60;
  const tick = stepTime(createTimeState(), { dt: realSeconds, moving: true });
  const realMove = movementStep(keys, 0, tick.realDelta);
  const scaledMove = movementStep(keys, 0, tick.worldDelta);
  const realDistance = Math.hypot(realMove.dx, realMove.dz);
  const scaledDistance = Math.hypot(scaledMove.dx, scaledMove.dz);
  const regularTarget = getTargetTimeScale({ moving: true });
  const injectedOverrideTarget = getTargetTimeScale(
    { moving: true, forcedTimeScale: 0.2 },
    { ...PROTOTYPE_TIME_RULES, maxTimescale: 0.4, forcedTimeScale: 0.2 },
  );
  const pauseProbe = stepTime(createTimeState(), { dt: 1, paused: true });
  const frameProbe = sampleFrameDelta(0, 100);
  const projectile = advanceProjectile({
    pos: { x: 0, y: 0, z: 0 },
    direction: { x: 1, y: 0, z: 0 },
    speed: 10, ttl: 1, age: 0,
  }, realSeconds);

  const initializer = ledger.claims.find(
    (item) => item.id === 'TC-004' && item.symbol === 'TimeControl.fixedTimestepDenominator',
  );
  const initializerVerified = initializer?.scope === 'decompiled-field-initializer' &&
    initializer.runtimeValidated === false && initializer.value === 60;
  const rAnchored = sourceAnchors.keyR && sourceAnchors.reloadRefillsAmmo;
  const movementAnchored = sourceAnchors.playerUsesRealDt &&
    sourceAnchors.worldScaleIsApplied;
  const phaseAnchored = sourceAnchors.singleAnimationFrameUpdate &&
    sourceAnchors.playerAndBulletInSameUpdate;

  const scenarios = [
    scenario(
      'MCD-ACCEPT-01-KEY-R', 'P0', 'SH-02 / SH-05',
      claim('Recovered keyboard profile: R activates Replay, not magazine refill; KillReloadMod changes delays/animations.', [74, 74],
        'Active input profile, dispatcher branch, KillReloadMod and ammunition writes, native run with loaded/empty gun.'),
      {
        provenance: 'WEB_SOURCE_AND_PURE_MODULE',
        sourceAnchorsPresent: rAnchored,
        moduleActionOnKeyR: rAction,
        browserSourceCallsReload: sourceAnchors.keyR,
        browserSourceRefillsMagazine: sourceAnchors.reloadRefillsAmmo,
        browserMeasurement: false,
      },
      qualifyReportedGap({
        sourceVerified: rAnchored,
        comparison: 'action',
        differs: rAction !== 'replay',
      }),
      'SH-02: expose active profile actions (Replay vs reload); SH-05: wire browser key handler and verify by actual play; obtain native dispatch proof before claiming parity.',
    ),
    scenario(
      'MCD-ACCEPT-02-CONTAINERS-FIXED-STEP', 'P1', 'SH-01 / SH-05',
      claim('Containers RUN_LEVEL_6C -> SHRL_ContainerPort -> build28 has a reported scene-bound fixed-step denominator 120, unlike the class initializer 60.', [73, 73],
        'Active scene instance (owner,path_id), serialized 120, Time.fixedDeltaTime assignment and measured FixedUpdate ticks.'),
      {
        provenance: 'WEB_SOURCE_AND_PURE_MODULE',
        sourceAnchorsPresent: sourceAnchors.singleAnimationFrameUpdate && initializerVerified,
        classInitializerDenominator: initializer?.value ?? null,
        classInitializerIsRuntime: false,
        containersReportedDenominator: 120,
        containersReportedSecondsPerPhysicsStep: 1 / 120,
        webFrameProbeInputMs: 100,
        webFrameProbeSeconds: frameProbe.dt,
        webUpdatePhase: 'requestAnimationFrame variable-delta update',
        nativeContainersMappedToWebLevel: false,
        browserMeasurement: false,
      },
      qualifyReportedGap({
        sourceVerified: sourceAnchors.singleAnimationFrameUpdate && initializerVerified,
        comparison: 'scene',
        differs: true,
      }),
      'SH-01: verify active Containers instance and Time.fixedDeltaTime; SH-05: implement explicit fixed/variable phases only after scene and runtime binding; match scene, initial state and clocks.',
    ),
    scenario(
      'MCD-ACCEPT-03-TIME-MAX-CAP-OVERRIDE', 'P0', 'SH-01 / SH-02',
      claim('Time shifters aggregate by maximum, clamp, then apply forced override after the clamp. A zero pause is not silently elevated to positive minimum.', [69, 71],
        'Active TimeControl methods and shifter writes; ordered force/pause transitions in controlled native trace.'),
      {
        provenance: 'WEB_SOURCE_AND_PURE_MODULE',
        sourceAnchorsPresent: sourceAnchors.timeComposition,
        webMovingTarget: regularTarget,
        probeWithForeignMaxAndForceFields: injectedOverrideTarget,
        injectedFieldsAffectWebTarget: regularTarget !== injectedOverrideTarget,
        webPauseRealDelta: pauseProbe.realDelta,
        webPauseWorldDelta: pauseProbe.worldDelta,
        webPauseRetainsPriorScale: pauseProbe.timeScale === PROTOTYPE_TIME_RULES.initialScale,
        nativeActualCapValue: null,
        nativeActualOverrideValue: null,
        browserMeasurement: false,
      },
      qualifyReportedGap({
        sourceVerified: sourceAnchors.timeComposition,
        comparison: 'capability',
        differs: regularTarget === injectedOverrideTarget,
      }),
      'SH-01: prove clamp/override method and scene overrides; SH-02: add a separate forced-scale and explicit zero-pause path with trace tests before SH-05 connects it.',
    ),
    scenario(
      'MCD-ACCEPT-04-PLAYER-SCALED-DELTA', 'P0', 'SH-02 / SH-05',
      claim('Player movement is reported to advance with Unity Time.deltaTime; the bound movement shifter is AsymmetricSmoothLinearInstantTimeShifter.', [72, 72],
        'Active player movement method, bound scene object/shifter, Unity clock semantics, paired native motion trace.'),
      {
        provenance: 'WEB_SOURCE_AND_PURE_MODULE',
        sourceAnchorsPresent: movementAnchored,
        tickInputRealSeconds: realSeconds,
        webWorldScaleAfterTick: tick.timeScale,
        webWorldDeltaSeconds: tick.worldDelta,
        webPlayerUsesRealSeconds: tick.realDelta,
        webPlayerDistanceWorldUnits: realDistance,
        scaledDtCounterfactualWorldUnits: scaledDistance,
        ratioRealToScaledCounterfactual: realDistance / scaledDistance,
        counterfactualIsNativeMeasurement: false,
        browserMeasurement: false,
      },
      qualifyReportedGap({
        sourceVerified: movementAnchored,
        comparison: 'movement',
        differs: Math.abs(realDistance - scaledDistance) > 1e-12,
      }),
      'SH-02: express movement with game delta and bound shifter; SH-05: wire only after native movement method and measured speed/scene contract, compare matched input traces.',
    ),
    scenario(
      'MCD-ACCEPT-05-PROJECTILE-PHASES', 'P0', 'SH-03 / SH-05',
      claim('Projectile movement is reported in Update, some sweeps in FixedUpdate, with deferred AI shots after LateUpdate pose adjustment.', [76, 76],
        'Exact projectile/physics and AI producer methods, phase/call order, matched native traces including collision and delayed fire.'),
      {
        provenance: 'WEB_SOURCE_AND_PURE_MODULE',
        sourceAnchorsPresent: phaseAnchored,
        webPhase: 'single requestAnimationFrame update: enemy AI then bullet travel and collision',
        helperPhase: 'one advanceProjectile call with caller-supplied worldDelta',
        helperExampleWorldSeconds: realSeconds,
        helperExampleTravelWorldUnits: projectile.projectile.pos.x,
        helperExampleHit: projectile.impact !== null,
        nativePhaseTraceMeasured: false,
        browserMeasurement: false,
      },
      qualifyReportedGap({
        sourceVerified: phaseAnchored,
        comparison: 'phase',
        differs: true,
      }),
      'SH-03: prove exact callbacks and physics sweep order; SH-05: introduce independently measurable Update/FixedUpdate/LateUpdate steps without inventing their order from a single RAF call.',
    ),
  ];

  return {
    schemaVersion: 1,
    target: NATIVE_PROVENANCE,
    source: {
      repository: 'TGrozner/superhot-web',
      sha256ByPath: Object.fromEntries(
        Object.entries(source).map(([path, content]) => [path, sha256(content)]),
      ),
      sourceAnchors,
      browserSessionExecuted: false,
    },
    nativeStatus: 'SECONDARY_HANDOFF_AND_INITIALIZER_ONLY',
    numericNativeRuntimeTraceCount: 0,
    comparisonsToOriginalRuntimeExecuted: 0,
    scenarios,
    counts: {
      cases: scenarios.length,
      reportedConflicts: scenarios.filter((item) => item.verdict === VERDICT.CONFLICT).length,
      reportedCapabilityGaps: scenarios.filter((item) => item.verdict === VERDICT.CAPABILITY_GAP).length,
      reportedPhaseGaps: scenarios.filter((item) => item.verdict === VERDICT.PHASE_GAP).length,
      sceneUnmatched: scenarios.filter((item) => item.verdict === VERDICT.SCENE_UNMATCHED).length,
      sourceUnresolved: scenarios.filter((item) => item.verdict === VERDICT.WEB_UNRESOLVED).length,
      certifiedParity: 0,
    },
  };
}

export function hasUnresolvedAcceptance(report) {
  return report.scenarios.some((item) => item.verdict !== VERDICT.AGREEMENT_UNVERIFIED) ||
    report.scenarios.some((item) => !item.parityCertified);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const report = createAcceptanceReport();
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  // Opt-in manual gate. Never call this mode from the normal Node test/CI suite:
  // it remains red until native primary evidence AND browser comparison exist.
  if (process.argv.includes('--gate') && hasUnresolvedAcceptance(report)) {
    process.exitCode = 2;
  }
}
