function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function assertReceipt(value) {
    if (!isRecord(value))
        throw new TypeError('native callback receipt required');
    const source = value['source'];
    if (!isRecord(source) || source['sceneBuildIndex'] !== 10 ||
        source['serializedOwner'] !== 'level10' ||
        typeof source['scenePath'] !== 'string' ||
        !/(?:^|[\\/])SHRL_Dojo2\.unity$/i.test(source['scenePath'])) {
        throw new RangeError('expected SHRL_Dojo2/build10/level10 source');
    }
    if (value['callback'] !== 'SkipDefragAndAdvanceRun' ||
        value['skipDefragBetweenLevels'] !== true) {
        throw new RangeError('HandleSkippingDefrag requires the native skip-defrag callback');
    }
}
function assertServices(value) {
    if (!isRecord(value) || !isRecord(value['currentRun'])) {
        throw new TypeError('authoritative currentRun services required');
    }
    const run = value['currentRun'];
    for (const method of ['moveToNextCell', 'checkIfLastCell',
        'checkIfCurrentCellIsShop', 'save', 'getNextLevel']) {
        if (typeof run[method] !== 'function')
            throw new TypeError('currentRun.' + method + ' required');
    }
    for (const method of ['setNewRunUnlocked', 'makeScreenshot',
        'forceScreenshotOnScreen', 'riseOnWin', 'getLevelBySceneFileName', 'startLoading']) {
        if (typeof value[method] !== 'function')
            throw new TypeError(method + ' required');
    }
}
function nativeBoolean(value, label) {
    if (typeof value !== 'boolean')
        throw new TypeError(label + ' must return boolean');
    return value;
}
function level(value, label) {
    if (value === null || value === undefined) {
        throw new TypeError(label + ' returned no level; refusing fabricated scene');
    }
    return value;
}
/**
 * Invoke ONCE when the deferred SkipDefragAndAdvanceRun callback actually fires.
 * Mirrors native do/while (including at least one MoveToNextCell), then Save,
 * then load next level OR unlock, screenshot, OnWin, load SHMenu in that order.
 * Host must own run state, persistence, image reveal, event bus and loading.
 * The method has side effects; do not call speculatively or on every frame.
 */
export function executeMcdSkipDefragTransition(receipt, services) {
    assertReceipt(receipt);
    assertServices(services);
    const run = services.currentRun;
    let cellsAdvanced = 0;
    // The original code has no fixed maximum; the authoritative run owns its
    // bounds and must reject an impossible MoveToNextCell rather than wrapping.
    do {
        run.moveToNextCell();
        cellsAdvanced += 1;
    } while (!nativeBoolean(run.checkIfLastCell(), 'CheckIfLastCell') &&
        nativeBoolean(run.checkIfCurrentCellIsShop(), 'CheckIfCurrentCellIsShop'));
    run.save();
    if (!nativeBoolean(run.checkIfLastCell(), 'CheckIfLastCell')) {
        services.startLoading(level(run.getNextLevel(), 'GetNextLevel'));
        return Object.freeze({
            branch: 'next-level', cellsAdvanced, destination: 'next-run-cell',
            nativeParity: 'STATIC_SOURCE_ONLY',
        });
    }
    services.setNewRunUnlocked(true);
    services.makeScreenshot();
    services.forceScreenshotOnScreen();
    services.riseOnWin();
    services.startLoading(level(services.getLevelBySceneFileName('SHMenu'), 'GetLevelBySceneFileName'));
    return Object.freeze({
        branch: 'completed-run', cellsAdvanced, destination: 'SHMenu',
        nativeParity: 'STATIC_SOURCE_ONLY',
    });
}
