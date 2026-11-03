import { composeLocalMatrix, multiplyMatrices } from '../scenes/graph.js';
import { meshModelMatrices } from '../render/mesh-format.js';
import { moveNativeFragmentSphere } from '../vfx/native-fragment-physics.js';

const axes=['x','y','z'];
// Browser-side frame budget only: never advertise it as a Unity fixed-step policy.
const WEB_MAX_DEATH_SUBSTEPS = 4;
const zero=()=>({x:0,y:0,z:0});
const point=m=>({x:m[12],y:m[13],z:m[14]});
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const mul=(a,s)=>({x:a.x*s,y:a.y*s,z:a.z*s});
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const length=v=>Math.hypot(v.x,v.y,v.z);
const unit=v=>mul(v,1/length(v));
function vector(v) {
  if(!v||!axes.every(a=>Number.isFinite(v[a])))throw new TypeError('Finite vector required');
  return {x:v.x,y:v.y,z:v.z};
}
function triple(v) {
  if(!v||v.length!==3||!v.every(Number.isFinite))throw new TypeError('Finite source vector required');
  return {x:v[0],y:v[1],z:v[2]};
}
function affine(m) {
  if(!m||m.length!==16||!Array.from(m).every(Number.isFinite)||m[3]!==0||m[7]!==0||m[11]!==0||m[15]!==1)
    throw new TypeError('Finite affine matrix required');
  return Array.from(m);
}
function inverse(m) {
  const n=meshModelMatrices(m).normal;
  const out=[n[0],n[3],n[6],0,n[1],n[4],n[7],0,n[2],n[5],n[8],0,0,0,0,1];
  for(let r=0;r<3;r++)out[12+r]=-(out[r]*m[12]+out[4+r]*m[13]+out[8+r]*m[14]);
  return out;
}
function transform(m,p) {
  return {x:m[0]*p.x+m[4]*p.y+m[8]*p.z+m[12],y:m[1]*p.x+m[5]*p.y+m[9]*p.z+m[13],z:m[2]*p.x+m[6]*p.y+m[10]*p.z+m[14]};
}
function rotation(v) {
  const angle=length(v),scale=angle>1e-12?Math.sin(angle/2)/angle:0.5;
  return composeLocalMatrix({rotation:{x:v.x*scale,y:v.y*scale,z:v.z*scale,w:Math.cos(angle/2)}});
}
// Rotation logarithm, including the 180-degree case. Inputs are relative
// rotations: reflected world model matrices cancel before this operation.
function rotationVector(m) {
  const trace=m[0]+m[5]+m[10];
  let x,y,z,w;
  if(trace>0) {const s=Math.sqrt(trace+1)*2;w=s/4;x=(m[6]-m[9])/s;y=(m[8]-m[2])/s;z=(m[1]-m[4])/s;}
  else if(m[0]>m[5]&&m[0]>m[10]) {const s=Math.sqrt(Math.max(0,1+m[0]-m[5]-m[10]))*2;x=s/4;y=(m[4]+m[1])/s;z=(m[8]+m[2])/s;w=(m[6]-m[9])/s;}
  else if(m[5]>m[10]) {const s=Math.sqrt(Math.max(0,1+m[5]-m[0]-m[10]))*2;y=s/4;x=(m[4]+m[1])/s;z=(m[9]+m[6])/s;w=(m[8]-m[2])/s;}
  else {const s=Math.sqrt(Math.max(0,1+m[10]-m[0]-m[5]))*2;z=s/4;x=(m[8]+m[2])/s;y=(m[9]+m[6])/s;w=(m[1]-m[4])/s;}
  if(w<0){x=-x;y=-y;z=-z;w=-w;}
  const size=Math.hypot(x,y,z),factor=size>1e-12?2*Math.atan2(size,w)/size:2;
  return {x:x*factor,y:y*factor,z:z*factor};
}
function syncPosition(body) {
  body.world[12]=body.position.x;body.world[13]=body.position.y;body.world[14]=body.position.z;
}
function rotateBody(body,delta) {
  body.world=multiplyMatrices(rotation(delta),body.world);
  syncPosition(body);
}
function translate(body,delta) {
  for(const axis of axes)body.position[axis]+=delta[axis];
  syncPosition(body);
}
function jointFrame(source) {
  const axis=triple(source.axis);
  if(length(axis)<1e-12)throw new TypeError('Nonzero source joint axis required');
  const x=unit(axis);
  let y=triple(source.swingAxis);
  y=sub(y,mul(x,dot(x,y)));
  // Some source joints have parallel axis/swingAxis. Unity's internal fallback
  // is not recovered; this deterministic perpendicular is a declared Web choice.
  if(length(y)<1e-8)y=cross(x,Math.abs(x.x)<0.8?{x:1,y:0,z:0}:{x:0,y:1,z:0});
  y=unit(y);
  return [x,y,cross(x,y)];
}

