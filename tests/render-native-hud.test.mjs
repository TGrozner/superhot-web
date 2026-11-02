import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeHud} from '../src/render/native-hud.js';

// Small DOM test double: no commercial pixels or browser dependency.
function element() {
  const classes = new Set(), attributes = new Map();
  return {
    clientWidth: 1100, children: [],
    classList: {toggle(name, on) { if (on) classes.add(name); else classes.delete(name); }, contains: name => classes.has(name)},
    style: {removeProperty(name) { delete this[name.replace(/-([a-z])/g, (_, c) => c.toUpperCase())]; }},
    ownerDocument: {createElement: element},
    getAttribute: name => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, String(value)),
    removeAttribute: name => attributes.delete(name),
    append(child) { this.children.push(child); },
    replaceChildren() { this.children = []; },
  };
}
const kinds = ['none', 'gun', 'katana', 'takedown', 'hand', 'katanaFly', 'shurikenRecall', 'melee', 'bossGhost'];
function packet() {
  return {crosshairs: Object.fromEntries(kinds.map((kind, i) => [kind, {textureId: `sceneHud_${String(i).padStart(3, '0')}`, scale: 1}])),
    heartTextureId: 'sceneHud_009', punchTime: .4, punchScale: 2, initialHealthOpacity: 0};
}
function setup() {
  const root = element(), crosshair = element(), health = element();
  health.setAttribute('aria-label', 'Vie restante');
  const hud = createNativeHud(root, crosshair, health);
  hud.configure(packet()); hud.setActive(true);
  const frame = {dt: 0, timeScale: .005, kind: 'none', hp: 2, capacity: 3, cooldown: 0, attackDelay: 1, visible: true};
  return {root, crosshair, health, hud, frame};
}

test('all nine source types use their private mask and aspect-independent pixel size', () => {
  const {hud, crosshair, root, frame} = setup();
  for (const [i, kind] of kinds.entries()) {
    hud.update({...frame, kind, dt: 1});
    assert.equal(crosshair.style.maskImage, `url("/local-assets/sceneHud_${String(i).padStart(3, '0')}")`);
    assert.equal(crosshair.style.width, '50px');
    assert.equal(crosshair.style.height, '50px');
  }
  root.clientWidth = 550;
  hud.update({...frame, dt: 1});
  assert.equal(crosshair.style.width, '25px');
});

test('type change punch follows unscaled ease-in cubic and supports an explicit repeated punch', () => {
  const {hud, crosshair, frame} = setup();
  hud.update({...frame, kind: 'hand'});
  assert.equal(crosshair.style.width, '100px');
  hud.update({...frame, kind: 'hand', dt: .2, timeScale: 0});
  assert.equal(crosshair.style.width, '93.75px');
  hud.update({...frame, kind: 'hand', dt: .2});
  assert.equal(crosshair.style.width, '50px');
  hud.update({...frame, kind: 'hand', forcePunch: true});
  assert.equal(crosshair.style.width, '100px');
  hud.update({...frame, kind: 'none'});
  assert.equal(crosshair.style.width, '50px');
});

test('gun world cooldown shrinks and rotates, then punches on readiness with the real clock', () => {
  const {hud, crosshair, frame} = setup();
  hud.update({...frame, kind: 'gun', cooldown: .5});
  assert.equal(crosshair.style.width, '37.5px');
  assert.equal(crosshair.style.transform, 'translate(-50%,-50%) rotate(45deg)');
  hud.update({...frame, kind: 'gun', cooldown: .5, dt: .2, timeScale: 0});
  assert.equal(crosshair.style.transform, 'translate(-50%,-50%) rotate(45deg)');
  hud.update({...frame, kind: 'gun'});
  assert.equal(crosshair.style.width, '100px');
  assert.equal(crosshair.style.transform, 'translate(-50%,-50%) rotate(0deg)');
  hud.update({...frame, kind: 'gun', dt: .4});
  assert.equal(crosshair.style.width, '50px');
  hud.update({...frame, kind: 'gun', cooldown: 1});
  hud.update({...frame, kind: 'none'});
  assert.equal(crosshair.style.width, '50px');
});

test('heart atlas shows full and empty halves, accessible count and no per-frame replacement', () => {
  const {hud, health, frame} = setup();
  hud.update(frame);
  const first = health.children[0];
  assert.equal(health.children.length, 3);
  assert.equal(health.getAttribute('role'), 'img');
  assert.equal(health.getAttribute('aria-label'), 'Vie : 2 / 3');
  assert.equal(first.getAttribute('aria-hidden'), 'true');
  assert.equal(first.style.backgroundImage, 'url("/local-assets/sceneHud_009")');
  assert.equal(first.style.backgroundPosition, 'left center');
  assert.equal(health.children[2].style.backgroundPosition, 'right center');
  hud.update({...frame, hp: 1});
  assert.equal(health.children[0], first);
  assert.equal(health.children[1].style.backgroundPosition, 'right center');
  assert.equal(health.getAttribute('aria-label'), 'Vie : 1 / 3');
  hud.update({...frame, hp: 1, capacity: 1});
  assert.equal(health.children.length, 1);
});

test('health starts at source opacity and reverses a two-second real-time fade on movement transitions', () => {
  const {hud, health, frame} = setup();
  hud.update({...frame, dt: 5});
  assert.equal(health.style.opacity, '0');
  hud.update({...frame, timeScale: 1});
  hud.update({...frame, dt: 1, timeScale: .01});
  assert.equal(health.style.opacity, '0.5');
  hud.update({...frame, dt: .5, timeScale: .011});
  assert.equal(health.style.opacity, '0.25');
  hud.update({...frame, dt: 2});
  assert.equal(health.style.opacity, '1');
  hud.update({...frame, visible: false});
  assert.equal(health.style.opacity, '0');
  hud.update(frame);
  assert.equal(health.style.opacity, '1');
});

test('reset/reconfigure and deactivation clear clocks, masks, glyphs and source-only accessibility', () => {
  const {hud, health, crosshair, root, frame} = setup();
  hud.update({...frame, kind: 'gun', cooldown: .5});
  hud.reset();
  hud.update({...frame, kind: 'gun'});
  assert.equal(crosshair.style.width, '50px');
  hud.configure({...packet(), initialHealthOpacity: .75});
  hud.update(frame);
  assert.equal(health.style.opacity, '0.75');
  hud.setActive(false);
  assert.equal(root.classList.contains('native-hud'), false);
  assert.equal(crosshair.classList.contains('native-crosshair'), false);
  assert.equal(crosshair.style.maskImage, undefined);
  assert.equal(crosshair.style.transform, undefined);
  assert.equal(health.children.length, 0);
  assert.equal(health.getAttribute('aria-label'), 'Vie restante');
  assert.equal(health.getAttribute('role'), null);
  hud.setActive(true); hud.update(frame);
  assert.equal(health.children.length, 3);
});

test('invalid packets and frame values fail without replacing the configured source', () => {
  const {hud, frame} = setup();
  assert.throws(() => hud.configure({}), /source HUD/);
  const missing = packet(); delete missing.crosshairs.hand;
  assert.throws(() => hud.configure(missing), /source HUD/);
  assert.throws(() => hud.configure({...packet(), heartTextureId: '../private'}), /source HUD/);
  assert.throws(() => hud.update({...frame, kind: 'unknown'}), /unavailable/);
  assert.throws(() => hud.update({...frame, dt: -1}), /clocks/);
  assert.throws(() => hud.update({...frame, hp: 4}), /clocks/);
  hud.update(frame);
});
