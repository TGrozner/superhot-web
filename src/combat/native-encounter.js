import { createEnemyReactionState } from '../animation/enemy-reaction.js';
import { nativeSegmentHit, nativeSphereHit, nativeCapsuleHit, moveNativeCharacter } from '../scenes/native-collision.js';
import { prepareNativeNavigation, sampleNativeNavigation, findNativeRoute, advanceNativeRoute } from './native-navigation.js';
import { createNativeSpawnerState, eligibleNativeSpawnPoints, advanceNativeSpawner } from './native-spawner.js';
import { createNativeEnemyState, advanceNativeEnemySpeed } from './native-enemy-runtime.js';
import { collectNativeDojoSpawnerFactories, planNativeDojoEnemyActivation } from './native-dojo-factory-plan.js';

const distance = (a, b) => Math.hypot(a.x-b.x, a.y-b.y, a.z-b.z);
const position = enemy => ({ x:enemy.x, y:enemy.y, z:enemy.z });
const living = enemy => enemy.alive && !enemy.reaction?.dead;
const participating = enemy => living(enemy) && enemy.active !== false;
const fromMatrix = matrix => ({ x:matrix[12], y:matrix[13], z:matrix[14] });
const EPSILON = 1e-6;

// J3 Web gameplay tuning, NOT MCD timing: staggered short lateral moves make
// armed enemies less static without changing the source navmesh or gun gates.
const WEB_STRAFE = Object.freeze({
  warmupSeconds: 1.2,
  cycleSeconds: 3.4,
  activeSeconds: 1.35,
  peekSeconds: 2.4, // Web-only: allow longer side search when muzzle is occluded.
  speedFraction: 0.8,
});

// J3 Web behavior, not MCD: armed enemies give ground when the player rushes
// into their personal space. Prefer actual retreat; use diagonals only when
// the navmesh/capsule or another actor blocks the direct escape.
const WEB_DISENGAGE = Object.freeze({
  stopRadiusFraction: 0.8,
  maximumBodyRadii: 5,
  speedFraction: 0.85,
  diagonalBias: 0.6,
});

/** Keep the native collision/navmesh as the authority even for Web-only
 * tactics. Never teleport an actor or cross a blocking actor/player.
 * Blocked lanes reverse once, then the enemy simply holds its position.
 */
function tryWebStrafe(runtime, enemy, playerFeet, enemies, scaledDeltaTime) {
  const start=position(enemy), state=enemy.encounter;
  const dx=playerFeet.x-start.x, dz=playerFeet.z-start.z, d=Math.hypot(dx,dz);
  if (d<=EPSILON || !Number.isFinite(d)) return false;
  const cycle=Math.floor((enemy.clock-WEB_STRAFE.warmupSeconds)/WEB_STRAFE.cycleSeconds);
  const direction=state.webTacticalSide*(cycle%2===0 ? 1 : -1);
  const travel=enemy.runtime.speed*scaledDeltaTime*WEB_STRAFE.speedFraction;
  if (travel<=EPSILON) return false;
  // Face stays toward the player while the feet move sideways. All movement
  // is done by the existing capsule mover and checked against baked nav data.
  for (const side of [direction,-direction]) {
    const moved=moveNativeCharacter(runtime.collision,start,{
      x:-dz/d*travel*side,y:0,z:dx/d*travel*side,
    },runtime.body).position;
    if(Math.hypot(moved.x-start.x,moved.z-start.z)<=EPSILON)continue;
    const sample=sampleNativeNavigation(runtime.nav,moved,runtime.body.stepOffset+EPSILON);
    if(!sample || Math.hypot(sample.position.x-moved.x,sample.position.z-moved.z)>EPSILON ||
        occupied(runtime,start,moved,enemies,enemy) ||
        occupiedSegment(start,moved,playerFeet,runtime.body.radius*2,runtime.body.height))continue;
    enemy.x=moved.x;enemy.y=moved.y;enemy.z=moved.z;
    enemy.walking=true;
    state.route=null; // A later chase must route from the actual new feet.
    if(side!==direction)state.webTacticalSide=-state.webTacticalSide;
    return true;
  }
  return false;
}
/** Retreat using the existing world capsule, navmesh and body-occupancy
 * constraints. Fail closed near a wall or teammate; never teleport, bypass a
 * collision or create permission to shoot. Returns true only when feet moved.
 */
