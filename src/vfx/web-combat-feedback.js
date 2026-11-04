/**
 * FRAME//BREAK original Web impact feedback (not MCD/PhysX particles).
 * Short REAL-time debris and a hit-confirm signal from actual Web contacts.
 * Fixed particle budget; no new assets, scene queries or timers.
 */
const MAX_PARTICLES=64;
const axis=['x','y','z'];
const finiteVector=value=>value && axis.every(k=>Number.isFinite(value[k]));
const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const scale=(v,s)=>({x:v.x*s,y:v.y*s,z:v.z*s});
const add=(a,b)=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
const norm=v=>{
  const d=Math.hypot(v.x,v.y,v.z);
  return d>1e-8?scale(v,1/d):null;
};

/** Owned by one gameplay session; caller resets on load/replay. */
export function createWebImpactFeedback(){
  return {particles:[],hitSeconds:0,hitKind:null,burst:0,impactCount:0};
}

export function resetWebImpactFeedback(feedback){
  feedback.particles.length=0;
  feedback.hitSeconds=0;
  feedback.hitKind=null;
  feedback.burst=0;
  feedback.impactCount=0;
}

/**
 * kind = 'kill' | 'hit' | 'wall'. Only actual resolved contacts call this.
 * All speeds/lifetimes/colors are intentionally authored Web aesthetics.
 * The hit marker is for confirmed enemy contact, never for a wall.
 */
export function recordWebImpact(feedback,{kind,point,direction}){
  if(!['kill','hit','wall'].includes(kind) || !finiteVector(point) ||
      !finiteVector(direction))return false;
  const forward=norm(direction);
  if(!forward)return false;
  const guide=Math.abs(forward.y)<0.9?{x:0,y:1,z:0}:{x:1,y:0,z:0};
  const side=norm(cross(forward,guide));
  if(!side)return false;
  const up=cross(side,forward);
  const enemy=kind!=='wall',count=kind==='kill'?11:kind==='hit'?7:5;
  const baseSpeed=kind==='kill'?2.8:kind==='hit'?2.0:1.4;
  const burst=feedback.burst++;
  const tint=kind==='wall'?'#40515c':'#c71739';
  for(let i=0;i<count;i++){
    const theta=(i*2.399963229728653+burst*.61);
    const radial=add(scale(side,Math.cos(theta)),scale(up,Math.sin(theta)));
    const speed=baseSpeed*(.48+(i%5)*.14);
    const velocity=add(scale(radial,speed),
      scale(forward,enemy?(.28*speed):(-.32*speed)));
    const duration=(enemy?.24:.16)+(i%3)*.025;
    feedback.particles.push({
      x:point.x-forward.x*.025,y:point.y-forward.y*.025,z:point.z-forward.z*.025,
      vx:velocity.x,vy:velocity.y,vz:velocity.z,
      size:(enemy?.021:.012)+(i%3)*.008,
      rx:theta,ry:theta*.73,rz:theta*.41,
      color:i%4===0&&enemy?'#f4dfe5':tint,
      life:duration,maxLife:duration,
    });
  }
  if(feedback.particles.length>MAX_PARTICLES)
    feedback.particles.splice(0,feedback.particles.length-MAX_PARTICLES);
  if(enemy){
    feedback.hitSeconds=kind==='kill'?.22:.14;
    feedback.hitKind=kind;
  }
  feedback.impactCount++;
  return true;
}

/** Effects move on unscaled time: readable even in slow-motion; pause freezes. */
export function advanceWebImpactFeedback(feedback,realDelta){
  if(!Number.isFinite(realDelta)||realDelta<0)throw new RangeError('Real delta must be nonnegative');
  // A browser hitch must not extend real-time hit markers or keep expired
  // particles alive. The caller supplies ACTIVE elapsed seconds, not a capped
  // world/physics delta. One analytic gravity step preserves the same flight
  // at 30/60 Hz and after a single delayed frame. Web-authored VFX, not MCD.
  feedback.hitSeconds=Math.max(0,feedback.hitSeconds-realDelta);
  if(feedback.hitSeconds===0)feedback.hitKind=null;
  for(let i=feedback.particles.length-1;i>=0;i--){
    const p=feedback.particles[i];
    p.life-=realDelta;
    if(p.life<=0){feedback.particles.splice(i,1);continue;}
    p.x+=p.vx*realDelta;
    p.y+=p.vy*realDelta-0.8*realDelta*realDelta;
    p.z+=p.vz*realDelta;
    p.vy-=1.6*realDelta;
  }
}

export const WEB_IMPACT_MAX_PARTICLES=MAX_PARTICLES;
