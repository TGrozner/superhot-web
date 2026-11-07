import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeItems, nearestNativeItem, pickupNativeItem, throwNativeItem,
  advanceNativeItems, nativeItemDraws, getNativeItemPosition } from '../src/combat/native-items.js';
import { prepareNativeCollision } from '../src/scenes/native-collision.js';
import { advanceGunPickupShardRuntime } from '../src/vfx/gun-pickup-shatter.js';

// Synthetic affine fixtures, not original game meshes, prefab data or exported scenes.
const matrix = (x = 0, y = 0, z = 0) => [1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1];
const camera = { x: 0, y: 1, z: 0, yaw: 0, pitch: 0 };
const forward = { x: 0, y: 0, z: -1 };
const zero = { x: 0, y: 0, z: 0 };
const near = (a, b) => assert.ok(Math.abs(a-b) < 1e-7, `${a} != ${b}`);
const fixture = (id = 'item', overrides = {}) => ({
  id, name: id, className: 'Fixture', source: 'synthetic', worldMatrix: matrix(0, 1, -1),
  models: [{ instanceId: id+'-mesh', localMatrix: matrix() }], colliderIds: [id+'-box'],
  shards: [{ instanceId: id+'-left', localMatrix: matrix(-0.1), originalScale: 1 },
    { instanceId: id+'-right', localMatrix: matrix(0.1), originalScale: 1 }],
  center: [0,0,0], radius: 0.1, handPosition: [0.2,-0.3,0.5],
  containerPosition: [0,0,0], containerRotationEuler: [0,0,0], rotationSpeed: [0,0,0],
  throwSpeed: 28, rigidbody: { m_UseGravity: true }, stickable: false,
  isKiller: false, isKnife: false, isKatana: false, headshotKiller: false,
  cutLimbs: false, unpickable: false, shattersOnEnemyHit: true, ...overrides,
});
const box = (id, z, size = [2,2,0.02]) => ({ id, center: [0,0,0], size, worldMatrix: matrix(0,1,z) });
function setup(sources = [fixture()], boxes = [], options = {}) {
  const collision = prepareNativeCollision(boxes), visibility = [], toggles = [];
  const setEnabled = collision.setEnabled;
  collision.setEnabled = (id, enabled) => { toggles.push([id, enabled]); return setEnabled(id, enabled); };
  const runtime = createNativeItems({ interactables: sources }, collision,
    { setVisible: (...args) => visibility.push(args), gravity: zero, random: () => 0.5, ...options });
  return { runtime, collision, visibility, toggles, item: runtime.items[0] };
}
function launch(runtime, item = runtime.items[0]) {
  assert.equal(pickupNativeItem(runtime, item), true);
  assert.equal(throwNativeItem(runtime, camera, forward), item);
}

test('untransferred originals are not duplicated and source records remain untouched', () => {
  const source = fixture(), snapshot = structuredClone(source);
  const { runtime, item } = setup([source]);
  assert.deepEqual(nativeItemDraws(runtime, camera), { world: [], held: [], fragments: [] });
  launch(runtime, item);
  advanceNativeItems(runtime, 0.02);
  assert.deepEqual(source, snapshot);
  assert.equal(nativeItemDraws(runtime, camera).world[0].instanceId, 'item-mesh');
});

test('selection requires forward aim, center range and a clear line of sight', () => {
  const { runtime, item } = setup([fixture(), fixture('behind', { worldMatrix: matrix(0,1,0.5) }),
    fixture('side', { worldMatrix: matrix(0.7,1,-0.4) })]);
  assert.equal(nearestNativeItem(runtime, camera, forward), item);
  assert.equal(nearestNativeItem(runtime, camera, forward, 0.9), null);
  const blocked = setup([fixture()], [box('wall', -0.5)]);
  assert.equal(nearestNativeItem(blocked.runtime, camera, forward), null);
});

test('selection ignores only the candidate collider, not another blocking prop', () => {
  const self = setup([fixture()], [box('item-box', -1, [0.2,0.2,0.2])]);
  assert.equal(nearestNativeItem(self.runtime, camera, forward), self.item);
  const other = setup([fixture()], [box('other-item', -0.5, [0.2,0.2,0.2])]);
  assert.equal(nearestNativeItem(other.runtime, camera, forward), null);
});

