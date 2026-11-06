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
// J3 Web-only shoot-and-scoot: a gunner that has actually fired moves
// laterally during the early reload window, then settles to aim again.
// This does not change weapon timing, bullet damage, native AI or attack gates.
const WEB_RELOAD_SCOOT = Object.freeze({
  beginDelayFraction: 0.45,
  endDelayFraction: 1.2,
  coverSeconds: 1.35, // Web-only: bounded shelter and re-peek after the real cooldown.
  readyFraction: 0.2,
});
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
  pauseSeconds:0.9,
  passes:2, // Web-only: check the opposite side once before accepting lost contact.
  maxBodyRadii:3.5,
  speedFraction:0.75,
});

// J3 Web-only witnessed-loss reaction: a nearby enemy that actually sees an
// ally fall briefly retreats from the impact location. There is no global
// death alarm, target reveal, invulnerability or native MCD behavior claim.
const WEB_WITNESSED_LOSS = Object.freeze({
  witnessBodyRadii:14,
  retreatSeconds:0.55,
  counterPushSeconds:2.8, // Web authored: surviving witnesses close the firing ring after the shock.
  counterPushStopFraction:0.65,
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
  relaySeconds: 4.8, // Web-only readable leapfrog: swap the assault lead every few seconds.
});

// J3 Web-original weapon roles, not recovered MCD AI distances: a verified
// shotgun should actually threaten close quarters, while a verified sniper
// preserves a long firing lane and kites when rushed. Unknown/fallback gun
// families retain the baseline pistol ring. No weapon, attack or damage change.
const WEB_WEAPON_ROLE = Object.freeze({
  Shotgun: Object.freeze({ stopFraction: 0.62, preferBreach: true }),
  SniperRifle: Object.freeze({ stopFraction: 1.55, retreatFraction: 0.65, holdRange: true }),
});
function webWeaponRole(enemy) {
  const family=enemy.activeWeaponSettings?.family;
  return enemy.sourceActivation?.status==='qualified' &&
    enemy.sourceActivation.family===family
    ? WEB_WEAPON_ROLE[family] ?? null : null;
}

// J3 Web fallback also gains a visible behavior: a lone gunner that really
// sees the player's back can creep inside its usual firing ring. Turning to
// face it immediately restores the normal spacing. Cover, navigation and
// actual gun permission remain authoritative; no view-cone wallhack or speed
// bonus. This is a design choice, not an MCD perception or distance rule.
const WEB_UNWATCHED_APPROACH=Object.freeze({stopFraction:0.72,backDot:-0.45});
// J3 Web-original anti-kiting: a gunner that has PERSONALLY seen the player
// retreat between two active world ticks closes a little farther than its
// normal firing ring. This requires consecutive true sightings and actual
// increasing range, not camera orientation, an ally's callout or hidden-player
// velocity. No new shots, aim, speed bonus or native MCD behavior is implied.
const WEB_RETREAT_PRESSURE=Object.freeze({
  minimumRetreatSpeed:1.6,stopFraction:0.78,minimumStopBodyRadii:3.2,
});
function webVisiblePlayerRetreats(previous,current,enemyFeet,scaledDeltaTime) {
  if(!previous || !(scaledDeltaTime>EPSILON))return false;
  if(![previous.x,previous.z,current.x,current.z,enemyFeet.x,enemyFeet.z]
    .every(Number.isFinite))return false;
  const before=Math.hypot(previous.x-enemyFeet.x,previous.z-enemyFeet.z);
  const after=Math.hypot(current.x-enemyFeet.x,current.z-enemyFeet.z);
  return (after-before)/scaledDeltaTime>WEB_RETREAT_PRESSURE.minimumRetreatSpeed;
}
function webPlayerLookingAway(playerPosition,playerForward,enemyFeet) {
  if(!playerPosition || !playerForward ||
      ![playerPosition.x,playerPosition.z,playerForward.x,playerForward.z,
        enemyFeet.x,enemyFeet.z].every(Number.isFinite))return false;
  const x=enemyFeet.x-playerPosition.x,z=enemyFeet.z-playerPosition.z;
  const length=Math.hypot(x,z)*Math.hypot(playerForward.x,playerForward.z);
  return length>EPSILON &&
    (x*playerForward.x+z*playerForward.z)/length<WEB_UNWATCHED_APPROACH.backDot;
}

// J3 Web-original readable crossfire: nearby gunners with ACTUALLY clear
// muzzles take alternating windows for new shots, rather than opening fire
// simultaneously. Solo combat and already committed shots are unchanged.
// This is Web balancing, not recovered MCD timings or squad coordination.
const WEB_SQUAD_VOLLEY = Object.freeze({
  beatSeconds: 0.75,
  rangeBodyRadii: 18,
});
// A distant armed actor is not a squadmate. Keep each connected local group
// independent, including A-B-C chains, so another room cannot elect our point
// man or force a lone gunner into a needless assault/flanking lane.
function webLocalArmedSquads(runtime, enemies) {
  const armed=enemies.filter(actor => participating(actor) &&
    actor.reaction?.hasWeapon===true && actor.encounter);
  const range=runtime.body.radius*WEB_SQUAD_VOLLEY.rangeBodyRadii;
  const unassigned=new Set(armed), squads=new Map();
  // Snapshot the entire partition BEFORE the movement loop. Otherwise an
  // early-moving actor could change which teammates exist for later actors.
  for (const first of armed) {
    if (!unassigned.has(first))continue;
    const squad=[first];
    unassigned.delete(first);
    for (let i=0;i<squad.length;i++) {
      const member=squad[i];
      for (const candidate of armed) {
        if (!unassigned.has(candidate) ||
            Math.hypot(member.x-candidate.x,member.z-candidate.z)>range)continue;
        // Nearby enemies in separate rooms are NOT one communicating squad.
        // A real wall between their eye positions splits Web fireteams even
        // when both independently see the player. Keep the same sight collision
        // authority as attacks; never infer squad membership through cover.
        const memberEye={x:member.x,y:member.y+runtime.aimHeight,z:member.z};
        const candidateEye={x:candidate.x,y:candidate.y+runtime.aimHeight,z:candidate.z};
        if(nativeSegmentHit(runtime.sightCollision,memberEye,candidateEye)!==null)continue;
        unassigned.delete(candidate);
        squad.push(candidate);
      }
    }
    for (const member of squad)squads.set(member,squad);
  }
  return squads;
}
/** Snapshot the local squad's single breaching leader before ANY actor moves.
 * A moving or recovering ally must not re-elect the leader midway through
 * the same encounter frame. Relay the advance between eligible squadmates
 * on a Web-authored clock so one gunner does not permanently lead every push.
 * This only selects movement: actual sight, nav, muzzle and weapon gates stay.
 * @param {object} runtime Current encounter clock and settings.
 * @param {Map<object,object[]>} localSquads Full non-overlapping armed squads.
 * @param {Set<object>} observingAllies Actual pre-movement sight witnesses.
 * @returns {Set<object>} Leaders, at most one per connected local squad.
 */
