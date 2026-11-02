import { composeLocalMatrix, multiplyMatrices } from '../scenes/graph.js';
import { meshModelMatrices } from '../render/mesh-format.js';

const IDENTITY = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const isId = (id) => typeof id === 'string' && id.length > 0;
const finiteMatrix = (m) => m && m.length === 16 && Array.from(m).every(Number.isFinite);

function checkedTransform(transform, label) {
  if (transform == null) return { matrix: IDENTITY, source: {} };
  if (typeof transform !== 'object' || Array.isArray(transform)) throw new TypeError(label + ' must be a TRS object');
  const position = transform.position ? { ...transform.position } : undefined;
  const rotation = transform.rotation ? { ...transform.rotation } : undefined;
  const scale = transform.scale ? { ...transform.scale } : undefined;
  const source = { position, rotation, scale };
  const matrix = Object.freeze(composeLocalMatrix(source));
  return { matrix, source };
}

/**
 * Source-neutral hierarchy, not a Unity Animator evaluator. All ids and bind
 * transforms must come from an explicit caller-owned mapping. A native
 * Avatar/Animator reference by itself is NOT such a mapping.
 */
export function createCharacterRig({ joints, parts, provenance = 'caller-supplied-unverified' } = {}) {
  if (!Array.isArray(joints) || joints.length < 1 || joints.length > 128 ||
      !Array.isArray(parts) || !parts.length || parts.length > 128) {
    throw new RangeError('Rig requires 1..128 joints and 1..128 drawable parts');
  }
  const byId = new Map();
  for (const joint of joints) {
    if (!joint || !isId(joint.id) || byId.has(joint.id)) throw new TypeError('Joint ids must be unique nonempty strings');
    const parentId = joint.parentId ?? null;
    if (parentId !== null && !isId(parentId)) throw new TypeError('Invalid joint parent id');
    byId.set(joint.id, Object.freeze({
      id: joint.id, parentId,
      bind: checkedTransform(joint.bind, 'joint.bind').matrix,
    }));
  }
  const visiting = new Set(), visited = new Set(), ordered = [];
  function visit(id) {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error('Character joint cycle at ' + id);
    const joint = byId.get(id);
    if (!joint) throw new Error('Character joint parent missing: ' + id);
    visiting.add(id);
    if (joint.parentId !== null) visit(joint.parentId);
    visiting.delete(id);
    visited.add(id);
    ordered.push(joint);
  }
  for (const joint of joints) visit(joint.id);
  const partIds = new Set();
  const drawableParts = parts.map((part) => {
    if (!part || !isId(part.id) || partIds.has(part.id) ||
        !isId(part.jointId) || !byId.has(part.jointId) ||
        !isId(part.meshId) || !isId(part.materialKey)) {
      throw new TypeError('Drawable requires unique id and known joint, mesh and material keys');
    }
    partIds.add(part.id);
    return Object.freeze({
      id: part.id, jointId: part.jointId, meshId: part.meshId,
      materialKey: part.materialKey,
      local: checkedTransform(part.local, 'drawable.local').matrix,
    });
  });
  if (typeof provenance !== 'string' || !provenance.length) throw new TypeError('Missing rig provenance label');
  return Object.freeze({
    provenance,
    joints: Object.freeze(ordered),
    parts: Object.freeze(drawableParts),
  });
}

/**
 * Explicit caller-authored joint TRS DELTAS after bind: world=parent*bind*delta.
 * SH-06 must evaluate its own clip state, root motion, layering and retargeting;
 * this function never guesses sampled bone poses, clip times or event states.
 */
