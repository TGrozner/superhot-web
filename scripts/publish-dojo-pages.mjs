#!/usr/bin/env node
/**
 * Publish a previously generated, source-qualified static Dojo pack to Pages.
 * Uses a disposable fresh clone so it never changes the active checkout, even
 * when other agents have uncommitted edits or are moving main.
 *
 * This transfers the source bytes to the PUBLIC GitHub repository. Run only
 * when you are authorized to redistribute every file in local-assets/.
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const pack = resolve(root, 'local-assets');
const maxFileBytes = 95 * 1024 * 1024;
const maxTotalBytes = 950 * 1024 * 1024;

function git(dir, args, { fail = true } = {}) {
  const proc = spawnSync('git', ['-C', dir, ...args], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
  });
  if (proc.error) throw proc.error;
  if (proc.status !== 0 && fail) {
    throw new Error('git ' + args.join(' ') + ' failed: ' + (proc.stderr || proc.stdout).trim());
  }
  return { ok: proc.status === 0, value: (proc.stdout ?? '').trim(), error: (proc.stderr ?? '').trim() };
}

function ensureName(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(value) ||
      value === '.' || value === '..') {
    throw new Error('Unsafe ' + label + ': ' + String(value));
  }
  return value;
}

async function sha256(path) {
  const h = createHash('sha256');
  for await (const chunk of createReadStream(path)) h.update(chunk);
  return h.digest('hex');
}

const manifestPath = join(pack, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (manifest?.standaloneVersion !== 1 || manifest.scene !== 'SHRL_Dojo2' ||
    manifest.sceneBuildIndex !== 10 || !manifest.assets ||
    typeof manifest.assets !== 'object' || Array.isArray(manifest.assets)) {
  throw new Error('local-assets/manifest.json is not an SHRL_Dojo2/build10 standalone pack');
}
for (const id of ['scenePackage', 'enemyMerged', 'enemyRig']) {
  if (!Object.hasOwn(manifest.assets, id)) throw new Error('Missing mandatory asset: ' + id);
}

const filenames = new Set(['manifest.json']);
const entries = Object.entries(manifest.assets);
if (entries.length < 3) throw new Error('Empty asset pack');
let totalBytes = 0;

for (const [id, item] of entries) {
  ensureName(id, 'asset ID');
  const filename = ensureName(item?.path, 'asset filename');
  if (!filename.startsWith(id + '.')) throw new Error('Asset filename does not match its ID: ' + id);
  if (filenames.has(filename)) throw new Error('Duplicate asset filename: ' + filename);
  filenames.add(filename);
  const file = join(pack, filename);
  const info = await stat(file);
  if (!info.isFile() || info.size < 1 || info.size > maxFileBytes ||
      info.size !== item.size) throw new Error('Asset missing, oversized or wrong size: ' + id);
  totalBytes += info.size;
  if (totalBytes > maxTotalBytes) throw new Error('Static site exceeds Pages size budget');
  if (await sha256(file) !== item.sha256) throw new Error('Asset SHA-256 mismatch: ' + id);
}

const actualNames = await readdir(pack);
for (const name of actualNames) {
  if (!filenames.has(name)) throw new Error('Unexpected file in local-assets/: ' + name);
}
if (actualNames.length !== filenames.size) throw new Error('Asset file count does not match manifest');

const remote = git(root, ['remote', 'get-url', 'origin']).value;
if (!/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)TGrozner\/superhot-web(?:\.git)?\/?$/i.test(remote)) {
  throw new Error('Unexpected Git origin; refusing to publish to ' + remote);
}
const author = git(root, ['config', 'user.name'], {fail:false}).value || 'TGrozner';
const email = git(root, ['config', 'user.email'], {fail:false}).value ||
  '9461179+TGrozner@users.noreply.github.com';

console.log('Verified Dojo source pack:', entries.length, 'assets,', totalBytes, 'bytes.');
console.log('Publishing ONLY local-assets/ from a disposable checkout to origin/main.');
console.log('WARNING: all these files become publicly downloadable on GitHub Pages.');

const temporary = await mkdtemp(join(tmpdir(), 'superhot-pages-'));
const checkout = join(temporary, 'checkout');
try {
  const parent = resolve(temporary);
  git(parent, ['clone', '--depth', '1', '--branch', 'main', remote, checkout]);
  const dest = join(checkout, 'local-assets');
  await mkdir(dest, { recursive: true });
  for (const filename of filenames) await copyFile(join(pack, filename), join(dest, filename));

  git(checkout, ['config', 'user.name', author]);
  git(checkout, ['config', 'user.email', email]);
  git(checkout, ['add', '--', 'local-assets']);
  if (git(checkout, ['diff', '--cached', '--quiet'], {fail:false}).ok) {
    console.log('Already published: static asset pack matches origin/main.');
    process.exitCode = 0;
  } else {
    git(checkout, ['commit', '-m', 'deploy(pages): standalone SHRL_Dojo2 source-qualified assets']);
    let pushed = false;
    for (let attempt = 0; attempt < 5 && !pushed; attempt++) {
      const push = git(checkout, ['push', 'origin', 'HEAD:refs/heads/main'], {fail:false});
      if (push.ok) { pushed = true; break; }
      // Other agents may push while packaging; do not force-push or discard
      // their commits. Rebase this one pack commit and retry.
      git(checkout, ['fetch', 'origin', 'main']);
      git(checkout, ['rebase', 'origin/main']);
    }
    if (!pushed) throw new Error('main kept moving; asset publication aborted without force push');
    console.log('Published commit:', git(checkout, ['rev-parse', 'HEAD']).value);
  }
  console.log('Expected Pages URL: https://tgrozner.github.io/superhot-web/');
  console.log('Check GitHub Actions > pages build and deployment for the published commit.');
} finally {
  await rm(temporary, {recursive:true, force:true});
}
