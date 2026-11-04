/**
 * SH-07: distance-driven footsteps for the playable Web Dojo.
 * These are Web-authored gait values, NOT recovered Unity animation markers.
 * A returned `started` receipt means scheduled audio, not verified audibility.
 */
import type {WebImpactPoint, WebImpactResult} from './web-impact-mix.js';

export interface WebFootstepFrame {
  readonly position: WebImpactPoint;
  readonly grounded: boolean;
  /** Unscaled AudioContext seconds: used only to reject pauses and rewinds. */
  readonly timeSeconds: number;
}

export type WebStepEmitter = (cue: 'step' | 'landing', request: {
  readonly position: WebImpactPoint;
  readonly intensity: number;
}) => WebImpactResult;

/**
 * A Web-only walking accent: one step per 1.3 horizontal world metres.
 * Call after actual player movement with the resolved ground-contact state;
 * camera look, idle frames, airborne movement and teleports make no step.
 */
export function createWebFootstepMotion(emit: WebStepEmitter) {
  if (typeof emit !== 'function') throw new TypeError('step emitter required');
  const metresPerStep = 1.3;
  // Web gait policy: valid grounded movement can exceed 1 m in a slow frame.
  // A speed cap preserves strides while rejecting implausible teleports.
  // These are creative Web limits, not recovered MCD movement constants.
  const maxFrameTravel = 2.5;
  const maxGroundMetresPerSecond = 10;
  const maxAllowedTravel = (elapsedSeconds: number): number =>
    Math.min(maxFrameTravel, Math.max(0.05, elapsedSeconds * maxGroundMetresPerSecond));
  const maxFrameGap = 0.3;
  // Web-authored shoe locations: gameplay passes the camera/ear position.
  // Put ground contacts below the ears, and alternate modest lateral feet.
  const footDownFromCamera = 1.25;
  const footLateralOffset = 0.22;
  let footSide = -1;
  let previous: WebImpactPoint | null = null;
  let previousTime: number | null = null;
  let pendingMetres = 0;
  let groundedBaseline = false;
  let airborneSince: number | null = null;
  let airborneFrames = 0;
  let lastAirPosition: WebImpactPoint | null = null;

  function reset(): void {
    previous = null;
    previousTime = null;
    pendingMetres = 0;
    groundedBaseline = false;
    airborneSince = null;
    airborneFrames = 0;
    lastAirPosition = null;
    footSide = -1;
  }

  function advance({position, grounded, timeSeconds}: WebFootstepFrame): WebImpactResult | null {
    if (!position || ![position.x, position.y, position.z].every(Number.isFinite)) {
      throw new TypeError('step position must be finite');
    }
    if (typeof grounded !== 'boolean' || !Number.isFinite(timeSeconds)) {
      throw new TypeError('step grounded/timeSeconds invalid');
    }
    // Callers often move a single camera object in place each frame.
    // Never retain that reference: the next frame must compare two snapshots.
    const current: WebImpactPoint = {x: position.x, y: position.y, z: position.z};
    // A landing needs an established grounded baseline and consecutive air
    // samples. One-frame contact jitter or a fresh run must stay silent.
    if (previousTime === null || timeSeconds < previousTime ||
        timeSeconds - previousTime > maxFrameGap) {
      previous = grounded ? current : null;
      previousTime = timeSeconds;
      pendingMetres = 0;
      groundedBaseline = grounded;
      airborneSince = null;
      airborneFrames = 0;
      lastAirPosition = null;
      return null;
    }
    if (timeSeconds === previousTime) return null;
    if (!grounded) {
      if (groundedBaseline && airborneSince === null) airborneSince = timeSeconds;
      if (airborneSince !== null) airborneFrames++;
      lastAirPosition = current;
      groundedBaseline = false;
      previous = null;
      previousTime = timeSeconds;
      pendingMetres = 0;
      return null;
    }
    if (airborneSince !== null) {
      const airtime = timeSeconds - airborneSince;
      const finalTravel = lastAirPosition === null ? Infinity :
        Math.hypot(current.x - lastAirPosition.x, current.z - lastAirPosition.z);
      const validLanding = airborneFrames >= 2 && airtime >= 0.08 &&
        finalTravel <= maxAllowedTravel(timeSeconds - previousTime);
      airborneSince = null;
      airborneFrames = 0;
      lastAirPosition = null;
      groundedBaseline = true;
      previous = current;
      previousTime = timeSeconds;
      pendingMetres = 0;
      // Creative Web-only contact thud, not a Unity animation/event marker.
      return validLanding ? emit('landing', {position: {...current, y: current.y - footDownFromCamera},
        intensity: Math.min(1.1, 0.55 + airtime * 0.35)}) : null;
    }
    groundedBaseline = true;
    if (previous === null) {
      previous = current;
      previousTime = timeSeconds;
      pendingMetres = 0;
      return null;
    }
    const dt = timeSeconds - previousTime;
    const dx = current.x - previous.x;
    const dz = current.z - previous.z;
    const distance = Math.hypot(dx, dz);
    previous = current;
    previousTime = timeSeconds;
    if (distance > maxAllowedTravel(dt)) {
      pendingMetres = 0; // Spawn, fast-travel or focus recovery, not a stride.
      return null;
    }
    pendingMetres += distance;
    if (pendingMetres < metresPerStep) return null;
    pendingMetres %= metresPerStep;
    // More movement in the same real-time interval makes a stronger Web step.
    const speed = distance / Math.max(dt, 1 / 120);
    const intensity = Math.min(1, Math.max(0.45, speed / 4.5));
    // Lateral offset is perpendicular to movement, never a guessed MCD bone marker.
    const side = footSide * footLateralOffset;
    footSide = -footSide;
    const contact: WebImpactPoint = {
      x: current.x - dz / distance * side,
      y: current.y - footDownFromCamera,
      z: current.z + dx / distance * side,
    };
    return emit('step', {position: contact, intensity});
  }

  return Object.freeze({advance, reset});
}
