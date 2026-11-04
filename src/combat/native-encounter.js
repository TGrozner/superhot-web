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

// Web-authored finite cover search: after a genuine sighting, scan safe lanes
// around the last-known feet, without using the player's occluded position.
// This is Web AI design, NOT a recovered MCD timing or perception contract.
const WEB_LAST_SEEN_SWEEP = Object.freeze({
  seconds:1.8,
  maxBodyRadii:3.5,
  speedFraction:0.75,
});

// J3 Web-only witnessed-loss reaction: a nearby enemy that actually sees an
// ally fall briefly retreats from the impact location. There is no global
// death alarm, target reveal, invulnerability or native MCD behavior claim.
const WEB_WITNESSED_LOSS = Object.freeze({
  witnessBodyRadii:14,
  retreatSeconds:0.55,
});

// J3 Web-authored paired pressure: one armed squadmate closes the gap while
// others hold their firing distance. Pick by stable actor identity, not array
// iteration or frame timing; an ally's death ends the push immediately.
// This is a navigation goal only and does not authorize an attack or bypass
// capsule collisions. No native MCD tactical claim.
// J3 Web-only squad callouts: a LIVE, unstunned ally with actual line of sight
// can update a nearby hunter's remembered position, even across cover.
// Sight is measured for all actors BEFORE movement, so list order cannot make
// a teammate clairvoyant. Neither the caller nor the recipient gains a shot.
const WEB_SQUAD_SIGHTING = Object.freeze({
  rangeBodyRadii: 18,
  newContactBodyRadii: 1,
});
const WEB_SQUAD_PUSH = Object.freeze({
  stopDistanceFraction: 0.67,
  minimumStopBodyRadii: 3.2,
  disengageFraction: 0.62,
});

// J3 Web-original readable crossfire: nearby gunners with ACTUALLY clear
// muzzles take alternating windows for new shots, rather than opening fire
// simultaneously. Solo combat and already committed shots are unchanged.
// This is Web balancing, not recovered MCD timings or squad coordination.
const WEB_SQUAD_VOLLEY = Object.freeze({
  beatSeconds: 0.75,
  rangeBodyRadii: 18,
});
function webSquadBreacher(enemy, enemies) {
  if (!enemy.reaction?.hasWeapon) return false;
  let readyLead=null, armedCount=0;
  for (const candidate of enemies) {
    if (!participating(candidate) || candidate.reaction?.hasWeapon !== true ||
        !candidate.encounter) continue;
    armedCount++;
    // A stunned, dodging or suppressed point man cannot maintain the push.
    // Keep his squad slot, but hand the assault to the lowest-ID available
    // gunner. No new fire permission or target knowledge is conferred.
    const busy=candidate.reaction.stunRemaining>0 ||
      candidate.reaction.stunnedThisFrame ||
      candidate.encounter.webDodgeRemaining>0 ||
      candidate.encounter.webSuppressionRemaining>0 ||
      candidate.encounter.webLossRemaining>0 ||
      Boolean(candidate.runtime?.pendingShot);
    if (busy) continue;
    if (readyLead===null || String(candidate.id)<String(readyLead.id))
      readyLead=candidate;
  }
  return armedCount>1 && readyLead===enemy;
}

// J3 Web-only last-stand pressure: the final armed opponent must not become
// passive simply because the squad breacher lost its covering wingman. Only
// start the closer pursuit ring after the ACTUAL encounter death receipts
// leave exactly one active actor and the kill quota is one away. Any new
// arrival immediately restores ordinary squad/solo spacing; no forced shot.
function webFinalSurvivorBreacher(runtime, enemy, enemies) {
  if (runtime.killTarget<2 || runtime.killed<runtime.killTarget-1 ||
      enemy.reaction?.hasWeapon!==true || !participating(enemy)) return false;
  let alive=0;
  for (const actor of enemies) if (participating(actor)) {
    alive++;
    if (actor!==enemy || alive>1) return false;
  }
  return alive===1;
}

/** Keep the native collision/navmesh as the authority even for Web-only
 * tactics. Never teleport an actor or cross a blocking actor/player.
 * Blocked lanes reverse once, then the enemy simply holds its position.
 */
