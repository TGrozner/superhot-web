import { add3, subtract3, multiply3, dot3, normalize3, cameraAxes, segmentSphere } from '../math.js';
import { multiplyMatrices, composeLocalMatrix } from '../scenes/graph.js';
import { nativeSegmentHit, nativeSphereHit, nativeCollisionView } from '../scenes/native-collision.js';
import { createGunPickupShardRuntime, advanceGunPickupShardRuntime } from '../vfx/gun-pickup-shatter.js';

// MCD build 20299547, PhysicsManager/globalgamemanagers:10 m_Gravity.
const SOURCE_GRAVITY = { x: 0, y: -9.8100004196167, z: 0 };
const ZERO = { x: 0, y: 0, z: 0 };
const vector = a => ({ x: a[0], y: a[1], z: a[2] });
const length = v => Math.hypot(v.x, v.y, v.z);
const sharp = item => item.stickable || item.isKnife || item.isKatana;
// J2 Web arcade catch: the existing E aim-ray can grab an actually airborne
// thrown item. A pending wall/enemy contact is never preempted by a catch.
const pickable = item => !item.unpickable && (
  ['static', 'resting', 'attached'].includes(item.state) ||
  (item.state === 'flying' && item.pendingContact === null)
);

function point(value, name) {
  if (!value || !['x', 'y', 'z'].every(k => Number.isFinite(value[k])))
    throw new TypeError(name + ' must be finite xyz');
  return { x: value.x, y: value.y, z: value.z };
}
function matrix(value) {
  if (!value || value.length !== 16 || !Array.from(value).every(Number.isFinite) ||
      value[3] !== 0 || value[7] !== 0 || value[11] !== 0 || value[15] !== 1)
    throw new TypeError('item transform must be finite affine16');
  return Array.from(value);
}
function triple(value, name) {
  if (!value || value.length !== 3 || !Array.from(value).every(Number.isFinite))
    throw new TypeError(name + ' must be finite xyz array');
  return Array.from(value);
}
function transform(m, p) {
  return { x: m[0]*p.x+m[4]*p.y+m[8]*p.z+m[12],
    y: m[1]*p.x+m[5]*p.y+m[9]*p.z+m[13], z: m[2]*p.x+m[6]*p.y+m[10]*p.z+m[14] };
}
function moveCenter(item, center) {
  const delta = subtract3(center, getNativeItemPosition(item));
  item.worldMatrix[12] += delta.x;
  item.worldMatrix[13] += delta.y;
  item.worldMatrix[14] += delta.z;
}
function direction(forward) {
  const result = point(forward, 'forward');
  if (length(result) === 0) throw new RangeError('forward must be nonzero');
  return normalize3(result);
}
function roll(runtime) {
  const value = runtime.random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('random must return [0,1)');
  return value;
}
// Uniform insideUnitSphere without an unbounded rejection loop.
function torque(runtime) {
  const y = 2*roll(runtime)-1, angle = 2*Math.PI*roll(runtime), radius = Math.cbrt(roll(runtime));
  const horizontal = Math.sqrt(1-y*y);
  return { x: radius*horizontal*Math.cos(angle), y: radius*y, z: radius*horizontal*Math.sin(angle) };
}

// Unity Quaternion.Euler uses Ry * Rx * Rz. H-conjugate once for X-mirrored meshes.
function sourceEuler(euler, position = [0, 0, 0]) {
  const [x, y, z] = euler.map(v => v*Math.PI/360);
  const qx = composeLocalMatrix({ rotation: { x: Math.sin(x), y: 0, z: 0, w: Math.cos(x) } });
  const qy = composeLocalMatrix({ rotation: { x: 0, y: Math.sin(y), z: 0, w: Math.cos(y) } });
  const qz = composeLocalMatrix({ rotation: { x: 0, y: 0, z: Math.sin(z), w: Math.cos(z) } });
  const result = multiplyMatrices(multiplyMatrices(qy, qx), qz);
  result[12] = position[0]; result[13] = position[1]; result[14] = position[2];
  return result.map((v, i) => v*(i%4 === 0 ? -1 : 1)*(Math.floor(i/4) === 0 ? -1 : 1));
}
function cameraMatrix(camera) {
  point(camera, 'camera');
  const axes = cameraAxes(camera.yaw ?? 0, camera.pitch ?? 0);
  return { axes, matrix: [-axes.right.x,-axes.right.y,-axes.right.z,0,
    axes.up.x,axes.up.y,axes.up.z,0, axes.forward.x,axes.forward.y,axes.forward.z,0,
    camera.x,camera.y,camera.z,1] };
}
function handMatrix(item, camera) {
  const { axes, matrix: basis } = cameraMatrix(camera);
  const hand = item.handPosition;
  const position = add3(camera, add3(multiply3(axes.right, hand[0]),
    add3(multiply3(axes.up, hand[1]), multiply3(axes.forward, hand[2]))));
  basis[12] = position.x; basis[13] = position.y; basis[14] = position.z;
  return multiplyMatrices(multiplyMatrices(basis, item.containerMatrix), item.scaleMatrix);
}
function hideStatic(runtime, item) {
  if (item.staticHidden) return;
  for (const model of item.models) runtime.setVisible(model.instanceId, false);
  for (const id of item.colliderIds) runtime.collision.setEnabled(id, false);
  item.staticHidden = true;
}

