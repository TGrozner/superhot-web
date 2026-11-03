/**
 * SH-08 — statically sourced MCD Dojo/build10 RunEnding invocation.
 *
 * This evaluates one LevelTimeline ImplementedAction invocation; it does not
 * execute engine services or pretend the Web kill counter is the native
 * PejAiManager.AllNeededEnemyKilled() result. The caller owns those signals.
 *
 * Provenance: private research #176 (SHRL_Dojo2FlowControl.Start), #177
 * (LevelTimeline.LevelEnding/ImplementedAction), #35/#66 (LevelFlowControl
 * AllKilled, EndRunLevel, EndProgressLevel). No original source is included.
 */
function record(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function checkSource(value) {
    if (!record(value) || value['sceneBuildIndex'] !== 10 ||
        value['serializedOwner'] !== 'level10' ||
        typeof value['scenePath'] !== 'string' ||
        !/(?:^|[\\/])SHRL_Dojo2\.unity$/i.test(value['scenePath'])) {
        throw new RangeError('Dojo ending requires SHRL_Dojo2/build10/level10');
    }
}
function boolean(value, label) {
    if (typeof value !== 'boolean')
        throw new TypeError(`${label} must be an explicit boolean`);
    return value;
}
function snapshot(branch, methodStatus, audioFaded, effects) {
    return Object.freeze({
        branch, methodStatus, timelinePhaseComplete: methodStatus !== 'Running',
        next: Object.freeze({ audioFaded }),
        effects: Object.freeze(effects.map(effect => Object.freeze(effect))),
        nativeParity: 'STATIC_SOURCE_ONLY',
    });
}
/**
 * Source-specific, executable *decision* for one Dojo RunEnding callback.
 *
 * The original EndRunLevel normally returns Running, including after it has
 * requested progress-ending effects. It returns Success only for the enabled
 * debug LockLevel restart. This cannot license instant Win or SHMenu on Web.
 *
 * Native IsWaitingOver() currently returns true on both paths. Its internal
 * boss timer changes state, but does not prevent this method's EndRunLevel call.
 * No Web clock or input owner is duplicated here.
 */
export function stepDojoNativeRunEnding(previous, signals) {
    if (!record(previous))
        throw new TypeError('previous must be an ending state');
    const hadFaded = boolean(previous['audioFaded'], 'previous.audioFaded');
    if (!record(signals))
        throw new TypeError('signals must be a record');
    checkSource(signals['source']);
    const gameType = signals['gameType'];
    if (typeof gameType !== 'string' || gameType.length === 0) {
        throw new TypeError('gameType must be a known nonempty native enum label');
    }
    const allNeeded = boolean(signals['allNeededEnemyKilled'], 'allNeededEnemyKilled');
    const dead = boolean(signals['playerDead'], 'playerDead');
    const winOnDeath = boolean(signals['winOnDeath'], 'winOnDeath');
    const allowDebugKeys = boolean(signals['allowDebugKeys'], 'allowDebugKeys');
    const lockLevel = boolean(signals['lockLevel'], 'lockLevel');
    // LevelFlowControl.AllKilled: ENDLESS_LEVEL never qualifies, even on death.
    const cleared = gameType !== 'ENDLESS_LEVEL' &&
        ((allNeeded && !dead) || (winOnDeath && dead));
    if (!cleared)
        return snapshot('waiting-for-native-clear', 'Running', hadFaded, []);
    // LevelFlowControl.EndRunLevel dispatches tutorial separately; the debug
    // restart guard exists ONLY in the non-tutorial branch.
    if (gameType !== 'TUTORIAL_RUN' && allowDebugKeys && lockLevel) {
        return snapshot('debug-restart', 'Success', hadFaded, [{ type: 'restart-level' }]);
    }
    const tutorial = gameType === 'TUTORIAL_RUN';
    const effects = [];
    if (!hadFaded)
        effects.push({ type: 'fade-submaster', durationSeconds: tutorial ? 1.5 : 2.5 });
    effects.push({ type: 'disable-crosshair' }, { type: 'block-player-actions' }, { type: tutorial ? 'run-tutorial-ending' : 'run-progress-ending' });
    return snapshot(tutorial ? 'tutorial-ending' : 'progress-ending', 'Running', true, effects);
}