function tryWebStrafe(runtime, enemy, playerFeet, enemies, scaledDeltaTime,
  {sideOverride=null, maxDistance=Infinity}={}) {
  const start=position(enemy), state=enemy.encounter;
  const dx=playerFeet.x-start.x, dz=playerFeet.z-start.z, d=Math.hypot(dx,dz);
  if (!Number.isFinite(d) || (d<=EPSILON && sideOverride===null)) return false;
  // If feet exactly match the last sighting, use actor facing for the search
  // tangent. Never infer a direction from the currently hidden player.
  const forwardX=d>EPSILON ? dx/d : Math.sin(enemy.face);
  const forwardZ=d>EPSILON ? dz/d : -Math.cos(enemy.face);
  const cycle=Math.floor((enemy.clock-WEB_STRAFE.warmupSeconds)/WEB_STRAFE.cycleSeconds);
  const direction=sideOverride ?? state.webTacticalSide*(cycle%2===0 ? 1 : -1);
  const travel=enemy.runtime.speed*scaledDeltaTime*WEB_STRAFE.speedFraction;
  if (travel<=EPSILON) return false;
  // Face stays toward the player while the feet move sideways. All movement
  // is done by the existing capsule mover and checked against baked nav data.
  for (const side of [direction,-direction]) {
    const moved=moveNativeCharacter(runtime.collision,start,{
      x:-forwardZ*travel*side,y:0,z:forwardX*travel*side,
    },runtime.body).position;
    if(Math.hypot(moved.x-start.x,moved.z-start.z)<=EPSILON ||
        distance(moved,playerFeet)>maxDistance+EPSILON)continue;
    const sample=sampleNativeNavigation(runtime.nav,moved,runtime.body.stepOffset+EPSILON);
    if(!sample || Math.hypot(sample.position.x-moved.x,sample.position.z-moved.z)>EPSILON ||
        occupied(runtime,start,moved,enemies,enemy) ||
        occupiedSegment(start,moved,playerFeet,runtime.body.radius*2,runtime.body.height))continue;
    enemy.x=moved.x;enemy.y=moved.y;enemy.z=moved.z;
    enemy.walking=true;
    state.route=null; // A later chase must route from the actual new feet.
    if(side!==direction && sideOverride===null)state.webTacticalSide=-state.webTacticalSide;
    return true;
  }
  return false;
}
/** Retreat using the existing world capsule, navmesh and body-occupancy
 * constraints. Fail closed near a wall or teammate; never teleport, bypass a
 * collision or create permission to shoot. Returns true only when feet moved.
 */
