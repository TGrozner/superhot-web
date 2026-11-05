import { nativeSphereHit } from '../scenes/native-collision.js';

const axes = ['x', 'y', 'z'];
// Original Web frame budget: source fixed steps on normal frames, at most four
// swept steps after a hitch. This is NOT an extracted Unity/PhysX policy.
export const WEB_FRAGMENT_MAX_SUBSTEPS = 4;
// Web-only hitch policy: do not fling shattered weapons through a whole
// stalled browser frame. Keep the first 100 ms of motion; HDR fade remains
// on the caller's full elapsed clock. The ragdoll solver uses the same cap.
const WEB_FRAGMENT_MAX_HITCH_DELTA = 0.1;
// Web-only sleep: grounded, nearly stationary shards stop wasting CCD sweeps
// while their authored HDR fade and absolute-time visual spin still advance.
// No PhysX sleep thresholds are inferred from these deliberately small values.
const WEB_SHARD_REST_SECONDS = 0.2;
const WEB_SHARD_REST_SPEED = 0.06;
// Source BoxCollider AABBs are immutable within a Dojo round; only enabled
// toggles change. Index wide source scenes once, preserving source box order
// for equal-time contacts. The interval query is a Web broadphase, not PhysX.
const fragmentBroadphases = new WeakMap();
function nearbyFragmentBoxes(scene, start, end, radius) {
  const boxes = scene.boxes;
  if (boxes.length < 16) return scene;
  let index = fragmentBroadphases.get(scene);
  if (!index || index.boxes !== boxes || index.count !== boxes.length) {
    const sorted = boxes.map((box, order) => ({ box, order, minX: box.min.x }))
      .sort((a, b) => a.minX - b.minX || a.order - b.order);
    const prefixMaxX = [];
    let maxX = -Infinity;
    for (const entry of sorted) {
      maxX = Math.max(maxX, entry.box.max.x);
      prefixMaxX.push(maxX);
    }
    index = { boxes, count: boxes.length, sorted, prefixMaxX };
    fragmentBroadphases.set(scene, index);
  }
  const minX = Math.min(start.x, end.x) - radius;
  const maxX = Math.max(start.x, end.x) + radius;
  const minY = Math.min(start.y, end.y) - radius;
  const maxY = Math.max(start.y, end.y) + radius;
  const minZ = Math.min(start.z, end.z) - radius;
  const maxZ = Math.max(start.z, end.z) + radius;
  let low = 0, high = index.sorted.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (index.sorted[mid].minX <= maxX) low = mid + 1;
    else high = mid;
  }
  const candidates = [];
  for (let i = low - 1; i >= 0 && index.prefixMaxX[i] >= minX; i--) {
    const { box, order } = index.sorted[i];
    if (box.enabled && box.max.x >= minX && box.min.y <= maxY &&
        box.max.y >= minY && box.min.z <= maxZ && box.max.z >= minZ)
      candidates.push({ box, order });
  }
  candidates.sort((a, b) => a.order - b.order);
  return { boxes: candidates.map(candidate => candidate.box) };
}

// Once a shard has settled, checking its original support must be cheap.
// The active sweep already indexes the immutable source boxes by X; lazily
// index their collider identities too, avoiding a full Dojo-box scan per
// sleeping shard, per frame. Read box.enabled live so doors still wake them.
function enabledShardSupport(scene, collider) {
  const boxes = scene.boxes;
  const index = fragmentBroadphases.get(scene);
  if (!index || index.boxes !== boxes || index.count !== boxes.length)
    return boxes.some(box => box.enabled && box.collider === collider);
  if (!index.supportBoxes) {
    const supports = new Map();
    for (const { box } of index.sorted) {
      const linked = supports.get(box.collider);
      if (linked) linked.push(box);
      else supports.set(box.collider, [box]);
    }
    index.supportBoxes = supports;
  }
  return index.supportBoxes.get(collider)?.some(box => box.enabled) ?? false;
}

