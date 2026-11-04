import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectDojoPages, normalizeDojoSite } from '../scripts/acceptance-dojo-pages.mjs';

const fixtures = {
  '/superhot-web/index.html': '<!doctype html><html lang="en"></html>',
  '/superhot-web/local-assets/manifest.json': JSON.stringify({scene:'SHRL_Dojo2',sceneBuildIndex:10,assets:{mesh:{path:'x'}}}),
  '/superhot-web/scripts/acceptance-dojo-browser.mjs': 'export function inspectDojoCaptureReadiness() {} export function startDojoCapture() {}',
  '/superhot-web/scripts/acceptance-dojo-fps.mjs': 'export function startDojoFpsCapture() {}',
};
function fakeSite(overrides = {}) {
  const pages = { ...fixtures, ...overrides };
  return async url => {
    const text = pages[url.pathname];
    return text === undefined ? new Response('not found', {status:404}) : new Response(text, {status:200});
  };
}

test('the same relative QA import paths resolve under Pages and do not certify gameplay', async () => {
  const site = 'https://example.test/superhot-web';
  assert.equal(normalizeDojoSite(site).href, site + '/');
  const result = await inspectDojoPages({site,fetchImpl:fakeSite()});
  assert.equal(result.status, 'WEB_QA_HTTP_READY_NOT_BROWSER_VERIFIED');
  assert.equal(result.checks.length, 4);
  assert.ok(result.checks.every(item => item.result === 'PRESENT'));
});

test('missing Pages recorder is an explicit gap, not a passed browser run', async () => {
  const result = await inspectDojoPages({
    fetchImpl:fakeSite({'/superhot-web/scripts/acceptance-dojo-browser.mjs': undefined}),
  });
  assert.equal(result.status, 'WEB_QA_HTTP_GAP');
  assert.deepEqual(result.checks.find(check => check.path.endsWith('browser.mjs')),
    {path:'scripts/acceptance-dojo-browser.mjs',result:'GAP',httpStatus:404,detail:'HTTP_NOT_OK'});
});

test('network unavailability is UNKNOWN, while an incorrect scene is GAP', async () => {
  const offline = await inspectDojoPages({fetchImpl:async()=>{throw new TypeError('offline');}});
  assert.equal(offline.status, 'WEB_QA_HTTP_UNKNOWN');
  assert.ok(offline.checks.every(item => item.result === 'UNKNOWN_NETWORK'));
  const mismatch = await inspectDojoPages({fetchImpl:fakeSite({
    '/superhot-web/local-assets/manifest.json': JSON.stringify({scene:'Containers',sceneBuildIndex:28,assets:{x:{}}}),
  })});
  assert.equal(mismatch.status,'WEB_QA_HTTP_GAP');
  assert.equal(mismatch.checks[1].detail,'NOT_DOJO_BUILD10_MANIFEST');
});
