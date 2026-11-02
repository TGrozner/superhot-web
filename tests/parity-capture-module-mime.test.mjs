import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';

// Integration guard for SH-15's real-browser local screenshot module.
// This tests the HTTP MIME response; it does NOT perform a WebGL capture.
async function unusedLoopbackPort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test('local server exposes SH-15 .mjs capture code as an importable JS MIME', { timeout: 12000 }, async (t) => {
  const port = await unusedLoopbackPort();
  const server = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
  });
  t.after(() => server.kill());
  let response = null;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error('Local server exited before capture MIME check');
    try {
      response = await fetch('http://127.0.0.1:' + port + '/scripts/visual-web-capture.mjs');
      break;
    } catch {
      await sleep(50);
    }
  }
  assert.ok(response, 'local HTTP server must start');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /^text\/javascript(?:;|$)/i);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('cache-control'), 'no-cache');
  assert.match(await response.text(), /export async function captureContainersWeb\(/);
});
