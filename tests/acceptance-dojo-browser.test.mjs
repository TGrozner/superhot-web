import test from 'node:test';
import assert from 'node:assert/strict';
import { startDojoCapture, inspectDojoCaptureReadiness, DOJO_ROUTE_HOTKEYS } from '../scripts/acceptance-dojo-browser.mjs';

function mockBrowser() {
  const listeners = new Map();
  let seq=1, intervalCallback=null, cleared=false, screen='playing';
  const source={scenePath:'Assets/Scenes/SHRL_Dojo2.unity',sceneBuildIndex:10,serializedOwner:'level10'};
  const snapshot=()=>({frameId:seq,activeScreen:screen,worldClock:seq*.1,
    nativeScene:{source},gameplay:{encounter:{killed:0,killTarget:6,enemies:[]},
      weapon:true,ammo:6,heldItem:null,items:[{id:'cup-1',name:'PRIVATE_NAME',state:'static'},
        {id:'cup-2',name:'PRIVATE_NAME',state:'held'}],originalFragmentCount:2,
      audio:{sceneAmbienceSources:3,assets:{PRIVATE:'not serialized'}},
      feet:{x:0,y:0,z:0},grounded:true}});
  const fakeWindow={
    __superhotGetRenderedFrameSnapshot:snapshot,
    setInterval(callback){intervalCallback=callback;return 123;},
    clearInterval(id){assert.equal(id,123);cleared=true;},
    setTimeout(callback){callback();},
    addEventListener(type,callback){listeners.set(type,callback);},
    removeEventListener(type){listeners.delete(type);},
  };
  globalThis.window=fakeWindow;
  globalThis.document={createElement(){return {click(){}};}};
  return {
    setFrame(n){seq=n;}, setScreen(value){screen=value;},
    setSceneBuildIndex(index){source.sceneBuildIndex=index;},
    tick(){intervalCallback();},
    key(code,down=true,extra={}){listeners.get(down?'keydown':'keyup')?.({code,...extra});},
    get listenerCount(){return listeners.size;}, get cleared(){return cleared;},
    teardown(){delete globalThis.window;delete globalThis.document;},
  };
}

test('SH10 browser recorder samples rendered frame telemetry without private item names/audio buffers',()=>{
  const mock=mockBrowser();
  try {
    const recorder=startDojoCapture();
    assert.equal(recorder.length,1);
    mock.key('KeyW');mock.setFrame(2);mock.tick();
    const data=recorder.stop();
    assert.equal(data.schemaVersion,2);
    assert.equal(data.captureKind,'SH10_DOJO_OWNER_BROWSER_V2');
    assert.equal(data.frames.length,2);
    assert.equal(data.frames[1].gameplay.moving,true);
    assert.deepEqual(data.frames[1].gameplay.itemStates,[{id:'cup-2',state:'held'}]);
    assert.equal(data.frames[1].gameplay.itemsTotal,2);
    assert.equal(data.frames[1].gameplay.audioAmbienceSources,3);
    assert.equal(data.frames[1].nativeScene.source.serializedOwner,'level10');
    assert.equal(JSON.stringify(data).includes('PRIVATE_NAME'),false);
    assert.equal(JSON.stringify(data).includes('not serialized'),false);
    assert.equal(mock.listenerCount,0);assert.equal(mock.cleared,true);
  } finally {mock.teardown();}
});

test('SH10 route marker binds to a real rendered frame and duplicate markers fail',()=>{
  const mock=mockBrowser();
  try {
    const recorder=startDojoCapture();
    const first=recorder.mark('door-before');
    assert.equal(first.frameId,1);
    mock.setFrame(3);mock.tick();
    assert.equal(recorder.mark('door-after').frameId,3);
    assert.throws(()=>recorder.mark('door-after'),/duplicate/);
    assert.throws(()=>recorder.mark('native-bypass'),/unknown route/);
    assert.deepEqual(recorder.stop().marks,[{type:'door-before',frameId:1},{type:'door-after',frameId:3}]);
    assert.throws(()=>recorder.mark('stairs-top'),/stopped/);
  } finally {mock.teardown();}
});

test('SH10 recorder ignores stale frames and makes no input-state mutation',()=>{
  const mock=mockBrowser();
  try {
    const recorder=startDojoCapture();
    mock.key('KeyQ');mock.tick();
    assert.equal(recorder.length,1);
    mock.setFrame(2);mock.tick();
    assert.equal(recorder.length,2);
    assert.equal(recorder.stop().frames[1].gameplay.moving,true);
  } finally {mock.teardown();}
});

test('SH10 recorder is bounded and rejects browser-hook absence',()=>{
  const mock=mockBrowser();
  try {
    assert.throws(()=>startDojoCapture({intervalMs:1}),RangeError);
    const recorder=startDojoCapture({maxFrames:2});
    mock.setFrame(2);mock.tick();
    assert.equal(recorder.stopped,true);
    assert.equal(recorder.length,2);
  } finally {mock.teardown();}
});

test('SH10 readiness fails early on wrong local scene, not as a fabricated browser playthrough',()=>{
  const mock=mockBrowser();
  try {
    mock.setSceneBuildIndex(28);
    const receipt=inspectDojoCaptureReadiness();
    assert.equal(receipt.ready,false);
    assert.deepEqual(receipt.reasons,['WRONG_OR_MISSING_DOJO_BUILD10']);
    assert.throws(()=>startDojoCapture(),/WRONG_OR_MISSING_DOJO_BUILD10/);
    mock.setSceneBuildIndex(10);
    assert.equal(inspectDojoCaptureReadiness().ready,true);
    startDojoCapture().stop();
  } finally {mock.teardown();}
});

test('SH10 number-key route receipts are captured during gameplay without opening DevTools',()=>{
  const mock=mockBrowser();
  try {
    const recorder=startDojoCapture();
    const codes=['Digit1','Digit2','Digit3','Digit4','Digit5','Digit6'];
    const types=['door-before','door-after','stairs-bottom','stairs-top',
      'wall-press-start','wall-press-end'];
    for(let i=0;i<codes.length;i++){
      mock.setFrame(4+i*3);
      mock.tick();
      mock.key(codes[i]);
    }
    assert.deepEqual(codes.map(code=>DOJO_ROUTE_HOTKEYS[code]),types);
    assert.deepEqual(recorder.markers,
      types.map((type,i)=>({type,frameId:4+i*3})));
    mock.key('Digit6',true,{repeat:true});
    assert.equal(recorder.markers.length,6);
    mock.setScreen('paused');mock.setFrame(25);mock.tick();mock.key('Digit1');
    assert.equal(recorder.markers.length,6);
    assert.equal(recorder.markerWarnings.length,0);
    assert.equal(recorder.stop().marks.length,6);
    assert.equal(mock.listenerCount,0);
  } finally {mock.teardown();}
});

test('SH10 duplicate keyboard marker surfaces a warning rather than silently replacing evidence',()=>{
  const mock=mockBrowser();
  try {
    const recorder=startDojoCapture();
    mock.key('Digit1');
    mock.setFrame(3);mock.tick();mock.key('Digit1');
    assert.deepEqual(recorder.markers,[{type:'door-before',frameId:1}]);
    assert.match(recorder.markerWarnings.join(' '),/duplicate route marker/);
    assert.equal(recorder.stop().markerWarnings.length,1);
  } finally {mock.teardown();}
});
