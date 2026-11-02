import test from 'node:test';
import assert from 'node:assert/strict';
import {
  containersBuild28ConcreteMaterialSource,
  sliceContainersBuild28LightmapBc3Mips,
  containersBuild28LightmapBc3GpuPacket,
} from '../src/render/material-model.js';

// Synthetic blocks ONLY; no game lightmap/texture, source code or snapshots.
function fakePrivateBc3Atlas() {
  const bytes=new Uint8Array(5592432);
  const spans=[];
  let offset=0,width=2048;
  for(let level=0;level<12;level++){
    const blocks=Math.ceil(width/4);
    const size=blocks*blocks*16;
    const marker=(19+level*13)&255;
    bytes.fill(marker,offset,offset+size);
    spans.push({level,width,offset,size,marker});
    offset+=size;
    width=Math.max(1,width>>1);
  }
  assert.equal(offset,bytes.length);
  return {bytes,spans};
}

test('build28 original lightmap source has BC3, Bilinear, Clamp, 12 mips',()=>{
  const atlas=containersBuild28ConcreteMaterialSource().lightmapTexture;
  assert.deepEqual([atlas.targetOwner,atlas.targetPathId],['sharedassets28.assets',2]);
  assert.equal(atlas.nativeStream.unityFormatId,12);
  assert.deepEqual([atlas.nativeStream.width,atlas.nativeStream.height],[2048,2048]);
  assert.equal(atlas.nativeStream.mipCount,12);
  assert.equal(atlas.nativeStream.sourceByteCount,5592432);
  assert.deepEqual(
    [atlas.nativeSampler.unityFilterMode,atlas.nativeSampler.unityWrapU,atlas.nativeSampler.unityWrapV],
    [1,1,1],
  );
  assert.equal(atlas.nativeSampler.effectiveRuntimeSamplerVerified,false);
});

test('12 original BC3 mip slices preserve every byte without CPU pixel conversion',()=>{
  const {bytes,spans}=fakePrivateBc3Atlas();
  const atlas=sliceContainersBuild28LightmapBc3Mips(bytes);
  assert.equal(atlas.sourceBytesConsumed,5592432);
  assert.equal(atlas.mipCount,12);
  assert.equal(atlas.levels.length,12);
  assert.deepEqual(atlas.sourceTexture,{owner:'sharedassets28.assets',pathId:2});
  for(const expected of spans){
    const level=atlas.levels[expected.level];
    assert.deepEqual(
      [level.level,level.width,level.height,level.sourceByteOffsetWithinStream,level.sourceByteCount],
      [expected.level,expected.width,expected.width,expected.offset,expected.size],
    );
    assert.equal(level.compressedBytes.length,expected.size);
    assert.equal(level.compressedBytes[0],expected.marker);
    assert.equal(level.compressedBytes[level.compressedBytes.length-1],expected.marker);
    assert.equal(level.compressedBytes.buffer,bytes.buffer);
    assert.equal(level.compressedBytes.byteOffset,bytes.byteOffset+expected.offset);
  }
  assert.deepEqual(spans.slice(-2).map(x=>[x.width,x.size]),[[2,16],[1,16]]);
  assert.deepEqual(
    [atlas.levels[1].sourceByteOffsetWithinStream,atlas.levels[11].sourceByteOffsetWithinStream],
    [4194304,5592416],
  );
  assert.equal(atlas.uv2Available,false);
  assert.equal(atlas.nativeBakeDecodingVerified,false);
});

test('exact slice accepts an ArrayBuffer and byteOffset Uint8Array view, rejects partial/oversized',()=>{
  const {bytes}=fakePrivateBc3Atlas();
  const padded=new Uint8Array(bytes.length+15);
  padded.set(bytes,7);
  const view=sliceContainersBuild28LightmapBc3Mips(padded.subarray(7,7+bytes.length));
  assert.equal(view.levels[11].compressedBytes.byteOffset,7+5592416);
  const arr=sliceContainersBuild28LightmapBc3Mips(bytes.buffer);
  assert.equal(arr.levels[3].compressedBytes[0],bytes[5505024]);
  for(const bad of [undefined,null,'BC3',{},new Uint8Array(bytes.length-1),new Uint8Array(bytes.length+1)]){
    assert.throws(()=>sliceContainersBuild28LightmapBc3Mips(bad));
  }
});

test('compressed GPU packet requires explicit sRGB-vs-UNORM hypothesis',()=>{
  assert.throws(()=>containersBuild28LightmapBc3GpuPacket(),/Specify/);
  const unorm=containersBuild28LightmapBc3GpuPacket({colorTransfer:'unorm-diagnostic'});
  assert.equal(unorm.extensionName,'WEBGL_compressed_texture_s3tc');
  assert.equal(unorm.internalFormatName,'COMPRESSED_RGBA_S3TC_DXT5_EXT');
  assert.equal(unorm.minFilter,'LINEAR_MIPMAP_NEAREST');
  assert.equal(unorm.magFilter,'LINEAR');
  assert.deepEqual([unorm.wrapS,unorm.wrapT],['CLAMP_TO_EDGE','CLAMP_TO_EDGE']);
  assert.equal(unorm.maxLevel,11);
  assert.equal(unorm.generateMipmaps,false);
  assert.equal(unorm.nativeLightmapShaderVerified,false);
  assert.equal(unorm.uv2RequiredForNativeBake,true);
  const srgb=containersBuild28LightmapBc3GpuPacket({colorTransfer:'srgb-diagnostic'});
  assert.equal(srgb.extensionName,'WEBGL_compressed_texture_s3tc_srgb');
  assert.equal(srgb.internalFormatName,'COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT');
  assert.equal(srgb.colorTransferHypothesis,'srgb-diagnostic');
  const single=containersBuild28LightmapBc3GpuPacket({colorTransfer:'unorm-diagnostic',mipLevels:1});
  assert.equal(single.minFilter,'LINEAR');
  assert.equal(single.maxLevel,0);
  for(const bad of ['linear','srgb',null,0]){
    assert.throws(()=>containersBuild28LightmapBc3GpuPacket({colorTransfer:bad}),/Specify/);
  }
  assert.throws(()=>containersBuild28LightmapBc3GpuPacket({colorTransfer:'unorm-diagnostic',mipLevels:5}),/Only mip0/);
});

test('compressedTexImage2D handoff can transfer all original bytes without synthesizing mips',()=>{
  const atlas=sliceContainersBuild28LightmapBc3Mips(fakePrivateBc3Atlas().bytes);
  const packet=containersBuild28LightmapBc3GpuPacket({colorTransfer:'unorm-diagnostic'});
  const fakeGL={
    TEXTURE_2D:3553, COMPRESSED_RGBA_S3TC_DXT5_EXT:33779,
    calls:[],generateMipmap(){throw Error('Never synthesize a native mipmap');},
    compressedTexImage2D(...args){this.calls.push(args);},
  };
  for(const level of atlas.levels){
    fakeGL.compressedTexImage2D(fakeGL.TEXTURE_2D,level.level,
      fakeGL.COMPRESSED_RGBA_S3TC_DXT5_EXT,
      level.width,level.height,0,level.compressedBytes);
  }
  assert.equal(packet.generateMipmaps,false);
  assert.equal(fakeGL.calls.length,12);
  assert.equal(fakeGL.calls[0][6].byteLength,4194304);
  assert.equal(fakeGL.calls[11][6].byteLength,16);
  assert.equal(fakeGL.calls.reduce((total,x)=>total+x[6].byteLength,0),5592432);
});
