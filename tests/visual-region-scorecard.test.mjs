import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import {
  measureRegisteredRegion, scoreVisualRegions,
} from '../scripts/visual-region-scorecard.mjs';

const signature = Buffer.from([137,80,78,71,13,10,26,10]);
const WIDTH = 12, HEIGHT = 8;
const MATRIX = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
function crc32(bytes) {
  let crc = 0xffffffff;
  for(const byte of bytes) {
    crc ^= byte;
    for(let n=0;n<8;n++) crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  return (crc^0xffffffff)>>>0;
}
function chunk(name, data) {
  const type=Buffer.from(name);
  const n=Buffer.alloc(4);n.writeUInt32BE(data.length);
  const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(Buffer.concat([type,data])));
  return Buffer.concat([n,type,data,crc]);
}
function png(width,height,rgb) {
  const head=Buffer.alloc(13);
  head.writeUInt32BE(width,0);head.writeUInt32BE(height,4);
  head[8]=8;head[9]=2; // RGB 8bit, non-interlaced
  const rows=[];
  for(let y=0;y<height;y++) {
    rows.push(Buffer.from([0])); // PNG filter 0
    rows.push(Buffer.from(rgb.subarray(y*width*3,(y+1)*width*3)));
  }
  return Buffer.concat([signature,chunk('IHDR',head),
    chunk('IDAT',deflateSync(Buffer.concat(rows))),chunk('IEND',Buffer.alloc(0))]);
}
function image(fill=[240,240,240]) {
  const rgb=new Uint8Array(WIDTH*HEIGHT*3);
  for(let p=0;p<WIDTH*HEIGHT;p++) rgb.set(fill,p*3);
  return {width:WIDTH,height:HEIGHT,rgb};
}
function mark(image, predicate, color) {
  for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++) {
    if(predicate(x,y))image.rgb.set(color,(y*WIDTH+x)*3);
  }
  return image;
}
function mask(predicate) {
  return mark(image([0,0,0]),predicate,[255,255,255]);
}
const actorN=(x,y)=>x>=1&&x<=5&&y>=2&&y<=5;
const actorW=(x,y)=>x>=2&&x<=6&&y>=2&&y<=5;
const cargo=(x,y)=>x>=8&&x<=10&&y>=1&&y<=3;
const floor=(x,y)=>x>=1&&x<=10&&y===7;
function manifest(role, imageName) {
  return {
    schemaVersion:1,origin:'synthetic',
    scene:{id:'Containers',buildIndex:28,stateId:'FROZEN_STATIC_FIXTURE'},
    camera:{convention:'column-major-world-to-camera',coordinateSpace:'matched-web',
      viewMatrix:[...MATRIX],projectionMatrix:[...MATRIX]},
    capture:{viewport:[WIDTH,HEIGHT],colorSpace:'srgb',hud:'off',png:imageName},
    objects:['source_actor','source_cargo','source_floor'].map(id=>({
      id,worldMatrix:[...MATRIX],
    })),
  };
}
function setup() {
  const dir=mkdtempSync(join(tmpdir(),'sh15-visual-scorecard-'));
  const n=mark(mark(image(),actorN,[200,20,20]),cargo,[20,20,200]);
  const w=mark(mark(mark(image(),actorW,[150,20,20]),cargo,[20,20,30]),floor,[220,220,220]);
  writeFileSync(join(dir,'native.png'),png(WIDTH,HEIGHT,n.rgb));
  writeFileSync(join(dir,'web.png'),png(WIDTH,HEIGHT,w.rgb));
  const masks=[
    ['actor-n',mask(actorN)],['actor-w',mask(actorW)],
    ['cargo-n',mask(cargo)],['cargo-w',mask(cargo)],
    ['floor-n',mask(floor)],['floor-w',mask(floor)],
  ];
  for(const [name,m] of masks)writeFileSync(join(dir,name+'.png'),png(WIDTH,HEIGHT,m.rgb));
  const regions={schemaVersion:1,regions:[
    {kind:'actor',slot:0,sourceObjectId:'source_actor',nativeMask:'actor-n.png',webMask:'actor-w.png'},
    {kind:'cargo',slot:0,sourceObjectId:'source_cargo',nativeMask:'cargo-n.png',webMask:'cargo-w.png'},
    {kind:'floor',slot:0,sourceObjectId:'source_floor',nativeMask:'floor-n.png',webMask:'floor-w.png'},
  ]};
  const nativePath=join(dir,'native.json'), webPath=join(dir,'web.json'),
    regionsPath=join(dir,'regions.json');
  const native=manifest('native','native.png'),web=manifest('web','web.png');
  const save=()=>{
    writeFileSync(nativePath,JSON.stringify(native));
    writeFileSync(webPath,JSON.stringify(web));
    writeFileSync(regionsPath,JSON.stringify(regions));
  };
  save();
  return {dir,n,w,native,web,regions,save,nativePath,webPath,regionsPath,
    remove:()=>rmSync(dir,{recursive:true,force:true})};
}

