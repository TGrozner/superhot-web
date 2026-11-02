import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const evidence = JSON.parse(await readFile(new URL('../docs/parity/time-input-camera.evidence.json', import.meta.url), 'utf8'));
const report = evidence.secondaryReport;

test('SH-01 secondary handoff has a concrete private provenance and target build', () => {
  assert.equal(report.source.repository, 'TGrozner/superhot-research');
  assert.equal(report.source.visibility, 'private');
  assert.match(report.source.repositoryCommit, /^[a-f0-9]{40}$/);
  assert.equal(report.source.path, 'HANDOFF.md');
  assert.equal(report.source.workflowRun, 41368361512);
  assert.equal(report.source.artifactId, 13108420851);
  assert.equal(report.source.readStartLine, 1);
  assert.equal(report.source.readLineCount, 100);
  assert.match(report.source.retrievedTextSha256, /^[a-f0-9]{64}$/);
  assert.equal(report.source.edition, 'SUPERHOT: MIND CONTROL DELETE');
  assert.equal(report.source.steamBuild, '20299547');
  assert.equal(report.source.engine, 'Unity 2018.4.14f1');
  assert.match(report.source.assemblyCSharpSha256, /^[a-f0-9]{64}$/);
});

test('handoff assertions cannot be mistaken for directly proven native behavior', () => {
  assert.equal(report.findings.length, 6);
  const ids = new Set(evidence.claims.map(c => c.id));
  for (const finding of report.findings) {
    assert.match(finding.id, /^TC-R0[1-6]$/);
    assert.equal(finding.classification, 'INCONNU');
    assert.match(finding.scope, /^reported-/);
    assert.equal(Object.hasOwn(finding, 'runtimeValidated'), false);
    assert.equal(Object.hasOwn(finding, 'measuredValue'), false);
    assert.ok(!ids.has(finding.id), 'duplicate evidence id');
    ids.add(finding.id);
    const [start, end] = finding.sourceLines;
    assert.ok(Number.isInteger(start) && Number.isInteger(end));
    assert.ok(start >= report.source.readStartLine && end <= report.source.readLineCount && end >= start);
    assert.ok(finding.reportedClaim.length > 40);
    assert.ok(finding.requiredPrimaryEvidence.length > 40);
    assert.ok(finding.falsifier.length > 30);
  }
  assert.deepEqual(evidence.observations, [], 'no quantitative native runtime observations were produced');
});

test('scene override and input mapping remain explicitly unverified before runtime integration', () => {
  const rows = Object.fromEntries(report.findings.map(r => [r.id, r]));
  assert.match(rows['TC-R01'].reportedClaim, /maximum/);
  assert.match(rows['TC-R03'].reportedClaim, /120/);
  assert.match(rows['TC-R03'].reportedClaim, /60/);
  assert.match(rows['TC-R03'].requiredPrimaryEvidence, /owner,path_id/);
  assert.match(rows['TC-R04'].reportedClaim, /Replay/);
  assert.match(rows['TC-R05'].reportedClaim, /467/);
  assert.match(rows['TC-R05'].reportedClaim, /269/);
});
