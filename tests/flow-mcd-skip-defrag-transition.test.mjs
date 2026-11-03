import test from 'node:test';
import assert from 'node:assert/strict';
import {executeMcdSkipDefragTransition} from '../src/flow/mcd-skip-defrag-transition.js';

const receipt = Object.freeze({
  source: Object.freeze({sceneBuildIndex:10, serializedOwner:'level10', scenePath:'Scenes/SHRL_Dojo2.unity'}),
  callback:'SkipDefragAndAdvanceRun', skipDefragBetweenLevels:true,
});

function services(cells) {
  const calls=[];
  let index=-1;
  const currentRun={
    moveToNextCell() { calls.push('move'); index++; assert.ok(index<cells.length, 'run bounds'); },
    checkIfLastCell() { calls.push('last?'); return cells[index].last; },
    checkIfCurrentCellIsShop() { calls.push('shop?'); return cells[index].shop; },
    save() { calls.push('save'); },
    getNextLevel() { calls.push('nextLevel'); return 'qualified-next-level'; },
  };
  return {calls, currentRun,
    setNewRunUnlocked(value) { assert.equal(value,true); calls.push('unlock'); },
    makeScreenshot() { calls.push('shot'); },
    forceScreenshotOnScreen() { calls.push('forceShot'); },
    riseOnWin() { calls.push('win'); },
    getLevelBySceneFileName(name) { assert.equal(name,'SHMenu'); calls.push('menuLevel'); return 'SHMenu'; },
    startLoading(next) { calls.push('load:'+next); },
  };
}

test('skips source shop cells, saves before loading actual next level', () => {
  const s=services([{last:false,shop:true},{last:false,shop:true},{last:false,shop:false}]);
  const result=executeMcdSkipDefragTransition(receipt,s);
  assert.deepEqual(result,{branch:'next-level',cellsAdvanced:3,destination:'next-run-cell',nativeParity:'STATIC_SOURCE_ONLY'});
  assert.deepEqual(s.calls,['move','last?','shop?','move','last?','shop?','move','last?','shop?','save','last?','nextLevel','load:qualified-next-level']);
});

test('even terminal route moves one cell, saves, then reveals Win and loads SHMenu', () => {
  const s=services([{last:true,shop:true}]);
  const result=executeMcdSkipDefragTransition(receipt,s);
  assert.deepEqual(result,{branch:'completed-run',cellsAdvanced:1,destination:'SHMenu',nativeParity:'STATIC_SOURCE_ONLY'});
  assert.deepEqual(s.calls,['move','last?','save','last?','unlock','shot','forceShot','win','menuLevel','load:SHMenu']);
});

test('refuses Web quota or missing native run services before advancing', () => {
  const s=services([{last:true,shop:false}]);
  assert.throws(()=>executeMcdSkipDefragTransition({...receipt,callback:'request-web-win-transition'},s),/native skip-defrag/);
  assert.throws(()=>executeMcdSkipDefragTransition({...receipt,skipDefragBetweenLevels:false},s),/native skip-defrag/);
  assert.throws(()=>executeMcdSkipDefragTransition(receipt,{...s,currentRun:{}}),/moveToNextCell/);
  assert.deepEqual(s.calls,[]);
});
