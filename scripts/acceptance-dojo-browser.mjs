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
export const DOJO_ROUTE_HOTKEYS = Object.freeze({
  Digit1: 'door-before', Digit2: 'door-after',
  Digit3: 'stairs-bottom', Digit4: 'stairs-top',
  Digit5: 'wall-press-start', Digit6: 'wall-press-end',
});

/** A browser-only readiness receipt; not evidence of native gameplay or a complete run. */
export function inspectDojoCaptureReadiness() {
  const reasons = [];
  if (typeof window === 'undefined' || typeof document === 'undefined' ||
      typeof window.__superhotGetRenderedFrameSnapshot !== 'function') {
    return {ready:false,status:'WEB_DOJO_CAPTURE_NOT_READY',
      reasons:['RENDERED_FRAME_HOOK_UNAVAILABLE'],frameId:null};
  }
  let frame;
  try { frame = window.__superhotGetRenderedFrameSnapshot(); }
  catch { return {ready:false,status:'WEB_DOJO_CAPTURE_NOT_READY',
    reasons:['RENDERED_FRAME_HOOK_FAILED'],frameId:null}; }
  if (!frame) reasons.push('RENDERED_FRAME_UNAVAILABLE');
  else {
    const source = frame.nativeScene?.source, g = frame.gameplay;
    // Main starts in a playable *preview* without starting the encounter.
    // The actual start/reset path hides these controls while playing.
    // This is a Web UI receipt, never independent native or click evidence.
    if (frame.activeScreen !== 'playing') reasons.push('DOJO_NOT_PLAYING');
    if (document.getElementById?.('scene-controls')?.hidden !== true) {
      reasons.push('DOJO_COMBAT_NOT_STARTED');
    }
    const sceneName = typeof source?.scenePath === 'string'
      ? source.scenePath.replaceAll(String.fromCharCode(92), '/').split('/').at(-1).toLowerCase()
      : null;
    if (sceneName !== 'shrl_dojo2.unity' ||
        source?.sceneBuildIndex !== 10 || source?.serializedOwner !== 'level10') {
      reasons.push('WRONG_OR_MISSING_DOJO_BUILD10');
    }
    if (![6,7].includes(g?.encounter?.killTarget) ||
        !Number.isSafeInteger(g?.encounter?.killed) || !Array.isArray(g?.encounter?.enemies)) {
      reasons.push('DOJO_ENCOUNTER_NOT_READY');
    } else if (g.encounter.killed !== 0) {
      reasons.push('DOJO_RUN_NOT_FRESH');
    }
    if (!Array.isArray(g?.items) || g.items.length === 0) reasons.push('SOURCE_PICKUP_ITEMS_UNAVAILABLE');
    if (!g?.feet || ![g.feet.x,g.feet.y,g.feet.z].every(Number.isFinite) ||
        typeof g.grounded !== 'boolean') reasons.push('PLAYER_FEET_UNAVAILABLE');
    if (!Number.isSafeInteger(g?.audio?.sceneAmbienceSources)) reasons.push('AMBIENCE_TELEMETRY_UNAVAILABLE');
  }
  return {ready:reasons.length===0,
    status:reasons.length ? 'WEB_DOJO_CAPTURE_NOT_READY' : 'WEB_DOJO_CAPTURE_READY_NOT_PLAYTHROUGH_VERIFIED',
    reasons,frameId:Number.isSafeInteger(frame?.frameId)?frame.frameId:null};
}

