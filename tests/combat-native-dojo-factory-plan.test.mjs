import test from 'node:test';
import assert from 'node:assert/strict';
import { collectNativeDojoSpawnerFactories, planNativeDojoEnemyActivation } from '../src/combat/native-dojo-factory-plan.js';
import { createNativeSpawnerState, advanceNativeSpawner } from '../src/combat/native-spawner.js';
import { createNativeEnemyState, runNativeEnemyGunAttack } from '../src/combat/native-enemy-runtime.js';
import { nativeEnemyFireAttackRequests, nativeEnemyFireLateRequests } from '../src/combat/native-enemy-fire-phase.js';

const point = (x = 0, y = 0, z = 0) => ({ x, y, z });
const factoryInside = { factoryId: 'source-factory-in-spawner', gameObjectId: 'inactive-child',
  activeInHierarchy: false, enabled: true,
  weaponSelector: 'BasedOnDifficulty', aiArchetypeSelector: 'BasedOnDifficulty' };
const factoryOutside = { factoryId: 'source-factory-outside', gameObjectId: 'other-child',
  activeInHierarchy: false, enabled: true,
  weaponSelector: 'Pistol', aiArchetypeSelector: 'Offensive' };
const hierarchy = {
  spawnerGameObjectId: 'spawner',
  nodes: [
    { gameObjectId: 'root', parentGameObjectId: null },
    { gameObjectId: 'spawner', parentGameObjectId: 'root' },
    { gameObjectId: 'inactive-child', parentGameObjectId: 'spawner' },
    { gameObjectId: 'other-parent', parentGameObjectId: 'root' },
    { gameObjectId: 'other-child', parentGameObjectId: 'other-parent' },
  ],
  factories: [factoryOutside, factoryInside],
};
const difficulty = {
  PistolEnemies: 10, ShotgunEnemies: 5, MeleeEnemies: 1,
  MaxActivePistolEnemies: 1, MaxActiveShotgunEnemies: 1, MaxActiveMeleeEnemies: 1,
  KamperEnemies: 0, MeleeBrawlerEnemies: 0,
};
const baseSettings = {
  attackDelay: .1, alertDelay: .5, projectileSpeed: 28,
  weaponSpeedMultiplier: 1, difficultyWeaponSpeedMultiplier: 1,
  walkingSpeed: 2, runningSpeed: 5, acceleration: 10,
  afterglowDuration: .7, stopAimingTime: .05, alwaysAlert: false,
};
const activated = (template, qualifiedTemplates, currentEnemies = []) => planNativeDojoEnemyActivation({
  template, qualifiedTemplates, difficulty, currentEnemies,
  availableWeapons: { Pistol: {}, Shotgun: {}, Melee: {} },
  familySettings: { Pistol: {}, Shotgun: { pelletCount: 3 }, Melee: {} },
  baseSettings, campingPointsAvailable: false, random: () => 0,
});
const gunInput = {
  scaledDeltaTime: 0, unscaledDeltaTime: 0, targetSight: true,
  sightMode: 'all-directions', aimTargetInSight: true, aimReady: true,
  weaponInRightPosition: true, allowAttacking: true, canShot: true,
  active: true, animationTarget: point(10),
};

test('spawner child factory is included even when source GameObject is inactive; sibling factory is excluded', () => {
  const result = collectNativeDojoSpawnerFactories(hierarchy);
  assert.equal(result.status, 'qualified');
  assert.deepEqual(result.templates.map(template => template.factoryId), [factoryInside.factoryId]);
  assert.deepEqual(result.excludedFactoryIds, [factoryOutside.factoryId]);
  assert.equal(result.templates[0].activeInHierarchy, false);
});

test('truncated or cyclic ancestry cannot silently introduce a second spawner factory', () => {
  const missing = { ...hierarchy, nodes: hierarchy.nodes.filter(node => node.gameObjectId !== 'other-parent') };
  assert.deepEqual(collectNativeDojoSpawnerFactories(missing).templates, []);
  assert.equal(collectNativeDojoSpawnerFactories(missing).reason, 'factory-ancestry-incomplete');
  const cycle = { ...hierarchy, nodes: hierarchy.nodes.map(node =>
    node.gameObjectId === 'other-parent' ? { ...node, parentGameObjectId: 'other-child' } : node) };
  assert.throws(() => collectNativeDojoSpawnerFactories(cycle), /cycle/);
});

