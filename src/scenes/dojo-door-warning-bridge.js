import { createMcdDoorWarnings } from '../sound/mcd-door-warning.js';
import { prepareNativeCollision, nativeSegmentHit } from './native-collision.js';

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

// Derived browser-world scene markers, NOT raw Unity transforms or a source
// mesh/material/cookie. Sources: private research #175 and #181 (level10),
// joining the nine child TRS to three parent Transform roots (father=0).
// Browser source package uses H=diag(-1,1,1,1); forward=Unity local +Z.
// These are SERIALIZED INITIAL world poses, not measured runtime door motion.
// Right/up retain the reflected Unity cookie basis; native UV convention and
// photometric transfer still require a paired render comparison.
const BROWSER_FROM_UNITY_X = 'browserWorld = H * sourceUnityWorld * H, H=diag(-1,1,1,1)';
const DOJO_INITIAL_WARNING_WORLD = Object.freeze({
  'level10::7089': Object.freeze({
    spotlight: Object.freeze({
      position: Object.freeze([16.010014, 1.700000, -17.900024]),
      direction: Object.freeze([-0.99999999982, 0, 0.00001898408]),
      right: Object.freeze([-0.00001898408, 0, -0.99999999982]),
      up: Object.freeze([0, 1, 0]),
    }),
    falseLightPosition: Object.freeze([13.100007, 1.700000, -17.899987]),
  }),
  'level10::7090': Object.freeze({
    spotlight: Object.freeze({
      position: Object.freeze([-4.149988, 2.700000, -12.039994]),
      direction: Object.freeze([-0.00000910372, 0, -0.99999999996]),
      right: Object.freeze([0.99999999996, 0, -0.00000910372]),
      up: Object.freeze([0, 1, 0]),
    }),
    falseLightPosition: Object.freeze([-4.149997, 2.700000, -14.950000]),
  }),
  'level10::7091': Object.freeze({
    spotlight: Object.freeze({
      position: Object.freeze([12.250015, 1.700000, -3.639992]),
      direction: Object.freeze([-0.00001171682, 0, -0.99999999993]),
      right: Object.freeze([0.99999999993, 0, -0.00001171682]),
      up: Object.freeze([0, 1, 0]),
    }),
    falseLightPosition: Object.freeze([12.249999, 1.700000, -6.549998]),
  }),
});

// Never replace a basis supplied by the private runtime package; even one
// explicit axis means the publisher must finish/validate the remaining axes.
// This fallback only enriches recognized, source-qualified Dojo doors.
function addSerializedInitialWorldBases(catalog) {
  return Object.fromEntries(Object.entries(catalog).map(([doorId, door]) => {
    const initial = DOJO_INITIAL_WARNING_WORLD[doorId];
    if (!initial || !door?.spotlight || !door?.falseLight) return [doorId, door];
    const hasExplicitSpotBasis = ['position', 'direction', 'right', 'up']
      .some(field => door.spotlight[field] != null);
    return [doorId, {
      ...door,
      spotlight: hasExplicitSpotBasis
        ? door.spotlight
        : { ...door.spotlight, ...initial.spotlight },
      falseLight: door.falseLight.position != null
        ? door.falseLight
        : { ...door.falseLight, position: initial.falseLightPosition },
    }];
  }));
}

const BY_SPAWN_GO = new Map(DOJO_DOOR_SOURCE_BINDINGS.map(binding =>
  [binding.spawnGameObjectPathId, binding]));

