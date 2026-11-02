import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGeneratedDiagnosticEnemyRig, poseCharacterRig } from '../src/characters/rig.js';
import { makeGeneratedDiagnosticEnemyMeshes } from '../src/characters/generated-meshes.js';
import { createCharacterIndexedPass } from '../src/characters/indexed-pass.js';

function mockGl() {
  const calls = [];
  let vao = 'original-vao', arrayBuffer = 'original-array', program = 'original-program';
  let winding = 2305, next = 0;
  const gl = {
    STATIC_DRAW: 35044, FLOAT: 5126, ARRAY_BUFFER: 34962, ELEMENT_ARRAY_BUFFER: 34963,
    TRIANGLES: 4, UNSIGNED_SHORT: 5123, UNSIGNED_INT: 5125,
    VERTEX_ARRAY_BINDING: 34229, ARRAY_BUFFER_BINDING: 34964, CURRENT_PROGRAM: 35725,
    FRONT_FACE: 2886, CULL_FACE: 2884, CW: 2304, CCW: 2305,
    createVertexArray: () => 'vao-' + ++next,
    createBuffer: () => 'buffer-' + ++next,
    bindVertexArray: (v) => { vao = v; calls.push(['bindVAO', v]); },
    bindBuffer: (type, b) => { if (type === 34962) arrayBuffer = b; },
    bufferData: () => {},
    enableVertexAttribArray: () => {},
    vertexAttribPointer: () => {},
    getAttribLocation: (_program, key) => ({ aPosition: 0, aNormal: 1, aUV: -1 })[key],
    getParameter: (key) => ({
      34229: vao, 34964: arrayBuffer, 35725: program, 2886: winding,
    })[key],
    isEnabled: key => key === 2884,
    frontFace: (value) => { winding = value; calls.push(['frontFace', value]); },
    useProgram: (p) => { program = p; calls.push(['useProgram', p]); },
    uniform1i: () => {},
    uniformMatrix4fv: () => {},
    uniformMatrix3fv: () => {},
    uniform4f: () => {},
    drawElements: (_kind, count, _type, offset) => calls.push(['draw', count, offset, winding]),
    deleteVertexArray: () => calls.push(['deleteVAO']),
    deleteBuffer: () => calls.push(['deleteBuffer']),
  };
  return { gl, calls, snapshot: () => ({ vao, program, winding }) };
}

test('indexed character pass uploads once and draws posed SH-12 meshes, restoring GL state', () => {
  const { gl, calls, snapshot } = mockGl();
  const uniforms = { uUseAffine: {}, uAffineModel: {}, uAffineNormal: {}, uColor: {} };
  const pass = createCharacterIndexedPass(gl, 'existing-sh05-program', uniforms,
    makeGeneratedDiagnosticEnemyMeshes());
  assert.equal(pass.getMeshCount(), 3);
  const before = snapshot();
  const pose = poseCharacterRig(makeGeneratedDiagnosticEnemyRig());
  const report = pass.draw(pose.packets);
  assert.equal(report.drawCalls, 11);
  assert.ok(report.triangles > 500);
  assert.equal(calls.filter(c => c[0] === 'draw').length, 11);
  assert.deepEqual(snapshot(), before);
  assert.match(report.geometryProvenance, /generated-only/);
  pass.dispose();
  pass.dispose();
  assert.equal(pass.getMeshCount(), 0);
  assert.equal(calls.filter(c => c[0] === 'deleteVAO').length, 3);
  assert.throws(() => pass.draw(pose.packets), /disposed/);
});

test('mirrored root reverses winding per packet and restores caller winding', () => {
  const { gl, calls, snapshot } = mockGl();
  const pass = createCharacterIndexedPass(gl, 'host-program',
    { uUseAffine: {}, uAffineModel: {}, uAffineNormal: {}, uColor: {} },
    makeGeneratedDiagnosticEnemyMeshes());
  const mirror = [-1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  pass.draw(poseCharacterRig(makeGeneratedDiagnosticEnemyRig(), { rootMatrix: mirror }).packets);
  assert.ok(calls.filter(c => c[0] === 'draw').every(c => c[3] === gl.CW));
  assert.equal(snapshot().winding, gl.CCW);
  pass.dispose();
});

test('unresolved material and missing mesh are hard errors, not silent native guesses', () => {
  const { gl, snapshot } = mockGl();
  const pass = createCharacterIndexedPass(gl, 'host-program',
    { uUseAffine: {}, uAffineModel: {}, uAffineNormal: {}, uColor: {} },
    makeGeneratedDiagnosticEnemyMeshes());
  const packet = poseCharacterRig(makeGeneratedDiagnosticEnemyRig()).packets[0];
  const before = snapshot();
  assert.throws(() => pass.draw([{ ...packet, materialKey: 'unverified-native-material' }]),
    /unqualified/);
  assert.throws(() => pass.draw([{ ...packet, meshId: 'unverified-game-mesh' }]), /Missing source-neutral/);
  assert.deepEqual(snapshot(), before);
  pass.dispose();
});
