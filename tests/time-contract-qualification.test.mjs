import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const evidence = JSON.parse(await readFile(
  new URL('../docs/parity/time-input-camera.evidence.json', import.meta.url),
  'utf8',
));

const sha256 = (value) => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const commitSha = (value) => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
const nonBlank = (value) => typeof value === 'string' && value.trim().length > 0;
const validTrace = (trace) => trace?.unit === 'seconds'
  && nonBlank(trace.valueUnit)
  && Array.isArray(trace.samples)
  && trace.samples.length >= 2
  && trace.samples.every((sample, index) => Number.isFinite(sample.t)
    && Number.isFinite(sample.value)
    && (index === 0 || sample.t > trace.samples[index - 1].t));

// Matching units and timestamps alone is insufficient to compare different actions.
// These fields are metadata gates; a matching digest is NOT proof the corpus is authentic.
const alignedStimulus = (nativeTrace, webTrace) =>
  nonBlank(nativeTrace?.scenarioId)
  && nativeTrace.scenarioId === webTrace?.scenarioId
  && sha256(nativeTrace?.inputSha256)
  && nativeTrace.inputSha256 === webTrace?.inputSha256
  && nonBlank(nativeTrace.observable)
  && nativeTrace.observable === webTrace?.observable;

// A matching physical unit does not make scaled and unscaled clocks equivalent.
// Update/FixedUpdate or pre/post-tick samples are different sampling phases.
// These are caller-supplied metadata, not independently authenticated native facts.
const alignedMeasurementBasis = (nativeTrace, webTrace) =>
  nonBlank(nativeTrace?.clockDomain)
  && nativeTrace.clockDomain === webTrace?.clockDomain
  && nonBlank(nativeTrace?.samplingPhase)
  && nativeTrace.samplingPhase === webTrace?.samplingPhase;

// Compare event-relative windows; distinct sample rates are allowed inside a window.
const alignedWindow = (nativeTrace, webTrace) =>
  nativeTrace.samples[0].t === 0 && webTrace.samples[0].t === 0
  && nativeTrace.samples.at(-1).t === webTrace.samples.at(-1).t;

// Same commands do not establish comparable runs if their initial state,
// active input profile or deterministic seed differs. Digests are metadata
// checks and cannot authenticate a native capture on their own.
const alignedInitialContext = (nativeTrace, webTrace) =>
  sha256(nativeTrace?.initialStateSha256)
  && nativeTrace.initialStateSha256 === webTrace?.initialStateSha256
  && nonBlank(nativeTrace?.inputProfile)
  && nativeTrace.inputProfile === webTrace?.inputProfile
  && Number.isSafeInteger(nativeTrace?.randomSeed)
  && nativeTrace.randomSeed >= 0
  && nativeTrace.randomSeed === webTrace?.randomSeed;

// An admission gate for *future comparison*, never a native 1:1 certificate.
// All fields below must come from separately inspected evidence, not a handoff.
const assessComparisonReadiness = ({ declaration, method, binding, nativeTrace, webTrace }) => {
  const missing = [];
  if (declaration?.classification !== 'PROUVE' || declaration.runtimeValidated !== false) {
    missing.push('primary-declaration');
  }
  // Source identity is a consistency check, not evidence the method was executed.
  if (!nonBlank(method?.type) || !nonBlank(method?.name)
    || !nonBlank(method?.sourcePath)
    || method.assemblySha256 !== evidence.secondaryReport.source.assemblyCSharpSha256
    || !Array.isArray(method.sourceLines) || method.sourceLines.length !== 2
    || !method.sourceLines.every(Number.isInteger)
    || method.sourceLines[0] < 1 || method.sourceLines[1] < method.sourceLines[0]) {
    missing.push('method-body');
  }
  if (!nonBlank(binding?.owner) || !/^-?\d+$/.test(String(binding.pathId ?? ''))
    || !nonBlank(binding?.scene)) {
    missing.push('active-scene-binding');
  }
  const nativeWellFormed = validTrace(nativeTrace);
  const webWellFormed = validTrace(webTrace);
  if (!nativeWellFormed
    || nativeTrace?.build !== evidence.secondaryReport.source.steamBuild
    || !nonBlank(nativeTrace?.scene) || nativeTrace.scene !== binding?.scene) {
    missing.push('native-measurement');
  }
  if (!webWellFormed || !commitSha(webTrace?.commit)
    || nativeTrace?.valueUnit !== webTrace?.valueUnit
    || !nonBlank(webTrace?.scene) || webTrace.scene !== binding?.scene) {
    missing.push('web-measurement');
  }
  if (nativeWellFormed && webWellFormed) {
    if (!alignedStimulus(nativeTrace, webTrace)) missing.push('matched-stimulus');
    if (!alignedWindow(nativeTrace, webTrace)) missing.push('matched-time-window');
    if (!alignedInitialContext(nativeTrace, webTrace)) missing.push('matched-initial-context');
    if (!alignedMeasurementBasis(nativeTrace, webTrace)) missing.push('matched-measurement-basis');
  }
  return {
    status: missing.length ? 'INCONNU' : 'COMPARABLE',
    missing,
    parityCertified: false,
  };
};

