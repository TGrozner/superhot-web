/**
 * FRAME//BREAK original screen-space dodge feedback.
 * The Web effect operates on unscaled real seconds and freezes when paused.
 * This is not a SUPERHOT MCD visual effect.
 */
export const WEB_DODGE_COOLDOWN=0.55;
const WEB_DODGE_VISIBLE_SECONDS=0.42;

export function createWebDodgeFeedback(){
  return {seconds:0,lastDodgeAt:-Infinity,distance:Infinity,total:0};
}
export function resetWebDodgeFeedback(feedback){
  feedback.seconds=0;
  feedback.lastDodgeAt=-Infinity;
  feedback.distance=Infinity;
  feedback.total=0;
}
/** Only call this after a collision-free enemy projectile crosses the player. */
export function recordWebDodge(feedback,{realTime,distance}){
  if(!Number.isFinite(realTime)||!Number.isFinite(distance)||distance<0)
    return false;
  if(realTime-feedback.lastDodgeAt<WEB_DODGE_COOLDOWN)return false;
  feedback.lastDodgeAt=realTime;
  feedback.distance=distance;
  feedback.seconds=WEB_DODGE_VISIBLE_SECONDS;
  feedback.total++;
  return true;
}
export function advanceWebDodgeFeedback(feedback,realDelta){
  if(!Number.isFinite(realDelta)||realDelta<0)
    throw new RangeError('Real delta must be nonnegative');
  feedback.seconds=Math.max(0,feedback.seconds-Math.min(realDelta,.05));
  return feedback.seconds/WEB_DODGE_VISIBLE_SECONDS;
}
