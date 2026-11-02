import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTAINERS_AUTHORED_STEPS,
  MCD_GAME_TYPE,
  isMcdLevelClear,
  isMcdSpawnerInclusiveClear,
  classifyMcdRunEnding,
} from '../src/flow/containers-gates.js';

const signals = (override = {}) => ({
  gameType: 'STANDARD_RUN', // Explicit synthetic test identifier, not an MCD enum claim.
  allNeededEnemyKilled: false,
  playerDead: false,
  winOnDeath: false,
  ...override,
});

test('Containers static authored call order is not represented as an observed runtime trace', () => {
  assert.deepEqual(CONTAINERS_AUTHORED_STEPS, [
    'initialize-timeline', 'wait-for-level-load', 'standard-fade-in', 'enqueue-run-ending',
  ]);
  assert.equal(Object.isFrozen(CONTAINERS_AUTHORED_STEPS), true);
});

test('native AllKilled guard does not clear when quota is outstanding', () => {
  assert.equal(isMcdLevelClear(signals()), false);
});

test('native AllKilled guard clears a living player after manager quota completion', () => {
  assert.equal(isMcdLevelClear(signals({ allNeededEnemyKilled: true })), true);
});

test('native AllKilled guard does not award normal completion to a dead player', () => {
  assert.equal(isMcdLevelClear(signals({ allNeededEnemyKilled: true, playerDead: true })), false);
});

test('WinOnDeath permits completion on death even when quota is not complete', () => {
  assert.equal(isMcdLevelClear(signals({ playerDead: true, winOnDeath: true })), true);
});

test('ENDLESS_LEVEL rejects AllKilled including WinOnDeath', () => {
  assert.equal(isMcdLevelClear(signals({ gameType: MCD_GAME_TYPE.ENDLESS_LEVEL, allNeededEnemyKilled: true })), false);
  assert.equal(isMcdLevelClear(signals({ gameType: MCD_GAME_TYPE.ENDLESS_LEVEL, playerDead: true, winOnDeath: true })), false);
});

test('spawner-inclusive completion requires zero including pending spawns', () => {
  assert.equal(isMcdSpawnerInclusiveClear({ enemiesIncludingSpawners: 1, playerDead: false, winOnDeath: false }), false);
  assert.equal(isMcdSpawnerInclusiveClear({ enemiesIncludingSpawners: 0, playerDead: false, winOnDeath: false }), true);
});

test('spawner-inclusive predicate separately allows WinOnDeath and is not ENDLESS_LEVEL gated', () => {
  assert.equal(isMcdSpawnerInclusiveClear({ enemiesIncludingSpawners: 5, playerDead: true, winOnDeath: true }), true);
  assert.equal(isMcdSpawnerInclusiveClear({ enemiesIncludingSpawners: 0, playerDead: true, winOnDeath: false }), false);
});

test('EndRunLevel distinguishes tutorial and progress eligibility without advancing state', () => {
  assert.equal(classifyMcdRunEnding(signals({ allNeededEnemyKilled: true, gameType: MCD_GAME_TYPE.TUTORIAL_RUN })), 'tutorial-ending-eligible');
  assert.equal(classifyMcdRunEnding(signals({ allNeededEnemyKilled: true })), 'progress-ending-eligible');
  assert.equal(classifyMcdRunEnding(signals()), 'not-ready');
  assert.equal(classifyMcdRunEnding(signals({ allNeededEnemyKilled: true, gameType: MCD_GAME_TYPE.ENDLESS_LEVEL })), 'not-ready');
});

test('missing native manager signals are never guessed by the Web helper', () => {
  assert.throws(() => isMcdLevelClear({ gameType: 'ANY', playerDead: false, winOnDeath: false }), /allNeededEnemyKilled/);
  assert.throws(() => isMcdLevelClear(signals({ playerDead: undefined })), /playerDead/);
  assert.throws(() => isMcdLevelClear(signals({ gameType: '' })), /gameType/);
  assert.throws(() => isMcdSpawnerInclusiveClear({ enemiesIncludingSpawners: -1, playerDead: false, winOnDeath: false }), /enemiesIncludingSpawners/);
});
