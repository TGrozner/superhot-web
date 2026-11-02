/**
 * SH-10 MCD visual acceptance: actual Chromium canvas PNGs + strictly paired
 * PRIVATE native PNGs. This tool publishes no originals and never certifies 1:1.
 * Node >=22; manual opt-in only; not used by CI.
 */
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve, relative, isAbsolute, join, basename } from 'node:path';
import { inflateSync } from 'node:zlib';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isInside = (p, base = ROOT) => { const d = relative(base, resolve(p)); return !d || (!d.startsWith('..') && !isAbsolute(d)); };
const hash = (b) => createHash('sha256').update(b).digest('hex');
const number = (v) => typeof v === 'number' && Number.isFinite(v);
const present = (v) => typeof v === 'string' && v.trim().length > 0;
const MAX_PIXELS = 12_000_000;

export function decodePng(raw) {
  const b = Buffer.from(raw);
  if (b.length < 32 || !b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw Error('PNG signature');
  let pos = 8, width = 0, height = 0, channels = 0, ended = false;
  const parts = [];
  while (pos + 12 <= b.length) {
    const n = b.readUInt32BE(pos);
    if (n > b.length - pos - 12) throw Error('PNG truncated');
    const kind = b.toString('ascii', pos + 4, pos + 8);
    const data = b.subarray(pos + 8, pos + 8 + n);
    pos += 12 + n;
    if (kind === 'IHDR') {
      if (width || n !== 13) throw Error('PNG IHDR');
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      if (!width || !height || width * height > MAX_PIXELS || data[8] !== 8 || ![2,6].includes(data[9]) || data[10] || data[11] || data[12]) throw Error('PNG format: 8-bit noninterlaced RGB/RGBA only');
      channels = data[9] === 6 ? 4 : 3;
    } else if (kind === 'IDAT') parts.push(data);
    else if (kind === 'IEND') { ended = true; break; }
  }
  if (!width || !ended || !parts.length) throw Error('PNG required chunks');
  const stride = width * channels;
  const rows = inflateSync(Buffer.concat(parts), { maxOutputLength: (stride + 1) * height });
  if (rows.length !== (stride + 1) * height) throw Error('PNG invalid rows');
  const rgba = new Uint8Array(width * height * 4);
  let cursor = 0, prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = rows[cursor++], row = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? row[x-channels] : 0;
      const u = prev[x], ul = x >= channels ? prev[x-channels] : 0;
      let p = 0;
      if (filter === 1) p = a;
      else if (filter === 2) p = u;
      else if (filter === 3) p = Math.floor((a + u)/2);
      else if (filter === 4) {
        const v = a+u-ul, da=Math.abs(v-a), du=Math.abs(v-u), dul=Math.abs(v-ul);
        p = da <= du && da <= dul ? a : du <= dul ? u : ul;
      } else if (filter !== 0) throw Error('PNG unsupported filter');
      row[x] = (rows[cursor++] + p) & 255;
    }
    for (let x = 0; x < width; x++) {
      const from = x*channels, to = (y*width+x)*4;
      rgba[to] = row[from]; rgba[to+1] = row[from+1]; rgba[to+2] = row[from+2];
      rgba[to+3] = channels === 4 ? row[from+3] : 255;
      if (rgba[to+3] !== 255) throw Error('PNG must be opaque');
    }
    prev = row;
  }
  return { width, height, rgba };
}

const luma = (p, i) => .2126*p[i]+.7152*p[i+1]+.0722*p[i+2];
export function metrics(a, b, roi = [0,0,1,1]) {
  if (a.width !== b.width || a.height !== b.height) throw Error('Viewport mismatch');
  if (!Array.isArray(roi) || roi.length !== 4 || roi.some((x) => !number(x)) || roi[0]<0 || roi[1]<0 || roi[2]<=0 || roi[3]<=0 || roi[0]+roi[2]>1 || roi[1]+roi[3]>1) throw Error('ROI outside viewport');
  const x0=Math.floor(roi[0]*a.width),y0=Math.floor(roi[1]*a.height);
  const x1=Math.ceil((roi[0]+roi[2])*a.width),y1=Math.ceil((roi[1]+roi[3])*a.height);
  const feat=(img)=>{
    let cnt=0,lr=0,lg=0,lb=0,lum=0,cx=0,cy=0; const edge=new Set();
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
      const i=(y*img.width+x)*4, L=luma(img.rgba,i);
      lr+=img.rgba[i];lg+=img.rgba[i+1];lb+=img.rgba[i+2];lum+=L;cnt++;
      const right=x+1<x1?luma(img.rgba,i+4):L;
      const down=y+1<y1?luma(img.rgba,i+4*img.width):L;
      if(Math.max(Math.abs(L-right),Math.abs(L-down))>=28){edge.add(y*img.width+x);cx+=x;cy+=y;}
    }
    const rgb=[lr/cnt,lg/cnt,lb/cnt],sum=rgb.reduce((s,v)=>s+v,0);
    return {chroma:sum?rgb.map(v=>v/sum):[0,0,0],lum:lum/cnt,edge,centroid:edge.size?[cx/edge.size,cy/edge.size]:null};
  };
  const p=feat(a),q=feat(b);
  const near=(index, set)=>{if(set.has(index))return true;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(set.has(index+dy*a.width+dx))return true;
    return false;};
  let pa=0,pb=0;
  for(const i of p.edge)if(near(i,q.edge))pa++;
  for(const i of q.edge)if(near(i,p.edge))pb++;
  const precision=p.edge.size?pa/p.edge.size:(q.edge.size?0:1);
  const recall=q.edge.size?pb/q.edge.size:(p.edge.size?0:1);
  return { positionPx:p.centroid&&q.centroid?Math.hypot(p.centroid[0]-q.centroid[0],p.centroid[1]-q.centroid[1]):null,
    shapeEdgeF1:precision+recall?2*precision*recall/(precision+recall):0,
    chromaL1:p.chroma.reduce((v,x,i)=>v+Math.abs(x-q.chroma[i]),0),
    luminanceDelta:Math.abs(p.lum-q.lum), edgePixels:[p.edge.size,q.edge.size] };
}

