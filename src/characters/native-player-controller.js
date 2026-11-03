import { loadNativeSkinPackage, sampleNativeSkinPose } from './native-skin-pass.js';
import { composeLocalMatrix, multiplyMatrices } from '../scenes/graph.js';

// Restored Web controller from the owner's Dojo recovery checkpoint.
// This is reconstructed Web behavior, not native C# code or an original asset.
const IDENTITY = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const xyz = a => ({ x: a[0], y: a[1], z: a[2] });
const xyzw = a => ({ ...xyz(a), w: a[3] });
const matrix = (p = [0, 0, 0], q = [0, 0, 0, 1], s = [1, 1, 1]) =>
  composeLocalMatrix({ position: xyz(p), rotation: xyzw(q), scale: xyz(s) });
const clamp01 = n => Math.max(0, Math.min(1, n));
// Recovered item vertices and hands vertices use different X conventions.
const mirrorX = m => m.map((v, i) => v * (i % 4 === 0 ? -1 : 1) * (i < 4 ? -1 : 1));
const mirrorOutputX = m => m.map((v, i) => v * (i % 4 === 0 ? -1 : 1));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

function euler(x, y, z) {
  x *= Math.PI / 360; y *= Math.PI / 360; z *= Math.PI / 360;
  const sx = Math.sin(x), cx = Math.cos(x), sy = Math.sin(y), cy = Math.cos(y);
  const sz = Math.sin(z), cz = Math.cos(z);
  return [cy*sx*cz+sy*cx*sz, sy*cx*cz-cy*sx*sz, cy*cx*sz-sy*sx*cz, cy*cx*cz+sy*sx*sz];
}
function quaternionProduct(a, b) {
  const [x,y,z,w] = a, [X,Y,Z,W] = b;
  return [w*X+x*W+y*Z-z*Y, w*Y-x*Z+y*W+z*X, w*Z+x*Y-y*X+z*W, w*W-x*X-y*Y-z*Z];
}
function slerp(a, b, t) {
  let dot = a.reduce((sum,v,i) => sum+v*b[i], 0);
  if (dot < 0) { b = b.map(v => -v); dot = -dot; }
  let result;
  if (dot > 0.9995) result = mix(a,b,t);
  else {
    const angle = Math.acos(Math.min(1,dot)), sine = Math.sin(angle);
    const x = Math.sin((1-t)*angle)/sine, y = Math.sin(t*angle)/sine;
    result = a.map((v,i) => v*x+b[i]*y);
  }
  const length = Math.hypot(...result);
  return result.map(v => v/length);
}
function outBack(t) { const u=t-1; return 1+u*u*((1.70158+1)*u+1.70158); }
function inOutBack(t) {
  const s=1.70158*1.525, u=t*2;
  return u<1 ? 0.5*u*u*((s+1)*u-s) : 0.5*((u-2)**2*((s+1)*(u-2)+s)+2);
}
function inOutExpo(t) {
  if (t===0 || t===1) return t;
  return t<0.5 ? 2**(20*t-10)/2 : (2-2**(-20*t+10))/2;
}

/** Discrete authored blend route; a fractional action is not rounded. */
export function selectNativePlayerClip(state, parameters) {
  let index=0;
  for (let depth=0; depth<state.nodes.length; depth++) {
    const node=state.nodes[index];
    if (!node) throw new RangeError('Player blend child is missing');
    if (!node.children.length) return node.clip;
    const value=parameters[node.parameter], thresholds=node.thresholds;
    if (!Number.isFinite(value)) throw new TypeError('Missing player parameter '+node.parameter);
    let child=thresholds.indexOf(value);
    if (value<=thresholds[0]) child=0;
    else if (value>=thresholds.at(-1)) child=thresholds.length-1;
    if (child<0) throw new RangeError('Fractional player blend is not a discrete action: '+node.parameter);
    index=node.children[child];
  }
  throw new RangeError('Cyclic player blend tree');
}