/** Source bodies, anchors and angular bounds with a position-based Web solver.
 * NOT PhysX: scalar shape-derived inertia, elliptical rotation-vector swing limits instead
 * of PhysX swing cones, sphere covers, no self/dynamic pairs or mesh cutting.
 * Source rest frames (not the death pose) define joint zero orientation.
 */
export function createNativeDeathRuntime({definition,boneModelMatrices,modelMatrix,collisionScene,initialVelocity,
  previousBoneModelMatrices=null,previousModelMatrix=null,poseDeltaSeconds=null}) {
  if(!definition||!Array.isArray(definition.boneParents)||!Array.isArray(definition.bodies)||
      !Array.isArray(definition.joints)||!collisionScene?.boxes||
      boneModelMatrices?.length!==definition.boneParents.length*16||
      !Number.isFinite(definition.fixedDelta)||definition.fixedDelta<=0||
      !Number.isInteger(definition.solverIterations)||definition.solverIterations<1||
      !Number.isFinite(definition.cleanupAfterSeconds)||definition.cleanupAfterSeconds<0)
    throw new TypeError('Complete source death definition, pose and collision view required');
  const model=affine(modelMatrix),velocity=vector(initialVelocity),byBone=new Map();
  const sourceWorld=definition.boneParents.map((parent,i)=>{
    if(!Number.isInteger(parent)||parent>=i||parent< -1)throw new TypeError('Topologically ordered bones required');
    return multiplyMatrices(model,affine(boneModelMatrices.slice(i*16,i*16+16)));
  });
  // Observed GPU poses, not guessed native PhysX velocities. Preserve
  // articulated translation and angular motion when two consecutive, recent
  // samples of the SAME actor exist. Otherwise retain the root fallback.
  // Frame gap and motion guards are Web safety policies, not Unity constants.
  const hasPreviousPose=previousBoneModelMatrices?.length===boneModelMatrices.length &&
    previousModelMatrix?.length===16 && Number.isFinite(poseDeltaSeconds) &&
    poseDeltaSeconds>1e-5 && poseDeltaSeconds<=0.2;
  const previousWorld=hasPreviousPose
    ? definition.boneParents.map((_,i)=>multiplyMatrices(
      affine(previousModelMatrix),affine(previousBoneModelMatrices.slice(i*16,i*16+16))))
    : null;
  const sourceLocal=sourceWorld.map((m,i)=>definition.boneParents[i]<0?m:multiplyMatrices(inverse(sourceWorld[definition.boneParents[i]]),m));
  const restWorld=[];
  for(let i=0;i<sourceWorld.length;i++) {
    const local=definition.boneRestTransforms?.[i];
    if(!local)throw new TypeError('Source bind transforms required for joint reference frames');
    restWorld.push(multiplyMatrices(definition.boneParents[i]<0?model:restWorld[definition.boneParents[i]],composeLocalMatrix(local)));
  }
  const bodies=definition.bodies.map((source,bodyIndex)=>{
    if(!Number.isInteger(source.boneIndex)||!sourceWorld[source.boneIndex]||byBone.has(source.boneIndex)||
        !Number.isFinite(source.mass)||source.mass<=0||!Number.isFinite(source.drag)||source.drag<0||
        !Number.isFinite(source.angularDrag)||source.angularDrag<0||!Array.isArray(source.contactSpheres))
      throw new TypeError('Source body mass, drag, unique bone and contact shapes required');
    const world=sourceWorld[source.boneIndex].slice();
    const scale=Math.max(Math.hypot(world[0],world[1],world[2]),Math.hypot(world[4],world[5],world[6]),Math.hypot(world[8],world[9],world[10]));
    const spheres=source.contactSpheres.map(s=>{
      if(!Number.isFinite(s.radius)||s.radius<=0)throw new TypeError('Positive shape radius required');
      return {center:triple(s.center),radius:s.radius*scale};
    });
    // Colliderless connecting bodies still have inertia from their authored
    // connected anchors, rather than an arbitrary replacement collision shape.
    let extent=0;
    for(const s of spheres)extent=Math.max(extent,length(sub(transform(world,s.center),point(world)))+s.radius);
    for(const j of definition.joints) {
      if(j.body===bodyIndex)extent=Math.max(extent,length(triple(j.anchor))*scale);
      if(j.connectedBody===bodyIndex)extent=Math.max(extent,length(triple(j.connectedAnchor))*scale);
    }
    const prior=previousWorld?.[source.boneIndex];
    const measuredLinear=prior?mul(sub(point(world),point(prior)),1/poseDeltaSeconds):null;
    const measuredAngular=prior?mul(rotationVector(multiplyMatrices(world,inverse(prior))),1/poseDeltaSeconds):null;
    const measuredValid=measuredLinear && measuredAngular &&
      length(measuredLinear)<=40 && length(measuredAngular)<=80;
    const body={source,position:point(world),world,collisionWorld:world.slice(),
      velocity:measuredValid?measuredLinear:{...velocity},
      angularVelocity:measuredValid?measuredAngular:zero(),forces:[],spheres,
      inverseMass:1/source.mass,inverseInertia:extent>1e-8?1/(0.4*source.mass*extent*extent):0};
    byBone.set(source.boneIndex,body);return body;
  });
  const joints=definition.joints.map(source=>{
    const a=bodies[source.body],b=bodies[source.connectedBody];
    const limits=source.limits;
    if(!a||!b||a===b||!limits||!['lowTwist','highTwist','swing1','swing2'].every(k=>Number.isFinite(limits[k]))||
        limits.lowTwist>limits.highTwist||limits.swing1<0||limits.swing2<0)throw new TypeError('Source joint bodies and angular limits required');
    return {source,a,b,anchor:triple(source.anchor),connectedAnchor:triple(source.connectedAnchor),frame:jointFrame(source),
      restRelative:multiplyMatrices(inverse(restWorld[b.source.boneIndex]),restWorld[a.source.boneIndex]),enabled:true};
  });
  const runtime={definition,collisionScene,bodies,joints,byBone,sourceWorld,sourceLocal,inverseModel:inverse(model),
    boneWorldMatrices:sourceWorld.map(m=>m.slice()),boneModelMatrices:new Float32Array(boneModelMatrices),
    elapsed:0,cleanupRequested:false,gravity:vector(definition.gravity),physics:'source-anchored-angular-PBD-static-contacts-not-PhysX'};
  runtime.getBoneWorldMatrix=index=>runtime.boneWorldMatrices[index]??null;
  return runtime;
}