const cameraOK = (c) => c?.source==='RUNTIME_OBSERVED' && ['x','y','z','yaw','pitch','fovYDegrees'].every(k=>number(c[k]));
const maxCameraDiff = (a,b) => ({position:Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z),angle:Math.hypot(a.yaw-b.yaw,a.pitch-b.pitch),fov:Math.abs(a.fovYDegrees-b.fovYDegrees)});

/** Private local capture path and thresholds are *operator attestations*, not independent native certification. */
export function compare(web, native, opts = {}) {
  const reasons=[];
  if (web?.schemaVersion!==1 || native?.schemaVersion!==1) reasons.push('SCHEMA_UNKNOWN');
  if (web?.captureKind!=='ACTUAL_BROWSER_CDP_PNG' || web?.syntheticFixture===true) reasons.push('WEB_NOT_VERIFIED');
  if(native?.captureKind!=='OPERATOR_ATTESTED_NATIVE_MCD_PNG' || native?.game!=='SUPERHOT: MIND CONTROL DELETE' || native?.build!=='20299547' || !present(native?.observationId) || native?.syntheticFixture===true) reasons.push('NATIVE_UNVERIFIED');
  if(web?.scene?.binding!=='ACTIVE_SCENE_PROVEN' || native?.scene?.binding!=='ACTIVE_SCENE_PROVEN' || !present(web?.scene?.key) || web.scene.key!==native.scene.key) reasons.push('ACTIVE_SCENE_UNPAIRED');
  if(!cameraOK(web?.camera) || !cameraOK(native?.camera) || !present(web?.coordinateFrameId) || web.coordinateFrameId!==native.coordinateFrameId) reasons.push('CAMERA_UNPAIRED');
  if(!present(web?.stimulusId) || web.stimulusId!==native?.stimulusId || !present(web?.initialStateId) || web.initialStateId!==native?.initialStateId) reasons.push('STIMULUS_UNPAIRED');
  if(!number(web?.timeScale) || !number(native?.timeScale) || web.timeScale!==native.timeScale) reasons.push('TIME_DOMAIN_UNPAIRED');
  if(!web?.viewport || !native?.viewport || web.viewport.width!==native.viewport.width || web.viewport.height!==native.viewport.height || web.viewport.dpr!==native.viewport.dpr) reasons.push('VIEWPORT_UNPAIRED');
  if(!Array.isArray(web?.frames) || !Array.isArray(native?.frames) || web.frames.length!==2 || native.frames.length!==2 || web.frames.some((f,i)=>!present(f.file)||!number(f.tMs)||!present(f.phase)||f.phase!==native.frames[i]?.phase)) reasons.push('FRAMES_UNPAIRED');
  if(!Array.isArray(native?.regions) || native.regions.length===0 || native.regions.some(r=>!present(r.id))) reasons.push('ROI_UNKNOWN');
  const fields=['positionPx','shapeEdgeF1','chromaL1','luminanceDelta','temporalLuma','timingMs','cameraPosition','cameraAngle','cameraFov'];
  const tolerances=opts.thresholds;
  if(!tolerances || fields.some(k=>!number(tolerances[k])||tolerances[k]<0) || tolerances.shapeEdgeF1>1) reasons.push('TOLERANCES_UNKNOWN');
  const outcome={status:'INCONNU',nativeParityCertified:false,reasons,regions:[],browserMeasured:web?.captureKind==='ACTUAL_BROWSER_CDP_PNG'};
  if(reasons.length) return outcome;
  const pose=maxCameraDiff(web.camera,native.camera);
  if(pose.position>tolerances.cameraPosition || pose.angle>tolerances.cameraAngle || pose.fov>tolerances.cameraFov) return {...outcome,status:'NON_COMPARABLE_CAMERA_POSE',camera:pose};
  const load=(m,path)=>m.frames.map(f=>{
    const png=resolve(dirname(path),f.file);
    if(!existsSync(png))throw Error('PNG missing '+basename(png));
    const raw=readFileSync(png); const image=decodePng(raw);
    if(image.width!==m.viewport.width || image.height!==m.viewport.height)throw Error('PNG viewport mismatch');
    return {image,tMs:f.tMs,sha256:hash(raw)};
  });
  const wf=load(web,opts.webPath),nf=load(native,opts.nativePath);
  const drift=wf.map((f,i)=>Math.abs(f.tMs-nf[i].tMs));
  const temporal=(f,g,rect)=>{
    const x0=Math.floor(rect[0]*f.width),y0=Math.floor(rect[1]*f.height);
    const x1=Math.ceil((rect[0]+rect[2])*f.width),y1=Math.ceil((rect[1]+rect[3])*f.height);
    let s=0,n=0;for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
      const i=(y*f.width+x)*4;s+=Math.abs(luma(f.rgba,i)-luma(g.rgba,i));n++;
    }return s/n;
  };
  const exceeded=[];
  if(drift.some(d=>d>tolerances.timingMs))exceeded.push('timing');
  for(const region of native.regions){
    const frames=wf.map((f,i)=>metrics(f.image,nf[i].image,region.rect));
    const temporalError=Math.abs(temporal(wf[0].image,wf[1].image,region.rect)-temporal(nf[0].image,nf[1].image,region.rect));
    outcome.regions.push({id:region.id,frames,temporalError});
    if(frames.some(r=>r.positionPx===null||r.positionPx>tolerances.positionPx))exceeded.push(region.id+':position');
    if(frames.some(r=>r.shapeEdgeF1<tolerances.shapeEdgeF1))exceeded.push(region.id+':shape');
    if(frames.some(r=>r.chromaL1>tolerances.chromaL1))exceeded.push(region.id+':color');
    if(frames.some(r=>r.luminanceDelta>tolerances.luminanceDelta))exceeded.push(region.id+':light');
    if(temporalError>tolerances.temporalLuma)exceeded.push(region.id+':temporal');
  }
  return {...outcome,status:exceeded.length?'MEASURED_VISIBLE_GAP':'OPERATOR_THRESHOLDS_MET_NOT_CERTIFIED',camera:pose,timingErrorsMs:drift,exceeded};
}

