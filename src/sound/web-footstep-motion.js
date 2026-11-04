/**
 * A Web-only walking accent: one step per 1.3 horizontal world metres.
 * Call after actual player movement with the resolved ground-contact state;
 * camera look, idle frames, airborne movement and teleports make no step.
 */
export function createWebFootstepMotion(emit) {
    if (typeof emit !== 'function')
        throw new TypeError('step emitter required');
    const metresPerStep = 1.3;
    const maxFrameTravel = 1.0;
    const maxFrameGap = 0.3;
    let previous = null;
    let previousTime = null;
    let pendingMetres = 0;
    let groundedBaseline = false;
    let airborneSince = null;
    let airborneFrames = 0;
    let lastAirPosition = null;
    function reset() {
        previous = null;
        previousTime = null;
        pendingMetres = 0;
        groundedBaseline = false;
        airborneSince = null;
        airborneFrames = 0;
        lastAirPosition = null;
    }
    function advance({ position, grounded, timeSeconds }) {
        if (!position || ![position.x, position.y, position.z].every(Number.isFinite)) {
            throw new TypeError('step position must be finite');
        }
        if (typeof grounded !== 'boolean' || !Number.isFinite(timeSeconds)) {
            throw new TypeError('step grounded/timeSeconds invalid');
        }
        // Callers often move a single camera object in place each frame.
        // Never retain that reference: the next frame must compare two snapshots.
        const current = { x: position.x, y: position.y, z: position.z };
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
        if (timeSeconds === previousTime)
            return null;
        if (!grounded) {
            if (groundedBaseline && airborneSince === null)
                airborneSince = timeSeconds;
            if (airborneSince !== null)
                airborneFrames++;
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
                finalTravel <= maxFrameTravel;
            airborneSince = null;
            airborneFrames = 0;
            lastAirPosition = null;
            groundedBaseline = true;
            previous = current;
            previousTime = timeSeconds;
            pendingMetres = 0;
            // Creative Web-only contact thud, not a Unity animation/event marker.
            return validLanding ? emit('landing', { position: current,
                intensity: Math.min(1.1, 0.55 + airtime * 0.35) }) : null;
        }
        groundedBaseline = true;
        if (previous === null) {
            previous = current;
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
        if (pendingMetres < metresPerStep)
            return null;
        pendingMetres %= metresPerStep;
        // More movement in the same real-time interval makes a stronger Web step.
        const speed = distance / Math.max(dt, 1 / 120);
        const intensity = Math.min(1, Math.max(0.45, speed / 4.5));
        return emit('step', { position: current, intensity });
    }
    return Object.freeze({ advance, reset });
}
