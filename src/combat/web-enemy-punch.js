/**
 * Web J3 enemy melee: make a punch readable BEFORE it can damage the player.
 * This is intentionally creative Web tuning, not a native MCD animation/event.
 * Only the encounter owner decides whether a target is in actual reach/line
 * of sight. That evidence must be refreshed on EVERY tick, including impact.
 *
 * The caller owns animation: "started" triggers the punch wind-up pose now;
 * only "contact" may call damagePlayer(), and only once per swing. No render,
 * audio, source asset, wall-time clock, or global mutable state is needed.
 */
export const WEB_ENEMY_PUNCH = Object.freeze({
  windupSeconds: 0.24,
  recoverySeconds: 0.75,
  whiffRecoverySeconds: 0.32,
});

/**
 * @typedef {'ready'|'windup'|'recovery'} WebPunchPhase
 * @typedef {{phase:WebPunchPhase,remainingSeconds:number,attackId:number}} WebPunchState
 * @typedef {'none'|'started'|'contact'|'cancelled'} WebPunchEvent
 * @typedef {{event:WebPunchEvent,phase:WebPunchPhase,attackId:number}} WebPunchReceipt
 */

/** @returns {WebPunchState} Distinct state per enemy and per replay. */
export function createWebEnemyPunchState() {
  return { phase:'ready',remainingSeconds:0,attackId:0 };
}

function flag(value,name) {
  if(typeof value!=='boolean')throw new TypeError(name+' must be a boolean');
}
function duration(value,name) {
  if(!Number.isFinite(value)||value<0)throw new TypeError(name+' must be finite and nonnegative');
}

/**
 * Advance a single enemy's *scaled gameplay* clock. Player reach and clear
 * geometry must be sampled afresh by the caller; an interrupted swing never
 * carries a hit into the next frame. A windup is not a hit event.
 *
 * @param {WebPunchState} state Mutated state belonging to exactly one actor.
 * @param {{scaledDeltaTime:number,attackerActive:boolean,attackerAlive:boolean,
 * playerAlive:boolean,unarmed:boolean,stunned:boolean,
 * inReach:boolean,lineClear:boolean}} input
 * @param {{windupSeconds:number,recoverySeconds:number,whiffRecoverySeconds:number}} timings
 * @returns {WebPunchReceipt}
 */
export function advanceWebEnemyPunch(state,{
  scaledDeltaTime,attackerActive,attackerAlive,playerAlive,unarmed,stunned,inReach,lineClear,
},timings=WEB_ENEMY_PUNCH) {
  if(!state || !['ready','windup','recovery'].includes(state.phase) ||
      !Number.isSafeInteger(state.attackId) || state.attackId<0)
    throw new TypeError('valid per-enemy punch state required');
  duration(state.remainingSeconds,'remainingSeconds');
  duration(scaledDeltaTime,'scaledDeltaTime');
  for(const [name,value] of Object.entries({
    attackerActive,attackerAlive,playerAlive,unarmed,stunned,inReach,lineClear,
  })) flag(value,name);
  for(const name of ['windupSeconds','recoverySeconds','whiffRecoverySeconds'])
    duration(timings[name],name);
  if(timings.windupSeconds===0)throw new RangeError('punch needs a visible nonzero windup');

  const receipt=event=>({event,phase:state.phase,attackId:state.attackId});
  const attackerCanPunch=attackerActive&&attackerAlive&&playerAlive&&unarmed&&!stunned;
  const hasContact=attackerCanPunch&&inReach&&lineClear;

  // Recovery is consumed even if another enemy dies or player escapes.
  // Do not start a second swing in the same frame that recovery finishes.
  if(state.phase==='recovery') {
    state.remainingSeconds=Math.max(0,state.remainingSeconds-scaledDeltaTime);
    if(state.remainingSeconds===0)state.phase='ready';
    return receipt('none');
  }
  if(state.phase==='windup') {
    // Death, stun, pickup, exit from reach or cover can cancel a committed
    // windup. This is checked again on the exact frame a hit becomes eligible.
    if(!hasContact) {
      state.phase='recovery';
      state.remainingSeconds=attackerCanPunch?timings.whiffRecoverySeconds:0;
      return receipt('cancelled');
    }
    state.remainingSeconds=Math.max(0,state.remainingSeconds-scaledDeltaTime);
    if(state.remainingSeconds===0) {
      state.phase='recovery';
      state.remainingSeconds=timings.recoverySeconds;
      return receipt('contact');
    }
    return receipt('none');
  }
  if(!hasContact || scaledDeltaTime===0)return receipt('none');
  if(state.attackId===Number.MAX_SAFE_INTEGER)throw new RangeError('attack id exhausted');
  state.attackId++;
  state.phase='windup';
  state.remainingSeconds=timings.windupSeconds;
  return receipt('started');
}