test('unpickable, broken and held objects are excluded; closest aimed object wins', () => {
  const { runtime, item } = setup([fixture(), fixture('near', { worldMatrix: matrix(0,1,-0.5) }),
    fixture('forbidden', { worldMatrix: matrix(0,1,-0.2), unpickable: true })]);
  assert.equal(nearestNativeItem(runtime, camera, forward), runtime.items[1]);
  runtime.items[1].state = 'broken';
  assert.equal(nearestNativeItem(runtime, camera, forward), item);
  assert.equal(pickupNativeItem(runtime, runtime.items[2]), false);
  assert.equal(pickupNativeItem(runtime, item), true);
  assert.equal(nearestNativeItem(runtime, camera, forward), null);
  assert.equal(pickupNativeItem(runtime, item), false);
  assert.equal(pickupNativeItem(runtime, fixture('foreign')), false);
});

test('pickup hides every intact mesh and disables exact unique collider IDs once', () => {
  const source = fixture('item', { colliderIds: ['item-box','item-box','item-second'], models: [
    { instanceId: 'mesh-one', localMatrix: matrix() }, { instanceId: 'mesh-two', localMatrix: matrix(0.2) }] });
  const { runtime, item, collision, visibility, toggles } = setup([source],
    [box('item-box', -1), box('unrelated', -5)]);
  launch(runtime, item);
  advanceNativeItems(runtime, 0.01, { hitEnemy: () => ({ t: 0.5, point: { x:0,y:1,z:-0.2 }, enemyId: 'enemy' }),
    applyContact: () => 'attach' });
  assert.equal(pickupNativeItem(runtime, item), true);
  assert.deepEqual(visibility, [['mesh-one',false],['mesh-two',false]]);
  assert.deepEqual(toggles, [['item-box',false],['item-second',false]]);
  assert.equal(collision.boxes.find(b => b.collider.id === 'unrelated').enabled, true);
  assert.equal(nativeItemDraws(runtime, camera).held.length, 2);
});

test('held original geometry uses source hand placement and mirrored first-person basis', () => {
  const { runtime, item } = setup();
  pickupNativeItem(runtime, item);
  const draws = nativeItemDraws(runtime, camera);
  assert.equal(draws.world.length, 0);
  assert.equal(draws.held.length, 1);
  const m = draws.held[0].modelMatrix;
  near(m[0], -1); near(m[5], 1); near(m[10], -1);
  near(m[12], 0.2); near(m[13], 0.7); near(m[14], -0.5);
  assert.deepEqual(getNativeItemPosition(item), { x: 0.2, y: 0.7, z: -0.5 });
});

test('container position is H-conjugated, preserving source model-local offsets', () => {
  const { runtime, item } = setup([fixture('item', { handPosition: [0,0,0], containerPosition: [0.3,0.2,0.4],
    models: [{ instanceId: 'offset-mesh', localMatrix: matrix(0.1,0.2,0.3) }] })]);
  pickupNativeItem(runtime, item);
  const m = nativeItemDraws(runtime, camera).held[0].modelMatrix;
  near(m[12], 0.2); near(m[13], 1.4); near(m[14], -0.7);
});

test('container Euler rotations follow Unity ZXY rather than XYZ', () => {
  const { runtime, item } = setup([fixture('item', { handPosition: [0,0,0], containerRotationEuler: [90,90,0],
    models: [{ instanceId: 'offset-mesh', localMatrix: matrix(0,1,0) }] })]);
  pickupNativeItem(runtime, item);
  const m = nativeItemDraws(runtime, camera).held[0].modelMatrix;
  // Unity Ry(90)*Rx(90) sends +Y to +X; camera source right is browser +X.
  near(m[12], 1); near(m[13], 1); near(m[14], 0);
});

test('sampled held attachment replaces generic offsets without losing model-local TRS', () => {
  const local = [0.3,0,0,0, 0,0.4,0,0, 0,0,0.5,0, 0.1,0.2,0.3,1];
  const pose = [0,1,0,0, -1,0,0,0, 0,0,1,0, -0.2,-0.1,0.8,1];
  const source = fixture('blade', {
    worldMatrix: [2,0,0,0, 0,3,0,0, 0,0,4,0, 0,1,-1,1],
    handPosition: [20,-30,40], containerPosition: [5,6,7], containerRotationEuler: [10,20,30],
    heldPose: { localMatrix: pose }, models: [{ instanceId: 'blade-mesh', localMatrix: local }],
  });
  const snapshot = structuredClone(source);
  const { runtime, item } = setup([source]);
  pickupNativeItem(runtime, item);
  const m = nativeItemDraws(runtime, camera).held[0].modelMatrix;
  const expected = [0,0.3,0,0, 0.4,0,0,0, 0,0,-0.5,0, 0.4,1,-1.1,1];
  m.forEach((value, index) => near(value, expected[index]));
  assert.deepEqual(source, snapshot);
});

