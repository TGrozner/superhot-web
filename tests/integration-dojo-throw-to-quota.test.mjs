import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeEncounter, advanceNativeEncounter } from '../src/combat/native-encounter.js';
import { prepareNativeCollision } from '../src/scenes/native-collision.js';
import { pickupNativeItem, createNativeItems, throwNativeItem, advanceNativeItems, nativeItemDraws } from '../src/combat/native-items.js';
import { applyThrownEnemyContact, advanceEnemyReaction } from '../src/animation/enemy-reaction.js';
import { resolveDojoKillCompletion } from '../src/flow/dojo-combat-completion.js';
import { planDojoRestartIntent } from '../src/flow/dojo-round-intents.js';

// Cross-lane production API smoke, NOT a browser playthrough or native parity.
// Geometry, enemy contact, and the "isKiller" source classification are fabricated.
// The runtime functions and their ordering are real public app modules.
const source = Object.freeze({
  sceneBuildIndex: 10, serializedOwner: 'level10',
  scenePath: 'Assets/Scenes/SHRL/SHRL_Dojo2.unity',
});
const matrix = (x = 0, y = 0, z = 0) => [
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1,
];
const point = (x, y = 0, z = 0) => ({ x, y, z });
const eye = { x: 0, y: 1, z: 0, yaw: 0, pitch: 0 };
const forward = { x: 0, y: 0, z: -1 };

function syntheticScene() {
  return {
    source,
    navigation: {
      settings: { agentRadius: .4, agentHeight: 1.8, agentClimb: .4, agentSlope: 45 },
      portals: [],
      tiles: [{
        identity: { owner: 'synthetic', path_id: 1, tile: 0 },
        vertices: [[0, 0, 0], [-30, 0, 0], [-30, 0, 10], [0, 0, 10]],
        polygons: [{ index: 0, vertices: [0, 1, 2, 3], vertex_count: 4, edges: [] }],
      }],
    },
    anchors: { enemy: [{
      id: 'synthetic-dojo-door', worldMatrix: matrix(2, 0, 2),
      initialActiveInHierarchy: true,
      door: { redLightIntensityPickTime: 1 },
      source: { owner: 'level10', path_id: 103 },
    }] },
    gameplay: {
      spawner: {
        StartDelay: 0, enemiesOverhead: 10, MaxEnemiesOnScene: 3,
        Endless: false, DontSpawnNearPlayer: false, DontSpawnNearEnemies: false,
        safeDistance: 8, RemoveInactiveSpawnPoints: false, worldMatrix: matrix(0, 1, 0),
      },
      difficulty: {
        MinEnemiesToSpawn: 6, MaxEnemiesToSpawn: 7, MaxActiveEnemies: 4,
        EnemieSpawnRate: .4, WeaponAttackSpeedMultiplier: 1,
      },
      enemy: {
        WalkingSpeed: 2, RunningSpeed: 5, Acceleration: 10,
        StunTime: .75, AlwaysAlert: false, weaponSpeedMultiplier: 1,
        canSeeAfterGlowTime: .5, stopAimingTime: .05,
        MinimumDistanceToPlayer: 2, MeleeAttackDistance: 1, AimHeight: 1.6,
      },
      weapon: { attackDelay: .5, alertDelay: .5, projectileSpeed: 28 },
    },
  };
}

function input(enemies = [], overrides = {}) {
  return {
    scaledDeltaTime: 0, unscaledDeltaTime: 0,
    playerPosition: point(25, 1.6, 5), playerFeet: point(25, 0, 5),
    playerForward: point(0, 0, 1), enemies, ...overrides,
  };
}

function sourceShatterItem() {
  return {
    id: 'fixture-throw', name: 'fixture-throw', className: 'Fixture',
    source: 'synthetic', worldMatrix: matrix(0, 1, -1),
    models: [{ instanceId: 'fixture-root-mesh', localMatrix: matrix() }],
    colliderIds: ['fixture-collider'],
    shards: [
      { instanceId: 'fixture-shard-a', localMatrix: matrix(-.1), originalScale: 1 },
      { instanceId: 'fixture-shard-b', localMatrix: matrix(.1), originalScale: 1 },
    ],
    center: [0, 0, 0], radius: .1, handPosition: [.2, -.3, .5],
    containerPosition: [0, 0, 0], containerRotationEuler: [0, 0, 0],
    rotationSpeed: [0, 0, 0], throwSpeed: 28,
    rigidbody: { m_UseGravity: false },
    // Synthetic killer classification only, not a claim about Dojo objects.
    stickable: false, isKiller: true, isKnife: false, isKatana: false,
    headshotKiller: false, cutLimbs: false, unpickable: false,
  };
}

