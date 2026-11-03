/**
 * SH-10: owner-local, opt-in *real PNG pixel* comparison for MCD Dojo/build10.
 * Never distributes screenshots, original assets or native source. This is a
 * geometry/color diagnostic, NOT an authenticated execution or a parity gate.
 */
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve, relative } from 'node:path';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

export const DOJO_PIXEL_STATUS = Object.freeze({
  MEASURED: 'OWNER_SUPPLIED_PRIVATE_PNG_DELTA_MEASURED_NOT_PARITY',
  INCOMPLETE: 'PRIVATE_NATIVE_WEB_IMAGE_PAIR_MISSING_OR_UNDECODABLE',
  INVALID: 'PRIVATE_PIXEL_PAIR_METADATA_INVALID',
});
const MAX_PIXELS = 4096 * 2160;
const pngSignature = [137,80,78,71,13,10,26,10];
const crcTable=Uint32Array.from({length:256,},(_,n)=>{
  let c=n;for(let j=0;j<8;j++)c=(c&1)?0xedb88320^(c>>>1):(c>>>1);
  return c>>>0;
});
const chunkCrc=(bytes,start,end)=>{
  let crc=0xffffffff;
  for(let i=start;i<end;i++)crc=crcTable[(crc^bytes[i])&255]^(crc>>>8);
  return (crc^0xffffffff)>>>0;
};
const validInt = n => Number.isSafeInteger(n) && n >= 0;
const sampleName = x => typeof x === 'string' && /^[a-z][a-z0-9_-]{0,39}$/.test(x);
const isRecord = v => v && typeof v === 'object' && !Array.isArray(v);
const paeth = (a,b,c) => {
  const p=a+b-c,da=Math.abs(p-a),db=Math.abs(p-b),dc=Math.abs(p-c);
  return da<=db && da<=dc ? a : db<=dc ? b : c;
};

/**
 * Decode 8-bit, noninterlaced, opaque RGB/RGBA screenshot PNGs only.
 * Unsupported/alpha/compressed formats FAIL CLOSED, never silently remap.
 * @param {Buffer} bytes
 * @returns {{width:number,height:number,rgb:Uint8Array}}
 */
export function decodeDojoPng(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 57 ||
      pngSignature.some((b,i) => bytes[i] !== b)) throw new TypeError('PNG signature required');
  let offset=8, width=0,height=0,bpp=0,seenHeader=false,seenEnd=false;
  const compressed=[];
  while(offset+12<=bytes.length) {
    const length=bytes.readUInt32BE(offset);
    if(length>64*1024*1024 || offset+12+length>bytes.length) throw new RangeError('PNG chunk out of bounds');
    if(chunkCrc(bytes,offset+4,offset+8+length)!==bytes.readUInt32BE(offset+8+length))
      throw new RangeError('PNG chunk CRC mismatch');
    const type=bytes.toString('ascii',offset+4,offset+8);
    const data=bytes.subarray(offset+8,offset+8+length);
    offset+=12+length;
    if(type==='IHDR') {
      if(seenHeader || length!==13) throw new TypeError('Invalid IHDR');
      seenHeader=true;
      width=data.readUInt32BE(0); height=data.readUInt32BE(4);
      bpp=data[9]===2?3:data[9]===6?4:0;
      if(data[8]!==8 || !bpp || data[10]!==0 || data[11]!==0 || data[12]!==0 ||
          !width || !height || width*height>MAX_PIXELS) throw new RangeError('Unsupported PNG dimensions or pixel format');
    } else if(type==='IDAT') {
      if(!seenHeader) throw new TypeError('IDAT before IHDR');
      compressed.push(data);
    } else if(type==='IEND') {
      if(length || !compressed.length) throw new TypeError('Invalid IEND');
      seenEnd=true;break;
    } else if(type==='PLTE' || type==='tRNS') {
      // Indexed PNG or alpha-policy ambiguity must not be quietly accepted.
      throw new RangeError('Palette/transparent PNG not supported');
    } else if(type[0]===type[0]?.toUpperCase()) {
      throw new RangeError('Unsupported critical PNG chunk '+type);
    }
  }
  if(!seenHeader || !seenEnd || offset!==bytes.length) throw new TypeError('Truncated/extra PNG data');
  const stride=width*bpp, expected=(stride+1)*height;
  const raw=inflateSync(Buffer.concat(compressed),{maxOutputLength:expected+1});
  if(raw.length!==expected) throw new RangeError('PNG scanline length mismatch');
  const rgb=new Uint8Array(width*height*3), prev=new Uint8Array(stride);
  let rowStart=0;
  for(let y=0;y<height;y++) {
    const filter=raw[rowStart++];
    if(filter>4) throw new RangeError('Unsupported PNG row filter');
    const row=new Uint8Array(stride);
    for(let x=0;x<stride;x++) {
      const left=x>=bpp?row[x-bpp]:0, up=prev[x], upperLeft=x>=bpp?prev[x-bpp]:0;
      const predictor=filter===0?0:filter===1?left:filter===2?up:
        filter===3?Math.floor((left+up)/2):paeth(left,up,upperLeft);
      row[x]=(raw[rowStart+x]+predictor)&255;
    }
    for(let x=0;x<width;x++) {
      if(bpp===4 && row[x*4+3]!==255) throw new RangeError('PNG contains non-opaque pixels');
      const out=(y*width+x)*3;
      rgb[out]=row[x*bpp]; rgb[out+1]=row[x*bpp+1]; rgb[out+2]=row[x*bpp+2];
    }
    prev.set(row);rowStart+=stride;
  }
  return {width,height,rgb};
}

