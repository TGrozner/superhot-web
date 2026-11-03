import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCylinderMesh } from '../src/render/mesh-format.js';
import { uploadIndexedMesh } from '../src/render/gpu-mesh.js';

// Counts WebGL submissions, not actual GPU time, pixels or observed FPS.
function mockWebGL2() {
  const calls = []; let vao = 'beforeVAO', buffer = 'beforeArray', next = 0;
  const attrs = ['aPosition','aNormal','aUV','aInstanceModel0',
    'aInstanceModel1','aInstanceModel2','aInstanceModel3',
    'aInstanceNormal0','aInstanceNormal1','aInstanceNormal2'];
  const gl = {
    STATIC_DRAW:35044,DYNAMIC_DRAW:35048,ARRAY_BUFFER:34962,ELEMENT_ARRAY_BUFFER:34963,
    ARRAY_BUFFER_BINDING:34964,VERTEX_ARRAY_BINDING:34229,FLOAT:5126,
    UNSIGNED_SHORT:5123,UNSIGNED_INT:5125,TRIANGLES:4,
    getParameter(p) { return p===this.VERTEX_ARRAY_BINDING?vao:p===this.ARRAY_BUFFER_BINDING?buffer:null; },
    getAttribLocation(_p,n) { return attrs.indexOf(n); },
    createVertexArray() { return 'vao'+ ++next; },
    createBuffer() { return 'buf'+ ++next; },
    deleteVertexArray(v) { calls.push(['deleteVAO',v]); },
    deleteBuffer(v) { calls.push(['deleteBuffer',v]); },
    bindVertexArray(v) { vao=v;calls.push(['bindVAO',v]); },
    bindBuffer(k,v) { if(k===this.ARRAY_BUFFER)buffer=v;calls.push(['bindBuffer',k,v]); },
    bufferData(k,data,usage) { calls.push(['bufferData',k,typeof data==='number'?data:data.length,usage]); },
    bufferSubData(k,o,data) { calls.push(['bufferSubData',k,o,new Float32Array(data)]); },
    enableVertexAttribArray(p) { calls.push(['enable',p]); },
    vertexAttribPointer(...a) { calls.push(['pointer',...a]); },
    vertexAttribDivisor(...a) { calls.push(['divisor',...a]); },
    drawElements(...a) { calls.push(['drawElements',...a]); },
    drawElementsInstanced(...a) { calls.push(['drawElementsInstanced',...a]); },
  };return {gl,calls};
}
const model=(x,sx=2)=>[sx,0,0,0,0,1,0,0,0,0,0.5,0,x,0,0,1];

