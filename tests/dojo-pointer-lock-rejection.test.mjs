import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Browser entrypoint cannot be imported in Node; execute the actual request
// handler with its focus, document, state and pause dependencies controlled.
const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const request=source.match(/function requestMouse\(\) \{[\s\S]*?\n\}(?=\nfunction start\()/)?.[0];

test('Dojo pointer-lock rejection pauses rather than running an unwinnable combat clock',async()=>{
  assert.ok(request,'the actual browser pointer-lock request function must be tested');
  const state={screen:'playing'};
  let focused=0,pauses=0;
  const canvas={focus:()=>{focused++;},requestPointerLock:()=>Promise.reject(new Error('denied'))};
  const document={pointerLockElement:null};
  const sandbox={canvas,document,state,pause:()=>{pauses++;state.screen='paused';}};
  runInNewContext(`${request}\nglobalThis.tryLock=requestMouse;`,sandbox);
  sandbox.tryLock();
  await Promise.resolve();
  assert.equal(focused,1);
  assert.equal(pauses,1,'a Promise rejection cannot leave enemies/clock running');
  sandbox.tryLock();
  await Promise.resolve();
  assert.equal(pauses,1,'already paused refusal is idempotent');

  state.screen='playing';
  canvas.requestPointerLock=()=>{throw new Error('legacy denied');};
  sandbox.tryLock();
  assert.equal(pauses,2,'synchronous refusal also pauses');

  state.screen='playing';
  canvas.requestPointerLock=()=>Promise.resolve();
  document.pointerLockElement=canvas;
  sandbox.tryLock();
  await Promise.resolve();
  assert.equal(pauses,2,'a granted lock does not pause');
  assert.equal(focused,4);
});
