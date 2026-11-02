/**
 * Source-qualified, side-effect-free description of ONE invocation of
 * LevelFlowControl.RunLevelEndingWithoutSuperhot (MCD Steam build 20299547).
 *
 * This is a list of requests to engine services, NOT an implementation of
 * replay, sound, UI, DelayedInvokeMarshal or native runtime execution.
 * See docs/parity/flow.md for method/line evidence and limitations.
 */
const FLAG_FIELDS = [
  'endSHAnimation', 'startReadingInput', 'inputRead', 'startSuperAnimation',
  'effectStarted', 'replayEnded', 'levelEnded',
];

const SIGNAL_FIELDS = [
  'blockReplays', 'finishWithoutReplay', 'tutorialRun', 'endRunId',
  'replayManagerPlayingReplay', 'errorPunchStopped', 'replayPlayerInReplay',
  'acceptedFinishButton', 'isLastRunLevel', 'skipSuperTextAfterLevel',
  'skipDefragBetweenLevels',
];

function validate(fields, record, label) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new TypeError(label + ' must be a record');
  }
  for (const key of fields) {
    if (typeof record[key] !== 'boolean') {
      throw new TypeError(label + '.' + key + ' must be explicitly supplied as boolean');
    }
  }
}

const f32 = Math.fround;
const multiplyNativeFloat = (seconds, factor) => f32(f32(seconds) * f32(factor));

/**
 * The actions are descriptive requests; callbacks do NOT fire inside this
 * function. delaySeconds reflects the C# argument to Enqueue, while its
 * scaled/unscaled timebase remains UNVERIFIED here.
 *
 * Call only after independently establishing EndRunLevel's AllKilled guard.
 * Visible enemy count is not AllNeededEnemyKilled().
 *
 * acceptedFinishButton is supplied by the input owner (SH-02), rather than
 * re-implementing the native CheckButtons bindings.
 */
export function planMcdProgressEndingInvocation(flags, signals) {
  validate(FLAG_FIELDS, flags, 'flags');
  validate(SIGNAL_FIELDS, signals, 'signals');
  if (signals.blockReplays &&
      (!Number.isFinite(signals.slowmoTimer) || signals.slowmoTimer < 0)) {
    throw new TypeError('signals.slowmoTimer must be supplied for BlockReplays');
  }

  const next = { ...flags };
  const effects = [{ type: 'invoke', command: 'EndLevel' }];
  const duration = signals.blockReplays ? f32(signals.slowmoTimer) : 4;
  const enqueue = (callback, seconds) => effects.push({
    type: 'enqueue', callback, delaySeconds: seconds,
    timebase: 'UNVERIFIED',
  });

  if (!next.endSHAnimation) {
    // Lines 950-980: this return prevents later conditions this invocation.
    effects.push({ type: 'invoke', command: 'PrepareWinState' });
    next.endSHAnimation = true;
    if (signals.finishWithoutReplay || signals.tutorialRun ||
        signals.endRunId || signals.blockReplays) {
      enqueue('MarkReadingInputAndReplayEnded', multiplyNativeFloat(duration, 0.45));
    } else {
      enqueue('MarkReadingInput', f32(0.5));
      effects.push({ type: 'invoke', command: 'ShowReplayReturnPrompt' });
    }
    return { next, effects, status: 'Running' };
  }

  // Lines 982-989: enqueues rather than immediately setting startSuperAnimation.
  if (next.startReadingInput && !next.inputRead) {
    enqueue('MarkStartSuperAnimation', multiplyNativeFloat(duration, 0.45));
    next.inputRead = true;
  }

  // Lines 990-1003: both branches can run during one invocation.
  if (!next.levelEnded && next.startSuperAnimation &&
      !signals.replayManagerPlayingReplay && !next.effectStarted) {
    effects.push({ type: 'invoke', command: 'ReplayStartAudioAndErrorPunch' });
    next.effectStarted = true;
  }
  if (!next.replayEnded && next.effectStarted && signals.errorPunchStopped) {
    effects.push({ type: 'invoke', command: 'BeginPreparedReplay' });
    next.replayEnded = true;
  }

  // Lines 1004-1029: input acceptance and replay completion are distinct.
  if (!next.levelEnded && !signals.replayPlayerInReplay &&
      ((signals.acceptedFinishButton && !next.effectStarted && next.startReadingInput) ||
        next.replayEnded)) {
    if (!signals.isLastRunLevel && !signals.skipSuperTextAfterLevel) {
      effects.push({ type: 'invoke', command: 'PlaySuperSoundAndAnimation' });
    }
    effects.push({ type: 'invoke', command: 'StopRecording' });
    enqueue(signals.skipDefragBetweenLevels ? 'SkipDefragAndAdvanceRun' :
      'OpenDefragmentationMenu', multiplyNativeFloat(duration, 0.35));
    next.levelEnded = true;
  }
  return { next, effects, status: 'Running' };
}
