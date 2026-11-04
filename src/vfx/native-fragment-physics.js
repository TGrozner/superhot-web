import { nativeSphereHit } from '../scenes/native-collision.js';

const axes = ['x', 'y', 'z'];
// Original Web frame budget: source fixed steps on normal frames, at most four
// swept steps after a hitch. This is NOT an extracted Unity/PhysX policy.
export const WEB_FRAGMENT_MAX_SUBSTEPS = 4;
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
    for(const box of scene.boxes) {
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
    const hit = nativeSphereHit(scene, position, end, radius);
    if (!hit) { Object.assign(position, end); break; }
    for (const axis of axes) position[axis] += remaining[axis] * hit.t;
    contacts.push(hit);
    planes.push(hit.normal);
    const inward = dot(velocity, hit.normal);
    let tangentRetention = 1;
    if (inward < 0) {
      const bounce = -inward >= material.bounceThreshold ? material.bounciness : 0;
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
    // Collision friction changes velocity NOW: do not spend the rest of a
    // long Web frame moving along the old, pre-friction tangent. Preserve
    // motion separating from the contact normal and sweep only the surviving
    // tangential fraction against the remaining source boxes.
    for (const axis of axes) {
      const tangent = remaining[axis] - hit.normal[axis] * into;
      remaining[axis] = (tangent * tangentRetention +
        hit.normal[axis] * Math.max(0, into)) * (1-hit.t);
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
  let remaining = scaledDelta;
  // At 60fps, keep source-sized substeps. A slow Web frame would otherwise
  // multiply 150Hz fragment sweeps across every active shattered object.
  // Use at most four larger *swept* steps, preserving elapsed motion and the
  // independent HDR lifetime instead of accumulating a physics catch-up debt.
  const stepLimit = limitWebFrameWork
    ? Math.max(fixedDelta, scaledDelta / WEB_FRAGMENT_MAX_SUBSTEPS)
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
    contacts.push(...moveNativeFragmentSphere(collisionScene, body.position, body.velocity,
      displacement, body.collisionRadius, material));
    remaining -= dt;
    steps++;
  }
  return contacts;
}
