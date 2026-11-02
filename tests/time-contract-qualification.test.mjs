import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const evidence = JSON.parse(await readFile(
  new URL('../docs/parity/time-input-camera.evidence.json', import.meta.url),
  'utf8',
));

const sha256 = (value) => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const validTrace = (trace) => trace?.unit === 'seconds'
  && typeof trace.valueUnit === 'string' && trace.valueUnit.length > 0
  && Array.isArray(trace.samples)
  && trace.samples.length >= 2
  && trace.samples.every((sample, index) => Number.isFinite(sample.t)
    && Number.isFinite(sample.value)
    && (index === 0 || sample.t > trace.samples[index - 1].t));

// Matching units and timestamps alone is insufficient to compare different actions.
// These fields are metadata gates; a matching digest is NOT proof the corpus is authentic.
const alignedStimulus = (nativeTrace, webTrace) =>
  typeof nativeTrace?.scenarioId === 'string' && nativeTrace.scenarioId.length > 0
  && nativeTrace.scenarioId === webTrace?.scenarioId
  && sha256(nativeTrace?.inputSha256)
  && nativeTrace.inputSha256 === webTrace?.inputSha256
  && typeof nativeTrace.observable === 'string' && nativeTrace.observable.length > 0
  && nativeTrace.observable === webTrace?.observable;

// Compare event-relative windows; distinct sample rates are allowed inside a window.
const alignedWindow = (nativeTrace, webTrace) =>
  nativeTrace.samples[0].t === 0 && webTrace.samples[0].t === 0
  && nativeTrace.samples.at(-1).t === webTrace.samples.at(-1).t;

// An admission gate for *future comparison*, never a native 1:1 certificate.
// All fields below must come from separately inspected evidence, not a handoff.
const assessComparisonReadiness = ({ declaration, method, binding, nativeTrace, webTrace }) => {
  const missing = [];
  if (declaration?.classification !== 'PROUVE' || declaration.runtimeValidated !== false) {
    missing.push('primary-declaration');
  }
  if (!method?.type || !method?.name || !sha256(method.assemblySha256)
    || !Array.isArray(method.sourceLines) || method.sourceLines.length !== 2
    || !method.sourceLines.every(Number.isInteger)) {
    missing.push('method-body');
  }
  if (!binding?.owner || !/^-?\d+$/.test(String(binding.pathId ?? ''))
    || !binding?.scene) {
    missing.push('active-scene-binding');
  }
  const nativeWellFormed = validTrace(nativeTrace);
  const webWellFormed = validTrace(webTrace);
  if (!nativeWellFormed || !nativeTrace?.build || !nativeTrace?.scene
    || nativeTrace.scene !== binding?.scene) {
    missing.push('native-measurement');
  }
  if (!webWellFormed || !webTrace?.commit
    || nativeTrace?.valueUnit !== webTrace?.valueUnit) {
    missing.push('web-measurement');
  }
  if (nativeWellFormed && webWellFormed) {
    if (!alignedStimulus(nativeTrace, webTrace)) missing.push('matched-stimulus');
    if (!alignedWindow(nativeTrace, webTrace)) missing.push('matched-time-window');
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
    samples: [{ t: 0, value: 1 / 60 }, { t: 0.1, value: 1 / 60 }],
  };
  return {
    declaration,
    method: {
      type: 'TimeControl',
      name: 'FixedUpdate',
      assemblySha256: evidence.secondaryReport.source.assemblyCSharpSha256,
      sourceLines: [25, 30],
    },
    binding: { scene: 'synthetic-scene', owner: 'synthetic-owner', pathId: '42' },
    nativeTrace: { ...trace, build: 'synthetic-build', scene: 'synthetic-scene' },
    webTrace: { ...trace, commit: 'synthetic-web-commit' },
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
    method: { type: 'TimeControl', name: 'FixedUpdate', assemblySha256: evidence.secondaryReport.source.assemblyCSharpSha256, sourceLines: [25, 30] },
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
