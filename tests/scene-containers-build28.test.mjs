import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTAINERS_BUILD28_HULLS,
  CONTAINERS_BUILD28_DEMO_CAMERA,
  createContainersBuild28Nodes,
  createContainersBuild28DrawPlan,
} from '../src/scenes/containers-build28.js';

test('build28 slice uses five distinct cargo collision-envelope proxies, not native meshes', () => {
  assert.equal(CONTAINERS_BUILD28_HULLS.length, 5);
  assert.equal(new Set(CONTAINERS_BUILD28_HULLS.map((entry) => entry.id)).size, 5);
  assert.deepEqual(CONTAINERS_BUILD28_HULLS.map((entry) => entry.center), [
    [17.45, 2.575, 13.975], [17.475, 5.725, 15.8], [4.575, 2.575, 15.9],
    [14.5, 2.575, 16.825], [10.1, 2.575, 18.475],
  ]);
  assert.deepEqual(CONTAINERS_BUILD28_HULLS.map((entry) => [...entry.size].sort((a, b) => a - b)), [
    [3, 3.198, 8.21], [3, 3.198, 8.21], [3, 3.198, 8.21],
    [3, 3.198, 8.21], [3, 3.198, 8.21],
  ]);
  assert.ok(CONTAINERS_BUILD28_HULLS[1].center[1] > CONTAINERS_BUILD28_HULLS[0].center[1] + 3);
});

test('all presentation geometry is generated and stays in the SH-04 reserved graph format', () => {
  const nodes = createContainersBuild28Nodes();
  assert.equal(nodes.length, 46); // 5 hulls + 5*8 decorative ribs + synthetic ground.
  assert.equal(new Set(nodes.map((n) => n.id)).size, nodes.length);
  assert.equal(nodes.filter((n) => n.id.includes('-rib-')).length, 40);
  for (const node of nodes) {
    assert.equal(node.primitive.kind, 'box');
    assert.ok(['steel', 'porcelain', 'shadow', 'chalk'].includes(node.material));
    for (const value of [...Object.values(node.transform.position), ...Object.values(node.primitive.size)]) {
      assert.ok(Number.isFinite(value));
    }
    assert.ok(Object.values(node.primitive.size).every((size) => size > 0));
    assert.equal(node.parentId, undefined);
  }
  assert.notStrictEqual(createContainersBuild28Nodes(), nodes);
});

test('cargo ribs are synthetic face accents, not collisions or imported mesh data', () => {
  const nodes = createContainersBuild28Nodes();
  for (const hull of CONTAINERS_BUILD28_HULLS) {
    const ribNodes = nodes.filter((node) => node.id.startsWith(hull.id + '-rib-'));
    assert.equal(ribNodes.length, 8);
    assert.ok(ribNodes.every((node) => node.material === 'shadow'));
    const generatedShell = nodes.find((node) => node.id === hull.id);
    assert.deepEqual(Object.values(generatedShell.transform.position), hull.center);
    assert.deepEqual(Object.values(generatedShell.primitive.size), hull.size);
  }
});

test('the demo viewpoint yields visible, immediate legacy renderer.box draw packets', () => {
  const plan = createContainersBuild28DrawPlan();
  assert.ok(plan.packets.length >= 5, 'the cargo cluster must be visible from the synthetic demo camera');
  assert.equal(plan.affineRequired, 0, 'all generated proxies must work with current legacy renderer');
  assert.equal(plan.estimatedLegacyDrawCalls, plan.packets.length);
  for (const packet of plan.packets) {
    assert.equal(packet.mesh, 'box');
    assert.equal(packet.legacyBoxArgs.length, 7);
    assert.ok(packet.legacyBoxArgs.slice(0, 6).every(Number.isFinite));
    assert.ok(packet.legacyBoxArgs.slice(3, 6).every((x) => x > 0));
  }
  assert.ok(plan.packets.some((p) => p.id === 'cargo-upper'));
});

test('frustum rejects the distant generated slice; plans are deterministic snapshots', () => {
  const camera = { ...CONTAINERS_BUILD28_DEMO_CAMERA, z: 200 };
  const distant = createContainersBuild28DrawPlan(camera, { far: 60 });
  assert.equal(distant.packets.length, 0);
  const first = createContainersBuild28DrawPlan();
  const second = createContainersBuild28DrawPlan();
  assert.deepEqual(first, second);
});
