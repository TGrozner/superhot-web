/**
 * SH-10 owner-browser trace recorder. Import explicitly in DevTools only when
 * the user chooses to test. Sampling is read-only and entirely offline.
 * No assets, camera matrices, private paths, pixels, or audio are serialized.
 */
export function startDojoCapture({ intervalMs = 250, maxFrames = 15000 } = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Dojo trace recorder requires a browser.');
  }
  if (!Number.isInteger(intervalMs) || intervalMs < 100 || intervalMs > 5000 ||
      !Number.isInteger(maxFrames) || maxFrames < 1 || maxFrames > 50000) {
    throw new RangeError('invalid bounded trace capture settings');
  }
  if (typeof window.__superhotGetRenderedFrameSnapshot !== 'function') {
    throw new Error('Native Web frame snapshot hook is not available.');
  }
  const frames = [];
  let lastFrameId = -1;
  let timer = null;
  const sample = () => {
    const snapshot = window.__superhotGetRenderedFrameSnapshot();
    if (!snapshot || snapshot.frameId === lastFrameId || frames.length >= maxFrames) return;
    lastFrameId = snapshot.frameId;
    const encounter = snapshot.gameplay?.encounter;
    frames.push({
      frameId: snapshot.frameId,
      activeScreen: snapshot.activeScreen,
      nativeScene: snapshot.nativeScene ? {
        source: {
          scenePath: snapshot.nativeScene.source?.scenePath,
          sceneBuildIndex: snapshot.nativeScene.source?.sceneBuildIndex,
        },
      } : null,
      gameplay: {
        encounter: encounter ? {
          killTarget: encounter.killTarget,
          killed: encounter.killed,
          enemies: encounter.enemies?.map(enemy => ({
            id: enemy.id, alive: enemy.alive,
          })) ?? [],
        } : null,
      },
    });
    if (frames.length >= maxFrames) stop();
  };
  const stop = () => {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
    sampleStopped = true;
    return { frames: frames.slice() };
  };
  let sampleStopped = false;
  sample();
  timer = window.setInterval(sample, intervalMs);
  return Object.freeze({
    get length() { return frames.length; },
    get stopped() { return sampleStopped; },
    stop,
    save(filename = 'dojo-frames.json') {
      if (typeof filename !== 'string' || !/^dojo-[a-z0-9_-]+\.json$/i.test(filename)) {
        throw new TypeError('filename must be dojo-*.json');
      }
      const data = stop();
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = filename;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      return { frameCount: frames.length, downloadedRequested: true };
    },
  });
}