test('one Dojo spawner order chooses an actual child factory, resolves family at activation and emits deferred gun requests', () => {
  const resolved = collectNativeDojoSpawnerFactories(hierarchy);
  const spawnerSettings = { startDelay: 0, spawnDelay: 1, enemiesLeft: 7,
    maxEnemiesOnScene: 4, endless: false, safeDistance: 8,
    dontSpawnNearPlayer: true, dontSpawnNearEnemies: true,
    removeInactiveSpawnPoints: false };
  const state = createNativeSpawnerState(spawnerSettings, () => 0);
  const gate = { id: 'gate', position: point(8), active: true,
    door: { redLightIntensityPickTime: 0 } };
  const commands = advanceNativeSpawner(state, spawnerSettings, {
    scaledDeltaTime: 0, unscaledDeltaTime: 1,
    enabled: true, spawningAreaInitialized: true, currentEnemyCount: 0,
    templates: resolved.templates, getEligiblePoints: () => [gate],
  }, () => 0);
  assert.deepEqual(commands.map(command => command.type), ['door-warning', 'spawn']);
  const spawn = commands.find(command => command.type === 'spawn');
  assert.equal(spawn.template.factoryId, factoryInside.factoryId);
  const loadout = activated(spawn.template, resolved.templates);
  assert.equal(loadout.status, 'qualified');
  assert.equal(loadout.family, 'Pistol');
  assert.equal(loadout.archetype, 'Offensive');
  const enemyState = createNativeEnemyState(loadout.weaponSettings);
  enemyState.alertness = 1;
  enemyState.attackDelayRemaining = -1;
  const attack = runNativeEnemyGunAttack(enemyState, loadout.weaponSettings, gunInput, () => 0);
  assert.equal(attack.shot, true);
  assert.deepEqual(nativeEnemyFireAttackRequests(attack, loadout.family, point()).map(e => e.type),
    ['fire-sfx-request', 'enemy-alert-request']);
  assert.equal(nativeEnemyFireLateRequests(enemyState, loadout.weaponSettings, null).status,
    'awaiting-late-pose');
  const late = nativeEnemyFireLateRequests(enemyState, loadout.weaponSettings,
    { muzzlePosition: point(), weaponForward: point(1) }, () => 0);
  assert.equal(late.status, 'spawn-requests');
  assert.equal(late.requests.length, 1);
  assert.equal(late.requests[0].type, 'projectile-spawn-request');
});

test('live weapon cap switches the same source factory to shotgun with late pellet volley', () => {
  const resolved = collectNativeDojoSpawnerFactories(hierarchy);
  const livingPistol = { alive: true, weaponFamily: 'Pistol', reaction: { hasWeapon: true, dead: false } };
  const loadout = activated(resolved.templates[0], resolved.templates, [livingPistol]);
  assert.equal(loadout.status, 'qualified');
  assert.equal(loadout.family, 'Shotgun');
  const runtime = createNativeEnemyState(loadout.weaponSettings);
  runtime.alertness = 1;
  runtime.attackDelayRemaining = -1;
  const attack = runNativeEnemyGunAttack(runtime, loadout.weaponSettings, gunInput, () => 0);
  assert.equal(attack.shot, true);
  const late = nativeEnemyFireLateRequests(runtime, loadout.weaponSettings,
    { muzzlePosition: point(1), weaponForward: point(0, 0, 1) }, () => .5);
  assert.equal(late.status, 'spawn-requests');
  assert.equal(late.requests.length, 3);
});

test('incomplete runtime/enum data and unrelated templates cannot be treated as native selections', () => {
  const resolved = collectNativeDojoSpawnerFactories(hierarchy);
  assert.equal(activated(factoryOutside, resolved.templates).reason, 'spawn-template-not-qualified');
  const unknown = activated({ ...factoryInside, weaponSelector: 11 }, resolved.templates);
  assert.equal(unknown.reason, 'source-weapon-or-archetype-enum-unmapped');
  const missing = planNativeDojoEnemyActivation({
    template: resolved.templates[0], qualifiedTemplates: resolved.templates,
    difficulty: {}, availableWeapons: { Pistol: {}, Melee: {} },
    currentEnemies: [], familySettings: { Pistol: {} }, baseSettings,
    campingPointsAvailable: false, random: () => 0,
  });
  assert.equal(missing.reason, 'active-difficulty-weights-or-caps-unverified');
  const withoutPrefabSettings = planNativeDojoEnemyActivation({
    template: resolved.templates[0], qualifiedTemplates: resolved.templates,
    difficulty, availableWeapons: { Pistol: {}, Shotgun: {}, Melee: {} },
    currentEnemies: [], familySettings: {}, baseSettings,
    campingPointsAvailable: false, random: () => 0,
  });
  assert.equal(withoutPrefabSettings.reason, 'selected-family-runtime-values-missing');
});