const luminance = (rgb,k) => (54*rgb[k]+183*rgb[k+1]+19*rgb[k+2])/256;
const edge = (image,x,y) => {
  const {rgb,width}=image;
  const p=(y*width+x)*3, right=p+3, down=p+width*3;
  return Math.max(Math.abs(luminance(rgb,p)-luminance(rgb,right)),
    Math.abs(luminance(rgb,p)-luminance(rgb,down)))>=32;
};

/**
 * Measure one pixel region. Edges estimate visual structure, NOT a semantic
 * actor silhouette; center drift is an edge-centroid proxy, NOT camera pose.
 * @param {{width:number,height:number,rgb:Uint8Array}} web
 * @param {{width:number,height:number,rgb:Uint8Array}} native
 * @param {{x:number,y:number,width:number,height:number}} roi
 * @returns {object}
 */
export function measureDojoRoi(web,native,roi) {
  if(web.width!==native.width || web.height!==native.height ||
      ![roi.x,roi.y,roi.width,roi.height].every(validInt) ||
      !roi.width || !roi.height || roi.x+roi.width>web.width ||
      roi.y+roi.height>web.height) throw new RangeError('ROI or image dimensions mismatch');
  let rgbSum=0,lumSum=0,lumWeb=0,lumNative=0,edgeWeb=0,edgeNative=0,inter=0,union=0;
  let centerWX=0,centerWY=0,centerNX=0,centerNY=0;
  for(let y=roi.y;y<roi.y+roi.height;y++) for(let x=roi.x;x<roi.x+roi.width;x++) {
    const k=(y*web.width+x)*3;
    for(let c=0;c<3;c++) rgbSum+=Math.abs(web.rgb[k+c]-native.rgb[k+c]);
    const lw=luminance(web.rgb,k),ln=luminance(native.rgb,k);
    lumSum+=Math.abs(lw-ln);lumWeb+=lw;lumNative+=ln;
    const a=x<roi.x+roi.width-1 && y<roi.y+roi.height-1 && edge(web,x,y);
    const b=x<roi.x+roi.width-1 && y<roi.y+roi.height-1 && edge(native,x,y);
    if(a){edgeWeb++;centerWX+=x;centerWY+=y;}
    if(b){edgeNative++;centerNX+=x;centerNY+=y;}
    if(a&&b)inter++;
    if(a||b)union++;
  }
  const count=roi.width*roi.height;
  const drift=edgeWeb&&edgeNative?Math.hypot(centerWX/edgeWeb-centerNX/edgeNative,
    centerWY/edgeWeb-centerNY/edgeNative):null;
  return {
    pixelCount:count,rgbMae:rgbSum/(count*3),lumaMae:lumSum/count,
    webMeanLuma:lumWeb/count,nativeMeanLuma:lumNative/count,
    edgeCountWeb:edgeWeb,edgeCountNative:edgeNative,
    edgeIoU:union?inter/union:null,edgeCentroidDriftPx:drift,
    positionSemantics:'EDGE_PROXY_NOT_VERIFIED_OBJECT_POSITION',
    shapeSemantics:'EDGE_PROXY_NOT_INSTANCE_MASK',
  };
}

/**
 * Two real screenshot pairs (before/after), owner-provided provenance and
 * named pixel ROIs. File paths are relative to an owner-private manifest.
 * @param {object} manifest
 * @param {(relativePath:string)=>Buffer} readImage
 * @returns {object}
 */
