import { createMcdDoorWarnings } from '../sound/mcd-door-warning.js';

// Static Unity references, NOT a runtime/visibility assertion. All three
// SpawnerPoint components point at distinct SpawnerDoors components in level10.
// Private proof: research #166/#167/#169/#170 (2026-11-03).
export const DOJO_DOOR_SOURCE_BINDINGS = Object.freeze([
  Object.freeze({ spawnGameObjectPathId: 103, spawnComponentPathId: 6510,
    warningComponentPathId: 7089, warningGameObjectPathId: 898,
    spotlightComponentPathId: 6343, falseLightComponentPathId: 7150 }),
  Object.freeze({ spawnGameObjectPathId: 221, spawnComponentPathId: 6532,
    warningComponentPathId: 7090, warningGameObjectPathId: 897,
    spotlightComponentPathId: 6342, falseLightComponentPathId: 7151 }),
  Object.freeze({ spawnGameObjectPathId: 370, spawnComponentPathId: 6566,
    warningComponentPathId: 7091, warningGameObjectPathId: 896,
    spotlightComponentPathId: 6344, falseLightComponentPathId: 7152 }),
]);

const BY_SPAWN_GO = new Map(DOJO_DOOR_SOURCE_BINDINGS.map(binding =>
  [binding.spawnGameObjectPathId, binding]));

function dojoSource(source) {
  return source?.sceneBuildIndex === 10 && source?.serializedOwner === 'level10'
    && typeof source.scenePath === 'string' && /(?:^|\/)SHRL_Dojo2\.unity$/.test(source.scenePath);
}

function spawnIdentity(point) {
  // Never infer source GO identity from the Web anchor id, array position,
  // doorway distance or an enum. The private exporter must expose this pair.
  const source = point?.source;
  if (source?.owner !== 'level10') return null;
  const raw = source.path_id;
  if (typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0) return raw;
  if (typeof raw === 'string' && /^(0|[1-9][0-9]*)$/.test(raw)) {
    const parsed = Number(raw);
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  return null;
}

function outcome(status, details = {}) {
  return Object.freeze({ status, ...details });
}

/**
 * Exact source SpawnerPoint -> SpawnerDoors join for Dojo/build10, fed by the
 * existing SH-07 world-clock envelope. Does NOT draw or play audio.
 *
 * A private scene package must expose point.source={owner:'level10',path_id}
 * and gameplay.audio.doors keyed by level10::SpawnerDoors-component-path-id.
 * Unknown or mismatched references deliberately produce no warning.
 */
export function createDojoDoorWarningBridge(scene) {
  const qualified = dojoSource(scene?.source);
  const catalog = scene?.gameplay?.audio?.doors;
  const hasCatalog = catalog !== null && typeof catalog === 'object' &&
    !Array.isArray(catalog) && Object.keys(catalog).length > 0;
  const controller = qualified && hasCatalog ? createMcdDoorWarnings(catalog) : null;
  const readiness = qualified ? (hasCatalog ? 'source-catalog-present' : 'missing-private-door-catalog')
    : 'not-dojo-build10-source';

  function accept(event) {
    if (event?.type !== 'door-warning') return outcome('ignored-not-warning');
    if (!controller) return outcome(readiness);
    const spawnPathId = spawnIdentity(event.point);
    if (spawnPathId === null) return outcome('missing-verified-spawn-go');
    const binding = BY_SPAWN_GO.get(spawnPathId);
    if (!binding) return outcome('spawn-go-not-bound-in-source', { spawnPathId });
    const doorKey = `level10::${binding.warningComponentPathId}`;
    if (!Object.hasOwn(catalog, doorKey)) {
      return outcome('source-door-not-in-private-catalog', { spawnPathId, doorKey });
    }
    if (!controller.trigger(doorKey)) return outcome('source-controller-rejected', { spawnPathId, doorKey });
    return outcome('triggered', { spawnPathId, doorKey });
  }

  function advance(worldDeltaSeconds) {
    // Preserve SH-07 world-clock semantics: DO NOT use the spawner's
    // unscaledDeltaTime for the light's animation curve.
    if (!Number.isFinite(worldDeltaSeconds) || worldDeltaSeconds < 0) {
      throw new RangeError('worldDeltaSeconds must be finite and nonnegative');
    }
    return controller ? controller.advance(worldDeltaSeconds) : [];
  }

  return Object.freeze({
    readiness,
    accept,
    advance,
    packets: () => controller?.packets() ?? [],
    reset: () => controller?.reset(),
  });
}