/** Real reaction command only: Kill adds no invented kick. Exact hit bone wins;
 * a part fallback selects its first authored Rigidbody. */
export function applyNativeDeathForce(runtime,{boneIndex,partId,mode,vector:force,duration,point:hitPoint=null}) {
  const body=boneIndex==null?runtime.bodies.find(b=>b.source.partId===partId):runtime.byBone.get(boneIndex);
  if(!body)throw new RangeError('Impact has no source Rigidbody');
  const value=vector(force);
  if(mode==='Impulse') {
    const contactPoint=hitPoint===null?null:vector(hitPoint);
    // Web-only game feel: a verified, localized hit should move the whole
    // articulated corpse, not only fling one limb against static joints.
    // Transfer 22% of linear impulse to DIRECT, authored joint neighbors.
    // Distributing by their mass gives each neighbor the same delta-v;
    // total impulse remains conserved. No contact point => original behavior.
    const neighbors=contactPoint===null?[]:[...new Set(runtime.joints.flatMap(joint=>
      joint.a===body?[joint.b]:joint.b===body?[joint.a]:[]))];
    const neighborMass=neighbors.reduce((sum,neighbor)=>sum+neighbor.source.mass,0);
    const share=neighborMass>0?0.22:0; // creative Web tuning, NOT source PhysX.
    const localImpulse=mul(value,1-share);
    for(const axis of axes)body.velocity[axis]+=localImpulse[axis]*body.inverseMass;
    if(share>0)for(const neighbor of neighbors)for(const axis of axes)
      neighbor.velocity[axis]+=value[axis]*share/neighborMass;
    if(contactPoint!==null) {
      // Only the impulse retained by the struck bone contributes local torque.
      // The transferred linear impulse acts at connected body centres.
      const lever=sub(contactPoint,body.position);
      const angularKick=mul(cross(lever,localImpulse),body.inverseInertia);
      const speed=length(angularKick);
      const bounded=speed>12?mul(angularKick,12/speed):angularKick;
      for(const axis of axes)body.angularVelocity[axis]+=bounded[axis];
    }
  } else if(mode==='ConstantForce') {
    if(!Number.isFinite(duration)||duration<0)throw new TypeError('Source force duration required');
    body.forces.push({vector:value,until:runtime.elapsed+duration});
  } else throw new TypeError('Only source Impulse/ConstantForce supported');
}