test('sampled held attachment follows camera yaw and pitch in the mirrored frame once', () => {
  const { runtime, item } = setup([fixture('blade', { heldPose: { localMatrix: matrix(-0.2,0.3,0.7) } })]);
  pickupNativeItem(runtime, item);
  const view = { x: 4, y: 5, z: 6, yaw: Math.PI / 2, pitch: Math.PI / 6 };
  const m = nativeItemDraws(runtime, view).held[0].modelMatrix;
  near(m[12], 4 - 0.3 / 2 + 0.7 * Math.sqrt(3) / 2);
  near(m[13], 5 + 0.3 * Math.sqrt(3) / 2 + 0.7 / 2);
  near(m[14], 6.2);
  // Looking again does not compound the previous camera/world transform.
  const straight = nativeItemDraws(runtime, camera).held[0].modelMatrix;
  near(straight[12], 0.2); near(straight[13], 1.3); near(straight[14], -0.7);
});

test('held-only attachment leaves the original throw transform and trajectory unchanged', () => {
  const source = fixture('blade', { models: [{ instanceId: 'blade-mesh', localMatrix: matrix(0.1,0.2,0.3) }] });
  const ordinary = setup([source]);
  const sampled = setup([{ ...source, heldPose: { localMatrix: matrix(12,34,56) } }]);
  for (const { runtime, item } of [ordinary, sampled]) {
    pickupNativeItem(runtime, item);
    nativeItemDraws(runtime, camera);
    throwNativeItem(runtime, camera, forward);
    advanceNativeItems(runtime, 0.1);
  }
  assert.deepEqual(sampled.item.worldMatrix, ordinary.item.worldMatrix);
  assert.deepEqual(sampled.item.velocity, ordinary.item.velocity);
  assert.deepEqual(nativeItemDraws(sampled.runtime, camera).world, nativeItemDraws(ordinary.runtime, camera).world);
});

test('declared held attachments must supply a finite affine matrix', () => {
  for (const heldPose of [null, {}, { localMatrix: matrix().slice(1) },
    { localMatrix: matrix().map((v, i) => i === 12 ? NaN : v) },
    { localMatrix: matrix().map((v, i) => i === 3 ? 1 : v) }]) {
    assert.throws(() => setup([fixture('blade', { heldPose })]), /finite affine16/);
  }
});

test('throw clears held state, uses exact source launch distance and per-item speed', () => {
  const { runtime, item } = setup([fixture('item', { throwSpeed: 11 })]);
  launch(runtime, item);
  assert.equal(runtime.held, null);
  near(getNativeItemPosition(item).z, -0.075);
  near(item.velocity.z, -11);
  advanceNativeItems(runtime, 0.1);
  near(getNativeItemPosition(item).z, -1.175);
  assert.equal(throwNativeItem(runtime, camera, forward), null);
});

test('spawn sweep cannot teleport the item past a thin wall', () => {
  const { runtime, item } = setup([fixture('item', { radius: 0.005 })], [box('wall', -0.04, [2,2,0.002])]);
  launch(runtime, item);
  assert.ok(getNativeItemPosition(item).z > -0.04);
  const events = advanceNativeItems(runtime, 0.01);
  assert.equal(events.length, 1);
  assert.equal(events[0].contact.collider.id, 'wall');
  assert.equal(item.state, 'broken');
});

test('flight sweeps cannot tunnel through walls even across a large time step', () => {
  const { runtime, item } = setup([fixture()], [box('wall', -0.8)]);
  launch(runtime, item);
  const events = advanceNativeItems(runtime, 1);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'shatter');
  assert.ok(getNativeItemPosition(item).z > -0.8);
  assert.equal(pickupNativeItem(runtime, item), false);
  assert.equal(nativeItemDraws(runtime, camera).world.length, 0);
});

test('enemy query behind the world contact cannot apply a reaction', () => {
  const { runtime, item } = setup([fixture()], [box('wall', -0.3)]);
  launch(runtime, item);
  const applied = [];
  const events = advanceNativeItems(runtime, 0.02, {
    hitEnemy: (object, start, end) => ({ t: 0.9, enemyId: 'behind-wall', point: end, partId: 'body' }),
    applyContact: (object, hit) => { applied.push(hit.kind); return 'shatter'; },
  });
  assert.deepEqual(applied, ['world']);
  assert.equal(events[0].contact.collider.id, 'wall');
});

