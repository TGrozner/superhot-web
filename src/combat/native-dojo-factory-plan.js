import { selectNativeEnemyWeapon, selectNativeEnemyArchetype } from './native-enemy-weapons.js';
import { createNativeEnemyState } from './native-enemy-runtime.js';

const validId = value => typeof value === 'string' && value.length > 0 ||
  Number.isSafeInteger(value) && value >= 0;

const blocked = reason => ({ status: 'blocked', reason });

/**
 * @typedef {{gameObjectId:string|number, parentGameObjectId:string|number|null}} DojoHierarchyNode
 * @typedef {{factoryId:string|number, gameObjectId:string|number, weaponSelector:string,
 *   aiArchetypeSelector:string, enabled?:boolean, activeInHierarchy?:boolean}} DojoFactory
 */

/**
 * Resolve the actual factories beneath a spawner transform. The native spawner
 * uses GetComponentsInChildren(includeInactive: true); an inactive GameObject
 * does not exclude its factory. A factory elsewhere in the scene does.
 *
 * Requires an EXHAUSTIVE set of candidate factories and complete parent chains,
 * supplied from a source-qualified scene graph. A truncated ancestry fails
 * closed rather than introducing an arbitrary Web factory into the draw.
 *
 * Private evidence: MCD build 20299547, serialized level10 ancestry (#173)
 * and factory components (#166/#167). No source objects are embedded here.
 *
 * @param {{spawnerGameObjectId:string|number, nodes:DojoHierarchyNode[],
 *   factories:DojoFactory[]}} source
 * @returns {{status:'qualified'|'blocked',templates:DojoFactory[],
 *   excludedFactoryIds:(string|number)[],reason?:string}}
 */
export function collectNativeDojoSpawnerFactories(source) {
  if (!validId(source?.spawnerGameObjectId) ||
      !Array.isArray(source?.nodes) || !Array.isArray(source?.factories)) {
    throw new TypeError('source spawner id, hierarchy and factories required');
  }
  const parents = new Map();
  for (const node of source.nodes) {
    if (!validId(node?.gameObjectId) ||
        node.parentGameObjectId !== null && !validId(node.parentGameObjectId) ||
        parents.has(node.gameObjectId)) {
      throw new TypeError('unique source hierarchy ids and explicit parent required');
    }
    parents.set(node.gameObjectId, node.parentGameObjectId);
  }
  if (!parents.has(source.spawnerGameObjectId)) {
    return { ...blocked('spawner-hierarchy-missing'), templates: [], excludedFactoryIds: [] };
  }
  const templates = [];
  const excludedFactoryIds = [];
  const seen = new Set();
  for (const factory of source.factories) {
    if (!validId(factory?.factoryId) || !validId(factory?.gameObjectId) ||
        seen.has(factory.factoryId)) {
      throw new TypeError('unique source factory id and GameObject id required');
    }
    seen.add(factory.factoryId);
    let current = factory.gameObjectId;
    const visited = new Set();
    while (current !== source.spawnerGameObjectId) {
      if (visited.has(current)) throw new TypeError('source transform cycle');
      visited.add(current);
      if (!parents.has(current)) {
        return { ...blocked('factory-ancestry-incomplete'), templates: [], excludedFactoryIds: [] };
      }
      current = parents.get(current);
      if (current === null) break;
    }
    if (current === source.spawnerGameObjectId) {
      // Do not filter on activeInHierarchy or enabled: GetComponentsInChildren
      // with includeInactive includes the serialized inactive factory child.
      templates.push(Object.freeze({ ...factory }));
    } else {
      excludedFactoryIds.push(factory.factoryId);
    }
  }
  if (!templates.length) {
    return { ...blocked('no-qualified-spawner-factory'), templates: [], excludedFactoryIds };
  }
  return { status: 'qualified', templates, excludedFactoryIds };
}

/**
 * @typedef {{status:'qualified', factoryId:string|number, family:string, archetype:string,
 *   weaponSettings:object}|{status:'blocked',reason:string}} DojoEnemyActivation
 */

/**
 * Resolve ONE issued spawn order into a weapon family and settings.
 * The real factory initializer selects its family when the actor is created,
 * not when a door warning starts. All runtime difficulty weights, currently
 * available weapon prefabs, and per-family settings are caller evidence.
 * No serialized WeaponSelector integer is ever silently treated as a family.
 *
 * Private evidence: #168 (factory initializer overrides), #178/#179/#180
 * (PejAiIniter.Apply, WeaponSelector enum, TryRandomizeWeapon). Web-only
 * synthetic tests cannot establish the active Dojo preset.
 *
 * @param {{template:DojoFactory, qualifiedTemplates:DojoFactory[],
 *   difficulty:object, availableWeapons:object, currentEnemies:object[],
 *   familySettings:object, baseSettings:object, campingPointsAvailable:boolean,
 *   random?:()=>number}} input
 * @returns {DojoEnemyActivation}
 */
export function planNativeDojoEnemyActivation(input) {
  const { template, qualifiedTemplates, difficulty, availableWeapons, currentEnemies,
    familySettings, baseSettings, campingPointsAvailable, random = Math.random } = input ?? {};
  // Consume precisely the enumerated template object passed by the spawner.
  // Reusing its id with a different selector must not launder an unqualified
  // weapon code into the live spawn.
  if (!Array.isArray(qualifiedTemplates) || !qualifiedTemplates.includes(template)) {
    return blocked('spawn-template-not-qualified');
  }
  if (!template || typeof template.weaponSelector !== 'string' ||
      typeof template.aiArchetypeSelector !== 'string') {
    return blocked('source-weapon-or-archetype-enum-unmapped');
  }
  if (!difficulty || !availableWeapons || !Array.isArray(currentEnemies) ||
      !familySettings || !baseSettings || typeof campingPointsAvailable !== 'boolean') {
    return blocked('active-difficulty-or-runtime-settings-missing');
  }
  if (template.weaponSelector === 'None') return blocked('source-factory-weapon-none');
  let family;
  if (template.weaponSelector === 'BasedOnDifficulty') {
    try {
      family = selectNativeEnemyWeapon(difficulty, availableWeapons, currentEnemies, random);
    } catch {
      return blocked('active-difficulty-weights-or-caps-unverified');
    }
  } else {
    // Fixed source selector; no unproven random-selector variants.
    if (!Object.hasOwn(availableWeapons, template.weaponSelector)) {
      return blocked('fixed-weapon-prefab-not-qualified');
    }
    family = template.weaponSelector;
  }
  if (!Object.hasOwn(familySettings, family)) {
    return blocked('selected-family-runtime-values-missing');
  }
  const weaponSettings = Object.freeze({ ...baseSettings, ...familySettings[family], family });
  try {
    createNativeEnemyState(weaponSettings);
  } catch {
    return blocked('selected-family-runtime-values-invalid');
  }
  let archetype = template.aiArchetypeSelector;
  if (archetype === 'BasedOnDifficulty') {
    if (!Number.isFinite(difficulty.KamperEnemies) ||
        !Number.isFinite(difficulty.MeleeBrawlerEnemies)) {
      return blocked('active-archetype-weights-unverified');
    }
    archetype = selectNativeEnemyArchetype(
      family, difficulty, campingPointsAvailable, random,
    );
  }
  return { status: 'qualified', factoryId: template.factoryId, family, archetype, weaponSettings };
}
