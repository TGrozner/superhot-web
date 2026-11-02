import test from 'node:test';
import assert from 'node:assert/strict';
import { containersBuild28ConcreteMaterialSource } from '../src/render/material-model.js';

const source=containersBuild28ConcreteMaterialSource();

// Unity RGB24 layout = 3 bytes per pixel per mip. All arithmetic is from
// source-qualified metadata only; none of the native resource bytes are here.
const rgb24MipByteCount=(width,height,count)=>{
  let sum=0;
  for(let level=0;level<count;level++){
    sum+=Math.max(1,width>>level)*Math.max(1,height>>level)*3;
  }
  return sum;
};
// DXT5/BC3 is 16 bytes per 4x4 block (minimum one block per mip).
const dxt5MipByteCount=(width,height,count)=>{
  let sum=0;
  for(let level=0;level<count;level++){
    const w=Math.max(1,width>>level),h=Math.max(1,height>>level);
    sum+=Math.ceil(w/4)*Math.ceil(h/4)*16;
  }
  return sum;
};

test('Containers Concrete diffuse is the exact RGB24 128x128 external mipped texture',()=>{
  const t=source.mainTexture.nativeStream;
  assert.deepEqual(
    [t.owner,t.pathId,t.sourceResource,t.sourceByteOffset],
    ['resources.assets',248,'resources.assets.resS',59500780],
  );
  assert.deepEqual(
    [t.width,t.height,t.mipCount,t.unityFormatId,t.unityFormatName,t.serializedColorSpace],
    [128,128,8,3,'RGB24',1],
  );
  assert.equal(rgb24MipByteCount(t.width,t.height,t.mipCount),65535);
  assert.equal(t.sourceByteCount,65535);
  assert.equal(t.inlineBytes,0);
  assert.equal(t.payloadAvailableInWeb,false);
});

test('Containers Lightmap-0 source is DXT5 2048 square with 12 mips and separate owner',()=>{
  const t=source.lightmapTexture.nativeStream;
  assert.deepEqual(
    [t.owner,t.pathId,t.sourceResource,t.sourceByteOffset],
    ['sharedassets28.assets',2,'sharedassets28.assets.resS',0],
  );
  assert.deepEqual(
    [t.width,t.height,t.mipCount,t.unityFormatId,t.unityFormatName,t.serializedColorSpace],
    [2048,2048,12,12,'DXT5',1],
  );
  assert.equal(dxt5MipByteCount(t.width,t.height,t.mipCount),5592432);
  assert.equal(t.sourceByteCount,5592432);
  assert.equal(t.inlineBytes,0);
  assert.equal(t.payloadAvailableInWeb,false);
  assert.equal(source.lightmapTexture.uv2StreamDecoded,false);
  assert.equal(Object.isFrozen(t),true);
});

test('Metadata alone cannot turn the two stream references into an accepted Web shader',()=>{
  assert.equal(source.status,'serialized-shader-and-texture-references-resolved-payload-unavailable');
  assert.equal(source.webShadingReady,false);
  assert.equal(source.mainTexture.imagePixelsDecoded,false);
  assert.equal(source.lightmapTexture.imagePixelsDecoded,false);
  assert.notEqual(source.mainTexture.nativeStream.sourceResource,source.lightmapTexture.nativeStream.sourceResource);
});