test('source-masked intersection isolates color error from silhouette displacement',()=>{
  const n=mark(image(),actorN,[200,20,20]);
  const w=mark(image(),actorW,[150,20,20]);
  const actual=measureRegisteredRegion(n,w,mask(actorN),mask(actorW));
  assert.equal(actual.nativeAreaPixels,20);
  assert.equal(actual.webAreaPixels,20);
  assert.equal(actual.intersectionPixels,16);
  assert.equal(actual.unionPixels,24);
  assert.ok(Math.abs(actual.silhouetteIou-2/3)<1e-12);
  assert.equal(actual.centroidDistancePx,1);
  assert.ok(Math.abs(actual.materialIntersection.rgbMae01-50/(3*255))<1e-12);
  assert.ok(actual.silhouetteUnion.rgbMae01>actual.materialIntersection.rgbMae01);
});

test('region scorecard ranks source-paired material vs silhouette separately',()=>{
  const f=setup();
  try{
    const output=scoreVisualRegions(f.nativePath,f.webPath,f.regionsPath);
    assert.equal(output.status,'PAIRED_REGIONS_NOT_PARITY_VERIFIED');
    assert.equal(output.evidenceClass,'SYNTHETIC_ONLY');
    assert.equal(output.nativeWebPairVerifiedOneToOne,false);
    assert.equal(output.regions.length,3);
    assert.equal(output.topMaterialColorDifferences[0].kind,'cargo');
    assert.equal(output.topSilhouetteDifferences[0].kind,'actor');
    assert.equal(output.regions[0].sourceObjectPaired,true);
    assert.equal(output.regions[0].sourceTranslationDeltaWorldUnits,0);
    assert.equal(output.global.matchedObjects,3);
    assert.equal(JSON.stringify(output).includes('source_cargo'),false);
    assert.equal(JSON.stringify(output).includes(f.dir),false);
  }finally{f.remove();}
});

test('camera matrix mismatch blocks ALL image metrics without reading source PNGs',()=>{
  const f=setup();
  try{
    f.web.camera.viewMatrix[12]=.2;
    f.save();
    const result=scoreVisualRegions(f.nativePath,f.webPath,f.regionsPath);
    assert.equal(result.status,'UNREGISTERED_NO_REGION_METRICS');
    assert.deepEqual(result.blockers,['VIEW_MATRIX_MISMATCH']);
    assert.equal(result.global,null);
    assert.equal(result.regions.length,0);
  }finally{f.remove();}
});

test('missing owner-qualified paired object ID and reused native/Web masks fail closed',()=>{
  const f=setup();
  try{
    f.regions.regions[0].sourceObjectId='MISSING_PRIVATE_ID';
    f.save();
    assert.throws(()=>scoreVisualRegions(f.nativePath,f.webPath,f.regionsPath),/not paired/);
    f.regions.regions[0].sourceObjectId='source_actor';
    f.regions.regions[0].webMask='actor-n.png';
    f.save();
    assert.throws(()=>scoreVisualRegions(f.nativePath,f.webPath,f.regionsPath),/different files/);
  }finally{f.remove();}
});

test('empty, colored or wrong-sized masks cannot produce an IoU',()=>{
  const n=image(),w=image(),a=mask(actorN),b=mask(actorW);
  assert.throws(()=>measureRegisteredRegion(n,w,mask(()=>false),b),/positive visible area/);
  const colored=mask(actorN);colored.rgb[3*26+1]=0;
  assert.throws(()=>measureRegisteredRegion(n,w,colored,b),/grayscale/);
  assert.throws(()=>measureRegisteredRegion(n,w,{...a,width:9},b),/viewport/);
});

