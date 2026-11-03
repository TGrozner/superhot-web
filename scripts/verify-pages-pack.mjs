#!/usr/bin/env node
/**
 * Blocking deploy gate for the standalone SHRL_Dojo2 Pages site.
 * The entire asset pack must be committed and match its manifest.
 * Source identity is checked here; this is not a native gameplay parity test.
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const root = fileURLToPath(new URL('../', import.meta.url));
const assetDir = join(root, 'local-assets');
const manifestFile = join(assetDir, 'manifest.json');
const required = ['scenePackage', 'enemyMerged', 'enemyRig'];
const maxFileBytes = 95 * 1024 * 1024;
const maxTotalBytes = 950 * 1024 * 1024;

function fail(message) {
  throw new Error('PAGES PACK NOT DEPLOYABLE: ' + message);
}
async function sha256(file) {
  const hash = createHash('sha256');
  for await (const part of createReadStream(file)) hash.update(part);
  return hash.digest('hex');
}
function assetId(value) {
  return typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_]*$/.test(value);
}
function filename(value) {
  return typeof value === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(value) &&
    value !== '.' && value !== '..';
}
let manifest;
try {
  const info = await lstat(manifestFile);
  if (!info.isFile() || info.isSymbolicLink()) fail('manifest is not a regular file');
  manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
} catch (error) {
  fail('missing or invalid local-assets/manifest.json: ' + error.message);
}
if (manifest?.standaloneVersion !== 1 ||
    manifest.scene !== 'SHRL_Dojo2' ||
    manifest.sceneBuildIndex !== 10 ||
    manifest.assets === null ||
    typeof manifest.assets !== 'object' ||
    Array.isArray(manifest.assets)) {
  fail('wrong schema or SHRL_Dojo2/build10 identity');
}
const entries = Object.entries(manifest.assets);
if (entries.length < 52) fail('asset pack shrank below the verified 52-file baseline');
for (const id of required) {
  if (!Object.hasOwn(manifest.assets, id)) fail('missing mandatory ' + id);
}
const expectedNames = new Set(['manifest.json']);
let total = 0;
for (const [id, entry] of entries) {
  if (!assetId(id) || !filename(entry?.path) ||
      !entry.path.startsWith(id + '.') ||
      !Number.isSafeInteger(entry.size) || entry.size <= 0 ||
      entry.size > maxFileBytes ||
      typeof entry.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(entry.sha256)) {
    fail('invalid descriptor for ' + id);
  }
  if (expectedNames.has(entry.path)) fail('duplicate filename ' + entry.path);
  expectedNames.add(entry.path);
  const path = join(assetDir, entry.path);
  let info;
  try { info = await lstat(path); } catch { fail('file missing: ' + entry.path); }
  if (!info.isFile() || info.isSymbolicLink() || info.size !== entry.size) {
    fail('missing, symlinked or mismatched file: ' + entry.path);
  }
  total += info.size;
  if (total > maxTotalBytes) fail('pack exceeds site budget');
  if (await sha256(path) !== entry.sha256) fail('hash mismatch: ' + entry.path);
}
const actualNames = await readdir(assetDir);
if (actualNames.length !== expectedNames.size ||
    actualNames.some(name => !expectedNames.has(name))) {
  fail('files on disk do not match the committed manifest');
}
let scene;
try {
  const scenePath = join(assetDir, manifest.assets.scenePackage.path);
  scene = JSON.parse(gunzipSync(await readFile(scenePath)).toString('utf8'));
} catch (error) {
  fail('cannot decode scene package: ' + error.message);
}
if (scene?.schemaVersion !== 1 ||
    scene.source?.sceneBuildIndex !== 10 ||
    !/SHRL_Dojo2\.unity$/i.test(scene.source?.scenePath ?? '') ||
    !Array.isArray(scene.meshes) || scene.meshes.length === 0 ||
    !Array.isArray(scene.instances) || scene.instances.length === 0 ||
    !Array.isArray(scene.textures)) {
  fail('scene payload is not the identified playable Dojo/build10 package');
}
const usedIds = new Set(required);
for (const texture of scene.textures) {
  if (typeof texture.id === 'string') usedIds.add(texture.id);
}
for (const lightmap of scene.lightmaps ?? []) {
  if (typeof lightmap.compressedAssetId === 'string') usedIds.add(lightmap.compressedAssetId);
}
for (const id of [
  scene.gameplay?.hud?.heartTextureId,
  ...Object.values(scene.gameplay?.hud?.crosshairs ?? {}).map(x => x?.textureId),
  ...Object.values(scene.gameplay?.audio?.clips ?? {}).map(x => x?.manifestKey),
]) {
  if (typeof id === 'string' && id) usedIds.add(id);
}
for (const id of usedIds) {
  if (!Object.hasOwn(manifest.assets, id)) fail('scene-referenced asset absent: ' + id);
}
console.log('PAGES PACK OK:', entries.length, 'assets,', total,
  'bytes; Dojo/build10; every declared SHA-256 verified.');
