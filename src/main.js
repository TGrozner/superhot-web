import { createRenderer } from './renderer.js';
import { createAudio } from './audio.js';
import { LEVELS, CONTAINERS_WEB_FALLBACK_SPAWN, buildContainersCollisionSolids, containersWalkSolids, buildStaticGeometry, buildSyntheticManifest, drawGeneratedManifest, drawContainersBuild28Preview } from './levels.js';
import { CONTAINERS_BUILD28_DEMO_CAMERA } from './scenes/containers-build28.js';
import { planLocalMesh6Draws } from './scenes/containers-mesh6-local-plan.js';
import { localMesh7ObjParseRequest, planLocalMesh7Draws } from './scenes/containers-mesh7-local-plan.js';
import { parseObjGroupsIntoIndexedMesh } from './render/mesh-format.js';
import { parseLocalObjGroup, readLocalObjFile } from './preview/local-obj-group.js';
import { loadNativeEnemyObj } from './characters/native-enemy-local.js';
import { prepareNativeScene } from './scenes/native-scene-local.js';
import { createMcdGameplayClock, stepMcdGameplayClock, addMcdGameplayPulse, mcdSourcePlayerPreConstraintMove } from './time.js';
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
let nativeScene = null;
let nativeSkinInfo = null;
let localAssetManifest = null;
// Common sharedassets0.assets:711 -> PistolGun:4849 settings, not a scene pickup.
const nativePistol = Object.freeze({ ammo: 5, attackDelay: Math.fround(.6), bulletSpeed: 36 });
let weaponGeneration = 0;
let jumpRequested = false;
let nativeInspection = false;
let nativeInspectionAt = 0;
let nativeCombatStarted = false;
const nativeGameplay = () => containersPreviewEnabled && nativeScene && !nativeInspection;
const nativeSceneName = () => nativeScene
  ? nativeScene.source.scenePath.split('/').pop().replace(/\.unity$/i, '')
  : localAssetManifest?.assets?.scenePackage ? 'SCÈNE LOCALE' : 'CONTAINERS';