function webSquadBreachingLeaders(runtime,localSquads,observingAllies) {
  const leaders=new Set(), visited=new Set();
  for (const squad of localSquads.values()) {
    if (visited.has(squad)) continue;
    visited.add(squad);
    if (squad.length<2) continue;
    const available=squad.filter(candidate => {
      if (!observingAllies.has(candidate) || webWeaponRole(candidate)?.holdRange) return false;
      // An interrupted actor retains squad membership but cannot lead.
      return !(candidate.reaction.stunRemaining>0 ||
        candidate.reaction.stunnedThisFrame ||
        candidate.encounter.webDodgeRemaining>0 ||
        candidate.encounter.webSuppressionRemaining>0 ||
        candidate.encounter.webLossRemaining>0 ||
        candidate.encounter.webHitPending || candidate.encounter.webHitRemaining>0 ||
        candidate.runtime?.pendingShot);
    });
    if (!available.length) continue;
    // Let a real, equipped shotgun take the close-range role while the others
    // cover. A squad without such a gunner keeps the existing relay behavior.
    const preferred=available.filter(candidate=>webWeaponRole(candidate)?.preferBreach);
    const candidates=preferred.length ? preferred : available;
    candidates.sort((a,b)=>String(a.id).localeCompare(String(b.id),'en'));
    const index=Math.floor(runtime.webVolleyClock/WEB_SQUAD_PUSH.relaySeconds)%candidates.length;
    leaders.add(candidates[index]);
  }
  return leaders;
}

// J3 Web-only final stand: once ACTUAL kill receipts leave one or two
// opponents before victory, a matching number of surviving armed gunners
// close the firing ring together. The final pair is a more intense, readable
// climax than one rusher and one stationary guard. If an extra actor arrives,
// restore ordinary single-breacher squad tactics immediately. This changes
// movement targets only: cover, nav, capsules and all gun gates still apply.
function webFinalSurvivorBreacher(runtime, enemy, enemies) {
  const remaining=runtime.killTarget-runtime.killed;
  if (runtime.killTarget<2 || remaining<1 || remaining>2 ||
      enemy.reaction?.hasWeapon!==true || !participating(enemy) ||
      webWeaponRole(enemy)?.holdRange) return false;
  let alive=0;
  for (const actor of enemies) if (participating(actor)) {
    alive++;
    if (alive>remaining) return false;
  }
  return alive===remaining;
}

/** Keep the native collision/navmesh as the authority even for Web-only
 * tactics. Never teleport an actor or cross a blocking actor/player.
 * Blocked lanes reverse once, then the enemy simply holds its position.
 */
// J3 Web-original cover peeking: when the gunner's REAL muzzle is occluded,
// prefer a swept/NavMesh-approved side-step whose projected muzzle would clear
// the known firing lane. Both choices still use actual collisions. Projection
// only ranks two legal moves; it NEVER authorizes a shot (next frame's real
// posed muzzle, line of sight and ally clearance must pass again).
function tryWebStrafe(runtime, enemy, playerFeet, enemies, scaledDeltaTime,
  {sideOverride=null, maxDistance=Infinity, preferClearMuzzle=false,
    preferCover=false, firingTarget=null}={}) {
  const start=position(enemy), state=enemy.encounter;
  const dx=playerFeet.x-start.x, dz=playerFeet.z-start.z, d=Math.hypot(dx,dz);
  if (!Number.isFinite(d) || (d<=EPSILON && sideOverride===null)) return false;
  const forwardX=d>EPSILON ? dx/d : Math.sin(enemy.face);
  const forwardZ=d>EPSILON ? dz/d : -Math.cos(enemy.face);
  const cycle=Math.floor((enemy.clock-WEB_STRAFE.warmupSeconds)/WEB_STRAFE.cycleSeconds);
  const direction=sideOverride ?? state.webTacticalSide*(cycle%2===0 ? 1 : -1);
  const travel=enemy.runtime.speed*scaledDeltaTime*WEB_STRAFE.speedFraction;
  if (travel<=EPSILON) return false;
  let fallback=null, chosen=null;
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
    const candidate={moved,side};
    if (preferClearMuzzle && enemy.muzzlePosition && firingTarget) {
      const muzzle={x:enemy.muzzlePosition.x+moved.x-start.x,
        y:enemy.muzzlePosition.y+moved.y-start.y,
        z:enemy.muzzlePosition.z+moved.z-start.z};
      const clear=nativeSegmentHit(runtime.sightCollision,muzzle,firingTarget)===null &&
        !webLivingAllyIntersectsSegment(runtime,enemy,muzzle,firingTarget,enemies);
      if (!clear) {
        fallback ??= candidate; // Preserve the original safe-side choice if both remain blocked.
        continue;
      }
    }
    // Web-only reload footwork: if one legal short step moves the eye behind
    // genuine world cover, prefer it over an equally safe exposed step.
    // Real cover is checked for THIS candidate; no sight/attack gate is granted.
    if (preferCover && firingTarget) {
      const eye={x:moved.x,y:moved.y+runtime.aimHeight,z:moved.z};
      if (nativeSphereHit(runtime.sightCollision,eye,firingTarget,.2)===null) {
        fallback ??= candidate; // Open arena: preserve normal strafe preference.
        continue;
      }
    }
    chosen=candidate;
    break;
  }
  chosen ??= fallback;
  if (!chosen)return false;
  if (preferCover && firingTarget) {
    const eye={x:chosen.moved.x,y:chosen.moved.y+runtime.aimHeight,z:chosen.moved.z};
    if(nativeSphereHit(runtime.sightCollision,eye,firingTarget,.2)!==null) {
      // Remember only the player's personally witnessed position before cover.
      state.webReloadCoverFeet={...playerFeet};
      state.webReloadCoverSide=chosen.side;
      state.webReloadCoverRemaining=WEB_RELOAD_SCOOT.coverSeconds;
    }
  }
  enemy.x=chosen.moved.x;enemy.y=chosen.moved.y;enemy.z=chosen.moved.z;
  enemy.walking=true;
  state.route=null;
  if(chosen.side!==direction && sideOverride===null)state.webTacticalSide=-state.webTacticalSide;
  return true;
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
// J3 Web-authored post-contact footwork: only a CONFIRMED nonlethal
// stun earns a short sidestep after recovery, using the incoming hit vector.
// This does not grant immunity, a new weapon, vision or attack permission.
const WEB_HIT_RECOVERY=Object.freeze({seconds:0.42,speedFraction:0.85});

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

// J3 original Web tactics (not MCD): a gunner who can ACTUALLY see the
// player deliberately aiming at its torso may briefly leave that firing lane.
// Aim must persist in world-scaled time, not a single noisy pointer frame;
// motion still runs on the slowed world clock and through the native nav/capsule.
// This is no warning about unseen bullets and grants no evasive invulnerability.
const WEB_AIM_PRESSURE = Object.freeze({
  lockSeconds: 0.28,
  evadeSeconds: 0.44,
  cooldownSeconds: 2.4,
  maxBodyRadii: 30,
});

/** React only to the actual camera ray, after eye visibility and current
 * world cover have been checked. Invalid/missing camera vectors fail closed.
 * Aimed movement is Web-original and never stands in for a native bullet hit.
 */