test('nearest enemy contact runs reaction once and obeys the parent shatter outcome', () => {
  const { runtime, item } = setup();
  launch(runtime, item);
  let contacts = 0;
  const callbacks = {
    hitEnemy: (object, start, end) => ({ t: 0.25, enemyId: 'enemy', point: end, partId: 'arm' }),
    applyContact: (object, hit) => {
      contacts++;
      assert.equal(object, item); assert.equal(hit.enemyId, 'enemy'); assert.equal(hit.partId, 'arm');
      assert.equal(hit.kind, 'enemy'); assert.ok(object.velocity.z < 0);
      return 'shatter';
    },
  };
  assert.equal(advanceNativeItems(runtime, 0.01, callbacks)[0].type, 'shatter');
  advanceNativeItems(runtime, 0.2, callbacks);
  assert.equal(contacts, 1);
});

test('an enemy candidate without parent outcome never implies a kill or automatic shatter', () => {
  const { runtime, item } = setup();
  launch(runtime, item);
  const events = advanceNativeItems(runtime, 0.01,
    { hitEnemy: (object, start, end) => ({ t: 0.5, enemyId: 'enemy', point: end }) });
  assert.equal(events[0].type, 'stop');
  assert.equal(item.state, 'resting');
  assert.equal(runtime.fragments.length, 0);
});

test('sharp wall contacts stay recoverable without fabricated bounce or fragments', () => {
  const { runtime, item } = setup([fixture('item', { stickable: true, isKnife: true })], [box('wall', -0.8)]);
  launch(runtime, item);
  assert.equal(advanceNativeItems(runtime, 0.1)[0].type, 'attach');
  assert.equal(item.state, 'attached');
  assert.deepEqual(item.velocity, zero);
  assert.equal(nativeItemDraws(runtime, camera).fragments.length, 0);
  assert.equal(nearestNativeItem(runtime, camera, forward), item);
  assert.equal(pickupNativeItem(runtime, item), true);
  assert.equal(item.attachment, null);
});

test('enemy attachment may resolve a live pose; without it contact position stays explicit', () => {
  const { runtime, item } = setup([fixture('item', { stickable: true })]);
  launch(runtime, item);
  advanceNativeItems(runtime, 0.01, { hitEnemy: (object, start, end) => ({ t: 0.5, enemyId: 'enemy', point: end, partId: 'body' }),
    applyContact: () => ({ action: 'attach', attachment: { socket: 'body' } }) });
  const position = getNativeItemPosition(item);
  advanceNativeItems(runtime, 0.1);
  assert.deepEqual(getNativeItemPosition(item), position);
  advanceNativeItems(runtime, 0.1, { resolveAttachment: (object, attachment) => {
    assert.equal(attachment.enemyId, 'enemy'); assert.equal(attachment.socket, 'body');
    return matrix(2,3,4);
  } });
  assert.deepEqual(getNativeItemPosition(item), { x:2,y:3,z:4 });
});

test('authored shards preserve contact matrices and source impulses, then disappear boundedly', () => {
  const { runtime, item } = setup();
  launch(runtime, item);
  advanceNativeItems(runtime, 0.01, { hitEnemy: (object, start, end) => ({ t: 0.5, enemyId: 'enemy', point: end }),
    applyContact: () => 'shatter' });
  const center = getNativeItemPosition(item), draws = nativeItemDraws(runtime, camera);
  assert.deepEqual(draws.fragments.map(d => d.instanceId), ['item-left','item-right']);
  near(draws.fragments[0].modelMatrix[12], center.x+0.1);
  near(draws.fragments[1].modelMatrix[12], center.x-0.1);
  near(runtime.fragments[0].shards[0].velocity.z, -2.8);
  assert.ok(lengthOf(runtime.fragments[0].shards[0].torque) <= 1);
  near(runtime.fragments[0].shards[0].delay, 1);
  advanceNativeItems(runtime, 4);
  advanceNativeItems(runtime, 0.01);
  assert.equal(runtime.fragments.length, 0);
  assert.equal(nativeItemDraws(runtime, camera).fragments.length, 0);
});
const lengthOf = v => Math.hypot(v.x,v.y,v.z);