test('duplicate zones or ownerless foreground masks are rejected',()=>{
  const f=setup();
  try{
    f.regions.regions.push({...f.regions.regions[0]});
    f.save();
    assert.throws(()=>scoreVisualRegions(f.nativePath,f.webPath,f.regionsPath),/Duplicate region/);
    f.regions.regions.pop();
    delete f.regions.regions[0].sourceObjectId;
    f.save();
    assert.throws(()=>scoreVisualRegions(f.nativePath,f.webPath,f.regionsPath),/sourceObjectId/);
  }finally{f.remove();}
});

test('region impact ranks absolute erroneous screen area separately from normalized IoU/MAE',()=>{
  const f=setup();
  try{
    const output=scoreVisualRegions(f.nativePath,f.webPath,f.regionsPath);
    const actor=output.regions.find(region=>region.kind==='actor');
    assert.equal(actor.symmetricDifferencePixels,8);
    assert.equal(actor.sharedFractionOfSmallerMask,0.8);
    assert.equal(actor.materialMeasurementStatus,'COMPARABLE_INTERSECTION_RGB');
    assert.ok(Math.abs(actor.screenWeightedUnionRgbMae01-
      actor.silhouetteUnion.rgbMae01*actor.unionPixels/(WIDTH*HEIGHT))<1e-12);
    assert.equal(output.topAbsoluteSilhouetteDifferences[0].kind,'actor');
    assert.equal(output.topScreenWeightedUnionColorDifferences.length,3);
    assert.ok(output.topScreenWeightedUnionColorDifferences.every(rank=>
      rank.value>=0&&rank.value<=1));
    assert.equal(output.sourcePoseMismatchCount,0);
  }finally{f.remove();}
});

test('source pose translation mismatch blocks material color attribution, not silhouette evidence',()=>{
  const f=setup();
  try{
    f.web.objects[0].worldMatrix[12]=0.1;
    f.save();
    const report=scoreVisualRegions(f.nativePath,f.webPath,f.regionsPath);
    const actor=report.regions.find(region=>region.kind==='actor');
    assert.equal(report.status,'PAIRED_REGIONS_NOT_PARITY_VERIFIED');
    assert.equal(report.sourcePoseMismatchCount,1);
    assert.equal(actor.sourcePoseAligned,false);
    assert.equal(actor.sourceTranslationDeltaWorldUnits,0.1);
    assert.equal(actor.materialMeasurementStatus,'BLOCKED_SOURCE_POSE_MISMATCH');
    assert.equal(actor.materialIntersection,null);
    assert.ok(actor.silhouetteIou>0);
    assert.ok(actor.silhouetteUnion.rgbMae01>0);
    assert.ok(report.topMaterialColorDifferences.every(region=>region.kind!=='actor'));
    assert.equal(report.topAbsoluteSilhouetteDifferences[0].kind,'actor');
  }finally{f.remove();}
});

test('source world matrix basis mismatch blocks material attribution independently of translation',()=>{
  const f=setup();
  try{
    f.web.objects[0].worldMatrix[0]=0.9;
    f.save();
    const report=scoreVisualRegions(f.nativePath,f.webPath,f.regionsPath);
    const actor=report.regions[0];
    assert.equal(actor.sourceTranslationDeltaWorldUnits,0);
    assert.ok(Math.abs(actor.sourceMaxNonTranslationCoefficientDelta-0.1)<1e-12);
    assert.equal(actor.sourcePoseAligned,false);
    assert.equal(actor.materialMeasurementStatus,'BLOCKED_SOURCE_POSE_MISMATCH');
    assert.equal(report.sourcePoseMismatchCount,1);
  }finally{f.remove();}
});

test('low overlap cannot masquerade as reliable material color, but remains visible shape error',()=>{
  const f=setup();
  try{
    const shifted=(x,y)=>x>=5&&x<=9&&y>=2&&y<=5;
    writeFileSync(join(f.dir,'actor-shifted.png'),png(WIDTH,HEIGHT,mask(shifted).rgb));
    f.regions.regions[0].webMask='actor-shifted.png';
    f.save();
    const report=scoreVisualRegions(f.nativePath,f.webPath,f.regionsPath);
    const actor=report.regions[0];
    assert.equal(actor.intersectionPixels,4);
    assert.equal(actor.sharedFractionOfSmallerMask,0.2);
    assert.equal(actor.materialMeasurementStatus,'BLOCKED_LOW_SHARED_SILHOUETTE_COVERAGE');
    assert.equal(actor.materialIntersection,null);
    assert.equal(actor.symmetricDifferencePixels,32);
    assert.equal(report.topAbsoluteSilhouetteDifferences[0].kind,'actor');
  }finally{f.remove();}
});