/**
 * Convert the restored Web controller's camera-local sample into one
 * first-person draw frame. The shared Dojo integrator supplies the actual
 * browser camera basis; this does not assert which native Unity camera ran.
 *
 * The restored controller has already applied its X-output reflection to
 * itemMatrix. Reusing that camera-local matrix in nativeItemDraws() avoids
 * recomputing an unmirrored bone * itemFromBone socket or applying the hands
 * container offset twice. No original katana mesh or pose is included here.
 */
export function projectDojoPlayerFrame({ pose, heldItem, cameraWorldMatrix } = {}) {
  // A source throw immediately switches the recovered controller to
  // unarmed, while its authored Hands.Throw clip can still animate visible
  // hands. No held item or fabricated blade should be required for that pose.
  const unarmedHands = heldItem == null && pose?.profileId === 'unarmed';
  if (!pose?.handsVisible ||
      (!unarmedHands && (heldItem?.isKatana !== true ||
        pose.profileId !== heldItem.id))) return null;
  if (!pose.descriptor || typeof pose.descriptor.clip !== 'string') {
    throw new TypeError('Dojo held player frame requires a source clip descriptor');
  }
  function requireAffine(value, label) {
    if (!value || value.length !== 16 ||
        !Array.from(value).every(Number.isFinite) ||
        value[3] !== 0 || value[7] !== 0 || value[11] !== 0 || value[15] !== 1) {
      throw new TypeError(label + ' must be a finite column-major affine matrix');
    }
    const d = value[0]*(value[5]*value[10]-value[6]*value[9])
      - value[4]*(value[1]*value[10]-value[2]*value[9])
      + value[8]*(value[1]*value[6]-value[2]*value[5]);
    if (!Number.isFinite(d) || Math.abs(d) < 1e-12) {
      throw new RangeError(label + ' must be invertible');
    }
  }
  requireAffine(cameraWorldMatrix, 'Dojo active Web camera matrix');
  requireAffine(pose.handsMatrix, 'Dojo controller handsMatrix');
  if (pose.itemMatrix !== null && pose.itemMatrix !== undefined) {
    requireAffine(pose.itemMatrix, 'Dojo controller itemMatrix');
  }
  const modelMatrix = new Float32Array(multiplyMatrices(cameraWorldMatrix, pose.handsMatrix));
  // nativeItemDraws() already multiplies cameraWorldMatrix by heldMatrix;
  // returning a camera-LOCAL matrix prevents an accidental double camera.
  const itemCameraLocalMatrix = unarmedHands || pose.itemMatrix == null ? null
    : new Float32Array(pose.itemMatrix);
  const itemWorldMatrix = itemCameraLocalMatrix == null ? null
    : new Float32Array(multiplyMatrices(cameraWorldMatrix, itemCameraLocalMatrix));
  return Object.freeze({
    heldItem, profileId: pose.profileId, modelMatrix, descriptor: pose.descriptor,
    itemCameraLocalMatrix, itemWorldMatrix,
    bladeSocketAvailable: itemCameraLocalMatrix !== null,
    nativeCameraActiveVerified: false,
    nativeAnimatorExecutionVerified: false,
  });
}

/** Archived Dojo Hands + weapon container Web state machine.
 * Actions must be driven by accepted gameplay events. It does not infer
 * native Animator state, execute Unity or synthesize missing source clips.
 */
