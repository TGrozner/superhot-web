// MCD PejAiSpawner.Awake/Update/GetRandomSpawnPoint/SpawnOrder.Update.
// No authored order is inferred: point/template draws remain explicit randomness.
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const finitePoint=p=>p && ['x','y','z'].every(k=>Number.isFinite(p[k]));
function number(v,name) {
  if (!Number.isFinite(v)||v<0) throw new TypeError(name+' must be finite and nonnegative');
}
function roll(random) {
  const v=random();
  if (!Number.isFinite(v)||v<0||v>=1) throw new TypeError('random must return [0,1)');
  return v;
}

/** settings are POST-Awake values (difficulty overrides already applied).
 * Initial EnemiesLeft is not the completed replay's observed zero counter.
 */
export function createNativeSpawnerState(settings,random=Math.random) {
  for (const name of ['startDelay','spawnDelay','enemiesLeft','maxEnemiesOnScene']) number(settings[name],name);
  if (typeof settings.endless!=='boolean') throw new TypeError('endless must be boolean');
  return {startDelayRemaining:settings.startDelay,intervalRemaining:roll(random)*settings.spawnDelay,
    enemiesLeft:settings.enemiesLeft,pending:[],lastSpawnPointId:null};
}

/** Exact source geometric eligibility, including its unusual ray FROM the
 * spawner root (not the candidate point). castRay returns null or {isPlayer}.
 * Unknown cast results fail closed. nearestEnemyAt returns null or
 * {position, standingAtCampingPoint}; caller excludes dead/pooled enemies.
 */
export function eligibleNativeSpawnPoints(settings,{
  points,playerPosition,playerForward,cameraPosition,spawnerPosition,nearestEnemyAt,castRay,pendingPointIds,
}) {
  for (const [name,p] of Object.entries({playerPosition,playerForward,cameraPosition,spawnerPosition})) {
    if (!finitePoint(p)) throw new TypeError(name+' must be finite xyz');
  }
  number(settings.safeDistance,'safeDistance');
  for (const name of ['dontSpawnNearPlayer','dontSpawnNearEnemies','removeInactiveSpawnPoints']) {
    if (typeof settings[name]!=='boolean') throw new TypeError(name+' must be boolean');
  }
  // The source bypasses all visibility/activity/queue filters in this branch.
  if (!settings.dontSpawnNearPlayer && !settings.dontSpawnNearEnemies) return points.slice();
  return points.filter(point=>{
    if (!finitePoint(point.position)) throw new TypeError('spawn point position required');
    const playerDistance=distance(point.position,playerPosition);
    if (settings.dontSpawnNearPlayer && playerDistance<settings.safeDistance) return false;
    if (settings.dontSpawnNearEnemies) {
      const enemy=nearestEnemyAt(point.position);
      if (enemy && !enemy.standingAtCampingPoint && distance(enemy.position,point.position)<settings.safeDistance) return false;
    }
    if (pendingPointIds.has(point.id)) return false;
    const direction={x:cameraPosition.x-point.position.x,y:0,z:cameraPosition.z-point.position.z};
    const length=Math.hypot(direction.x,direction.z), forwardLength=Math.hypot(playerForward.x,playerForward.y,playerForward.z);
    const cosine=length && forwardLength ? (playerForward.x*direction.x+playerForward.z*direction.z)/(length*forwardLength) : 1;
    const angle=Math.acos(Math.max(-1,Math.min(1,cosine)))*180/Math.PI;
    let excluded=true;
    if (angle<80) {
      const hit=castRay({origin:spawnerPosition,direction:length ? {x:direction.x/length,y:0,z:direction.z/length} : direction,maxDistance:playerDistance});
      if (hit===undefined) return false;
      if (hit!==null) {
        if (typeof hit.isPlayer!=='boolean') throw new TypeError('cast hit must identify player');
        if (!hit.isPlayer) excluded=false;
      }
    } else excluded=false;
    return !excluded && (!settings.removeInactiveSpawnPoints || point.active===true);
  });
}

/** Returns ordered door-warning/spawn commands, mutating only this spawner.
 * getEligiblePoints is invoked only when a source spawn attempt is due; use
 * eligibleNativeSpawnPoints with the passed pendingPointIds. Templates are the
 * actual GetComponentsInChildren(includeInactive:true) factories, not markers.
 */
export function advanceNativeSpawner(state,settings,{
  scaledDeltaTime,unscaledDeltaTime,enabled,spawningAreaInitialized,currentEnemyCount,templates,getEligiblePoints,
},random=Math.random) {
  number(scaledDeltaTime,'scaledDeltaTime'); number(unscaledDeltaTime,'unscaledDeltaTime');
  number(currentEnemyCount,'currentEnemyCount');
  if (typeof enabled!=='boolean'||typeof spawningAreaInitialized!=='boolean') throw new TypeError('explicit enabled and spawningAreaInitialized required');
  const commands=[];
  if (!enabled) return commands;
  state.startDelayRemaining-=unscaledDeltaTime;
  if (state.startDelayRemaining>0 || !spawningAreaInitialized) return commands;
  state.intervalRemaining-=scaledDeltaTime;
  const total=currentEnemyCount+state.pending.length;
  if (total===0) state.intervalRemaining=-1999;
  if (state.intervalRemaining<0) {
    if (total<settings.maxEnemiesOnScene && (state.enemiesLeft>0||settings.endless) && templates.length) {
      let points=getEligiblePoints(new Set(state.pending.map(order=>order.point.id)));
      if (total===0 && points.length>1 && (settings.dontSpawnNearPlayer||settings.dontSpawnNearEnemies)) {
        points=points.filter(point=>point.id!==state.lastSpawnPointId);
      }
      if (points.length) {
        const point=points[Math.floor(roll(random)*points.length)];
        // Source Spawn succeeds even without doors but queues no SpawnOrder.
        if (point.door!==null) {
          number(point.door.redLightIntensityPickTime,'redLightIntensityPickTime');
          const template=templates[Math.floor(roll(random)*templates.length)];
          const delay=point.door.redLightIntensityPickTime+1;
          state.pending.push({point,template,remaining:delay});
          state.lastSpawnPointId=point.id;
          commands.push({type:'door-warning',point,delay});
        }
        state.enemiesLeft--;
      }
    }
    state.intervalRemaining=settings.spawnDelay;
  }
  // New orders receive this frame's unscaled delta, as in DelayedEnemySpawn.
  for (let i=0;i<state.pending.length;) {
    const order=state.pending[i]; order.remaining-=unscaledDeltaTime;
    if (order.remaining<=0) {
      commands.push({type:'spawn',point:order.point,template:order.template});
      state.pending.splice(i,1);
    } else i++;
  }
  return commands;
}