function tryWebDisengage(runtime, enemy, playerFeet, enemies, scaledDeltaTime) {
  const start=position(enemy), state=enemy.encounter;
  const awayX=start.x-playerFeet.x, awayZ=start.z-playerFeet.z;
  const length=Math.hypot(awayX,awayZ);
  const travel=enemy.runtime.speed*scaledDeltaTime*WEB_DISENGAGE.speedFraction;
  if(!Number.isFinite(length) || length<=EPSILON || travel<=EPSILON)return false;
  const x=awayX/length, z=awayZ/length, side=state.webTacticalSide;
  const candidates=[
    {x,z},
    {x:x-side*z*WEB_DISENGAGE.diagonalBias,z:z+side*x*WEB_DISENGAGE.diagonalBias},
    {x:x+side*z*WEB_DISENGAGE.diagonalBias,z:z-side*x*WEB_DISENGAGE.diagonalBias},
  ];
  for(const candidate of candidates) {
    const magnitude=Math.hypot(candidate.x,candidate.z);
    const moved=moveNativeCharacter(runtime.collision,start,{
      x:candidate.x/magnitude*travel,y:0,z:candidate.z/magnitude*travel,
    },runtime.body).position;
    if(distance(moved,playerFeet)<=distance(start,playerFeet)+EPSILON)continue;
    if(Math.hypot(moved.x-start.x,moved.z-start.z)<=EPSILON)continue;
    const sample=sampleNativeNavigation(runtime.nav,moved,runtime.body.stepOffset+EPSILON);
    if(!sample || Math.hypot(sample.position.x-moved.x,sample.position.z-moved.z)>EPSILON ||
        occupied(runtime,start,moved,enemies,enemy) ||
        occupiedSegment(start,moved,playerFeet,runtime.body.radius*2,runtime.body.height))continue;
    enemy.x=moved.x;enemy.y=moved.y;enemy.z=moved.z;
    enemy.walking=true;
    state.route=null;
    return true;
  }
  return false;
}

function scalar(value, name) {
  if (!Number.isFinite(value) || value < 0) throw new TypeError(name+' must be finite and nonnegative');
  return value;
}
function randomUnit(rng) {
  const value = rng();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new TypeError('rng must return [0,1)');
  return value;
}
function sourceFlag(value, name) {
  if (value !== true && value !== false && value !== 0 && value !== 1) throw new TypeError(name+' must be a source boolean');
  return Boolean(value);
}

/** Source-geometry/source-timing encounter. Without a fully attested factory
 * context the shipped Web pistol encounter remains the explicit fallback.
 * The optional factory evidence comes from the active Dojo build10 scene and
 * runtime difficulty, never the level10 serialized defaults alone. SH-05 owns
 * attaching the chosen prefab, animation, and collision body to the live actor.
 *
 * @param {object} scene Source-qualified Dojo scene/navigation package.
 * @param {object} collision Prepared world collision.
 * @param {() => number} rng Source spawner/weapon draw.
 * @param {{sightCollision?:object, sourceEnemyActivation?:object|null}} options
 * @returns {object} Mutable encounter runtime with explicit sourceFactoryPlan.
 */
