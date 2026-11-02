import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeContainersConcreteRgb24Mip0 } from '../src/render/material-model.js';

test('exact original RGB24 stream section yields real decoded mip0 RGBA bytes without shader fiction',()=>{
  const data=new Uint8Array(65535); // synthetic fixture: no original game bytes.
  data.set([12,34,56,78,90,123],0);
  data.set([201,202,203],(128*128-1)*3);
  data.fill(255,49152); // fake lower mip data; MUST NOT leak into mip0.
  const d=decodeContainersConcreteRgb24Mip0(data);
  assert.equal(d.width,128);
  assert.equal(d.height,128);
  assert.equal(d.pixelsRgba.length,128*128*4);
  assert.deepEqual(Array.from(d.pixelsRgba.slice(0,8)),[12,34,56,255,78,90,123,255]);
  assert.deepEqual(Array.from(d.pixelsRgba.slice(-4)),[201,202,203,255]);
  assert.equal(data[49152],255);
  assert.equal(d.mipsDecoded,1);
  assert.equal(d.sourceMipsIncludedInInput,8);
  assert.equal(d.colorTransferVerified,false);
  assert.equal(d.originVerified,false);
  assert.equal(d.shaderPassVerified,false);
  assert.equal(d.lightmapSamplingEnabled,false);
  assert.deepEqual(d.uvScale,[0.10000000149011612,0.10000000149011612]);
});

test('ArrayBuffer private File.slice data is supported with no mutation',()=>{
  const buffer=new ArrayBuffer(65535);
  const input=new Uint8Array(buffer);
  input.set([7,11,13]);
  const decoded=decodeContainersConcreteRgb24Mip0(buffer);
  assert.deepEqual(Array.from(decoded.pixelsRgba.slice(0,4)),[7,11,13,255]);
  assert.deepEqual(Array.from(input.slice(0,3)),[7,11,13]);
});

test('rejects wrong byte spans and accidental loading of entire resS instead of exact section',()=>{
  assert.throws(()=>decodeContainersConcreteRgb24Mip0(null),/Uint8Array or ArrayBuffer/);
  assert.throws(()=>decodeContainersConcreteRgb24Mip0(new Uint8Array(49152)),/Exact source RGB24/);
  assert.throws(()=>decodeContainersConcreteRgb24Mip0(new Uint8Array(65536)),/Exact source RGB24/);
});
