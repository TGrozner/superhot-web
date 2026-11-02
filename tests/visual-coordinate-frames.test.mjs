import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  fallbackPointToPackage,
  fallbackMatrixToPackage,
  auditContainersFramePairs,
} from '../scripts/visual-coordinate-frames.mjs';

const CONVENTION = 'CONTAINERS_FALLBACK_Z_TO_PACKAGE_X';
const cargoFallback = [17.45, 2.575, 13.975];
const cargoPackage = [-17.45, 2.575, -13.975];

function pair({
  sourceKey='private/source-qualified/Cargo22',fallback=cargoFallback,
  packagePoint=cargoPackage,worldMatrix=null,kind='serialized-object',
  matrixSource='complete-serialized-transform',
}={}) {
  const f={coordinates:'fallback-z-reflected',position:fallback};
  const p={coordinates:'package-x-reflected',position:packagePoint};
  const value={sourceKey,kind,fallback:f,package:p};
  if(worldMatrix!==null){
    f.worldMatrix=worldMatrix;
    p.worldMatrix=fallbackMatrixToPackage(worldMatrix);
    value.matrixSource=matrixSource;
  }
  return value;
}
const input=(pairs)=>({schemaVersion:1,contract:CONVENTION,pairs});

test('same Unity cargo point uses R=diag(-1,+1,-1) between distinct Web conversions',()=>{
  assert.deepEqual(fallbackPointToPackage(cargoFallback),cargoPackage);
  const report=auditContainersFramePairs(input([pair()]));
  assert.equal(report.status,'SOURCE_POINT_FRAME_CONSISTENT_NOT_PIXEL_PARITY');
  assert.ok(Math.abs(report.p95UnconvertedPositionDeltaWorldUnits-44.71255416546901)<1e-9);
  assert.equal(report.maxConvertedPositionDeltaWorldUnits,0);
  assert.equal(report.completeMatrixPairs,0);
  assert.equal(report.nativeExecutedFrameAuthenticated,false);
  assert.equal(report.pixelComparisonPerformed,false);
  assert.equal(report.oneToOneVerified,false);
  assert.equal(JSON.stringify(report).includes('Cargo22'),false);
});

test('complete affine source matrix with shear/rotation reflects both rows and columns',()=>{
  const f=[
    0,1,0,0, -2,0,0.3,0, 0.25,0.8,1.3,0,
    ...cargoFallback,1,
  ];
  const p=fallbackMatrixToPackage(f);
  assert.deepEqual(p.slice(12,15),cargoPackage);
  // Sign flips on both row and column: R M R, not R M or M R.
  assert.equal(p[1],-1);
  assert.equal(p[4],2);
  assert.equal(p[9],-.8);
  assert.deepEqual(fallbackMatrixToPackage(p),f);
  const report=auditContainersFramePairs(input([pair({worldMatrix:f})]));
  assert.equal(report.completeMatrixPairs,1);
  assert.equal(report.p95ConvertedMatrixCoefficientDelta,0);
});

test('a correct camera translation is not active-native camera proof',()=>{
  const f=[
    1,0,0,0, 0,1,0,0, 0,0,1,0, ...cargoFallback,1,
  ];
  const report=auditContainersFramePairs(input([pair({
    kind:'executed-camera',worldMatrix:f,matrixSource:'executed-camera-transform',
  })]));
  assert.equal(report.executedCameraPairsOwnerSupplied,1);
  assert.equal(report.nativeExecutedFrameAuthenticated,false);
  assert.equal(report.nativeWorldPoseMatched,false);
});

test('naive axis copy is a large false misregistration, never a native visual score',()=>{
  const report=auditContainersFramePairs(input([pair({packagePoint:cargoFallback})]));
  assert.equal(report.status,'SOURCE_POINT_FRAME_MISMATCH_BLOCKS_PIXEL_REGISTRATION');
  assert.ok(report.maxConvertedPositionDeltaWorldUnits>44.7);
  assert.equal(report.p95UnconvertedPositionDeltaWorldUnits,0);
  assert.equal(report.pixelComparisonPerformed,false);
});

test('source matrix from generated AABB is rejected, as are half-pairs and wrong conventions',()=>{
  const full=[1,0,0,0, 0,1,0,0, 0,0,1,0, ...cargoFallback,1];
  const fake=pair({worldMatrix:full,matrixSource:'proxy-aabb'});
  assert.throws(()=>auditContainersFramePairs(input([fake])),/Generated AABB\/proxy/);
  const incomplete=pair();
  incomplete.fallback.worldMatrix=full;
  assert.throws(()=>auditContainersFramePairs(input([incomplete])),/Incomplete world matrix pair/);
  const wrong=pair();
  wrong.package.coordinates='fallback-z-reflected';
  assert.throws(()=>auditContainersFramePairs(input([wrong])),/Mixed\/unknown coordinate/);
  const mismatched=pair({worldMatrix:full});
  mismatched.package.worldMatrix[12]+=1;
  assert.throws(()=>auditContainersFramePairs(input([mismatched])),/translation disagrees/);
});

test('strong input validation refuses duplicates, source-free pairs and incompatible matrices',()=>{
  assert.throws(()=>auditContainersFramePairs(input([pair(),pair()])),/unique owner-qualified/);
  assert.throws(()=>auditContainersFramePairs(input([pair({sourceKey:''})])),/unique owner-qualified/);
  assert.throws(()=>auditContainersFramePairs(input([])),/1\.\.2048 pairs/);
  assert.throws(()=>auditContainersFramePairs(input([pair()]),{tolerance:-1}),/tolerance/);
  assert.throws(()=>fallbackPointToPackage([1,NaN,2]),/finite/);
  assert.throws(()=>fallbackMatrixToPackage(Array(16).fill(1)),/affine/);
});

test('CLI accepts owner-local source pairs and emits only aggregate metadata, no private keys',()=>{
  const dir=mkdtempSync(join(tmpdir(),'sh15-coordinates-'));
  const path=join(dir,'source-pairs.json');
  try{
    writeFileSync(path,JSON.stringify(input([pair()])));
    const proc=spawnSync(process.execPath,['scripts/visual-coordinate-frames.mjs','--pairs',path],{encoding:'utf8'});
    assert.equal(proc.status,0,proc.stderr);
    const result=JSON.parse(proc.stdout);
    assert.equal(result.pairCount,1);
    assert.ok(!proc.stdout.includes('Cargo22'));
    assert.ok(!proc.stdout.includes(path));
    writeFileSync(path,JSON.stringify(input([pair({packagePoint:cargoFallback})])));
    const bad=spawnSync(process.execPath,['scripts/visual-coordinate-frames.mjs','--pairs',path],{encoding:'utf8'});
    assert.equal(bad.status,2);
    assert.match(bad.stdout,/MISMATCH_BLOCKS_PIXEL_REGISTRATION/);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