class Devtools {
  constructor(ws){this.ws=ws;this.id=0;this.pending=new Map();ws.onmessage=({data})=>{
    const m=JSON.parse(String(data)),p=this.pending.get(m.id);if(!p)return;
    this.pending.delete(m.id);if(m.error)p.reject(Error(m.error.message));else p.resolve(m.result||{});
  };}
  call(method,params={}){const id=++this.id;return new Promise((resolve,reject)=>{
    this.pending.set(id,{resolve,reject});this.ws.send(JSON.stringify({id,method,params}));
  });}
  async eval(js){const r=await this.call('Runtime.evaluate',{expression:js,returnByValue:true,awaitPromise:true});
    if(r.exceptionDetails)throw Error('Browser evaluation failed');return r.result?.value;}
}

export async function captureWeb(url,out,{chrome=process.env.CHROME_BIN||'chromium',holdMs=300}={}){
  if(typeof WebSocket!=='function')throw Error('Node >=22 required');
  if(!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url))throw Error('Local HTTP URL required');
  if(!out||isInside(out))throw Error('Capture directory must remain outside public checkout');
  const profile=join(tmpdir(),'sh10-chrome-'+process.pid+'-'+Date.now());mkdirSync(profile,{recursive:true});
  const child=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
  let procError;child.on('error',e=>{procError=e});let cdp;
  try{
    let port=0;for(let i=0;i<100;i++){
      const path=join(profile,'DevToolsActivePort');if(existsSync(path)){port=Number(readFileSync(path,'utf8').split('\n')[0]);break;}
      if(procError)throw procError;if(child.exitCode!==null)throw Error('Chromium failed');await sleep(100);
    }
    if(!port)throw Error('Chrome CDP unavailable');
    const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
    const page=targets.find(t=>t.type==='page');if(!page)throw Error('No Chromium page');
    const ws=new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej;});cdp=new Devtools(ws);
    await cdp.call('Page.enable');await cdp.call('Runtime.enable');
    await cdp.call('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
    const nav=await cdp.call('Page.navigate',{url});if(nav.errorText)throw Error('Navigation blocked: '+nav.errorText);
    let ready=false;for(let i=0;i<100;i++){
      ready=await cdp.eval("document.readyState==='complete'&&!!document.querySelector('#scene')");
      if(ready)break;await sleep(100);
    }if(!ready)throw Error('Web game canvas missing');
    await cdp.eval("document.querySelector('#start-button')?.click()");await sleep(300);
    const observation="(()=>{const c=document.querySelector('#scene'),r=c.getBoundingClientRect(),g=c.getContext('webgl2');return {playing:document.querySelector('#hud')?.hidden===false,webgl2:!!g,rect:{x:r.x,y:r.y,width:r.width,height:r.height},viewport:{width:c.width,height:c.height,dpr:devicePixelRatio},room:document.querySelector('#room-name')?.textContent?.trim(),performance:window.__superhotSceneMetrics||null,hook:typeof window.__sh10AcceptanceSnapshot==='function'?window.__sh10AcceptanceSnapshot():null};})()";
    const first=await cdp.eval(observation);if(!first?.playing||!first?.webgl2)throw Error('Active WebGL2 game not observed');
    mkdirSync(out,{recursive:true});const frames=[];const begin=Date.now();
    const snap=async(name)=>{
      const state=await cdp.eval(observation),rect=state.rect;
      if(!state.playing)throw Error('Gameplay not active');
      const result=await cdp.call('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false,clip:{...rect,scale:1}});
      const buf=Buffer.from(result.data,'base64'),image=decodePng(buf),file=name+'.png';
      writeFileSync(join(out,file),buf);frames.push({file,tMs:Date.now()-begin,phase:'displayed-frame',width:image.width,height:image.height,sha256:hash(buf)});
      return state;
    };
    await snap('idle');
    await cdp.call('Input.dispatchKeyEvent',{type:'keyDown',key:'w',code:'KeyW',windowsVirtualKeyCode:87});
    await sleep(holdMs);await cdp.call('Input.dispatchKeyEvent',{type:'keyUp',key:'w',code:'KeyW',windowsVirtualKeyCode:87});
    await sleep(60);const after=await snap('after-keyw');
    const hook=after.hook,scene=hook?.scene?.binding==='ACTIVE_SCENE_PROVEN'?hook.scene:{key:null,binding:'WEB_PROXY_OR_UNKNOWN',room:after.room};
    const manifest={schemaVersion:1,captureKind:'ACTUAL_BROWSER_CDP_PNG',scene,camera:cameraOK(hook?.camera)?hook.camera:null,
      coordinateFrameId:hook?.coordinateFrameId||null,stimulusId:'IDLE_THEN_KEYW_'+holdMs+'MS',initialStateId:hook?.initialStateId||null,
      timeScale:number(hook?.timeScale)?hook.timeScale:null,viewport:{width:frames[0].width,height:frames[0].height,dpr:1},frames,
      performance:after.performance,notes:'Web actual CDP pixels. Proxy NOT native paired. Native reference remains private.'};
    writeFileSync(join(out,'web-capture.json'),JSON.stringify(manifest,null,2)+'\n');return manifest;
  }finally{if(cdp)cdp.ws.close();child.kill();await sleep(200);rmSync(profile,{recursive:true,force:true,maxRetries:3});}
}

