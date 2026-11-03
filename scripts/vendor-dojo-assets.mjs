#!/usr/bin/env node
/**
 * One-time asset vendoring for a self-contained web deployment.
 *
 * Converts the configured owner-local Dojo asset map into static, same-origin
 * files. After the generated local-assets/ directory is committed/deployed,
 * neither GitHub Pages nor npm start requires private/ or the owner's computer.
 *
 * Only run with files you are authorized to redistribute.
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { assertDojoDeathPhysics } from './verify-dojo-ragdoll.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const sourceRoot = resolve(repo, 'private');
const configPath = resolve(sourceRoot, 'browser-assets.json');
const output = resolve(repo, 'local-assets');
const tmp = resolve(repo, '.standalone-assets-building');
const MAX_FILE_BYTES = 95 * 1024 * 1024;
const MAX_SITE_BYTES = 950 * 1024 * 1024;

const fixed = {
  mesh6: ['containers-mesh6.obj.gz', 'application/gzip', '.obj.gz'],
  mesh7: ['containers-mesh7.obj.gz', 'application/gzip', '.obj.gz'],
  texture: ['concrete.png', 'image/png', '.png'],
  enemyMerged: ['EnemyMerged.obj.gz', 'application/gzip', '.obj.gz'],
  enemyHeadless: ['EnemyMergedHeadless.obj.gz', 'application/gzip', '.obj.gz'],
  enemyRig: ['enemy-merged-animated.json', 'application/json', '.json'],
  enemyHeadlessRig: ['enemy-merged-headless-animated.json', 'application/json', '.json'],
  scenePackage: ['native-scene.json.gz', 'application/gzip', '.json.gz'],
  sceneLightmap_000: ['sceneLightmap_000.png', 'image/png', '.png'],
  sceneLightmapBc3: ['sceneLightmap_000.bc3', 'application/octet-stream', '.bc3'],
  sceneConcreteMicroseam: ['sceneConcreteMicroseam.png', 'image/png', '.png'],
  sceneConcretePore: ['sceneConcretePore.png', 'image/png', '.png'],
  sceneConcreteFogGradient: ['sceneConcreteFogGradient.png', 'image/png', '.png'],
};
for (const id of [
  'audioPistolFirePrimary','audioPistolFireAlternate','audioPistolEmpty',
  'audioPistolPickup','audioPistolPickupReloaded','audioPistolReady',
  'audioPistolThrow','audioEnemyFire','audioPlayerHit','audioEnemyShatter',
]) fixed[id] = [id + '.wav', 'audio/wav', '.wav'];

function descriptor(id) {
  if (Object.hasOwn(fixed, id)) return fixed[id];
  if (/^sceneHud_\d{3}$/.test(id) || /^scene(?:Texture|Lightmap)_\d{3}$/.test(id)) {
    return [id + '.png', 'image/png', '.png'];
  }
  if (/^sceneLightmapBc3_\d{3}$/.test(id)) {
    return [id + '.bc3', 'application/octet-stream', '.bc3'];
  }
  if (/^audioNative_(?:resources_assets|sharedassets0_assets)_\d+$/.test(id)) {
    return [id + '.wav', 'audio/wav', '.wav'];
  }
  throw new Error('Unrecognized asset ID in local configuration: ' + id);
}
function inside(path, parent) {
  const rel = relative(parent, path);
  return rel !== '' && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel);
}
async function digest(file) {
  const sha = createHash('sha256');
  for await (const chunk of createReadStream(file)) sha.update(chunk);
  return sha.digest('hex');
}
function assertDojoScene(packet) {
  if (packet?.schemaVersion !== 1 ||
      packet.source?.sceneBuildIndex !== 10 ||
      !/SHRL_Dojo2\.unity$/i.test(packet.source.scenePath ?? '')) {
    throw new Error('Refusing to publish a non-Dojo scene (expected SHRL_Dojo2, build index 10)');
  }
  if (!Array.isArray(packet.meshes) || !Array.isArray(packet.instances) ||
      !Array.isArray(packet.textures) || packet.meshes.length === 0) {
    throw new Error('Dojo scene package lacks native meshes, instances or texture descriptors');
  }
}
function requiredIds(packet) {
  const ids = new Set(['scenePackage', 'enemyMerged', 'enemyRig']);
  for (const texture of packet.textures ?? []) {
    if (typeof texture.id === 'string') ids.add(texture.id);
  }
  for (const lm of packet.lightmaps ?? []) {
    if (lm.compressedAssetId) ids.add(lm.compressedAssetId);
  }
  for (const id of [packet.gameplay?.hud?.heartTextureId,
    ...Object.values(packet.gameplay?.hud?.crosshairs ?? {}).map(x => x?.textureId)]) {
    if (id) ids.add(id);
  }
  for (const cue of Object.values(packet.gameplay?.audio?.clips ?? {})) {
    if (cue?.manifestKey) ids.add(cue.manifestKey);
  }
  return ids;
}

const config = JSON.parse(await readFile(configPath, 'utf8'));
if (!config || typeof config !== 'object' || Array.isArray(config)) {
  throw new Error('private/browser-assets.json must map asset IDs to local relative paths');
}
for (const key of ['scenePackage','enemyMerged','enemyRig']) {
  if (!config[key]) throw new Error('Missing mandatory Dojo asset: ' + key);
}
const realPrivate = await realpath(sourceRoot);
if (typeof config.scenePackage !== 'string') throw new Error('Invalid scenePackage path');
const realScene = await realpath(resolve(sourceRoot, config.scenePackage));
if (!inside(realScene, realPrivate)) throw new Error('Scene file escapes private/');
const packet = JSON.parse(gunzipSync(await readFile(realScene)).toString('utf8'));
assertDojoScene(packet);
// Private assets are build inputs, never a second runtime asset source.
 // Refuse to overwrite the canonical local-assets pack with a scene that
 // does not contain the exact source ragdoll for the served enemy rig.
const rigSource = await realpath(resolve(sourceRoot, config.enemyRig));
if (!inside(rigSource, realPrivate)) throw new Error('enemyRig escapes private/');
const ragdoll = assertDojoDeathPhysics(packet, await readFile(rigSource));
console.log('Qualified canonical Dojo ragdoll:', ragdoll.bodies,
  'bodies,', ragdoll.joints, 'joints; exact rig SHA-256.');
const missing = [...requiredIds(packet)].filter(id => !Object.hasOwn(config, id));
if (missing.length) throw new Error('Cannot publish incomplete Dojo pack. Missing manifest IDs: ' + missing.join(', '));

if (await stat(output).then(() => true, () => false)) {
  let existing;
  try { existing = JSON.parse(await readFile(join(output, 'manifest.json'),'utf8')); }
  catch { throw new Error('local-assets/ already exists without an owned manifest; refusing to overwrite it'); }
  if (existing.standaloneVersion !== 1) {
    throw new Error('local-assets/ was not generated by this tool; refusing to overwrite');
  }
}
await rm(tmp, { recursive: true, force: true });
await mkdir(tmp, { recursive: true });
const assets = {}, ids = Object.keys(config).sort();
let bytes = 0;
try {
  for (const id of ids) {
    const [name, type, extension] = descriptor(id);
    if (typeof config[id] !== 'string' || !config[id]) throw new Error('Invalid path for ' + id);
    const file = await realpath(resolve(sourceRoot, config[id]));
    if (!inside(file, realPrivate)) throw new Error('Asset escapes private/: ' + id);
    if (!(await stat(file)).isFile()) throw new Error('Not a regular file: ' + id);
    const size = (await stat(file)).size;
    if (!size || size > MAX_FILE_BYTES) throw new Error('Asset too large for GitHub Pages/Git: ' + id + ' (' + size + ' bytes)');
    bytes += size;
    if (bytes > MAX_SITE_BYTES) throw new Error('Pack exceeds safe GitHub Pages site budget');
    const path = id + extension;
    await copyFile(file, join(tmp, path));
    assets[id] = { name, type, path, size, sha256: await digest(file) };
  }
  const manifest = {
    standaloneVersion: 1,
    scene: 'SHRL_Dojo2',
    sceneBuildIndex: 10,
    // Source-qualified release capability; both localhost and Pages consume
    // this manifest and the exact rig/scene archive that it binds.
    features: { ragdoll: {
      bodies: ragdoll.bodies, joints: ragdoll.joints,
      rigSha256: ragdoll.rigSha256,
    } },
    assets,
  };
  await writeFile(join(tmp,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  const backup = output + '.previous';
  await rm(backup,{recursive:true,force:true});
  if (await stat(output).then(()=>true,()=>false)) await rename(output,backup);
  try {
    await rename(tmp,output);
    await rm(backup,{recursive:true,force:true});
  } catch (error) {
    if (await stat(backup).then(()=>true,()=>false)) await rename(backup,output);
    throw error;
  }
} finally {
  await rm(tmp,{recursive:true,force:true});
}
console.log('Dojo standalone pack created:', ids.length, 'assets,', bytes, 'bytes.');
console.log('Output: local-assets/ (including manifest.json)');
console.log('No runtime access to private/ is needed after these files are hosted.');
console.log('WARNING: publishing this folder in a public repository makes every included file publicly downloadable.');