// J4 WEB CREATIVE TUNING, not a Unity light animation: one smooth warning
// sweep with broad breathing highlights. Reuses only the three verified Dojo
// light packets; adds no texture, proxy geometry, GPU pass or draw call.
const WEB_WARNING_SWEEP_RADIANS = 0.30;
const WEB_WARNING_PITCH_RADIANS = 0.15;
const WEB_WARNING_IRIS_FOCUS = 0.38;
const WEB_WARNING_RANGE_GAIN = 0.26;
const WEB_WARNING_INTENSITY_GAIN = 0.20;
const WEB_WARNING_MIN_CYCLE_SECONDS = 1.2;
// Web-only reactive telegraph: a nearby player in front of the original
// doorway subtly attracts the existing beam. The source warning clock and
// light/cookie identities are unchanged. No proxy, texture or GPU pass.
const WEB_WARNING_TRACK_INNER_METERS = 4;
const WEB_WARNING_TRACK_OUTER_METERS = 12;
const WEB_WARNING_TRACK_FACING_START = 0.60;
const WEB_WARNING_TRACK_FACING_FULL = 0.85;
const WEB_WARNING_TRACK_STRENGTH = 0.75;
const WEB_WARNING_TRACK_MAX_YAW = 0.43;
const WEB_WARNING_TRACK_MAX_PITCH = 0.22;
// J4 Web gameplay: the *accepted* spawn order already supplies its real
// world-space destination. During the warning's final half, steer the
// existing door beam toward that incoming route, rather than sweeping past
// it. This is creative telegraphing, NOT a serialized Unity animation.
const WEB_WARNING_SPAWN_MAX_METERS = 20;
const WEB_WARNING_SPAWN_MIN_FACING = 0.60;
const WEB_WARNING_SPAWN_FULL_FACING = 0.85;
const WEB_WARNING_SPAWN_MAX_YAW = 0.48;
const WEB_WARNING_SPAWN_MAX_PITCH = 0.24;
const WEB_WARNING_SPAWN_BLEND = 0.8;
// J4 Web art direction: one broad, smooth red anticipation crescendo as the
// accepted door-warning clock approaches enemy arrival. The extra radiance
// belongs to existing source-qualified spot/false-light packets, never a new
// lamp, a flashing overlay or native MCD behavior.
const WEB_WARNING_ARRIVAL_START = 0.57;
const WEB_WARNING_ARRIVAL_PEAK = 0.78;
const WEB_WARNING_ARRIVAL_END = 0.96;
const WEB_WARNING_ARRIVAL_SPOT_GAIN = 0.32;
const WEB_WARNING_ARRIVAL_FALSE_LIGHT_GAIN = 1.7;
const WEB_WARNING_ARRIVAL_IRIS_FOCUS = 0.12;
// J4 Web-authored floor wash: move the already existing red false-light
// through the real doorway as the warning approaches its peak. This reuses
// the same GPU light/slot, never spawns a lamp or an unverified scene mesh.
const WEB_WARNING_SPILL_FORWARD_METERS = 1.15;
const WEB_WARNING_SPILL_LATERAL_METERS = 0.35;
// Once a REAL enemy arrival has occurred, stop advertising a future spawn.
// Web-only fade in unscaled seconds: the source warning envelope itself remains
// on world time, but its extra incoming-threat glow/wash is released quickly.
const WEB_WARNING_ARRIVAL_RELEASE_PER_SECOND = 12;