/** Original model IDs remain owned by the static renderer until first pickup.
 * Only browser runtime records are mutated. Gravity is browser-space; hand and
 * container fields remain source Unity-space. Static collider IDs are disabled
 * permanently on transfer; dynamic throws use sphere sweeps, not stale boxes.
 */
export function createNativeItems(scene, collision, {
  setVisible, getBounds = null, gravity = scene.physics?.gravity ?? SOURCE_GRAVITY, random = Math.random,
} = {}) {
  if (typeof setVisible !== 'function' || !collision?.boxes || typeof collision.setEnabled !== 'function')
    throw new TypeError('native items require visibility and prepared collision adapters');
  const ids = new Set(), drawIds = new Set();
  const items = (scene.interactables ?? []).map(source => {
    if (source.id == null || ids.has(source.id)) throw new TypeError('native item IDs must be unique');
    ids.add(source.id);
    const worldMatrix = matrix(source.worldMatrix);
    const models = source.models.map(model => {
      if (!model.instanceId || drawIds.has(model.instanceId)) throw new TypeError('native model IDs must be unique');
      drawIds.add(model.instanceId);
      return { ...model, localMatrix: matrix(model.localMatrix) };
    });
    const center = triple(source.center, 'center');
    if (!Number.isFinite(source.radius) || source.radius < 0 || !Number.isFinite(source.throwSpeed) || source.throwSpeed <= 0)
      throw new TypeError('source radius and throwSpeed must be finite and valid');
    const scaleMatrix = composeLocalMatrix({ scale: { x: Math.hypot(...worldMatrix.slice(0, 3)),
      y: Math.hypot(...worldMatrix.slice(4, 7)), z: Math.hypot(...worldMatrix.slice(8, 11)) } });
    const colliderIds = [...new Set(source.colliderIds)];
    const colliderSet = new Set(colliderIds);
    const mask=scene.gameplay?.collisionMasks?.[source.stickable?'sticker':'item'];
    const physical=mask===undefined?collision:nativeCollisionView(collision,mask);
    return { ...source, models, colliderIds, center, worldMatrix, scaleMatrix,
      heldMatrix: source.heldPose === undefined ? null : matrix(source.heldPose?.localMatrix),
      handPosition: triple(source.handPosition, 'handPosition'),
      rotationSpeed: triple(source.rotationSpeed, 'rotationSpeed'),
      containerMatrix: sourceEuler(triple(source.containerRotationEuler, 'containerRotationEuler'),
        triple(source.containerPosition, 'containerPosition')),
      shards: source.shards.map(shard => ({ ...shard, localMatrix: matrix(shard.localMatrix) })),
      // The boxes are shared, so later transfers remain visible to every query.
      queryCollision: { boxes: physical.boxes.filter(box => !colliderSet.has(box.collider.id)) },
      state: 'static', staticHidden: false, velocity: { ...ZERO }, attachment: null, pendingContact: null };
  });
  const physics = scene.gameplay?.deathPhysics ?? null;
  if (physics && (!Number.isFinite(physics.fixedDelta) || physics.fixedDelta <= 0 ||
      !physics.material || typeof getBounds !== 'function')) {
    throw new TypeError('Source fragment physics requires fixed step, material and geometry bounds provider');
  }
  return { items, held: null, collision, setVisible, getBounds,
    gravity: point(gravity, 'gravity'), random, fragments: [],
    fragmentPhysics: physics ? {fixedDelta:physics.fixedDelta,material:physics.material} : null };
}

/** Current world-space bounds center, rather than a stale source location. */
export function getNativeItemPosition(item) {
  return transform(item.worldMatrix, vector(item.center));
}

/** Aim-ray/bounding-sphere admission, followed by center LOS excluding only
 * the candidate's own colliders. maxDistance measures center distance.
 */
