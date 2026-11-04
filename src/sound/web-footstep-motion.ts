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

export type WebStepEmitter = (cue: 'step', request: {
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
  const maxFrameTravel = 1.0;
  const maxFrameGap = 0.3;
  let previous: WebImpactPoint | null = null;
  let previousTime: number | null = null;
  let pendingMetres = 0;

  function reset(): void {
    previous = null;
    previousTime = null;
    pendingMetres = 0;
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
    if (!grounded || previous === null || previousTime === null ||
        timeSeconds < previousTime || timeSeconds - previousTime > maxFrameGap) {
      previous = grounded ? current : null;
      previousTime = timeSeconds;
      pendingMetres = 0;
      return null;
    }
    const dt = timeSeconds - previousTime;
    const distance = Math.hypot(current.x - previous.x, current.z - previous.z);
    previous = current;
    previousTime = timeSeconds;
    if (distance > maxFrameTravel) {
      pendingMetres = 0; // Spawn, fast-travel or focus recovery, not a stride.
      return null;
    }
    pendingMetres += distance;
    if (pendingMetres < metresPerStep) return null;
    pendingMetres %= metresPerStep;
    // More movement in the same real-time interval makes a stronger Web step.
    const speed = distance / Math.max(dt, 1 / 120);
    const intensity = Math.min(1, Math.max(0.45, speed / 4.5));
    return emit('step', {position: current, intensity});
  }

  return Object.freeze({advance, reset});
}
