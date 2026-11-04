import { advanceNativeFragmentBody } from './native-fragment-physics.js';

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

// Visual-only Web spin for the already authored shard meshes. The recovered
// AddTorque vector is a direction/impulse, NOT a known angular velocity:
// translating it into one revolution/second at unit magnitude is creative.
const WEB_SHARD_SPIN_RADIANS_PER_SECOND = 2 * Math.PI;

function applyWebShardSpin(shard, elapsed, ratio, anchorCollisionCenter) {
  const {x,y,z} = shard.torque;
  const strength = Math.hypot(x,y,z);
  if (strength < 1e-9 || !shard.visible) return;
  const axisX=x/strength, axisY=y/strength, axisZ=z/strength;
  const angle=WEB_SHARD_SPIN_RADIANS_PER_SECOND*strength*elapsed;
  const c=Math.cos(angle), sn=Math.sin(angle), t=1-c;
  // Rodrigues rotation, column-major. Rotate the ORIGINAL 3x3 each frame,
  // never accumulate orientation error or depend on framerate/hitch size.
  const rot=[
    c+axisX*axisX*t, axisY*axisX*t+axisZ*sn, axisZ*axisX*t-axisY*sn,
    axisX*axisY*t-axisZ*sn, c+axisY*axisY*t, axisZ*axisY*t+axisX*sn,
    axisX*axisZ*t+axisY*sn, axisY*axisZ*t-axisX*sn, c+axisZ*axisZ*t,
  ];
  const matrix=shard.modelMatrix;
  for(let col=0;col<3;col++) {
    const index=col*4,x0=matrix[index],y0=matrix[index+1],z0=matrix[index+2];
    matrix[index]=rot[0]*x0+rot[3]*y0+rot[6]*z0;
    matrix[index+1]=rot[1]*x0+rot[4]*y0+rot[7]*z0;
    matrix[index+2]=rot[2]*x0+rot[5]*y0+rot[8]*z0;
  }
  if (anchorCollisionCenter) {
    // A source collider can be offset from the mesh origin. Keep its world
    // centre on the same collision-solved trajectory when the mesh spins.
    const offset=shard.centerOffset;
    matrix[12]=shard.position.x-ratio*(rot[0]*offset.x+rot[3]*offset.y+rot[6]*offset.z);
    matrix[13]=shard.position.y-ratio*(rot[1]*offset.x+rot[4]*offset.y+rot[7]*offset.z);
    matrix[14]=shard.position.z-ratio*(rot[2]*offset.x+rot[5]*offset.y+rot[8]*offset.z);
  }
}

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

/**
 * Activate AUTHORED shard draw IDs, never procedural substitute geometry.
 * Each modelMatrix is its current absolute world transform. Motion below is
 * bounded ballistic Web physics: source impulse/mass/inherited velocity, but
 * not PhysX angular integration or collisions. Torque remains available for
 * a host physics solver. Gravity must come from the caller's source settings.
 */
export function createGunPickupShardRuntime({
  shards, parentVelocity, attachedToEnemy, torqueSamples, fadeDelays, gravity, physics = null,
}) {
  // Source collision geometry is optional until the private Dojo package supplies
  // exact fragment dimensions. Legacy visual-only shards retain their behavior.
  if (physics !== null && (!physics?.collisionScene?.boxes ||
      !Number.isFinite(physics.fixedDelta) || physics.fixedDelta <= 0 || !physics.material)) {
    throw new TypeError('Source fragment physics context required');
  }
  if (!Array.isArray(shards)) throw new TypeError('authored shards must be an array');
  const ids = new Set();
  const sourceShards = shards.map(shard => {
    if (!shard || typeof shard.id !== 'string' || !shard.id || ids.has(shard.id))
      throw new TypeError('each authored shard needs a unique source draw id');
    ids.add(shard.id);
    const m = shard.modelMatrix;
    if ((!Array.isArray(m) && !ArrayBuffer.isView(m)) || m.length !== 16 ||
        Array.from(m).some(v => typeof v !== 'number' || !Number.isFinite(v)) ||
        m[3] !== 0 || m[7] !== 0 || m[11] !== 0 || m[15] !== 1)
      throw new TypeError('shard modelMatrix must be finite column-major affine');
    finiteNumber(shard.originalScale, 'originalScale');
    if (shard.originalScale <= 0) throw new RangeError('originalScale must be positive');
    const result = { id: shard.id, originalScale: shard.originalScale, sourceMatrix: new Float64Array(m) };
    if (physics) {
      const collisionRadius = finiteNumber(shard.collisionRadius, 'collisionRadius');
      if (collisionRadius <= 0) throw new RangeError('Geometry-derived collision radius required');
      const center = finiteVector(shard.collisionCenter ?? {x:m[12],y:m[13],z:m[14]}, 'collisionCenter');
      Object.assign(result, { collisionRadius, position:center,
        centerOffset:{x:center.x-m[12],y:center.y-m[13],z:center.z-m[14]} });
    }
    return result;
  });
  const plan = planGunPickupShatter({
    alreadyShattered: false, hasShardInstance: true, attachedToEnemy, parentVelocity,
    shardCenters: sourceShards.map(s => ({ x: s.sourceMatrix[12], y: s.sourceMatrix[13], z: s.sourceMatrix[14] })),
    torqueSamples, fadeDelays,
  });
  if (plan.status !== 'planned') throw new Error('Native shatter branch unavailable: ' + plan.status);
  return {
    elapsed: 0, gravity: finiteVector(gravity, 'gravity'),
    ...(physics ? { physicsContext: { ...physics, gravity: finiteVector(gravity, 'gravity') } } : {}),
    physics: physics ? 'source-impulse-static-sphere-contacts-not-PhysX'
      : 'source-impulse-ballistic-no-angular-or-collision-simulation',
    shards: sourceShards.map((s, i) => ({
      ...s, modelMatrix: new Float64Array(s.sourceMatrix), visible: true,
      ...(physics ? {drag:0} : {}),
      velocity: {
        x: plan.shards[i].velocity.x + plan.shards[i].impulse.x / plan.shards[i].mass,
        y: plan.shards[i].velocity.y + plan.shards[i].impulse.y / plan.shards[i].mass,
        z: plan.shards[i].velocity.z + plan.shards[i].impulse.z / plan.shards[i].mass,
      },
      torque: plan.shards[i].torque, delay: fadeDelays[i], hdrPhase: 0,
      localScale: s.originalScale, fadeSaturated: false, destroyed: false,
    })),
  };
}