const arg=(a,k)=>{const i=a.indexOf(k);return i<0?null:a[i+1]};
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const a=process.argv.slice(2);if(a.includes('--capture-web')){
      const out=arg(a,'--out')||join(tmpdir(),'sh10-web-'+Date.now());
      const m=await captureWeb(arg(a,'--url'),out,{chrome:arg(a,'--chrome')||undefined});
      process.stdout.write(JSON.stringify({status:'BROWSER_CAPTURED_NATIVE_UNPAIRED',out,frames:m.frames,scene:m.scene,performance:m.performance},null,2)+'\n');
    }else{
      const wp=arg(a,'--web'),np=arg(a,'--native');if(!wp||!np)throw Error('Use --capture-web --url http://localhost:PORT/?scene=containers --out /tmp/capture OR --web /tmp/web-capture.json --native /private/native.json --thresholds /private/thresholds.json [--gate]');
      if(isInside(np))throw Error('Native reference must be outside public repo');
      const limits=arg(a,'--thresholds');
      const result=compare(JSON.parse(readFileSync(wp,'utf8')),JSON.parse(readFileSync(np,'utf8')),
        {webPath:wp,nativePath:np,thresholds:limits?JSON.parse(readFileSync(limits,'utf8')):null});
      process.stdout.write(JSON.stringify(result,null,2)+'\n');
      if(a.includes('--gate')&&result.status!=='OPERATOR_THRESHOLDS_MET_NOT_CERTIFIED')process.exitCode=2;
    }
  }catch(e){process.stderr.write('SH-10: '+e.message+'\n');process.exitCode=2;}
}
