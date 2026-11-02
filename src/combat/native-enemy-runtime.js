import { planPejAiPlayerSight } from './ai-visibility.js';

// Behavioral reconstruction, MCD build 20299547: PejAiController GunAttack,
// UpdateSpeed/UpdateTargetReroll; PejAiWeapon readiness; GunPejAiWeapon deferred
// spawn; AimTarget.Update/IsReady. Prefab/difficulty values are caller inputs.
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const subtract=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const magnitude=v=>Math.hypot(v.x,v.y,v.z);
const normalized=v=>{ const n=magnitude(v); return n===0 ? {x:0,y:0,z:0} : {x:v.x/n,y:v.y/n,z:v.z/n}; };
const addScaled=(a,b,s)=>({x:a.x+b.x*s,y:a.y+b.y*s,z:a.z+b.z*s});
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const angle=(a,b)=>Math.acos(clamp(dot(normalized(a),normalized(b)),-1,1))*180/Math.PI;
const signedAngle=(a,b)=>angle(a,b)*(a.z*b.x-a.x*b.z<0 ? -1 : 1);
const flat=v=>({x:v.x,y:0,z:v.z});
function nonnegative(value,name) {
  if (!Number.isFinite(value)||value<0) throw new TypeError(name+' must be finite and nonnegative');
}
function point(value,name) {
  if (!value || !['x','y','z'].every(k=>Number.isFinite(value[k]))) throw new TypeError(name+' must be finite xyz');
}
function flag(value,name) {
  if (typeof value!=='boolean') throw new TypeError(name+' must be boolean');
}
function sample(random) {
  const v=random();
  if (!Number.isFinite(v)||v<0||v>1) throw new TypeError('random must return [0,1]');
  return v;
}

/** Initialize once after native prefab/archetype/difficulty binding. */
export function createNativeEnemyState(settings) {
  for (const name of ['attackDelay','alertDelay','projectileSpeed','weaponSpeedMultiplier',
    'difficultyWeaponSpeedMultiplier','walkingSpeed','runningSpeed','acceleration',
    'afterglowDuration','stopAimingTime']) nonnegative(settings[name],name);
  flag(settings.alwaysAlert,'alwaysAlert');
  return { speed:0, attackDelayRemaining:settings.attackDelay, alertness:-settings.alertDelay,
    afterglowRemaining:-1000.5, targetNeedsReroll:false, targetRerollWait:0,
    reloaded:false, firstShotWarningSoundPlayed:false, haveBeenSeen:false, pendingShot:null };
}

/** Source scalar acceleration; route/collision adapter supplies direction. */
export function advanceNativeEnemySpeed(state,settings,movement,scaledDeltaTime) {
  nonnegative(scaledDeltaTime,'scaledDeltaTime');
  if (!['standing','walking','running'].includes(movement)) throw new TypeError('explicit movement required');
  const desired=movement==='running' ? settings.runningSpeed : movement==='walking' ? settings.walkingSpeed : 0;
  nonnegative(desired,'movement speed'); nonnegative(settings.acceleration,'acceleration');
  const step=settings.acceleration*scaledDeltaTime;
  state.speed+=clamp(desired-state.speed,-step,step);
  return state.speed;
}

/** Call once in the weapon Update phase, never with unscaled/wall time. */
export function advanceNativeEnemyWeapon(state,settings,scaledDeltaTime) {
  nonnegative(scaledDeltaTime,'scaledDeltaTime');
  state.attackDelayRemaining-=scaledDeltaTime*settings.weaponSpeedMultiplier*settings.difficultyWeaponSpeedMultiplier;
}

/** One selected GunAttack behavior tick, not a fabricated whole behavior tree.
 * Sight is the PR153 classified eye cast. AimTarget and muzzle obstruction are
 * separate gates; afterglow never bypasses those. Unknown gates cannot fire.
 * animationTarget is the CURRENT animated target, not the player position.
 */
