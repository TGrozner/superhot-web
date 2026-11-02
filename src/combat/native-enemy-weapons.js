// MCD PejAiIniter.TryRandomizeWeapon/CanSpawnWithWeapon/ChooseAIArchetype.
// Selection occurs at actual factory activation, not at door-warning time.
const cappedFamilies = new Set(['Shotgun','MachineGun','Katana','Pistol','SniperRifle','MeleeWeapon','Melee']);
const roll = random => {
  const value=random();
  if (!Number.isFinite(value)||value<0||value>=1) throw new TypeError('random must return [0,1)');
  return value;
};

export function selectNativeEnemyWeapon(difficulty, weapons, enemies, random=Math.random, {disableSnipers=false}={}) {
  const choices=[];
  let total=0;
  for (const family of Object.keys(weapons)) {
    let weight=difficulty[family+'Enemies'];
    if (!Number.isFinite(weight)||weight<0) throw new TypeError('source difficulty weight required: '+family);
    if (disableSnipers && family==='SniperRifle') weight=0;
    if (cappedFamilies.has(family)) {
      const cap=difficulty['MaxActive'+family+'Enemies'];
      if (!Number.isInteger(cap)) throw new TypeError('source family cap required: '+family);
      const count=enemies.filter(enemy=>enemy.alive && !enemy.reaction?.dead &&
        (enemy.reaction?.hasWeapon===false ? 'Melee' : enemy.weaponFamily)===family).length;
      // Native code tests equality, not >=. Preserve its all-capped Melee fallback.
      if (count===cap) weight=0;
    }
    choices.push([family,weight]); total+=weight;
  }
  for (const [key,weight] of Object.entries(difficulty)) {
    if (key.endsWith('Enemies') && !key.startsWith('Max') && weight>0) {
      const family=key.slice(0,-7);
      if (!['Kamper','MeleeBrawler'].includes(family) && !weapons[family]) {
        throw new TypeError('missing source enemy weapon family: '+family);
      }
    }
  }
  if (!weapons.Melee) throw new TypeError('source Melee fallback required');
  if (total===0) return 'Melee';
  let selected=roll(random)*total;
  for (const [family,weight] of choices) {
    selected-=weight;
    if (selected<0) return family;
  }
  throw new RangeError('invalid weighted weapon distribution');
}

export function selectNativeEnemyArchetype(family,difficulty,campingPointsAvailable,random=Math.random) {
  // CheckProbability draws an integer from the inclusive range 0..100.
  if (family==='Melee' || family==='Knife') {
    return Math.floor(roll(random)*101)<difficulty.MeleeBrawlerEnemies ? 'OffensiveBrawler' : 'Offensive';
  }
  if (['Pistol','Shotgun','MachineGun','Magnum','CombatShotgun'].includes(family)) {
    return campingPointsAvailable && Math.floor(roll(random)*101)<difficulty.KamperEnemies ? 'KamperOffensive' : 'Offensive';
  }
  return family==='Uzi' ? 'Uzi' : 'Offensive';
}
