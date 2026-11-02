import { scanNativeEventInterval } from './native-event-interval.js';

/** Evaluate one selected non-looping source clip, using the same raw clip time
 * as the pose sampler. State exit/interruption is explicit; no wall-clock hit
 * window, guessed duration, or inferred blended-event dispatch is introduced.
 */
export function evaluateNativeMeleeDamage(clip,clipTime,active=true) {
  if(typeof active!=='boolean' || !Number.isFinite(clipTime) || clipTime<0) throw new TypeError('explicit clip time and active state required');
  const result={meleeDamage:false,meleeWeaponDamage:false};
  if(!active) return result;
  if(!clip || !Array.isArray(clip.events)) throw new TypeError('source clip event table required');
  for(const event of scanNativeEventInterval(clip.events,-Number.EPSILON,clipTime)) {
    if(event.id==='MeleeDamageStart') result.meleeDamage=true;
    else if(event.id==='MeleeDamageEnd') result.meleeDamage=false;
    else if(event.id==='MeleeWeaponDamageStart') result.meleeWeaponDamage=true;
    else if(event.id==='MeleeWeaponDamageEnd') result.meleeWeaponDamage=false;
  }
  return result;
}

/** Discrete flags observed from Unity's actual controller event dispatch.
 * Use the same elapsed controller-sequence time as the pose sampler. Unlike
 * raw clip evaluation this retains native transition/event-weight decisions.
 * Interruption (death, stun, drop, replacement) must pass active=false.
 */
export function sampleNativeMeleeTimeline(sequence,elapsed,active=true) {
  if (typeof active!=='boolean' || !Number.isFinite(elapsed) || elapsed<0) {
    throw new TypeError('explicit sequence time and active state required');
  }
  const result={meleeDamage:false,meleeWeaponDamage:false,inPunchAnimation:false,
    inHitAnimation:false,inWeaponAttackAnimation:false};
  if (!active) return result;
  const timeline=sequence?.timeline;
  if (!Array.isArray(timeline) || timeline.length<2) throw new TypeError('captured controller timeline required');
  // A captured one-shot is not looped: replaying its final damage state would
  // fabricate a new attack. Locomotion looping belongs to the pose sampler.
  if (elapsed>timeline[timeline.length-1].time) return result;
  let low=0,high=timeline.length-1;
  while (low<high) {
    const middle=Math.ceil((low+high)/2);
    if (timeline[middle].time<=elapsed) low=middle;
    else high=middle-1;
  }
  const frame=timeline[low];
  if (frame.time>elapsed) return result;
  for (const key of Object.keys(result)) {
    if (typeof frame[key]!=='boolean') throw new TypeError('missing captured controller flag: '+key);
    result[key]=frame[key];
  }
  return result;
}