function webPlayerIsAimingAt(runtime, enemy, playerPosition, playerForward, enemies) {
  if (!playerForward || !playerPosition ||
      ![playerForward.x,playerForward.y,playerForward.z,
        playerPosition.x,playerPosition.y,playerPosition.z].every(Number.isFinite))return false;
  const body={x:enemy.x,y:enemy.y+runtime.aimHeight*0.75,z:enemy.z};
  const distanceToBody=distance(body,playerPosition);
  const forwardLength=Math.hypot(playerForward.x,playerForward.y,playerForward.z);
  if (distanceToBody<=EPSILON ||
      distanceToBody>runtime.body.radius*WEB_AIM_PRESSURE.maxBodyRadii ||
      forwardLength<=EPSILON)return false;
  // An angular cone reacts to a MISS more than a body width away at range.
  // The player's actual camera ray must enter this actor's existing Web
  // body cylinder (the same radius/height used for movement occupancy).
  // This is Web hit geometry, NOT a recovered native MCD perception rule.
  const vx=playerForward.x/forwardLength, vy=playerForward.y/forwardLength;
  const vz=playerForward.z/forwardLength;
  const dx=enemy.x-playerPosition.x,dz=enemy.z-playerPosition.z;
  const horizontalSpeedSquared=vx*vx+vz*vz;
  const radiusSquared=runtime.body.radius*runtime.body.radius;
  let enter=0,exit=distanceToBody+runtime.body.radius;
  if(horizontalSpeedSquared>EPSILON) {
    const projection=dx*vx+dz*vz;
    const discriminant=projection*projection-
      horizontalSpeedSquared*(dx*dx+dz*dz-radiusSquared);
    if(discriminant<0)return false;
    const root=Math.sqrt(discriminant);
    enter=Math.max(0,(projection-root)/horizontalSpeedSquared);
    exit=Math.min(exit,(projection+root)/horizontalSpeedSquared);
    if(enter>exit)return false;
  } else if(dx*dx+dz*dz>radiusSquared)return false;
  if(Math.abs(vy)>EPSILON) {
    const lower=(enemy.y-playerPosition.y)/vy;
    const upper=(enemy.y+runtime.body.height-playerPosition.y)/vy;
    enter=Math.max(enter,Math.min(lower,upper));
    exit=Math.min(exit,Math.max(lower,upper));
    if(enter>exit)return false;
  } else if(playerPosition.y<enemy.y ||
      playerPosition.y>enemy.y+runtime.body.height)return false;
  const hit={x:playerPosition.x+vx*enter,
    y:playerPosition.y+vy*enter,z:playerPosition.z+vz*enter};
  // An actual wall or another living actor in front of this contact point
  // owns the ray. Neither line of sight nor an allied body may be bypassed.
  return nativeSegmentHit(runtime.sightCollision,playerPosition,hit)===null &&
    !webLivingAllyIntersectsSegment(runtime,enemy,playerPosition,hit,enemies);
}

/**
 * A shot scheduled to disappear before its projected closest pass cannot
 * credibly provoke an evasive reaction. The shipped Dojo bullet object has
 * a remaining world-time ttl; legacy synthetic callers without it retain
 * their prior detection policy. This is Web AI fairness, not an MCD rule.
 *
 * @param {object} projectile Live browser projectile snapshot.
 * @param {number} secondsToPass Predicted world seconds until closest passage.
 * @returns {boolean} Whether the bullet can still exist at that instant.
 */
function webProjectileCanReach(projectile,secondsToPass) {
  const ttl=projectile.ttl;
  return ttl===undefined ||
    (Number.isFinite(ttl) && ttl>0 && secondsToPass<=ttl+EPSILON);
}

/** Web-only 3D threat window: intersect the projectile's forward path with
 * the existing movement body's horizontal warning radius AND vertical height.
 * Sampling only the planar closest point can miss steep shots whose height
 * crosses the enemy while they are still approaching its feet on stairs.
 * This is predictive AI geometry, not a native hitbox or damage authority.
 */
function webIncomingWarningEntry(runtime,enemy,origin,velocity,planarSpeedSquared) {
  const rx=origin.x-enemy.x,rz=origin.z-enemy.z;
  const warningRadius=runtime.body.radius*WEB_PROJECTILE_EVADE.warningBodyRadii;
  let first=0,last=WEB_PROJECTILE_EVADE.lookaheadSeconds;
  if(planarSpeedSquared>EPSILON) {
    const approach=rx*velocity.x+rz*velocity.z;
    const discriminant=approach*approach-planarSpeedSquared*
      (rx*rx+rz*rz-warningRadius*warningRadius);
    if(discriminant<0)return null;
    const root=Math.sqrt(discriminant);
    first=Math.max(0,(-approach-root)/planarSpeedSquared);
    last=Math.min(last,(-approach+root)/planarSpeedSquared);
  } else if(rx*rx+rz*rz>warningRadius*warningRadius) {
    // Nearly vertical falling shots have no planar closest-pass time:
    // their XZ footprint must already be inside the warning cylinder.
    return null;
  }
  if(Math.abs(velocity.y)>EPSILON) {
    const bottom=(enemy.y-origin.y)/velocity.y;
    const top=(enemy.y+runtime.body.height-origin.y)/velocity.y;
    first=Math.max(first,Math.min(bottom,top));
    last=Math.min(last,Math.max(bottom,top));
  } else if(origin.y<enemy.y || origin.y>enemy.y+runtime.body.height)return null;
  if(last<Math.max(first,EPSILON))return null;
  const time=Math.max(first,EPSILON);
  // The whole 3D warning interval matters: a wall may lie *after* its
  // entry face but before the projectile exits body-height range.
  return {time,exitTime:last};
}

/** End the visibility ray at the FIRST genuinely threatened point, rather
 * than at the far edge of the warning cylinder. A wall behind a bullet's
 * possible body contact cannot protect that body from the approaching shot.
 * For a grazing trajectory that misses the actual body radius, use its
 * closest point inside the 3D warning interval instead.
 * This is Web predictive awareness, not collision/damage or MCD parity.
 */
function webProjectileThreatTime(runtime,enemy,origin,velocity,planarSpeedSquared,closestTime,entry) {
  const offsetX=origin.x+velocity.x*closestTime-enemy.x;
  const offsetZ=origin.z+velocity.z*closestTime-enemy.z;
  const separationSquared=offsetX*offsetX+offsetZ*offsetZ;
  const bodyRadiusSquared=runtime.body.radius*runtime.body.radius;
  let time=Math.max(entry.time,Math.min(closestTime,entry.exitTime));
  if(separationSquared<=bodyRadiusSquared) {
    const bodyEntry=closestTime-Math.sqrt(
      Math.max(0,(bodyRadiusSquared-separationSquared)/planarSpeedSquared));
    if(bodyEntry<=entry.exitTime)time=Math.max(entry.time,bodyEntry);
  }
  return time;
}

/** Find the earliest observable player bullet that will pass near the body.
 * @param {object} runtime Source collision/navmesh adapter.
 * @param {object} enemy Current live enemy.
 * @param {object[]} projectiles Live projectile snapshots from SH-05.
 * @returns {{sideX:number,sideZ:number}|null} A safe-direction hint, not a hit.
 */
