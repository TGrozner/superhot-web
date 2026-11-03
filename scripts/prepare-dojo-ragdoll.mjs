/**
 * Enrich the owner's existing Dojo with its original recovered rigidbody data.
 * One local command; no Unity execution, Git operations or public game assets.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { constants } from 'node:fs';
import { copyFile, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';

const root = fileURLToPath(new URL('../', import.meta.url));
const privateRoot = await realpath(join(root, 'private'));
const corpusRoot = join(privateRoot, 'analysis', '2026-11-02-mcd');
const extractor = await realpath(join(corpusRoot, 'rendering', 'closure', 'browser-scene', 'extract_death_physics.py'));
const inside = path => {
  const rel = relative(privateRoot, path);
  return rel !== '' && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel);
};
if (!inside(extractor)) throw new Error('Source physics extractor is outside private/');

const config = JSON.parse(await readFile(join(privateRoot, 'browser-assets.json'), 'utf8'));
if (!config || typeof config !== 'object' || Array.isArray(config)) {
  throw new TypeError('private/browser-assets.json must contain source-qualified asset paths');
}
async function configuredFile(id) {
  const value = config[id];
  if (typeof value !== 'string' || !value || isAbsolute(value) || value.split(/[\\/]/).includes('..')) {
    throw new TypeError('Missing or unsafe local source asset: ' + id);
  }
  const path = await realpath(resolve(privateRoot, value));
  if (!inside(path)) throw new Error(id + ' escapes private/');
  return path;
}
const scenePath = await configuredFile('scenePackage');
const rigPath = await configuredFile('enemyRig');
if (!scenePath.endsWith('.gz')) throw new TypeError('Expected a gzip Dojo scene package');
const rigBytes = await readFile(rigPath);
const rig = JSON.parse(rigBytes.toString('utf8'));
const scene = JSON.parse(gunzipSync(await readFile(scenePath)).toString('utf8'));
if (scene?.source?.sceneBuildIndex !== 10 ||
    !scene.source.scenePath?.endsWith('SHRL_Dojo2.unity') ||
    !Array.isArray(rig?.bones) || rig.bones.length !== 62 ||
    !scene.gameplay || typeof scene.gameplay !== 'object') {
  throw new Error('Source Dojo/build10 or original 62-bone EnemyMerged rig missing');
}
const rigSha256 = createHash('sha256').update(rigBytes).digest('hex');

// Reuse the existing PRIVATE AssetRipper prefab exporter, not new parameters.
const python = [
  'import importlib.util, json, sys',
  "spec = importlib.util.spec_from_file_location('private_death_physics', sys.argv[1])",
  'module = importlib.util.module_from_spec(spec)',
  'spec.loader.exec_module(module)',
  "with open(sys.argv[2], 'r', encoding='utf-8-sig') as stream:",
  '    rig = json.load(stream)',
  "print(json.dumps(module.build_death_physics(rig), separators=(',', ':')))",
].join('\n');
const invoke = spawnSync('python', ['-c', python, extractor, rigPath], {
  cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, windowsHide: true,
});
if (invoke.error || invoke.status !== 0) {
  throw new Error('Existing private death-physics extractor failed: ' +
    (invoke.stderr?.trim() || invoke.error?.message || 'exit ' + invoke.status));
}
const death = JSON.parse(invoke.stdout);
if (death?.source?.identity !== 'sharedassets0.assets::5163 / EnemyMergedForPooler' ||
    death.bodies?.length !== 22 || death.joints?.length !== 21 ||
    death.boneParents?.length !== rig.bones.length ||
    death.boneRestTransforms?.length !== rig.bones.length ||
    !Number.isFinite(death.fixedDelta) || death.fixedDelta <= 0 ||
    !Number.isInteger(death.solverIterations) || death.solverIterations <= 0) {
  throw new Error('Private source did not yield the exact 22-body / 21-joint rig');
}
if (scene.gameplay.deathPhysicsRigSha256 !== rigSha256 ||
    JSON.stringify(scene.gameplay.deathPhysics) !== JSON.stringify(death)) {
  scene.gameplay.deathPhysics = death;
  scene.gameplay.deathPhysicsRigSha256 = rigSha256;
  const backup = scenePath + '.before-ragdoll-' + Date.now() + '.bak';
  const temporary = join(dirname(scenePath), '.' + basename(scenePath) + '.ragdoll-' + process.pid + '.tmp');
  await copyFile(scenePath, backup, constants.COPYFILE_EXCL);
  try {
    await writeFile(temporary, gzipSync(Buffer.from(JSON.stringify(scene)), { level: 9 }));
    await rename(temporary, scenePath);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  console.log('Private Dojo death physics written: 22 Rigidbody / 21 CharacterJoint.');
  console.log('Original private package backed up:', backup);
} else {
  console.log('Private Dojo already contains matching source death physics.');
}

// Recreate the owner's LOCAL standalone pack. Never commit/publish these files.
const vendor = spawnSync(process.execPath, ['scripts/vendor-dojo-assets.mjs'], {
  cwd: root, stdio: 'inherit', windowsHide: true,
});
if (vendor.error || vendor.status !== 0) {
  throw new Error('Private scene enriched but standalone repack failed: inspect local asset paths');
}
console.log('Ready for local test: restart npm start; open http://localhost:4173/');
console.log('Keep private/ and local-assets/ PRIVATE. Web PBD is not native PhysX.');
