import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const evidence = JSON.parse(await readFile(new URL('../docs/parity/time-input-camera.evidence.json', import.meta.url), 'utf8'));
const kinds = new Set(['PROUVE', 'OBSERVE', 'INCONNU']);

test('MCD evidence is tied to one finite, verifiable private read', () => {
  assert.equal(evidence.schemaVersion, 1);
  assert.equal(evidence.target, 'SUPERHOT: MIND CONTROL DELETE');
  assert.equal(evidence.source.repository, 'TGrozner/superhot-research');
  assert.equal(evidence.source.visibility, 'private');
  assert.match(evidence.source.headCommit, /^[a-f0-9]{40}$/);
  assert.match(evidence.source.retrievedTextSha256, /^[a-f0-9]{64}$/);
  assert.equal(evidence.source.sourcePath, 'decompiled/TimeControl.decompiled.cs');
  assert.ok(evidence.source.workflowRun > 0 && evidence.source.artifactId > 0);
  assert.equal(evidence.source.nextUnreadLine, evidence.source.readStartLine + evidence.source.readLineCount);
});

test('proven facts remain scoped to inspected lines and never assert runtime parity', () => {
  assert.ok(evidence.claims.length >= 6);
  const ids = new Set();
  for (const c of evidence.claims) {
    assert.ok(kinds.has(c.classification));
    assert.equal(c.classification, 'PROUVE');
    assert.match(c.scope, /^decompiled-/);
    assert.equal(c.runtimeValidated, false);
    assert.ok(!ids.has(c.id), 'duplicate claim ID');
    ids.add(c.id);
    const [start,end] = c.sourceLines;
    assert.ok(Number.isInteger(start) && Number.isInteger(end));
    assert.ok(start >= evidence.source.readStartLine && end < evidence.source.nextUnreadLine && end >= start);
  }
  assert.deepEqual(evidence.observations, []);
});

test('TimeControl declared numeric defaults are exact; execution remains unresolved', () => {
  const fields = Object.fromEntries(evidence.claims.map(c => [c.symbol,c]));
  assert.equal(fields['TimeControl.minTimescale'].value, .01);
  assert.equal(fields['TimeControl.minTimescaleStep'].value, .001);
  assert.equal(fields['TimeControl.maxTimescale'].value, 1);
  assert.equal(fields['TimeControl.fixedTimestepDenominator'].value, 60);
  assert.equal(fields['TimeControl.forcedTimeScale'].value, -1);
  assert.equal(fields['TimeControl.referenceFixedDeltaTime'].expression, '1/60');
  assert.ok(Math.abs(fields['TimeControl.referenceFixedDeltaTime'].value - 1/60) < Number.EPSILON);
  assert.ok(evidence.unknowns.some(u=>/Time\\.timeScale/.test(u.question)));
  assert.ok(evidence.unknowns.some(u=>/scene\\/prefab/.test(u.question)));
  assert.ok(evidence.unknowns.some(u=>/camera/.test(u.question)));
});

test('unknowns state explicit required proof and contain no synthetic measurement', () => {
  assert.ok(evidence.unknowns.length >= 5);
  const ids = new Set();
  for (const u of evidence.unknowns) {
    assert.equal(u.classification, 'INCONNU');
    assert.ok(!ids.has(u.id)); ids.add(u.id);
    assert.ok(u.question.length > 20);
    assert.ok(u.requiredSource.length > 15);
    assert.equal(Object.hasOwn(u,'measuredValue'),false);
  }
});