export function createNativeEncounter(scene, collision, rng = Math.random, {
  sightCollision=collision, sourceEnemyActivation=null,
}={}) {
  const { enemy, difficulty, spawner, weapon } = scene.gameplay;
  const bake = scene.navigation.settings;
  const body = {
    radius:scalar(bake.agentRadius, 'agentRadius'), height:scalar(bake.agentHeight, 'agentHeight'),
    stepOffset:scalar(bake.agentClimb, 'agentClimb'), slopeLimit:scalar(bake.agentSlope, 'agentSlope'),
    groundSnap:scalar(bake.agentClimb, 'agentClimb'),
  };
  if (body.radius <= 0 || body.height < body.radius*2 || body.slopeLimit >= 90) throw new RangeError('invalid source navigation body');
  const minimum = difficulty.MinEnemiesToSpawn, maximum = difficulty.MaxEnemiesToSpawn;
  if (![minimum, maximum].every(Number.isSafeInteger) || minimum < 1 || maximum < minimum) throw new TypeError('finite encounter kill range required');
  const killTarget = minimum + Math.floor(randomUnit(rng)*(maximum-minimum+1));
  const spawnerSettings = {
    startDelay:spawner.StartDelay, spawnDelay:difficulty.EnemieSpawnRate,
    enemiesLeft:killTarget+scalar(spawner.enemiesOverhead, 'enemiesOverhead'),
    maxEnemiesOnScene:difficulty.MaxActiveEnemies === -1 ? spawner.MaxEnemiesOnScene : difficulty.MaxActiveEnemies,
    endless:sourceFlag(spawner.Endless, 'Endless'), safeDistance:spawner.safeDistance,
    dontSpawnNearPlayer:sourceFlag(spawner.DontSpawnNearPlayer, 'DontSpawnNearPlayer'),
    dontSpawnNearEnemies:sourceFlag(spawner.DontSpawnNearEnemies, 'DontSpawnNearEnemies'),
    removeInactiveSpawnPoints:sourceFlag(spawner.RemoveInactiveSpawnPoints, 'RemoveInactiveSpawnPoints'),
  };
  if (spawnerSettings.endless) throw new TypeError('finite encounter requires Endless=false');
  const enemySettings = {
    attackDelay:weapon.attackDelay, alertDelay:weapon.alertDelay, projectileSpeed:weapon.projectileSpeed,
    weaponSpeedMultiplier:enemy.weaponSpeedMultiplier,
    difficultyWeaponSpeedMultiplier:difficulty.WeaponAttackSpeedMultiplier,
    walkingSpeed:enemy.WalkingSpeed, runningSpeed:enemy.RunningSpeed, acceleration:enemy.Acceleration,
    afterglowDuration:enemy.canSeeAfterGlowTime, stopAimingTime:enemy.stopAimingTime,
    alwaysAlert:sourceFlag(enemy.AlwaysAlert, 'AlwaysAlert'),
  };
  // Validate before entering a delayed spawn, rather than failing mid-wave.
  createNativeEnemyState(enemySettings);
  const sourceFactoryPlan = prepareSourceFactoryPlan(sourceEnemyActivation);
  const nav = prepareNativeNavigation(scene.navigation, p => ({ x:-p.x, y:p.y, z:p.z }));
  const maxSnapDistance = body.height;
  const points = scene.anchors.enemy.map(anchor => {
    const original = fromMatrix(anchor.worldMatrix);
    const sample = sampleNativeNavigation(nav, original, maxSnapDistance);
    return { id:anchor.id, position:original, feet:sample?.position ?? null,
      active:anchor.initialActiveInHierarchy, door:anchor.door,
      face:Math.atan2(anchor.worldMatrix[8], -anchor.worldMatrix[10]), source:anchor.source };
  });
  if (points.some(point => point.door === undefined)) throw new TypeError('spawn markers require source door settings or explicit null');
  const spawnerPosition = fromMatrix(spawner.worldMatrix);
  if (![spawnerPosition.x, spawnerPosition.y, spawnerPosition.z].every(Number.isFinite)) throw new TypeError('source spawner worldMatrix required');
  return {
    limitation:sourceFactoryPlan.status === 'qualified'
      ? 'Source factory selection is conditional on active prefab evidence; Web health, animation and full behavior tree remain provisional.'
      : 'Source-geometry/source-timing Web pistol encounter; weighted native weapon families and full native behavior tree are out of scope.',
    collision, sightCollision, nav, body, maxSnapDistance, points, spawnerPosition, spawnerSettings, enemySettings,
    sourceFactoryPlan,
    spawner:createNativeSpawnerState(spawnerSettings, rng), rng, killTarget, killed:0,
    actors:new Map(), countedDeaths:new Set(), arrivals:[], nextId:0,
    stunTime:scalar(enemy.StunTime, 'StunTime'), aimHeight:scalar(enemy.AimHeight, 'AimHeight'),
    armedStopDistance:scalar(enemy.MinimumDistanceToPlayer, 'MinimumDistanceToPlayer'),
    unarmedStopDistance:scalar(enemy.MeleeAttackDistance, 'MeleeAttackDistance'),
  };
}

/** Retain references so removing a dead render object does not erase its kill.
 * A missing/despawned live object never counts as a kill. */