export function startDojoCapture({ intervalMs = 100, maxFrames = 15000, waitForStart = false } = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Dojo recorder requires a browser');
  }
  if (!Number.isInteger(intervalMs) || intervalMs < 50 || intervalMs > 5000 ||
      !Number.isInteger(maxFrames) || maxFrames < 1 || maxFrames > 50000 ||
      typeof waitForStart !== 'boolean') {
    throw new RangeError('invalid bounded Dojo capture settings');
  }
  const readiness = inspectDojoCaptureReadiness();
  if (!readiness.ready && !waitForStart) {
    throw new Error('Dojo capture preflight failed: ' + readiness.reasons.join(', '));
  }
  // Arming before Start avoids reopening DevTools after pointer lock.
  // Preview frames are not captured, even if they say activeScreen=playing.
  let ready = readiness.ready;
  const frames = [], marks = [], uiActions = [], pressed = new Set(), markerWarnings = [];
  let lastFrameId = -1, timer = null, stopped = false;
  const onDown = event => {
    if (MOVEMENT_KEYS.has(event.code)) pressed.add(event.code);
    const type = DOJO_ROUTE_HOTKEYS[event.code];
    if (!type || !ready || event.repeat || event.isComposing) return;
    const target = event.target;
    if (target?.isContentEditable || ['INPUT','SELECT','TEXTAREA'].includes(target?.tagName)) return;
    // Hotkeys are meaningful only while the *actual* browser game is playing.
    if (window.__superhotGetRenderedFrameSnapshot()?.activeScreen !== 'playing') return;
    try { mark(type); }
    catch (error) { markerWarnings.push(event.code + ': ' + error.message); }
  };
  // Capture actual trusted browser UI clicks (not inferred from a state change).
  // This is still unauthenticated owner-supplied Web evidence, never native proof.
  const onUiClick = event => {
    if (stopped || event.isTrusted !== true) return;
    const id = event.target?.closest?.('button')?.id;
    const type = ['start-button', 'play-original'].includes(id) ? 'start'
      : id === 'again-button' ? 'restart' : null;
    if (!type || (type === 'start' && ready)) return;
    let current;
    try { current = window.__superhotGetRenderedFrameSnapshot?.(); }
    catch { return; }
    if (!Number.isSafeInteger(current?.frameId) || current.frameId < 0) return;
    if (type === 'restart' && current.activeScreen !== 'win') return;
    if (type === 'start' && !['playing','menu'].includes(current.activeScreen)) return;
    uiActions.push({type, buttonId:id, frameId:current.frameId,
      activeScreen:current.activeScreen});
  };
  const onUp = event => pressed.delete(event.code);
  const onBlur = () => pressed.clear();
  document.addEventListener('click', onUiClick, true);
  window.addEventListener('keydown', onDown, { passive: true });
  window.addEventListener('keyup', onUp, { passive: true });
  window.addEventListener('blur', onBlur);

  const sample = () => {
    if (stopped) return;
    if (!ready) {
      if (!inspectDojoCaptureReadiness().ready) return;
      ready = true;
    }
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
      document.removeEventListener('click', onUiClick, true);
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
      pressed.clear();
    }
    return { schemaVersion: 2, captureKind: 'SH10_DOJO_OWNER_BROWSER_V2',
      frames: frames.slice(), marks: marks.slice(), uiActions: uiActions.slice(),
      markerWarnings: markerWarnings.slice() };
  };
  function mark(type) {
    if (stopped) throw new Error('cannot mark a stopped Dojo capture');
    if (!ready) throw new Error('Dojo capture is armed but the encounter has not started');
    if (!DOJO_ROUTE_MARKERS.includes(type)) throw new RangeError('unknown route marker');
    sample();
    if (!frames.length) throw new Error('no rendered frame available for route marker');
    if (marks.some(mark => mark.type === type)) throw new Error('duplicate route marker');
    marks.push({type, frameId: frames.at(-1).frameId});
    return {type, frameId: frames.at(-1).frameId};
  }
  timer = window.setInterval(sample, intervalMs);
  sample();
  return Object.freeze({
    get ready() { return ready; },
    get length() { return frames.length; },
    get stopped() { return stopped; },
    get markers() { return marks.map(mark => ({...mark})); },
    get markerWarnings() { return markerWarnings.slice(); },
    mark,
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
      return {frameCount:frames.length, marks:marks.length,
        markerWarnings:markerWarnings.slice(), downloadedRequested:true};
    },
  });
}
