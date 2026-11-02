import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { request } from 'node:http';

async function startFixture(t, configured) {
  const root = await mkdtemp(join(tmpdir(), 'mcd-local-assets-'));
  let child;
  t.after(async () => {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(join(root, 'private'));
  await mkdir(join(root, 'scripts'));
  await writeFile(join(root, 'server.mjs'), await readFile(new URL('../server.mjs', import.meta.url)));
  await writeFile(join(root, 'index.html'), '<h1>Public fixture</h1>');
  await writeFile(join(root, 'scripts', 'capture.mjs'), 'export const example = 1;');
  await writeFile(join(root, 'private', 'model.bin'), 'generated-private-model-fixture');
  await writeFile(join(root, 'private', 'unlisted.bin'), 'must-not-be-served');
  // Authored 1x1 PNG fixture only; never an original MCD sprite.
  await writeFile(join(root,'private','hud.png'), Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/gVgAAAAASUVORK5CYII=',
    'base64'));
  if (configured) await writeFile(join(root, 'private', 'browser-assets.json'), JSON.stringify(typeof configured === 'object' ? configured : { mesh6: 'model.bin' }));
  child = spawn(process.execPath, [join(root, 'server.mjs')], {
    env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const port = await new Promise((resolve, reject) => {
    let log = '';
    const timer = setTimeout(() => reject(new Error('Fixture server did not start')), 10000);
    child.once('error', reject);
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Fixture server exited ${code}`)); });
    child.stdout.on('data', data => {
      log += data;
      const match = /running at http:\/\/localhost:(\d+)/.exec(log);
      if (match) { clearTimeout(timer); resolve(Number(match[1])); }
    });
    child.stderr.on('data', data => { log += data; });
  });
  return `http://127.0.0.1:${port}`;
}

test('local model routes serve only configured bytes to the same origin', async t => {
  const base = await startFixture(t, true);
  const manifest = await (await fetch(base + '/local-assets/manifest')).json();
  assert.deepEqual(manifest, { assets: { mesh6: { name: 'containers-mesh6.obj.gz', type: 'application/gzip' } } });
  const model = await fetch(base + '/local-assets/mesh6');
  assert.equal(model.status, 200);
  assert.equal(await model.text(), 'generated-private-model-fixture');
  assert.equal(model.headers.get('cache-control'), 'no-store');
  assert.equal(model.headers.get('cross-origin-resource-policy'), 'same-origin');
  for (const path of ['/private/model.bin', '/private/browser-assets.json', '/local-assets/unlisted', '/.git/config', '/src/%2e%2e%2fprivate/model.bin']) {
    const response = await fetch(base + path);
    assert.ok([403, 404].includes(response.status), `private route ${path}`);
    assert.ok(!(await response.text()).includes('generated-private-model-fixture'));
  }
  assert.equal((await fetch(base + '/local-assets/mesh6', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  assert.equal((await fetch(base + '/local-assets/mesh6', { headers: { Origin: 'https://other.example' } })).status, 403);
  const reboundStatus = await new Promise((resolve, reject) => {
    // Use raw HTTP: fetch may replace the forbidden Host header.
    const req = request(base + '/local-assets/mesh6', { headers: { Host: 'other.example' } }, res => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.end();
  });
  assert.equal(reboundStatus, 403);
  assert.equal((await fetch(base + '/local-assets/mesh6', { method: 'POST' })).status, 405);
  assert.equal(await (await fetch(base + '/')).text(), '<h1>Public fixture</h1>');
  assert.match((await fetch(base + '/scripts/capture.mjs')).headers.get('content-type'), /^text\/javascript/);
});

test('a public checkout without private configuration does not invent original assets', async t => {
  const base = await startFixture(t, false);
  assert.deepEqual(await (await fetch(base + '/local-assets/manifest')).json(), { assets: {} });
  assert.equal((await fetch(base + '/local-assets/mesh6')).status, 404);
  assert.equal((await fetch(base + '/private/model.bin')).status, 404);
  assert.equal((await fetch(base + '/')).status, 200);
});


test('owner-listed Dojo HUD PNG is available only through same-origin allowlist', async t => {
  const base=await startFixture(t,{sceneHud_001:'hud.png'});
  const manifest=await (await fetch(base+'/local-assets/manifest')).json();
  assert.deepEqual(manifest,{assets:{sceneHud_001:{name:'sceneHud_001.png',type:'image/png'}}});
  const image=await fetch(base+'/local-assets/sceneHud_001');
  assert.equal(image.status,200);
  assert.equal(image.headers.get('content-type'),'image/png');
  const bytes=new Uint8Array(await image.arrayBuffer());
  assert.deepEqual([...bytes.slice(0,8)],[137,80,78,71,13,10,26,10]);
  assert.equal((await fetch(base+'/local-assets/sceneHud_002')).status,404);
  assert.equal((await fetch(base+'/private/hud.png')).status,404);
  assert.equal((await fetch(base+'/local-assets/sceneHud_001',{headers:{Origin:'https://elsewhere.example'}})).status,403);
});