const dot = (a, b) => a.x*b.x + a.y*b.y + a.z*b.z;
const sub = (a,b) => ({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const along = (a,b,t) => ({x:a.x+b.x*t,y:a.y+b.y*t,z:a.z+b.z*t});

function closestTriangle(p,{a,b,c}) {
  const ab=sub(b,a),ac=sub(c,a),ap=sub(p,a),d1=dot(ab,ap),d2=dot(ac,ap);
  if(d1<=0&&d2<=0)return a;
  const bp=sub(p,b),d3=dot(ab,bp),d4=dot(ac,bp);
  if(d3>=0&&d4<=d3)return b;
  const vc=d1*d4-d3*d2;
  if(vc<=0&&d1>=0&&d3<=0)return along(a,ab,d1/(d1-d3));
  const cp=sub(p,c),d5=dot(ab,cp),d6=dot(ac,cp);
  if(d6>=0&&d5<=d6)return c;
  const vb=d5*d2-d1*d6;
  if(vb<=0&&d2>=0&&d6<=0)return along(a,ac,d2/(d2-d6));
  const va=d3*d6-d5*d4;
  if(va<=0&&d4-d3>=0&&d5-d6>=0)return along(b,sub(c,b),(d4-d3)/(d4-d3+d5-d6));
  return along(along(a,ab,vb/(va+vb+vc)),ac,vc/(va+vb+vc));
}

// Sweep queries intentionally allow escape from overlap. Shards can begin
// overlapping after their parent shatters; resolve that overlap before sweeping.
function recoverPenetration(scene,position,velocity,radius,contacts) {
  for(let iteration=0;iteration<8;iteration++) {
    let changed=false;
    for(const box of nearbyFragmentBoxes(scene, position, position, radius).boxes) {
      if(!box.enabled || axes.some(a=>position[a]<box.min[a]-radius||position[a]>box.max[a]+radius))continue;
      const relative=sub(position,box.center);
      let depth=Infinity,normal=null,inside=true;
      for(const plane of box.planes) {
        const distance=dot(relative,plane.normal),clearance=plane.extent-Math.abs(distance);
        if(clearance<0)inside=false;
        if(clearance<depth){depth=clearance;normal=along({x:0,y:0,z:0},plane.normal,distance<0?-1:1);}
      }
      let point;
      if(inside){depth+=radius;point=along(position,normal,depth-radius);}
      else {
        let squared=Infinity;
        for(const triangle of box.triangles) {
          const candidate=closestTriangle(position,triangle),delta=sub(position,candidate),d=dot(delta,delta);
          if(d<squared){squared=d;point=candidate;normal=delta;}
        }
        const distance=Math.sqrt(squared);
        depth=radius-distance;
        if(depth<=1e-8)continue;
        if(distance>1e-12)normal=along({x:0,y:0,z:0},normal,1/distance);
        else continue;
      }
      if(depth<=1e-8)continue;
      for(const axis of axes)position[axis]+=normal[axis]*(depth+1e-8);
      // Starting inside an authored solid has no trustworthy bounce TOI.
      // Discard only velocity still moving INTO the recovered face: a shard
      // can leave the overlap or slide along it without repeated ejection.
      // This is a conservative Web depenetration rule, not native PhysX.
      const inward=dot(velocity,normal);
      if(inward<0)for(const axis of axes)velocity[axis]-=normal[axis]*inward;
      contacts.push({t:0,point,normal,collider:box.collider,penetration:depth});
      changed=true;
    }
    if(!changed)break;
  }
}

/** Web contact adapter, NOT PhysX. Sweeps the supplied shape-derived sphere
 * against the layer-filtered source environment. Material values are supplied
 * from the recovered physics material; dynamic pairs/angular inertia are absent.
 * Mutates position/velocity; returns observed contacts for the host's effects.
 */
export function moveNativeFragmentSphere(scene, position, velocity, displacement, radius, material) {
  if (!scene?.boxes || !Number.isFinite(radius) || radius < 0 ||
      ![position, velocity, displacement].every(v => v && axes.every(a => Number.isFinite(v[a]))) ||
      !material || !['bounciness', 'dynamicFriction', 'bounceThreshold'].every(k => Number.isFinite(material[k]) && material[k] >= 0) ||
      material.bounciness > 1 ||
      (material.staticFriction!==undefined&&(!Number.isFinite(material.staticFriction)||material.staticFriction<0)))
    throw new TypeError('Finite source shape, contact material and collision view required');
  const contacts = [];
  recoverPenetration(scene,position,velocity,radius,contacts);
  const planes=[];
  let remaining = { ...displacement };
  // Web iteration bound, not a source solver parameter. Never advance an
  // unchecked remainder if a corner exhausts this budget.
  for (let iteration = 0; iteration < 4; iteration++) {
    const end = { x: position.x + remaining.x, y: position.y + remaining.y, z: position.z + remaining.z };
    const hit = nativeSphereHit(nearbyFragmentBoxes(scene, position, end, radius), position, end, radius);
    if (!hit) { Object.assign(position, end); break; }
    for (const axis of axes) position[axis] += remaining[axis] * hit.t;
    contacts.push(hit);
    planes.push(hit.normal);
    const inward = dot(velocity, hit.normal);
    let tangentRetention = 1;
    let bounce = 0;
    if (inward < 0) {
      bounce = -inward >= material.bounceThreshold ? material.bounciness : 0;
      const normalImpulse = -(1 + bounce) * inward;
      for (const axis of axes) velocity[axis] += hit.normal[axis] * normalImpulse;
      const normalSpeed = dot(velocity, hit.normal);
      const tangent = { x: velocity.x-hit.normal.x*normalSpeed, y: velocity.y-hit.normal.y*normalSpeed, z: velocity.z-hit.normal.z*normalSpeed };
      const speed = Math.hypot(tangent.x, tangent.y, tangent.z);
      const staticFriction=material.staticFriction??material.dynamicFriction;
      const friction=speed<=staticFriction*normalImpulse?1:
        speed>0?Math.min(1,material.dynamicFriction*normalImpulse/speed):0;
      for (const axis of axes) velocity[axis] -= tangent[axis] * friction;
      tangentRetention = 1 - friction;
    }
    const into = dot(remaining, hit.normal);
    // Friction and restitution change velocity AT the hit, not one frame
    // later. Spend the remaining swept time on the retained tangent AND the
    // outward rebound, querying the real boxes again (including ceilings).
    // This is a Web contact-integration choice, not recovered PhysX timing.
    const outward = into < 0 ? -into * bounce : into;
    for (const axis of axes) {
      const tangent = remaining[axis] - hit.normal[axis] * into;
      remaining[axis] = (tangent * tangentRetention +
        hit.normal[axis] * outward) * (1-hit.t);
    }
    if(planes.some(normal=>dot(remaining,normal)<-1e-9))break;
    if (Math.hypot(remaining.x, remaining.y, remaining.z) < 1e-10) break;
  }
  return contacts;
}

/** Advance an authored shard using a source fixed step and source gravity.
 * The caller still owns HDR destruction; this function never invents lifetimes.
 */
export function advanceNativeFragmentBody(body, scaledDelta, {
  collisionScene, gravity, fixedDelta, material, limitWebFrameWork = false,
}) {
  if (!Number.isFinite(scaledDelta) || scaledDelta < 0 || !Number.isFinite(fixedDelta) || fixedDelta <= 0 ||
      !gravity || !axes.every(a => Number.isFinite(gravity[a])) || !Number.isFinite(body.drag) || body.drag < 0 ||
      typeof limitWebFrameWork !== 'boolean')
    throw new TypeError('Nonnegative delta, source gravity, drag and positive fixedDelta required');
  const contacts = [];
  // The scene is static within a round, but its source colliders may be
  // disabled (doors). Never sleep on air, on a removed support, or after
  // an external re-impulse / position edit. Legacy unbudgeted calls remain live.
  if (limitWebFrameWork && body.webShardResting) {
    const p = body.webShardRestPosition;
    if (p && axes.every(axis => body.position[axis] === p[axis] &&
        Math.abs(body.velocity[axis]) < WEB_SHARD_REST_SPEED) &&
        enabledShardSupport(collisionScene, body.webShardSupport))
      return contacts;
    body.webShardResting = false;
    body.webShardRestSeconds = 0;
    body.webShardSupport = null;
  } else if (!limitWebFrameWork && body.webShardResting) {
    body.webShardResting = false;
    body.webShardRestSeconds = 0;
    body.webShardSupport = null;
  }
  // An interrupted tab must not turn a single shard frame into a giant
  // ballistic leap. Ordinary 10 FPS (100 ms) frames are still fully simulated.
  // The external HDR fade continues to receive the original scaledDelta.
  const simulatedDelta = limitWebFrameWork ? Math.min(scaledDelta, WEB_FRAGMENT_MAX_HITCH_DELTA) : scaledDelta;
  let remaining = simulatedDelta;
  // Preserve source-sized steps at 60 FPS, at most four swept steps at 10 FPS.
  const stepLimit = limitWebFrameWork
    ? Math.max(fixedDelta, simulatedDelta / WEB_FRAGMENT_MAX_SUBSTEPS)
    : fixedDelta;
  let steps = 0;
  while (remaining > 1e-12) {
    const dt = limitWebFrameWork && steps === WEB_FRAGMENT_MAX_SUBSTEPS - 1
      ? remaining : Math.min(stepLimit, remaining);
    const displacement = {};
    for (const axis of axes) {
      const next = (body.velocity[axis] + gravity[axis]*dt) / (1+body.drag*dt);
      displacement[axis] = (body.velocity[axis]+next)*dt/2;
      body.velocity[axis] = next;
    }
    // The contact solver returns the swept fraction inside this substep.
    // Initial penetration has t=0; the Web clock is only a linear-sweep
    // estimate, NOT Unity/PhysX native event timing.
    const stepStart = simulatedDelta - remaining;
    const stepContacts = moveNativeFragmentSphere(collisionScene, body.position, body.velocity,
      displacement, body.collisionRadius, material);
    for (const contact of stepContacts) {
      contact.webImpactTimeInFrame = stepStart + dt * Math.max(0, Math.min(1, contact.t));
    }
    contacts.push(...stepContacts);
    if (limitWebFrameWork) {
      // Only an upward CONTACT against a real authored collider counts.
      // A 300ms hitch cannot put an airborne shard to sleep from a single
      // final contact: count supported SUBSTEPS, not the whole frame.
      const floor = stepContacts.find(contact => contact.collider && contact.normal?.y > 0.55);
      const speed = Math.hypot(body.velocity.x, body.velocity.y, body.velocity.z);
      if (floor && speed < WEB_SHARD_REST_SPEED) {
        // A first contact halfway through a long swept substep has NOT been
        // supported for the whole substep. Use the actual collision fraction.
        const supportedDt = dt * Math.max(0, Math.min(1, 1 - floor.t));
        body.webShardRestSeconds = (body.webShardSupport === floor.collider
          ? (body.webShardRestSeconds ?? 0) : 0) + supportedDt;
        body.webShardSupport = floor.collider;
      } else {
        body.webShardRestSeconds = 0;
        body.webShardSupport = null;
      }
    }
    remaining -= dt;
    steps++;
  }
  if (limitWebFrameWork && body.webShardRestSeconds >= WEB_SHARD_REST_SECONDS) {
    body.webShardResting = true;
    body.webShardRestPosition = { ...body.position };
    for (const axis of axes) body.velocity[axis] = 0;
  }
  return contacts;
}