function webIncomingProjectile(runtime, enemy, projectiles, enemies) {
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
    const vertical=planarSpeedSquared<=EPSILON;
    if(vertical && Math.abs(v.y)<=EPSILON)continue;
    const dx=enemy.x-origin.x,dz=enemy.z-origin.z;
    const until=vertical?0:(dx*v.x+dz*v.z)/planarSpeedSquared;
    if(!vertical && until<=0)continue; // A passing bullet moving away is no longer a threat.
    const entry=webIncomingWarningEntry(runtime,enemy,origin,v,planarSpeedSquared);
    if(!entry || entry.time>=bestTime)continue;
    const threatTime=vertical?entry.time:webProjectileThreatTime(
      runtime,enemy,origin,v,planarSpeedSquared,until,entry);
    // Expiry and cover are evaluated up to the FIRST threatening point.
    // Testing all the way to the cylinder exit would let a wall or ally
    // BEHIND the enemy's body incorrectly cancel an incoming dodge.
    // Conversely a wall AFTER warning entry but BEFORE threatened contact
    // remains authoritative: no phantom evasions through cover.
    if(!webProjectileCanReach(projectile,threatTime))continue;
    const contactEnd={
      x:origin.x+v.x*threatTime,
      y:origin.y+v.y*threatTime,
      z:origin.z+v.z*threatTime,
    };
    if(nativeSegmentHit(runtime.sightCollision,origin,contactEnd)!==null ||
        webLivingAllyIntersectsSegment(runtime,enemy,origin,contactEnd,enemies))continue;
    let sideX,sideZ;
    if(vertical) {
      // Any sideways direction escapes a vertical path. Use the actor's
      // current facing and stable tactical side, not a hidden shooter position.
      const face=Number.isFinite(enemy.face)?enemy.face:0;
      const side=enemy.encounter.webTacticalSide===-1?-1:1;
      sideX=Math.cos(face)*side;
      sideZ=Math.sin(face)*side;
    } else {
      const speed=Math.sqrt(planarSpeedSquared);
      const cross=v.x*dz-v.z*dx;
      const side=Math.abs(cross)<=EPSILON ? enemy.encounter.webTacticalSide : Math.sign(cross);
      sideX=-v.z/speed*side;
      sideZ=v.x/speed*side;
    }
    bestTime=entry.time;
    threat={sideX,sideZ};
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
function webNearMissProjectile(runtime, enemy, projectiles, enemies) {
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
    let until;
    if(speedSquared<=EPSILON) {
      // A vertical projectile can suppress a nearby gunner without horizontal
      // motion, but only when approaching the character's actual body height.
      if(velocity.y< -EPSILON && origin.y>enemy.y+runtime.body.height)
        until=(enemy.y+runtime.body.height-origin.y)/velocity.y;
      else if(velocity.y>EPSILON && origin.y<enemy.y)
        until=(enemy.y-origin.y)/velocity.y;
      else if(Math.abs(velocity.y)>EPSILON &&
          origin.y>=enemy.y && origin.y<=enemy.y+runtime.body.height)
        until=EPSILON;
      else continue;
    } else {
      until=((enemy.x-origin.x)*velocity.x+(enemy.z-origin.z)*velocity.z)/speedSquared;
    }
    if (until<=0 || until>WEB_NEAR_MISS.lookaheadSeconds || until>=earliest ||
        !webProjectileCanReach(projectile,until)) continue;
    const closest={x:origin.x+velocity.x*until,y:origin.y+velocity.y*until,z:origin.z+velocity.z*until};
    if (closest.y<enemy.y || closest.y>enemy.y+runtime.body.height) continue;
    const separation=Math.hypot(closest.x-enemy.x,closest.z-enemy.z);
    if (separation<=runtime.body.radius*WEB_PROJECTILE_EVADE.warningBodyRadii ||
        separation>runtime.body.radius*WEB_NEAR_MISS.outerBodyRadii) continue;
    const eye={x:enemy.x,y:enemy.y+runtime.aimHeight*0.55,z:enemy.z};
    if (nativeSegmentHit(runtime.sightCollision,origin,closest)!==null ||
        nativeSegmentHit(runtime.sightCollision,closest,eye)!==null ||
        webLivingAllyIntersectsSegment(runtime,enemy,origin,closest,enemies)) continue;
    earliest=until;
    passage=closest;
  }
  return passage;
}

/** Post-stun sidestep by the stored incoming hit trajectory, NOT by the
 * player's new or unseen location. Try either perpendicular lane without
 * bypassing the existing capsule, navigation or crowd collision.
 * @returns {boolean} Whether approved feet movement took place.
 */
function tryWebHitSidestep(runtime,enemy,playerFeet,playerPosition,enemies,scaledDeltaTime) {
  const start=position(enemy),state=enemy.encounter;
  const travel=enemy.runtime.speed*scaledDeltaTime*WEB_HIT_RECOVERY.speedFraction;
  if(!Number.isFinite(travel) || travel<=EPSILON)return false;
  // Web-only: an armed survivor can use the recovery step to break a REAL
  // visible firing lane. Prefer a covered legal step over an exposed one;
  // without personal line of sight, keep the original hit-direction dodge
  // rather than learning the player's current position through a wall.
  const eye={x:start.x,y:start.y+runtime.aimHeight,z:start.z};
  const seekCover=enemy.reaction.hasWeapon===true &&
    nativeSphereHit(runtime.sightCollision,eye,playerPosition,.2)===null;
  let fallback=null,selected=null;
  for(const sign of [1,-1]) {
    const moved=moveNativeCharacter(runtime.collision,start,{
      x:state.webHitSideX*travel*sign,y:0,z:state.webHitSideZ*travel*sign,
    },runtime.body).position;
    if(Math.hypot(moved.x-start.x,moved.z-start.z)<=EPSILON)continue;
    const sample=sampleNativeNavigation(runtime.nav,moved,runtime.body.stepOffset+EPSILON);
    if(!sample || Math.hypot(sample.position.x-moved.x,sample.position.z-moved.z)>EPSILON ||
        occupied(runtime,start,moved,enemies,enemy) ||
        occupiedSegment(start,moved,playerFeet,runtime.body.radius*2,runtime.body.height))continue;
    const candidate={moved,sign};
    if(seekCover) {
      const candidateEye={x:moved.x,y:moved.y+runtime.aimHeight,z:moved.z};
      if(nativeSphereHit(runtime.sightCollision,candidateEye,playerPosition,.2)===null) {
        fallback ??=candidate;
        continue;
      }
    }
    selected=candidate;
    break;
  }
  selected ??=fallback;
  if(!selected)return false;
  enemy.x=selected.moved.x;enemy.y=selected.moved.y;enemy.z=selected.moved.z;
  enemy.walking=true;
  state.route=null;
  state.webHitSideX*=selected.sign;state.webHitSideZ*=selected.sign;
  return true;
}

/** Shift feet laterally without tunneling, teleportation or fake shooting.
 * @returns {boolean} Whether a real nav/capsule-approved step occurred.
 */
