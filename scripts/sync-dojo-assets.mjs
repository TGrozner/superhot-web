#!/usr/bin/env node
/**
 * Single build entrypoint: private source -> verified canonical local-assets.
 * Optional --publish pushes that SAME canonical pack to GitHub Pages.
 * No extra runtime lookup or separate localhost asset copy.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const argumentsList = process.argv.slice(2);
if (argumentsList.some(value => value !== '--publish') || argumentsList.length > 1) {
  throw new Error('Usage: node scripts/sync-dojo-assets.mjs [--publish]');
}
function run(name) {
  const child = spawnSync(process.execPath, ['scripts/' + name + '.mjs'], {
    cwd: root, encoding: 'utf8', stdio: 'inherit', windowsHide: true,
  });
  if (child.error || child.status !== 0) {
    throw new Error(name + ' failed; refusing stale-pack publication');
  }
}
run('prepare-dojo-ragdoll');
run('verify-dojo-ragdoll');
if (argumentsList.includes('--publish')) run('publish-dojo-pages');
else console.log('Canonical local-assets ready. Start npm start to test the exact Pages candidate.');