// The static Dojo collider AABBs do not move during a round; only enabled
// changes (shared with nativeCollisionView). Index their X intervals once per
// collision view, instead of scanning every authored box for every sphere,
// contact correction and joint iteration of every corpse. This is a Web-only
// broadphase: original source boxes, contacts and sweep order remain intact.
// Rebuild if the host replaces or changes the length of scene.boxes.
const deathCollisionIndexes = new WeakMap();
function deathBoxIntervalTree(entries) {
  if(entries.length===0)return null;
  const mids=entries.map(entry=>entry.box.min.x/2+entry.box.max.x/2)
    .sort((a,b)=>a-b);
  const center=mids[Math.floor(mids.length/2)];
  const left=[],right=[],crossing=[];
  for(const entry of entries) {
    if(entry.box.max.x<center)left.push(entry);
    else if(entry.box.min.x>center)right.push(entry);
    else crossing.push(entry);
  }
  return {
    center,
    left:deathBoxIntervalTree(left),
    right:deathBoxIntervalTree(right),
    byMin:crossing.slice().sort((a,b)=>a.box.min.x-b.box.min.x||a.index-b.index),
    byMax:crossing.slice().sort((a,b)=>b.box.max.x-a.box.max.x||a.index-b.index),
  };
}
function deathCollisionIndex(scene) {
  const cached=deathCollisionIndexes.get(scene);
  if(cached?.boxes===scene.boxes && cached.length===scene.boxes.length)return cached.root;
  const root=deathBoxIntervalTree(scene.boxes.map((box,index)=>({box,index})));
  deathCollisionIndexes.set(scene,{boxes:scene.boxes,length:scene.boxes.length,root});
  return root;
}
function deathBoxCandidates(node,minX,maxX,entries) {
  if(!node)return;
  if(maxX<node.center) {
    for(const entry of node.byMin) {
      if(entry.box.min.x>maxX)break;
      entries.push(entry);
    }
    deathBoxCandidates(node.left,minX,maxX,entries);
  } else if(minX>node.center) {
    for(const entry of node.byMax) {
      if(entry.box.max.x<minX)break;
      entries.push(entry);
    }
    deathBoxCandidates(node.right,minX,maxX,entries);
  } else {
    entries.push(...node.byMin);
    deathBoxCandidates(node.left,minX,maxX,entries);
    deathBoxCandidates(node.right,minX,maxX,entries);
  }
}
// Broadphase before expensive triangle/penetration sweeps. Preserve the
// original scene.boxes order for equal-time hit tie-breaking and keep enabled
// dynamic: toggling a source collider must be visible without rebuilding.
function nearbyStaticBoxes(scene,start,end,radius) {
  const min={x:Math.min(start.x,end.x)-radius,y:Math.min(start.y,end.y)-radius,
    z:Math.min(start.z,end.z)-radius};
  const max={x:Math.max(start.x,end.x)+radius,y:Math.max(start.y,end.y)+radius,
    z:Math.max(start.z,end.z)+radius};
  const entries=[];
  deathBoxCandidates(deathCollisionIndex(scene),min.x,max.x,entries);
  entries.sort((a,b)=>a.index-b.index);
  return {boxes:entries.map(({box})=>box).filter(box=>box.enabled &&
    box.max.x>=min.x && box.min.x<=max.x &&
    box.max.y>=min.y && box.min.y<=max.y &&
    box.max.z>=min.z && box.min.z<=max.z)};
}
function contactsFor(runtime,body,displacement,contacts) {
  // Sweep the shape centers from the last collision-admitted pose, including
  // joint corrections and angular movement. Sphere-center chords approximate
  // angular CCD; this is not native convex rotational CCD.
  const from=body.collisionWorld,requested=body.world.slice();
  for(let i=0;i<3;i++)requested[12+i]+=displacement[axes[i]];
  let fraction=1;
  const record=hit=>contacts.push({boneIndex:body.source.boneIndex,partId:body.source.partId,...hit});
  for(const sphere of body.spheres) {
    const start=transform(from,sphere.center),end=transform(requested,sphere.center),candidate={...start};
    const localScene=nearbyStaticBoxes(runtime.collisionScene,start,end,sphere.radius);
    const hits=localScene.boxes.length
      ? moveNativeFragmentSphere(localScene,candidate,body.velocity,sub(end,start),
        sphere.radius,runtime.definition.material)
      : [];
    const first=hits.find(hit=>!hit.penetration);
    if(first)fraction=Math.min(fraction,first.t);
    for(const hit of hits)record(hit);
  }
  if(fraction===1)body.world=requested;
  else {
    const angular=rotationVector(multiplyMatrices(requested,inverse(from)));
    body.world=multiplyMatrices(rotation(mul(angular,fraction)),from);
    for(let i=0;i<3;i++)body.world[12+i]=from[12+i]+(requested[12+i]-from[12+i])*fraction;
  }
  body.position=point(body.world);
  // Initial overlaps and rotational chord error are resolved against actual
  // source box faces; no guessed horizontal ground plane is introduced.
  for(let iteration=0;iteration<2;iteration++)for(const sphere of body.spheres) {
    const start=transform(body.world,sphere.center),candidate={...start};
    const localScene=nearbyStaticBoxes(runtime.collisionScene,start,start,sphere.radius);
    const hits=localScene.boxes.length
      ? moveNativeFragmentSphere(localScene,candidate,body.velocity,zero(),
        sphere.radius,runtime.definition.material)
      : [];
    if(hits.length) {
      translate(body,sub(candidate,start));
      for(const hit of hits)record(hit);
    }
  }
  body.collisionWorld=body.world.slice();
}
function solveAnchor(joint) {
  const {a,b}=joint,pa=transform(a.world,joint.anchor),pb=transform(b.world,joint.connectedAnchor);
  const delta=sub(pa,pb),distance=length(delta);
  if(distance<1e-9)return;
  const n=mul(delta,1/distance),ra=cross(sub(pa,a.position),n),rb=cross(sub(pb,b.position),n);
  const weight=a.inverseMass+b.inverseMass+dot(ra,ra)*a.inverseInertia+dot(rb,rb)*b.inverseInertia;
  const impulse=distance/weight;
  translate(a,mul(n,-impulse*a.inverseMass));translate(b,mul(n,impulse*b.inverseMass));
  rotateBody(a,mul(ra,-impulse*a.inverseInertia));rotateBody(b,mul(rb,impulse*b.inverseInertia));
}
function solveLimits(joint) {
  const {a,b,frame}=joint,target=multiplyMatrices(b.world,joint.restRelative);
  const relative=multiplyMatrices(inverse(target),a.world),v=rotationVector(relative);
  const l=joint.source.limits,r=Math.PI/180;
  const twist=Math.max(l.lowTwist*r,Math.min(l.highTwist*r,dot(v,frame[0])));
  let swing1=l.swing1>0?dot(v,frame[1]):0;
  let swing2=l.swing2>0?dot(v,frame[2]):0;
  // A coupled elliptical swing envelope is closer to a joint cone than
  // independent rotation-vector boxes. This remains a Web approximation:
  // PhysX computes a true angular swing/twist decomposition.
  const swingRadius1=l.swing1*r,swingRadius2=l.swing2*r;
  const swingExtent=(swingRadius1>0?swing1*swing1/(swingRadius1*swingRadius1):0)+
    (swingRadius2>0?swing2*swing2/(swingRadius2*swingRadius2):0);
  if(swingExtent>1){const scale=1/Math.sqrt(swingExtent);swing1*=scale;swing2*=scale;}
  const clamped=zero();
  for(let i=0;i<3;i++){
    const value=[twist,swing1,swing2][i];
    for(const axis of axes)clamped[axis]+=frame[i][axis]*value;
  }
  const desired=multiplyMatrices(target,rotation(clamped));
  const error=rotationVector(multiplyMatrices(desired,inverse(a.world)));
  const total=a.inverseInertia+b.inverseInertia;
  if(total<=1e-12)return;
  rotateBody(a,mul(error,a.inverseInertia/total));rotateBody(b,mul(error,-b.inverseInertia/total));
}
function composePose(runtime) {
  for(let i=0;i<runtime.sourceWorld.length;i++) {
    const body=runtime.byBone.get(i),parent=runtime.definition.boneParents[i];
    const m=body?body.world:parent<0?runtime.sourceWorld[i]:multiplyMatrices(runtime.boneWorldMatrices[parent],runtime.sourceLocal[i]);
    runtime.boneWorldMatrices[i]=m.slice();
    runtime.boneModelMatrices.set(multiplyMatrices(runtime.inverseModel,m),i*16);
  }
}