/**
 * Source HDRPhaseManager calls both delays with Time.deltaTime, despite its
 * unscaledTimeDelay name. RegisterDisappearEffect never assigns its first
 * scaledTimeDelay argument in this build (the pooled field starts at zero).
 * The legacy plan's duration/delay names are NOT used as a linear fade here.
 * Returns live authored draw records; skip invisible/destroyed shards.
 */
export function advanceGunPickupShardRuntime(runtime, scaledDelta) {
  finiteNumber(scaledDelta, 'scaledDelta');
  if (scaledDelta < 0) throw new RangeError('scaledDelta must be nonnegative');
  const elapsed = runtime.elapsed + scaledDelta;
  if (!Number.isFinite(elapsed)) throw new RangeError('shard clock overflow');
  for (const shard of runtime.shards) {
    if (shard.destroyed) continue;
    if (shard.fadeSaturated) {
      shard.destroyed = true;
      shard.visible = false;
      continue;
    }
    const value = Math.min(1, Math.max(0, elapsed - shard.delay));
    const sourceScale = 1 - Math.min(1, (value * 10 / 3) ** 2);
    shard.hdrPhase = value > 0.05 ? Math.min(1, (value * 5 - 0.05) ** 2) : 0;
    if (sourceScale < shard.originalScale) shard.localScale = sourceScale;
    shard.fadeSaturated = sourceScale <= 0 && shard.hdrPhase >= 1;
    shard.visible = shard.localScale > 0;
    const ratio = shard.localScale / shard.originalScale;
    for (let col = 0; col < 3; col++) {
      for (let row = 0; row < 3; row++) {
        const index = col * 4 + row;
        shard.modelMatrix[index] = shard.sourceMatrix[index] * ratio;
      }
    }
    if (runtime.physicsContext) {
      // An already invisible HDR shard requires no further collision work.
      // Frame-budgeting preserves swept contact without stalling the Dojo on
      // long frames or after a browser tab resumes (creative Web policy).
      shard.contacts = shard.visible
        ? advanceNativeFragmentBody(shard, scaledDelta, {
          ...runtime.physicsContext, limitWebFrameWork: true,
        }) : [];
      for (const [axis,index] of [['x',12],['y',13],['z',14]]) {
        shard.modelMatrix[index] = shard.position[axis] - shard.centerOffset[axis] * ratio;
      }
    } else {
      // Preserve the original proven Web ballistic visuals when the source
      // bounds and collision material have not yet been installed.
      for (const [axis,index] of [['x',12],['y',13],['z',14]]) {
        const position = shard.sourceMatrix[index] + shard.velocity[axis] * elapsed +
          runtime.gravity[axis] * (elapsed / 2) * elapsed;
        if (!Number.isFinite(position)) throw new RangeError('shard integration overflow');
        shard.modelMatrix[index] = position;
      }
    }
    // Live authored shards now visibly tumble under their existing sampled
    // torque. No extra mesh, particle, collider query or native claim.
    applyWebShardSpin(shard, elapsed, ratio, !!runtime.physicsContext);
  }
  runtime.elapsed = elapsed;
  return runtime.shards;
}
