import { createRenderer } from './renderer.js';
import { createAudio } from './audio.js';
import { LEVELS, buildStaticGeometry, buildSyntheticManifest, drawGeneratedManifest, drawContainersBuild28Preview } from './levels.js';
import { CONTAINERS_BUILD28_DEMO_CAMERA } from './scenes/containers-build28.js';
import { planLocalMesh6Draws } from './scenes/containers-mesh6-local-plan.js';
import { parseLocalObjGroup, readLocalObjFile } from './preview/local-obj-group.js';
import { loadNativeEnemyObj } from './characters/native-enemy-local.js';
import { add3, cameraAxes, clamp, distance3, lerp, multiply3, normalize3, resolveWalk, segmentAabb, segmentSphere } from './math.js';

const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const screens = { menu: $('menu-screen'), paused: $('pause-screen'), dead: $('death-screen'), win: $('win-screen') };
const overlay = $('overlay');
const hud = $('hud');
const crosshair = $('crosshair');
const flash = $('damage-flash');
const shootFlash = $('shoot-flash');
const audio = createAudio();
let renderer;
try { renderer = createRenderer(canvas); }
catch (error) {
  $('error').textContent = `Impossible de lancer le moteur graphique : ${error.message}`;
  $('error').hidden = false;
  throw error;
}
const RED = '#d51e3b', RED_LIGHT = '#f43c53', RED_DARK = '#9c152e';
const BLACK = '#202932', METAL = '#394650', GUN = '#0d171e';
// Original local models are the default homepage; other views use the visible menu.
let syntheticManifestEnabled = false;
let syntheticManifest = null;
let containersPreviewEnabled = true;
let visualPreviewEnabled = true;
// Original bytes come from the loopback allowlist or user-selected files, never Git.
const localNativeMeshes = new Set();
let localPrivateTexture = null;
let privateTextureGeneration = 0;
let localNativeEnemy = null;
let nativeEnemyGeneration = 0;
let nativeEnemyStats = null;
let previewCameraY = CONTAINERS_BUILD28_DEMO_CAMERA.y;
// Inspection placement only: neither a native spawn nor an animated enemy.
const enemyInspectionMatrix = new Float32Array([
  1,0,0,0, 0,1,0,0, 0,0,1,0, 11,.97,24,1,
]);
function frameLocalEnemy() {
  state.camera = { x: 11, y: enemyInspectionMatrix[13] + 1.15, z: 28, yaw: 0, pitch: -.04 };
  previewCameraY = state.camera.y;
  state.hop = 0; state.verticalSpeed = 0;
}
const localMeshPreviewSpec = Object.freeze([
  { inputId: 'private-mesh6', slot: 'mesh6', groupIndex: 47,
    proxyId: 'cargo-22', center: [17.45, 2.575, 13.975] },
  { inputId: 'private-mesh7', slot: 'mesh7', groupIndex: 48,
    proxyId: 'cargo-upper', center: [17.475, 5.725, 15.8] },
]);
if (containersPreviewEnabled) {
  $('private-mesh-controls').hidden = false;
  // File controls must not trigger gameplay keyboard/mouse shortcuts.
  for (const eventName of ['keydown', 'mousedown']) {
    $('scene-controls').addEventListener(eventName, event => event.stopPropagation());
  }
  const enemyInput = $('private-enemy');
  const enemyStatus = $('private-enemy-status');
  const enemySummary = () => localNativeEnemy
    ? `${localNativeEnemy.variant === 'merged' ? 'EnemyMerged' : 'EnemyMergedHeadless'} original chargé · ${localNativeEnemy.triangles} triangles · pose statique, placement de visite, shader Web.`
    : 'Aucun modèle ennemi local chargé.';
  async function loadEnemyFile(file, variant) {
    const generation = ++nativeEnemyGeneration;
    if (!file) { enemyStatus.textContent = enemySummary(); return false; }
    enemyStatus.textContent = 'Vérification et chargement du modèle original…';
    try {
      const receipt = await loadNativeEnemyObj(file, { variant });
      if (generation !== nativeEnemyGeneration) return;
      renderer.acceptLocalEnemyReceipt(receipt);
      localNativeEnemy = Object.freeze({
        owner: receipt.owner, meshPathId: receipt.meshPathId,
        variant: receipt.variant, triangles: receipt.mesh.triangleCount,
      });
      $('frame-private-enemy').disabled = false;
      enemyStatus.textContent = enemySummary();
      if (containersPreviewEnabled) frameLocalEnemy();
      return true;
    } catch (error) {
      if (generation === nativeEnemyGeneration) {
        enemyStatus.textContent = `Échec du modèle : ${error.message} ${enemySummary()}`;
      }
    }
    return false;
  }
  enemyInput.addEventListener('change', () => loadEnemyFile(enemyInput.files?.[0], $('private-enemy-variant').value));
  $('frame-private-enemy').addEventListener('click', frameLocalEnemy);
  $('frame-containers').addEventListener('click', () => {
    state.camera = { ...CONTAINERS_BUILD28_DEMO_CAMERA };
    previewCameraY = state.camera.y;
    state.hop = 0; state.verticalSpeed = 0;
  });
  const textureInput = $('private-texture');
  const textureStatus = $('private-texture-status');
  const textureSummary = () => localPrivateTexture
    ? `Texture PNG locale chargée · ${localPrivateTexture.width} × ${localPrivateTexture.height} · meshes locaux uniquement ; shader et éclairage Web générés, sans parité native.`
    : 'Aucune texture locale chargée ; matériaux Web générés.';
  async function loadTextureFile(file) {
    const generation = ++privateTextureGeneration;
    if (!file) {
      textureStatus.textContent = textureSummary();
      return;
    }
    textureStatus.textContent = 'Décodage de la texture PNG locale…';
    let bitmap;
    try {
      if (!/\.png$/i.test(file.name)) {
        throw new TypeError('Choisis un fichier PNG local.');
      }
      if (!Number.isFinite(file.size) || file.size <= 0 || file.size > 16 * 1024 * 1024) {
        throw new RangeError('Le fichier PNG doit contenir entre 1 octet et 16 Mio.');
      }
      bitmap = await createImageBitmap(file, {
        imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none',
      });
      if (generation !== privateTextureGeneration) return;
      localPrivateTexture = Object.freeze(renderer.replacePrivateTexture(bitmap));
      textureStatus.textContent = textureSummary();
      return true;
    } catch (error) {
      if (generation === privateTextureGeneration) {
        textureStatus.textContent = `Échec de la texture : ${error.message} ${textureSummary()}`;
      }
    } finally {
      bitmap?.close();
    }
    return false;
  }
  textureInput.addEventListener('change', () => loadTextureFile(textureInput.files?.[0]));
  async function loadMeshFile(spec, file) {
      if (!file) return false;
      const status = $('private-mesh-status');
      status.textContent = 'Chargement local et vérification du groupe ' + spec.groupIndex + '…';
      try {
        const source = await readLocalObjFile(file);
        const { mesh } = parseLocalObjGroup(source, {
          groupIndex: spec.groupIndex, expectedTriangles: 1546, expectedCenter: spec.center,
        });
        renderer.replacePrivateMesh(spec.slot, mesh);
        localNativeMeshes.add(spec.slot);
        status.textContent = localNativeMeshes.size + '/2 meshes locaux · '
          + mesh.triangleCount + ' triangles sur le groupe ' + spec.groupIndex
          + ' · shader et éclairage Web générés · pas de comparaison native';
        return true;
      } catch (error) {
        status.textContent = 'Échec ' + spec.slot + ' : ' + error.message;
      }
      return false;
  }
  for (const spec of localMeshPreviewSpec) {
    $(spec.inputId).addEventListener('change', () => loadMeshFile(spec, $(spec.inputId).files?.[0]));
  }
  let localAssetManifest = null;
  async function localAssetFile(id) {
    const descriptor = localAssetManifest?.assets?.[id];
    if (!descriptor) throw new Error('Export local non configuré.');
    const response = await fetch(`/local-assets/${id}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Export local indisponible.');
    return new File([await response.blob()], descriptor.name, { type: descriptor.type });
  }
  $('private-enemy-variant').addEventListener('change', async () => {
    if (!localAssetManifest) return;
    const variant = $('private-enemy-variant').value;
    const generation = ++nativeEnemyGeneration;
    try {
      const file = await localAssetFile(variant === 'merged' ? 'enemyMerged' : 'enemyHeadless');
      if (generation === nativeEnemyGeneration) await loadEnemyFile(file, variant);
    } catch (error) {
      if (generation === nativeEnemyGeneration) enemyStatus.textContent = `${error.message} ${enemySummary()}`;
    }
  });
  async function loadLocalAssets() {
    const status = $('local-assets-status');
    try {
      const response = await fetch('/local-assets/manifest', { cache: 'no-store' });
      if (!response.ok) throw new Error('Serveur d’originaux locaux indisponible.');
      localAssetManifest = await response.json();
      if (!Object.keys(localAssetManifest.assets ?? {}).length) {
        status.textContent = 'Aucun original configuré sur ce serveur. Les sélecteurs manuels restent disponibles.';
        return;
      }
      const results = await Promise.all([
        ...localMeshPreviewSpec.map(async spec => {
          const file = await localAssetFile(spec.slot);
          return localNativeMeshes.has(spec.slot) || loadMeshFile(spec, file);
        }),
        localAssetFile('texture').then(file => privateTextureGeneration ? true : loadTextureFile(file)),
        localAssetFile('enemyMerged').then(file => nativeEnemyGeneration ? true : loadEnemyFile(file, 'merged')),
      ]);
      status.textContent = results.every(Boolean)
        ? 'Originaux locaux chargés automatiquement. Aucun envoi externe.'
        : 'Chargement local incomplet : consulter les statuts ci-dessous.';
    } catch (error) {
      status.textContent = `${error.message} Les sélecteurs manuels restent disponibles.`;
    }
  }
  void loadLocalAssets();
}
document.title = 'FRAME//BREAK — Modèles originaux locaux';
$('scene-mode').addEventListener('change', () => {
  const mode = $('scene-mode').value;
  containersPreviewEnabled = mode === 'original';
  syntheticManifestEnabled = mode === 'synthetic';
  syntheticManifest = syntheticManifestEnabled ? buildSyntheticManifest() : null;
  visualPreviewEnabled = containersPreviewEnabled || syntheticManifestEnabled;
  $('private-mesh-controls').hidden = !containersPreviewEnabled;
  manifestStats = null;
  measuredFrameMs.length = 0;
  metricsNextAt = 0;
  delete window.__superhotSceneMetrics;
  document.exitPointerLock();
  loadLevel(0);
  setScreen(containersPreviewEnabled ? 'playing' : 'menu');
});
let renderedFrameId = 0;
let renderedFrameSnapshot = null;
window.__superhotGetRenderedFrameSnapshot = () => renderedFrameSnapshot && ({
  ...renderedFrameSnapshot, camera: { ...renderedFrameSnapshot.camera },
});
let manifestStats = null;
const measuredFrameMs = [];
let metricsNextAt = 0;
const keys = new Set();
const rand = (min, max) => min + Math.random() * (max - min);
const vec = (x, y, z) => ({ x, y, z });
const distanceXZ = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

const state = {
  screen: 'menu', levelIndex: 0, level: LEVELS[0], objects: [], solids: [],
  camera: { x: 0, y: 1.7, z: 12, yaw: 0, pitch: 0 },
  enemies: [], bullets: [], fragments: [], drops: [],
  speed: .04, lookActivity: 0, shotPulse: 0, runClock: 0, worldClock: 0,
  waveClock: 0, stageBanner: 0, transition: 0, health: 3,
  score: 0, shots: 0, hits: 0, ammo: 6, weapon: true, reload: 0, fireDelay: 0,
  recoil: 0, muzzle: 0, hop: 0, verticalSpeed: 0, walkCycle: 0,
  kills: 0, damage: 0, instructions: false,
};

function setScreen(name) {
  state.screen = name;
  const playing = name === 'playing';
  hud.hidden = !playing;
  overlay.hidden = playing;
  crosshair.style.opacity = playing ? '1' : '0';
  for (const [key, screen] of Object.entries(screens)) screen.hidden = key !== name;
  if (!playing) keys.clear();
}

function loadLevel(index) {
  state.levelIndex = index;
  state.level = LEVELS[index];
  state.objects = buildStaticGeometry(state.level);
  state.solids = state.objects.filter((o) => o.solid).map((o) => ({ ...o,
    min: vec(o.x - o.w / 2, o.y - o.h / 2, o.z - o.d / 2),
    max: vec(o.x + o.w / 2, o.y + o.h / 2, o.z + o.d / 2),
  }));
  state.camera = containersPreviewEnabled
    ? { ...CONTAINERS_BUILD28_DEMO_CAMERA }
    : { x: state.level.spawn.x, y: 1.68, z: state.level.spawn.z, yaw: 0, pitch: 0 };
  if (containersPreviewEnabled && localNativeEnemy) frameLocalEnemy();
  else previewCameraY = state.camera.y;
  state.enemies = state.level.enemies.map((e, i) => ({
    ...e, y: 0, id: i, alive: true, active: false, clock: 0, face: 0,
    fireTimer: rand(1.6, 2.7) + e.delay, strafe: rand(-1, 1), phase: rand(0, Math.PI * 2),
  }));
  if (containersPreviewEnabled) {
    // Visual-only review: do not retain invisible invented obstacle/enemy rules.
    // No native BoxCollider physics has been connected to this preview.
    state.objects = [];
    state.solids = [];
    state.enemies = [];
  }
  state.bullets = []; state.fragments = []; state.drops = [];
  state.speed = .04; state.shotPulse = 0; state.lookActivity = 0;
  state.waveClock = 0; state.stageBanner = containersPreviewEnabled ? 0 : 2.2; state.transition = 0;
  state.ammo = 6; state.weapon = true; state.reload = 0; state.fireDelay = 0;
  state.hop = 0; state.verticalSpeed = 0; state.walkCycle = 0;
  state.recoil = 0; state.muzzle = 0;
  $('room-name').textContent = containersPreviewEnabled
    ? 'CONTAINERS · MODÈLES ORIGINAUX LOCAUX'
    : `${String(index + 1).padStart(2, '0')} / ${state.level.name}`;
  $('stage-banner').textContent = containersPreviewEnabled
    ? 'CONTAINERS · VISITE DES MODÈLES · PAS DE GAMEPLAY NATIF'
    : `${String(index + 1).padStart(2, '0')} — ${state.level.name}` +
      (syntheticManifestEnabled ? ' · SYNTHETIC GEOMETRY (NOT MCD)' : '');
}

function resetGame() {
  state.health = 3; state.score = 0; state.shots = 0; state.hits = 0;
  state.kills = 0; state.runClock = 0; state.worldClock = 0;
  loadLevel(0);
  setScreen('playing');
}
function requestMouse() {
  if (document.pointerLockElement !== canvas) {
    const maybe = canvas.requestPointerLock();
    if (maybe && typeof maybe.catch === 'function') maybe.catch(() => {
      // The game remains usable with keyboard if the browser declines pointer lock.
    });
  }
}
function start() { audio.init(); resetGame(); requestMouse(); }
function resume() { audio.init(); setScreen('playing'); requestMouse(); }
function pause() { if (state.screen === 'playing') setScreen('paused'); }
function finish(win) {
  if (document.pointerLockElement === canvas) document.exitPointerLock();
  const stats = `${state.kills} ennemis éliminés · ${state.shots} tirs · ${state.runClock.toFixed(1)} secondes`;
  $(win ? 'win-stats' : 'death-stats').textContent = stats;
  setScreen(win ? 'win' : 'dead');
  if (win) audio.win();
}

$('start-button').addEventListener('click', start);
$('resume-button').addEventListener('click', resume);
$('retry-button').addEventListener('click', start);
$('again-button').addEventListener('click', start);
$('restart-from-pause').addEventListener('click', start);
canvas.addEventListener('click', () => { if (state.screen === 'paused') resume(); });
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas && state.screen === 'playing') pause();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.screen === 'playing') pause();
});
document.addEventListener('keydown', (event) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  keys.add(event.code);
  if (event.repeat) return;
  if (state.screen === 'menu' && event.code === 'Enter') { start(); return; }
  if ((state.screen === 'dead' || state.screen === 'win') && event.code === 'Enter') { start(); return; }
  if (state.screen === 'paused' && (event.code === 'Escape' || event.code === 'Enter')) { resume(); return; }
  if (state.screen !== 'playing') return;
  if (event.code === 'KeyR') reload();
  if (event.code === 'KeyF') throwWeapon();
  if (event.code === 'KeyE') pickup();
  if (event.code === 'Space' && state.hop < .02) state.verticalSpeed = 5.2;
});
document.addEventListener('keyup', (event) => keys.delete(event.code));
document.addEventListener('mousemove', (event) => {
  if (state.screen !== 'playing' || document.pointerLockElement !== canvas) return;
  state.camera.yaw += event.movementX * .00245;
  state.camera.pitch = clamp(state.camera.pitch - event.movementY * .00245, -1.42, 1.42);
  state.lookActivity = clamp(Math.hypot(event.movementX, event.movementY) / 34, .12, 1);
});
document.addEventListener('contextmenu', (event) => { if (state.screen === 'playing') event.preventDefault(); });
document.addEventListener('mousedown', (event) => {
  if ((event.button !== 0 && event.button !== 2) || state.screen !== 'playing') return;
  if (document.pointerLockElement !== canvas) { requestMouse(); return; }
  if (event.button === 2) throwWeapon();
  else shoot();
});

function reload() {
  if (!state.weapon || state.ammo === 6 || state.reload > 0) return;
  state.reload = .85;
  state.shotPulse = .5;
  audio.pickup();
}
function addBullet(from, direction, friendly, type = 'normal') {
  const speed = type === 'throw' ? 30 : friendly ? 37 : 8.4;
  state.bullets.push({ pos: { ...from }, direction: { ...direction }, speed, friendly, type,
    ttl: type === 'throw' ? 2 : 5, age: 0 });
}
function shoot() {
  if (state.fireDelay > 0 || state.reload > 0) return;
  state.fireDelay = state.weapon ? .19 : .36;
  state.shotPulse = 1;
  state.recoil = 1;
  if (!state.weapon) {
    // Unarmed close-range attack; useful after throwing the gun.
    const hit = findMeleeTarget();
    if (hit) killEnemy(hit);
    else audio.empty();
    return;
  }
  if (state.ammo <= 0) { audio.empty(); return; }
  state.ammo--; state.shots++;
  const { forward, right } = cameraAxes(state.camera.yaw, state.camera.pitch);
  const origin = add3(add3(state.camera, multiply3(forward, .68)), multiply3(right, .12));
  addBullet(origin, forward, true);
  state.muzzle = .09;
  shootFlash.style.opacity = '.5';
  audio.shoot();
}
function throwWeapon() {
  if (!state.weapon || state.reload > 0) return;
  const { forward, right } = cameraAxes(state.camera.yaw, state.camera.pitch);
  const origin = add3(add3(state.camera, multiply3(forward, .72)), multiply3(right, .12));
  addBullet(origin, forward, true, 'throw');
  state.weapon = false; state.ammo = 0; state.shotPulse = 1;
  state.recoil = 1; state.fireDelay = .38;
  audio.shoot();
}
function nearbyPickup() {
  if (state.weapon) return null;
  let nearest = null, best = 2.2;
  for (const drop of state.drops) {
    const distance = distanceXZ(drop, state.camera);
    if (distance < best) { nearest = drop; best = distance; }
  }
  return nearest;
}
function pickup() {
  const drop = nearbyPickup();
  if (!drop) return;
  state.drops.splice(state.drops.indexOf(drop), 1);
  state.weapon = true; state.ammo = 6;
  state.shotPulse = .5;
  audio.pickup();
}
function findMeleeTarget() {
  const axes = cameraAxes(state.camera.yaw, state.camera.pitch);
  let selected = null, best = 2.25;
  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;
    const point = vec(enemy.x, 1.25, enemy.z);
    const delta = { x: point.x - state.camera.x, y: point.y - state.camera.y, z: point.z - state.camera.z };
    const d = Math.hypot(delta.x, delta.y, delta.z);
    if (d < best && (delta.x * axes.forward.x + delta.y * axes.forward.y + delta.z * axes.forward.z) / d > .72) {
      selected = enemy; best = d;
    }
  }
  return selected;
}
function shatterAt(position, count, color = RED) {
  const number = Math.min(count, 80);
  for (let i = 0; i < number; i++) {
    state.fragments.push({
      x: position.x + rand(-.23, .23), y: position.y + rand(-.45, .45), z: position.z + rand(-.23, .23),
      vx: rand(-3.7, 3.7), vy: rand(.8, 5.6), vz: rand(-3.7, 3.7),
      sx: rand(.10, .31), sy: rand(.13, .37), sz: rand(.10, .33),
      rx: rand(-3, 3), ry: rand(-3, 3), rz: rand(-3, 3),
      life: rand(2.1, 4.1), maxLife: 4.1, color: i % 4 === 0 ? RED_LIGHT : color,
    });
  }
  if (state.fragments.length > 650) state.fragments.splice(0, state.fragments.length - 650);
}
function killEnemy(enemy) {
  if (!enemy.alive) return;
  enemy.alive = false;
  state.kills++; state.score += 100;
  state.hits++;
  shatterAt(vec(enemy.x, 1.12, enemy.z), 23);
  state.drops.push({ x: enemy.x, y: .38, z: enemy.z, bob: rand(0, 7) });
  state.shotPulse = Math.max(.65, state.shotPulse);
  audio.shatter();
  if (state.enemies.every((e) => !e.alive)) state.transition = 2;
}
function damagePlayer() {
  state.health--;
  state.damage = .48;
  state.shotPulse = 1;
  audio.hit();
  if (state.health <= 0) finish(false);
}
function closestImpact(bullet, start, end) {
  let best = 1.1, hit = null;
  for (const solid of state.solids) {
    const t = segmentAabb(start, end, solid.min, solid.max);
    if (t !== null && t < best) { best = t; hit = { type: 'wall', t }; }
  }
  if (bullet.friendly) {
    for (const enemy of state.enemies) {
      if (!enemy.alive) continue;
      for (const [height, radius] of [[1.26, .58], [1.91, .37]]) {
        const t = segmentSphere(start, end, vec(enemy.x, height, enemy.z), radius + (bullet.type === 'throw' ? .2 : 0));
        if (t !== null && t < best) { best = t; hit = { type: 'enemy', enemy, t }; }
      }
    }
  } else {
    const t = segmentSphere(start, end, vec(state.camera.x, state.camera.y - .35, state.camera.z), .51);
    if (t !== null && t < best) { best = t; hit = { type: 'player', t }; }
  }
  return hit;
}

function update(dt) {
  state.runClock += dt;
  state.waveClock += dt;
  state.stageBanner = Math.max(0, state.stageBanner - dt);
  state.lookActivity = Math.max(0, state.lookActivity - dt * 2.1);
  state.shotPulse = Math.max(0, state.shotPulse - dt * 2.7);
  state.damage = Math.max(0, state.damage - dt);
  state.muzzle = Math.max(0, state.muzzle - dt);
  state.recoil = Math.max(0, state.recoil - dt * 4.8);
  state.fireDelay = Math.max(0, state.fireDelay - dt);
  if (state.reload > 0) {
    state.reload -= dt;
    if (state.reload <= 0) { state.reload = 0; state.ammo = 6; }
  }
  const fwd = (keys.has('KeyW') || keys.has('KeyZ') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  const horizontal = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  // KeyboardEvent.code follows physical keys: works on both QWERTY and AZERTY layouts.
  const moving = Math.hypot(fwd, horizontal) > 0;
  const wanted = Math.max(.035, moving ? .98 : 0, state.lookActivity * .77, state.shotPulse * .85, state.reload > 0 ? .60 : 0);
  state.speed = lerp(state.speed, wanted, 1 - Math.exp(-8 * dt));
  const worldDt = dt * state.speed;
  state.worldClock += worldDt;
  if (moving) {
    const norm = 1 / Math.hypot(fwd, horizontal);
    const yaw = state.camera.yaw;
    const sx = Math.sin(yaw) * fwd + Math.cos(yaw) * horizontal;
    const sz = -Math.cos(yaw) * fwd + Math.sin(yaw) * horizontal;
    const velocity = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 8.9 : 6.7;
    const next = resolveWalk({ ...state.camera,
      x: state.camera.x + sx * norm * velocity * dt,
      z: state.camera.z + sz * norm * velocity * dt,
    }, .34, state.solids);
    state.camera.x = containersPreviewEnabled ? next.x : clamp(next.x, -14.9, 14.9);
    state.camera.z = containersPreviewEnabled ? next.z : clamp(next.z, -33.8, 21.8);
    state.walkCycle += dt * velocity * 1.4;
  }
  if (state.verticalSpeed !== 0 || state.hop > 0) {
    state.hop += state.verticalSpeed * dt;
    state.verticalSpeed -= 14 * dt;
    if (state.hop < 0) { state.hop = 0; state.verticalSpeed = 0; }
  }
  state.camera.y = (containersPreviewEnabled ? previewCameraY : 1.68) + state.hop;

  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;
    enemy.clock += worldDt;
    if (state.waveClock < enemy.delay) continue;
    enemy.active = true;
    const dx = state.camera.x - enemy.x, dz = state.camera.z - enemy.z;
    const d = Math.hypot(dx, dz) || 1;
    enemy.face = Math.atan2(dx, -dz);
    // Enemies cautiously advance and strafe, sliding past level geometry.
    if (d > 5.5) {
      const strafe = Math.sin(state.worldClock * 1.15 + enemy.phase) * enemy.strafe * .42;
      const next = resolveWalk({x:enemy.x + (dx / d * .55 + dz / d * strafe) * worldDt,
        y:0,z:enemy.z + (dz / d * .55 - dx / d * strafe) * worldDt},.34,state.solids);
      enemy.x = next.x; enemy.z = next.z;
    }
    enemy.fireTimer -= worldDt;
    if (enemy.fireTimer <= 0 && d < 37) {
      enemy.fireTimer = rand(1.65, 2.55);
      const origin = vec(enemy.x, 1.42, enemy.z);
      const aim = vec(state.camera.x, state.camera.y - .25, state.camera.z);
      const direction = normalize3(vec(aim.x-origin.x,aim.y-origin.y,aim.z-origin.z));
      addBullet(origin, direction, false);
      audio.enemyShoot();
    }
  }

  for (let i=state.bullets.length-1;i>=0;i--) {
    const bullet=state.bullets[i];
    const start=bullet.pos;
    const end=add3(start,multiply3(bullet.direction,bullet.speed*worldDt));
    const impact=closestImpact(bullet,start,end);
    bullet.age+=worldDt;bullet.ttl-=worldDt;
    if (impact) {
      if (impact.type==='enemy') killEnemy(impact.enemy);
      else if (impact.type==='player') damagePlayer();
      if (bullet.type==='throw' && impact.type==='wall') {
        const p=add3(start,multiply3(vec(end.x-start.x,end.y-start.y,end.z-start.z),impact.t));
        state.drops.push({x:p.x,y:.38,z:p.z,bob:0});
      }
      state.bullets.splice(i,1);
    } else if (bullet.ttl<=0 || Math.abs(end.x)>40 || Math.abs(end.z)>48 || end.y>12 || end.y<-.5) {
      state.bullets.splice(i,1);
    } else bullet.pos=end;
    if (state.screen!=='playing') return;
  }
  for (let i=state.fragments.length-1;i>=0;i--) {
    const f=state.fragments[i];
    f.x+=f.vx*worldDt;f.y+=f.vy*worldDt;f.z+=f.vz*worldDt;
    f.vy-=10*worldDt;f.rx+=worldDt*2.2;f.ry+=worldDt*3.1;
    if (f.y<.13) {f.y=.13;f.vy=Math.abs(f.vy)*.20;f.vx*=.72;f.vz*=.72;}
    f.life-=worldDt;
    if (f.life<=0) state.fragments.splice(i,1);
  }
  if (state.transition>0) {
    state.transition-=dt;
    if (state.transition<=0) {
      if(state.levelIndex === LEVELS.length-1) finish(true);
      else {state.health=Math.min(3,state.health+1);loadLevel(state.levelIndex+1);}
    }
  }
  updateHud();
}

function updateHud() {
  $('time-pct').textContent = `${String(Math.round(state.speed * 100)).padStart(2,'0')}%`;
  $('time-fill').style.width = `${Math.max(3,state.speed*100)}%`;
  $('ammo').innerHTML = `${String(state.ammo).padStart(2,'0')}<span>/06</span>`;
  $('health').textContent = '◆ '.repeat(Math.max(0,state.health)) + '◇ '.repeat(Math.max(0,3-state.health));
  $('pickup-prompt').hidden = !nearbyPickup();
  $('stage-banner').hidden = state.stageBanner <= 0;
  $('stage-banner').style.opacity = String(Math.min(1,state.stageBanner*1.7));
  flash.style.opacity = String(clamp(state.damage * 1.4,0,.68));
  shootFlash.style.opacity = state.muzzle > 0 ? '.42' : '0';
  const target = rayTarget();
  crosshair.classList.toggle('target',!!target);
}
function rayTarget() {
  const from=state.camera, axes=cameraAxes(from.yaw,from.pitch);
  const to=add3(from,multiply3(axes.forward,40));
  let max=1;
  for(const solid of state.solids) {
    const t=segmentAabb(from,to,solid.min,solid.max);
    if(t!==null) max=Math.min(max,t);
  }
  for(const enemy of state.enemies) {
    if(!enemy.alive) continue;
    const t=segmentSphere(from,to,vec(enemy.x,1.3,enemy.z),.57);
    if(t!==null && t<max) return enemy;
  }
  return null;
}

function drawEnemy(enemy) {
  const { x,z }=enemy;
  const idle=Math.sin(state.worldClock*2.7+enemy.phase)*.026;
  const angle=-enemy.face;
  const co=Math.cos(angle),si=Math.sin(angle);
  const point=(lx,ly,lz)=>[x+co*lx+si*lz,ly+idle,z-si*lx+co*lz];
  const boxPart=(lx,ly,lz,sx,sy,sz,color=RED,ax=0)=>renderer.box(...point(lx,ly,lz),sx,sy,sz,color,ax,angle);
  renderer.box(x,.021,z,.82,.027,.67,'#bbc7d0');
  // Rigid polygonal humanoid silhouette, arms holding an unmistakable weapon.
  boxPart(-.20,.48,0,.26,.88,.31,RED_DARK,Math.sin(state.worldClock*2)*.03);
  boxPart(.20,.48,0,.26,.88,.31,RED_DARK,-Math.sin(state.worldClock*2)*.03);
  boxPart(0,1.22,0,.79,.89,.40,RED);
  boxPart(0,1.68,0,.31,.20,.30,RED_LIGHT);
  renderer.shard(...point(0,1.99,0),.68,.66,.61,RED_LIGHT,0,angle);
  boxPart(-.55,1.24,-.05,.28,.78,.32,RED);
  boxPart(.54,1.31,-.19,.27,.68,.32,RED);
  boxPart(.38,1.04,-.50,.19,.16,.57,GUN);
  boxPart(.37,1.17,-.55,.19,.16,.72,BLACK);
}
function drawPickup(drop) {
  const bob = Math.sin(state.worldClock*2.3+drop.bob)*.075;
  renderer.box(drop.x,.25+bob,drop.z,.58,.15,.16,GUN,0,state.worldClock*.65);
  renderer.box(drop.x-.12,.12+bob,drop.z,.14,.24,.13,METAL,0,state.worldClock*.65);
  renderer.box(drop.x,.025,drop.z,.65,.018,.44,'#c1cbd2');
}
function drawViewModel(camera) {
  const axes=cameraAxes(camera.yaw,camera.pitch);
  const sway=Math.sin(state.walkCycle)*.013;
  const bob=Math.cos(state.walkCycle*.5)*.012;
  const shot=state.recoil*.13;
  const origin=add3(add3(add3(camera,multiply3(axes.forward,.87-shot)),multiply3(axes.right,.37+sway)),multiply3(axes.up,-.31+bob-shot*.4));
  const offset=(r,u,f)=>add3(add3(add3(origin,multiply3(axes.right,r)),multiply3(axes.up,u)),multiply3(axes.forward,f));
  const draw=(r,u,f,sx,sy,sz,color)=>{
    const p=offset(r,u,f);
    renderer.box(p.x,p.y,p.z,sx,sy,sz,color,camera.pitch,-camera.yaw);
  };
  draw(0,-.20,-.10,.29,.46,.27,'#9eabb3');
  draw(0,-.04,-.10,.27,.37,.29,GUN);
  if (!state.weapon) { draw(.03,.05,.08,.38,.3,.35,'#acb8c0');return; }
  draw(-.04,-.15,.02,.16,.34,.17,'#1c262c');
  draw(0,.045,.10,.23,.22,.63,GUN);
  draw(0,.155,.11,.22,.08,.58,METAL);
  draw(0,.052,.51,.145,.12,.18,'#0a1015');
  draw(0,.20,-.14,.12,.07,.16,'#65727b');
  if (state.muzzle>0) {
    const p=offset(0,.06,.68);
    renderer.shard(p.x,p.y,p.z,.16+rand(0,.13),.16+rand(0,.13),.3, '#f8b72d', camera.pitch,-camera.y);
  }
}
function drawBullet(bullet) {
  const {pos,direction,type,friendly}=bullet;
  const yaw=Math.atan2(direction.x,-direction.z);
  const pitch=Math.asin(clamp(direction.y,-1,1));
  const color=friendly?BLACK:RED_LIGHT;
  const thickness=type==='throw'?.19:friendly?.065:.12;
  const trail=type==='throw'?.42:friendly?.48:1.15;
  renderer.box(pos.x,pos.y,pos.z,thickness,thickness,trail,color,pitch,-yaw);
  if(!friendly) renderer.shard(pos.x,pos.y,pos.z,.27,.27,.27,RED_LIGHT);
}
function render() {
  const cam={...state.camera};
  if(state.screen==='playing') cam.y+=Math.sin(state.walkCycle)*.012;
  // Private source #41: build28 serializes fog OFF. Runtime MCD frame is still unobserved.
  // All other modes preserve the generated Web fog profile.
  renderer.begin(cam, containersPreviewEnabled ? { fogStrength: 0 } : undefined);
  if (!containersPreviewEnabled) {
    for(const object of state.objects) {
      renderer.box(object.x,object.y,object.z,object.w,object.h,object.d,object.color);
    }
  }
  if (containersPreviewEnabled) {
    // SH-04/11: three independently joined Mesh6 submeshes share almost
    // congruent, world-batched local geometry. This is a SOURCE-CONVERTED
    // approximation, drawn only from an owner-selected local OBJ6 group47.
    const mesh6Plan = planLocalMesh6Draws({
      group47Loaded: localNativeMeshes.has('mesh6'),
    });
    const omitCargoIds = [
      ...mesh6Plan.omitGeneratedProxyIds,
      ...(localNativeMeshes.has('mesh7') ? ['cargo-upper'] : []),
    ];
    manifestStats = drawContainersBuild28Preview(renderer, cam, {
      aspect: canvas.width / Math.max(1, canvas.height),
      omitCargoIds,
    });
    let privateIndexedDraws = 0;
    for (const packet of mesh6Plan.drawPackets) {
      if (renderer.drawPrivateMesh(packet.gpuSlot, '#485761', packet.modelMatrix)) {
        privateIndexedDraws++;
      }
    }
    if (localNativeMeshes.has('mesh7') &&
        renderer.drawPrivateMesh('mesh7', '#f6f8f9')) {
      privateIndexedDraws++;
    }
    nativeEnemyStats = renderer.drawLocalEnemyDiagnostic(enemyInspectionMatrix);
    manifestStats = {
      ...manifestStats,
      privateIndexedDraws, localFilePreviewOnly: true,
      sourceConvertedApproximationOnly: true,
      sourceQualifiedMesh6DrawPackets: mesh6Plan.drawPackets.length,
      nativeMeshMatch: false, // no runtime material, camera or pixel parity established
    };
  }
  if (syntheticManifest) {
    manifestStats = drawGeneratedManifest(renderer, syntheticManifest, cam, {
      aspect: canvas.width / Math.max(1, canvas.height),
    });
  }
  if (!containersPreviewEnabled) {
    for(const drop of state.drops) drawPickup(drop);
    for(const enemy of state.enemies) if(enemy.alive) drawEnemy(enemy);
    for(const bullet of state.bullets) drawBullet(bullet);
    for(const p of state.fragments) renderer.shard(p.x,p.y,p.z,p.sx,p.sy,p.sz,p.color,p.rx,p.ry,p.rz,clamp(p.life/.6,0,1));
    if(state.screen==='playing') drawViewModel(cam);
  }
  renderedFrameSnapshot = {
    frameId: ++renderedFrameId, activeScreen: state.screen, camera: { ...cam },
  };
}

// Open the local-model view immediately, without audio or pointer-lock activation.
loadLevel(0);
setScreen('playing');
let last=performance.now();
function frame(now) {
  const frameMs = Math.max(0, now - last);
  const dt=Math.min(.05,frameMs/1000);last=now;
  if (visualPreviewEnabled && frameMs > 0) {
    measuredFrameMs.push(frameMs);
    if (measuredFrameMs.length > 240) measuredFrameMs.shift();
  }
  if(state.screen==='playing') update(dt);
  render();
  if (visualPreviewEnabled && now >= metricsNextAt && measuredFrameMs.length) {
    metricsNextAt = now + 1000;
    const sorted = [...measuredFrameMs].sort((a, b) => a - b);
    const at = (p) => sorted[Math.ceil(sorted.length * p) - 1];
    window.__superhotSceneMetrics = Object.freeze({
      mode: containersPreviewEnabled ? 'CONTAINERS_COLLIDER_PROXY_NOT_MCD_RUNTIME' : 'SYNTHETIC_NOT_MCD',
      matchedNativeScene: false,
      activeScreen: state.screen, samples: sorted.length,
      p95FrameMs: at(.95), fpsAtP95FrameMs: 1000 / at(.95),
      p95Fps: 1000 / at(.05),
      generatedManifest: manifestStats,
      locallyLoadedSourceGroups: localNativeMeshes.size,
      locallyLoadedTexture: localPrivateTexture,
      localNativeEnemy,
      nativeEnemyIndexedDrawCalls: nativeEnemyStats?.drawCalls ?? 0,
      nativeEnemySpawnVerified: false,
      skinAnimationVerified: false,
      camera: { ...state.camera },
      nativeMaterialShaderMatch: false,
      nativeLightingMatch: false,
      localFilesStayInBrowser: true,
      totalWebGLDrawCalls: renderer.getDrawCalls(),
      browserMeasured: true,
    });
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