test('SH-12/J4: 48 transformed non-cubic cylinders share geometry, submit 1 instanced draw',()=>{
  const {gl,calls}=mockWebGL2();
  const mesh=makeCylinderMesh({segments:12,radius:0.25,height:1.6});
  const gpu=uploadIndexedMesh(gl,'base',mesh);
  const batch=gpu.createInstancedBatch('instanced',{capacity:48,requireUV:true});
  assert.equal(calls.filter(c=>c[0]==='bufferData').length,3,'shared VBO/EBO + one instance VBO');
  assert.deepEqual(calls.filter(c=>c[0]==='divisor'),Array.from({length:7},(_,i)=>['divisor',i+3,1]));
  assert.ok(calls.some(c=>c[0]==='pointer'&&c[1]===9&&c[6]===88));
  assert.equal(gl.getParameter(gl.VERTEX_ARRAY_BINDING),'beforeVAO');
  assert.equal(gl.getParameter(gl.ARRAY_BUFFER_BINDING),'beforeArray');
  batch.setMatrices(Array.from({length:48},(_,i)=>model(i)));
  const uploaded=calls.find(c=>c[0]==='bufferSubData')[3];
  assert.equal(uploaded.length,48*25);
  assert.deepEqual(Array.from(uploaded.slice(16,25)),[0.5,0,0,0,1,0,0,0,2],
    'inverse-transpose normals for nonuniform scaled mesh');
  assert.deepEqual(batch.draw({firstIndex:0,indexCount:6}),{drawCalls:1,instances:48,triangles:96});
  assert.deepEqual(calls.filter(c=>c[0]==='drawElementsInstanced'),[
    ['drawElementsInstanced',gl.TRIANGLES,6,gl.UNSIGNED_SHORT,0,48],
  ]);
  batch.draw(); // Drawing the same GPU buffer never re-uploads matrices.
  const same = Array.from({length:48},(_,i)=>model(i));
  batch.setMatrices(same); // Rebuilding an identical world list also skips GPU upload.
  assert.equal(calls.filter(c=>c[0]==='bufferSubData').length,1);
  same[20] = model(420); // Translation only: upload 12 B; normals/model basis are unchanged.
  batch.setMatrices(same);
  const movedUploads = calls.filter(c=>c[0]==='bufferSubData');
  assert.equal(movedUploads.length,2);
  assert.equal(movedUploads[1][2],20*100 + 48);
  assert.equal(movedUploads[1][3].length,3);
  assert.equal(movedUploads[1][3][0],420);
  batch.setMatrices(same.slice(0,18)); // Shrinking needs no transfer.
  assert.equal(calls.filter(c=>c[0]==='bufferSubData').length,2);
  batch.setMatrices(same); // Regrowing uploads records no longer in active range.
  const grownUploads = calls.filter(c=>c[0]==='bufferSubData');
  assert.equal(grownUploads.length,3);
  assert.equal(grownUploads[2][2],18*100);
  assert.equal(grownUploads[2][3].length,30*25);
  const sparse = same.slice();
  sparse[0] = model(700);
  sparse[47] = model(900);
  batch.setMatrices(sparse); // Two distant moving bodies: 24 bytes, no extra GL calls.
  const sparseUploads = calls.filter(c=>c[0]==='bufferSubData').slice(3);
  assert.deepEqual(sparseUploads.map(c=>[c[2],c[3].length]),[[48,3],[4748,3]]);
  assert.equal(sparseUploads[0][3][0],700);
  assert.equal(sparseUploads[1][3][0],900);
  const dense = sparse.map((_,i)=>model(1000+i));
  batch.setMatrices(dense); // Every instance moves: still one GL transfer.
  const allUploads = calls.filter(c=>c[0]==='bufferSubData');
  assert.equal(allUploads.length,6);
  assert.equal(allUploads[5][2],0);
  assert.equal(allUploads[5][3].length,48*25);
  const scaled = dense.slice();
  scaled[20] = model(1020, 3); // Non-translation affine change must upload normals too.
  batch.setMatrices(scaled);
  const scaleUpload = calls.filter(c=>c[0]==='bufferSubData').at(-1);
  assert.equal(scaleUpload[2],20*100);
  assert.equal(scaleUpload[3].length,25);
  assert.ok(Math.abs(scaleUpload[3][16] - 1/3) < 1e-6);
  batch.setMatrices([]);
  assert.deepEqual(batch.draw(),{drawCalls:0,instances:0,triangles:0});
  gpu.dispose();
  assert.equal(calls.filter(c=>c[0]==='deleteVAO').length,2);
  assert.equal(calls.filter(c=>c[0]==='deleteBuffer').length,3);
  assert.throws(()=>batch.draw(),/disposed/);
});
test('SH-12/J4: winding and singular matrix validation is atomic',()=>{
  const {gl,calls}=mockWebGL2();
  const gpu=uploadIndexedMesh(gl,'base',makeCylinderMesh());
  const batch=gpu.createInstancedBatch('instanced',{capacity:3});
  batch.setMatrices([model(0)]);
  const uploads=calls.filter(c=>c[0]==='bufferSubData').length;
  assert.throws(()=>batch.setMatrices([model(0),model(1,-2)]),/Mixed mirrored/);
  assert.throws(()=>batch.setMatrices([model(0,0)]),/Singular/);
  assert.throws(()=>batch.setMatrices(Array.from({length:4},(_,i)=>model(i))),/capacity/);
  assert.equal(batch.instanceCount,1);
  assert.equal(calls.filter(c=>c[0]==='bufferSubData').length,uploads);
  batch.setMatrices([model(0,-2)]);
  assert.equal(batch.mirrored,true);
  assert.throws(()=>batch.draw({firstIndex:1,indexCount:4}),/Invalid/);
  batch.dispose();batch.dispose();gpu.dispose();
  assert.equal(calls.filter(c=>c[0]==='deleteVAO').length,2);
});
