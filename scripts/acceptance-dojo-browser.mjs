/**
 * SH-10: read-only, owner-local Dojo/browser gameplay sampler.
 * No original bytes, assets, image/audio buffers or network requests.
 * Operator labels for door/stairs/wall are unverified context, NOT scene proof.
 */
const DOJO_ROUTE_MARKERS = Object.freeze([
  'door-before', 'door-after', 'stairs-bottom', 'stairs-top',
  'wall-press-start', 'wall-press-end',
]);
const MOVEMENT_KEYS = new Set(['KeyW', 'KeyZ', 'ArrowUp', 'KeyS', 'KeyA', 'KeyQ',
  'ArrowDown', 'ArrowLeft', 'KeyD', 'ArrowRight']);
const asItemKey = id => id == null ? null : String(id);

export function startDojoCapture({ intervalMs = 100, maxFrames = 15000 } = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Dojo recorder requires a browser');
  }
  if (!Number.isInteger(intervalMs) || intervalMs < 50 || intervalMs > 5000 ||
      !Number.isInteger(maxFrames) || maxFrames < 1 || maxFrames > 50000) {
    throw new RangeError('invalid bounded Dojo capture settings');
  }
  if (typeof window.__superhotGetRenderedFrameSnapshot !== 'function') {
    throw new Error('Rendered-frame snapshot hook unavailable');
  }
  const frames = [], marks = [], pressed = new Set();
  let lastFrameId = -1, timer = null, stopped = false;
  const onDown = event => { if (MOVEMENT_KEYS.has(event.code)) pressed.add(event.code); };
  const onUp = event => pressed.delete(event.code);
  const onBlur = () => pressed.clear();
  window.addEventListener('keydown', onDown, { passive: true });
  window.addEventListener('keyup', onUp, { passive: true });
  window.addEventListener('blur', onBlur);

  const sample = () => {
    if (stopped) return;
    const snapshot = window.__superhotGetRenderedFrameSnapshot();
    if (!snapshot || snapshot.frameId === lastFrameId) return;
    if (!Number.isSafeInteger(snapshot.frameId) || snapshot.frameId <= lastFrameId) return;
    if (frames.length >= maxFrames) { stop(); return; }
    lastFrameId = snapshot.frameId;
    const g = snapshot.gameplay ?? {}, encounter = g.encounter;
    const items = Array.isArray(g.items) ? g.items : [];
    const changed = items.filter(i => i?.state !== 'static');
    frames.push({
      frameId: snapshot.frameId,
      activeScreen: snapshot.activeScreen,
      worldClock: snapshot.worldClock,
      nativeScene: snapshot.nativeScene ? { source: {
        scenePath: snapshot.nativeScene.source?.scenePath,
        sceneBuildIndex: snapshot.nativeScene.source?.sceneBuildIndex,
        serializedOwner: snapshot.nativeScene.source?.serializedOwner,
      } } : null,
      gameplay: {
        encounter: encounter ? {
          killTarget: encounter.killTarget, killed: encounter.killed,
          enemies: encounter.enemies?.map(enemy => ({ id: enemy.id, alive: enemy.alive })) ?? [],
        } : null,
        weapon: g.weapon, ammo: g.ammo,
        heldItem: asItemKey(g.heldItem),
        itemsTotal: items.length,
        // Do not serialize static source names, meshes or original transforms.
        itemStates: changed.slice(0, 256).map(i => ({id:asItemKey(i.id),state:i.state})),
        itemsTruncated: changed.length > 256,
        originalFragmentCount: g.originalFragmentCount,
        audioAmbienceSources: g.audio?.sceneAmbienceSources,
        feet: g.feet ? {x:g.feet.x, y:g.feet.y, z:g.feet.z} : null,
        grounded: g.grounded, moving: pressed.size > 0,
      },
    });
    if (frames.length >= maxFrames) stop();
  };
  const stop = () => {
    if (!stopped) {
      stopped = true;
      if (timer !== null) window.clearInterval(timer);
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
      pressed.clear();
    }
    return { schemaVersion: 2, captureKind: 'SH10_DOJO_OWNER_BROWSER_V2',
      frames: frames.slice(), marks: marks.slice() };
  };
  timer = window.setInterval(sample, intervalMs);
  sample();
  return Object.freeze({
    get length() { return frames.length; },
    get stopped() { return stopped; },
    mark(type) {
      if (stopped) throw new Error('cannot mark a stopped Dojo capture');
      if (!DOJO_ROUTE_MARKERS.includes(type)) throw new RangeError('unknown route marker');
      sample();
      if (!frames.length) throw new Error('no rendered frame available for route marker');
      if (marks.some(mark => mark.type === type)) throw new Error('duplicate route marker');
      marks.push({type, frameId: frames.at(-1).frameId});
      return {type, frameId: frames.at(-1).frameId};
    },
    stop,
    save(filename = 'dojo-full-run.json') {
      if (typeof filename !== 'string' || !/^dojo-[a-z0-9_-]+\.json$/i.test(filename)) {
        throw new TypeError('filename must be dojo-*.json');
      }
      const data = stop();
      const blob = new Blob([JSON.stringify(data)], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = filename;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      return {frameCount:frames.length, marks:marks.length, downloadedRequested:true};
    },
  });
}