const declaration = evidence.claims.find((claim) => claim.id === 'TC-004');
const secondary = evidence.secondaryReport.findings.find((finding) => finding.id === 'TC-R03');

// Fully synthetic fixture used only to exercise metadata admissions, NOT MCD parity.
const comparisonFixture = () => {
  const trace = {
    unit: 'seconds',
    valueUnit: 'seconds-per-step',
    scenarioId: 'synthetic-idle-v1',
    inputSha256: 'a'.repeat(64),
    observable: 'fixed-step-duration',
    clockDomain: 'synthetic-unscaled-clock',
    samplingPhase: 'synthetic-fixed-step-post-update',
    scene: 'synthetic-scene',
    initialStateSha256: 'c'.repeat(64),
    inputProfile: 'synthetic-keyboard-mouse-v1',
    randomSeed: 17,
    samples: [{ t: 0, value: 1 / 60 }, { t: 0.1, value: 1 / 60 }],
  };
  return {
    declaration,
    method: {
      type: 'TimeControl',
      name: 'FixedUpdate',
      sourcePath: evidence.source.sourcePath,
      assemblySha256: evidence.secondaryReport.source.assemblyCSharpSha256,
      sourceLines: [25, 30],
    },
    binding: { scene: 'synthetic-scene', owner: 'synthetic-owner', pathId: '42' },
    // Fabricated metadata deliberately mimics build IDs: admission is NOT authentication.
    nativeTrace: { ...trace, build: evidence.secondaryReport.source.steamBuild, scene: 'synthetic-scene' },
    webTrace: { ...trace, commit: 'f'.repeat(40) },
  };
};

test('TC-Q01: default 60 and reported instance 120 cannot certify effective fixed timestep', () => {
  assert.equal(declaration.symbol, 'TimeControl.fixedTimestepDenominator');
  assert.equal(declaration.value, 60);
  assert.equal(declaration.classification, 'PROUVE');
  assert.equal(declaration.runtimeValidated, false);
  assert.equal(secondary.classification, 'INCONNU');
  assert.match(secondary.reportedClaim, /120/);
  const result = assessComparisonReadiness({ declaration });
  assert.equal(result.status, 'INCONNU');
  assert.deepEqual(result.missing, [
    'method-body', 'active-scene-binding', 'native-measurement', 'web-measurement',
  ]);
  assert.equal(result.parityCertified, false);
});

test('TC-Q02: a secondary handoff is not a method body or a runtime sample', () => {
  const result = assessComparisonReadiness({
    declaration,
    method: { name: secondary.id, type: 'handoff', sourceLines: secondary.sourceLines },
    binding: { scene: 'Containers' },
    nativeTrace: { unit: 'seconds', samples: [] },
  });
  assert.equal(result.status, 'INCONNU');
  assert.ok(result.missing.includes('method-body'));
  assert.ok(result.missing.includes('active-scene-binding'));
  assert.ok(result.missing.includes('native-measurement'));
  assert.ok(result.missing.includes('web-measurement'));
});

test('TC-Q03: uncalibrated or unordered timestamps cannot become an observation', () => {
  const candidate = {
    declaration,
    method: { type: 'TimeControl', name: 'FixedUpdate', sourcePath: evidence.source.sourcePath, assemblySha256: evidence.secondaryReport.source.assemblyCSharpSha256, sourceLines: [25, 30] },
    binding: { scene: 'fixture', owner: 'fixture', pathId: '42' },
    nativeTrace: { build: 'fixture', scene: 'fixture', unit: 'frames', valueUnit: 'seconds-per-step', samples: [{ t: 0, value: 60 }, { t: 1, value: 120 }] },
    webTrace: { commit: 'fixture', unit: 'seconds', valueUnit: 'seconds-per-step', samples: [{ t: 1, value: 60 }, { t: 1, value: 120 }] },
  };
  const result = assessComparisonReadiness(candidate);
  assert.equal(result.status, 'INCONNU');
  assert.deepEqual(result.missing, ['native-measurement', 'web-measurement']);
  assert.equal(result.parityCertified, false);
});

