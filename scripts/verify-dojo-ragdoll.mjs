#!/usr/bin/env node
/**
 * One source of truth for Dojo death physics: the SAME static scenePackage and
 * enemyRig bytes consumed by localhost and GitHub Pages.
 * No source extraction, private paths or native asset bytes are committed here.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const ownDir = fileURLToPath(new URL('../', import.meta.url));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const finite = value => typeof value === 'number' && Number.isFinite(value);
const positive = value => finite(value) && value > 0;
const fail = message => { throw new Error('DOJO RAGDOLL PACK INVALID: ' + message); };

export function assertDojoDeathPhysics(scene, rigBytes) {
  if (scene?.source?.sceneBuildIndex !== 10 ||
      !/SHRL_Dojo2\.unity$/i.test(scene.source?.scenePath ?? '')) {
    fail('expected SHRL_Dojo2 / build10');
  }
  let rig;
  try { rig = JSON.parse(Buffer.from(rigBytes).toString('utf8')); }
  catch { fail('enemyRig JSON cannot be decoded'); }
  if (!Array.isArray(rig?.bones) || rig.bones.length !== 62) {
    fail('expected the matching 62-bone EnemyMerged rig');
  }
  const death = scene.gameplay?.deathPhysics;
  if (!death) fail('gameplay.deathPhysics is missing from the canonical scene');
  const rigSha = sha256(rigBytes);
  if (scene.gameplay.deathPhysicsRigSha256 !== rigSha) {
    fail('deathPhysicsRigSha256 differs from the exact served enemyRig bytes');
  }
  if (death.source?.identity !== 'sharedassets0.assets::5163 / EnemyMergedForPooler' ||
      !Array.isArray(death.bodies) || death.bodies.length !== 22 ||
      !Array.isArray(death.joints) || death.joints.length !== 21 ||
      !Array.isArray(death.boneParents) || death.boneParents.length !== rig.bones.length ||
      !Array.isArray(death.boneRestTransforms) ||
      death.boneRestTransforms.length !== rig.bones.length) {
    fail('incomplete or wrong source 22-body / 21-joint / 62-bone definition');
  }
  for (const [index, parent] of death.boneParents.entries()) {
    if (!Number.isInteger(parent) || parent < -1 || parent >= index ||
        !death.boneRestTransforms[index]) {
      fail('invalid source bone parent/rest transform at ' + index);
    }
  }
  const usedBones = new Set();
  for (const [index, body] of death.bodies.entries()) {
    if (!Number.isInteger(body.boneIndex) ||
        body.boneIndex < 0 || body.boneIndex >= rig.bones.length ||
        usedBones.has(body.boneIndex) || !positive(body.mass) ||
        !Array.isArray(body.contactSpheres)) {
      fail('invalid source rigidbody at ' + index);
    }
    usedBones.add(body.boneIndex);
  }
  for (const [index, joint] of death.joints.entries()) {
    if (!Number.isInteger(joint.body) || !Number.isInteger(joint.connectedBody) ||
        joint.body < 0 || joint.body >= death.bodies.length ||
        joint.connectedBody < 0 || joint.connectedBody >= death.bodies.length ||
        joint.body === joint.connectedBody) {
      fail('invalid source joint indices at ' + index);
    }
  }
  if (!positive(death.fixedDelta) || !Number.isInteger(death.solverIterations) ||
      death.solverIterations < 1 || !finite(death.cleanupAfterSeconds) ||
      death.cleanupAfterSeconds < 0 ||
      !['x','y','z'].every(axis => finite(death.gravity?.[axis]))) {
    fail('missing source physics clock, solver, cleanup or gravity');
  }
  return { rigSha256: rigSha, bodies: death.bodies.length,
    joints: death.joints.length, bones: rig.bones.length };
}

function safeAsset(manifest, id) {
  const asset = manifest?.assets?.[id];
  if (!asset || typeof asset.path !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(asset.path) ||
      !asset.path.startsWith(id + '.') || !/^[a-f0-9]{64}$/.test(asset.sha256 ?? '')) {
    fail('missing or unsafe static manifest asset ' + id);
  }
  return asset;
}

export async function verifyDojoRagdollPack(packDir) {
  const manifest = JSON.parse(await readFile(join(packDir, 'manifest.json'), 'utf8'));
  if (manifest.standaloneVersion !== 1 || manifest.scene !== 'SHRL_Dojo2' ||
      manifest.sceneBuildIndex !== 10) fail('wrong canonical standalone manifest');
  const sceneAsset = safeAsset(manifest, 'scenePackage');
  const rigAsset = safeAsset(manifest, 'enemyRig');
  const sceneBytes = await readFile(join(packDir, sceneAsset.path));
  const rigBytes = await readFile(join(packDir, rigAsset.path));
  if (sha256(sceneBytes) !== sceneAsset.sha256 || sha256(rigBytes) !== rigAsset.sha256 ||
      sceneBytes.length !== sceneAsset.size || rigBytes.length !== rigAsset.size) {
    fail('static scene/rig bytes do not match their manifest');
  }
  let scene;
  try { scene = JSON.parse(gunzipSync(sceneBytes).toString('utf8')); }
  catch { fail('scenePackage gzip/JSON cannot be decoded'); }
  const report = assertDojoDeathPhysics(scene, rigBytes);
  const declared = manifest.features?.ragdoll;
  if (declared?.bodies !== report.bodies ||
      declared?.joints !== report.joints ||
      declared?.rigSha256 !== report.rigSha256) {
    fail('manifest features.ragdoll does not match the actual scene and rig');
  }
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const packDir = process.argv[2] ? resolve(process.argv[2]) : join(ownDir, 'local-assets');
  const report = await verifyDojoRagdollPack(packDir);
  console.log('DOJO RAGDOLL PACK OK:', report.bodies, 'bodies,',
    report.joints, 'joints,', report.bones, 'bones; exact rig SHA-256 verified.');
}