function tryWebProjectileEvade(runtime,enemy,playerFeet,enemies,scaledDeltaTime) {
  const start=position(enemy),state=enemy.encounter;
  const travel=enemy.runtime.speed*scaledDeltaTime*WEB_PROJECTILE_EVADE.speedFraction;
  if(!Number.isFinite(travel) || travel<=EPSILON)return false;
  // A teammate or wall can close the first evasion lane while the opposite
  // perpendicular lane remains safe. Try both using the SAME swept capsule,
  // navmesh and live-actor gates; never teleport through the blocker. Remember
  // the successful side for the remainder of this dodge to avoid oscillation.
  for(const direction of [1,-1]) {
    const moved=moveNativeCharacter(runtime.collision,start,{
      x:state.webDodgeSideX*travel*direction,y:0,z:state.webDodgeSideZ*travel*direction,
    },runtime.body).position;
    if(Math.hypot(moved.x-start.x,moved.z-start.z)<=EPSILON)continue;
    const sample=sampleNativeNavigation(runtime.nav,moved,runtime.body.stepOffset+EPSILON);
    if(!sample || Math.hypot(sample.position.x-moved.x,sample.position.z-moved.z)>EPSILON ||
        occupied(runtime,start,moved,enemies,enemy) ||
        occupiedSegment(start,moved,playerFeet,runtime.body.radius*2,runtime.body.height))continue;
    enemy.x=moved.x;enemy.y=moved.y;enemy.z=moved.z;
    enemy.walking=true;
    state.route=null;
    state.webDodgeSideX*=direction;
    state.webDodgeSideZ*=direction;
    return true;
  }
  return false;
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
function webSquadApproachGoal(runtime, enemy, playerFeet, localSquads) {
  const squad=localSquads.get(enemy);
  if (!squad || squad.length<2) return null;
  const dx=playerFeet.x-enemy.x, dz=playerFeet.z-enemy.z;
  const length=Math.hypot(dx,dz);
  const offset=Math.min(runtime.body.radius*3.5,runtime.armedStopDistance*0.7);
  if(!Number.isFinite(length) || length<=EPSILON || offset<=EPSILON)return null;
  // J3 Web-only fanout: with 3+ gunners, a binary left/right choice sends
  // multiple allies into the SAME lane. Assign unique, stable lateral slots
  // around the observed target instead. Keep the existing two-gunner behavior.
  // This local squad is already snapshotted before movement, so list ordering
  // cannot switch a route halfway through the encounter frame.
  let side=enemy.encounter.webTacticalSide;
  if(squad.length>2) {
    const sorted=[...squad].sort((a,b)=>String(a.id).localeCompare(String(b.id),'en'));
    side=Math.max(-2,Math.min(2,sorted.indexOf(enemy)-(sorted.length-1)/2));
  }
  // The central actor in an odd-numbered fireteam takes the ordinary direct
  // route. No fake navigation point or extra movement is introduced.
  if(side===0)return null;
  const goal={x:playerFeet.x-dz/length*side*offset,
    y:playerFeet.y,z:playerFeet.z+dx/length*side*offset};
  const sample=sampleNativeNavigation(runtime.nav,goal,runtime.body.stepOffset+EPSILON);
  if(!sample || Math.hypot(sample.position.x-goal.x,sample.position.z-goal.z)>EPSILON)return null;
  return goal;
}

// J3 Web-original disarmed rush: a foe without a gun is otherwise an easy
// straight-line target during its long approach to melee range. At visible,
// short-to-medium distance it alternates diagonal advances while *continuing*
// to close the gap. This changes movement only: melee damage is still gated
// by the actual animation/contact event, never by this approach decision.
// A swept body, baked navmesh and other live characters remain authoritative.
const WEB_UNARMED_WEAVE=Object.freeze({
  switchSeconds:0.65,
  rangeBodyRadii:20,
  lateralBias:0.65,
});
function tryWebUnarmedWeave(runtime,enemy,playerFeet,enemies,scaledDeltaTime) {
  const start=position(enemy),state=enemy.encounter;
  const dx=playerFeet.x-start.x,dz=playerFeet.z-start.z;
  const planar=Math.hypot(dx,dz);
  const remaining=planar-runtime.unarmedStopDistance-runtime.body.radius*0.5;
  const travel=Math.min(enemy.runtime.speed*scaledDeltaTime,remaining);
  if(!Number.isFinite(travel) || travel<=EPSILON || planar<=EPSILON)return false;
  const forwardX=dx/planar,forwardZ=dz/planar;
  const phase=Math.floor(runtime.webVolleyClock/WEB_UNARMED_WEAVE.switchSeconds);
  const preferred=state.webTacticalSide*(phase%2===0?1:-1);
  const normalizer=Math.hypot(1,WEB_UNARMED_WEAVE.lateralBias);
  for(const side of [preferred,-preferred]) {
    const offsetX=(forwardX-forwardZ*side*WEB_UNARMED_WEAVE.lateralBias)/normalizer*travel;
    const offsetZ=(forwardZ+forwardX*side*WEB_UNARMED_WEAVE.lateralBias)/normalizer*travel;
    const moved=moveNativeCharacter(runtime.collision,start,
      {x:offsetX,y:0,z:offsetZ},runtime.body).position;
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
// A live actor capsule blocks both another gunner's muzzle and the Web AI's
// prediction of an incoming PLAYER bullet. A bullet intercepted by a teammate
// must not make an enemy farther downrange dodge or panic. Web tactical test,
// NOT a new native projectile collision, piercing or damage contract.
function webLivingAllyIntersectsSegment(runtime, shooter, muzzle, target, enemies) {
  const dx=target.x-muzzle.x, dz=target.z-muzzle.z;
  const planarSquared=dx*dx+dz*dz;
  const radiusSquared=runtime.body.radius*runtime.body.radius;
  return enemies.some(other => {
    if(other===shooter || !participating(other))return false;
    const ox=muzzle.x-other.x, oz=muzzle.z-other.z;
    let enter=0, exit=1;
    if(planarSquared>0) {
      const b=ox*dx+oz*dz;
      const c=ox*ox+oz*oz-radiusSquared;
      const discriminant=b*b-planarSquared*c;
      if(discriminant<0)return false;
      const root=Math.sqrt(discriminant);
      enter=Math.max(0,(-b-root)/planarSquared);
      exit=Math.min(1,(-b+root)/planarSquared);
      if(enter>exit)return false;
    } else if(ox*ox+oz*oz>radiusSquared)return false;
    // The closest HORIZONTAL point can be above or below a teammate even
    // when the sloping bullet ray passes through their torso at the edge of
    // its body cylinder (e.g. different stair heights). Intersect the WHOLE
    // planar crossing interval with the body-height interval, not one sample.
    // This is Web muzzle safety, not a native MCD collision-layer claim.
    const dy=target.y-muzzle.y;
    if(dy===0)return muzzle.y>=other.y && muzzle.y<=other.y+runtime.body.height;
    const first=(other.y-muzzle.y)/dy;
    const last=(other.y+runtime.body.height-muzzle.y)/dy;
    return Math.max(enter,Math.min(first,last))<=Math.min(exit,Math.max(first,last));
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
 * @param {number} scaledDeltaTime Current weapon Update tick, not wall time.
 * @param {Map<object,object[]>} localSquads Full armed spatial groups, including temporarily busy links.
 * @returns {{clear:Set<object>,allyBlocked:Set<object>,turn:Set<object>,eligible:Set<object>}}
 */
function webSquadFireTurns(runtime, enemies, observers, target, scaledDeltaTime, localSquads) {
  const clear=new Set(), allyBlocked=new Set(), ready=[];
  for(const enemy of enemies) {
    if(!participating(enemy) || !enemy.encounter || !enemy.reaction?.hasWeapon ||
        !observers.has(enemy) || !enemy.muzzlePosition || !enemy.muzzleForward)continue;
    if(nativeSegmentHit(runtime.sightCollision,enemy.muzzlePosition,target)!==null)continue;
    clear.add(enemy);
    if(webLivingAllyIntersectsSegment(runtime,enemy,enemy.muzzlePosition,target,enemies)) {
      allyBlocked.add(enemy);
      continue;
    }
    if(enemy.reaction.stunRemaining>0 || enemy.reaction.stunnedThisFrame ||
        enemy.runtime?.pendingShot || enemy.encounter.webDodgeRemaining>0 ||
        enemy.encounter.webSuppressionRemaining>0 || enemy.encounter.webLossRemaining>0 ||
        enemy.encounter.webHitPending || enemy.encounter.webHitRemaining>0)continue;
    ready.push(enemy);
  }
  ready.sort((a,b)=>String(a.id).localeCompare(String(b.id),'en'));
  // Overlapping neighbor lists can each elect a different shooter (A-B-C
  // chain). Partition the *eligible* gunners into disjoint connected squads;
  // all members then agree on one stable firing turn, regardless of input order.
  const turn=new Set(), eligibleSquads=new Map();
  // Partition by the full armed fireteam, not only currently ready shooters.
  // A suppressed, stunned or covered B still connects A-B-C spatially. If B
  // temporarily disappears from eligibility, A and C must not each receive
  // an independent firing turn in the same window.
  for (const gunner of ready) {
    const group=localSquads.get(gunner) ?? [gunner];
    if(!eligibleSquads.has(group))eligibleSquads.set(group,[]);
    eligibleSquads.get(group).push(gunner);
  }
  for(const squad of eligibleSquads.values()) {
    squad.sort((a,b)=>String(a.id).localeCompare(String(b.id),'en'));
    const index=Math.floor(runtime.webVolleyClock/WEB_SQUAD_VOLLEY.beatSeconds)%squad.length;
    // A gunner that cannot finish its existing reload in this weapon Update
    // must not consume the squad's entire firing window while a partner is
    // already ready. Keep that gunner IN the component, though: removing it
    // could split A-B-C into two firing squads and produce double volleys.
    for (let offset=0;offset<squad.length;offset++) {
      const candidate=squad[(index+offset)%squad.length];
      const settings=candidate.activeWeaponSettings ?? runtime.enemySettings;
      const nextTickCost=scaledDeltaTime*settings.weaponSpeedMultiplier*
        settings.difficultyWeaponSpeedMultiplier;
      // A newly alerted or re-aiming squadmate cannot fire on this actual
      // GunAttack tick even with an expired reload. Do not waste the whole
      // team's beat: let a genuinely ready partner use it. This tests the
      // existing weapon runtime gates, not an invented native squad rule.
      if (!(candidate.runtime.alertness>settings.alertDelay*1.05) ||
          candidate.runtime.targetNeedsReroll ||
          (settings.family==='SniperRifle' && !candidate.runtime.sniperCanShot))continue;
      if (candidate.runtime.attackDelayRemaining<nextTickCost) {
        turn.add(candidate);
        break;
      }
    }
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
      webObservedPlayerFeet:null, // Consecutive personal sighting for Web anti-kiting; never an unseen velocity.
      webLastSeenFeet:null, // Web-only investigation memory, not MCD AI evidence.
      webSearchRemaining:null, webSearchComplete:false,
       webSearchPass:0, webSearchPause:0,
      webDodgeRemaining:0,webDodgeCooldown:0,webDodgeSideX:0,webDodgeSideZ:0,
      webHitRevision:0,webHitPending:false,webHitRemaining:0,webHitSideX:0,webHitSideZ:0,
      webLossRemaining:0,webLossFeet:null,webCounterPushRemaining:0,
      webSuppressionRemaining:0,webSuppressionCooldown:0,webSuppressionFrom:null,
      webAimLock:0,webAimRemaining:0,webAimCooldown:0,
      webReloadCoverRemaining:0,webReloadCoverFeet:null,webReloadCoverSide:0},
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
      // A witnessed loss is a real local combat event. After the brief retreat,
      // an armed witness may counter-push while it can actually SEE the player.
      // No shared aggro, extra shot, blind pursuit or MCD behavior is inferred.
      if(enemy.reaction.hasWeapon)
        enemy.encounter.webCounterPushRemaining=WEB_WITNESSED_LOSS.counterPushSeconds;
    }
  }
}

function moveEnemy(runtime, enemy, input, observingAllies, fireTurns, localSquads, breachingLeaders) {
  const { scaledDeltaTime, unscaledDeltaTime, playerFeet, playerPosition,
    playerForward, enemies, playerProjectiles=[] } = input;
  const state=enemy.encounter;
  if (!state) return;
  state.canAttack=false;
  state.webAllyBlockingShot=false;
  enemy.walking=false;
  state.webSuppressionCooldown=Math.max(0,state.webSuppressionCooldown-scaledDeltaTime);
  state.webCounterPushRemaining=Math.max(0,
    (state.webCounterPushRemaining??0)-scaledDeltaTime);
  // An accepted hit increments the existing contact reaction revision. Save
  // that hit's delivered direction while stunned. No native post-stun behavior
  // is inferred from these Web-only recovery rules.
  const revision=enemy.reaction?.reactionRevision;
  if(Number.isSafeInteger(revision) && revision>state.webHitRevision) {
    state.webHitRevision=revision;
    state.webHitPending=false;state.webHitRemaining=0;
    const hit=enemy.hitIncomingDirection;
    const length=Math.hypot(hit?.x??NaN,hit?.z??NaN);
    if(participating(enemy) &&
        (enemy.reaction.stunRemaining>0 || enemy.reaction.stunnedThisFrame) &&
        Number.isFinite(length) && length>EPSILON) {
      state.webHitSideX=-hit.z/length*state.webTacticalSide;
      state.webHitSideZ=hit.x/length*state.webTacticalSide;
      state.webHitPending=true;
    }
  }
  // SH-03 Web game-feel: time is world-scaled in this FPS. Holding the camera
  // on a frozen enemy must not charge a delayed dodge or refill its cooldown.
  // Unscaled wall time is reserved for genuine real-time UI/spawn concerns.
  state.webAimCooldown=Math.max(0,state.webAimCooldown-scaledDeltaTime);
  if (!participating(enemy) || enemy.reaction.stunRemaining > 0 || enemy.reaction.stunnedThisFrame) {
    if(!participating(enemy)) {
      state.webHitPending=false;
      state.webHitRemaining=0;
    }
    state.webReloadCoverRemaining=0;
    state.webReloadCoverFeet=null;
    state.webReloadCoverSide=0;
    // Being stunned again cancels the counterattack, rather than preserving
    // aggression through an unrelated hit or a death.
    state.webCounterPushRemaining=0;
    state.webObservedPlayerFeet=null;
    cancelWebProjectileEvade(state);
    state.webLossRemaining=0;
    state.webLossFeet=null;
    state.webSuppressionRemaining=0;
    state.webSuppressionFrom=null;
    state.webAimLock=0;
    state.webAimRemaining=0;
    enemy.runtime.pendingShot=null;
    enemy.runtime.speed=0;
    return;
  }
  // Nonlethal stun has ENDED. Reposition once before the ordinary pursuit or
  // reload behavior resumes. World-time pause freezes motion and recovery.
  if(state.webHitPending) {
    state.webHitPending=false;
    state.webHitRemaining=WEB_HIT_RECOVERY.seconds;
  }
  if(state.webHitRemaining>0) {
    state.canAttack=false;
    if(scaledDeltaTime>0) {
      advanceNativeEnemySpeed(enemy.runtime,enemy.activeWeaponSettings??runtime.enemySettings,
        'running',scaledDeltaTime);
      const moved=tryWebHitSidestep(runtime,enemy,playerFeet,playerPosition,enemies,scaledDeltaTime);
      state.webHitRemaining=Math.max(0,state.webHitRemaining-scaledDeltaTime);
      if(!moved)state.webHitRemaining=0;
      if(moved)return;
    } else return;
  }
  const armed=enemy.reaction.hasWeapon;
  if (!armed) {
    state.webReloadCoverRemaining=0;
    state.webReloadCoverFeet=null;
    state.webReloadCoverSide=0;
    enemy.runtime.pendingShot=null;
    state.webSuppressionRemaining=0;
    state.webSuppressionFrom=null;
  }
  if (enemy.runtime.pendingShot) {
    state.webReloadCoverRemaining=0;
    state.webReloadCoverFeet=null;
    state.webReloadCoverSide=0;
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
  // Per-actor consecutive REAL sightings: losing sight or suffering a stun
  // discards the velocity baseline. Paused frames may refresh the observed
  // feet but cannot accrue a movement impulse or trigger a pursuit push.
  const playerRetreating=state.visible &&
    webVisiblePlayerRetreats(state.webObservedPlayerFeet,playerFeet,start,scaledDeltaTime);
  state.webObservedPlayerFeet=state.visible ? {...playerFeet} : null;
  // Web-authored fairness: once an enemy has REALLY observed the player,
  // losing body sight freezes its last known feet instead of letting it track
  // live coordinates through walls. Actors that have never seen the player
  // keep the established Dojo pursuit fallback; no new source AI claim.
  if(state.visible) {
    state.webLastSeenFeet={...playerFeet};
    state.webSearchRemaining=null;
    state.webSearchComplete=false;
    state.webSearchPass=0;
    state.webSearchPause=0;
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
      state.webSearchPass=0;
      state.webSearchPause=0;
      state.route=null;
    }
  }
  // J3 Web-only cover payoff: keep the gunner behind REAL geometry during
  // its existing reload, then re-peek its last-seen lane. Blind pursuit cannot
  // instantly undo the cover step or reveal the player's hidden location.
  if(state.visible) {
    state.webReloadCoverRemaining=0;
    state.webReloadCoverFeet=null;
    state.webReloadCoverSide=0;
  } else if(armed && state.webReloadCoverRemaining>0 &&
      state.webReloadCoverFeet && !enemy.runtime.pendingShot) {
    state.canAttack=false;
    state.webReloadCoverRemaining=Math.max(0,
      state.webReloadCoverRemaining-scaledDeltaTime);
    const settings=enemy.activeWeaponSettings ?? runtime.enemySettings;
    const almostReady=enemy.runtime.attackDelayRemaining<=
      settings.attackDelay*WEB_RELOAD_SCOOT.readyFraction;
    if(scaledDeltaTime===0 || (!almostReady && state.webReloadCoverRemaining>EPSILON)) {
      enemy.runtime.speed=0;
      return;
    }
    if(state.webReloadCoverRemaining>EPSILON) {
      advanceNativeEnemySpeed(enemy.runtime,settings,'walking',scaledDeltaTime);
      if(tryWebStrafe(runtime,enemy,state.webReloadCoverFeet,enemies,
        scaledDeltaTime,{sideOverride:-state.webReloadCoverSide}))return;
    }
    // A blocked return lane cannot trap the actor: resume remembered pursuit.
    state.webReloadCoverRemaining=0;
    state.webReloadCoverFeet=null;
    state.webReloadCoverSide=0;
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
  // A real projectile already travelling through a clear corridor is
  // observable even when the shooter is behind cover. Unlike an aim or
  // squad sighting, bullet geometry never reveals the player's position.
  // Let the projectile's own swept line (including intervening cover and
  // living allies) authorize only this Web evasive movement, never a shot.
  if(!enemy.runtime.pendingShot &&
      state.webDodgeRemaining<=0 && state.webDodgeCooldown<=EPSILON) {
    const threat=webIncomingProjectile(runtime,enemy,playerProjectiles,enemies);
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
    const passage=webNearMissProjectile(runtime,enemy,playerProjectiles,enemies);
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
  // A real sustained camera aim at a VISIBLE gunner creates a short, readable
  // side-step. This adds gunfight motion before the first bullet, but does not
  // infer player intent through walls or consume world time while frozen.
  // A committed shot, actual projectile dodge, near-miss or witnessed loss has
  // priority. Even when aim time advances, only swept, nav-approved feet move.
  if (!armed || enemy.runtime.pendingShot || state.webDodgeRemaining>0 ||
      state.webSuppressionRemaining>0 || state.webLossRemaining>0) {
    state.webAimLock=0;
    state.webAimRemaining=0;
  } else if (state.webAimRemaining<=0 && state.webAimCooldown<=EPSILON) {
    const threatened=state.visible &&
      webPlayerIsAimingAt(runtime,enemy,playerPosition,playerForward,enemies);
    state.webAimLock=threatened ? state.webAimLock+scaledDeltaTime : 0;
    if(state.webAimLock>=WEB_AIM_PRESSURE.lockSeconds) {
      state.webAimLock=0;
      state.webAimRemaining=WEB_AIM_PRESSURE.evadeSeconds;
      state.webAimCooldown=WEB_AIM_PRESSURE.cooldownSeconds;
    }
  }
  if(state.webAimRemaining>0) {
    state.canAttack=false;
    if(scaledDeltaTime>0) {
      advanceNativeEnemySpeed(enemy.runtime,enemy.activeWeaponSettings ?? runtime.enemySettings,
        'running',scaledDeltaTime);
      const moved=tryWebStrafe(runtime,enemy,playerFeet,enemies,scaledDeltaTime,
        {sideOverride:state.webTacticalSide});
      state.webAimRemaining=Math.max(0,state.webAimRemaining-scaledDeltaTime);
      if(!moved)state.webAimRemaining=0;
      if(moved)return;
    }
  }
  // A single, stable armed squadmate pressures the player while its allies
  // maintain their normal firing ring. No assigned partner, blocked line of
  // sight or deferred shot means the ordinary chase/stop behavior applies.
  const breaching=armed && state.visible && !enemy.runtime.pendingShot &&
    (breachingLeaders.has(enemy) ||
      webFinalSurvivorBreacher(runtime,enemy,enemies));
  const weaponRole=armed ? webWeaponRole(enemy) : null;
  const normalStopDistance=armed
    ? runtime.armedStopDistance*(weaponRole?.stopFraction ?? 1)
    : runtime.unarmedStopDistance;
  const unwatchedAdvance=armed && state.visible && !enemy.runtime.pendingShot &&
    !weaponRole?.holdRange && (localSquads.get(enemy)?.length ?? 1)===1 &&
    webPlayerLookingAway(playerPosition,playerForward,start);
  // Web-original counter-pressure: a gunner who personally witnessed a kill
  // first retreats, then briefly advances INSIDE their normal pistol ring.
  // This is only a navigation goal with real sight. Never bypass gun gates,
  // player/ally capsules, route, or cover. Snipers keep their long-range role.
  const counterPush=armed && state.visible && !enemy.runtime.pendingShot &&
    state.webLossRemaining<=EPSILON &&
    state.webCounterPushRemaining>EPSILON && !weaponRole?.holdRange;
  const retreatPressure=armed && state.visible && playerRetreating &&
    !enemy.runtime.pendingShot && !weaponRole?.holdRange;
  const stopDistance=breaching
    ? Math.min(normalStopDistance,Math.max(
        runtime.body.radius*WEB_SQUAD_PUSH.minimumStopBodyRadii,
        normalStopDistance*WEB_SQUAD_PUSH.stopDistanceFraction))
    : counterPush ? Math.min(normalStopDistance,
        Math.max(runtime.body.radius*3.2,normalStopDistance*WEB_WITNESSED_LOSS.counterPushStopFraction))
    : unwatchedAdvance ? normalStopDistance*WEB_UNWATCHED_APPROACH.stopFraction
    : retreatPressure ? Math.min(normalStopDistance,Math.max(
        runtime.body.radius*WEB_RETREAT_PRESSURE.minimumStopBodyRadii,
        normalStopDistance*WEB_RETREAT_PRESSURE.stopFraction))
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
    // Search a genuinely remembered location, not the hidden player. One
    // opposite-side second pass gives the hunter a chance to check the other
    // edge of cover; after two passes it stops instead of oscillating forever.
    // The short pause and every step consume only world-scaled time.
    if(state.webSearchComplete && state.webSearchPass<WEB_LAST_SEEN_SWEEP.passes-1 &&
        scaledDeltaTime>0) {
      state.webSearchPause=Math.max(0,state.webSearchPause-scaledDeltaTime);
      if(state.webSearchPause<=EPSILON) {
        state.webSearchPass++;
        state.webSearchRemaining=WEB_LAST_SEEN_SWEEP.seconds;
        state.webSearchComplete=false;
      }
    }
    state.route=null;
    state.target={...pursuitFeet};
    const sx=pursuitFeet.x-start.x, sz=pursuitFeet.z-start.z;
    if(sx || sz)enemy.face=Math.atan2(sx,-sz);
    enemy.runtime.speed=0;
    if(state.webSearchRemaining>0 && scaledDeltaTime>0 && !enemy.runtime.pendingShot) {
      advanceNativeEnemySpeed(enemy.runtime,enemy.activeWeaponSettings ?? runtime.enemySettings,
        'walking',scaledDeltaTime);
      const elapsed=WEB_LAST_SEEN_SWEEP.seconds-state.webSearchRemaining;
      const preferredSide=state.webSearchPass%2===0
        ? state.webTacticalSide : -state.webTacticalSide;
      const side=elapsed<WEB_LAST_SEEN_SWEEP.seconds/2
        ? preferredSide : -preferredSide;
      const moved=tryWebStrafe(runtime,enemy,pursuitFeet,enemies,
        scaledDeltaTime*WEB_LAST_SEEN_SWEEP.speedFraction,{
          sideOverride:side,maxDistance:runtime.body.radius*WEB_LAST_SEEN_SWEEP.maxBodyRadii,
        });
      if(!moved)enemy.runtime.speed=0;
      state.webSearchRemaining=Math.max(0,state.webSearchRemaining-scaledDeltaTime);
      if(state.webSearchRemaining<=EPSILON) {
        state.webSearchComplete=true;
        state.webSearchPause=WEB_LAST_SEEN_SWEEP.pauseSeconds;
      }
    }
    return;
  }
  // The pushing actor's close-contact retreat must not cancel the shorter
  // approach ring. Everyone else retains the original Web retreat distance.
  const disengageDistance=weaponRole?.retreatFraction
    ? Math.min(stopDistance*weaponRole.retreatFraction,runtime.body.radius*15)
    : Math.min(stopDistance*(breaching
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
  // A pistol/machine-gunner who has already fired should not become a
  // stationary target for the entire reload. Use the REAL weapon cooldown
  // from GunAttack, not a second Web timer or fabricated reload event.
  // Near the next shot it holds position again for a readable firing window;
  // shot-locked, blind, blocked-muzzle and other weapon families are unchanged.
  const weaponSettings=enemy.activeWeaponSettings ?? runtime.enemySettings;
  // The explicit Web fallback owns weaponFamily='Pistol' but does not supply
  // a source-qualified `settings.family`; never silently disable its tactics.
  const activeFamily=enemy.activeWeaponSettings?.family ?? enemy.weaponFamily;
  const reloadScoot=stop && armed && state.canAttack && !enemy.runtime.pendingShot &&
    enemy.runtime.haveBeenSeen===true &&
    (activeFamily==='Pistol' || activeFamily==='MachineGun') &&
    Number.isFinite(weaponSettings.attackDelay) && weaponSettings.attackDelay>0 &&
    enemy.runtime.attackDelayRemaining>weaponSettings.attackDelay*WEB_RELOAD_SCOOT.beginDelayFraction &&
    enemy.runtime.attackDelayRemaining<=weaponSettings.attackDelay*WEB_RELOAD_SCOOT.endDelayFraction;
  const tacticalTime=enemy.clock-WEB_STRAFE.warmupSeconds;
  const tactical=stop && armed && (state.canAttack || needsFiringLane) &&
    !enemy.runtime.pendingShot && Number.isFinite(tacticalTime) && tacticalTime>=0 &&
    tacticalTime%WEB_STRAFE.cycleSeconds<
      (needsFiringLane ? WEB_STRAFE.peekSeconds : WEB_STRAFE.activeSeconds);
  const speed=advanceNativeEnemySpeed(enemy.runtime,enemy.activeWeaponSettings ?? runtime.enemySettings,
    (disengaging || tactical || reloadScoot) ? 'walking' : stop ? 'standing'
      : armed && !breaching ? 'walking' : 'running',scaledDeltaTime);
  const facing=state.visible || !state.webLastSeenFeet ? playerPosition : pursuitFeet;
  const dx=facing.x-start.x, dz=facing.z-start.z;
  if (dx || dz) enemy.face=Math.atan2(dx,-dz);
  if (stop) {
    if(disengaging && scaledDeltaTime>0) {
      if(!tryWebDisengage(runtime,enemy,playerFeet,enemies,scaledDeltaTime))enemy.runtime.speed=0;
    } else if((reloadScoot || tactical) && scaledDeltaTime>0 &&
        !tryWebStrafe(runtime,enemy,playerFeet,enemies,scaledDeltaTime,
          needsFiringLane ? {preferClearMuzzle:true,firingTarget:playerPosition}
             : reloadScoot ? {preferCover:true,firingTarget:playerPosition} : {}))
      enemy.runtime.speed=0;
    return;
  }
  if (scaledDeltaTime === 0) return;
  // A disarmed visible attacker can vary its APPROACH to the real player,
  // without changing the source-style melee event, the win count or hitboxes.
  // Outside this close-range weave, retain the existing routed pursuit.
  if (!armed && state.visible && !enemy.runtime.pendingShot &&
      playerDistance>stopDistance+runtime.body.radius*2 &&
      playerDistance<=runtime.body.radius*WEB_UNARMED_WEAVE.rangeBodyRadii &&
      tryWebUnarmedWeave(runtime,enemy,playerFeet,enemies,scaledDeltaTime))return;
  // When armed allies are pursuing together, seek opposite safe approach
  // lanes before resuming the normal stop-radius strafe / retreat behavior.
  // An unreachable offset is never substituted for the direct source route.
  const flankGoal=armed && state.visible &&
      playerDistance>stopDistance+runtime.body.radius*2
    ? webSquadApproachGoal(runtime,enemy,playerFeet,localSquads) : null;
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
  const localSquads=webLocalArmedSquads(runtime,enemies);
  const breachingLeaders=webSquadBreachingLeaders(runtime,localSquads,observingAllies);
  const fireTurns=webSquadFireTurns(runtime,enemies,observingAllies,playerPosition,scaledDeltaTime,localSquads);
  // Cover and crossfire may CHANGE as bodies move. Snapshot original feet so a
  // cached, previous-render muzzle can be translated to the new actor feet for
  // one conservative post-movement check. The true posed muzzle is still only
  // available in main's Late phase; this does not replace projectile collision.
  const originalFeet=new Map(enemies.map(enemy=>[enemy,position(enemy)]));
  for (const enemy of enemies) moveEnemy(runtime,enemy,input,observingAllies,fireTurns,localSquads,breachingLeaders);
  const anyoneMoved=enemies.some(enemy=>distance(position(enemy),originalFeet.get(enemy))>EPSILON);
  if (anyoneMoved) for (const enemy of enemies) {
    if (!participating(enemy) || !enemy.encounter?.canAttack || !enemy.muzzlePosition)continue;
    const before=originalFeet.get(enemy);
    const muzzle={
      x:enemy.muzzlePosition.x+enemy.x-before.x,
      y:enemy.muzzlePosition.y+enemy.y-before.y,
      z:enemy.muzzlePosition.z+enemy.z-before.z,
    };
    const eye={x:enemy.x,y:enemy.y+runtime.aimHeight,z:enemy.z};
    if(nativeSphereHit(runtime.sightCollision,eye,playerPosition,.2)!==null) {
      enemy.encounter.visible=false;
      enemy.encounter.canAttack=false;
      continue;
    }
    if(nativeSegmentHit(runtime.sightCollision,muzzle,playerPosition)!==null ||
        webLivingAllyIntersectsSegment(runtime,enemy,muzzle,playerPosition,enemies)) {
      enemy.encounter.canAttack=false;
      enemy.encounter.webAllyBlockingShot=
        webLivingAllyIntersectsSegment(runtime,enemy,muzzle,playerPosition,enemies);
    }
  }
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
