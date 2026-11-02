const clamp01 = value => Math.max(0, Math.min(1, value));
const kinds = ['none', 'gun', 'katana', 'takedown', 'hand', 'katanaFly', 'shurikenRecall', 'melee', 'bossGhost'];
const assetId = /^sceneHud_\d{3}$/;

/** Local source glyphs, Crosshair/Crosshair2D clocks and normal-mode HUD fade.
 * configure(gameplay.hud, loopbackManifest.assets); setActive(nativeGameplay); reset() on a new run.
 * update receives REAL dt, world timeScale, and WORLD cooldown/attackDelay.
 * kind is a source crosshair type, not a weapon name; hand means a usable pickup.
 * DOM luminance masks are not the native fullscreen composition shader.
 */
export function createNativeHud(element, crosshair, health) {
  let source = null, active = false, type = null, punchRemaining = 0;
  let fade = 0, moved = false, fadeDirection = 0, wasCooling = false;
  let lastHealth = -1, lastCapacity = -1;
  const originalLabel = health.getAttribute('aria-label');

  const originalRole = health.getAttribute('role');
  function reset() {
    type = null;
    punchRemaining = 0;
    fade = source?.initialHealthOpacity ?? 0;
    moved = false;
    fadeDirection = 0;
    wasCooling = false;
    lastHealth = lastCapacity = -1;
    if (active) {
      crosshair.style.opacity = '0';
      health.style.opacity = String(fade);
    }
  }

  function configure(packet, availableAssets) {
    if (!assetId.test(packet?.heartTextureId) || kinds.some(kind => {
      const binding = packet?.crosshairs?.[kind];
      return !assetId.test(binding?.textureId) || !Number.isFinite(binding?.scale) || binding.scale <= 0;
    }) || !(packet.punchTime > 0) || !Number.isFinite(packet.punchTime)
      || !(packet.punchScale > 0) || !Number.isFinite(packet.punchScale)
      || !Number.isFinite(packet.initialHealthOpacity) || packet.initialHealthOpacity < 0 || packet.initialHealthOpacity > 1) {
      throw new TypeError('Complete source HUD textures, scales and timing are required');
    }
    // The recovered package can reference sceneHud_NNN without its sprites
    // being served. Check the existing loopback allowlist manifest before any
    // DOM masks become active; never draw broken/private-asset placeholders.
    // Manifest membership is NOT proof that the image has decoded successfully.
    const referencedIds = [...new Set([
      packet.heartTextureId,
      ...kinds.map(kind => packet.crosshairs[kind].textureId),
    ])];
    const missingAssetIds = referencedIds.filter(id =>
      availableAssets?.[id]?.type !== 'image/png');
    if (missingAssetIds.length) {
      setActive(false);
      source = null;
      reset();
      return Object.freeze({
        ready: false, missingAssetIds: Object.freeze(missingAssetIds),
      });
    }
    source = packet;
    reset();
    return Object.freeze({ ready: true, missingAssetIds: Object.freeze([]) });
  }

  function setActive(value) {
    const next = Boolean(value && source);
    if (next === active) return;
    active = next;
    element.classList.toggle('native-hud', active);
    crosshair.classList.toggle('native-crosshair', active);
    if (active) {
      health.setAttribute('role', 'img');
      reset();
    } else {
      for (const property of ['mask-image', 'width', 'height', 'transform', 'opacity']) crosshair.style.removeProperty(property);
      health.style.removeProperty('opacity');
      health.replaceChildren();
      if (originalLabel === null) health.removeAttribute('aria-label');
      else health.setAttribute('aria-label', originalLabel);
      if (originalRole === null) health.removeAttribute('role');
      else health.setAttribute('role', originalRole);
    }
  }

  function update({dt, timeScale, kind, hp, capacity, cooldown = 0, attackDelay = 0, visible = true, forcePunch = false}) {
    if (!active) return;
    const binding = Object.hasOwn(source.crosshairs, kind) ? source.crosshairs[kind] : null;
    if (!binding) throw new RangeError('Original crosshair type unavailable: ' + kind);
    if (!Number.isFinite(dt) || dt < 0 || !Number.isFinite(timeScale) || timeScale < 0
      || !Number.isInteger(hp) || !Number.isInteger(capacity) || capacity < 0 || hp < 0 || hp > capacity
      || !Number.isFinite(cooldown) || !Number.isFinite(attackDelay)) {
      throw new RangeError('HUD needs nonnegative clocks and integer health within capacity');
    }
    const changed = kind !== type;
    if (changed) {
      type = kind;
      crosshair.style.maskImage = `url("/local-assets/${binding.textureId}")`;
      punchRemaining = 0;
      wasCooling = false;
    }
    if ((changed || forcePunch) && kind !== 'none' && kind !== 'gun') punchRemaining = source.punchTime;
    const cooling = kind === 'gun' && cooldown > 0 && attackDelay > 0;
    if (wasCooling && !cooling) punchRemaining = source.punchTime;
    wasCooling = cooling;
    punchRemaining = Math.max(0, punchRemaining - dt);
    const progress = 1 - punchRemaining / source.punchTime;
    const punch = 1 + (source.punchScale - 1) * (1 - progress ** 3);
    const scale = binding.scale * (cooling ? 0.75 : punch);
    // Source fullscreen UV size is 22 / internalScale, aspect compensated.
    const size = element.clientWidth * scale / 22;
    crosshair.style.width = crosshair.style.height = `${size}px`;
    const angle = cooling ? 90 * clamp01(cooldown / attackDelay) : 0;
    crosshair.style.transform = `translate(-50%,-50%) rotate(${angle}deg)`;
    crosshair.style.opacity = visible ? '1' : '0';

    const moving = timeScale > 0.01;
    if (moving !== moved) {
      fadeDirection = moving ? -1 : 1;
      moved = moving;
    }
    fade = clamp01(fade + dt * fadeDirection / 2);
    health.style.opacity = visible ? String(fade) : '0';
    if (lastCapacity !== capacity) {
      health.replaceChildren();
      for (let index = 0; index < capacity; index++) {
        const heart = health.ownerDocument.createElement('i');
        heart.setAttribute('aria-hidden', 'true');
        heart.style.backgroundImage = `url("/local-assets/${source.heartTextureId}")`;
        health.append(heart);
      }
    }
    if (lastHealth !== hp || lastCapacity !== capacity) {
      for (let index = 0; index < capacity; index++) {
        health.children[index].style.backgroundPosition = index < hp ? 'left center' : 'right center';
      }
      health.setAttribute('aria-label', `Vie : ${hp} / ${capacity}`);
      lastHealth = hp;
      lastCapacity = capacity;
    }
  }
  return Object.freeze({configure, setActive, update, reset});
}