export function nearestNativeItem(runtime, camera, forward, maxDistance = 2.2) {
  point(camera, 'camera');
  const aim = direction(forward);
  if (!Number.isFinite(maxDistance) || maxDistance < 0) throw new RangeError('maxDistance must be nonnegative');
  if (runtime.held) return null;
  let best = null, distance = Infinity;
  const end = add3(camera, multiply3(aim, maxDistance));
  for (const item of runtime.items) {
    if (!pickable(item)) continue;
    const center = getNativeItemPosition(item), delta = subtract3(center, camera), d = length(delta);
    if (d > maxDistance || d >= distance || dot3(delta, aim) <= 0 ||
        segmentSphere(camera, end, center, item.radius) === null) continue;
    const wall = nativeSegmentHit(item.queryCollision, camera, center);
    if (wall && wall.t < 1) continue;
    best = item; distance = d;
  }
  return best;
}

/** Pass a candidate from nearestNativeItem; this transition does not invent a camera. */
export function pickupNativeItem(runtime, item) {
  if (runtime.held || !runtime.items.includes(item) || !pickable(item)) return false;
  hideStatic(runtime, item);
  item.state = 'held'; item.attachment = null; item.pendingContact = null; item.velocity = { ...ZERO };
  runtime.held = item;
  return true;
}

/** Weapon.SpawnThrowAway: 0.075 source spawn distance, source sticker speed
 * (ordinary props export 28). Sweep the entire spawn offset before admitting it.
 * Initial overlap stops at the camera rather than teleporting through a wall.
 */
export function throwNativeItem(runtime, camera, forward) {
  if (!runtime.held) return null;
  point(camera, 'camera');
  const aim = direction(forward), item = runtime.held;
  const yaw = Math.atan2(aim.x, -aim.z), pitch = Math.asin(aim.y);
  item.worldMatrix = multiplyMatrices(cameraMatrix({ ...camera, yaw, pitch }).matrix, item.scaleMatrix);
  item.worldMatrix[12] += aim.x*0.075; item.worldMatrix[13] += aim.y*0.075; item.worldMatrix[14] += aim.z*0.075;
  const target = getNativeItemPosition(item);
  const wall = nativeSphereHit(item.queryCollision, camera, target, item.radius);
  if (wall) {
    moveCenter(item, add3(camera, multiply3(subtract3(target, camera), wall.t)));
    item.pendingContact = { ...wall, kind: 'world' };
  }
  item.state = 'flying'; item.velocity = multiply3(aim, item.throwSpeed); item.attachment = null;
  runtime.held = null;
  return item;
}

function shatter(runtime, item, attachedToEnemy) {
  item.state = 'broken';
  if (!item.shards.length) return; // No invented fragments for an absent source shard instance.
  runtime.fragments.push(createGunPickupShardRuntime({
    shards: item.shards.map(shard => {
      const modelMatrix = multiplyMatrices(item.worldMatrix, shard.localMatrix);
      if (!runtime.fragmentPhysics) {
        return {id:shard.instanceId,originalScale:shard.originalScale,modelMatrix};
      }
      const bounds = runtime.getBounds(shard.instanceId);
      if (!bounds || !Number.isFinite(bounds.radius) || bounds.radius <= 0) {
        throw new TypeError('Source shard geometry bounds required: ' + shard.instanceId);
      }
      const localCenter = vector(triple(bounds.center,'shard bounds center'));
      // Conservative spectral-norm bound for the shader's transformed sphere.
      const columns=[modelMatrix.slice(0,3),modelMatrix.slice(4,7),modelMatrix.slice(8,11)];
      let normSquared=0;
      for(let i=0;i<3;i++) {
        let row=0;
        for(let j=0;j<3;j++)row+=Math.abs(columns[i].reduce((sum,v,k)=>sum+v*columns[j][k],0));
        normSquared=Math.max(normSquared,row);
      }
      return {id:shard.instanceId,originalScale:shard.originalScale,modelMatrix,
        collisionCenter:transform(modelMatrix,localCenter),
        collisionRadius:bounds.radius*Math.sqrt(normSquared)};
    }),
    parentVelocity: item.velocity, attachedToEnemy,
    torqueSamples: item.shards.map(() => torque(runtime)), fadeDelays: item.shards.map(() => 2*roll(runtime)),
    gravity: runtime.gravity,
    ...(runtime.fragmentPhysics ? {physics:{...runtime.fragmentPhysics,collisionScene:item.queryCollision}} : {}),
  }));
}
function contact(runtime, item, hit, applyContact, events) {
  const supplied = applyContact?.(item, hit);
  const outcome = typeof supplied === 'string' ? { action: supplied } : supplied;
  const action = outcome?.action ?? (hit.kind === 'world' ? (sharp(item) ? 'attach' : 'shatter') : 'stop');
  if (!['shatter', 'attach', 'stop'].includes(action)) throw new TypeError('contact action must be shatter, attach or stop');
  if (action === 'shatter') shatter(runtime, item, hit.kind === 'enemy');
  else {
    item.state = action === 'attach' ? 'attached' : 'resting';
    item.attachment = action === 'attach' ? { kind: hit.kind, enemyId: hit.enemyId ?? null,
      partId: hit.partId ?? null, point: { ...hit.point }, ...outcome?.attachment } : null;
  }
  events.push({ type: action, itemId: item.id, item, contact: hit });
  item.velocity = { ...ZERO }; item.pendingContact = null;
}