test('missing authored shards never produce random substitute debris', () => {
  const { runtime, item } = setup([fixture('item', { shards: [] })], [box('wall', -0.8)]);
  launch(runtime, item);
  advanceNativeItems(runtime, 0.1);
  assert.equal(item.state, 'broken');
  assert.deepEqual(nativeItemDraws(runtime, camera).fragments, []);
});

test('paused time freezes flight, contacts and fragments', () => {
  const { runtime, item } = setup();
  launch(runtime, item);
  const position = getNativeItemPosition(item);
  const events = advanceNativeItems(runtime, 0, { hitEnemy: () => assert.fail('paused query') });
  assert.deepEqual(events, []);
  assert.deepEqual(getNativeItemPosition(item), position);
  assert.throws(() => advanceNativeItems(runtime, -1), /nonnegative/);
  assert.throws(() => advanceNativeItems(runtime, NaN), /finite/);
});

test('ballistics use supplied gravity unless source rigidbody disables it', () => {
  const a = setup([fixture()], [], { gravity: { x:0,y:-4,z:0 } });
  launch(a.runtime, a.item); advanceNativeItems(a.runtime, 0.5);
  near(getNativeItemPosition(a.item).y, 0.5); near(a.item.velocity.y, -2);
  const b = setup([fixture('item', { rigidbody: { m_UseGravity: false } })], [], { gravity: { x:0,y:-4,z:0 } });
  launch(b.runtime, b.item); advanceNativeItems(b.runtime, 0.5);
  near(getNativeItemPosition(b.item).y, 1); near(b.item.velocity.y, 0);
});

test('malformed source identities and invalid contact fractions cannot silently enter runtime', () => {
  assert.throws(() => setup([fixture(),fixture()]), /unique/);
  assert.throws(() => setup([fixture('item', { throwSpeed: NaN })]), /throwSpeed/);
  const { runtime, item } = setup(); launch(runtime, item);
  assert.throws(() => advanceNativeItems(runtime, 0.01, { hitEnemy: () => ({ t: 2 }) }), /\[0,1\]/);
});

test('paused fragment clocks retain exactly the same authored transforms and visibility', () => {
  const { runtime, item } = setup();
  launch(runtime, item);
  advanceNativeItems(runtime, 0.01, {
    hitEnemy: (object, start, end) => ({ t: 0.5, enemyId: 'enemy', point: end }),
    applyContact: () => 'shatter',
  });
  advanceNativeItems(runtime, 0.1);
  const before = structuredClone(nativeItemDraws(runtime, camera).fragments);
  advanceNativeItems(runtime, 0);
  assert.deepEqual(nativeItemDraws(runtime, camera).fragments, before);
});

test('spinning off-center meshes keep their swept bounds center rather than orbiting it', () => {
  const { runtime, item } = setup([fixture('item', {
    center: [0.2,0,0], rotationSpeed: [0,90,0],
  })]);
  launch(runtime, item);
  const start = getNativeItemPosition(item);
  advanceNativeItems(runtime, 0.1);
  const end = getNativeItemPosition(item);
  near(end.x, start.x); near(end.y, start.y); near(end.z, start.z-2.8);
  assert.ok(Math.abs(item.worldMatrix[2]) > 0);
});


test('Dojo shatter binds source mesh-local geometry to optional collision physics without changing fallback', () => {
  const source=fixture('authored', {shards:[{instanceId:'shard-a',localMatrix:matrix(.1,0,0),originalScale:1}]});
  const collision=prepareNativeCollision([box('floor',-1,[8,1,.4])]);
  const material={bounciness:.2,dynamicFriction:1,bounceThreshold:2};
  const scene={interactables:[source],gameplay:{deathPhysics:{fixedDelta:1/60,material}}};
  const getBounds=id=>{
    assert.equal(id,'shard-a');
    return {center:[0,0,0],radius:.15};
  };
  const runtime=createNativeItems(scene,collision,{
    setVisible:()=>{},getBounds,gravity:{x:0,y:-9.81,z:0},random:()=>.5,
  });
  const item=runtime.items[0];
  launch(runtime,item);
  const events=advanceNativeItems(runtime,.05,{
    hitEnemy:()=>({t:.1,point:{x:0,y:1,z:-.8},enemyId:'target'}),
    applyContact:()=> 'shatter',
  });
  assert.equal(events[0].type,'shatter');
  assert.equal(runtime.fragments.length,1);
  const group=runtime.fragments[0];
  assert.equal(group.physics,'source-impulse-static-sphere-contacts-not-PhysX');
  assert.ok(group.shards[0].collisionRadius>=.15);
  const frame=advanceGunPickupShardRuntime(group,.05);
  assert.ok(Array.isArray(frame[0].contacts));
  assert.ok(frame[0].position && Number.isFinite(frame[0].position.y));
  assert.throws(()=>createNativeItems(scene,collision,{setVisible:()=>{},gravity:zero}),
    /geometry bounds provider/);
});