export function assessDojoPixelPairs(manifest,readImage) {
  const make = (status,extra={})=>({status,nativeParityVerdict:'UNKNOWN',
    referenceAuthenticated:false,cameraIndependentlyVerified:false,
    nativeExecutionByThisTool:false,pngImagesPublished:false,...extra});
  const target=manifest?.target;
  if(manifest?.schemaVersion!==1 || !isRecord(target) ||
      target.game!=='SUPERHOT: MIND CONTROL DELETE' || target.scene!=='SHRL_Dojo2' ||
      target.sceneBuildIndex!==10 || target.serializedOwner!=='level10' ||
      !Array.isArray(manifest.pairs) || manifest.pairs.length!==2 ||
      manifest.pairs[0]?.id!=='before' || manifest.pairs[1]?.id!=='after' ||
      !Array.isArray(manifest.rois) || !manifest.rois.length || manifest.rois.length>12 ||
      new Set(manifest.rois.map(r=>r?.id)).size!==manifest.rois.length ||
      manifest.rois.some(r=>!sampleName(r?.id) || ![r?.x,r?.y,r?.width,r?.height].every(validInt) || !r.width || !r.height))
    return make(DOJO_PIXEL_STATUS.INVALID,{reason:'Dojo/build10 target, before/after pairs and bounded named ROIs required'});
  const pairs=[];
  for(const item of manifest.pairs) {
    if(!item || !validInt(item.webFrameId) ||
        !['owner-local-browser','owner-supplied-browser'].includes(item.webProvenance) ||
        item.nativeProvenance!=='owner-authorized-native' ||
        !['unknown','owner-declared-matched'].includes(item.cameraMatch) ||
        !['unknown','owner-declared-matched'].includes(item.timeMatch) ||
        ![item.webPng,item.nativePng].every(p=>typeof p==='string' &&
          /^[a-zA-Z0-9_.-]+\.png$/.test(p))) {
      return make(DOJO_PIXEL_STATUS.INVALID,{reason:'Missing owner provenance, frame ID or safe private PNG path'});
    }
    try {
      const web=decodeDojoPng(readImage(item.webPng)),native=decodeDojoPng(readImage(item.nativePng));
      const regions={};
      for(const roi of manifest.rois) regions[roi.id]=measureDojoRoi(web,native,roi);
      pairs.push({id:item.id,webFrameId:item.webFrameId,
        width:web.width,height:web.height,cameraMatch:item.cameraMatch,timeMatch:item.timeMatch,regions});
    } catch(error) {
      return make(DOJO_PIXEL_STATUS.INCOMPLETE,{reason:item.id+': '+error.message});
    }
  }
  if(pairs[0].width!==pairs[1].width || pairs[0].height!==pairs[1].height ||
      pairs[0].webFrameId>=pairs[1].webFrameId)
    return make(DOJO_PIXEL_STATUS.INVALID,{reason:'Different viewport dimensions or nonmonotonic Web frame IDs'});
  const temporal={};
  for(const roi of manifest.rois) {
    const old=pairs[0].regions[roi.id],now=pairs[1].regions[roi.id];
    const webDelta=now.webMeanLuma-old.webMeanLuma;
    const nativeDelta=now.nativeMeanLuma-old.nativeMeanLuma;
    temporal[roi.id]={webLuminanceChange:webDelta,nativeLuminanceChange:nativeDelta,
      differentialLuminanceError:Math.abs(webDelta-nativeDelta)};
  }
  return make(DOJO_PIXEL_STATUS.MEASURED,{
    evidence:'OWNER_SUPPLIED_PRIVATE_SCREENSHOTS_UNAUTHENTICATED',
    cameraMatching:manifest.pairs.every(p=>p.cameraMatch==='owner-declared-matched')
      ? 'OWNER_DECLARED_NOT_INDEPENDENTLY_VERIFIED' : 'UNKNOWN',
    timeMatching:manifest.pairs.every(p=>p.timeMatch==='owner-declared-matched')
      ? 'OWNER_DECLARED_NOT_INDEPENDENTLY_VERIFIED' : 'UNKNOWN',
    roiSemantics:'USER_LABELED_NOT_OBJECT_SEGMENTATION',pairs,temporal,
  });
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const i=process.argv.indexOf('--manifest');
  if(i<0 || !process.argv[i+1]) {
    process.stderr.write('Usage: node scripts/acceptance-dojo-pixels.mjs --manifest private/dojo-pixel-pairs.json\n');
    process.exitCode=2;
  } else try {
    const path=resolve(process.argv[i+1]);
    const manifest=JSON.parse(readFileSync(path,'utf8'));
    const root=dirname(path);
    const readImage=name=>{
      if(!/^[a-zA-Z0-9_.-]+\.png$/.test(name) ||
          isAbsolute(name) || relative(root,resolve(root,name)).startsWith('..'))
        throw new TypeError('Private PNG basename only');
      return readFileSync(resolve(root,name));
    };
    const result=assessDojoPixelPairs(manifest,readImage);
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
    if(result.status!==DOJO_PIXEL_STATUS.MEASURED) process.exitCode=2;
  } catch(error) {
    process.stderr.write('Private Dojo pixel report unavailable: '+error.message+'\n');
    process.exitCode=2;
  }
}
