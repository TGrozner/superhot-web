import test from 'node:test';
import assert from 'node:assert/strict';
import { planMcdProgressEndingInvocation as plan } from '../src/flow/ending-intents.js';

const initial = () => ({
  endSHAnimation: false, startReadingInput: false, inputRead: false,
  startSuperAnimation: false, effectStarted: false, replayEnded: false,
  levelEnded: false,
});
const signals = (additional = {}) => ({
  blockReplays: false, finishWithoutReplay: false, tutorialRun: false,
  endRunId: false, replayManagerPlayingReplay: false,
  errorPunchStopped: false, replayPlayerInReplay: false,
  acceptedFinishButton: false, isLastRunLevel: false,
  skipSuperTextAfterLevel: false, skipDefragBetweenLevels: false,
  ...additional,
});
const actions = (result) => result.effects.map(({ command, callback }) => command ?? callback);
const scheduled = (result) => result.effects.filter((e) => e.type === 'enqueue');

test('first invocation initializes win intent and enqueues an input-read callback', () => {
  const step = plan(initial(), signals());
  assert.deepEqual(actions(step), ['EndLevel', 'PrepareWinState', 'MarkReadingInput', 'ShowReplayReturnPrompt']);
  assert.equal(step.next.endSHAnimation, true);
  assert.equal(step.next.startReadingInput, false);
  assert.deepEqual(scheduled(step), [{ type: 'enqueue', callback: 'MarkReadingInput', delaySeconds: 0.5, timebase: 'UNVERIFIED' }]);
  assert.equal(step.status, 'Running');
});

test('BlockReplays uses supplied slowmoTimer as a delayed callback, not an immediate transition', () => {
  const step = plan(initial(), signals({ blockReplays: true, slowmoTimer: 2 }));
  assert.deepEqual(actions(step), ['EndLevel', 'PrepareWinState', 'MarkReadingInputAndReplayEnded']);
  assert.equal(scheduled(step)[0].delaySeconds, Math.fround(2 * Math.fround(0.45)));
  assert.equal(step.next.replayEnded, false);
});

test('tutorial, END and finishWithoutReplay independently suppress replay branch', () => {
  for (const flag of ['finishWithoutReplay', 'tutorialRun', 'endRunId']) {
    assert.equal(scheduled(plan(initial(), signals({ [flag]: true })))[0].callback, 'MarkReadingInputAndReplayEnded');
  }
});

test('external callback supplies startReadingInput before planner schedules super-animation', () => {
  const step = plan({ ...initial(), endSHAnimation: true, startReadingInput: true }, signals());
  assert.deepEqual(actions(step), ['EndLevel', 'MarkStartSuperAnimation']);
  assert.equal(step.next.inputRead, true);
  assert.equal(step.next.startSuperAnimation, false);
  assert.equal(scheduled(step)[0].delaySeconds, Math.fround(4 * Math.fround(0.45)));
});

test('replay start requires startSuperAnimation, not PlayingReplay', () => {
  const flags = { ...initial(), endSHAnimation: true, inputRead: true, startSuperAnimation: true };
  assert.deepEqual(actions(plan(flags, signals({ replayManagerPlayingReplay: true }))), ['EndLevel']);
  const step = plan(flags, signals());
  assert.deepEqual(actions(step), ['EndLevel', 'ReplayStartAudioAndErrorPunch']);
  assert.equal(step.next.effectStarted, true);
});

test('ErrorPunch stopped requests playback; active replay prevents a defrag transition', () => {
  const flags = { ...initial(), endSHAnimation: true, inputRead: true, startSuperAnimation: true, effectStarted: true };
  const step = plan(flags, signals({ errorPunchStopped: true, replayPlayerInReplay: true }));
  assert.deepEqual(actions(step), ['EndLevel', 'BeginPreparedReplay']);
  assert.equal(step.next.replayEnded, true);
  assert.equal(step.next.levelEnded, false);
});

test('after replay ends, completion requests SUPER and defrag rather than a two-second room advance', () => {
  const flags = { ...initial(), endSHAnimation: true, effectStarted: true, replayEnded: true };
  const step = plan(flags, signals());
  assert.deepEqual(actions(step), ['EndLevel', 'PlaySuperSoundAndAnimation', 'StopRecording', 'OpenDefragmentationMenu']);
  assert.equal(step.next.levelEnded, true);
  assert.equal(scheduled(step)[0].delaySeconds, Math.fround(4 * Math.fround(0.35)));
});

test('last level skips SUPER and SkipDefragBetweenLevels chooses an alternate route', () => {
  const flags = { ...initial(), endSHAnimation: true, replayEnded: true };
  const step = plan(flags, signals({ isLastRunLevel: true, skipDefragBetweenLevels: true }));
  assert.deepEqual(actions(step), ['EndLevel', 'StopRecording', 'SkipDefragAndAdvanceRun']);
});

test('later invocation cannot re-enqueue progress after LevelEnded', () => {
  const flags = { ...initial(), endSHAnimation: true, replayEnded: true, levelEnded: true };
  assert.deepEqual(actions(plan(flags, signals({ acceptedFinishButton: true }))), ['EndLevel']);
});

test('input-only route can complete without a replay effect when input is enabled', () => {
  const flags = { ...initial(), endSHAnimation: true, startReadingInput: true, inputRead: true };
  assert.deepEqual(actions(plan(flags, signals({ acceptedFinishButton: true }))), [
    'EndLevel', 'PlaySuperSoundAndAnimation', 'StopRecording', 'OpenDefragmentationMenu',
  ]);
});

test('missing native run signals cannot silently select a route or timebase', () => {
  assert.throws(() => plan(initial(), {}), /blockReplays/);
  assert.throws(() => plan(initial(), signals({ blockReplays: true })), /slowmoTimer/);
  assert.throws(() => plan({ ...initial(), replayEnded: undefined }, signals()), /replayEnded/);
  assert.throws(() => plan(initial(), signals({ isLastRunLevel: null })), /isLastRunLevel/);
});