test('TC-Q04: even a complete synthetic fixture permits comparison, never 1:1 certification', () => {
  const result = assessComparisonReadiness(comparisonFixture());
  assert.equal(result.status, 'COMPARABLE');
  assert.deepEqual(result.missing, []);
  assert.equal(result.parityCertified, false);
});

test('TC-Q05: different scene or measured quantity blocks a differential comparison', () => {
  const candidate = comparisonFixture();
  candidate.binding.scene = 'synthetic-scene-A';
  candidate.nativeTrace.scene = 'synthetic-scene-B';
  candidate.webTrace.valueUnit = 'degrees';
  const result = assessComparisonReadiness(candidate);
  assert.equal(result.status, 'INCONNU');
  assert.deepEqual(result.missing, ['native-measurement', 'web-measurement']);
  assert.equal(result.parityCertified, false);
});

test('TC-Q06: identical units but different action scenarios remain incomparable', () => {
  const candidate = comparisonFixture();
  candidate.webTrace.scenarioId = 'synthetic-moving-v1';
  const result = assessComparisonReadiness(candidate);
  assert.equal(result.status, 'INCONNU');
  assert.deepEqual(result.missing, ['matched-stimulus']);
  assert.equal(result.parityCertified, false);
});

test('TC-Q07: same scenario label with different input digest cannot be admitted', () => {
  const candidate = comparisonFixture();
  candidate.webTrace.inputSha256 = 'b'.repeat(64);
  const result = assessComparisonReadiness(candidate);
  assert.equal(result.status, 'INCONNU');
  assert.deepEqual(result.missing, ['matched-stimulus']);
  assert.equal(result.parityCertified, false);
});

test('TC-Q08: different measured observables cannot be compared by unit alone', () => {
  const candidate = comparisonFixture();
  candidate.webTrace.observable = 'camera-angle-duration';
  const result = assessComparisonReadiness(candidate);
  assert.equal(result.status, 'INCONNU');
  assert.deepEqual(result.missing, ['matched-stimulus']);
  assert.equal(result.parityCertified, false);
});

test('TC-Q09: event-relative recording windows must be aligned, even with valid samples', () => {
  for (const samples of [
    [{ t: 0.01, value: 1 / 60 }, { t: 0.1, value: 1 / 60 }],
    [{ t: 0, value: 1 / 60 }, { t: 0.2, value: 1 / 60 }],
  ]) {
    const candidate = comparisonFixture();
    candidate.webTrace.samples = samples;
    const result = assessComparisonReadiness(candidate);
    assert.equal(result.status, 'INCONNU');
    assert.deepEqual(result.missing, ['matched-time-window']);
    assert.equal(result.parityCertified, false);
  }
});

test('TC-Q10: reversed, zero or fractional source line ranges are not method evidence', () => {
  for (const sourceLines of [[30, 25], [0, 25], [1.5, 25]]) {
    const candidate = comparisonFixture();
    candidate.method.sourceLines = sourceLines;
    const result = assessComparisonReadiness(candidate);
    assert.equal(result.status, 'INCONNU');
    assert.deepEqual(result.missing, ['method-body']);
    assert.equal(result.parityCertified, false);
  }
});

test('TC-Q11: a plausible but different assembly SHA cannot identify the target method', () => {
  const candidate = comparisonFixture();
  candidate.method.assemblySha256 = '0'.repeat(64);
  const result = assessComparisonReadiness(candidate);
  assert.equal(result.status, 'INCONNU');
  assert.deepEqual(result.missing, ['method-body']);
  assert.equal(result.parityCertified, false);
});

test('TC-Q12: source build and native trace build must agree', () => {
  const candidate = comparisonFixture();
  candidate.nativeTrace.build = 'different-MCD-build';
  const result = assessComparisonReadiness(candidate);
  assert.equal(result.status, 'INCONNU');
  assert.deepEqual(result.missing, ['native-measurement']);
  assert.equal(result.parityCertified, false);
});

test('TC-Q13: missing or blank method path cannot identify source lines', () => {
  for (const sourcePath of [undefined, '   ']) {
    const candidate = comparisonFixture();
    candidate.method.sourcePath = sourcePath;
    const result = assessComparisonReadiness(candidate);
    assert.equal(result.status, 'INCONNU');
    assert.deepEqual(result.missing, ['method-body']);
    assert.equal(result.parityCertified, false);
  }
});