export function readyForVictory(runtime, enemies) {
  for (const enemy of enemies) {
    if (runtime.actors.has(enemy.id)) runtime.actors.set(enemy.id, enemy);
  }
  for (const [id, enemy] of runtime.actors) {
    if (!living(enemy) && !runtime.countedDeaths.has(id)) {
      runtime.countedDeaths.add(id);
      runtime.killed++;
    }
  }
  if (runtime.killed < runtime.killTarget) return false;
  runtime.spawner.pending.length = 0;
  runtime.arrivals.length = 0;
  runtime.spawner.enemiesLeft = 0;
  return true;
}

// Swept planar occupancy, not a post-move push/teleport. Permit existing overlap
// to separate, but never move closer or cross through another actor.
function occupiedSegment(start, end, other, radius, height) {
  if (Math.max(start.y, end.y)+height <= other.y || Math.min(start.y, end.y) >= other.y+height) return false;
  const dx=end.x-start.x, dz=end.z-start.z, ox=start.x-other.x, oz=start.z-other.z;
  const lengthSquared=dx*dx+dz*dz, startSquared=ox*ox+oz*oz;
  if (lengthSquared === 0) return startSquared < radius*radius-EPSILON;
  const projection=ox*dx+oz*dz;
  if (startSquared < radius*radius && projection >= 0) return false;
  const t=Math.max(0, Math.min(1, -projection/lengthSquared));
  return (ox+dx*t)**2+(oz+dz*t)**2 < radius*radius-EPSILON;
}
function occupied(runtime, start, end, enemies, except = null) {
  return enemies.some(other => other !== except && participating(other) &&
    occupiedSegment(start, end, position(other), runtime.body.radius*2, runtime.body.height));
}
// J3 Web crossfire: a living teammate between a proven muzzle and the player
// blocks the fire order. Check the body at the shot's interpolated height;
// an ally behind the shooter, beyond the target, or already dead is not cover.
// This is gun permission, NOT a new projectile hitbox or friendly-fire damage.
function webAllyShieldsMuzzle(runtime, shooter, muzzle, target, enemies) {
  const dx=target.x-muzzle.x, dz=target.z-muzzle.z;
  const lengthSquared=dx*dx+dz*dz;
  if(!Number.isFinite(lengthSquared) || lengthSquared<=EPSILON)return false;
  const radiusSquared=runtime.body.radius*runtime.body.radius;
  return enemies.some(other => {
    if(other===shooter || !participating(other))return false;
    const t=((other.x-muzzle.x)*dx+(other.z-muzzle.z)*dz)/lengthSquared;
    if(t<=0 || t>=1)return false;
    const y=muzzle.y+(target.y-muzzle.y)*t;
    if(y<other.y || y>other.y+runtime.body.height)return false;
    const sidewaysX=muzzle.x+dx*t-other.x, sidewaysZ=muzzle.z+dz*t-other.z;
    return sidewaysX*sidewaysX+sidewaysZ*sidewaysZ<=radiusSquared;
  });
}
function nearestEnemy(enemies, point) {
  let nearest=null, best=Infinity;
  for (const enemy of enemies) if (participating(enemy)) {
    const p=position(enemy), d=distance(point,p);
    if (d < best) { best=d; nearest={position:p, standingAtCampingPoint:false}; }
  }
  return nearest;
}
// This descriptor is a *caller attestation*, not inferred from the Web scene.
// Unknown active difficulty, prefab identity or per-family values cannot be
// filled from the serialized level10 defaults. No additional random draw is
// performed until an actual source SpawnOrder activates at its door.
function prepareSourceFactoryPlan(context) {
  if (context === null) return { status: 'blocked', reason: 'active-factory-evidence-not-supplied' };
  if (!context || typeof context !== 'object' ||
      context.sceneName !== 'SHRL_Dojo2' || context.buildIndex !== 10 ||
      !context.catalog || !context.difficulty || !context.availableWeapons ||
      !context.familySettings || !context.baseSettings ||
      typeof context.campingPointsAvailable !== 'boolean') {
    return { status: 'blocked', reason: 'active-factory-evidence-incomplete' };
  }
  const source = collectNativeDojoSpawnerFactories(context.catalog);
  if (source.status !== 'qualified') return { status: 'blocked', reason: source.reason };
  return { status: 'qualified', templates: source.templates, context };
}

