/**
 * A pure, caller-authored bone-pose blend for a Web prototype.
 * This is not MCD Animator, rig hierarchy, or Unity transition behaviour.
 */
const MAX_BONES = 2048;
const AXES = ['x', 'y', 'z'];
const ROTATION_AXES = ['x', 'y', 'z', 'w'];

function requireFinite(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
}

function requireVector(value, name, axes) {
  if (!value || typeof value !== 'object') {
    throw new TypeError(`${name} must be an object`);
  }
  for (const axis of axes) requireFinite(value[axis], `${name}.${axis}`);
}

function normalizeQuaternion(rotation, name) {
  requireVector(rotation, name, ROTATION_AXES);
  const norm = Math.hypot(rotation.x, rotation.y, rotation.z, rotation.w);
  if (!Number.isFinite(norm) || norm <= 0) {
    throw new RangeError(`${name} must have a finite, nonzero norm`);
  }
  return ROTATION_AXES.map((axis) => rotation[axis] / norm);
}

function readPose(pose, label) {
  if (!Array.isArray(pose) || pose.length > MAX_BONES) {
    throw new RangeError(`${label} must be an array of at most ${MAX_BONES} bones`);
  }
  const result = new Map();
  for (const [index, bone] of pose.entries()) {
    if (!bone || typeof bone !== 'object' || typeof bone.id !== 'string' || bone.id.length === 0) {
      throw new TypeError(`${label}[${index}] must have a non-empty string id`);
    }
    if (result.has(bone.id)) throw new RangeError(`${label} has duplicate bone id ${bone.id}`);
    requireVector(bone.position, `${label}[${index}].position`, AXES);
    const rotation = normalizeQuaternion(bone.rotation, `${label}[${index}].rotation`);
    result.set(bone.id, { position: bone.position, rotation });
  }
  return result;
}

function blendRotation(left, right, weight) {
  // q and -q describe the same orientation. Choose the shortest spherical arc.
  let dot = left.reduce((sum, value, i) => sum + value * right[i], 0);
  let target = right;
  if (dot < 0) {
    target = right.map((value) => -value);
    dot = -dot;
  }
  dot = Math.min(1, Math.max(0, dot));
  let a = 1 - weight;
  let b = weight;
  if (dot < 0.9995) {
    const theta = Math.acos(dot);
    const inverse = 1 / Math.sin(theta);
    a = Math.sin((1 - weight) * theta) * inverse;
    b = Math.sin(weight * theta) * inverse;
  }
  const blended = left.map((value, i) => a * value + b * target[i]);
  const norm = Math.hypot(...blended);
  if (!(norm > 0) || !Number.isFinite(norm)) {
    throw new RangeError('blended quaternion is degenerate');
  }
  return Object.fromEntries(ROTATION_AXES.map((axis, index) => [axis, blended[index] / norm]));
}

/**
 * Blend matching caller-authored bone IDs with linear translation and shortest-
 * path quaternion interpolation. Output order is the `fromPose` bone order.
 *
 * No skeletal hierarchy, additive layer, clip clock, or native state machine is
 * inferred. Mismatched IDs and invalid transforms fail rather than guessing.
 */
export function blendBonePoses(fromPose, toPose, weight) {
  requireFinite(weight, 'weight');
  if (weight < 0 || weight > 1) throw new RangeError('weight must be between 0 and 1');
  const from = readPose(fromPose, 'fromPose');
  const to = readPose(toPose, 'toPose');
  if (from.size !== to.size || [...from.keys()].some((id) => !to.has(id))) {
    throw new RangeError('poses must have identical bone IDs');
  }
  const bones = [];
  for (const [id, left] of from) {
    const right = to.get(id);
    const position = {};
    for (const axis of AXES) {
      position[axis] = (1 - weight) * left.position[axis] + weight * right.position[axis];
      if (!Number.isFinite(position[axis])) throw new RangeError('blended translation overflows');
    }
    bones.push({ id, position, rotation: blendRotation(left.rotation, right.rotation, weight) });
  }
  return bones;
}