/** Scaled time only. Host performs the source HDR/pool branch on the single
 * cleanupRequested edge. Attached objects must use getBoneWorldMatrix, which
 * is the same transform as rendering (no visual-only bone length projection).
 */
export function advanceNativeDeathRuntime(runtime,scaledDelta,{limitWebFrameWork=false}={}) {
  if(!Number.isFinite(scaledDelta)||scaledDelta<0)throw new TypeError('Nonnegative scaled delta required');
  if(typeof limitWebFrameWork!=='boolean')throw new TypeError('limitWebFrameWork must be boolean');
  const target=runtime.elapsed+scaledDelta;
  if(!Number.isFinite(target))throw new RangeError('Death clock overflow');
  // The native Kill path schedules pool/disappear at killTime (or starts an
  // additional HDR cleanup branch). The host has not consumed that request
  // yet. Do not keep spending CPU on an already-expired Web PBD actor while
  // the last rendered pose is held as an explicit, non-native fallback.
  if(runtime.cleanupRequested) {
    runtime.elapsed=target;
    return {boneModelMatrices:runtime.boneModelMatrices,contacts:[],
      cleanupRequested:false,droppedWebSimulationTime:runtime.droppedWebSimulationTime??0};
  }
  const contacts=[];
  // Source dt retained for every executed substep. On a slow Web frame,
  // dropping excess simulation time is preferable to a feedback loop of
  // more work, lower FPS and ever larger deltas. Cleanup still uses world time.
  const budgetedDelta=limitWebFrameWork
    ? Math.min(scaledDelta,WEB_MAX_DEATH_SUBSTEPS*runtime.definition.fixedDelta)
    : scaledDelta;
  // No further Web PBD work after the source's first cleanup trigger. The
  // HDR branch can extend *visibility* by one scaled second: only the host,
  // with the actual HDR flags, may choose when to hide/pool the mesh.
  const acceptedDelta=Math.min(budgetedDelta,
    Math.max(0,runtime.definition.cleanupAfterSeconds-runtime.elapsed));
  runtime.droppedWebSimulationTime=(runtime.droppedWebSimulationTime??0)+scaledDelta-budgetedDelta;
  let remaining=acceptedDelta;
  while(remaining>1e-12) {
    const dt=Math.min(runtime.definition.fixedDelta,remaining);
    const contactStart=contacts.length;
    for(let i=0;i<runtime.bodies.length;i++) {
      const body=runtime.bodies[i];
      for(const axis of axes) {
        let impulse=0;
        for(const force of body.forces)impulse+=force.vector[axis]*Math.max(0,Math.min(dt,force.until-runtime.elapsed));
        body.velocity[axis]=(body.velocity[axis]+(body.source.useGravity?runtime.gravity[axis]*dt:0)+impulse*body.inverseMass)/(1+body.source.drag*dt);
        body.angularVelocity[axis]/=1+body.source.angularDrag*dt;
      }
      rotateBody(body,mul(body.angularVelocity,dt));
      contactsFor(runtime,body,mul(body.velocity,dt),contacts);
      body.forces=body.forces.filter(f=>f.until>runtime.elapsed+dt);
    }
    // Alternate a small number of contact passes with the source number of
    // joint iterations. A single final collision pass can separate linked
    // bones after the joints were satisfied; querying every iteration caused
    // the catastrophic full-scene collision workload.
    const jointIterations=runtime.definition.solverIterations;
    const collisionInterval=Math.max(1,Math.ceil(jointIterations/3));
    for(let iteration=0;iteration<jointIterations;iteration++) {
      for(const joint of runtime.joints)if(joint.enabled){solveLimits(joint);solveAnchor(joint);}
      if((iteration+1)%collisionInterval===0 || iteration===jointIterations-1) {
        for(const body of runtime.bodies)contactsFor(runtime,body,zero(),contacts);
      }
    }
    for(let i=0;i<runtime.bodies.length;i++) {
      const body=runtime.bodies[i];
      // The angular/linear joint correction is a POSITION projection. The
      // previous implementation added correction/dt to body.velocity, then
      // repeated that impulse each substep: artificial energy, flying elastic
      // corpses. Preserve source gravity/forces and admitted collision
      // impulses only; never turn solver error into kinetic energy.
      for(let c=contactStart;c<contacts.length;c++) {
        const contact=contacts[c];
        if(contact.boneIndex!==body.source.boneIndex)continue;
        const inward=dot(body.velocity,contact.normal);
        if(inward<0)for(const axis of axes)body.velocity[axis]-=contact.normal[axis]*inward;
      }
      // Likewise, do not create spin from a joint-correction quaternion.
    }
    runtime.elapsed+=dt;remaining-=dt;composePose(runtime);
  }
  runtime.elapsed=target;
  const cleanupRequested=!runtime.cleanupRequested&&runtime.elapsed>=runtime.definition.cleanupAfterSeconds;
  if(cleanupRequested)runtime.cleanupRequested=true;
  return {boneModelMatrices:runtime.boneModelMatrices,contacts,cleanupRequested,
    droppedWebSimulationTime:runtime.droppedWebSimulationTime??0};
}