function smooth01(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function finiteBasisVector(value) {
  return (Array.isArray(value) || (ArrayBuffer.isView(value) && !(value instanceof DataView))) &&
    value.length === 3 && Array.from(value).every(Number.isFinite);
}

/**
 * Web-authored beacon presentation layered over SH-07's source timing. The
 * source curve remains the authority for active/elapsed/range; no mutations of
 * the private scene catalog or SH-07 source values are allowed.
 * @param {object} catalog The prepared Dojo door catalog (read-only).
 * @param {ReturnType<typeof createMcdDoorWarnings>} controller Live source controller.
 * @param {ReturnType<typeof prepareNativeCollision> | null} collision Prepared solid Dojo blockers.
 * @returns {{advance: () => void, restore: (id?: string) => void}}
 */
function createWebWarningSweep(catalog, controller, collision) {
  const bases = new Map();
  for (const packet of controller.packets()) {
    const door = catalog[packet.id];
    const spotlight = packet.spotlight;
    const sourceDirection = spotlight.direction;
    const sourceRight = spotlight.right;
    const sourceUp = spotlight.up;
    let direction = null, right = null, up = null;
    if (finiteBasisVector(sourceDirection) && finiteBasisVector(sourceRight) &&
        finiteBasisVector(sourceUp)) {
      const dot = (a, b) => a.reduce((sum, n, axis) => sum + n * b[axis], 0);
      const unitBasis = [sourceDirection, sourceRight, sourceUp]
        .every(axis => Math.abs(Math.hypot(...axis) - 1) < 0.001);
      if (unitBasis && Math.abs(dot(sourceDirection, sourceRight)) < 0.001 &&
          Math.abs(dot(sourceDirection, sourceUp)) < 0.001 &&
          Math.abs(dot(sourceRight, sourceUp)) < 0.001) {
        direction = Array.from(sourceDirection);
        right = Array.from(sourceRight);
        up = Array.from(sourceUp);
        // Packet-owned vectors; never mutate private scene-package arrays.
        spotlight.direction = [...direction];
        spotlight.right = [...right];
        spotlight.up = [...up];
      }
    }
    // SH-07 shallow-copies the catalog light. Detach the mutable Web position
    // first: even a source-owned frozen array must never be animated in place.
    const fill = packet.falseLight.position;
    const falseLightPosition = direction && finiteBasisVector(fill)
      ? Array.from(fill) : null;
    if (falseLightPosition) packet.falseLight.position = [...falseLightPosition];
    bases.set(packet.id, {
      packet, direction, right, up, falseLightPosition, spawnTarget: null,
      // An accepted spawn's delay runs in REAL seconds, unlike the source
      // light curve. Null means the event supplied no qualified delay.
      arrivalRemaining: null,
      arrivalEmphasis: 1,
      urgency: 0, focusGain: 1,
      // Web-only damped reactive steering; normal lighthouse sweep stays exact.
      reactiveYaw: 0, reactivePitch: 0,
      intensity: door.spotlight.intensity,
      spotAngle: door.spotlight.spotAngle,
      duration: door.curve.at(-1).time,
    });
  }

  function restoreOne(base) {
    if (!base) return;
    base.spawnTarget = null; // No previous encounter target can survive REJOUER.
    base.arrivalRemaining = null;
    base.arrivalEmphasis = 1;
    base.focusGain = 1;
    base.reactiveYaw = base.reactivePitch = 0;
    const spotlight = base.packet.spotlight;
    if (base.direction) {
      for (let axis = 0; axis < 3; axis++) {
        spotlight.direction[axis] = base.direction[axis];
        spotlight.right[axis] = base.right[axis];
        spotlight.up[axis] = base.up[axis];
      }
    }
    spotlight.spotAngle = base.spotAngle;
    spotlight.intensity = base.intensity;
    if (base.falseLightPosition) {
      for (let axis = 0; axis < 3; axis++) {
        base.packet.falseLight.position[axis] = base.falseLightPosition[axis];
      }
    }
    if (!base.packet.active) spotlight.range = 0;
  }

  function restore(id) {
    if (id != null) {
      restoreOne(bases.get(id));
      return;
    }
    for (const base of bases.values()) restoreOne(base);
  }

  function setSpawnTarget(id, position, delaySeconds) {
    const base = bases.get(id);
    if (!base) return;
    // A source-qualified SpawnerPoint identity alone is not enough to aim:
    // require the actual finite position from that same accepted event.
    base.spawnTarget = position &&
      Number.isFinite(position.x) && Number.isFinite(position.y) &&
      Number.isFinite(position.z)
      ? [position.x, position.y, position.z] : null;
    base.arrivalRemaining = Number.isFinite(delaySeconds) && delaySeconds > 0
      ? delaySeconds : null;
    base.arrivalEmphasis = 1;
  }

  function advance(playerWorldPosition, worldDeltaSeconds, unscaledDeltaSeconds) {
    // J4 Web readability: when several real entrances warn simultaneously,
    // guide attention toward the threat closest to arrival. Preserve each
    // source clock, the three existing GPU light slots and the original
    // camera/spawn tracking. No extra meshes, lights, uniforms or draw calls.
    let activeCount = 0, totalUrgency = 0;
    for (const base of bases.values()) {
      if (!base.packet.active) continue;
      const phase = Math.max(0, Math.min(1, base.packet.elapsed / base.duration));
      // Do NOT rank spawn arrivals by the source warning's world-time phase:
      // native-spawner decrements pending arrivals with unscaledDeltaTime.
      // A fast imminent spawn must beat a slow one even while time crawls.
      // If the integrator has not passed real delta yet, preserve the
      // previous visual-only phase ranking rather than guess a time scale.
      if (unscaledDeltaSeconds != null && base.arrivalRemaining != null) {
        // A frame may straddle arrival: only its portion AFTER the real
        // countdown hits zero may fade the extra Web light. Fading the whole
        // frame causes an early light drop at low FPS / during a long frame.
        const afterArrivalSeconds = Math.max(0,
          unscaledDeltaSeconds - base.arrivalRemaining);
        base.arrivalRemaining = Math.max(0, base.arrivalRemaining - unscaledDeltaSeconds);
        // Preserve SH-07's separate world-time source lamp; this controls
        // only the additional Web anticipation glow and floor wash.
        if (afterArrivalSeconds > 0) {
          base.arrivalEmphasis *= Math.exp(
            -WEB_WARNING_ARRIVAL_RELEASE_PER_SECOND * afterArrivalSeconds);
        }
        base.urgency = base.arrivalRemaining > 0
          ? 0.05 + 1 / (0.25 + base.arrivalRemaining) ** 2 : 0.05;
      } else {
        base.urgency = 0.05 + phase ** 4;
      }
      totalUrgency += base.urgency;
      activeCount++;
    }
    // Priority fades in REAL time when an enemy arrives during slow motion;
    // the light sweep itself still obeys the world-time animation clock.
    const focusEase = 1 - Math.exp(-7 * (unscaledDeltaSeconds ?? worldDeltaSeconds));
    const playerKnown = playerWorldPosition != null &&
      Number.isFinite(playerWorldPosition.x) &&
      Number.isFinite(playerWorldPosition.y) &&
      Number.isFinite(playerWorldPosition.z);
    for (const base of bases.values()) {
      const { packet } = base;
      if (!packet.active) {
        restore(packet.id);
        continue;
      }
      // Do not accelerate the effect into a strobe for short source curves.
      const phase = Math.min(packet.elapsed / Math.max(
        base.duration, WEB_WARNING_MIN_CYCLE_SECONDS), 1);
      const sweep = Math.sin(2 * Math.PI * phase);
      const breathing = sweep * sweep;
      const focusTarget = activeCount > 1
        ? Math.max(0.65, Math.min(1.4,
          1 + 0.55 * (activeCount * base.urgency / totalUrgency - 1)))
        : 1;
      // Continuous transition when an alarm starts or expires: no one-frame
      // red flash, even if two spawns overlap at different phases.
      base.focusGain += (focusTarget - base.focusGain) * focusEase;
      // The source curve still determines whether a light exists, its range
      // and its final fade. This single slow Web crescendo makes the next
      // doorway threat legible without strobing or adding GPU submissions.
      const arrival = smooth01((phase - WEB_WARNING_ARRIVAL_START) /
          (WEB_WARNING_ARRIVAL_PEAK - WEB_WARNING_ARRIVAL_START)) *
        (1 - smooth01((phase - WEB_WARNING_ARRIVAL_PEAK) /
          (WEB_WARNING_ARRIVAL_END - WEB_WARNING_ARRIVAL_PEAK))) *
        base.arrivalEmphasis;
      // SH-07 has just sampled the original range; multiplication NEVER
      // compounds from the previous frame. The source envelope still fades.
      packet.spotlight.range *= 1 + WEB_WARNING_RANGE_GAIN * breathing;
      // SH-07 has already written this tick's source value. Never compound
      // the false light across frames, and never activate an inactive packet.
      if (Number.isFinite(packet.falseLight.intensity) &&
          packet.falseLight.intensity >= 0) {
        packet.falseLight.intensity *=
          (1 + WEB_WARNING_ARRIVAL_FALSE_LIGHT_GAIN * arrival) * base.focusGain;
      }
      if (Number.isFinite(base.intensity) && base.intensity >= 0) {
        packet.spotlight.intensity = base.intensity *
          (1 + WEB_WARNING_INTENSITY_GAIN * breathing +
            WEB_WARNING_ARRIVAL_SPOT_GAIN * arrival) * base.focusGain;
      }
      if (!base.direction) continue;
      // J4 Web-authored lighthouse: as the red beam sweeps sideways its
      // aperture tightens; halfway through it glides up the doorway.
      // Keep a smooth, single-cycle warning, never a high-frequency strobe.
      const sweepYaw = WEB_WARNING_SWEEP_RADIANS * sweep;
      const sweepPitch = WEB_WARNING_PITCH_RADIANS *
        Math.sin(Math.PI * phase) ** 2;
      let yaw = sweepYaw;
      let pitch = sweepPitch;

      // Interactive Web lighting: if a player is close enough to the beam
      // and actually in FRONT of its source, ease its sweep toward that
      // player during the warning's middle. Far/behind players preserve
      // the normal lighthouse motion. This is a local light-direction cue,
      // NOT a line-of-sight test or permission to draw through walls.
      const origin = packet.spotlight.position;
      if (base.spawnTarget && finiteBasisVector(origin)) {
        const dx = base.spawnTarget[0] - origin[0];
        const dy = base.spawnTarget[1] - origin[1];
        const dz = base.spawnTarget[2] - origin[2];
        const distance = Math.hypot(dx, dy, dz);
        if (distance > 1e-6 && distance < WEB_WARNING_SPAWN_MAX_METERS) {
          const forward = (dx * base.direction[0] + dy * base.direction[1] +
            dz * base.direction[2]) / distance;
          if (forward > WEB_WARNING_SPAWN_MIN_FACING) {
            const across = (dx * base.right[0] + dy * base.right[1] +
              dz * base.right[2]) / distance;
            const vertical = (dx * base.up[0] + dy * base.up[1] +
              dz * base.up[2]) / distance;
            const focus = WEB_WARNING_SPAWN_BLEND * base.arrivalEmphasis *
              smooth01((phase - 0.2) / 0.55) *
              smooth01((forward - WEB_WARNING_SPAWN_MIN_FACING) /
                (WEB_WARNING_SPAWN_FULL_FACING - WEB_WARNING_SPAWN_MIN_FACING));
            // A spawn behind solid Dojo cover must not turn the doorway's
            // warning cone through that wall. Like player tracking, use the
            // prepared active BoxColliders, never a guessed visibility mesh.
            // Check only an eligible live target; max one extra ray per door.
            const rayStart = focus > 0 && collision ? {
              x: origin[0] + dx / distance * 0.08,
              y: origin[1] + dy / distance * 0.08,
              z: origin[2] + dz / distance * 0.08,
            } : null;
            const blocked = rayStart && nativeSegmentHit(collision, rayStart, {
              x: base.spawnTarget[0], y: base.spawnTarget[1], z: base.spawnTarget[2],
            });
            if (focus > 0 && !blocked) {
              const aimYaw = Math.max(-WEB_WARNING_SPAWN_MAX_YAW,
                Math.min(WEB_WARNING_SPAWN_MAX_YAW, Math.atan2(across, forward)));
              const aimPitch = Math.max(-WEB_WARNING_SPAWN_MAX_PITCH,
                Math.min(WEB_WARNING_SPAWN_MAX_PITCH,
                  Math.atan2(vertical, Math.hypot(across, forward))));
              yaw += (aimYaw - yaw) * focus;
              pitch += (aimPitch - pitch) * focus;
            }
          }
        }
      }
      // Camera targeting gets the final say when the player is near the
      // warning. Distant players see the incoming spawn route instead.
      if (playerKnown && finiteBasisVector(origin)) {
        const dx = playerWorldPosition.x - origin[0];
        const dy = playerWorldPosition.y - origin[1];
        const dz = playerWorldPosition.z - origin[2];
        const distance = Math.hypot(dx, dy, dz);
        if (distance > 1e-6 && distance < WEB_WARNING_TRACK_OUTER_METERS) {
          const forward = (dx * base.direction[0] + dy * base.direction[1] +
            dz * base.direction[2]) / distance;
          const across = (dx * base.right[0] + dy * base.right[1] +
            dz * base.right[2]) / distance;
          const vertical = (dx * base.up[0] + dy * base.up[1] +
            dz * base.up[2]) / distance;
          const near = 1 - smooth01((distance - WEB_WARNING_TRACK_INNER_METERS) /
            (WEB_WARNING_TRACK_OUTER_METERS - WEB_WARNING_TRACK_INNER_METERS));
          const facing = smooth01((forward - WEB_WARNING_TRACK_FACING_START) /
            (WEB_WARNING_TRACK_FACING_FULL - WEB_WARNING_TRACK_FACING_START));
          const weight = WEB_WARNING_TRACK_STRENGTH * near * facing *
            Math.sin(Math.PI * phase) ** 2;
          // J4 Web cover readability: do not let the door beam deliberately
          // follow the player's hidden position through a solid Dojo box.
          // Reuse the exact active BoxCollider sight query already used by
          // gunplay; never infer visibility from world mesh render bounds.
          // Shift the ray origin 8cm along the eye vector so the lamp's own
          // mounting surface cannot self-occlude a doorway.
          const rayStart = weight > 0 && collision ? {
            x: origin[0] + dx / distance * 0.08,
            y: origin[1] + dy / distance * 0.08,
            z: origin[2] + dz / distance * 0.08,
          } : null;
          const blocked = rayStart && nativeSegmentHit(collision, rayStart, playerWorldPosition);
          if (weight > 0 && !blocked) {
            const aimYaw = Math.max(-WEB_WARNING_TRACK_MAX_YAW,
              Math.min(WEB_WARNING_TRACK_MAX_YAW, Math.atan2(across, forward)));
            const aimPitch = Math.max(-WEB_WARNING_TRACK_MAX_PITCH,
              Math.min(WEB_WARNING_TRACK_MAX_PITCH,
                Math.atan2(vertical, Math.hypot(across, forward))));
            yaw += (aimYaw - yaw) * weight;
            pitch += (aimPitch - pitch) * weight;
          }
        }
      }
      // SH-04 Web polish: smoothly interpolate ONLY the player/spawn reaction.
      // The deterministic 3D lighthouse sweep remains on its authored Web
      // clock, while a camera crossing the doorway or a new spawn cue cannot
      // snap the cone and moving red wash in a single 16 ms frame. A fixed
      // exponential time constant is frame-rate independent, has no heap cost,
      // and returns to the sweep when tracking is no longer eligible.
      const reactiveEase = 1 - Math.exp(-14 * worldDeltaSeconds);
      base.reactiveYaw += (yaw - sweepYaw - base.reactiveYaw) * reactiveEase;
      base.reactivePitch += (pitch - sweepPitch - base.reactivePitch) * reactiveEase;
      yaw = sweepYaw + base.reactiveYaw;
      pitch = sweepPitch + base.reactivePitch;
      const cosYaw = Math.cos(yaw), sinYaw = Math.sin(yaw);
      const cosPitch = Math.cos(pitch), sinPitch = Math.sin(pitch);
      // One soft, moving patch of red light travels outward through the
      // doorway, following the live beam's yaw (which may track a player or
      // the accepted enemy spawn). It recedes before the source warning ends.
      // All movement is relative to the verified initial false-light pose.
      const spill = base.falseLightPosition
        ? smooth01((phase - 0.12) / 0.55) *
          (1 - smooth01((phase - 0.78) / 0.18)) * base.arrivalEmphasis : 0;
      packet.spotlight.spotAngle = base.spotAngle *
        (1 - WEB_WARNING_IRIS_FOCUS * breathing -
          WEB_WARNING_ARRIVAL_IRIS_FOCUS * arrival);
      for (let axis = 0; axis < 3; axis++) {
        const yawedDirection = base.direction[axis] * cosYaw +
          base.right[axis] * sinYaw;
        packet.spotlight.direction[axis] =
          yawedDirection * cosPitch + base.up[axis] * sinPitch;
        packet.spotlight.right[axis] =
          base.right[axis] * cosYaw - base.direction[axis] * sinYaw;
        packet.spotlight.up[axis] =
          base.up[axis] * cosPitch - yawedDirection * sinPitch;
        if (base.falseLightPosition) {
          packet.falseLight.position[axis] = base.falseLightPosition[axis] +
            yawedDirection * WEB_WARNING_SPILL_FORWARD_METERS * spill +
            packet.spotlight.right[axis] *
              WEB_WARNING_SPILL_LATERAL_METERS * sweep * spill;
        }
      }
    }
  }
  return Object.freeze({ advance, restore, setSpawnTarget });
}

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
  const qualifiedWorldBasis = qualified &&
    scene?.coordinateSpace?.browserFromUnity === BROWSER_FROM_UNITY_X;
  const preparedCatalog = qualified && hasCatalog
    ? (qualifiedWorldBasis ? addSerializedInitialWorldBases(catalog) : catalog)
    : null;
  const controller = preparedCatalog ? createMcdDoorWarnings(preparedCatalog) : null;
  // The same source BoxColliders as the live Dojo movement/weapon systems,
  // prepared once rather than rebuilding them each warning frame. No collider
  // data means no invented occlusion and retains the existing sweep behavior.
  const collision = controller && Array.isArray(scene?.colliders) && scene.colliders.length
    ? prepareNativeCollision(scene.colliders) : null;
  const webSweep = controller ? createWebWarningSweep(preparedCatalog, controller, collision) : null;
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
    webSweep?.restore(doorKey); // Re-trigger starts centered, without stale sweep.
    webSweep?.setSpawnTarget(doorKey, event.point?.position, event.delay);
    return outcome('triggered', { spawnPathId, doorKey });
  }

  /**
   * @param {number} worldDeltaSeconds
   * @param {{x: number, y: number, z: number} | null} [playerWorldPosition]
   *   Optional live camera/eye position in browser world coordinates. SH-05
   *   owns passing it from main; omission preserves the current visual.
   * @param {number | null} [unscaledDeltaSeconds]
   *   Same real-time dt used by advanceNativeEncounter's unscaledDeltaTime;
   *   omitted for backwards-compatible visual-only threat ranking.
   * @returns {ReturnType<ReturnType<typeof createMcdDoorWarnings>['packets']>}
   */
  function advance(worldDeltaSeconds, playerWorldPosition = null, unscaledDeltaSeconds = null) {
    // Preserve SH-07 world-clock semantics: DO NOT use the spawner's
    // unscaledDeltaTime for the light's animation curve.
    if (!Number.isFinite(worldDeltaSeconds) || worldDeltaSeconds < 0) {
      throw new RangeError('worldDeltaSeconds must be finite and nonnegative');
    }
    if (unscaledDeltaSeconds != null &&
        (!Number.isFinite(unscaledDeltaSeconds) || unscaledDeltaSeconds < 0)) {
      throw new RangeError('unscaledDeltaSeconds must be finite and nonnegative');
    }
    if (!controller) return [];
    const packets = controller.advance(worldDeltaSeconds);
    webSweep.advance(playerWorldPosition, worldDeltaSeconds, unscaledDeltaSeconds);
    return packets;
  }

  return Object.freeze({
    readiness,
    accept,
    advance,
    packets: () => controller?.packets() ?? [],
    reset: () => {
      controller?.reset();
      webSweep?.restore();
    },
  });
}
