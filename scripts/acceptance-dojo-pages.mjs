/**
 * SH-10: opt-in HTTP preflight for the public/localhost Dojo QA imports.
 * Downloads only static HTML/manifest/browser-QA JS, never commercial assets,
 * native data or owner traces. HTTP reachability is NOT a browser playthrough.
 */
import { pathToFileURL } from 'node:url';

const DEFAULT_SITE = 'https://tgrozner.github.io/superhot-web/';
const MAX_TEXT_BYTES = 256 * 1024;
const CHECKS = Object.freeze([
  { path: 'index.html', kind: 'html' },
  { path: 'local-assets/manifest.json', kind: 'scene-manifest' },
  { path: 'scripts/acceptance-dojo-browser.mjs', kind: 'recorder' },
  { path: 'scripts/acceptance-dojo-fps.mjs', kind: 'fps' },
]);

/** @param {string} site */
export function normalizeDojoSite(site) {
  const url = new URL(site);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.search || url.hash || /\.(?:html?|mjs|js)$/i.test(url.pathname)) {
    throw new TypeError('site must be an HTTP(S) directory URL without query, fragment or credentials');
  }
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url;
}

/** @param {Response} response */
async function readBoundedText(response) {
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > MAX_TEXT_BYTES) throw new Error('RESPONSE_TOO_LARGE');
  if (!response.body) throw new Error('RESPONSE_BODY_MISSING');
  const reader = response.body.getReader();
  const chunks = [];
  let lengthRead = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      lengthRead += value.byteLength;
      if (lengthRead > MAX_TEXT_BYTES) throw new Error('RESPONSE_TOO_LARGE');
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(lengthRead);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/** @param {string} text @param {string} kind */
function validatePayload(text, kind) {
  if (kind === 'html') return /<html\b|<!doctype html/i.test(text)
    ? null : 'INDEX_HTML_INVALID';
  if (kind === 'scene-manifest') {
    let manifest;
    try { manifest = JSON.parse(text); }
    catch { return 'MANIFEST_NOT_JSON'; }
    return manifest?.scene === 'SHRL_Dojo2' && manifest?.sceneBuildIndex === 10 &&
      manifest?.assets && typeof manifest.assets === 'object' &&
      Object.keys(manifest.assets).length > 0 ? null : 'NOT_DOJO_BUILD10_MANIFEST';
  }
  if (kind === 'recorder') {
    return /export\s+function\s+startDojoCapture\s*\(/.test(text) &&
      /export\s+function\s+inspectDojoCaptureReadiness\s*\(/.test(text)
      ? null : 'BROWSER_RECORDER_EXPORT_MISSING';
  }
  if (kind === 'fps') {
    return /export\s+function\s+startDojoFpsCapture\s*\(/.test(text)
      ? null : 'FPS_RECORDER_EXPORT_MISSING';
  }
  throw new TypeError('unexpected check kind');
}

/**
 * @param {{site?: string, fetchImpl?: typeof fetch}} [options]
 * @returns {Promise<{status:string,site:string,checks:Array<{path:string,result:string,httpStatus:number|null,detail:string|null}>}>}
 */
export async function inspectDojoPages({ site = DEFAULT_SITE, fetchImpl = fetch } = {}) {
  const root = normalizeDojoSite(site);
  const checks = [];
  for (const { path, kind } of CHECKS) {
    const url = new URL(path, root);
    let response;
    try {
      response = await fetchImpl(url, { cache: 'no-store', signal: AbortSignal.timeout(12_000) });
    } catch (error) {
      checks.push({ path, result: 'UNKNOWN_NETWORK', httpStatus: null,
        detail: error instanceof Error ? error.name : 'FETCH_FAILED' });
      continue;
    }
    if (!response.ok) {
      checks.push({ path, result: 'GAP', httpStatus: response.status,
        detail: 'HTTP_NOT_OK' });
      continue;
    }
    try {
      const text = await readBoundedText(response);
      const error = validatePayload(text, kind);
      checks.push({ path, result: error ? 'GAP' : 'PRESENT',
        httpStatus: response.status, detail: error });
    } catch (error) {
      checks.push({ path, result: 'GAP', httpStatus: response.status,
        detail: error instanceof Error ? error.message : 'BODY_READ_FAILED' });
    }
  }
  const status = checks.some(check => check.result === 'GAP')
    ? 'WEB_QA_HTTP_GAP' : checks.some(check => check.result === 'UNKNOWN_NETWORK')
      ? 'WEB_QA_HTTP_UNKNOWN' : 'WEB_QA_HTTP_READY_NOT_BROWSER_VERIFIED';
  return { status, site: root.href, checks };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length > 2 || (args.length === 2 && args[0] !== '--site') || args.length === 1) {
    console.error('Usage: node scripts/acceptance-dojo-pages.mjs [--site https://tgrozner.github.io/superhot-web/]');
    process.exitCode = 2;
  } else {
    try {
      const result = await inspectDojoPages({ site: args[1] ?? DEFAULT_SITE });
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.status === 'WEB_QA_HTTP_READY_NOT_BROWSER_VERIFIED' ? 0
        : result.status === 'WEB_QA_HTTP_UNKNOWN' ? 3 : 2;
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 2;
    }
  }
}