/** hitEnemy is a PURE nearest candidate query returning {t,enemyId,point,partId}.
 * applyContact(item,{kind,...hit}) runs only after world/enemy arbitration and
 * owns native enemy reaction; return 'shatter', 'attach', 'stop', or {action,
 * attachment}. Wall ties win. No implicit enemy kill or guessed rigidbody bounce.
 * resolveAttachment(item,attachment) may return the current browser root matrix;
 * without it the explicit limitation is a fixed contact pose, not ragdoll following.
 * Flight is swept-sphere Web ballistics, not PhysX; rotationSpeed is integrated
 * at the root, not an unexported ObjectSticker modelToRotate subtransform.
 */
export function advanceNativeItems(runtime, scaledDt, { hitEnemy, applyContact, resolveAttachment } = {}) {
  if (!Number.isFinite(scaledDt) || scaledDt < 0) throw new RangeError('scaledDt must be finite and nonnegative');
  const events = [];
  if (scaledDt === 0) return events;
  for (const group of runtime.fragments) advanceGunPickupShardRuntime(group, scaledDt);
  runtime.fragments = runtime.fragments.filter(group => group.shards.some(shard => !shard.destroyed));
  for (const item of runtime.items) {
    if (item.state === 'attached' && resolveAttachment) {
      const resolved = resolveAttachment(item, item.attachment);
      if (resolved) item.worldMatrix = matrix(resolved);
    }
    if (item.state !== 'flying') continue;
    if (item.pendingContact) {
      contact(runtime, item, item.pendingContact, applyContact, events);
      continue;
    }
    let remaining = scaledDt;
    while (remaining > 0 && item.state === 'flying') {
      const dt = Math.min(remaining, 1/60), start = getNativeItemPosition(item);
      const gravity = item.rigidbody?.m_UseGravity === false || item.rigidbody?.useGravity === false ? ZERO : runtime.gravity;
      const end = add3(start, add3(multiply3(item.velocity, dt), multiply3(gravity, dt*dt/2)));
      const wall = nativeSphereHit(item.queryCollision, start, end, item.radius);
      const enemy = hitEnemy?.(item, start, end) ?? null;
      if (enemy && (!Number.isFinite(enemy.t) || enemy.t < 0 || enemy.t > 1))
        throw new RangeError('enemy contact t must be in [0,1]');
      const hit = wall && (!enemy || wall.t <= enemy.t) ? { ...wall, kind: 'world' }
        : enemy ? { ...enemy, kind: 'enemy' } : null;
      const elapsed = dt*(hit?.t ?? 1);
      item.velocity = add3(item.velocity, multiply3(gravity, elapsed));
      const center = hit ? add3(start, multiply3(subtract3(end, start), hit.t)) : end;
      if (item.rotationSpeed.some(v => v !== 0)) {
        item.worldMatrix = multiplyMatrices(item.worldMatrix, sourceEuler(item.rotationSpeed.map(v => v*elapsed)));
      }
      moveCenter(item, center);
      if (hit) contact(runtime, item, hit, applyContact, events);
      remaining -= dt;
    }
  }
  return events;
}

/** Static originals are already rendered: only transferred models appear here.
 * Parent renders each ID with its supplied absolute matrix, using the original
 * held material/projection path rather than appending a synthetic pistol.
 */
export function nativeItemDraws(runtime, camera) {
  const world = [], held = [], fragments = [];
  for (const item of runtime.items) {
    if (item.state === 'static' || item.state === 'broken') continue;
    const isHeld = item.state === 'held';
    // A source-qualified sampled attachment maps the pickup root to camera-local
    // space already. Do not apply the generic hand/container or pickup scale twice.
    if (isHeld) item.worldMatrix = item.heldMatrix
      ? multiplyMatrices(cameraMatrix(camera).matrix, item.heldMatrix) : handMatrix(item, camera);
    for (const model of item.models) (isHeld ? held : world).push({ instanceId: model.instanceId,
      modelMatrix: multiplyMatrices(item.worldMatrix, model.localMatrix) });
  }
  for (const group of runtime.fragments) for (const shard of group.shards) {
    if (shard.visible && !shard.destroyed) fragments.push({ instanceId: shard.id,
      modelMatrix: shard.modelMatrix, hdrPhase: shard.hdrPhase });
  }
  return { world, held, fragments };
}