export function createNativePlayerAnimation(packet, { random = Math.random } = {}) {
  if (packet?.schemaVersion!==1 || !packet.profiles?.unarmed || !packet.profiles?.pistol ||
      !Array.isArray(packet.states) || !Array.isArray(packet.anyTransitions))
    throw new TypeError('Original player animation packet required');
  const skin=loadNativeSkinPackage(packet.skin), parameters={ ...packet.parameters };
  if (!Number.isInteger(packet.weaponBone) || packet.weaponBone<0 || packet.weaponBone>=skin.jointCount)
    throw new RangeError('Player weaponBone is outside the original skeleton');
  const stateIndex=new Map(packet.states.map((s,i) => [s.name,i]));
  const idle=stateIndex.get('Hands.Idle');
  if (idle===undefined) throw new TypeError('Original Hands.Idle state required');
  let profile, profileId, current, transition=null, draw=null, recoil=null, cached=null;
  const triggers=new Set(), variants=new Map();
  const readRandom=() => {
    const r=random();
    if (!Number.isFinite(r) || r<0 || r>=1) throw new RangeError('random must return [0,1)');
    return r;
  };
  function stateSample(index, time=0) {
    const state=packet.states[index];
    const clip=selectNativePlayerClip(state,parameters);
    if (!clip || !skin.clips[clip]) throw new Error('Original player clip unavailable for '+state.name);
    return { index, clip, time, playback:packet.skin.clips[clip].loop?'loop':'clamp' };
  }
  function rate(sample) {
    const s=packet.states[sample.index];
    return s.speed*(s.speedParameter ? parameters[s.speedParameter] : 1);
  }
  function accepts(t) {
    return t.conditions.every(c => {
      const value=triggers.has(c.parameter) ? true : parameters[c.parameter];
      switch (c.mode) {
        case 1:return !!value;
        case 2:return !value;
        case 3:return value>c.value;
        case 4:return value<c.value;
        case 6:return value===c.value;
        case 7:return value!==c.value;
        default:throw new RangeError('Unsupported player transition condition');
      }
    });
  }
  function enter(t) {
    const next=stateSample(t.to);
    const duration=t.fixedDuration?t.duration:t.duration*skin.clips[current.clip].duration;
    next.time=t.offset*skin.clips[next.clip].duration;
    if (rate(next)<0 && !t.offset) next.time=skin.clips[next.clip].duration;
    transition=duration>0 ? { from:{...current}, elapsed:0, duration, contract:t } : null;
    current=next;
    for (const c of t.conditions) triggers.delete(c.parameter);
    cached=null;
  }
  function trigger(name) {
    triggers.add(name);
    if (!transition || transition.contract.interruptionSource===1) {
      const candidate=packet.anyTransitions.find(t => accepts(t));
      if (candidate) enter(candidate);
    }
  }
  function equip(id, { animate=true } = {}) {
    const next=packet.profiles[id];
    if (!next) throw new RangeError('Original player equipment unavailable: '+id);
    const previous=profile?.weaponSubType;
    profile=next; profileId=id;
    Object.assign(parameters,{Weapon_Type:next.weaponType,Weapon_SubType:next.weaponSubType,
      IdleVariant:next.idleVariant,WeaponInHand:id!=='unarmed'});
    transition=null; triggers.clear(); recoil=null; variants.clear();
    // Inactive pistol/MG/sniper bHands does not evaluate a ranged blend tree.
    if (profile.handsVisible) current=stateSample(idle);
    draw=null;
    if (animate && id!=='unarmed') {
      const ranged=next.weaponType===2, throwable=next.drawingStyle==='throwable';
      const rotated=next.weaponSubType!==9002 && ![2000,2001,2002].includes(previous) && !ranged;
      const style=next.drawingStyle;
      const cameraPosition=style==='machinegun'?[-0.35,-0.2,0.65]:
        throwable&&rotated?[-0.7,-0.2,0.65]:ranged?[-0.65,-0.1,0.1]:null;
      draw={time:0,speed:1,position:cameraPosition?cameraPosition.map((v,i)=>v-next.handPosition[i]):[0,0,0],
        rotation:style==='machinegun'?euler(10,-30,-30):
          throwable&&rotated?euler(-10,-30,-30):ranged?euler(0,-90,45):rotated?euler(0,-130,0):[0,0,0,1],
        positionDuration:next.pickupDuration,rotationDuration:next.pickupDuration,rotationEase:outBack};
      if (style==='shotgun' || style==='sniperrifle') {
        const shotgun=style==='shotgun';
        draw.position=shotgun?[-0.03,-0.12,-0.6]:[-0.12,-0.2,0];
        draw.rotation=shotgun?euler(7.8,-40,-18):euler(12,-70,0);
        draw.positionDuration*=shotgun?0.6*1.9:0.8;
        draw.rotationDuration*=shotgun?0.5*1.9:1.1;
        draw.rotationEase=inOutBack;
      }
      draw.duration=Math.max(draw.positionDuration,draw.rotationDuration);
    }
    cached=null;
    return profile;
  }
  function chooseAttackVariant() {
    const left=parameters.LeftRight===-1, subtype=profile.weaponSubType;
    const count=profile.weaponType===0 ? (subtype===1?(left?10:11):subtype===2?(left?7:8):(left?4:5))
      : [1001,1003].includes(subtype)?(left?1:2):1;
    const poolSize=profile.weaponType===0 && subtype!==1 ? (subtype===2?7:4) : count;
    const key=String(left);
    let pool=variants.get(key);
    if (!pool) {
      pool={values:Array.from({length:count},(_,i)=>i),index:0,remaining:0};
      variants.set(key,pool);
    }
    if (!pool.remaining) {
      const remaining=[...pool.values];
      // Recovered selector excludes the last candidate until it is alone.
      for (let i=0;i<count;i++) {
        const selected=remaining.length===1?0:Math.floor(readRandom()*(remaining.length-1));
        pool.values[i]=remaining.splice(selected,1)[0];
      }
      pool.remaining=poolSize;
    }
    pool.remaining--;
    const result=pool.values[pool.index];
    pool.index=(pool.index+1)%count;
    return result;
  }
  function action(name, options={}) {
    cached=null;
    if (name==='throw') {
      const variant=options.variant??profile.throwVariant??0;
      equip('unarmed',{animate:false}); parameters.ThrowVariant=variant; trigger('Throw');
    } else if (name==='pickup') {
      parameters.WeaponInHand=true;
      current=stateSample(stateIndex.get('Hands.Pull.Pull_End')); transition=null;
    } else if (name==='pull') { parameters.WeaponInHand=false; trigger('Pull'); }
    else if (name==='cancelPull') { trigger('HideHand'); }
    else if (name==='attack') {
      parameters.LeftRight=-parameters.LeftRight;
      parameters.AttackVariant=options.variant??chooseAttackVariant(); trigger('Attack');
      if (draw) draw.speed=profile.weaponSubType===2001?15:5;
    } else if (name==='fire') {
      if (profile.weaponType!==2) throw new RangeError('Fire requires an original firearm profile');
      if (profile.fireAnimation==='hands') {
        action('attack',options);
        return;
      }
      const machinegun=['machinegun','sniperrifle'].includes(profile.fireAnimation);
      const duration=profile.attackDelay*(profile.fireAnimation==='sniperrifle'?0.5:1);
      const offset=machinegun?[0,readRandom()*0.02,profile.fireAnimation==='sniperrifle'?-0.5:-0.1]:[0.1,0.15,-0.1];
      const angles=machinegun?[1,0,Math.floor(readRandom()*10)-5]:[-30,0,readRandom()*40-20];
      recoil={time:0,duration,outDuration:duration/(machinegun?15:2),
        position:profile.containerPosition.map((v,i)=>v+offset[i]),
        rotation:quaternionProduct(euler(...angles),profile.containerRotation),
        returnEase:machinegun?inOutExpo:inOutBack};
      if (draw) draw.speed=5;
    } else throw new RangeError('Unknown player animation action: '+name);
  }
  function update(realDt,timeScale) {
    if (![realDt,timeScale].every(Number.isFinite) || realDt<0 || timeScale<0)
      throw new RangeError('Player animation clocks must be finite and nonnegative');
    cached=null;
    parameters.TimeScale=timeScale*(timeScale>0.005 && timeScale<0.01 ? 10 : 1);
    const scaled=realDt*timeScale;
    if (draw) {
      draw.time+=scaled*(draw.time>draw.duration*0.05?draw.speed:1);
      if (draw.time>=draw.duration) draw=null;
    }
    if (recoil) { recoil.time+=scaled; if (recoil.time>=recoil.duration) recoil=null; }
    if (!profile.handsVisible) return;
    let remaining=realDt;
    for (let iteration=0;iteration<32;iteration++) {
      const pending=(!transition || transition.contract.interruptionSource===1) && packet.anyTransitions.find(accepts);
      if (pending) enter(pending);
      let boundary=remaining, outgoing=null;
      const speed=rate(current), length=skin.clips[current.clip].duration;
      if (!transition) {
        for (const t of packet.states[current.index].transitions) {
          if (!accepts(t)) continue;
          if (!t.hasExitTime) { outgoing=t; boundary=0; break; }
          const exit=t.exitTime*length;
          const until=speed>0?(exit-current.time)/speed:speed<0?(current.time-exit)/-speed:Infinity;
          if (until>=-1e-9 && until<=boundary) { boundary=Math.max(0,until); outgoing=t; break; }
        }
      } else {
        const blendRate=transition.contract.fixedDuration?1:Math.abs(rate(transition.from));
        if (blendRate>0) boundary=Math.min(boundary,(transition.duration-transition.elapsed)/blendRate);
      }
      current.time+=boundary*speed;
      if (transition) {
        transition.from.time+=boundary*rate(transition.from);
        transition.elapsed+=boundary*(transition.contract.fixedDuration?1:Math.abs(rate(transition.from)));
        if (transition.elapsed>=transition.duration-1e-9) transition=null;
      }
      remaining=Math.max(0,remaining-boundary);
      if (outgoing) enter(outgoing);
      if (remaining<=1e-9) return;
    }
    throw new RangeError('Player animation step crossed too many state boundaries');
  }
  function sample() {
    if (cached) return cached;
    const sourceTransition=transition ? {fromClip:transition.from.clip,fromTime:transition.from.time,
      fromPlayback:transition.from.playback,elapsed:transition.elapsed,duration:transition.duration} : null;
    const descriptor={clip:current.clip,time:current.time,playback:current.playback,transition:sourceTransition};
    const pose=profile.handsVisible?sampleNativeSkinPose(skin,descriptor):null;
    let root=IDENTITY, cp=profile.containerPosition, cq=profile.containerRotation;
    if (draw) {
      const positionBlend=outBack(clamp01(draw.time/draw.positionDuration));
      const rotationBlend=draw.rotationEase(clamp01(draw.time/draw.rotationDuration));
      root=matrix(mix(draw.position,[0,0,0],positionBlend),
        slerp(draw.rotation,[0,0,0,1],rotationBlend));
    }
    if (recoil) {
      const outward=recoil.time<recoil.outDuration;
      const t=outward?recoil.time/recoil.outDuration:
        (recoil.time-recoil.outDuration)/(recoil.duration-recoil.outDuration);
      const blend=outward?1-(1-t)**2:recoil.returnEase(t);
      cp=outward?mix(profile.containerPosition,recoil.position,blend):mix(recoil.position,profile.containerPosition,blend);
      cq=outward?slerp(profile.containerRotation,recoil.rotation,blend):slerp(recoil.rotation,profile.containerRotation,blend);
    }
    const container=matrix(cp,cq,profile.containerScale);
    const handsMatrix=multiplyMatrices(multiplyMatrices(matrix(profile.handPosition),root),container);
    const weaponDeltaMatrix=mirrorX(multiplyMatrices(handsMatrix,profile.restFrameInverse));
    let weaponBoneMatrix=null, itemMatrix=null;
    if (pose) {
      const bone=pose.boneModelMatrices.subarray(packet.weaponBone*16,packet.weaponBone*16+16);
      weaponBoneMatrix=multiplyMatrices(handsMatrix,bone);
      if (profile.itemFromBone) itemMatrix=mirrorOutputX(multiplyMatrices(weaponBoneMatrix,profile.itemFromBone));
    }
    const weaponModelMatrix=profile.models?.length
      ? mirrorX(profile.modelOnWeaponBone?weaponBoneMatrix:handsMatrix) : null;
    cached={profileId,state:packet.states[current.index].name,handsVisible:profile.handsVisible,
      descriptor,pose,handsMatrix,rootMatrix:root,containerMatrix:container,weaponDeltaMatrix,weaponBoneMatrix,itemMatrix,
      weaponModelMatrix,models:profile.models??[],attackDelay:profile.attackDelay};
    return cached;
  }
  function reset() {
    Object.assign(parameters,packet.parameters);
    profile=null;
    equip('unarmed',{animate:false});
  }
  reset();
  return {skin,equip,action,update,sample,reset};
}
