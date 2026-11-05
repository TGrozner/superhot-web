/**
 * A Web-only walking accent: one step per 1.3 horizontal world metres.
 * Call after actual player movement with the resolved ground-contact state;
 * camera look, idle frames, airborne movement and teleports make no step.
 */
export function createWebFootstepMotion(emit) {
    if (typeof emit !== 'function')
        throw new TypeError('step emitter required');
    const metresPerStep = 1.3;
    // Web game-feel: the first foot plants sooner after a stop or spawn.
    // Distances and times are creative Web tuning, not MCD animation markers.
    const firstContactMetres = 0.75;
    const idleRearmSeconds = 0.4;
    const idleTravelTolerance = 0.005;
    // Web gait policy: valid grounded movement can exceed 1 m in a slow frame.
    // A speed cap preserves strides while rejecting implausible teleports.
    // These are creative Web limits, not recovered MCD movement constants.
    const maxFrameTravel = 2.5;
    const maxGroundMetresPerSecond = 10;
    const maxAllowedTravel = (elapsedSeconds) => Math.min(maxFrameTravel, Math.max(0.05, elapsedSeconds * maxGroundMetresPerSecond));
    const maxFrameGap = 0.3;
    // Web-only landing weight: use the peak eye height to distinguish balcony
    // drops from short hops, while rejecting one-frame vertical snap/respawn.
    const maxLandingVerticalMetresPerSecond = 30;
    const maxLandingDropBoost = 0.45;
    // Web-authored shoe locations: gameplay passes the camera/ear position.
    // Put ground contacts below the ears, and alternate modest lateral feet.
    const footDownFromCamera = 1.25;
    const footLateralOffset = 0.22;
    let footSide = -1;
    let previous = null;
    let previousTime = null;
    let pendingMetres = 0;
    let awaitingFirstContact = true;
    let idleSeconds = 0;
    let groundedBaseline = false;
    let airborneSince = null;
    let airborneFrames = 0;
    let lastAirPosition = null;
    let highestAirY = null;
    function reset() {
        previous = null;
        previousTime = null;
        pendingMetres = 0;
        awaitingFirstContact = true;
        idleSeconds = 0;
        groundedBaseline = false;
        airborneSince = null;
        airborneFrames = 0;
        lastAirPosition = null;
        highestAirY = null;
        footSide = -1;
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
            awaitingFirstContact = true;
            idleSeconds = 0;
            groundedBaseline = grounded;
            airborneSince = null;
            airborneFrames = 0;
            lastAirPosition = null;
            highestAirY = null;
            return null;
        }
        if (timeSeconds === previousTime)
            return null;
        if (!grounded) {
            // Web-only continuity gate: respawns can relocate the camera mid-air.
            // Check every airborne sample, not just the last frame of a landing.
            // An interrupted flight cannot re-arm until a new grounded baseline.
            const lastPosition = lastAirPosition ?? previous;
            const elapsed = timeSeconds - previousTime;
            const discontinuity = lastPosition !== null && (Math.hypot(current.x - lastPosition.x, current.z - lastPosition.z) > maxAllowedTravel(elapsed) ||
                Math.abs(current.y - lastPosition.y) > Math.min(maxFrameTravel, Math.max(0.05, elapsed * maxLandingVerticalMetresPerSecond)));
            if (discontinuity) {
                airborneSince = null;
                airborneFrames = 0;
                highestAirY = null;
            }
            if (!discontinuity && groundedBaseline && airborneSince === null) {
                airborneSince = timeSeconds;
                highestAirY = previous?.y ?? current.y;
            }
            if (!discontinuity && airborneSince !== null) {
                airborneFrames++;
                highestAirY = Math.max(highestAirY ?? current.y, current.y);
            }
            lastAirPosition = current;
            groundedBaseline = false;
            previous = null;
            previousTime = timeSeconds;
            pendingMetres = 0;
            awaitingFirstContact = true;
            idleSeconds = 0;
            return null;
        }
        if (airborneSince !== null) {
            const airtime = timeSeconds - airborneSince;
            const finalTravel = lastAirPosition === null ? Infinity :
                Math.hypot(current.x - lastAirPosition.x, current.z - lastAirPosition.z);
            const finalVerticalTravel = lastAirPosition === null ? Infinity :
                Math.abs(current.y - lastAirPosition.y);
            const maxVerticalTravel = Math.min(maxFrameTravel, Math.max(0.05, (timeSeconds - previousTime) * maxLandingVerticalMetresPerSecond));
            const dropHeight = Math.max(0, (highestAirY ?? current.y) - current.y);
            const validLanding = airborneFrames >= 2 && airtime >= 0.08 &&
                finalTravel <= maxAllowedTravel(timeSeconds - previousTime) &&
                finalVerticalTravel <= maxVerticalTravel;
            airborneSince = null;
            airborneFrames = 0;
            lastAirPosition = null;
            highestAirY = null;
            groundedBaseline = true;
            previous = current;
            previousTime = timeSeconds;
            pendingMetres = 0;
            // A true landing already makes contact; don't double-clap the next stride.
            awaitingFirstContact = !validLanding;
            idleSeconds = 0;
            // Creative Web-only contact thud. Height adds weight without making
            // ordinary hops deafening; never infer native fall velocity/clip mapping.
            const intensity = Math.min(1.4, 0.55 + airtime * 0.35 +
                Math.min(maxLandingDropBoost, dropHeight * 0.18));
            return validLanding ? emit('landing', { position: { ...current, y: current.y - footDownFromCamera },
                intensity }) : null;
        }
        groundedBaseline = true;
        if (previous === null) {
            previous = current;
            previousTime = timeSeconds;
            pendingMetres = 0;
            awaitingFirstContact = true;
            idleSeconds = 0;
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
            awaitingFirstContact = true;
            idleSeconds = 0;
            return null;
        }
        // Rest/jitter cannot fake a shoe contact; rearm after sustained stillness.
        if (distance <= idleTravelTolerance) {
            idleSeconds += dt;
            if (idleSeconds >= idleRearmSeconds) {
                pendingMetres = 0;
                awaitingFirstContact = true;
            }
            return null;
        }
        idleSeconds = 0;
        pendingMetres += distance;
        const contactMetres = awaitingFirstContact ? firstContactMetres : metresPerStep;
        if (pendingMetres < contactMetres)
            return null;
        pendingMetres = Math.max(0, pendingMetres - contactMetres);
        awaitingFirstContact = false;
        // More movement in the same real-time interval makes a stronger Web step.
        const speed = distance / Math.max(dt, 1 / 120);
        const intensity = Math.min(1, Math.max(0.45, speed / 4.5));
        // Lateral offset is perpendicular to movement, never a guessed MCD bone marker.
        const side = footSide * footLateralOffset;
        footSide = -footSide;
        const contact = {
            x: current.x - dz / distance * side,
            y: current.y - footDownFromCamera,
            z: current.z + dx / distance * side,
        };
        return emit('step', { position: contact, intensity });
    }
    return Object.freeze({ advance, reset });
}
