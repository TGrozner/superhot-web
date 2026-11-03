import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import {
  measureViewportHotspots, scoreViewportHotspots,
} from '../scripts/visual-viewport-hotspots.mjs';

const WIDTH = 8, HEIGHT = 8;
const IDENTITY = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
const MAGIC = Buffer.from([137,80,78,71,13,10,26,10]);

function image() {
  const rgb = new Uint8Array(WIDTH * HEIGHT * 3);
  rgb.fill(255);
  return { width: WIDTH, height: HEIGHT, rgb };
}
function paint(frame, x, y, color) {
  frame.rgb.set(color, (y * WIDTH + x) * 3);
}
function syntheticPair() {
  const native = image(), web = image();
  for (let y=0; y<2; y++) for (let x=0; x<2; x++) paint(web,x,y,[0,0,0]);
  paint(web,2,0,[0,0,0]);
  paint(web,6,6,[127,127,127]); paint(web,7,7,[127,127,127]);
  return { native, web };
}
function crc32(bytes) {
  let crc=0xffffffff;
  for (const byte of bytes) {
    crc^=byte;
    for (let n=0; n<8; n++) crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  return (crc^0xffffffff)>>>0;
}
function chunk(type,data) {
  const label=Buffer.from(type),length=Buffer.alloc(4);
  length.writeUInt32BE(data.length,0);
  const crc=Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([label,data])),0);
  return Buffer.concat([length,label,data,crc]);
}
function png(frame) {
  const head=Buffer.alloc(13);
  head.writeUInt32BE(frame.width,0); head.writeUInt32BE(frame.height,4);
  head[8]=8;head[9]=2;
  const scanlines=[];
  for (let y=0; y<frame.height; y++) {
    scanlines.push(Buffer.from([0]),
      Buffer.from(frame.rgb.subarray(y*frame.width*3,(y+1)*frame.width*3)));
  }
  return Buffer.concat([MAGIC,chunk('IHDR',head),
    chunk('IDAT',deflateSync(Buffer.concat(scanlines))),chunk('IEND',Buffer.alloc(0))]);
}
function manifest(origin,name) {
  return {
    schemaVersion:1,origin,
    scene:{id:'SHRL_Dojo2',buildIndex:10,stateId:'test_frozen_pose'},
    camera:{convention:'column-major-world-to-camera',
      coordinateSpace:'matched-web',viewMatrix:[...IDENTITY],
      projectionMatrix:[...IDENTITY]},
    capture:{viewport:[WIDTH,HEIGHT],colorSpace:'srgb',hud:'off',png:name},
    objects:[],
    ...(origin==='native'?{evidence:{captureId:'PRIVATE_TEST',buildId:'SYNTHETIC'}}:{}),
  };
}
function setup() {
  const dir=mkdtempSync(join(tmpdir(),'sh15-hotspots-'));
  const {native,web}=syntheticPair();
  const nativePath=join(dir,'native.json'),webPath=join(dir,'web.json');
  const a=manifest('synthetic','native.png'),b=manifest('synthetic','web.png');
  writeFileSync(join(dir,'native.png'),png(native));
  writeFileSync(join(dir,'web.png'),png(web));
  const save=()=>{
    writeFileSync(nativePath,JSON.stringify(a));
    writeFileSync(webPath,JSON.stringify(b));
  };
  save();
  return {dir,a,b,save,nativePath,webPath,
    remove:()=>rmSync(dir,{force:true,recursive:true})};
}

test('all visible pixels are partitioned once and weighted tile errors sum to full-frame RGB MAE',()=>{
  const {native,web}=syntheticPair();
  const report=measureViewportHotspots(native,web,{cols:4,rows:4});
  assert.equal(report.tiles.length,16);
  assert.equal(report.tiles.reduce((s,t)=>s+t.pixels,0),64);
  assert.equal(report.fullFrameAffectedPixels,7);
  assert.equal(report.tiles.reduce((s,t)=>s+t.affectedPixels,0),7);
  assert.ok(Math.abs(report.tiles.reduce((s,t)=>s+t.screenWeightedRgbMae01,0)
    -report.fullFrameRgbMae01)<1e-12);
  assert.ok(Math.abs(report.fullFrameRgbMae01-
    (4*255+255+2*128)/(64*255))<1e-12);
  assert.deepEqual(report.topScreenWeightedRgbHotspots.map(h=>[h.row,h.col]),
    [[0,0],[3,3],[0,1]]);
  assert.deepEqual(report.topScreenWeightedRgbHotspots[0].rectPx,
    {left:0,top:0,width:2,height:2});
  assert.equal(report.tiles.find(t=>t.row===3&&t.col===3).affectedPixels,2);
});

test('empty delta returns zero scores, no fake hotspots',()=>{
  const frame=image();
  const report=measureViewportHotspots(frame,frame,{cols:4,rows:2});
  assert.equal(report.fullFrameRgbMae01,0);
  assert.equal(report.fullFrameAffectedPixels,0);
  assert.deepEqual(report.topScreenWeightedRgbHotspots,[]);
  assert.deepEqual(report.topLocalRgbHotspots,[]);
  assert.deepEqual(report.topChangedAreaHotspots,[]);
});

