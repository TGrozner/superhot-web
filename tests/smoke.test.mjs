import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const main = await readFile(resolve(root, 'src/main.js'), 'utf8');

test('all UI IDs referenced by the game exist in HTML', () => {
  const ids = [...main.matchAll(/\$\('([\w-]+)'\)/g)].map(m => m[1]);
  for (const id of ids) assert.match(html, new RegExp(`id="${id}"`), `Missing DOM ID ${id}`);
});
test('game imports reference real local files', async () => {
  for (const file of ['src/main.js','src/renderer.js','src/audio.js','src/math.js','src/levels.js']) {
    const code = await readFile(resolve(root, file), 'utf8');
    for (const importPath of [...code.matchAll(/from\s+['"](\.\/[^'"]+)['"]/g)].map(m => m[1])) {
      await access(resolve(dirname(resolve(root, file)), importPath));
    }
  }
});
test('static deploy entrypoint uses relative paths', () => {
  assert.match(html, /src="\.\/src\/main\.js"/);
  assert.match(html, /href="\.\/style\.css"/);
  assert.doesNotMatch(html, /https?:\/\/[^'" ]+\.(?:js|css)/);
});
