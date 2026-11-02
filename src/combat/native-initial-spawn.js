// LevelTimeline.Init/PrepareEnemiesWeapons and SpawningArea.GetRandomPoint.
const roll=random=>{
  const value=random();
  if (!Number.isFinite(value)||value<0||value>=1) throw new TypeError('random must return [0,1)');
  return value;
};
const length=v=>Math.hypot(v.x,v.y,v.z);
const unit=v=>{const n=length(v);return n ? {x:v.x/n,y:v.y/n,z:v.z/n} : {x:0,y:0,z:0};};

export function planNativeInitialSpawns(initial,difficulty,startId,random=Math.random) {
  const start=initial.starts.find(value=>value.id===startId);
  if (!start) throw new TypeError('chosen source SpawningPoint required');
  const count=difficulty.InitialEnemySpawn;
  if (!Number.isInteger(count)||count<0) throw new TypeError('source InitialEnemySpawn required');
  if (!Array.isArray(initial.areas) || !initial.weaponWeights) throw new TypeError('source areas and weapon weights required');
  if (initial.areas.length===0) return [];
  const weights={...initial.weaponWeights};
  for (const [family,weight] of Object.entries(weights)) {
    if (!Number.isFinite(weight)||weight<0) throw new TypeError('source initial weapon weight required: '+family);
  }
  weights.SniperRifle=0;
  const selected=[];
  for(let i=0;i<count;i++) {
    const total=Object.values(weights).reduce((sum,value)=>sum+value,0);
    if (!(total>0)) throw new RangeError('initial weapon distribution is empty');
    let choice=roll(random)*total, family;
    for(const [name,weight] of Object.entries(weights)) {
      choice-=weight;
      if(choice<0) { family=name;break; }
    }
    selected.push(family);
    if(!difficulty.IgnoreInitialSpawnRestrictions) {
      if(['Shotgun','MachineGun','Katana'].includes(family) ||
        (['Pistol','MeleeWeapon'].includes(family) && selected.filter(value=>value===family).length===2)) weights[family]=0;
    }
  }
  // SpawningPoint is the eye placement, not the player's feet. The cone uses
  // that exact placement; the cylinder is centered 1.6 units below it.
  const eye=start.position;
  const forward=unit(start.forward);
  const areas=initial.areas.filter(area=>{
    if(!area.active) return false;
    const direction=unit({x:area.center.x-eye.x,y:area.center.y-eye.y,z:area.center.z-eye.z});
    const adjusted={...forward,y:direction.y};
    const denominator=length(adjusted)*length(direction);
    const cosine=denominator ? (adjusted.x*direction.x+adjusted.y*direction.y+adjusted.z*direction.z)/denominator : 1;
    if(Math.acos(Math.max(-1,Math.min(1,cosine)))*180/Math.PI>start.angle) return false;
    return Math.abs(area.center.y-(start.position.y-1.6))<=start.SpawnDistanceVertical/2 &&
      Math.hypot(area.center.x-start.position.x,area.center.z-start.position.z)<=start.SpawnDistanceHorizontal/2;
  });
  const result=[];
  let prioritize=true;
  while(result.length<count && areas.length) {
    let index=prioritize ? areas.findIndex(area=>area.IgnoreRandomSpawning) : -1;
    if(index<0) {index=Math.floor(roll(random)*areas.length);prioritize=false;}
    const [area]=areas.splice(index,1), centers=area.spawningCenters.map(value=>({...value}));
    if(!centers.some(value=>value.isValid)) throw new RangeError('source spawning area has no valid center');
    let pointIndex=Math.floor(roll(random)*centers.length), valid=false;
    // Preserve the source's final reroll after finding a valid entry. Do not
    // silently replace it with a uniform draw from prefiltered valid centers.
    while(!valid) {
      if(centers[pointIndex].isValid) valid=true;
      else centers.splice(pointIndex,1);
      pointIndex=Math.floor(roll(random)*centers.length);
    }
    const position={...centers[pointIndex].position};
    const face=area.ForceRotationTowardsPlayer
      ? Math.atan2(start.position.x-position.x,-(start.position.z-position.z))
      : Math.PI+Math.floor(roll(random)*360)*Math.PI/180;
    result.push({id:area.id,feet:position,face,weapon:selected[result.length],source:area.source});
  }
  return result;
}