export function poseCharacterRig(rig, { rootMatrix = IDENTITY, jointDeltas = {} } = {}) {
  if (!rig || !Array.isArray(rig.joints) || !Array.isArray(rig.parts)) {
    throw new TypeError('Expected createCharacterRig result');
  }
  if (!finiteMatrix(rootMatrix)) throw new TypeError('Character root requires a finite 4x4 matrix');
  // Reject singular global matrices before any GPU upload.
  meshModelMatrices(rootMatrix);
  if (!jointDeltas || typeof jointDeltas !== 'object' || Array.isArray(jointDeltas)) {
    throw new TypeError('jointDeltas must be an id -> TRS object');
  }
  const known = new Set(rig.joints.map((j) => j.id));
  for (const id of Object.keys(jointDeltas)) {
    if (!known.has(id)) throw new Error('Unknown posed joint: ' + id);
  }
  const jointMatrices = new Map();
  for (const joint of rig.joints) {
    const parent = joint.parentId === null ? rootMatrix : jointMatrices.get(joint.parentId);
    const delta = checkedTransform(jointDeltas[joint.id], 'joint delta').matrix;
    const world = multiplyMatrices(multiplyMatrices(parent, joint.bind), delta);
    meshModelMatrices(world);
    jointMatrices.set(joint.id, Object.freeze(world));
  }
  const packets = rig.parts.map((part) => {
    const world = multiplyMatrices(jointMatrices.get(part.jointId), part.local);
    const matrices = meshModelMatrices(world);
    return Object.freeze({
      partId: part.id, jointId: part.jointId, meshId: part.meshId,
      materialKey: part.materialKey,
      model: matrices.model, normal: matrices.normal,
      mirrored: matrices.mirrored,
    });
  });
  return { provenance: rig.provenance, packets, jointMatrices };
}

/**
 * EXPLICITLY GENERATED stand-in for visual/pose plumbing. These names, sizes,
 * colors and part boundaries are not those of any verified MCD enemy prefab.
 */
export function makeGeneratedDiagnosticEnemyRig() {
  const p = (x, y, z) => ({ position: { x, y, z } });
  const j = (id, parentId, x, y, z) => ({ id, parentId, bind: p(x, y, z) });
  const joints = [
    j('root', null, 0, 0, 0),
    j('pelvis', 'root', 0, .9, 0),
    j('chest', 'pelvis', 0, .39, 0),
    j('neck', 'chest', 0, .43, 0),
    j('head', 'neck', 0, .24, 0),
    j('shoulderL', 'chest', -.43, .25, 0),
    j('elbowL', 'shoulderL', -.10, -.40, 0),
    j('shoulderR', 'chest', .43, .25, 0),
    j('elbowR', 'shoulderR', .10, -.40, 0),
    j('thighL', 'pelvis', -.2, -.14, 0),
    j('kneeL', 'thighL', 0, -.47, 0),
    j('thighR', 'pelvis', .2, -.14, 0),
    j('kneeR', 'thighR', 0, -.47, 0),
  ];
  const part = (id, jointId, meshId, x, y, z, sx, sy, sz, materialKey = 'generated-red') => ({
    id, jointId, meshId, materialKey,
    local: { position: { x, y, z }, scale: { x: sx, y: sy, z: sz } },
  });
  const parts = [
    part('pelvis', 'pelvis', 'torso', 0, 0, 0, .55, .32, .36, 'generated-dark-red'),
    part('torso', 'chest', 'torso', 0, -.01, 0, .92, .8, .48),
    part('head', 'head', 'head', 0, 0, 0, .4, .53, .44),
    part('upperArmL', 'shoulderL', 'limb', 0, -.20, 0, .25, .42, .25),
    part('lowerArmL', 'elbowL', 'limb', 0, -.20, 0, .2, .42, .2),
    part('upperArmR', 'shoulderR', 'limb', 0, -.20, 0, .25, .42, .25),
    part('lowerArmR', 'elbowR', 'limb', 0, -.20, 0, .2, .42, .2),
    part('upperLegL', 'thighL', 'limb', 0, -.235, 0, .31, .49, .32, 'generated-dark-red'),
    part('lowerLegL', 'kneeL', 'limb', 0, -.235, 0, .25, .49, .27, 'generated-dark-red'),
    part('upperLegR', 'thighR', 'limb', 0, -.235, 0, .31, .49, .32, 'generated-dark-red'),
    part('lowerLegR', 'kneeR', 'limb', 0, -.235, 0, .25, .49, .27, 'generated-dark-red'),
  ];
  return createCharacterRig({
    joints, parts, provenance: 'procedural-diagnostic-not-native-MCD-rig-or-mesh',
  });
}
