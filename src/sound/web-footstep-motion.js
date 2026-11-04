/**
 * A Web-only walking accent: one step per 1.3 horizontal world metres.
 * Call after actual player movement with the resolved ground-contact state;
 * Camera look, idle frames and airborne movement itself remain silent; a
 * real grounded return after a substantial jump makes a stronger footfall.
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
    let airborneSince = null;
    let airborneApexY = null;
    function reset() {
        previous = null;
        previousTime = null;
        pendingMetres = 0;
        airborneSince = null;
        airborneApexY = null;
    }
    function advance({ position, grounded, timeSeconds }) {
        if (!position || ![position.x, position.y, position.z].every(Number.isFinite)) {
            throw new TypeError('step position must be finite');
        }
        if (typeof grounded !== 'boolean' || !Number.isFinite(timeSeconds)) {
            throw new TypeError('step grounded/timeSeconds invalid');
        }
        if (!grounded) {
            const continuous = airborneSince !== null && previousTime !== null &&
                timeSeconds >= previousTime && timeSeconds - previousTime <= maxFrameGap;
            airborneSince = continuous ? airborneSince : timeSeconds;
            airborneApexY = continuous
                ? Math.max(airborneApexY ?? position.y, position.y) : position.y;
            previous = null;
            previousTime = timeSeconds;
            pendingMetres = 0;
            return null;
        }
        if (airborneSince !== null) {
            const airDuration = timeSeconds - airborneSince;
            const descent = (airborneApexY ?? position.y) - position.y;
            const continuous = previousTime !== null && timeSeconds >= previousTime &&
                timeSeconds - previousTime <= maxFrameGap;
            airborneSince = null;
            airborneApexY = null;
            previous = position;
            previousTime = timeSeconds;
            pendingMetres = 0;
            // Creative Web landing feedback, not an MCD animation/audio marker.
            // Continuity, airborne duration and vertical displacement avoid a
            // phantom stomp on pauses, short steps, teleports and replay.
            if (continuous && airDuration >= 0.16 && descent >= 0.32) {
                return emit('step', { position, intensity: Math.min(1.65, 0.8 + descent * 0.55) });
            }
            return null;
        }
        if (previous === null || previousTime === null || timeSeconds < previousTime ||
            timeSeconds - previousTime > maxFrameGap) {
            previous = position;
            previousTime = timeSeconds;
            pendingMetres = 0;
            return null;
        }
        const dt = timeSeconds - previousTime;
        const distance = Math.hypot(position.x - previous.x, position.z - previous.z);
        previous = position;
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
        return emit('step', { position, intensity });
    }
    return Object.freeze({ advance, reset });
}