export function runNativeEnemyGunAttack(state,settings,{
  scaledDeltaTime, unscaledDeltaTime, targetSight, sightMode, aimTargetInSight, aimReady,
  weaponInRightPosition, allowAttacking, canShot, active, animationTarget,
},random=Math.random) {
  nonnegative(unscaledDeltaTime,'unscaledDeltaTime');
  nonnegative(scaledDeltaTime,'scaledDeltaTime');
  for (const [name,value] of Object.entries({allowAttacking,canShot,active})) flag(value,name);
  for (const [name,value] of Object.entries({aimTargetInSight,aimReady,weaponInRightPosition})) {
    if (value!==null) flag(value,name);
  }
  const sight=planPejAiPlayerSight({mode:sightMode,targetSight,addictHotswitchActive:false,
    afterglowRemaining:state.afterglowRemaining,afterglowDuration:settings.afterglowDuration});
  if (sight.resetAfterglow) state.afterglowRemaining=sight.afterglowValue;
  const actions={status:active && sight.visible===true ? 'running' : 'not-attacking',
    prepareWeapon:false,refreshAimTarget:false,rerollAimTarget:false,aim:false,shot:false,reloadWarning:false};
  let alertnessRising=0;
  if (active && sight.visible===true) {
    actions.prepareWeapon=aimTargetInSight===true;
    alertnessRising=aimTargetInSight===true ? 1 : -1;
    if (aimTargetInSight!==true) actions.refreshAimTarget=true;
    else if (state.targetNeedsReroll) {
      state.targetRerollWait-=scaledDeltaTime;
      if (state.targetRerollWait<0) { state.targetNeedsReroll=false; actions.rerollAimTarget=true; actions.refreshAimTarget=true; }
      // Source returns false on the reroll-completion tick too.
    } else {
      actions.aim=true;
      actions.refreshAimTarget=state.attackDelayRemaining>settings.stopAimingTime || weaponInRightPosition!==true;
      if (weaponInRightPosition===false) state.afterglowRemaining=-1;
      const ready=state.attackDelayRemaining<0 && state.alertness>settings.alertDelay*1.05 && allowAttacking && canShot;
      if (ready && weaponInRightPosition===true) {
        if (aimReady===true) {
          point(animationTarget,'animationTarget');
          state.pendingShot={target:{...animationTarget},speed:settings.projectileSpeed,shooterHaveBeenSeen:state.haveBeenSeen};
          state.haveBeenSeen=true;
          state.reloaded=false;
          state.attackDelayRemaining=settings.attackDelay*(1+sample(random)/10);
          state.targetNeedsReroll=true; state.targetRerollWait=.05;
          actions.shot=true;
        }
      } else if (state.attackDelayRemaining<.1 && !state.reloaded) {
        state.reloaded=true;
        if (!state.firstShotWarningSoundPlayed) { state.firstShotWarningSoundPlayed=true; actions.reloadWarning=true; }
      }
    }
  }
  // Controller.Update applies the behavior's alertness request after running it.
  if (settings.alwaysAlert) state.alertness=settings.alertDelay*4;
  state.alertness+=scaledDeltaTime*settings.weaponSpeedMultiplier*alertnessRising;
  if (state.alertness>1) state.alertness=1999;
  state.alertness=clamp(state.alertness,-settings.alertDelay*.001,settings.alertDelay*2);
  if (state.afterglowRemaining>0) state.afterglowRemaining-=unscaledDeltaTime;
  return actions;
}

/** Animator's late weapon/socket update supplies the current muzzle transform.
 * The shot target is retained from Attack; the muzzle is NOT retained early.
 */
export function consumeNativeEnemyShot(state,muzzlePosition) {
  if (!state.pendingShot) return null;
  point(muzzlePosition,'muzzlePosition');
  const pending=state.pendingShot;
  state.pendingShot=null;
  const direction=normalized(subtract(pending.target,muzzlePosition));
  return {position:{...muzzlePosition},direction,velocity:addScaled({x:0,y:0,z:0},direction,pending.speed),
    target:pending.target,speed:pending.speed,shooterHaveBeenSeen:pending.shooterHaveBeenSeen};
}

/** Source AimTarget smoothing/readiness in native-handed coordinates. Supply
 * actual body/spine/socket transforms from the sampled animation, not yaw-only
 * guessed readiness. Missing muzzle yields ready=false, matching Pivot=null.
 */
export function advanceNativeAimTarget(state,settings,{
  target,muzzle,bodyPosition,bodyForward,spineUp,
},scaledDeltaTime) {
  nonnegative(scaledDeltaTime,'scaledDeltaTime');
  for (const name of ['speed','distanceToTarget','maxAngle','maxBodyToTargetAngle']) nonnegative(settings[name],name);
  flag(settings.immediateMode,'immediateMode');
  for (const [name,value] of Object.entries({target,bodyPosition,bodyForward,spineUp})) point(value,name);
  if (muzzle===null) {
    state.position={...target}; state.hadMuzzle=false;
    return {position:state.position,targetInSight:false,ready:false,turn:null};
  }
  point(muzzle,'muzzle');
  if (!state.hadMuzzle) state.position={...target};
  state.hadMuzzle=true;
  let desired=addScaled(muzzle,normalized(subtract(target,muzzle)),settings.distanceToTarget);
  const yaw=signedAngle(flat(subtract(desired,muzzle)),bodyForward);
  const targetInArc=Math.abs(yaw)<=settings.maxAngle;
  let turn=null;
  if (!targetInArc) {
    const radians=Math.sign(yaw)*settings.maxAngle*Math.PI/180, c=Math.cos(radians), s=Math.sin(radians);
    desired=addScaled(muzzle,{x:c*bodyForward.x-s*bodyForward.z,y:0,z:s*bodyForward.x+c*bodyForward.z},settings.distanceToTarget);
    turn=yaw>0 ? 'left' : 'right';
  }
  const spineForward={x:-spineUp.x,y:-spineUp.y,z:-spineUp.z};
  if (Math.abs(signedAngle(flat(subtract(state.position,bodyPosition)),flat(spineForward)))<=settings.maxAngle) {
    const delta=subtract(desired,state.position);
    state.position=settings.immediateMode || magnitude(delta)<.01 ? desired : addScaled(state.position,delta,Math.min(1,settings.speed*scaledDeltaTime));
  }
  const bodyAngle=Math.abs(signedAngle(subtract(target,bodyPosition),spineForward));
  const targetInSight=targetInArc && bodyAngle<settings.maxBodyToTargetAngle;
  return {position:state.position,targetPosition:desired,targetInSight,
    ready:targetInSight && angle(subtract(desired,muzzle),subtract(state.position,muzzle))<5,turn};
}