/** Resolve the selected prefab only when the source order matures. A factory
 * result without an active Dojo prefab or an implemented gun runtime keeps
 * the existing Web pistol fallback, with an explicit blocked receipt.
 * @param {object} encounter
 * @param {object} order Delayed source spawn order.
 * @param {object[]} population Existing live actors, including earlier arrivals.
 * @returns {object} Activation receipt, never an inferred family.
 */
function resolveSpawnActivation(encounter, order, population) {
  const source = encounter.sourceFactoryPlan;
  if (source.status !== 'qualified') return { status: 'blocked', reason: source.reason };
  const { context, templates } = source;
  const activation = planNativeDojoEnemyActivation({
    template: order.template, qualifiedTemplates: templates,
    difficulty: context.difficulty, availableWeapons: context.availableWeapons,
    currentEnemies: population, familySettings: context.familySettings,
    baseSettings: context.baseSettings,
    campingPointsAvailable: context.campingPointsAvailable, random: encounter.rng,
  });
  if (activation.status !== 'qualified') return activation;
  // The shared main still drives GunAttack for every equipped enemy. Do not
  // activate Melee/Katana until SH-05 has wired the separate source event and
  // real geometry contact path, rather than damage on punch intent.
  if (!['Pistol','Shotgun','MachineGun','SniperRifle'].includes(activation.family)) {
    return { status: 'blocked', reason: 'family-requires-source-melee-runtime-bridge' };
  }
  const prefab = context.availableWeapons[activation.family];
  if (!prefab || prefab.verifiedActiveInDojo !== true ||
      !(typeof prefab.prefabId === 'string' && prefab.prefabId.length > 0 ||
        Number.isSafeInteger(prefab.prefabId) && prefab.prefabId >= 0)) {
    return { status: 'blocked', reason: 'selected-family-active-prefab-unverified' };
  }
  return { ...activation, prefabId: prefab.prefabId };
}
function spawnEnemy(runtime, point, order, population) {
  const activation = resolveSpawnActivation(runtime, order, population);
  const selected = activation.status === 'qualified';
  const settings = selected ? activation.weaponSettings : runtime.enemySettings;
  const enemy = {
    id:'native-encounter-'+runtime.nextId++, ...point.feet, alive:true, active:true,
    clock:0, face:point.face, walking:false, deathAt:null, delay:0, phase:0, strafe:0,
    reaction:createEnemyReactionState({health:2, stunTime:runtime.stunTime, hasWeapon:true}),
    runtime:createNativeEnemyState(settings),
    weaponFamily:selected ? activation.family : 'Pistol',
    // Web fallback health/rig remain provisional; this does not assert native
    // prefab instantiation or actual played clip until SH-05 consumes receipt.
    sourceActivation:selected
      ? Object.freeze({status:'qualified',factoryId:activation.factoryId,
        family:activation.family,archetype:activation.archetype,prefabId:activation.prefabId})
      : Object.freeze({status:'web-pistol-fallback',reason:activation.reason}),
    encounter:{route:null, target:null, visible:false, canAttack:false, webAllyBlockingShot:false, spawnPointId:point.id,
      webTacticalSide:runtime.nextId%2===0 ? 1 : -1},
  };
  if (selected) enemy.activeWeaponSettings = activation.weaponSettings;
  runtime.actors.set(enemy.id, enemy);
  return enemy;
}

