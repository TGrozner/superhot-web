import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('static server serves an HTML entrypoint and JS modules without dependencies', { timeout: 8000 }, async () => {
  const port = 49000 + Math.floor(Math.random() * 9000);
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: root, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe']
  });
  try {
    const base = `http://127.0.0.1:${port}`;
    let response;
    for (let i = 0; i < 50; i++) {
      try { response = await fetch(base + '/'); break; }
      catch { await new Promise(resolve => setTimeout(resolve, 50)); }
    }
    assert.ok(response, 'Local server did not start');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.match(await response.text(), /FRAME\/\/BREAK/);
    const module = await fetch(base + '/src/main.js');
    assert.equal(module.status, 200);
    assert.match(module.headers.get('content-type'), /text\/javascript/);
    assert.match(await module.text(), /createRenderer/);
    const missing = await fetch(base + '/missing-not-real.js');
    assert.equal(missing.status, 404);
  } finally {
    child.kill();
  }
});
