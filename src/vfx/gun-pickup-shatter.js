/**
 * Source-bounded GunPickup.ShatterInternal commands for a *confirmed* shatter.
 * MCD build 20299547, private managed/Assembly-CSharp/GunPickup.cs:784-855,
 * research issue #76, artifact 13137959097. No commercial assets/geometry.
 *
 * This is NOT a PhysX implementation and does not determine if a pickup
 * shatters. The caller owns the actual shard centers, random samples and
 * native branch selection; no source meshes or clips are shipped here.
 */
const SOURCE = Object.freeze({
  inheritedVelocityDivisor: 10,
  shardMass: 0.15,
  radialImpulse: 0.25,
  angularDrag: 0,
  disappearDuration: 0.125,
});

function finiteNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be finite`);
  }
  return value;
}

function finiteVector(value, name) {
  if (!value || typeof value !== 'object') throw new TypeError(`${name} must be a vector`);
  return {
    x: finiteNumber(value.x, `${name}.x`),
    y: finiteNumber(value.y, `${name}.y`),
    z: finiteNumber(value.z, `${name}.z`),
  };
}

function validateSamples(shardCenters, torqueSamples, fadeDelays) {
  if (!Array.isArray(shardCenters) || !Array.isArray(torqueSamples) || !Array.isArray(fadeDelays)) {
    throw new TypeError('shardCenters, torqueSamples and fadeDelays must be arrays');
  }
  // Protective browser budget, NOT a native maximum.
  if (shardCenters.length > 256) throw new RangeError('Web shard budget is 256');
  if (torqueSamples.length !== shardCenters.length || fadeDelays.length !== shardCenters.length) {
    throw new RangeError('one torque sample and delay required per shard');
  }
  const centers = shardCenters.map((center, i) => finiteVector(center, `shardCenters[${i}]`));
  const torques = torqueSamples.map((sample, i) => {
    const vec = finiteVector(sample, `torqueSamples[${i}]`);
    if (Math.hypot(vec.x, vec.y, vec.z) > 1 + 1e-12) {
      throw new RangeError(`torqueSamples[${i}] must be inside the unit sphere`);
    }
    return vec;
  });
  const delays = fadeDelays.map((delay, i) => {
    finiteNumber(delay, `fadeDelays[${i}]`);
    // Caller-supplied realization of RandomManager.GetNextRandomBetween(0,2).
    if (delay < 0 || delay > 2) throw new RangeError(`fadeDelays[${i}] must be in [0,2]`);
    return delay;
  });
  return { centers, torques, delays };
}

/**
 * Make a command plan for a caller-confirmed GunPickup shatter. The precise
 * source branch needs a non-null shatteredInstance and an existing Rigidbody,
 * OR attachToEnemy=true (in which case missing parent velocity becomes zero).
 * All Unity side effects remain the responsibility of the caller.
 */
export function planGunPickupShatter({
  alreadyShattered, hasShardInstance, attachedToEnemy, parentVelocity,
  shardCenters, torqueSamples, fadeDelays,
}) {
  if (typeof alreadyShattered !== 'boolean' || typeof hasShardInstance !== 'boolean' ||
      typeof attachedToEnemy !== 'boolean') {
    throw new TypeError('source branch booleans must be explicit');
  }
  if (alreadyShattered) return { status: 'already-shattered', shards: [] };
  if (!hasShardInstance) return { status: 'no-shard-instance', shards: [] };
  if (parentVelocity === null && !attachedToEnemy) {
    // Native code recursively calls Shatter(); this path must be investigated
    // rather than replaced with guessed shard motion.
    return { status: 'native-fallback-unmodeled', shards: [] };
  }
  const velocity = parentVelocity === null
    ? { x: 0, y: 0, z: 0 }
    : finiteVector(parentVelocity, 'parentVelocity');
  const { centers, torques, delays } = validateSamples(shardCenters, torqueSamples, fadeDelays);
  const centroid = { x: 0, y: 0, z: 0 };
  for (const center of centers) {
    centroid.x += center.x;
    centroid.y += center.y;
    centroid.z += center.z;
  }
  if (centers.length) {
    for (const axis of ['x', 'y', 'z']) centroid[axis] /= centers.length;
  }
  const shards = centers.map((position, index) => {
    const delta = {
      x: position.x - centroid.x,
      y: position.y - centroid.y,
      z: position.z - centroid.z,
    };
    const length = Math.hypot(delta.x, delta.y, delta.z);
    const impulse = length > 0 ? {
      x: SOURCE.radialImpulse * delta.x / length,
      y: SOURCE.radialImpulse * delta.y / length,
      z: SOURCE.radialImpulse * delta.z / length,
    } : { x: 0, y: 0, z: 0 };
    const inheritedVelocity = {
      x: velocity.x / SOURCE.inheritedVelocityDivisor,
      y: velocity.y / SOURCE.inheritedVelocityDivisor,
      z: velocity.z / SOURCE.inheritedVelocityDivisor,
    };
    if (![...Object.values(impulse), ...Object.values(inheritedVelocity)].every(Number.isFinite)) {
      throw new RangeError('shatter command overflow');
    }
    return {
      index,
      position,
      velocity: inheritedVelocity,
      impulse,
      impulseMode: 'Impulse',
      mass: SOURCE.shardMass,
      angularDrag: SOURCE.angularDrag,
      interpolation: 'Interpolate',
      torque: torques[index],
      disappear: { duration: SOURCE.disappearDuration, delay: delays[index] },
    };
  });
  return {
    status: 'planned',
    centroid,
    shards,
    audioRequest: 'ShatterSoundPrefab',
    // A plan does not imply an audible sound or any registered asset.
  };
}

/**
 * ORIGINAL WEB SUBSTITUTE: convert a native-shaped impulse command into an
 * idealized particle, ignoring Rigidbody constraints, angular motion,
 * collisions, integration subtleties and native HDRPhaseManager easing.
 * Parameters for rendering/gravity are caller-authored, not MCD constants.
 */
export function sampleGunPickupShatterProxy(plan, elapsed, { gravity, size, color }) {
  finiteNumber(elapsed, 'elapsed');
  if (elapsed < 0) throw new RangeError('elapsed must be non-negative');
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.shards)) {
    throw new TypeError('plan must be a shatter plan');
  }
  const acceleration = finiteVector(gravity, 'gravity');
  finiteNumber(size, 'size');
  if (size <= 0) throw new RangeError('size must be positive');
  if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) {
    throw new TypeError('color must be #RRGGBB');
  }
  const primitives = [];
  for (const shard of plan.shards) {
    const { delay, duration } = shard.disappear;
    if (elapsed >= delay + duration) continue;
    // Linear size fade is a Web-only choice; source specifies only register
    // duration/delay and does not prove HDRPhaseManager's visual curve.
    const fade = elapsed <= delay ? 1 : Math.max(0, 1 - (elapsed - delay) / duration);
    const packet = { size: size * fade, color };
    for (const axis of ['x', 'y', 'z']) {
      const idealizedInitialVelocity = shard.velocity[axis] + shard.impulse[axis] / shard.mass;
      packet[axis] = shard.position[axis] + idealizedInitialVelocity * elapsed +
        acceleration[axis] * (elapsed / 2) * elapsed;
    }
    if (![packet.size, packet.x, packet.y, packet.z].every(Number.isFinite)) {
      throw new RangeError('shatter proxy overflow');
    }
    primitives.push(packet);
  }
  return { active: primitives.length > 0, primitives };
}