test('CLI prints only aggregated JSON, never native images/source keys/paths',()=>{
  const f=setup();
  try{
    const args=['scripts/visual-region-scorecard.mjs','--native',f.nativePath,
      '--web',f.webPath,'--regions',f.regionsPath];
    const proc=spawnSync(process.execPath,args,{encoding:'utf8'});
    assert.equal(proc.status,0,proc.stderr);
    const result=JSON.parse(proc.stdout);
    assert.equal(result.topMaterialColorDifferences[0].kind,'cargo');
    assert.equal(proc.stdout.includes(f.dir),false);
    assert.equal(proc.stdout.includes('source_actor'),false);
    const out=join(f.dir,'aggregate.json');
    const save=spawnSync(process.execPath,[...args,'--out',out],{encoding:'utf8'});
    assert.equal(save.status,0,save.stderr);
    assert.equal(JSON.parse(readFileSync(out,'utf8')).regions.length,3);
    const overwrite=spawnSync(process.execPath,[...args,'--out',out],{encoding:'utf8'});
    assert.equal(overwrite.status,2);
  }finally{f.remove();}
});

test('one-sided invisible regions have real zero-IoU evidence without fake material RGB', () => {
  const n=mark(image(),actorN,[200,20,20]);
  const w=image();
  const empty=mask(()=>false);
  const missingWeb=measureRegisteredRegion(n,w,mask(actorN),empty);
  assert.equal(missingWeb.visibilityStatus,'NATIVE_ONLY_VISIBLE');
  assert.equal(missingWeb.silhouetteIou,0);
  assert.equal(missingWeb.centroidDistancePx,null);
  assert.equal(missingWeb.nativeAreaPixels,20);
  assert.equal(missingWeb.webAreaPixels,0);
  assert.equal(missingWeb.symmetricDifferencePixels,20);
  assert.equal(missingWeb.sharedFractionOfSmallerMask,0);
  assert.equal(missingWeb.materialIntersection,null);
  assert.ok(missingWeb.silhouetteUnion.rgbMae01>0);
  const missingNative=measureRegisteredRegion(w,n,empty,mask(actorN));
  assert.equal(missingNative.visibilityStatus,'WEB_ONLY_VISIBLE');
  assert.equal(missingNative.silhouetteIou,0);
  assert.equal(missingNative.nativeAreaPixels,0);
  assert.equal(missingNative.webAreaPixels,20);
  assert.throws(()=>measureRegisteredRegion(w,w,empty,empty),/Both masks have no visible pixels/);
});

test('a missing Web actor stays rankable by absolute visible screen pixels', () => {
  const sample=setup();
  try {
    writeFileSync(join(sample.dir,'actor-absent.png'),
      png(WIDTH,HEIGHT,mask(()=>false).rgb));
    sample.regions.regions[0].webMask='actor-absent.png';
    sample.save();
    const report=scoreVisualRegions(sample.nativePath,sample.webPath,sample.regionsPath);
    const actor=report.regions.find(r=>r.kind==='actor');
    assert.equal(report.blockers.length,0);
    assert.equal(actor.visibilityStatus,'NATIVE_ONLY_VISIBLE');
    assert.equal(actor.silhouetteIou,0);
    assert.equal(actor.centroidDistancePx,null);
    assert.equal(actor.materialMeasurementStatus,'BLOCKED_MISSING_VISIBLE_SURFACE');
    assert.equal(actor.materialIntersection,null);
    assert.equal(actor.symmetricDifferencePixels,20);
    assert.ok(actor.screenWeightedUnionRgbMae01>0);
    assert.equal(report.topAbsoluteSilhouetteDifferences[0].kind,'actor');
    assert.equal(report.nativeWebPairVerifiedOneToOne,false);
  } finally { sample.remove(); }
});