function moveEnemy(runtime, enemy, input) {
  const { scaledDeltaTime, playerFeet, playerPosition, enemies } = input;
  const state=enemy.encounter;
  if (!state) return;
  state.canAttack=false;
  state.webAllyBlockingShot=false;
  enemy.walking=false;
  if (!participating(enemy) || enemy.reaction.stunRemaining > 0 || enemy.reaction.stunnedThisFrame) {
    enemy.runtime.pendingShot=null;
    enemy.runtime.speed=0;
    return;
  }
  const armed=enemy.reaction.hasWeapon;
  if (!armed) enemy.runtime.pendingShot=null;
  const start=position(enemy);
  // This body-height cast only chooses chase versus stop. It is not a sampled
  // native eye/AimTarget bone, and cannot authorize firing.
  const sightOrigin={x:start.x,y:start.y+runtime.aimHeight,z:start.z};
  state.visible=nativeSphereHit(runtime.sightCollision,sightOrigin,playerPosition,.2) === null;
  const muzzleKnown=Boolean(enemy.muzzlePosition && enemy.muzzleForward);
  const worldMuzzleClear=armed && muzzleKnown &&
    nativeSegmentHit(runtime.sightCollision,enemy.muzzlePosition,playerPosition) === null;
  // Both a world obstacle and an ally can occlude a shot, but only a real
  // muzzle receipt authorizes repositioning. Existing strafing seeks a lane.
  state.webAllyBlockingShot=worldMuzzleClear &&
    webAllyShieldsMuzzle(runtime,enemy,enemy.muzzlePosition,playerPosition,enemies);
  state.canAttack=worldMuzzleClear && !state.webAllyBlockingShot;
  const stopDistance=armed ? runtime.armedStopDistance : runtime.unarmedStopDistance;
  const playerDistance=distance(start,playerFeet);
  const stop=state.visible && playerDistance <= stopDistance;
  // Web-only close-quarters pressure: give ground before resuming strafing.
  // Using the source stop radius as a ceiling avoids inventing a larger chase
  // distance; the five-body-radius cap keeps this a near-contact reaction.
  const disengageDistance=Math.min(stopDistance*WEB_DISENGAGE.stopRadiusFraction,
    runtime.body.radius*WEB_DISENGAGE.maximumBodyRadii);
  const disengaging=stop && armed && !enemy.runtime.pendingShot &&
    playerDistance<disengageDistance;
  // J3 Web-only tactics: a body-visible enemy whose *known* muzzle is
  // obstructed must not freeze at its stop radius. Seek a lateral firing lane
  // with the same nav/capsule/occupancy gates as ordinary strafing. A missing
  // muzzle is not evidence of an obstructed shot and must not trigger peeking.
  // Longer peek bursts make it possible to move past low cover; short shooting
  // pauses remain once the muzzle line opens. No shot/damage gate is bypassed.
  const needsFiringLane=stop && armed && state.visible &&
    Boolean(enemy.muzzlePosition && enemy.muzzleForward) &&
    !state.canAttack && !enemy.runtime.pendingShot;
  const tacticalTime=enemy.clock-WEB_STRAFE.warmupSeconds;
  const tactical=stop && armed && (state.canAttack || needsFiringLane) &&
    !enemy.runtime.pendingShot && Number.isFinite(tacticalTime) && tacticalTime>=0 &&
    tacticalTime%WEB_STRAFE.cycleSeconds<
      (needsFiringLane ? WEB_STRAFE.peekSeconds : WEB_STRAFE.activeSeconds);
  const speed=advanceNativeEnemySpeed(enemy.runtime,enemy.activeWeaponSettings ?? runtime.enemySettings,
    (disengaging || tactical) ? 'walking' : stop ? 'standing' : armed ? 'walking' : 'running',scaledDeltaTime);
  const dx=playerPosition.x-start.x, dz=playerPosition.z-start.z;
  if (dx || dz) enemy.face=Math.atan2(dx,-dz);
  if (stop) {
    if(disengaging && scaledDeltaTime>0) {
      if(!tryWebDisengage(runtime,enemy,playerFeet,enemies,scaledDeltaTime))enemy.runtime.speed=0;
    } else if(tactical && scaledDeltaTime>0 &&
        !tryWebStrafe(runtime,enemy,playerFeet,enemies,scaledDeltaTime))enemy.runtime.speed=0;
    return;
  }
  if (scaledDeltaTime === 0) return;
  if (!state.route || !state.target || distance(state.target,playerFeet) > runtime.body.radius ||
      state.route.cursor >= state.route.points.length) {
    state.route=findNativeRoute(runtime.nav,start,playerFeet,{maxSnapDistance:runtime.maxSnapDistance});
    state.target={...playerFeet};
  }
  if (!state.route) { enemy.runtime.speed=0; return; }
  // Navigation uses its baked surface; the body follows the actual collider
  // support. Feeding grounded feet into a raised nav corridor wastes movement
  // on repeated vertical projection and can strand actors at polygon corners.
  const navigationStart=sampleNativeNavigation(runtime.nav,start,runtime.maxSnapDistance)?.position;
  if(!navigationStart) {state.route=null;enemy.runtime.speed=0;return;}
  const step=advanceNativeRoute(state.route,navigationStart,speed*scaledDeltaTime);
  let actual=start;
  for (const segment of step.segments) {
    const moved=moveNativeCharacter(runtime.collision,actual,{
      x:segment.to.x-actual.x,y:Math.min(0,segment.to.y-actual.y),z:segment.to.z-actual.z,
    },runtime.body).position;
    const sample=sampleNativeNavigation(runtime.nav,moved,runtime.body.stepOffset+EPSILON);
    if (!sample || Math.hypot(sample.position.x-moved.x,sample.position.z-moved.z) > EPSILON ||
        occupied(runtime,actual,moved,enemies,enemy) ||
        occupiedSegment(actual,moved,playerFeet,runtime.body.radius*2,runtime.body.height)) {
      state.route=null;
      break;
    }
    actual=moved;
    if (Math.hypot(actual.x-segment.to.x,actual.z-segment.to.z) > EPSILON ||
        Math.abs(actual.y-segment.to.y)>runtime.body.stepOffset+EPSILON) { state.route=null; break; }
  }
  enemy.x=actual.x; enemy.y=actual.y; enemy.z=actual.z;
  enemy.walking=distance(start,actual) > EPSILON;
  if (!enemy.walking) enemy.runtime.speed=0;
}