test('J2 Web air catch: E can recapture a flying thrown weapon under the real aim/LOS gates', () => {
  // Web-original arcade mechanic: no MCD native mid-air catch claim.
  const fight = setup();
  const { runtime, item } = fight;
  launch(runtime, item);
  const events = advanceNativeItems(runtime, 0.03);
  assert.deepEqual(events, []);
  assert.equal(item.state, 'flying');
  assert.ok(getNativeItemPosition(item).z < -0.8,
    'the existing swept item motion, not a synthetic pickup proxy, is targeted');
  assert.equal(nearestNativeItem(runtime, camera, forward), item,
    'the actual E query selects an airborne item intersecting the camera ray');
  assert.equal(pickupNativeItem(runtime, item), true);
  assert.equal(runtime.held, item);
  assert.equal(item.state, 'held');
  assert.deepEqual(item.velocity, zero,
    'a caught weapon must not keep an invisible in-flight velocity');
  assert.deepEqual(advanceNativeItems(runtime, 0.5), [],
    'catching cancels further world/enemy contact until the next throw');
  assert.equal(nearestNativeItem(runtime, camera, forward), null,
    'the held gun cannot be duplicated by another E input');
  assert.equal(nativeItemDraws(runtime, camera).held.length, 1,
    'the original model moves to the already-wired held render path');
  assert.equal(throwNativeItem(runtime, camera, forward), item,
    'the recaptured gun can be thrown again through the existing F action');
  assert.equal(item.state, 'flying');

  const covered = setup([fixture()], [box('divider', -0.5)]);
  launch(covered.runtime);
  covered.item.worldMatrix[14] = -1;
  assert.equal(nearestNativeItem(covered.runtime, camera, forward), null,
    'a catch cannot reach a flying weapon through a solid wall');
  covered.item.worldMatrix[14] = -0.25;
  covered.item.pendingContact = { kind: 'world' };
  assert.equal(nearestNativeItem(covered.runtime, camera, forward), null,
    'a collision already committed by the swept throw cannot be stolen');
  covered.item.pendingContact = null;
  covered.item.unpickable = true;
  assert.equal(nearestNativeItem(covered.runtime, camera, forward), null,
    'native unpickable restrictions remain authoritative in flight');
});

test('J2 Web crowded catch: reticle-centered flying weapon beats closer floor loot, not a grazing flyby', () => {
  // Synthetic weapons, Web-only UI/game-feel choice; no MCD selection claim.
  for (const reversed of [false, true]) {
    const air = fixture('airborne');
    const floor = fixture('floor', { worldMatrix: matrix(0,1,-0.35) });
    const { runtime } = setup(reversed ? [floor, air] : [air, floor]);
    const flying = runtime.items.find(item => item.id === 'airborne');
    const ground = runtime.items.find(item => item.id === 'floor');
    assert.equal(nearestNativeItem(runtime, camera, forward), ground,
      'before the throw, ordinary nearest-on-ray pickup remains unchanged');
    launch(runtime, flying);
    advanceNativeItems(runtime, 0.04);
    assert.equal(flying.state, 'flying');
    assert.ok(getNativeItemPosition(flying).z < -1);
    assert.equal(nearestNativeItem(runtime, camera, forward), flying,
      'a centered in-flight catch wins despite nearer available floor loot');

    // A body-radius grazing ray is not intentional reticle focus: keep the
    // nearer static pickup instead of magnetically stealing the flying gun.
    flying.worldMatrix[12] = 0.095;
    flying.worldMatrix[14] = -0.55;
    assert.equal(nearestNativeItem(runtime, camera, forward), ground);
    flying.worldMatrix[12] = 0;
    assert.equal(nearestNativeItem(runtime, camera, forward), flying);
    assert.equal(pickupNativeItem(runtime, flying), true);
    assert.equal(runtime.held, flying,
      'existing E -> held transition applies only to the chosen physical item');
  }
});
