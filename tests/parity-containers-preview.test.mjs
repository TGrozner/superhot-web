import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { drawContainersBuild28Preview } from '../src/levels.js';
import {
  CONTAINERS_BUILD28_HULLS,
  CONTAINERS_BUILD28_DEMO_CAMERA,
  createContainersBuild28DrawPlan,
} from '../src/scenes/containers-build28.js';

test('Containers generated collider proxy is a bounded, sourced SH04 scene slice', () => {
  assert.equal(CONTAINERS_BUILD28_HULLS.length, 5);
  assert.equal(new Set(CONTAINERS_BUILD28_HULLS.map((h) => h.id)).size, 5);
  assert.ok(CONTAINERS_BUILD28_HULLS.some((h) => h.center[1] > 5));
  const plan = createContainersBuild28DrawPlan();
  assert.ok(plan.packets.length >= 5);
  assert.equal(plan.affineRequired, 0);
  assert.equal(plan.packets.every((p) => p.legacyBoxArgs?.length === 7), true);
});

test('SH05 adapter connects native-sourced collider envelopes to actual Web box calls', () => {
  const draws = [];
  const renderer = { box: (...args) => draws.push(args) };
  const viewport = { aspect: 16 / 9 };
  const plan = createContainersBuild28DrawPlan(CONTAINERS_BUILD28_DEMO_CAMERA, viewport);
  const result = drawContainersBuild28Preview(renderer, CONTAINERS_BUILD28_DEMO_CAMERA, viewport);
  assert.equal(result.objects, 46);
  assert.equal(result.nativeDerivedHullCount, 5);
  assert.equal(result.visible, plan.packets.length);
  assert.equal(result.visible, draws.length);
  assert.equal(result.affineDraws, 0);
  assert.equal(result.legacyDraws, draws.length);
  assert.equal(result.collisionConnected, false);
  assert.equal(result.nativeMeshMatch, false);
  for (const args of draws) {
    assert.equal(args.length, 7);
    assert.ok(args.slice(0, 6).every(Number.isFinite));
    assert.match(args[6], /^#[0-9a-f]{6}$/i);
  }
});

test('Containers view frustum culls distant proxies before invoking WebGL draw calls', () => {
  const draws = [];
  const farCamera = { ...CONTAINERS_BUILD28_DEMO_CAMERA, z: 200 };
  const result = drawContainersBuild28Preview({ box: (...args) => draws.push(args) },
    farCamera, { far: 60 });
  assert.equal(result.visible, 0);
  assert.equal(draws.length, 0);
});

test('browser path is explicitly opt-in and isolated from prototype levels/collisions', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /get\('scene'\) === 'containers'/);
  assert.match(main, /drawContainersBuild28Preview\(renderer, cam/);
  assert.match(main, /CONTAINERS_COLLIDER_PROXY_NOT_MCD_RUNTIME/);
  assert.match(main, /CONTAINERS BUILD28 · GENERATED PROXY ONLY · NOT MCD GAMEPLAY/);
  assert.match(main, /state\.solids = \[\];/);
  assert.match(main, /state\.enemies = \[\];/);
  assert.match(main, /if \(!containersPreviewEnabled\) \{/);
  // The first synthetic preview and the default original mode are retained.
  assert.match(main, /get\('scene'\) === 'synthetic'/);
  assert.match(main, /if \(syntheticManifest\) \{/);
});