test('TC-Q14: Web measurement requires a concrete commit SHA, not a free-form label', () => {
  const candidate = comparisonFixture();
  candidate.webTrace.commit = 'synthetic-web-commit';
  const result = assessComparisonReadiness(candidate);
  assert.equal(result.status, 'INCONNU');
  assert.deepEqual(result.missing, ['web-measurement']);
  assert.equal(result.parityCertified, false);
});

test('TC-Q15: blank binding identity cannot designate the active scene component', () => {
  const candidate = comparisonFixture();
  candidate.binding.owner = '   ';
  const result = assessComparisonReadiness(candidate);
  assert.equal(result.status, 'INCONNU');
  assert.deepEqual(result.missing, ['active-scene-binding']);
  assert.equal(result.parityCertified, false);
});

test('TC-Q16: a Web trace from a different canonical scene is not comparable', () => {
  const candidate = comparisonFixture();
  candidate.webTrace.scene = 'another-scene';
  const result = assessComparisonReadiness(candidate);
  assert.equal(result.status, 'INCONNU');
  assert.deepEqual(result.missing, ['web-measurement']);
  assert.equal(result.parityCertified, false);
});

test('TC-Q17: matching inputs with different initial states are not comparable', () => {
  for (const initialStateSha256 of ['d'.repeat(64), 'missing-digest', undefined]) {
    const candidate = comparisonFixture();
    candidate.webTrace.initialStateSha256 = initialStateSha256;
    const result = assessComparisonReadiness(candidate);
    assert.equal(result.status, 'INCONNU');
    assert.deepEqual(result.missing, ['matched-initial-context']);
    assert.equal(result.parityCertified, false);
  }
});

test('TC-Q18: input profile and deterministic seed must match across traces', () => {
  for (const change of [
    { inputProfile: 'synthetic-gamepad-v1' },
    { inputProfile: '   ' },
    { randomSeed: 18 },
    { randomSeed: -1 },
    { randomSeed: 0.5 },
  ]) {
    const candidate = comparisonFixture();
    Object.assign(candidate.webTrace, change);
    const result = assessComparisonReadiness(candidate);
    assert.equal(result.status, 'INCONNU');
    assert.deepEqual(result.missing, ['matched-initial-context']);
    assert.equal(result.parityCertified, false);
  }
});


test('TC-Q19: matching units cannot hide scaled versus unscaled clock domains', () => {
  const candidate = comparisonFixture();
  candidate.webTrace.clockDomain = 'synthetic-world-scaled-clock';
  const result = assessComparisonReadiness(candidate);
  assert.equal(result.status, 'INCONNU');
  assert.deepEqual(result.missing, ['matched-measurement-basis']);
  assert.equal(result.parityCertified, false);
});

test('TC-Q20: matching windows cannot hide different frame sampling phases', () => {
  const candidate = comparisonFixture();
  candidate.webTrace.samplingPhase = 'synthetic-render-update-before-simulation';
  const result = assessComparisonReadiness(candidate);
  assert.equal(result.status, 'INCONNU');
  assert.deepEqual(result.missing, ['matched-measurement-basis']);
  assert.equal(result.parityCertified, false);
});

test('TC-Q21: absent or blank clock/phase provenance is not comparison evidence', () => {
  for (const [side, field, value] of [
    ['nativeTrace', 'clockDomain', undefined],
    ['webTrace', 'clockDomain', '   '],
    ['nativeTrace', 'samplingPhase', '  '],
    ['webTrace', 'samplingPhase', undefined],
  ]) {
    const candidate = comparisonFixture();
    candidate[side][field] = value;
    const result = assessComparisonReadiness(candidate);
    assert.equal(result.status, 'INCONNU');
    assert.deepEqual(result.missing, ['matched-measurement-basis']);
    assert.equal(result.parityCertified, false);
  }
});

test('TC-Q22: whitespace-only observable or scenario labels are not evidence', () => {
  for (const field of ['scenarioId', 'observable']) {
    const candidate = comparisonFixture();
    candidate.nativeTrace[field] = ' \t ';
    candidate.webTrace[field] = ' \t ';
    const result = assessComparisonReadiness(candidate);
    assert.equal(result.status, 'INCONNU');
    assert.deepEqual(result.missing, ['matched-stimulus']);
    assert.equal(result.parityCertified, false);
  }
  const candidate = comparisonFixture();
  candidate.nativeTrace.valueUnit = '   ';
  candidate.webTrace.valueUnit = '   ';
  const result = assessComparisonReadiness(candidate);
  assert.equal(result.status, 'INCONNU');
  assert.deepEqual(result.missing, ['native-measurement', 'web-measurement']);
  assert.equal(result.parityCertified, false);
});
