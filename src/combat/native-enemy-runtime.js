import { planPejAiPlayerSight } from './ai-visibility.js';
import { planEnemyShotgunLateVolley } from './enemy-shotgun.js';

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
// J2 authored Web game-feel, NOT a recovered MCD accuracy value. Mobile
// pistols/burst gunners should not track the player with stationary precision.
// Capture movement at ATTACK time; animated muzzle delivery may happen later.
const WEB_MOVING_SHOT_MAX_YAW=0.075; // radians, at full running speed
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
  if (settings.family==='MachineGun' || settings.family==='SniperRifle') {
    nonnegative(settings.longAttackDelay,'longAttackDelay');
    if (!Number.isInteger(settings.seriesLength)||settings.seriesLength<0) {
      throw new TypeError('source seriesLength required');
    }
  }
  if (settings.family==='SniperRifle') nonnegative(settings.firstShotDelay,'firstShotDelay');
  if (settings.family==='Shotgun' &&
      (!Number.isInteger(settings.pelletCount)||settings.pelletCount<0)) {
    throw new TypeError('source pelletCount required');
  }
  return { speed:0, attackDelayRemaining:settings.attackDelay, alertness:-settings.alertDelay,
    afterglowRemaining:-1000.5, targetNeedsReroll:false, targetRerollWait:0,
    reloaded:false, firstShotWarningSoundPlayed:false, haveBeenSeen:false, pendingShot:null,
    seriesRemaining:settings.seriesLength, sniperDelay:0, sniperCanShot:false };
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
  if (settings.family==='SniperRifle') {
    if (state.alertness>settings.alertDelay) {
      state.sniperDelay+=scaledDeltaTime;
      if (state.sniperDelay>=settings.firstShotDelay) state.sniperCanShot=true;
    } else { state.sniperDelay=0; state.sniperCanShot=false; }
  }
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
  // Active real-time frames may have a frozen world clock. Keep the existing
  // zero/zero instant source-evaluation contract (used by pure fire-phase
  // callers), but never advance NEW gun events while real time elapses and
  // world time is exactly zero. The preaccepted pendingShot remains intact.
  const webFrozenActiveFrame=scaledDeltaTime===0 && unscaledDeltaTime>0;
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
      if (!webFrozenActiveFrame && state.targetRerollWait<0) { state.targetNeedsReroll=false; actions.rerollAimTarget=true; actions.refreshAimTarget=true; }
      // Source returns false on the reroll-completion tick too.
    } else {
      actions.aim=true;
      actions.refreshAimTarget=state.attackDelayRemaining>settings.stopAimingTime || weaponInRightPosition!==true;
      if (weaponInRightPosition===false) state.afterglowRemaining=-1;
      // Web delivery guard (not a native MCD claim): Attack may be accepted
      // before the animated muzzle pose is available. Preserve its pending
      // target and avoid additional audio-only Attack intents until LateUpdate
      // has actually emitted the original shot.
      // J2 Web-only: no NEW attack/SFX during an active frozen-world frame.
      const ready=!webFrozenActiveFrame && !state.pendingShot && state.attackDelayRemaining<0 &&
        state.alertness>settings.alertDelay*1.05 && allowAttacking && canShot &&
        (settings.family!=='SniperRifle' || state.sniperCanShot);
      if (ready && weaponInRightPosition===true) {
        const middleOfSeries=(settings.family==='MachineGun' || settings.family==='SniperRifle') &&
          state.seriesRemaining!==settings.seriesLength && state.seriesRemaining!==0;
        if (middleOfSeries || aimReady===true) {
          point(animationTarget,'animationTarget');
          const mobileGun=settings.family==='Pistol'||settings.family==='MachineGun';
          const speedFraction=settings.runningSpeed>0
            ? clamp(state.speed/settings.runningSpeed,0,1) : 0;
          state.pendingShot={target:{...animationTarget},speed:settings.projectileSpeed,
            family:settings.family,shooterHaveBeenSeen:state.haveBeenSeen,
            webMovingYawRange:mobileGun?WEB_MOVING_SHOT_MAX_YAW*speedFraction:0};
          let delay=settings.attackDelay;
          let completed=true;
          if (settings.family==='MachineGun' || settings.family==='SniperRifle') {
            state.seriesRemaining--;
            completed=state.seriesRemaining<=0;
            if (completed) { delay=settings.longAttackDelay; state.seriesRemaining=settings.seriesLength; }
          }
          if (completed) state.reloaded=false;
          if (settings.family!=='SniperRifle' && (settings.family!=='MachineGun' || completed)) state.haveBeenSeen=true;
          state.attackDelayRemaining=delay+sample(random)*settings.attackDelay/10;
          state.targetNeedsReroll=true; state.targetRerollWait=.05;
          actions.shot=true;
        }
      } else if (!webFrozenActiveFrame && !state.pendingShot && state.attackDelayRemaining<.1 && !state.reloaded) {
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

/** LateUpdate after native animation/IK. Shotgun uses the current weapon
 * forward; other guns use the Attack target and current muzzle position.
 * Produces Web bullet requests, not a proof of successful native pooling.
 */
export function consumeNativeEnemyVolley(state,settings,muzzlePosition,weaponForward,random=Math.random) {
  if (!state.pendingShot) return [];
  if (settings.family!=='Shotgun') {
    // Roll only when the ATTACK snapshot recorded actual weapon movement.
    // Keep idle accuracy exact and leave native shotgun dispersion untouched.
    // Invalid RNG must not consume the pending shot.
    const range=state.pendingShot.webMovingYawRange ?? 0;
    const yaw=range>0 ? (sample(random)*2-1)*range : 0;
    const shot=consumeNativeEnemyShot(state,muzzlePosition);
    let direction=shot.direction;
    if(yaw!==0) {
      const cosine=Math.cos(yaw),sine=Math.sin(yaw);
      direction={x:shot.direction.x*cosine-shot.direction.z*sine,
        y:shot.direction.y,
        z:shot.direction.x*sine+shot.direction.z*cosine};
    }
    return [{...shot,direction,
      velocity:addScaled({x:0,y:0,z:0},direction,shot.speed),
      sniper:settings.family==='SniperRifle',
      goThroughGlass:settings.family==='SniperRifle',muzzleFlash:true}];
  }
  const insideSphere=()=>{
    const radius=Math.cbrt(sample(random));
    const z=sample(random)*2-1,theta=sample(random)*Math.PI*2;
    const horizontal=radius*Math.sqrt(1-z*z);
    return {x:horizontal*Math.cos(theta),y:horizontal*Math.sin(theta),z:radius*z};
  };
  const count=Math.max(1,settings.pelletCount);
  const spreadSamples=Array.from({length:count},insideSphere);
  const extraSpeedFactors=Array.from({length:count-1},()=>sample(random)*2-1);
  const volley=planEnemyShotgunLateVolley({
    deferredBulletSpawn:true,pelletCount:settings.pelletCount,muzzlePosition,weaponForward,
    projectileSpeed:settings.projectileSpeed,spreadSamples,extraSpeedFactors
  });
  const seen=state.pendingShot.shooterHaveBeenSeen;
  state.pendingShot=null;
  return volley.requests.map(request=>({
    ...request,position:request.origin,
    target:addScaled(request.origin,request.direction,settings.projectileSpeed),
    shooterHaveBeenSeen:seen,sniper:false,goThroughGlass:false
  }));
}

/** Native MeleeAttack/MeleeWeaponAttack gates; damage is driven by source
 * animation event flags, not by a fabricated arbitrary cooldown window.
 */
export function runNativeEnemyMeleeAttack(settings,{
  active,playerAlive,inFront,enemyPosition,playerPosition,weaponPosition,
  inPunchAnimation,inHitAnimation,inWeaponAttackAnimation,meleeDamage,meleeWeaponDamage,katanaHit,
}) {
  for(const [name,value] of Object.entries({active,playerAlive,inFront,inPunchAnimation,
    inHitAnimation,inWeaponAttackAnimation,meleeDamage,meleeWeaponDamage})) flag(value,name);
  for(const [name,value] of Object.entries({enemyPosition,playerPosition,weaponPosition})) point(value,name);
  const result={attack:false,kill:false,chase:false,status:'not-attacking'};
  if(!active || !playerAlive)return result;
  if(settings.family==='Katana') {
    nonnegative(settings.AttackDistance,'AttackDistance');
    const feet={...playerPosition,y:playerPosition.y-1.6};
    if(!inFront || magnitude(subtract(enemyPosition,feet))>settings.AttackDistance)return result;
    result.attack=!inHitAnimation && !inWeaponAttackAnimation;
    result.kill=meleeWeaponDamage && katanaHit===true;
  } else {
    if(settings.family!=='Melee')throw new TypeError('explicit melee family required');
    nonnegative(settings.meleeAttackDistance,'meleeAttackDistance');
    const a={...weaponPosition},b={...playerPosition};
    if(Math.abs(a.y-b.y)<1){a.y=0;b.y=0;}
    const range=magnitude(subtract(a,b));
    if((range>settings.meleeAttackDistance || !inFront) && !inPunchAnimation)return result;
    result.attack=!inPunchAnimation;
    result.kill=meleeDamage && range<.75;
  }
  result.chase=!result.kill;
  result.status=result.kill?'success':'running';
  return result;
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