function tryWebDisengage(runtime, enemy, playerFeet, enemies, scaledDeltaTime, {avoidApproaching=null}={}) {
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
    if(distance(moved,playerFeet)<=distance(start,playerFeet)+EPSILON ||
        (avoidApproaching && distance(moved,avoidApproaching)<distance(start,avoidApproaching)-EPSILON))continue;
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

// J3 Web-only active projectile awareness: an enemy may sidestep a real,
// visible PLAYER projectile already in flight. This is not MCD AI parity and
// never predicts a click or grants invulnerability. Only the existing swept
// character mover decides whether the dodge can actually happen.
const WEB_PROJECTILE_EVADE = Object.freeze({
  lookaheadSeconds: 0.55,
  warningBodyRadii: 2.3,
  dodgeSeconds: 0.38,
  recoverySeconds: 1.15,
  speedFraction: 1.12,
});

// J3 Web-original near-miss suppression: a REAL player projectile passing near
// (but not directly into) a visible gunner briefly forces a covered retreat.
// No damage, aim information, native MCD reaction or invulnerability is inferred.
const WEB_NEAR_MISS = Object.freeze({
  lookaheadSeconds: 0.35,
  outerBodyRadii: 5.5,
  retreatSeconds: 0.55,
  recoverySeconds: 2.4,
});

/** Find the earliest observable player bullet that will pass near the body.
 * @param {object} runtime Source collision/navmesh adapter.
 * @param {object} enemy Current live enemy.
 * @param {object[]} projectiles Live projectile snapshots from SH-05.
 * @returns {{sideX:number,sideZ:number}|null} A safe-direction hint, not a hit.
 */
function webIncomingProjectile(runtime, enemy, projectiles) {
  if (!Array.isArray(projectiles) || projectiles.length===0) return null;
  let bestTime=Infinity, threat=null;
  for (const projectile of projectiles) {
    if (projectile?.friendly!==true || !projectile.pos) continue;
    const origin=projectile.pos;
    const v=projectile.velocity ?? {
      x:projectile.direction?.x*projectile.speed,
      y:projectile.direction?.y*projectile.speed,
      z:projectile.direction?.z*projectile.speed,
    };
    if (![origin.x,origin.y,origin.z,v.x,v.y,v.z].every(Number.isFinite))continue;
    const planarSpeedSquared=v.x*v.x+v.z*v.z;
    if(planarSpeedSquared<=EPSILON)continue;
    const dx=enemy.x-origin.x,dz=enemy.z-origin.z;
    const until=(dx*v.x+dz*v.z)/planarSpeedSquared;
    if(until<=0 || until>WEB_PROJECTILE_EVADE.lookaheadSeconds || until>=bestTime)continue;
    const closest={x:origin.x+v.x*until,y:origin.y+v.y*until,z:origin.z+v.z*until};
    if(closest.y<enemy.y || closest.y>enemy.y+runtime.body.height)continue;
    const separation=Math.hypot(closest.x-enemy.x,closest.z-enemy.z);
    if(separation>runtime.body.radius*WEB_PROJECTILE_EVADE.warningBodyRadii)continue;
    // A projectile hidden behind actual world cover should not trigger an
    // omniscient sidestep. The trace is checked only for plausible threats.
    if(nativeSegmentHit(runtime.sightCollision,origin,closest)!==null)continue;
    const speed=Math.sqrt(planarSpeedSquared);
    const cross=v.x*dz-v.z*dx;
    const side=Math.abs(cross)<=EPSILON ? enemy.encounter.webTacticalSide : Math.sign(cross);
    bestTime=until;
    threat={sideX:-v.z/speed*side,sideZ:v.x/speed*side};
  }
  return threat;
}

/** Detect a nearby passing bullet, excluding direct threats handled by the
 * existing dodge. Cover between the projectile path and the gunner prevents a
 * supernatural warning; only already-launched player projectiles qualify.
 * @param {object} runtime Collision and body adapter.
 * @param {object} enemy Live source-space actor.
 * @param {object[]} projectiles Actual projectile snapshots.
 * @returns {{x:number,y:number,z:number}|null} Nearest visible passage point.
 */
function webNearMissProjectile(runtime, enemy, projectiles) {
  if (!Array.isArray(projectiles)) return null;
  let earliest=Infinity, passage=null;
  for (const projectile of projectiles) {
    if (projectile?.friendly!==true || !projectile.pos) continue;
    const origin=projectile.pos;
    const velocity=projectile.velocity ?? {
      x:projectile.direction?.x*projectile.speed,
      y:projectile.direction?.y*projectile.speed,
      z:projectile.direction?.z*projectile.speed,
    };
    if (![origin.x,origin.y,origin.z,velocity.x,velocity.y,velocity.z].every(Number.isFinite)) continue;
    const speedSquared=velocity.x**2+velocity.z**2;
    if (speedSquared<=EPSILON) continue;
    const until=((enemy.x-origin.x)*velocity.x+(enemy.z-origin.z)*velocity.z)/speedSquared;
    if (until<=0 || until>WEB_NEAR_MISS.lookaheadSeconds || until>=earliest) continue;
    const closest={x:origin.x+velocity.x*until,y:origin.y+velocity.y*until,z:origin.z+velocity.z*until};
    if (closest.y<enemy.y || closest.y>enemy.y+runtime.body.height) continue;
    const separation=Math.hypot(closest.x-enemy.x,closest.z-enemy.z);
    if (separation<=runtime.body.radius*WEB_PROJECTILE_EVADE.warningBodyRadii ||
        separation>runtime.body.radius*WEB_NEAR_MISS.outerBodyRadii) continue;
    const eye={x:enemy.x,y:enemy.y+runtime.aimHeight*0.55,z:enemy.z};
    if (nativeSegmentHit(runtime.sightCollision,origin,closest)!==null ||
        nativeSegmentHit(runtime.sightCollision,closest,eye)!==null) continue;
    earliest=until;
    passage=closest;
  }
  return passage;
}

/** Shift feet laterally without tunneling, teleportation or fake shooting.
 * @returns {boolean} Whether a real nav/capsule-approved step occurred.
 */
function tryWebProjectileEvade(runtime,enemy,playerFeet,enemies,scaledDeltaTime) {
  const start=position(enemy),state=enemy.encounter;
  const travel=enemy.runtime.speed*scaledDeltaTime*WEB_PROJECTILE_EVADE.speedFraction;
  if(!Number.isFinite(travel) || travel<=EPSILON)return false;
  const moved=moveNativeCharacter(runtime.collision,start,{
    x:state.webDodgeSideX*travel,y:0,z:state.webDodgeSideZ*travel,
  },runtime.body).position;
  if(Math.hypot(moved.x-start.x,moved.z-start.z)<=EPSILON)return false;
  const sample=sampleNativeNavigation(runtime.nav,moved,runtime.body.stepOffset+EPSILON);
  if(!sample || Math.hypot(sample.position.x-moved.x,sample.position.z-moved.z)>EPSILON ||
      occupied(runtime,start,moved,enemies,enemy) ||
      occupiedSegment(start,moved,playerFeet,runtime.body.radius*2,runtime.body.height))return false;
  enemy.x=moved.x;enemy.y=moved.y;enemy.z=moved.z;
  enemy.walking=true;
  state.route=null;
  return true;
}

/** Interrupt a live Web dodge instead of pausing its remaining time across a
 * stun, despawn or committed shot. The recovery blocks repeated reactions to
 * the same in-flight bullet after the interrupt ends.
 * @param {object} state Live encounter state for an enemy.
 * @returns {void}
 */
function cancelWebProjectileEvade(state) {
  if (!(state.webDodgeRemaining>0)) return;
  state.webDodgeRemaining=0;
  state.webDodgeSideX=0;
  state.webDodgeSideZ=0;
  state.webDodgeCooldown=Math.max(state.webDodgeCooldown,WEB_PROJECTILE_EVADE.recoverySeconds);
}

// J3 Web-authored approach lanes: two armed enemies should not both march
// directly toward the same point before they reach firing range. Route to
// opposite, reachable positions near the player; never offset the player
// hitbox, grant firing permission, or bypass the existing path/capsule checks.
// This is tactical Web design, not a source MCD spawn or AI assignment.
function webSquadApproachGoal(runtime, enemy, playerFeet, enemies) {
  if (!enemy.reaction?.hasWeapon || !enemies.some(other =>
    other !== enemy && participating(other) && other.reaction?.hasWeapon === true)) return null;
  const dx=playerFeet.x-enemy.x, dz=playerFeet.z-enemy.z;
  const length=Math.hypot(dx,dz);
  const offset=Math.min(runtime.body.radius*3.5,runtime.armedStopDistance*0.7);
  if(!Number.isFinite(length) || length<=EPSILON || offset<=EPSILON)return null;
  const side=enemy.encounter.webTacticalSide;
  const goal={x:playerFeet.x-dz/length*side*offset,
    y:playerFeet.y,z:playerFeet.z+dx/length*side*offset};
  const sample=sampleNativeNavigation(runtime.nav,goal,runtime.body.stepOffset+EPSILON);
  if(!sample || Math.hypot(sample.position.x-goal.x,sample.position.z-goal.z)>EPSILON)return null;
  return goal;
}

// J3 Web-only squad movement: a follower whose routed step is blocked by
// another living actor briefly takes a swept sidestep instead of stacking up
// behind them. This changes feet only; it cannot authorize a shot or hit.
function tryWebSquadDetour(runtime, enemy, from, playerFeet, enemies, scaledDeltaTime) {
  const dx=playerFeet.x-from.x, dz=playerFeet.z-from.z, length=Math.hypot(dx,dz);
  const travel=Math.min(runtime.body.radius*0.8,enemy.runtime.speed*scaledDeltaTime*0.8);
  if(!Number.isFinite(length) || length<=EPSILON || !Number.isFinite(travel) || travel<=EPSILON)return null;
  const preferred=enemy.encounter.webTacticalSide;
  for(const side of [preferred,-preferred]) {
    const moved=moveNativeCharacter(runtime.collision,from,{
      x:-dz/length*travel*side,y:0,z:dx/length*travel*side,
    },runtime.body).position;
    if(Math.hypot(moved.x-from.x,moved.z-from.z)<=EPSILON)continue;
    const sample=sampleNativeNavigation(runtime.nav,moved,runtime.body.stepOffset+EPSILON);
    if(!sample || Math.hypot(sample.position.x-moved.x,sample.position.z-moved.z)>EPSILON ||
       occupied(runtime,from,moved,enemies,enemy) ||
       occupiedSegment(from,moved,playerFeet,runtime.body.radius*2,runtime.body.height))continue;
    enemy.encounter.webTacticalSide=side;
    return moved;
  }
  return null;
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
    actors:new Map(), countedDeaths:new Set(), webObservedDeaths:new Set(), arrivals:[], nextId:0,
    webVolleyClock:0,
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
/** Compute real muzzle clearance once before any enemy moves, then rotate
 * fresh firing turns within local visible squads. Covered, unarmed, stunned
 * and otherwise busy gunners cannot waste an available squad firing window.
 * Stable IDs make decisions independent of the actors' iteration order.
 * @param {object} runtime Current source-geometry encounter runtime.
 * @param {object[]} enemies Actual live actor list.
 * @param {Set<object>} observers Actors that see the player this frame.
 * @param {{x:number,y:number,z:number}} target Actual visible target point.
 * @returns {{clear:Set<object>,allyBlocked:Set<object>,turn:Set<object>,eligible:Set<object>}}
 */
function webSquadFireTurns(runtime, enemies, observers, target) {
  const clear=new Set(), allyBlocked=new Set(), ready=[];
  for(const enemy of enemies) {
    if(!participating(enemy) || !enemy.encounter || !enemy.reaction?.hasWeapon ||
        !observers.has(enemy) || !enemy.muzzlePosition || !enemy.muzzleForward)continue;
    if(nativeSegmentHit(runtime.sightCollision,enemy.muzzlePosition,target)!==null)continue;
    clear.add(enemy);
    if(webAllyShieldsMuzzle(runtime,enemy,enemy.muzzlePosition,target,enemies)) {
      allyBlocked.add(enemy);
      continue;
    }
    if(enemy.reaction.stunRemaining>0 || enemy.reaction.stunnedThisFrame ||
        enemy.runtime?.pendingShot || enemy.encounter.webDodgeRemaining>0 ||
        enemy.encounter.webSuppressionRemaining>0 || enemy.encounter.webLossRemaining>0)continue;
    ready.push(enemy);
  }
  ready.sort((a,b)=>String(a.id).localeCompare(String(b.id),'en'));
  // Overlapping neighbor lists can each elect a different shooter (A-B-C
  // chain). Partition the *eligible* gunners into disjoint connected squads;
  // all members then agree on one stable firing turn, regardless of input order.
  const turn=new Set(), unassigned=new Set(ready);
  const range=runtime.body.radius*WEB_SQUAD_VOLLEY.rangeBodyRadii;
  for(const first of ready) {
    if(!unassigned.has(first))continue;
    const squad=[first];
    unassigned.delete(first);
    for(let i=0;i<squad.length;i++) {
      const member=squad[i];
      for(const ally of ready) {
        if(!unassigned.has(ally) ||
            Math.hypot(ally.x-member.x,ally.z-member.z)>range)continue;
        unassigned.delete(ally);
        squad.push(ally);
      }
    }
    squad.sort((a,b)=>String(a.id).localeCompare(String(b.id),'en'));
    const index=Math.floor(runtime.webVolleyClock/WEB_SQUAD_VOLLEY.beatSeconds)%squad.length;
    turn.add(squad[index]);
  }
  return {clear,allyBlocked,turn,eligible:new Set(ready)};
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
      webTacticalSide:runtime.nextId%2===0 ? 1 : -1,
      webLastSeenFeet:null, // Web-only investigation memory, not MCD AI evidence.
      webSearchRemaining:null, webSearchComplete:false,
      webDodgeRemaining:0,webDodgeCooldown:0,webDodgeSideX:0,webDodgeSideZ:0,
      webLossRemaining:0,webLossFeet:null,
      webSuppressionRemaining:0,webSuppressionCooldown:0,webSuppressionFrom:null},
  };
  if (selected) enemy.activeWeaponSettings = activation.weaponSettings;
  runtime.actors.set(enemy.id, enemy);
  return enemy;
}