test('uneven grid partitions retain every pixel and deterministic tie-breaking',()=>{
  const n={width:5,height:3,rgb:new Uint8Array(45)};
  const w={width:5,height:3,rgb:Uint8Array.from(n.rgb)};
  for (let p=0; p<15; p++) w.rgb[p*3]=255;
  const report=measureViewportHotspots(n,w,{cols:3,rows:2});
  assert.equal(report.tiles.reduce((s,t)=>s+t.pixels,0),15);
  assert.equal(report.tiles.reduce((s,t)=>s+t.rectPx.width*t.rectPx.height,0),15);
  assert.equal(report.fullFrameRgbMae01,1/3);
  assert.equal(report.topLocalRgbHotspots[0].row,0);
  assert.equal(report.topLocalRgbHotspots[0].col,0);
});

test('unbounded images, mismatched channels, bad grid sizes are rejected',()=>{
  const a=image(),b=image();
  assert.throws(()=>measureViewportHotspots(a,{...b,width:7}),/identically-sized/);
  assert.throws(()=>measureViewportHotspots(a,{...b,rgb:new Uint8Array(10)}),/RGB frames/);
  assert.throws(()=>measureViewportHotspots(a,b,{cols:0}),/Grid/);
  assert.throws(()=>measureViewportHotspots(a,b,{cols:9}),/Grid/);
  assert.throws(()=>measureViewportHotspots(a,b,{rows:1.5}),/Grid/);
});

test('registered Dojo frame produces private hotspot aggregates, not screenshot/source identity',()=>{
  const f=setup();
  try {
    const result=scoreViewportHotspots(f.nativePath,f.webPath,{cols:4,rows:4});
    assert.equal(result.status,'PAIRED_VIEWPORT_NOT_PARITY_VERIFIED');
    assert.equal(result.evidenceClass,'SYNTHETIC_ONLY');
    assert.equal(result.nativeWebPairVerifiedOneToOne,false);
    assert.equal(result.measurements.topScreenWeightedRgbHotspots[0].col,0);
    assert.ok(!JSON.stringify(result).includes(f.dir));
    assert.ok(!JSON.stringify(result).includes('test_frozen_pose'));
    assert.ok(!JSON.stringify(result).includes('PRIVATE_TEST'));
  } finally { f.remove(); }
});

test('camera mismatch blocks measurement even when both image PNGs are absent',()=>{
  const f=setup();
  try {
    f.b.camera.viewMatrix[12]=2;
    f.b.capture.png='missing.png';
    f.save();
    const result=scoreViewportHotspots(f.nativePath,f.webPath,{cols:4,rows:4});
    assert.equal(result.status,'UNREGISTERED_NO_VIEWPORT_METRICS');
    assert.deepEqual(result.blockers,['VIEW_MATRIX_MISMATCH']);
    assert.equal(result.measurements,null);
  } finally { f.remove(); }
});

test('identical path and wrong PNG dimensions fail without fabricated scores',()=>{
  const f=setup();
  try {
    f.b.capture.png=f.a.capture.png; f.save();
    assert.throws(()=>scoreViewportHotspots(f.nativePath,f.webPath),/distinct files/);
    f.b.capture.png='web.png';
    f.b.capture.viewport=[7,8]; f.save();
    const result=scoreViewportHotspots(f.nativePath,f.webPath);
    assert.deepEqual(result.blockers,['VIEWPORT_MISMATCH']);
  } finally { f.remove(); }
});

test('CLI reports aggregate-only JSON, supports exclusive private output and rejects overwrite',()=>{
  const f=setup();
  try {
    const args=['scripts/visual-viewport-hotspots.mjs','--native',f.nativePath,
      '--web',f.webPath,'--cols','4','--rows','4'];
    const run=spawnSync(process.execPath,args,{encoding:'utf8'});
    assert.equal(run.status,0,run.stderr);
    const report=JSON.parse(run.stdout);
    assert.equal(report.measurements.fullFrameAffectedPixels,7);
    assert.equal(run.stdout.includes(f.dir),false);
    const out=join(f.dir,'hotspots.json');
    const saved=spawnSync(process.execPath,[...args,'--out',out],{encoding:'utf8'});
    assert.equal(saved.status,0,saved.stderr);
    assert.equal(JSON.parse(readFileSync(out,'utf8')).measurements.grid[0],4);
    assert.equal(statSync(out).mode & 0o777,0o600);
    const duplicate=spawnSync(process.execPath,[...args,'--out',out],{encoding:'utf8'});
    assert.equal(duplicate.status,2);
    const invalid=spawnSync(process.execPath,[...args,'--cols','oops'],{encoding:'utf8'});
    assert.equal(invalid.status,2);
  } finally { f.remove(); }
});