test('real Dojo API chain: source spawner -> live actor -> thrown hit -> death -> authored shards -> quota', () => {
  const collision = prepareNativeCollision([]);
  const encounter = createNativeEncounter(syntheticScene(), collision, () => 0);
  assert.equal(encounter.killTarget, 6);
  assert.equal(encounter.actors.size, 0);

  const warning = advanceNativeEncounter(encounter, input());
  assert.deepEqual(warning.map(event => event.type), ['door-warning']);
  assert.equal(warning[0].point.source.path_id, 103);
  const spawn = advanceNativeEncounter(encounter, input([], { unscaledDeltaTime: 2 }));
  const enemy = spawn.find(event => event.type === 'spawn')?.enemy;
  assert.ok(enemy, 'the source-shaped Web encounter must instantiate a live actor');
  assert.equal(enemy.alive, true);
  assert.equal(enemy.reaction.hasWeapon, true);
  assert.equal(enemy.encounter.canAttack, false, 'no authored muzzle pose yet');

  // Real encounter AI tick can move an actor but must not invent a muzzle.
  advanceEnemyReaction(enemy.reaction, .2);
  advanceNativeEncounter(encounter, input([enemy], { scaledDeltaTime: .2 }));
  assert.equal(enemy.encounter.canAttack, false);
  assert.ok(enemy.runtime.speed >= 0);

  const items = createNativeItems({ interactables: [sourceShatterItem()] }, collision, {
    setVisible: () => {}, gravity: point(0, 0, 0), random: () => .5,
  });
  const item = items.items[0];
  assert.equal(pickupNativeItem(items, item), true, 'E-equivalent pickup API');
  assert.equal(throwNativeItem(items, eye, forward), item, 'F-equivalent throw API');

  let admitted = 0;
  let killCallbacks = 0;
  let outcome;
  const effects = advanceNativeItems(items, .02, {
    // The hit is injected by an explicit fixture; it is NOT PhysX or a native replay.
    hitEnemy: () => ({
      t: .25, enemyId: enemy.id, partId: 'Torso',
      isBulletProof: false, isArmored: false, isMushroom: false,
      point: point(enemy.x, enemy.y + 1, enemy.z),
    }),
    applyContact: (thrown, hit) => {
      admitted++;
      assert.equal(hit.kind, 'enemy');
      assert.equal(hit.enemyId, enemy.id);
      outcome = applyThrownEnemyContact(enemy.reaction, thrown, {
        partId: hit.partId, isBulletProof: hit.isBulletProof,
        isArmored: hit.isArmored, isMushroom: hit.isMushroom,
        bossMind: false, thrownByPlayer: true, shouldKill: false,
        velocitySquared: thrown.velocity.x ** 2 + thrown.velocity.y ** 2 + thrown.velocity.z ** 2,
        direction: forward, relativeVelocity: thrown.velocity, position: hit.point,
      }, { damage: 1, stunTimeMultiplier: 1, superThrows: false });
      if (outcome.actions.some(action => action.type === 'kill')) {
        killCallbacks++;
        enemy.alive = false; // Same host callback boundary as main.killEnemy.
      }
      return outcome.shatter ? 'shatter' : outcome.attach ? 'attach' : 'stop';
    },
  });
  assert.equal(admitted, 1);
  assert.equal(killCallbacks, 1);
  assert.equal(outcome.outcome, 'killed');
  assert.equal(enemy.reaction.dead, true);
  assert.equal(enemy.reaction.hasWeapon, false);
  assert.equal(effects.length, 1);
  assert.equal(effects[0].type, 'shatter');
  assert.deepEqual(nativeItemDraws(items, eye).fragments.map(d => d.instanceId),
    ['fixture-shard-a', 'fixture-shard-b'],
    'only authored fixture pieces are drawable; no random replacement shards');

  // Only one of the six source-selected kills was observed: never show a Win.
  const flowArgs = { source, encounter, enemies: [enemy],
    activeScreen: 'playing', playerAlive: true, transitionPending: false };
  const progress = resolveDojoKillCompletion(flowArgs);
  assert.equal(encounter.killed, 1);
  assert.equal(progress.status, 'waiting-for-combat-quota');
  assert.equal(progress.progress.remaining, 5);
  assert.equal(progress.intent, null);
  assert.equal(resolveDojoKillCompletion(flowArgs).progress.killed, 1,
    'a repeated draw/receipt cannot score the same death twice');
  assert.equal(admitted, 1);

  // R/REJOUER here is a declarative Web intent, not a tested DOM/key action.
  const restart = planDojoRestartIntent({ source, activeScreen: 'dead' });
  assert.equal(restart.intent.mustRecreateEncounter, true);
  const fresh = createNativeEncounter(syntheticScene(), collision, () => 0);
  assert.equal(fresh.killed, 0);
  assert.equal(fresh.actors.size, 0);
  assert.equal(encounter.killed, 1, 'replay cannot silently reuse the old combat state');
});

test('paused item flight cannot fabricate a hit, death, fragment or victory', () => {
  const collision = prepareNativeCollision([]);
  const encounter = createNativeEncounter(syntheticScene(), collision, () => 0);
  const items = createNativeItems({ interactables: [sourceShatterItem()] }, collision, {
    setVisible: () => {}, gravity: point(0, 0, 0), random: () => .5,
  });
  const item = items.items[0];
  pickupNativeItem(items, item);
  throwNativeItem(items, eye, forward);
  let fakeHits = 0;
  assert.deepEqual(advanceNativeItems(items, 0, {
    hitEnemy: () => { fakeHits++; return { t: 0, enemyId: 'invented' }; },
    applyContact: () => { throw new Error('paused contact must not run'); },
  }), []);
  assert.equal(fakeHits, 0);
  assert.equal(items.fragments.length, 0);
  assert.equal(encounter.killed, 0);
  assert.equal(resolveDojoKillCompletion({
    source, encounter, enemies: [], activeScreen: 'playing',
    playerAlive: true, transitionPending: false,
  }).intent, null);
});
