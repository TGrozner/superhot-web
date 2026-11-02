import test from 'node:test';
import assert from 'node:assert/strict';
import {
  containersBuild28ConcreteMaterialSource,
  decodeContainersConcreteRgb24Mip0,
  decodeContainersConcreteRgb24MipChain,
  containersConcreteGpuSamplerPacket,
} from '../src/render/material-model.js';

// ZERO proprietary pixels: this is an independently generated fixture whose
// eight mips use eight distinct RGB triples at the exact source sizes.
function syntheticRgb24Mips() {
  const bytes=new Uint8Array(65535);
  const receipts=[];
  let offset=0,dimension=128;
  for(let level=0;level<8;level++){
    const pixelCount=dimension*dimension;
    const color=[17+level,93+level,219-level];
    for(let i=0;i<pixelCount;i++){
      bytes[offset+3*i]=color[0];
      bytes[offset+3*i+1]=color[1];
      bytes[offset+3*i+2]=color[2];
    }
    receipts.push({level,dimension,offset,color,byteCount:pixelCount*3});
    offset+=pixelCount*3;
    dimension=Math.max(1,dimension>>1);
  }
  assert.equal(offset,bytes.byteLength);
  return {bytes,receipts};
}

test('real source Texture2D metadata identifies Point/Repeat, NOT Web trilinear',()=>{
  const native=containersBuild28ConcreteMaterialSource().mainTexture;
  assert.equal(native.owner,'resources.assets');
  assert.equal(native.pathId,248);
  assert.equal(native.nativeSampler.unityFilterMode,0);
  assert.equal(native.nativeSampler.unityFilterName,'Point');
  assert.deepEqual([native.nativeSampler.unityWrapU,native.nativeSampler.unityWrapV],[0,0]);
  assert.equal(native.nativeSampler.unityWrapName,'Repeat');
  assert.equal(native.nativeSampler.effectiveRuntimeSamplerVerified,false);
  assert.equal(native.nativeStream.sourceByteCount,65535);
});

test('all 8 native RGB24 mip levels decode without generated resampling',()=>{
  const {bytes,receipts}=syntheticRgb24Mips();
  const output=decodeContainersConcreteRgb24MipChain(bytes);
  assert.equal(output.mipsDecoded,8);
  assert.equal(output.sourceBytesConsumed,65535);
  assert.deepEqual(output.sourceTexture,{owner:'resources.assets',pathId:248});
  assert.equal(output.shaderPassVerified,false);
  assert.equal(output.originVerified,false);
  assert.equal(output.colorTransferVerified,false);
  for(let level=0;level<8;level++){
    const expected=receipts[level], actual=output.levels[level];
    assert.equal(actual.level,level);
    assert.deepEqual([actual.width,actual.height],[expected.dimension,expected.dimension]);
    assert.equal(actual.sourceByteOffsetWithinStream,expected.offset);
    assert.equal(actual.sourceByteCount,expected.byteCount);
    assert.equal(actual.pixelsRgba.length,expected.dimension**2*4);
    assert.deepEqual(Array.from(actual.pixelsRgba.slice(0,4)),[...expected.color,255]);
    assert.deepEqual(Array.from(actual.pixelsRgba.slice(-4)),[...expected.color,255]);
  }
  const mip0=decodeContainersConcreteRgb24Mip0(bytes);
  assert.deepEqual(output.levels[0].pixelsRgba,mip0.pixelsRgba);
});

test('source stream ArrayBuffer and Uint8Array views decode identically',()=>{
  const {bytes}=syntheticRgb24Mips();
  const a=decodeContainersConcreteRgb24MipChain(bytes);
  const b=decodeContainersConcreteRgb24MipChain(bytes.buffer);
  const padded=new Uint8Array(bytes.byteLength+20);
  padded.set(bytes,9);
  const c=decodeContainersConcreteRgb24MipChain(padded.subarray(9,9+bytes.length));
  for(let i=0;i<8;i++){
    assert.deepEqual(a.levels[i].pixelsRgba,b.levels[i].pixelsRgba);
    assert.deepEqual(a.levels[i].pixelsRgba,c.levels[i].pixelsRgba);
  }
});

test('invalid or partial native streams fail closed without pretending to know pixels',()=>{
  const bytes=syntheticRgb24Mips().bytes;
  for(const bad of [null,{},'RGB24',new Uint8Array(0),new Uint8Array(65534),new Uint8Array(65536)]){
    assert.throws(()=>decodeContainersConcreteRgb24MipChain(bad));
  }
  assert.equal(decodeContainersConcreteRgb24MipChain(bytes).sourceMipOrderingAssumed,'largest-first-contiguous');
});

test('exact Web sampler contract keeps source point filtering and no synthetic mip generation',()=>{
  const native=containersConcreteGpuSamplerPacket();
  assert.equal(native.magFilter,'NEAREST');
  assert.equal(native.minFilter,'NEAREST_MIPMAP_NEAREST');
  assert.deepEqual([native.wrapS,native.wrapT],['REPEAT','REPEAT']);
  assert.equal(native.mipLevels,8);
  assert.equal(native.maxLevel,7);
  assert.equal(native.generateMipmaps,false);
  assert.equal(native.originalRuntimeOverrideVerified,false);
  const mip0Only=containersConcreteGpuSamplerPacket({mipLevels:1});
  assert.equal(mip0Only.magFilter,'NEAREST');
  assert.equal(mip0Only.minFilter,'NEAREST');
  assert.equal(mip0Only.maxLevel,0);
  assert.throws(()=>containersConcreteGpuSamplerPacket({mipLevels:2}),/1 or 8/);
});

test('sampler mismatch has a calculable synthetic edge contrast, not a measured native pixel delta',()=>{
  // Two adjacent synthetic texels black/white. At an exact texel boundary,
  // linear interpolation yields a gray value; nearest sampling does not.
  const adjacent=[0,255],frac=0.5;
  const linear=adjacent[0]*(1-frac)+adjacent[1]*frac;
  const nearest=adjacent[1];
  assert.equal(linear,127.5);
  assert.equal(nearest,255);
  assert.equal(Math.abs(nearest-linear),127.5);
  // This is analytic fixture evidence only, not an MCD screenshot.
});