/** Return door-warning/spawn events; parent APPENDS each event.enemy to its list.
 * Existing actors move in place. Invoke after the parent's once/frame reaction
 * advance. No attack, reaction clock or actor clock is advanced here.
 */
export function advanceNativeEncounter(runtime, input) {
  const { scaledDeltaTime, unscaledDeltaTime, playerPosition, playerForward, playerFeet, enemies } = input;
  scalar(scaledDeltaTime,'scaledDeltaTime'); scalar(unscaledDeltaTime,'unscaledDeltaTime');
  if (readyForVictory(runtime,enemies)) return [];
  for (const enemy of enemies) moveEnemy(runtime,enemy,input);
  const commands=advanceNativeSpawner(runtime.spawner,runtime.spawnerSettings,{
    scaledDeltaTime,unscaledDeltaTime,enabled:true,spawningAreaInitialized:true,
    currentEnemyCount:enemies.filter(participating).length+runtime.arrivals.length,
    templates:runtime.sourceFactoryPlan.status === 'qualified'
      ? runtime.sourceFactoryPlan.templates : ['web-pistol'],
    getEligiblePoints:pendingPointIds => eligibleNativeSpawnPoints(runtime.spawnerSettings,{
      points:runtime.points.filter(point => point.feet && point.door !== null &&
        findNativeRoute(runtime.nav,point.feet,playerFeet,{maxSnapDistance:runtime.maxSnapDistance})),
      playerPosition,playerForward,cameraPosition:playerPosition,spawnerPosition:runtime.spawnerPosition,
      nearestEnemyAt:point => nearestEnemy(enemies,point),
      pendingPointIds:new Set([...pendingPointIds,...runtime.arrivals.map(order => order.point.id)]),
      castRay:({origin,direction,maxDistance}) => {
        const end={x:origin.x+direction.x*maxDistance,y:origin.y+direction.y*maxDistance,z:origin.z+direction.z*maxDistance};
        return nativeSegmentHit(runtime.collision,origin,end) ? {isPlayer:false} : null;
      },
    }),
  },runtime.rng);
  const events=[];
  for (const command of commands) {
    if (command.type === 'spawn') runtime.arrivals.push(command);
    else events.push(command);
  }
  const population=enemies.slice();
  for (let i=0;i<runtime.arrivals.length;) {
    const order=runtime.arrivals[i], feet=order.point.feet;
    // An occupied doorway waits at its original marker. Never scatter arrivals.
    const ceiling={...feet,y:feet.y+EPSILON};
    if (occupied(runtime,feet,feet,population) ||
        occupiedSegment(feet,feet,playerFeet,runtime.body.radius*2,runtime.body.height) ||
        nativeCapsuleHit(runtime.collision,feet,ceiling,runtime.body)) { i++; continue; }
    const enemy=spawnEnemy(runtime,order.point,order,population);
    population.push(enemy);
    events.push({type:'spawn',point:order.point,enemy,activation:enemy.sourceActivation});
    runtime.arrivals.splice(i,1);
  }
  return events;
}