// Sample new actual death receipts before moving the squad. Keep a separate
// seen set from kill accounting: main may call readyForVictory earlier in the
// frame, and an old corpse must never re-trigger an endless evasive loop.
// The collider ray from witness eye to the fallen body prevents wallhack panic.
function applyWebWitnessedLoss(runtime,enemies) {
  const recent=[];
  for(const [id,actor] of runtime.actors) {
    if(living(actor) || runtime.webObservedDeaths.has(id))continue;
    runtime.webObservedDeaths.add(id);
    recent.push(actor);
  }
  if(recent.length===0)return;
  for(const enemy of enemies) {
    if(!participating(enemy) || !enemy.encounter || !enemy.runtime ||
        enemy.reaction?.stunRemaining>0 || enemy.reaction?.stunnedThisFrame ||
        enemy.runtime.pendingShot)continue;
    const eye={x:enemy.x,y:enemy.y+runtime.aimHeight,z:enemy.z};
    let nearest=null,nearestDistance=Infinity;
    for(const fallen of recent) {
      if(fallen===enemy)continue;
      const d=Math.hypot(enemy.x-fallen.x,enemy.z-fallen.z);
      if(d>=nearestDistance || d>runtime.body.radius*WEB_WITNESSED_LOSS.witnessBodyRadii)continue;
      const body={x:fallen.x,y:fallen.y+runtime.aimHeight*0.55,z:fallen.z};
      if(nativeSphereHit(runtime.sightCollision,eye,body,.2)!==null)continue;
      nearest=fallen;
      nearestDistance=d;
    }
    if(nearest) {
      enemy.encounter.webLossRemaining=WEB_WITNESSED_LOSS.retreatSeconds;
      enemy.encounter.webLossFeet=position(nearest);
    }
  }
}

