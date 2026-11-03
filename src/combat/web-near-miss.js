/**
 * FRAME//BREAK: Web-only clean-dodge contact geometry.
 * Award nothing for a miss until the bullet has actually passed the player's
 * closest-approach plane. This never alters projectile collisions/damage.
 */
const axes=['x','y','z'];
const finite=v=>v && axes.every(k=>Number.isFinite(v[k]));
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
export const WEB_DODGE_SCORE=50;

/**
 * A completed enemy bullet segment passes NEAR (but not through) the player.
 * The main loop MUST check collisions first and call this only for a bullet
 * without any hit. Thresholds are authored Web game-feel, not native values.
 */
export function detectWebCleanDodge(start,end,playerCenter,{
  innerRadius=0.8,outerRadius=1.65,
}={}){
  if(!finite(start)||!finite(end)||!finite(playerCenter)||
     !Number.isFinite(innerRadius)||!Number.isFinite(outerRadius)||
     innerRadius<0||outerRadius<=innerRadius)
    throw new TypeError('Finite sweep, player point and ascending radii required');
  const travel=sub(end,start);
  const travelSq=dot(travel,travel);
  if(travelSq<=1e-12)return null;
  const towards=sub(playerCenter,start);
  const fraction=dot(towards,travel)/travelSq;
  // Crossing the orthogonal plane of nearest approach happens exactly once,
  // regardless of browser FPS or in-game timescale.
  if(fraction<0||fraction>1)return null;
  const closest={
    x:start.x+travel.x*fraction,
    y:start.y+travel.y*fraction,
    z:start.z+travel.z*fraction,
  };
  const offset=sub(closest,playerCenter);
  const distance=Math.sqrt(dot(offset,offset));
  if(distance<innerRadius||distance>outerRadius)return null;
  return {point:closest,distance,fraction};
}