const actorMatrix = new Float32Array(16);
const weaponMatrix = new Float32Array(16);
let localMesh7DrawPackets = [];
let previewCameraY = CONTAINERS_BUILD28_DEMO_CAMERA.y;
// Inspection placement is separate from a gameplay actor or observed native spawn.
const enemyInspectionMatrix = new Float32Array([
  1,0,0,0, 0,1,0,0, 0,0,1,0, 11,.97,24,1,
]);
function frameLocalEnemy() {
  nativeInspection = true;
  nativeInspectionAt = state.runClock;
  if (nativeScene) {
    const anchor = nativeScene.anchors.enemy[0].worldMatrix;
    enemyInspectionMatrix[12] = anchor[12];
    enemyInspectionMatrix[13] = anchor[13];
    enemyInspectionMatrix[14] = anchor[14];
  }
  state.camera = { x: enemyInspectionMatrix[12], y: enemyInspectionMatrix[13] + 1.15, z: enemyInspectionMatrix[14] + 4, yaw: 0, pitch: -.04 };
  previewCameraY = state.camera.y;
  state.hop = 0; state.verticalSpeed = 0;
  keys.clear();
  setScreen('playing');
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
    ? `${localNativeEnemy.variant === 'merged' ? 'EnemyMerged' : 'EnemyMergedHeadless'} original · ${nativeSkinInfo ? 'squelette et poses originales chargés' : 'pose statique'} · ${localNativeEnemy.triangles} triangles.`
    : 'Aucun modèle ennemi local chargé.';
  async function loadEnemyFile(file, variant, generation = ++nativeEnemyGeneration) {
    if (!file) { enemyStatus.textContent = enemySummary(); return false; }
    enemyStatus.textContent = 'Vérification et chargement du modèle original…';
    try {
      const receipt = await loadNativeEnemyObj(file, { variant });
      const rigId = variant === 'headless' ? 'enemyHeadlessRig' : 'enemyRig';
      let rig = null;
      if (localAssetManifest?.assets?.[rigId]) {
        const response = await fetch(`/local-assets/${rigId}`, { cache: 'no-store' });
        if (!response.ok) throw new Error('Animation originale locale indisponible.');
        rig = await response.json();
      }
      if (generation !== nativeEnemyGeneration) return false;
      nativeSkinInfo = renderer.replaceNativeCharacter(receipt, rig);
      localNativeEnemy = Object.freeze({
        owner: receipt.owner, meshPathId: receipt.meshPathId,
        variant: receipt.variant, triangles: receipt.mesh.triangleCount,
      });
      $('frame-private-enemy').disabled = false;
      const animationSelect = $('private-animation');
      animationSelect.disabled = !nativeSkinInfo;
      for (const option of animationSelect.options) {
        option.disabled = !nativeSkinInfo?.clips.includes(option.value);
      }
      if (!nativeSkinInfo?.clips.includes(animationSelect.value)) animationSelect.value = 'idle';
      enemyStatus.textContent = enemySummary();
      if (containersPreviewEnabled && !nativeScene && !localAssetManifest?.assets?.scenePackage) resetContainersTarget();
      return true;
    } catch (error) {
      if (generation === nativeEnemyGeneration) {
        if (localNativeEnemy) $('private-enemy-variant').value = localNativeEnemy.variant;
        enemyStatus.textContent = `Échec du modèle : ${error.message} ${enemySummary()}`;
      }
    }
    return false;
  }
  $('private-animation').addEventListener('change', frameLocalEnemy);
  enemyInput.addEventListener('change', () => loadEnemyFile(enemyInput.files?.[0], $('private-enemy-variant').value));
  $('frame-private-enemy').addEventListener('click', frameLocalEnemy);
  $('frame-containers').addEventListener('click', () => {
    if (containersPreviewEnabled) { nativeInspection = false; loadLevel(0); return; }
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
        let mesh;
        if (spec.slot === 'mesh7') {
          // Independently source-qualified #121: three distinct OBJ7 groups,
          // preserved as per-submesh drawElements ranges, not cloned geometry.
          const request = localMesh7ObjParseRequest();
          const decoded = parseObjGroupsIntoIndexedMesh(source, request.selectors, request.options);
          const plan = planLocalMesh7Draws({ drawRanges: decoded.drawRanges });
          if (plan.drawPackets.length !== 3) throw new Error('Mesh7 must have three verified cargo ranges');
          mesh = decoded.mesh;
          renderer.replacePrivateMesh(spec.slot, mesh);
          localMesh7DrawPackets = plan.drawPackets;
        } else {
          mesh = parseLocalObjGroup(source, {
            groupIndex: spec.groupIndex, expectedTriangles: 1546, expectedCenter: spec.center,
          }).mesh;
          renderer.replacePrivateMesh(spec.slot, mesh);
        }
        localNativeMeshes.add(spec.slot);
        status.textContent = localNativeMeshes.size + '/2 fichiers locaux · '
          + mesh.triangleCount + ' triangles source convertis'
          + (spec.slot === 'mesh7' ? ' · trois groupes 48/46/77 distincts' : ' · groupe 47')
          + ' · shader/éclairage Web, pas de parité native';
        return true;
      } catch (error) {
        status.textContent = 'Échec ' + spec.slot + ' : ' + error.message;
      }
      return false;
  }
  for (const spec of localMeshPreviewSpec) {
    $(spec.inputId).addEventListener('change', () => loadMeshFile(spec, $(spec.inputId).files?.[0]));
  }
  async function localAssetFile(id) {
    const descriptor = localAssetManifest?.assets?.[id];
    if (!descriptor) throw new Error('Export local non configuré.');
    const response = await fetch(`/local-assets/${id}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Export local indisponible.');
    return new File([await response.blob()], descriptor.name, { type: descriptor.type });
  }
  async function loadScene() {
    if (!localAssetManifest?.assets?.scenePackage) return;
    const file = await localAssetFile('scenePackage');
    const source = await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).json();
    const prepared = prepareNativeScene(source);
    const images = new Map();
    try {
      const decoded = await Promise.allSettled([...prepared.textures].map(async ([id]) => {
        const file = await localAssetFile(id);
        images.set(id, await createImageBitmap(file, { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' }));
      }));
      const failed = decoded.find(result => result.status === 'rejected');
      if (failed) throw failed.reason;
      for (const lightmap of prepared.lightmaps.values()) {
        if (lightmap.compressedAssetId) {
          const file = await localAssetFile(lightmap.compressedAssetId);
          images.set(lightmap.compressedAssetId, new Uint8Array(await file.arrayBuffer()));
        }
      }
      renderer.replaceNativeWorld(prepared, images);
      nativeScene = prepared;
      nativeInspection = false;
      const name = nativeSceneName();
      $('scene-mode').querySelector('[value="original"]').textContent = `${name} · originaux locaux`;
      $('native-scene-title').textContent = `${name} · MODÈLES ORIGINAUX`;
      $('play-original').textContent = `Jouer dans ${name}`;
      $('frame-containers').textContent = `Vue de ${name}`;
      loadLevel(0);
    } finally { for (const image of images.values()) image.close?.(); }
  }
  $('private-enemy-variant').addEventListener('change', async () => {
    if (!localAssetManifest) return;
    const variant = $('private-enemy-variant').value;
    const generation = ++nativeEnemyGeneration;
    try {
      const file = await localAssetFile(variant === 'merged' ? 'enemyMerged' : 'enemyHeadless');
      if (generation === nativeEnemyGeneration) {
        await loadEnemyFile(file, variant, generation);
      }
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
      if (localAssetManifest.assets?.scenePackage) {
        // A selected native packet must never silently fall back to another scene.
        manifestStats = null;
        loadLevel(0);
      }
      if (!Object.keys(localAssetManifest.assets ?? {}).length) {
        status.textContent = 'Aucun original configuré sur ce serveur. Les sélecteurs manuels restent disponibles.';
        return;
      }
      const results = await Promise.all([
        ...(localAssetManifest.assets.scenePackage ? [] : localMeshPreviewSpec
          .filter(spec => localAssetManifest.assets[spec.slot]).map(async spec => {
            const file = await localAssetFile(spec.slot);
            return localNativeMeshes.has(spec.slot) || loadMeshFile(spec, file);
          })),
        ...(!localAssetManifest.assets.scenePackage && localAssetManifest.assets.texture
          ? [localAssetFile('texture').then(file => privateTextureGeneration ? true : loadTextureFile(file))] : []),
        localAssetFile('enemyMerged').then(file => nativeEnemyGeneration ? true : loadEnemyFile(file, 'merged')),
      ]);
      await loadScene();
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
  nativeInspection = false;
  nativeCombatStarted = false;
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
window.__superhotGetRenderedFrameSnapshot = () => renderedFrameSnapshot &&
  structuredClone({ ...renderedFrameSnapshot, projection: renderer.getProjectionState() });
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
let nativeClock = createMcdGameplayClock();
const nativeVelocity = { x: 0, z: 0 };
let nativeJumpAt = 0;

function initializeAudio() {
  const assets = Object.fromEntries(Object.keys(localAssetManifest?.assets ?? {})
    .map(id => [id, `/local-assets/${id}`]));
  // Both verified event bindings point at sharedassets0.assets:604.
  if (assets.audioPistolFirePrimary) assets.audioEnemyFire = assets.audioPistolFirePrimary;
  void audio.init().then(() => audio.loadLocalAssets(assets)).catch(error => {
    $('local-assets-status').textContent = `Audio local indisponible : ${error.message}`;
  });
}

function setScreen(name) {
  state.screen = name;
  const playing = name === 'playing';
  hud.hidden = !playing;
  overlay.hidden = playing;
  crosshair.style.opacity = playing ? '1' : '0';
  for (const [key, screen] of Object.entries(screens)) screen.hidden = key !== name;
  if (!playing) keys.clear();
}

/** Gameplay target exists only after the original OBJ has been authenticated
 * from the owner's local file; its web hit shape/AI remain NOT native verified. */
function resetContainersTarget() {
  state.enemies = localNativeEnemy ? [{
    id: 'containers-static-local-target', x: 11, y: 0.97, z: 24,
    alive: true, active: true, clock: 0, face: 0, delay: 0,
    phase: 0, strafe: 0, fireTimer: Infinity,
    nativeSpawnVerified: false, nativeHitboxVerified: false,
  }] : [];
  state.bullets = [];
  state.fragments = [];
  state.transition = 0;
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
    ? { ...CONTAINERS_WEB_FALLBACK_SPAWN }
    : { x: state.level.spawn.x, y: 1.68, z: state.level.spawn.z, yaw: 0, pitch: 0 };
  previewCameraY = state.camera.y; // no automatic camera snap after load
  state.enemies = state.level.enemies.map((e, i) => ({
    ...e, y: 0, id: i, alive: true, active: false, clock: 0, face: 0,
    fireTimer: rand(1.6, 2.7) + e.delay, strafe: rand(-1, 1), phase: rand(0, Math.PI * 2),
  }));
  if (containersPreviewEnabled) {
    // Source-derived bounds use provisional Web AABB contact, not Unity PhysX.
    state.objects = [];
    state.solids = [];
    state.enemies = [];
    if (nativeScene && !nativeInspection) {
      // Captured entry camera when supplied; otherwise the serialized source placement.
      const camera = nativeScene.camera.worldMatrix;
      state.camera = { x: camera[12], y: camera[13], z: camera[14],
        yaw: Math.atan2(camera[8], -camera[10]),
        pitch: Math.atan2(camera[9], Math.hypot(camera[8], camera[10])) };
      previewCameraY = state.camera.y;
      state.solids = nativeScene.colliders.filter(c => !c.isTrigger &&
        c.initial.enabled && c.initial.activeInHierarchy).map(c => {
        const [x0, y0, z0] = c.worldAabb.min, [x1, y1, z1] = c.worldAabb.max;
        return { x: (x0+x1)/2, y: (y0+y1)/2, z: (z0+z1)/2,
          w: x1-x0, h: y1-y0, d: z1-z0, min: vec(x0,y0,z0), max: vec(x1,y1,z1) };
      });
      // Authored candidate positions, with Web encounter timing—not a native spawner replay.
      state.enemies = nativeScene.anchors.enemy.map((point, id) => {
        const m = point.worldMatrix;
        return { x:m[12], y:m[13], z:m[14], id, alive:true, active:true, clock:0,
          face:0, delay:0, fireTimer:2+id, strafe:0, phase:0, walking:false, deathAt:null };
      });
    } else if (!nativeScene && !nativeInspection && !localAssetManifest?.assets?.scenePackage) {
      state.solids = buildContainersCollisionSolids();
      resetContainersTarget();
    }
  }
  nativeClock = createMcdGameplayClock(state.camera);
  nativeVelocity.x = 0; nativeVelocity.z = 0; jumpRequested = false;
  weaponGeneration++;
  state.bullets = []; state.fragments = []; state.drops = [];
  state.speed = .04; state.shotPulse = 0; state.lookActivity = 0;
  state.waveClock = 0; state.stageBanner = containersPreviewEnabled ? 0 : 2.2; state.transition = 0;
  state.weapon = nativeGameplay() ? nativeScene.initialEquipment.armed : true;
  state.ammo = nativeGameplay() ? (state.weapon ? nativePistol.ammo : 0) : 6;
  state.reload = 0; state.fireDelay = 0;
  state.hop = 0; state.verticalSpeed = 0; state.walkCycle = 0;
  state.recoil = 0; state.muzzle = 0;
  $('ammo-hint').textContent = nativeGameplay() ? '/ CHANGER D’ARME UNE FOIS VIDE' : '/ R POUR RECHARGER';
  audio.setOriginalMode(Boolean(containersPreviewEnabled && nativeScene));
  $('room-name').textContent = containersPreviewEnabled
    ? `${nativeSceneName()} · GÉOMÉTRIE ORIGINALE · COMBAT WEB`
    : `${String(index + 1).padStart(2, '0')} / ${state.level.name}`;
  $('stage-banner').textContent = containersPreviewEnabled
    ? `${nativeSceneName()} · COLLISIONS ET COMBAT WEB · PAS DE PARITÉ NATIVE`
    : `${String(index + 1).padStart(2, '0')} — ${state.level.name}` +
      (syntheticManifestEnabled ? ' · SYNTHETIC GEOMETRY (NOT MCD)' : '');
}

function resetGame() {
  state.health = 3; state.score = 0; state.shots = 0; state.hits = 0;
  nativeInspection = false;
  nativeCombatStarted = true;
  state.kills = 0; state.runClock = 0; state.worldClock = 0;
  loadLevel(0);
  setScreen('playing');
}
function requestMouse() {
  canvas.focus({ preventScroll: true });
  if (document.pointerLockElement !== canvas) {
    const maybe = canvas.requestPointerLock();
    if (maybe && typeof maybe.catch === 'function') maybe.catch(() => {
      // The game remains usable with keyboard if the browser declines pointer lock.
    });
  }
}
function start() { initializeAudio(); resetGame(); requestMouse(); }
function resume() { initializeAudio(); setScreen('playing'); requestMouse(); }
function pause() { if (state.screen === 'playing') setScreen('paused'); }
function finish(win) {
  if (document.pointerLockElement === canvas) document.exitPointerLock();
  const stats = `${state.kills} ennemis éliminés · ${state.shots} tirs · ${state.runClock.toFixed(1)} secondes`;
  $(win ? 'win-stats' : 'death-stats').textContent = stats;
  setScreen(win ? 'win' : 'dead');
  if (win) audio.win();
}

$('start-button').addEventListener('click', start);
$('play-original').addEventListener('click', start);
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
  if (event.code === 'Escape') {
    pause();
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    return;
  }
  if (event.code === 'KeyR' && !nativeGameplay()) reload();
  if (event.code === 'KeyF') throwWeapon();
  if (event.code === 'KeyE') pickup();
  if (event.code === 'Space' && state.hop < .02) {
    if (nativeGameplay()) jumpRequested = true;
    else state.verticalSpeed = 5.2;
  }
});
document.addEventListener('keyup', (event) => keys.delete(event.code));
document.addEventListener('mousemove', (event) => {
  if (state.screen !== 'playing' || document.pointerLockElement !== canvas) return;
  state.camera.yaw += event.movementX * .00245;
  const pitchLimit = nativeGameplay() ? 80 * Math.PI / 180 : 1.42;
  state.camera.pitch = clamp(state.camera.pitch - event.movementY * .00245, -pitchLimit, pitchLimit);
  state.lookActivity = clamp(Math.hypot(event.movementX, event.movementY) / 34, .12, 1);
});
document.addEventListener('contextmenu', (event) => { if (state.screen === 'playing') event.preventDefault(); });
document.addEventListener('mousedown', (event) => {
  if ((event.button !== 0 && event.button !== 2) || state.screen !== 'playing') return;
  if (document.pointerLockElement !== canvas) { nativeCombatStarted = true; initializeAudio(); requestMouse(); return; }
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
  const speed = type === 'throw' ? 30 : nativeGameplay()
    ? (friendly ? nativePistol.bulletSpeed : 28) : friendly ? 37 : 8.4;
  const bullet = { pos: { ...from }, direction: { ...direction }, speed, friendly, type,
    ttl: type === 'throw' ? 2 : 5, age: 0 };
  state.bullets.push(bullet);
  return bullet;
}
function shoot() {
  if (state.fireDelay > 0 || state.reload > 0) return;
  state.fireDelay = state.weapon ? (nativeGameplay() ? nativePistol.attackDelay : .19) : .36;
  if (nativeGameplay()) addMcdGameplayPulse(nativeClock, .05, .2);
  state.shotPulse = 1;
  state.recoil = 1;
  if (!state.weapon) {
    // Unarmed close-range attack; useful after throwing the gun.
    const hit = findMeleeTarget();
    if (hit) killEnemy(hit);
    else audio.empty();
    return;
  }
  if (state.ammo <= 0) {
    if (nativeGameplay()) state.fireDelay = 0;
    if (nativeGameplay() && state.ammo < 0) { throwWeapon(); return; }
    audio.empty();
    if (nativeGameplay()) state.ammo--;
    return;
  }
  state.ammo--; state.shots++;
  const { forward, right } = cameraAxes(state.camera.yaw, state.camera.pitch);
  const origin = add3(add3(state.camera, multiply3(forward, .68)), multiply3(right, .12));
  addBullet(origin, forward, true);
  state.muzzle = .09;
  shootFlash.style.opacity = '.5';
  audio.shoot();
  if (nativeGameplay()) {
    const generation = weaponGeneration;
    audio.scheduleReady({ delaySeconds: nativePistol.attackDelay,
      isWeaponThrown: () => !state.weapon || weaponGeneration !== generation });
  }
}
function throwWeapon() {
  if (!state.weapon || state.reload > 0) return;
  const { forward, right } = cameraAxes(state.camera.yaw, state.camera.pitch);
  const origin = add3(add3(state.camera, multiply3(forward, .72)), multiply3(right, .12));
  const thrown = addBullet(origin, forward, true, 'throw');
  thrown.ammo = Math.max(0, state.ammo);
  if (nativeGameplay() && thrown.ammo === 0) {
    thrown.unpickable = true;
    thrown.expiresAt = state.worldClock + 2;
  }
  state.weapon = false; state.ammo = 0; state.shotPulse = 1;
  weaponGeneration++;
  if (nativeGameplay()) addMcdGameplayPulse(nativeClock, .05, .5);
  state.recoil = 1; state.fireDelay = .38;
  audio.throwWeapon();
}
function nearbyPickup() {
  if (state.weapon) return null;
  let nearest = null, best = 2.2;
  for (const drop of state.drops) {
    if (drop.unpickable) continue;
    const distance = distanceXZ(drop, state.camera);
    if (distance < best) { nearest = drop; best = distance; }
  }
  return nearest;
}
function pickup() {
  const drop = nearbyPickup();
  if (!drop) return;
  state.drops.splice(state.drops.indexOf(drop), 1);
  state.weapon = true; state.ammo = drop.ammo ?? (nativeGameplay() ? nativePistol.ammo : 6);
  weaponGeneration++;
  state.shotPulse = .5;
  audio.pickup({ reloaded: drop.ammo === 0 });
}
function findMeleeTarget() {
  const axes = cameraAxes(state.camera.yaw, state.camera.pitch);
  let selected = null, best = 2.25;
  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;
    const point = vec(enemy.x, enemy.y + 1.25, enemy.z);
    const delta = { x: point.x - state.camera.x, y: point.y - state.camera.y, z: point.z - state.camera.z };
    const d = Math.hypot(delta.x, delta.y, delta.z);
    if (d < best && (delta.x * axes.forward.x + delta.y * axes.forward.y + delta.z * axes.forward.z) / d > .72) {
      selected = enemy; best = d;
    }
  }
  return selected;
}
function shatterAt(position, count, color = RED, floorY = 0) {
  const number = Math.min(count, 80);
  for (let i = 0; i < number; i++) {
    state.fragments.push({
      x: position.x + rand(-.23, .23), y: position.y + rand(-.45, .45), z: position.z + rand(-.23, .23),
      vx: rand(-3.7, 3.7), vy: rand(.8, 5.6), vz: rand(-3.7, 3.7),
      sx: rand(.10, .31), sy: rand(.13, .37), sz: rand(.10, .33),
      rx: rand(-3, 3), ry: rand(-3, 3), rz: rand(-3, 3),
      floorY,
      life: rand(2.1, 4.1), maxLife: 4.1, color: i % 4 === 0 ? RED_LIGHT : color,
    });
  }
  if (state.fragments.length > 650) state.fragments.splice(0, state.fragments.length - 650);
}
function killEnemy(enemy) {
  if (!enemy.alive) return;
  enemy.alive = false;
  enemy.deathAt = state.worldClock;
  state.kills++; state.score += 100;
  state.hits++;
  const floorY = floorAt(enemy.x, enemy.z, enemy.y);
  shatterAt(vec(enemy.x, enemy.y + 1.12, enemy.z), 23, RED, floorY);
  if (!nativeGameplay() || nativeScene.worldPistol || nativeScene.pistol) {
    state.drops.push({ x: enemy.x, y: floorY + .38, z: enemy.z, bob: rand(0, 7),
      ammo: nativeGameplay() ? nativePistol.ammo : 6 });
  }
  state.shotPulse = Math.max(.65, state.shotPulse);
  audio.shatter({ position: vec(enemy.x, enemy.y + 1.12, enemy.z) });
  if (state.enemies.length && state.enemies.every((e) => !e.alive)) state.transition = containersPreviewEnabled ? 1.0 : 2;
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
        const t = segmentSphere(start, end, vec(enemy.x, enemy.y + height, enemy.z), radius + (bullet.type === 'throw' ? .2 : 0));
        if (t !== null && t < best) { best = t; hit = { type: 'enemy', enemy, t }; }
      }
    }
  } else {
    const t = segmentSphere(start, end, vec(state.camera.x, state.camera.y - .35, state.camera.z), .51);
    if (t !== null && t < best) { best = t; hit = { type: 'player', t }; }
  }
  return hit;
}

function floorAt(x, z, belowY) {
  if (!nativeGameplay()) return 0;
  let floor = -Infinity;
  for (const solid of state.solids) {
    if (x >= solid.min.x && x <= solid.max.x && z >= solid.min.z && z <= solid.max.z &&
        solid.max.y <= belowY + .15) floor = Math.max(floor, solid.max.y);
  }
  return Number.isFinite(floor) ? floor : nativeScene.anchors.player[0].worldMatrix[13];
}
function walkThroughScene(position, feet) {
  if (containersPreviewEnabled && nativeInspection) return position;
  const obstacles = nativeGameplay()
    ? state.solids.filter(s => s.max.y > feet + .12 && s.min.y < feet + 1.6)
    : containersPreviewEnabled ? containersWalkSolids(state.solids, feet + 1.6) : state.solids;
  return resolveWalk(position, nativeGameplay() ? .4 : .34, obstacles);
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
  if (!nativeGameplay()) state.fireDelay = Math.max(0, state.fireDelay - dt);
  if (state.reload > 0) {
    state.reload -= dt;
    if (state.reload <= 0) { state.reload = 0; state.ammo = 6; }
  }
  const fwd = (keys.has('KeyW') || keys.has('KeyZ') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  const horizontal = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  // KeyboardEvent.code follows physical keys: works on both QWERTY and AZERTY layouts.
  const moving = Math.hypot(fwd, horizontal) > 0;
  const native = nativeGameplay();
  let worldDt;
  if (native) {
    const tick = stepMcdGameplayClock(nativeClock, {
      dt, x: horizontal, y: fwd, grounded: state.hop <= 0 && state.verticalSpeed <= 0,
      yaw: state.camera.yaw, pitch: state.camera.pitch,
    });
    state.speed = tick.timeScale;
    worldDt = tick.worldDelta;
    state.fireDelay = Math.max(0, state.fireDelay - worldDt);
    audio.updateWorldAudio({ aggregateTargetTimescale: tick.aggregate });
    audio.advanceWorldTime(worldDt);
    audio.setListener({ position: state.camera, forward: cameraAxes(state.camera.yaw, state.camera.pitch).forward });
  } else {
    const wanted = Math.max(.035, moving ? .98 : 0, state.lookActivity * .77, state.shotPulse * .85, state.reload > 0 ? .60 : 0);
    state.speed = lerp(state.speed, wanted, 1 - Math.exp(-8 * dt));
    worldDt = dt * state.speed;
  }
  state.worldClock += worldDt;
  for (let i = state.drops.length - 1; i >= 0; i--) {
    if (state.drops[i].expiresAt <= state.worldClock) state.drops.splice(i, 1);
  }
  const norm = moving ? 1 / Math.hypot(fwd, horizontal) : 0;
  if (native) {
    const grounded = state.hop <= 0 && state.verticalSpeed <= 0;
    if (grounded) {
      nativeVelocity.x = horizontal * norm * 6 * Math.fround(1.1);
      nativeVelocity.z = fwd * norm * 6 * Math.fround(1.1);
      if (jumpRequested) {
        state.verticalSpeed = 5.75 * 5 * Math.fround(.4);
        nativeJumpAt = state.worldClock;
      }
    } else {
      const damping = Math.pow(Math.fround(.99), dt / Math.fround(.0166666));
      const speed = 6 * (state.worldClock - nativeJumpAt < .5 ? Math.fround(1.1) : 1);
      nativeVelocity.x = horizontal * norm * (speed * .05 + Math.fround(.2)) + nativeVelocity.x * damping * .95;
      nativeVelocity.z = fwd * norm * (speed * .05 + Math.fround(.2)) + nativeVelocity.z * damping * .95;
      state.verticalSpeed *= .05 + damping * .95;
      state.verticalSpeed += Math.fround(-9.81) * 5 * worldDt;
    }
    jumpRequested = false;
    const yaw = state.camera.yaw;
    const displacement = mcdSourcePlayerPreConstraintMove({
      velocity: { x: nativeVelocity.x, y: state.verticalSpeed, z: nativeVelocity.z },
      directionRotation: { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) },
      scaledDeltaTime: worldDt,
    });
    const next = walkThroughScene({ ...state.camera,
      x: state.camera.x + displacement.x,
      z: state.camera.z - displacement.z,
    }, state.camera.y - 1.6);
    state.camera.x = next.x; state.camera.z = next.z;
    state.walkCycle += worldDt * Math.hypot(nativeVelocity.x, nativeVelocity.z) * 1.4;
    state.hop += displacement.y;
    if (state.hop <= 0) { state.hop = 0; state.verticalSpeed = 0; }
  } else {
    if (moving) {
      const yaw = state.camera.yaw;
      const sx = Math.sin(yaw) * fwd + Math.cos(yaw) * horizontal;
      const sz = -Math.cos(yaw) * fwd + Math.sin(yaw) * horizontal;
      const velocity = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 8.9 : 6.7;
      const next = walkThroughScene({ ...state.camera,
        x: state.camera.x + sx * norm * velocity * dt,
        z: state.camera.z + sz * norm * velocity * dt,
      }, state.camera.y - 1.6);
      state.camera.x = containersPreviewEnabled ? next.x : clamp(next.x, -14.9, 14.9);
      state.camera.z = containersPreviewEnabled ? next.z : clamp(next.z, -33.8, 21.8);
      state.walkCycle += dt * velocity * 1.4;
    }
    if (state.verticalSpeed !== 0 || state.hop > 0) {
      state.hop += state.verticalSpeed * dt;
      state.verticalSpeed -= 14 * dt;
      if (state.hop < 0) { state.hop = 0; state.verticalSpeed = 0; }
    }
  }
  state.camera.y = (containersPreviewEnabled ? previewCameraY : 1.68) + state.hop;

  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;
    if (containersPreviewEnabled && (nativeInspection || !nativeScene || !nativeCombatStarted)) continue;
    enemy.walking = false;
    enemy.clock += worldDt;
    if (state.waveClock < enemy.delay) continue;
    enemy.active = true;
    const dx = state.camera.x - enemy.x, dz = state.camera.z - enemy.z;
    const d = Math.hypot(dx, dz) || 1;
    enemy.face = Math.atan2(dx, -dz);
    // Enemies cautiously advance and strafe, sliding past level geometry.
    if (d > 5.5) {
      const strafe = Math.sin(state.worldClock * 1.15 + enemy.phase) * enemy.strafe * .42;
      const next = walkThroughScene({x:enemy.x + (dx / d * .55 + dz / d * strafe) * worldDt,
        y:enemy.y,z:enemy.z + (dz / d * .55 - dx / d * strafe) * worldDt}, enemy.y);
      enemy.walking = Math.hypot(next.x-enemy.x, next.z-enemy.z) > 1e-7;
      enemy.x = next.x; enemy.z = next.z;
    }
    enemy.fireTimer -= worldDt;
    if (enemy.fireTimer <= 0 && d < 37) {
      enemy.fireTimer = rand(1.65, 2.55);
      // Web AI owns this attack decision; native controller activation is not recovered.
      enemy.attackIntentAt = state.worldClock;
      const origin = vec(enemy.x, enemy.y + 1.42, enemy.z);
      const aim = vec(state.camera.x, state.camera.y - .25, state.camera.z);
      const direction = normalize3(vec(aim.x-origin.x,aim.y-origin.y,aim.z-origin.z));
      addBullet(origin, direction, false);
      audio.enemyShoot({ position: origin });
    }
  }

  for (let i=state.bullets.length-1;i>=0;i--) {
    const bullet=state.bullets[i];
    if (bullet.expiresAt <= state.worldClock) {
      state.bullets.splice(i, 1);
      continue;
    }
    const start=bullet.pos;
    const end=add3(start,multiply3(bullet.direction,bullet.speed*worldDt));
    const impact=closestImpact(bullet,start,end);
    bullet.age+=worldDt;bullet.ttl-=worldDt;
    if (impact) {
      if (impact.type==='enemy') killEnemy(impact.enemy);
      else if (impact.type==='player') damagePlayer();
      if (bullet.type==='throw' && impact.type==='wall') {
        const p=add3(start,multiply3(vec(end.x-start.x,end.y-start.y,end.z-start.z),impact.t));
        state.drops.push({x:p.x,y:floorAt(p.x,p.z,p.y)+.38,z:p.z,bob:0,ammo:bullet.ammo,
          unpickable:bullet.unpickable,expiresAt:bullet.expiresAt});
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
    const floor = f.floorY + .13;
    if (f.y<floor) {f.y=floor;f.vy=Math.abs(f.vy)*.20;f.vx*=.72;f.vz*=.72;}
    f.life-=worldDt;
    if (f.life<=0) state.fragments.splice(i,1);
  }
  if (state.transition>0) {
    state.transition-=dt;
    if (state.transition<=0) {
      if (containersPreviewEnabled || state.levelIndex === LEVELS.length - 1) finish(true);
      else {state.health=Math.min(3,state.health+1);loadLevel(state.levelIndex+1);}
    }
  }
  updateHud();
}

function updateHud() {
  const percent = state.speed * 100;
  $('time-pct').textContent = `${percent < 1 ? percent.toFixed(1) : String(Math.round(percent)).padStart(2, '0')}%`;
  $('time-fill').style.width = `${Math.max(3,state.speed*100)}%`;
  $('ammo').innerHTML = `${String(Math.max(0, state.ammo)).padStart(2,'0')}<span>/${nativeGameplay() ? '05' : '06'}</span>`;
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
    const t=segmentSphere(from,to,vec(enemy.x,enemy.y + 1.3,enemy.z),.57);
    if(t!==null && t<max) return enemy;
  }
  return null;
}

function drawInspectedEnemy() {
  enemyInspectionMatrix[0] = nativeSkinInfo ? -1 : 1;
  const clip = $('private-animation').value;
  const statePlayback = Boolean(nativeSkinInfo?.states[clip]);
  nativeEnemyStats = renderer.drawNativeSkin(enemyInspectionMatrix, clip,
    state.runClock - nativeInspectionAt, {
      statePlayback, shaderTime: state.runClock, cameraPosition: state.camera,
    })
    ?? renderer.drawLocalEnemyDiagnostic(enemyInspectionMatrix);
  if (nativeEnemyStats?.weaponAttachmentMatrix) {
    renderer.drawNativeWeapon(nativeEnemyStats.weaponAttachmentMatrix, true);
  }
}

function enemyFireAction(enemy, animationClock) {
  if (!Number.isFinite(enemy.attackIntentAt) || !nativeSkinInfo?.availableActions.includes('fire')) return null;
  const timing = nativeSkinInfo.actionTiming.fire;
  const speed = nativeSkinInfo.states.fire.speed;
  const sourceDuration = nativeSkinInfo.actionDurations.fire;
  const elapsed = animationClock - enemy.attackIntentAt;
  const exitAt = sourceDuration / speed * timing.exitTime;
  if (elapsed < 0 || elapsed >= exitAt + timing.exitDuration) return null;
  const blend = Math.min(1, elapsed / timing.entryDuration,
    Math.max(0, 1 - (elapsed - exitAt) / timing.exitDuration));
  return { state: 'fire', time: Math.min(sourceDuration, elapsed * speed), weight: 1, blend };
}

function drawEnemy(enemy) {
  if (containersPreviewEnabled && localNativeEnemy) {
    const angle = (nativeSkinInfo ? Math.PI : 0) - enemy.face, c = Math.cos(angle), s = Math.sin(angle);
    const mirror = nativeSkinInfo ? -1 : 1;
    actorMatrix.set([c*mirror,0,-s*mirror,0, 0,1,0,0, s,0,c,0, enemy.x,enemy.y,enemy.z,1]);
    const dying = !enemy.alive;
    // Native Kill disables Animator at the actual impact pose; hit is a stun clip.
    const animationClock = dying ? enemy.deathAt : state.worldClock;
    const requested = dying ? (enemy.animation?.state ?? 'idle') : enemy.walking ? 'walk' : 'idle';
    const statePlayback = Boolean(nativeSkinInfo?.states[requested]);
    if (!enemy.animation) enemy.animation = { state: requested, startedAt: animationClock, previous: null };
    const animation = enemy.animation;
    if (animation.previous && animationClock - animation.startedAt >= animation.previous.duration) {
      animation.previous = null;
    }
    if (!dying && animation.state !== requested && !animation.previous) {
      const duration = nativeSkinInfo?.transitions[animation.state + '->' + requested];
      animation.previous = duration ? { state: animation.state,
        startedAt: animation.startedAt, duration } : null;
      animation.state = requested; animation.startedAt = state.worldClock;
    }
    const transition = animation.previous ? {
      from: animation.previous.state,
      fromTime: animationClock - animation.previous.startedAt,
      elapsed: animationClock - animation.startedAt,
    } : null;
    const time = animationClock - animation.startedAt;
    nativeEnemyStats = renderer.drawNativeSkin(actorMatrix, animation.state, time, {
      statePlayback, transition, action: enemyFireAction(enemy, animationClock),
      shaderTime: state.runClock, cameraPosition: state.camera,
    })
      ?? renderer.drawLocalEnemyDiagnostic(actorMatrix);
    if (enemy.alive && nativeEnemyStats?.weaponAttachmentMatrix) {
      renderer.drawNativeWeapon(nativeEnemyStats.weaponAttachmentMatrix, true);
    }
    return;
  }
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
  if (nativeGameplay()) {
    const angle = state.worldClock * .65, c = Math.cos(angle), s = Math.sin(angle);
    weaponMatrix.set([c,0,-s,0, 0,1,0,0, s,0,c,0, drop.x,drop.y+bob,drop.z,1]);
    renderer.drawNativeWeapon(weaponMatrix);
    return;
  }
  const floorY = drop.y - .38;
  renderer.box(drop.x,floorY+.25+bob,drop.z,.58,.15,.16,GUN,0,state.worldClock*.65);
  renderer.box(drop.x-.12,floorY+.12+bob,drop.z,.14,.24,.13,METAL,0,state.worldClock*.65);
  renderer.box(drop.x,floorY+.025,drop.z,.65,.018,.44,'#c1cbd2');
}
function drawViewModel(camera) {
  const axes=cameraAxes(camera.yaw,camera.pitch);
  const sway=Math.sin(state.walkCycle)*.013;
  const bob=Math.cos(state.walkCycle*.5)*.012;
  const shot=state.recoil*.13;
  if (nativeGameplay() && state.weapon) {
    const hand = nativeScene.firstPersonPistol?.handPosition;
    if (hand) {
      const position = add3(add3(add3(camera, multiply3(axes.right, hand[0])),
        multiply3(axes.up, hand[1] - shot * .4)), multiply3(axes.forward, hand[2] - shot));
      // Source model vertices mirror Unity X. Its forward axis is +Z, not the
      // camera's browser-local -Z; use the actual first-person prefab chain.
      weaponMatrix.set([-axes.right.x,-axes.right.y,-axes.right.z,0,
        axes.up.x,axes.up.y,axes.up.z,0, axes.forward.x,axes.forward.y,axes.forward.z,0,
        position.x,position.y,position.z,1]);
      renderer.drawFirstPersonWeapon(weaponMatrix);
    }
    return;
  }
  if (nativeGameplay()) return; // No source unarmed hand model is supplied.
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
  if (type === 'throw' && nativeGameplay()) {
    const axes = cameraAxes(yaw, pitch);
    weaponMatrix.set([axes.right.x,axes.right.y,axes.right.z,0,
      axes.up.x,axes.up.y,axes.up.z,0, -axes.forward.x,-axes.forward.y,-axes.forward.z,0,
      pos.x,pos.y,pos.z,1]);
    renderer.drawNativeWeapon(weaponMatrix);
    return;
  }
  const color=friendly?BLACK:RED_LIGHT;
  const thickness=type==='throw'?.19:friendly?.065:.12;
  const trail=type==='throw'?.42:friendly?.48:1.15;
  renderer.box(pos.x,pos.y,pos.z,thickness,thickness,trail,color,pitch,-yaw);
  if(!friendly) renderer.shard(pos.x,pos.y,pos.z,.27,.27,.27,RED_LIGHT);
}
function render() {
  nativeEnemyStats = null;
  const cam={...state.camera};
  if(state.screen==='playing') cam.y+=Math.sin(state.walkCycle)*.012;
  // Native materials apply their source lighting/fog; do not add generated Web fog.
  // Other modes preserve the generated Web fog profile.
  renderer.begin(cam, containersPreviewEnabled ? {
    fogStrength: 0, projection: nativeScene?.camera.projection,
    scaledTime: state.worldClock, unscaledTime: state.runClock, timeScale: state.speed,
  } : undefined);
  if (!containersPreviewEnabled) {
    for(const object of state.objects) {
      renderer.box(object.x,object.y,object.z,object.w,object.h,object.d,object.color);
    }
  }
  if (containersPreviewEnabled && nativeScene) {
    manifestStats = nativeInspection ? null : renderer.drawNativeWorld();
    if (nativeInspection) {
      drawInspectedEnemy();
    }
  } else if (containersPreviewEnabled && !localAssetManifest?.assets?.scenePackage) {
    // SH-04/11: three independently joined Mesh6 submeshes share almost
    // congruent, world-batched local geometry. This is a SOURCE-CONVERTED
    // approximation, drawn only from an owner-selected local OBJ6 group47.
    const mesh6Plan = planLocalMesh6Draws({
      group47Loaded: localNativeMeshes.has('mesh6'),
    });
    const omitCargoIds = [];
    let privateIndexedDraws = 0, convertedTrianglesDrawn = 0;
    // Draw indexed originals first, then suppress ONLY the matching synthetic
    // hull/ribs for successfully submitted ranges. Never copy native bytes to Git.
    for (const packet of mesh6Plan.drawPackets) {
      if (renderer.drawPrivateMesh(packet.gpuSlot, '#485761', packet.modelMatrix)) {
        privateIndexedDraws++;
        convertedTrianglesDrawn += 1546;
        if (packet.id === 'cargo-22' || packet.id === 'cargo-7') omitCargoIds.push(packet.id);
      }
    }
    for (const packet of localMesh7DrawPackets) {
      if (renderer.drawPrivateMesh(packet.gpuSlot, '#f6f8f9', packet.modelMatrix, packet.drawRange)) {
        privateIndexedDraws++;
        convertedTrianglesDrawn += packet.drawRange.indexCount / 3;
        omitCargoIds.push(packet.generatedProxyCandidate);
      }
    }
    manifestStats = drawContainersBuild28Preview(renderer, cam, {
      aspect: canvas.width / Math.max(1, canvas.height),
      omitCargoIds,
    });
    const target = state.enemies.find(enemy => enemy.alive);
    if (nativeInspection) {
      drawInspectedEnemy();
    } else if (target) drawEnemy(target);
    else nativeEnemyStats = null;
    // Prototype-only weapon, bullet and impact visuals; authentic MCD
    // weapon rigs, enemy AI, combat damage and animation remain unverified.
    for (const drop of state.drops) drawPickup(drop);
    for (const bullet of state.bullets) drawBullet(bullet);
    for (const p of state.fragments) renderer.shard(
      p.x, p.y, p.z, p.sx, p.sy, p.sz, p.color, p.rx, p.ry, p.rz,
      clamp(p.life / .6, 0, 1),
    );
    if (state.screen === 'playing') drawViewModel(cam);
    manifestStats = {
      ...manifestStats,
      privateIndexedDraws, convertedTrianglesDrawn,
      verifiedLocalMesh7RangeDraws: localMesh7DrawPackets.length,
      localFilePreviewOnly: true, sourceConvertedApproximationOnly: true,
      sourceQualifiedMesh6DrawPackets: mesh6Plan.drawPackets.length,
      collisionConnected: state.solids.length === 5,
      sourceDerivedColliderCount: state.solids.length,
      shootableWebFallbackEnemy: Boolean(target && nativeEnemyStats),
      nativeMeshMatch: false, nativeEnemySpawnVerified: false,
      nativeCombatParityVerified: false,
    };
  }
  if (syntheticManifest) {
    manifestStats = drawGeneratedManifest(renderer, syntheticManifest, cam, {
      aspect: canvas.width / Math.max(1, canvas.height),
    });
  }
  if (!containersPreviewEnabled || nativeGameplay()) {
    for(const drop of state.drops) drawPickup(drop);
    for(const enemy of state.enemies) {
      if(enemy.alive || (containersPreviewEnabled && nativeSkinInfo && enemy.deathAt !== null && state.worldClock - enemy.deathAt < .8)) drawEnemy(enemy);
    }
    for(const bullet of state.bullets) drawBullet(bullet);
    for(const p of state.fragments) renderer.shard(p.x,p.y,p.z,p.sx,p.sy,p.sz,p.color,p.rx,p.ry,p.rz,clamp(p.life/.6,0,1));
    if(state.screen==='playing') drawViewModel(cam);
  }
  renderedFrameSnapshot = {
    frameId: ++renderedFrameId, activeScreen: state.screen, camera: { ...cam },
    worldClock: state.worldClock,
    nativeEnemy: nativeEnemyStats,
    generatedManifest: manifestStats,
    totalWebGLDrawCalls: renderer.getDrawCalls(),
    nativeScene: nativeScene ? { source: nativeScene.source, meshes: nativeScene.meshes.size,
      instances: nativeScene.instances.length, textures: nativeScene.textures.size } : null,
    gameplay: { timeScale: state.speed, nativeClock: nativeGameplay(),
      ammo: state.ammo, fireDelay: state.fireDelay, weapon: state.weapon,
      initialEquipment: nativeGameplay() ? nativeScene.initialEquipment : null,
      hop: state.hop, velocity: { ...nativeVelocity }, audio: audio.getMetrics() },
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
      mode: containersPreviewEnabled ? (nativeScene ? 'NATIVE_ORIGINAL_GEOMETRY_WEB_GAMEPLAY' :
        localAssetManifest?.assets?.scenePackage ? 'NATIVE_SCENE_NOT_LOADED' :
          'CONTAINERS_COLLIDER_PROXY_NOT_MCD_RUNTIME') : 'SYNTHETIC_NOT_MCD',
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
      skinAnimationVerified: Boolean(nativeEnemyStats?.skinned && nativeSkinInfo),
      nativeSkin: nativeSkinInfo,
      nativeScene: nativeScene ? { source: nativeScene.source, meshes: nativeScene.meshes.size, instances: nativeScene.instances.length,
        textures: nativeScene.textures.size, sourceCameraProjection: nativeScene.camera.projection } : null,
      enemies: state.enemies.map(e => ({ x:e.x,y:e.y,z:e.z,alive:e.alive,
        clip:e.animation?.state ?? (e.walking ? 'walk' : 'idle'),clock:e.clock,
        poseFrozenAtDeath: !e.alive && Boolean(nativeSkinInfo) })),
      nativeActionActivationVerified: false,
      worldClock: state.worldClock,
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