function moveEnemy(runtime, enemy, input, observingAllies, fireTurns) {
  const { scaledDeltaTime, playerFeet, playerPosition, enemies, playerProjectiles=[] } = input;
  const state=enemy.encounter;
  if (!state) return;
  state.canAttack=false;
  state.webAllyBlockingShot=false;
  enemy.walking=false;
  state.webSuppressionCooldown=Math.max(0,state.webSuppressionCooldown-scaledDeltaTime);
  if (!participating(enemy) || enemy.reaction.stunRemaining > 0 || enemy.reaction.stunnedThisFrame) {
    cancelWebProjectileEvade(state);
    state.webLossRemaining=0;
    state.webLossFeet=null;
    state.webSuppressionRemaining=0;
    state.webSuppressionFrom=null;
    enemy.runtime.pendingShot=null;
    enemy.runtime.speed=0;
    return;
  }
  const armed=enemy.reaction.hasWeapon;
  if (!armed) {
    enemy.runtime.pendingShot=null;
    state.webSuppressionRemaining=0;
    state.webSuppressionFrom=null;
  }
  if (enemy.runtime.pendingShot) {
    cancelWebProjectileEvade(state);
    state.webLossRemaining=0;
    state.webLossFeet=null;
    state.webSuppressionRemaining=0;
    state.webSuppressionFrom=null;
  }
  const start=position(enemy);
  // This body-height cast only chooses chase versus stop. It is not a sampled
  // native eye/AimTarget bone, and cannot authorize firing.
  // Measured once for the whole squad at the start of the frame; otherwise
  // update order would change who has legitimately spotted the player.
  state.visible=observingAllies.has(enemy);
  // Web-authored fairness: once an enemy has REALLY observed the player,
  // losing body sight freezes its last known feet instead of letting it track
  // live coordinates through walls. Actors that have never seen the player
  // keep the established Dojo pursuit fallback; no new source AI claim.
  if(state.visible) {
    state.webLastSeenFeet={...playerFeet};
    state.webSearchRemaining=null;
    state.webSearchComplete=false;
  } else {
    // A nearby observer may call out a CURRENTLY witnessed location. Neither
    // stale ally memories nor the player's hidden position can refresh it.
    // An unchanged sighting cannot restart a finished cover investigation.
    let allyWitnessed=false;
    for(const ally of observingAllies) {
      if(ally===enemy)continue;
      if(Math.hypot(ally.x-start.x,ally.z-start.z)<=
          runtime.body.radius*WEB_SQUAD_SIGHTING.rangeBodyRadii) {
        allyWitnessed=true;
        break;
      }
    }
    if(allyWitnessed && (!state.webLastSeenFeet ||
        Math.hypot(state.webLastSeenFeet.x-playerFeet.x,
          state.webLastSeenFeet.z-playerFeet.z)>
          runtime.body.radius*WEB_SQUAD_SIGHTING.newContactBodyRadii)) {
      state.webLastSeenFeet={...playerFeet};
      state.webSearchRemaining=null;
      state.webSearchComplete=false;
      state.route=null;
    }
  }
  const pursuitFeet=!state.visible && state.webLastSeenFeet
    ? state.webLastSeenFeet : playerFeet;
  const muzzleKnown=Boolean(enemy.muzzlePosition && enemy.muzzleForward);
  const worldMuzzleClear=fireTurns.clear.has(enemy);
  // Keep real eye/muzzle/ally authorization intact during a Web squad's
  // off-turn: GunAttack uses this flag for ALERTNESS and aiming as well as
  // firing. Dropping it on every second beat would leave both guns permanently
  // unalert and unable to shoot. Only delay the next UNCOMMITTED shot.
  state.webAllyBlockingShot=fireTurns.allyBlocked.has(enemy);
  state.canAttack=state.visible && worldMuzzleClear && !state.webAllyBlockingShot;
  if(state.canAttack && fireTurns.eligible.has(enemy) && !fireTurns.turn.has(enemy)) {
    const settings=enemy.activeWeaponSettings ?? runtime.enemySettings;
    const nextTickCost=scaledDeltaTime*settings.weaponSpeedMultiplier*
      settings.difficultyWeaponSpeedMultiplier;
    // main.js advances this cooldown once AFTER the encounter step. Leave a
    // positive remainder without resetting the real aim/alertness pipeline.
    enemy.runtime.attackDelayRemaining=Math.max(
      enemy.runtime.attackDelayRemaining,nextTickCost+EPSILON);
  }
  // An actual incoming player projectile may provoke a short tactical dodge
  // even while chasing. Original MCD enemy AI is not claimed here. No change
  // to existing tactics when the SH-05 projectile snapshot is absent.
  state.webDodgeCooldown=Math.max(0,state.webDodgeCooldown-scaledDeltaTime);
  if(state.visible && !enemy.runtime.pendingShot &&
      state.webDodgeRemaining<=0 && state.webDodgeCooldown<=EPSILON) {
    const threat=webIncomingProjectile(runtime,enemy,playerProjectiles);
    if(threat) {
      state.webDodgeRemaining=WEB_PROJECTILE_EVADE.dodgeSeconds;
      state.webDodgeSideX=threat.sideX;
      state.webDodgeSideZ=threat.sideZ;
    }
  }
  // A moving dodge is an evasive action, not a simultaneous firing stance.
  // Block a NEW gun attack even when the muzzle was clear before side-stepping;
  // an already committed pending shot has cancelled the dodge above.
  if(state.webDodgeRemaining>0) state.canAttack=false;
  if(state.webDodgeRemaining>0 && !enemy.runtime.pendingShot && scaledDeltaTime>0) {
    advanceNativeEnemySpeed(enemy.runtime,enemy.activeWeaponSettings ?? runtime.enemySettings,
      'running',scaledDeltaTime);
    const moved=tryWebProjectileEvade(runtime,enemy,playerFeet,enemies,scaledDeltaTime);
    state.webDodgeRemaining=Math.max(0,state.webDodgeRemaining-scaledDeltaTime);
    if(!moved || state.webDodgeRemaining===0) {
      state.webDodgeCooldown=WEB_PROJECTILE_EVADE.recoverySeconds;
      if(!moved)state.webDodgeRemaining=0;
    }
    if(moved)return;
  }
  // Witnessed teammate losses produce one brief, geometry-constrained retreat
  // away from the ACTUAL corpse, not the player's hidden/current location.
  // No gun permission is granted during this evasive beat.
  if(state.webLossRemaining>0 && state.webLossFeet && scaledDeltaTime>0 &&
      !enemy.runtime.pendingShot) {
    advanceNativeEnemySpeed(enemy.runtime,enemy.activeWeaponSettings ?? runtime.enemySettings,
      'running',scaledDeltaTime);
    const moved=tryWebDisengage(runtime,enemy,state.webLossFeet,enemies,scaledDeltaTime);
    state.webLossRemaining=Math.max(0,state.webLossRemaining-scaledDeltaTime);
    state.canAttack=false;
    if(!moved || state.webLossRemaining<=EPSILON) {
      state.webLossRemaining=0;
      state.webLossFeet=null;
    }
    if(moved)return;
  }
  // Genuine near-misses create a brief opportunity to reposition, but direct
  // threats retain priority in the existing dodge. Preserve committed shots.
  // Shooting permission is withheld during movement, not permanently disabled.
  // A near-miss is physical evidence of danger even when the shooter is
  // hidden. It may move an enemy, but must not reveal the hidden player or
  // authorize a shot; the world/bullet visibility casts remain mandatory.
  if (armed && scaledDeltaTime>0 && !enemy.runtime.pendingShot &&
      state.webDodgeRemaining<=0 && state.webSuppressionRemaining<=0 &&
      state.webSuppressionCooldown<=EPSILON) {
    const passage=webNearMissProjectile(runtime,enemy,playerProjectiles);
    if (passage) {
      state.webSuppressionFrom=passage;
      state.webSuppressionRemaining=WEB_NEAR_MISS.retreatSeconds;
    }
  }
  if (state.webSuppressionRemaining>0 && state.webSuppressionFrom && scaledDeltaTime>0 &&
      !enemy.runtime.pendingShot) {
    advanceNativeEnemySpeed(enemy.runtime,enemy.activeWeaponSettings ?? runtime.enemySettings,
      'running',scaledDeltaTime);
    // A shot from behind must not make a suppressed gunner rush the player.
    // Side-step instead if every safe retreat vector shortens that gap.
    // Never steer a blind response using the player's CURRENT hidden feet.
    // The bullet passage is real evidence; last-known sightings do not grant
    // any attack permission or fresh target location.
    const safeReference=state.visible ? playerFeet : state.webSuppressionFrom;
    const moved=tryWebDisengage(runtime,enemy,state.webSuppressionFrom,enemies,scaledDeltaTime,
      {avoidApproaching:state.visible ? playerFeet : null}) ||
      tryWebStrafe(runtime,enemy,safeReference,enemies,scaledDeltaTime,
        {sideOverride:state.webTacticalSide});
    state.webSuppressionRemaining=Math.max(0,state.webSuppressionRemaining-scaledDeltaTime);
    state.canAttack=false;
    if (!moved || state.webSuppressionRemaining<=EPSILON) {
      state.webSuppressionRemaining=0;
      state.webSuppressionFrom=null;
      state.webSuppressionCooldown=WEB_NEAR_MISS.recoverySeconds;
    }
    if (moved) return;
  }
  // A single, stable armed squadmate pressures the player while its allies
  // maintain their normal firing ring. No assigned partner, blocked line of
  // sight or deferred shot means the ordinary chase/stop behavior applies.
  const breaching=armed && state.visible && !enemy.runtime.pendingShot &&
    (webSquadBreacher(enemy,enemies) || webFinalSurvivorBreacher(runtime,enemy,enemies));
  const normalStopDistance=armed ? runtime.armedStopDistance : runtime.unarmedStopDistance;
  const stopDistance=breaching
    ? Math.min(normalStopDistance,Math.max(
        runtime.body.radius*WEB_SQUAD_PUSH.minimumStopBodyRadii,
        normalStopDistance*WEB_SQUAD_PUSH.stopDistanceFraction))
    : normalStopDistance;
  const playerDistance=distance(start,playerFeet);
  const stop=state.visible && playerDistance <= stopDistance;
  // Search starts only after genuinely reaching previously seen feet. Once
  // started it stays in search mode even when strafing away from that point.
  // After a bounded sweep, hold there until REAL line of sight reacquires.
  if(!state.visible && state.webLastSeenFeet &&
      (state.webSearchRemaining!==null || state.webSearchComplete ||
        distance(start,pursuitFeet)<=runtime.body.radius*0.8)) {
    if(state.webSearchRemaining===null && !state.webSearchComplete)
      state.webSearchRemaining=WEB_LAST_SEEN_SWEEP.seconds;
    state.route=null;
    state.target={...pursuitFeet};
    const sx=pursuitFeet.x-start.x, sz=pursuitFeet.z-start.z;
    if(sx || sz)enemy.face=Math.atan2(sx,-sz);
    enemy.runtime.speed=0;
    if(state.webSearchRemaining>0 && scaledDeltaTime>0 && !enemy.runtime.pendingShot) {
      advanceNativeEnemySpeed(enemy.runtime,enemy.activeWeaponSettings ?? runtime.enemySettings,
        'walking',scaledDeltaTime);
      const elapsed=WEB_LAST_SEEN_SWEEP.seconds-state.webSearchRemaining;
      const side=elapsed<WEB_LAST_SEEN_SWEEP.seconds/2
        ? state.webTacticalSide : -state.webTacticalSide;
      const moved=tryWebStrafe(runtime,enemy,pursuitFeet,enemies,
        scaledDeltaTime*WEB_LAST_SEEN_SWEEP.speedFraction,{
          sideOverride:side,maxDistance:runtime.body.radius*WEB_LAST_SEEN_SWEEP.maxBodyRadii,
        });
      if(!moved)enemy.runtime.speed=0;
      state.webSearchRemaining=Math.max(0,state.webSearchRemaining-scaledDeltaTime);
      if(state.webSearchRemaining<=EPSILON)state.webSearchComplete=true;
    }
    return;
  }
  // The pushing actor's close-contact retreat must not cancel the shorter
  // approach ring. Everyone else retains the original Web retreat distance.
  const disengageDistance=Math.min(stopDistance*(breaching
    ? WEB_SQUAD_PUSH.disengageFraction : WEB_DISENGAGE.stopRadiusFraction),
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
    (!worldMuzzleClear || state.webAllyBlockingShot) && !enemy.runtime.pendingShot;
  const tacticalTime=enemy.clock-WEB_STRAFE.warmupSeconds;
  const tactical=stop && armed && (state.canAttack || needsFiringLane) &&
    !enemy.runtime.pendingShot && Number.isFinite(tacticalTime) && tacticalTime>=0 &&
    tacticalTime%WEB_STRAFE.cycleSeconds<
      (needsFiringLane ? WEB_STRAFE.peekSeconds : WEB_STRAFE.activeSeconds);
  const speed=advanceNativeEnemySpeed(enemy.runtime,enemy.activeWeaponSettings ?? runtime.enemySettings,
    (disengaging || tactical) ? 'walking' : stop ? 'standing'
      : armed && !breaching ? 'walking' : 'running',scaledDeltaTime);
  const facing=state.visible || !state.webLastSeenFeet ? playerPosition : pursuitFeet;
  const dx=facing.x-start.x, dz=facing.z-start.z;
  if (dx || dz) enemy.face=Math.atan2(dx,-dz);
  if (stop) {
    if(disengaging && scaledDeltaTime>0) {
      if(!tryWebDisengage(runtime,enemy,playerFeet,enemies,scaledDeltaTime))enemy.runtime.speed=0;
    } else if(tactical && scaledDeltaTime>0 &&
        !tryWebStrafe(runtime,enemy,playerFeet,enemies,scaledDeltaTime))enemy.runtime.speed=0;
    return;
  }
  if (scaledDeltaTime === 0) return;
  // When armed allies are pursuing together, seek opposite safe approach
  // lanes before resuming the normal stop-radius strafe / retreat behavior.
  // An unreachable offset is never substituted for the direct source route.
  const flankGoal=armed && state.visible &&
      playerDistance>stopDistance+runtime.body.radius*2
    ? webSquadApproachGoal(runtime,enemy,playerFeet,enemies) : null;
  const desiredTarget=flankGoal ?? pursuitFeet;
  if (!state.route || !state.target || distance(state.target,desiredTarget) > runtime.body.radius ||
      state.route.cursor >= state.route.points.length) {
    let destination=desiredTarget;
    state.route=findNativeRoute(runtime.nav,start,destination,{maxSnapDistance:runtime.maxSnapDistance});
    if(!state.route && flankGoal) {
      destination=playerFeet;
      state.route=findNativeRoute(runtime.nav,start,destination,{maxSnapDistance:runtime.maxSnapDistance});
    }
    state.target={...destination};
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
    const allyBlocked=occupied(runtime,actual,moved,enemies,enemy);
    if (!sample || Math.hypot(sample.position.x-moved.x,sample.position.z-moved.z) > EPSILON ||
        allyBlocked ||
        occupiedSegment(actual,moved,playerFeet,runtime.body.radius*2,runtime.body.height)) {
      state.route=null;
      // Only an actor blockage triggers the detour: a wall, disconnected
      // navmesh, unknown muzzle, or the player's capsule is never bypassed.
      if(allyBlocked && !enemy.runtime.pendingShot) {
        const sidestep=tryWebSquadDetour(runtime,enemy,actual,playerFeet,enemies,scaledDeltaTime);
        if(sidestep)actual=sidestep;
      }
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
  applyWebWitnessedLoss(runtime,enemies);
  // Compute actual sightings before anyone moves: a nearby squad callout is
  // valid only if its sender sees the player at THIS frame's original feet.
  const observingAllies=new Set();
  for(const enemy of enemies) {
    if(!participating(enemy) || !enemy.encounter ||
        enemy.reaction?.stunRemaining>0 || enemy.reaction?.stunnedThisFrame)continue;
    const sightOrigin={x:enemy.x,y:enemy.y+runtime.aimHeight,z:enemy.z};
    if(nativeSphereHit(runtime.sightCollision,sightOrigin,playerPosition,.2)===null)
      observingAllies.add(enemy);
  }
  // Progress the Web volley phase ONCE per gameplay step. No separate clock,
  // RNG draw, native claim or shared-file wiring is required.
  runtime.webVolleyClock=(runtime.webVolleyClock+scaledDeltaTime)%
    (WEB_SQUAD_VOLLEY.beatSeconds*60);
  const fireTurns=webSquadFireTurns(runtime,enemies,observingAllies,playerPosition);
  for (const enemy of enemies) moveEnemy(runtime,enemy,input,observingAllies,fireTurns);
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
