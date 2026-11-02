import { createGeneratedLighting, lightingUniformPacket } from '../render/lighting-model.js';
import { NATIVE_MATERIAL_GLSL } from '../render/native-material.js';
import { RED_CRYSTAL_GLSL, RED_CRYSTAL_SOURCE } from '../render/red-crystal-pass.js';

const INFLUENCES_PER_VERTEX = 4;
const MAX_VERTICES = 1_000_000;
const MAX_BONES = 256;
const EPSILON = 1e-12;
const loadedPackages = new WeakSet();

const vertexShader = jointCount => `#version 300 es
precision highp float;
in vec3 aPosition;
in vec3 aNormal;
layout(location = 4) in vec2 aUV0;
in uvec4 aJointIndices;
in vec4 aWeights;
uniform mat4 uModel;
uniform mat4 uViewProjection;
uniform mat4 uJoints[${jointCount}];
uniform vec3 uLightDirection;
uniform vec2 uLightCoefficients;
out float vLight;
out vec2 vUV0;
out vec3 vWorldNormal;
out vec3 vWorldPosition;
out vec4 vClipPosition;
out vec3 vViewNormal;
out vec3 vCameraForward;
out vec3 vObjectCameraForward;
void main() {
  mat4 skin = aWeights.x * uJoints[int(aJointIndices.x)]
    + aWeights.y * uJoints[int(aJointIndices.y)]
    + aWeights.z * uJoints[int(aJointIndices.z)]
    + aWeights.w * uJoints[int(aJointIndices.w)];
  vec4 world = uModel * skin * vec4(aPosition, 1.0);
  mat3 worldLinear = mat3(uModel) * mat3(skin);
  vec3 normal = normalize(transpose(inverse(worldLinear)) * aNormal);
  vLight = uLightCoefficients.x
    + uLightCoefficients.y * max(dot(normal, uLightDirection), 0.0);
  vUV0 = aUV0;
  vWorldNormal = normal;
  vWorldPosition = world.xyz;
  vec3 cameraRight = normalize(vec3(
    uViewProjection[0].x, uViewProjection[1].x, uViewProjection[2].x));
  vec3 cameraUp = normalize(vec3(
    uViewProjection[0].y, uViewProjection[1].y, uViewProjection[2].y));
  vec3 cameraForward = normalize(vec3(
    uViewProjection[0].w, uViewProjection[1].w, uViewProjection[2].w));
  vViewNormal = vec3(dot(cameraRight, normal), dot(cameraUp, normal),
    -dot(cameraForward, normal));
  vCameraForward = cameraForward;
  vObjectCameraForward = inverse(mat3(uModel)) * cameraForward;
  vClipPosition = uViewProjection * world;
  gl_Position = vClipPosition;
}`;

const fragmentShader = `#version 300 es
precision highp float;
in float vLight;
in vec2 vUV0;
in vec3 vWorldNormal;
in vec3 vWorldPosition;
in vec4 vClipPosition;
in vec3 vViewNormal;
in vec3 vCameraForward;
in vec3 vObjectCameraForward;
uniform vec4 uColor;
uniform vec4 uRedCrystalControl;
uniform vec3 uCameraPosition;
uniform vec3 uSourceLightDirection;
out vec4 fragColor;
${NATIVE_MATERIAL_GLSL.redCrystalOutput}
${RED_CRYSTAL_GLSL}
void main() {
  if (uRedCrystalControl.x > 0.5) {
    vec2 screenUv = vClipPosition.xy / vClipPosition.w * 0.5 + 0.5;
    fragColor = nativeRedCrystalDefaultForward(
      vUV0, vWorldNormal, vWorldPosition, vViewNormal, vCameraForward,
      vObjectCameraForward, screenUv, uRedCrystalControl.z,
      uRedCrystalControl.y, uCameraPosition, uSourceLightDirection
    );
    return;
  }
  vec3 webProceduralRgb = uColor.rgb * vLight;
  fragColor = nativeRedCrystalFinalOutput(webProceduralRgb, vec4(0.0), vec3(0.0));
}`;

function numericArray(value, length, label) {
  if ((!Array.isArray(value) && !(ArrayBuffer.isView(value) && !(value instanceof DataView))) ||
      value.length !== length) {
    throw new TypeError(label + ' must have exactly ' + length + ' numeric components');
  }
  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] !== 'number' || !Number.isFinite(value[i])) {
      throw new TypeError(label + '[' + i + '] must be finite');
    }
  }
  return value;
}

function affineDeterminant(value, label) {
  numericArray(value, 16, label);
  if (value[3] !== 0 || value[7] !== 0 || value[11] !== 0 || value[15] !== 1) {
    throw new TypeError(label + ' must be column-major affine');
  }
  const determinant =
    value[0] * (value[5]*value[10] - value[6]*value[9]) -
    value[4] * (value[1]*value[10] - value[2]*value[9]) +
    value[8] * (value[1]*value[6] - value[2]*value[5]);
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-30) {
    throw new RangeError(label + ' is singular or unstable');
  }
  for (let i = 0; i < 16; i++) {
    if (!Number.isFinite(Math.fround(value[i]))) throw new RangeError(label + ' exceeds float32');
  }
  return determinant;
}

function affineMatrix(value, label) {
  affineDeterminant(value, label);
  return new Float32Array(value);
}

function explicitMetadata(value, label) {
  if (typeof value === 'string' && value.length) return value;
  if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length) {
    return Object.freeze({ ...value });
  }
  throw new TypeError(label + ' must explicitly identify the source/coordinate convention');
}

function explicitMetadataList(value, label) {
  if (!Array.isArray(value) || !value.length) {
    throw new TypeError(label + ' must contain explicit metadata entries');
  }
  return Object.freeze(value.map((entry, index) => explicitMetadata(entry, label + '[' + index + ']')));
}

function coordinateMetadata(value) {
  const coordinates = explicitMetadata(value, 'coordinates');
  if (typeof coordinates === 'string') {
    throw new TypeError('coordinates must describe every package coordinate field');
  }
  const required = [
    'space', 'axes', 'units', 'quaternion', 'boneOrder',
    'inverseBindMatrices', 'skinEquation', 'indices',
  ];
  if (required.some(key => typeof coordinates[key] !== 'string' || !coordinates[key].length) ||
      !/column-major/i.test(coordinates.inverseBindMatrices) ||
      !/boneModelMatrix.*inverseBindMatrix/i.test(coordinates.skinEquation)) {
    throw new TypeError('coordinates must explicitly describe axes, ordering and column-major skinning');
  }
  return coordinates;
}

function normalizedQuaternionInto(source, offset, output, outputOffset, label) {
  const x = source[offset], y = source[offset + 1], z = source[offset + 2], w = source[offset + 3];
  const length = Math.hypot(x, y, z, w);
  if (!Number.isFinite(length) || length < EPSILON) throw new RangeError(label + ' has a zero quaternion');
  output[outputOffset] = x / length;
  output[outputOffset + 1] = y / length;
  output[outputOffset + 2] = z / length;
  output[outputOffset + 3] = w / length;
}

function compileClip(name, clip, boneCount) {
  if (!clip || typeof clip !== 'object' || Array.isArray(clip) ||
      typeof clip.duration !== 'number' || !Number.isFinite(clip.duration) || clip.duration < 0 ||
      typeof clip.sampleRate !== 'number' || !Number.isFinite(clip.sampleRate) || clip.sampleRate <= 0 ||
      !Array.isArray(clip.frames) || !clip.frames.length) {
    throw new TypeError('Clip ' + name + ' needs duration, positive sampleRate and sampled local frames');
  }
  const positionWidth = boneCount * 3;
  const rotationWidth = boneCount * 4;
  const scaleWidth = boneCount * 3;
  const positions = new Float32Array(clip.frames.length * positionWidth);
  const rotations = new Float32Array(clip.frames.length * rotationWidth);
  const scales = new Float32Array(clip.frames.length * scaleWidth);
  clip.frames.forEach((frame, frameIndex) => {
    if (!frame || typeof frame !== 'object') throw new TypeError('Clip ' + name + ' has an invalid frame');
    numericArray(frame.positions, positionWidth, name + '.frames[' + frameIndex + '].positions');
    numericArray(frame.rotations, rotationWidth, name + '.frames[' + frameIndex + '].rotations');
    numericArray(frame.scales, scaleWidth, name + '.frames[' + frameIndex + '].scales');
    positions.set(frame.positions, frameIndex * positionWidth);
    scales.set(frame.scales, frameIndex * scaleWidth);
    for (let bone = 0; bone < boneCount; bone++) {
      normalizedQuaternionInto(frame.rotations, bone * 4, rotations,
        frameIndex * rotationWidth + bone * 4,
        name + '.frames[' + frameIndex + '].rotations[' + bone + ']');
    }
  });
  const coveredDuration = (clip.frames.length - 1) / clip.sampleRate;
  if (clip.duration > coveredDuration + 1e-5) {
    throw new RangeError('Clip ' + name + ' sampled frames do not cover its duration');
  }
  return Object.freeze({
    name, duration: clip.duration, sampleRate: clip.sampleRate,
    frameCount: clip.frames.length, positions, rotations, scales,
  });
}

function compileClipAliases(rawAliases, clips) {
  if (rawAliases == null) return;
  if (typeof rawAliases !== 'object' || Array.isArray(rawAliases)) {
    throw new TypeError('clipAliases must be an object');
  }
  for (const [alias, target] of Object.entries(rawAliases)) {
    if (!alias.length || typeof target !== 'string' || !target.length || clips[alias] || !clips[target]) {
      throw new TypeError('Invalid native clip alias ' + alias + ' -> ' + String(target));
    }
    clips[alias] = clips[target];
  }
}

function compileStates(rawStates, clips) {
  if (rawStates == null) return Object.freeze(Object.create(null));
  if (typeof rawStates !== 'object' || Array.isArray(rawStates)) {
    throw new TypeError('states must be an object');
  }
  const states = Object.create(null);
  for (const [name, state] of Object.entries(rawStates)) {
    if (!name.length || !state || typeof state !== 'object' || Array.isArray(state) ||
        typeof state.clip !== 'string' || !clips[state.clip] ||
        (state.playback !== 'loop' && state.playback !== 'clamp') ||
        typeof state.speed !== 'number' || !Number.isFinite(state.speed) || state.speed <= 0) {
      throw new TypeError('Invalid native animation state ' + name);
    }
    states[name] = Object.freeze({
      name, clip: state.clip, playback: state.playback, speed: state.speed,
    });
  }
  return Object.freeze(states);
}

function compileTransitions(rawTransitions, clips) {
  if (rawTransitions == null) return Object.freeze(Object.create(null));
  if (typeof rawTransitions !== 'object' || Array.isArray(rawTransitions)) {
    throw new TypeError('transitions must be an object');
  }
  const transitions = Object.create(null);
  for (const [key, transition] of Object.entries(rawTransitions)) {
    if (!transition || typeof transition !== 'object' || Array.isArray(transition) ||
        key !== transition.from + '->' + transition.to ||
        !clips[transition.from] || !clips[transition.to] ||
        typeof transition.duration !== 'number' || !Number.isFinite(transition.duration) ||
        transition.duration <= 0) {
      throw new TypeError('Invalid native animation transition ' + key);
    }
    transitions[key] = Object.freeze({
      from: transition.from, to: transition.to, duration: transition.duration,
      source: explicitMetadata(transition.source, 'transitions.' + key + '.source'),
    });
  }
  return Object.freeze(transitions);
}

function compileActionTiming(rawActionTiming, states) {
  if (rawActionTiming == null) return Object.freeze(Object.create(null));
  if (typeof rawActionTiming !== 'object' || Array.isArray(rawActionTiming)) {
    throw new TypeError('actionTiming must be an object');
  }
  const numericFields = new Set([
    'entryDuration', 'exitDuration', 'exitTime', 'normalExitDuration', 'normalExitTime',
  ]);
  const compiled = Object.create(null);
  for (const [stateName, timing] of Object.entries(rawActionTiming)) {
    if (!states[stateName] || !timing || typeof timing !== 'object' || Array.isArray(timing)) {
      throw new TypeError('Invalid native action timing ' + stateName);
    }
    const entry = {};
    for (const [name, value] of Object.entries(timing)) {
      if (numericFields.has(name)) {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
          throw new TypeError('Invalid native action timing ' + stateName + '.' + name);
        }
        entry[name] = value;
      } else if (name === 'hasFixedDuration' && typeof value === 'boolean') {
        entry[name] = value;
      } else {
        throw new TypeError('Unknown native action timing field ' + stateName + '.' + name);
      }
    }
    if (!Object.keys(entry).length) throw new TypeError('Native action timing cannot be empty');
    compiled[stateName] = Object.freeze(entry);
  }
  return Object.freeze(compiled);
}

function compileActionLayers(rawLayers, states, boneCount) {
  if (rawLayers == null) return Object.freeze(Object.create(null));
  if (typeof rawLayers !== 'object' || Array.isArray(rawLayers)) {
    throw new TypeError('actionLayers must be an object');
  }
  const layers = Object.create(null);
  for (const [name, layer] of Object.entries(rawLayers)) {
    if (!states[name] || !layer || typeof layer !== 'object' || Array.isArray(layer) ||
        layer.clip !== states[name].clip ||
        (layer.mode !== 'additive' && layer.mode !== 'override') ||
        typeof layer.defaultWeight !== 'number' || !Number.isFinite(layer.defaultWeight) ||
        layer.defaultWeight < 0 || layer.defaultWeight > 1 ||
        typeof layer.webComposable !== 'boolean') {
      throw new TypeError('Invalid native action layer ' + name);
    }
    numericArray(layer.mask, boneCount, 'actionLayers.' + name + '.mask');
    const mask = new Float32Array(layer.mask);
    for (let bone = 0; bone < mask.length; bone++) {
      if (mask[bone] < 0 || mask[bone] > 1) {
        throw new RangeError('Action mask weights must be in [0,1]');
      }
    }
    if (!layer.webComposable && (typeof layer.blocker !== 'string' || !layer.blocker.length)) {
      throw new TypeError('Unavailable native action layer needs an exact blocker');
    }
    layers[name] = Object.freeze({
      name, clip: layer.clip, mode: layer.mode, defaultWeight: layer.defaultWeight,
      mask, source: explicitMetadata(layer.source, 'actionLayers.' + name + '.source'),
      reference: layer.reference == null ? null :
        explicitMetadata(layer.reference, 'actionLayers.' + name + '.reference'),
      webComposable: layer.webComposable,
      blocker: layer.webComposable ? null : layer.blocker,
    });
  }
  return Object.freeze(layers);
}

function compileActionPrecompositions(rawPrecompositions, actionLayers, clips, boneCount) {
  if (rawPrecompositions == null) return Object.freeze(Object.create(null));
  if (typeof rawPrecompositions !== 'object' || Array.isArray(rawPrecompositions)) {
    throw new TypeError('actionPrecompositions must be an object');
  }
  const compiled = Object.create(null);
  for (const [name, raw] of Object.entries(rawPrecompositions)) {
    const layer = actionLayers[name];
    if (!layer || layer.mode !== 'additive' || !raw || typeof raw !== 'object' ||
        Array.isArray(raw) || raw.action !== name ||
        raw.composition !== 'nativeHumanoidAdditivePrecomposedGrid' ||
        typeof raw.actionStart !== 'number' || !Number.isFinite(raw.actionStart) ||
        typeof raw.actionStep !== 'number' || !Number.isFinite(raw.actionStep) || raw.actionStep <= 0 ||
        !Number.isSafeInteger(raw.actionCount) || raw.actionCount < 2 ||
        typeof raw.actionDuration !== 'number' || !Number.isFinite(raw.actionDuration) ||
        raw.actionDuration < raw.actionStart ||
        !Array.isArray(raw.layerWeights) || !raw.layerWeights.length ||
        raw.implicitZeroWeight !== true ||
        !Array.isArray(raw.bones) || !raw.bones.length ||
        !raw.baseClips || typeof raw.baseClips !== 'object' || Array.isArray(raw.baseClips)) {
      throw new TypeError('Invalid native action precomposition ' + name);
    }
    const seenBones = new Set();
    const bones = new Uint16Array(raw.bones.length);
    raw.bones.forEach((bone, index) => {
      if (!Number.isSafeInteger(bone) || bone < 0 || bone >= boneCount ||
          seenBones.has(bone) || layer.mask[bone] !== 1) {
        throw new RangeError('Invalid precomposed bone for native action ' + name);
      }
      seenBones.add(bone);
      bones[index] = bone;
    });
    for (let bone = 0; bone < boneCount; bone++) {
      if (layer.mask[bone] === 1 && !seenBones.has(bone)) {
        throw new RangeError('Native action precomposition omits masked bone ' + bone);
      }
    }
    let previousLayerWeight = 0;
    for (const weight of raw.layerWeights) {
      if (typeof weight !== 'number' || !Number.isFinite(weight) ||
          weight <= previousLayerWeight || weight > 1) {
        throw new RangeError('Invalid precomposed native layer-weight knot for ' + name);
      }
      previousLayerWeight = weight;
    }
    if (previousLayerWeight !== 1) {
      throw new RangeError('Native action precomposition must terminate at layer weight 1');
    }
    const baseClips = Object.create(null);
    const aliases = [];
    for (const [clipName, rawBase] of Object.entries(raw.baseClips)) {
      if (!clips[clipName] || !rawBase || typeof rawBase !== 'object' || Array.isArray(rawBase)) {
        throw new TypeError('Invalid precomposed base clip ' + clipName);
      }
      if (rawBase.alias != null) {
        if (typeof rawBase.alias !== 'string' || !rawBase.alias.length) {
          throw new TypeError('Invalid precomposed base alias ' + clipName);
        }
        aliases.push([clipName, rawBase.alias]);
        continue;
      }
      if (!Number.isSafeInteger(rawBase.phaseCount) || rawBase.phaseCount < 1) {
        throw new RangeError('Invalid precomposed phase count for ' + clipName);
      }
      const sampleCount = raw.layerWeights.length * rawBase.phaseCount *
        raw.actionCount * bones.length;
      numericArray(rawBase.positions, sampleCount * 3,
        'actionPrecompositions.' + name + '.baseClips.' + clipName + '.positions');
      numericArray(rawBase.rotations, sampleCount * 4,
        'actionPrecompositions.' + name + '.baseClips.' + clipName + '.rotations');
      numericArray(rawBase.scales, sampleCount * 3,
        'actionPrecompositions.' + name + '.baseClips.' + clipName + '.scales');
      const rotations = new Float32Array(sampleCount * 4);
      for (let sample = 0; sample < sampleCount; sample++) {
        normalizedQuaternionInto(rawBase.rotations, sample * 4, rotations, sample * 4,
          'actionPrecompositions.' + name + '.baseClips.' + clipName + '.rotations');
      }
      baseClips[clipName] = Object.freeze({
        phaseCount: rawBase.phaseCount,
        positions: new Float32Array(rawBase.positions),
        rotations,
        scales: new Float32Array(rawBase.scales),
      });
    }
    for (const [clipName, target] of aliases) {
      if (!baseClips[target]) {
        throw new Error('Native action precomposition alias unavailable: ' + clipName + ' -> ' + target);
      }
      baseClips[clipName] = baseClips[target];
    }
    compiled[name] = Object.freeze({
      name, composition: raw.composition, bones,
      actionStart: raw.actionStart, actionStep: raw.actionStep,
      actionCount: raw.actionCount, actionDuration: raw.actionDuration,
      layerWeights: Object.freeze(raw.layerWeights.slice()),
      baseClips: Object.freeze(baseClips),
      interpolation: explicitMetadata(raw.interpolation,
        'actionPrecompositions.' + name + '.interpolation'),
      timeDomain: explicitMetadata(raw.timeDomain,
        'actionPrecompositions.' + name + '.timeDomain'),
      evidence: explicitMetadata(raw.evidence,
        'actionPrecompositions.' + name + '.evidence'),
      heldOut: explicitMetadata(raw.heldOut,
        'actionPrecompositions.' + name + '.heldOut'),
      transitionHeldOut: explicitMetadata(raw.transitionHeldOut,
        'actionPrecompositions.' + name + '.transitionHeldOut'),
      activation: explicitMetadata(raw.activation,
        'actionPrecompositions.' + name + '.activation'),
      shootingIdleReference: explicitMetadata(raw.shootingIdleReference,
        'actionPrecompositions.' + name + '.shootingIdleReference'),
      shootingTransitionHeldOut: explicitMetadata(raw.shootingTransitionHeldOut,
        'actionPrecompositions.' + name + '.shootingTransitionHeldOut'),
      controllerTimeline: explicitMetadataList(raw.controllerTimeline,
        'actionPrecompositions.' + name + '.controllerTimeline'),
      limits: explicitMetadataList(raw.limits,
        'actionPrecompositions.' + name + '.limits'),
    });
  }
  for (const layer of Object.values(actionLayers)) {
    if (layer.webComposable && layer.mode === 'additive' && !compiled[layer.name]) {
      throw new Error('Composable additive action needs native precomposition: ' + layer.name);
    }
  }
  return Object.freeze(compiled);
}

/**
 * Validate and copy the public browser package emitted by the private extractor.
 * Geometry, skeleton locals and inverse binds must already share its explicit
 * renderer-local convention. This boundary never mirrors or guesses source data.
 */
export function loadNativeSkinPackage(sourcePackage) {
  if (loadedPackages.has(sourcePackage)) return sourcePackage;
  if (!sourcePackage || typeof sourcePackage !== 'object' || sourcePackage.schemaVersion !== 1) {
    throw new TypeError('Native skin package requires schemaVersion 1');
  }
  const source = explicitMetadata(sourcePackage.source, 'source');
  const coordinates = coordinateMetadata(sourcePackage.coordinates);
  const mesh = sourcePackage.mesh;
  const bones = sourcePackage.bones;
  if (!mesh || typeof mesh !== 'object' || !Array.isArray(bones) ||
      bones.length < 1 || bones.length > MAX_BONES) {
    throw new RangeError('Native skin package requires 1..' + MAX_BONES + ' bones and one mesh');
  }
  const vertexCount = mesh.positions?.length / 3;
  if (!Number.isSafeInteger(vertexCount) || vertexCount < 3 || vertexCount > MAX_VERTICES) {
    throw new RangeError('Native skin positions require 3..' + MAX_VERTICES + ' vertices');
  }
  numericArray(mesh.positions, vertexCount * 3, 'mesh.positions');
  numericArray(mesh.normals, vertexCount * 3, 'mesh.normals');
  const hasSourceUV0 = mesh.uv0 != null;
  if (hasSourceUV0) numericArray(mesh.uv0, vertexCount * 2, 'mesh.uv0');
  numericArray(mesh.jointIndices, vertexCount * INFLUENCES_PER_VERTEX, 'mesh.jointIndices');
  numericArray(mesh.weights, vertexCount * INFLUENCES_PER_VERTEX, 'mesh.weights');
  numericArray(mesh.inverseBindMatrices, bones.length * 16, 'mesh.inverseBindMatrices');
  if ((!Array.isArray(mesh.indices) && !(mesh.indices instanceof Uint16Array) &&
      !(mesh.indices instanceof Uint32Array)) || !mesh.indices.length || mesh.indices.length % 3) {
    throw new TypeError('mesh.indices must contain complete indexed triangles');
  }
  if (!Array.isArray(mesh.submeshes) || mesh.submeshes.length !== 1) {
    throw new RangeError('One indexed draw requires exactly one source submesh');
  }
  const submesh = mesh.submeshes[0];
  if (!submesh || submesh.firstIndex !== 0 || submesh.indexCount !== mesh.indices.length ||
      submesh.baseVertex !== 0 || submesh.topology !== 0) {
    throw new RangeError('Source submesh must be one complete base-zero triangle range');
  }
  if (mesh.indexComponentBits !== 16 && mesh.indexComponentBits !== 32) {
    throw new TypeError('mesh.indexComponentBits must be 16 or 32');
  }

  const names = new Set();
  const checkedBones = bones.map((bone, index) => {
    if (!bone || typeof bone.name !== 'string' || !bone.name.length || names.has(bone.name)) {
      throw new TypeError('Bone names must be unique nonempty strings');
    }
    names.add(bone.name);
    const parent = bone.parent == null ? -1 : bone.parent;
    if (!Number.isSafeInteger(parent) || parent < -1 || parent >= index) {
      throw new RangeError('bones must be parent-first; invalid parent at bone ' + index);
    }
    numericArray(bone.position, 3, 'bones[' + index + '].position');
    numericArray(bone.rotation, 4, 'bones[' + index + '].rotation');
    numericArray(bone.scale, 3, 'bones[' + index + '].scale');
    if (bone.scale.some(value => Math.abs(value) < EPSILON)) {
      throw new RangeError('Bone scale cannot be zero at bone ' + index);
    }
    const rotation = new Float32Array(4);
    normalizedQuaternionInto(bone.rotation, 0, rotation, 0, 'bones[' + index + '].rotation');
    return Object.freeze({
      name: bone.name, parent,
      position: new Float32Array(bone.position), rotation, scale: new Float32Array(bone.scale),
    });
  });

  const inverseBindMatrices = new Float32Array(bones.length * 16);
  for (let bone = 0; bone < bones.length; bone++) {
    inverseBindMatrices.set(affineMatrix(
      mesh.inverseBindMatrices.slice(bone * 16, bone * 16 + 16),
      'mesh.inverseBindMatrices[' + bone + ']'), bone * 16);
  }

  const positions = new Float32Array(mesh.positions);
  const normals = new Float32Array(mesh.normals);
  const uv0 = hasSourceUV0 ? new Float32Array(mesh.uv0) : null;
  for (let vertex = 0; vertex < vertexCount; vertex++) {
    const normalLength = Math.hypot(normals[vertex * 3], normals[vertex * 3 + 1], normals[vertex * 3 + 2]);
    if (!Number.isFinite(normalLength) || normalLength < EPSILON) {
      throw new RangeError('mesh.normals has a zero normal at vertex ' + vertex);
    }
  }
  let maxIndex = -1;
  for (const index of mesh.indices) {
    if (!Number.isSafeInteger(index) || index < 0 || index >= vertexCount) {
      throw new RangeError('mesh.indices contains an out-of-range vertex');
    }
    maxIndex = Math.max(maxIndex, index);
  }
  const indices = maxIndex <= 65535 ? new Uint16Array(mesh.indices) : new Uint32Array(mesh.indices);
  const jointIndices = new Uint16Array(vertexCount * INFLUENCES_PER_VERTEX);
  const weights = new Float32Array(vertexCount * INFLUENCES_PER_VERTEX);
  const weightedBones = new Set();
  for (let vertex = 0; vertex < vertexCount; vertex++) {
    let sum = 0;
    for (let slot = 0; slot < INFLUENCES_PER_VERTEX; slot++) {
      const offset = vertex * INFLUENCES_PER_VERTEX + slot;
      const joint = mesh.jointIndices[offset];
      const weight = mesh.weights[offset];
      if (!Number.isSafeInteger(joint) || joint < 0 || joint >= bones.length || weight < 0 || weight > 1) {
        throw new RangeError('Invalid joint influence at vertex ' + vertex);
      }
      jointIndices[offset] = joint;
      weights[offset] = weight;
      sum += weight;
      if (weight > 0) weightedBones.add(joint);
    }
    if (Math.abs(sum - 1) > 1e-5) {
      throw new RangeError('Joint weights must total 1 at vertex ' + vertex);
    }
  }

  const weightedBoneIndices = Uint16Array.from([...weightedBones].sort((a, b) => a - b));
  const paletteIndexByBone = new Int16Array(bones.length).fill(-1);
  weightedBoneIndices.forEach((bone, paletteIndex) => { paletteIndexByBone[bone] = paletteIndex; });
  const gpuJointIndices = new Uint8Array(jointIndices.length);
  for (let i = 0; i < gpuJointIndices.length; i++) {
    gpuJointIndices[i] = weights[i] === 0 ? 0 : paletteIndexByBone[jointIndices[i]];
  }

  const rawClips = sourcePackage.clips;
  if (!rawClips || typeof rawClips !== 'object' || Array.isArray(rawClips)) {
    throw new TypeError('clips must be an object; use {} when native samples are unavailable');
  }
  const clips = Object.create(null);
  for (const [name, clip] of Object.entries(rawClips)) {
    if (!name.length) throw new TypeError('Clip names cannot be empty');
    clips[name] = compileClip(name, clip, bones.length);
  }
  compileClipAliases(sourcePackage.clipAliases, clips);
  Object.freeze(clips);
  const states = compileStates(sourcePackage.states, clips);
  const transitions = compileTransitions(sourcePackage.transitions, clips);
  const actionTiming = compileActionTiming(sourcePackage.actionTiming, states);
  const actionLayers = compileActionLayers(sourcePackage.actionLayers, states, bones.length);
  const actionPrecompositions = compileActionPrecompositions(
    sourcePackage.actionPrecompositions, actionLayers, clips, bones.length);
  const clipDurations = Object.freeze(Object.fromEntries(
    Object.entries(clips).map(([name, clip]) => [name, clip.duration])));
  const loaded = Object.freeze({
    schemaVersion: 1, source, coordinates,
    mesh: Object.freeze({
      positions, normals, uv0, hasSourceUV0, indices, jointIndices, weights, inverseBindMatrices,
      gpuJointIndices, vertexCount, indexCount: indices.length,
    }),
    bones: Object.freeze(checkedBones), clips, states, transitions, actionTiming,
    actionLayers, actionPrecompositions, clipDurations,
    availableClips: Object.freeze(Object.keys(clips)),
    availableTransitions: Object.freeze(Object.keys(transitions)),
    availableActions: Object.freeze(Object.keys(actionLayers).filter(name => actionLayers[name].webComposable)),
    weightedBoneIndices,
    jointCount: bones.length,
    weightedJointCount: weightedBoneIndices.length,
  });
  loadedPackages.add(loaded);
  return loaded;
}

function multiplyInto(a, aOffset, b, bOffset, output, outputOffset) {
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      let value = 0;
      for (let k = 0; k < 4; k++) {
        value += a[aOffset + k * 4 + row] * b[bOffset + column * 4 + k];
      }
      output[outputOffset + column * 4 + row] = value;
    }
  }
}

function composeInto(position, rotation, scale, output) {
  const x = rotation[0], y = rotation[1], z = rotation[2], w = rotation[3];
  const xx = x*x, yy = y*y, zz = z*z, xy = x*y, xz = x*z, yz = y*z;
  const wx = w*x, wy = w*y, wz = w*z;
  output[0] = (1 - 2*(yy + zz)) * scale[0];
  output[1] = 2*(xy + wz) * scale[0];
  output[2] = 2*(xz - wy) * scale[0]; output[3] = 0;
  output[4] = 2*(xy - wz) * scale[1];
  output[5] = (1 - 2*(xx + zz)) * scale[1];
  output[6] = 2*(yz + wx) * scale[1]; output[7] = 0;
  output[8] = 2*(xz + wy) * scale[2];
  output[9] = 2*(yz - wx) * scale[2];
  output[10] = (1 - 2*(xx + yy)) * scale[2]; output[11] = 0;
  output[12] = position[0]; output[13] = position[1]; output[14] = position[2]; output[15] = 1;
}

function slerpInto(firstValues, firstOffset, secondValues, secondOffset, t, output, outputOffset = 0) {
  let ax = firstValues[firstOffset], ay = firstValues[firstOffset + 1];
  let az = firstValues[firstOffset + 2], aw = firstValues[firstOffset + 3];
  let bx = secondValues[secondOffset], by = secondValues[secondOffset + 1];
  let bz = secondValues[secondOffset + 2], bw = secondValues[secondOffset + 3];
  let dot = ax*bx + ay*by + az*bz + aw*bw;
  if (dot < 0) { dot = -dot; bx = -bx; by = -by; bz = -bz; bw = -bw; }
  let firstWeight = 1 - t, secondWeight = t;
  if (dot < 0.9995) {
    const angle = Math.acos(Math.min(1, dot));
    const denominator = Math.sin(angle);
    firstWeight = Math.sin((1 - t) * angle) / denominator;
    secondWeight = Math.sin(t * angle) / denominator;
  }
  const x = firstWeight*ax + secondWeight*bx;
  const y = firstWeight*ay + secondWeight*by;
  const z = firstWeight*az + secondWeight*bz;
  const w = firstWeight*aw + secondWeight*bw;
  const length = Math.hypot(x, y, z, w);
  output[outputOffset] = x/length; output[outputOffset + 1] = y/length;
  output[outputOffset + 2] = z/length; output[outputOffset + 3] = w/length;
}

function sampleLocalPose(sourcePackage, clip, time, playback, pose) {
  if (typeof time !== 'number' || !Number.isFinite(time)) throw new TypeError('Animation time must be finite');
  if (playback !== 'loop' && playback !== 'clamp') {
    throw new TypeError('Playback must explicitly be loop or clamp');
  }
  if (playback === 'loop' && clip.duration <= 0) {
    throw new RangeError('A zero-duration clip cannot loop');
  }
  const localTime = playback === 'loop'
    ? ((time % clip.duration) + clip.duration) % clip.duration
    : Math.max(0, Math.min(time, clip.duration));
  const framePosition = Math.min(localTime * clip.sampleRate, clip.frameCount - 1);
  const firstFrame = Math.floor(framePosition);
  const secondFrame = Math.min(firstFrame + 1, clip.frameCount - 1);
  const blend = framePosition - firstFrame;
  const boneCount = sourcePackage.jointCount;
  const positionWidth = boneCount * 3;
  const rotationWidth = boneCount * 4;
  const scaleWidth = boneCount * 3;
  for (let bone = 0; bone < boneCount; bone++) {
    const posePosition = bone * 3;
    const poseRotation = bone * 4;
    const p0 = firstFrame * positionWidth + posePosition;
    const p1 = secondFrame * positionWidth + posePosition;
    const s0 = firstFrame * scaleWidth + posePosition;
    const s1 = secondFrame * scaleWidth + posePosition;
    for (let component = 0; component < 3; component++) {
      pose.positions[posePosition + component] =
        clip.positions[p0 + component] * (1 - blend) + clip.positions[p1 + component] * blend;
      pose.scales[posePosition + component] =
        clip.scales[s0 + component] * (1 - blend) + clip.scales[s1 + component] * blend;
    }
    slerpInto(clip.rotations, firstFrame * rotationWidth + poseRotation,
      clip.rotations, secondFrame * rotationWidth + poseRotation, blend,
      pose.rotations, poseRotation);
  }
}

function precompositionSampleIndex(precomposition, base, weightIndex, phase, action, slot) {
  return (((weightIndex * base.phaseCount + phase) * precomposition.actionCount + action) *
    precomposition.bones.length) + slot;
}

function precompositionComponent(precomposition, base, values, weightIndex, slot, component,
                                 firstPhase, secondPhase, phaseBlend,
                                 firstAction, secondAction, actionBlend) {
  const firstPhaseFirstAction = precompositionSampleIndex(
    precomposition, base, weightIndex, firstPhase, firstAction, slot) * 3 + component;
  const secondPhaseFirstAction = precompositionSampleIndex(
    precomposition, base, weightIndex, secondPhase, firstAction, slot) * 3 + component;
  const firstPhaseSecondAction = precompositionSampleIndex(
    precomposition, base, weightIndex, firstPhase, secondAction, slot) * 3 + component;
  const secondPhaseSecondAction = precompositionSampleIndex(
    precomposition, base, weightIndex, secondPhase, secondAction, slot) * 3 + component;
  const atFirstAction = values[firstPhaseFirstAction] * (1 - phaseBlend) +
    values[secondPhaseFirstAction] * phaseBlend;
  const atSecondAction = values[firstPhaseSecondAction] * (1 - phaseBlend) +
    values[secondPhaseSecondAction] * phaseBlend;
  return atFirstAction * (1 - actionBlend) + atSecondAction * actionBlend;
}

function precompositionRotation(precomposition, base, weightIndex, slot,
                                firstPhase, secondPhase, phaseBlend,
                                firstAction, secondAction, actionBlend,
                                scratch, output) {
  const firstPhaseFirstAction = precompositionSampleIndex(
    precomposition, base, weightIndex, firstPhase, firstAction, slot) * 4;
  const secondPhaseFirstAction = precompositionSampleIndex(
    precomposition, base, weightIndex, secondPhase, firstAction, slot) * 4;
  const firstPhaseSecondAction = precompositionSampleIndex(
    precomposition, base, weightIndex, firstPhase, secondAction, slot) * 4;
  const secondPhaseSecondAction = precompositionSampleIndex(
    precomposition, base, weightIndex, secondPhase, secondAction, slot) * 4;
  slerpInto(base.rotations, firstPhaseFirstAction,
    base.rotations, secondPhaseFirstAction, phaseBlend,
    scratch.precompositionRotationC);
  slerpInto(base.rotations, firstPhaseSecondAction,
    base.rotations, secondPhaseSecondAction, phaseBlend,
    scratch.precompositionRotationD);
  slerpInto(scratch.precompositionRotationC, 0,
    scratch.precompositionRotationD, 0, actionBlend, output);
}

function sampleActionPrecomposition(sourcePackage, precomposition, baseClipName,
                                    baseClip, baseTime, basePlayback, actionTime,
                                    layerWeight, pose, scratch) {
  const base = precomposition.baseClips[baseClipName];
  if (!base) {
    throw new Error('Native fire precomposition unavailable for base clip ' + baseClipName);
  }
  sampleLocalPose(sourcePackage, baseClip, baseTime, basePlayback, pose);
  if (layerWeight === 0) return pose;
  const localBaseTime = basePlayback === 'loop'
    ? ((baseTime % baseClip.duration) + baseClip.duration) % baseClip.duration
    : Math.max(0, Math.min(baseTime, baseClip.duration));
  const phasePosition = base.phaseCount === 1 ? 0 :
    localBaseTime / baseClip.duration * base.phaseCount;
  const firstPhase = Math.floor(phasePosition) % base.phaseCount;
  const secondPhase = (firstPhase + 1) % base.phaseCount;
  const phaseBlend = base.phaseCount === 1 ? 0 : phasePosition - Math.floor(phasePosition);
  const actionPosition = Math.max(0, Math.min(
    (actionTime - precomposition.actionStart) / precomposition.actionStep,
    precomposition.actionCount - 1));
  const firstAction = Math.floor(actionPosition);
  const secondAction = Math.min(firstAction + 1, precomposition.actionCount - 1);
  const actionBlend = actionPosition - firstAction;
  let upperWeightIndex = 0;
  while (layerWeight > precomposition.layerWeights[upperWeightIndex] &&
         upperWeightIndex + 1 < precomposition.layerWeights.length) {
    upperWeightIndex++;
  }
  const lowerWeightIndex = upperWeightIndex - 1;
  const lowerWeight = lowerWeightIndex < 0 ? 0 : precomposition.layerWeights[lowerWeightIndex];
  const upperWeight = precomposition.layerWeights[upperWeightIndex];
  const weightBlend = (layerWeight - lowerWeight) / (upperWeight - lowerWeight);
  const boneCount = precomposition.bones.length;
  for (let slot = 0; slot < boneCount; slot++) {
    const bone = precomposition.bones[slot];
    const posePosition = bone * 3;
    const poseRotation = bone * 4;
    for (let component = 0; component < 3; component++) {
      const lowerPosition = lowerWeightIndex < 0
        ? pose.positions[posePosition + component]
        : precompositionComponent(precomposition, base, base.positions,
          lowerWeightIndex, slot, component, firstPhase, secondPhase, phaseBlend,
          firstAction, secondAction, actionBlend);
      const upperPosition = precompositionComponent(precomposition, base, base.positions,
        upperWeightIndex, slot, component, firstPhase, secondPhase, phaseBlend,
        firstAction, secondAction, actionBlend);
      pose.positions[posePosition + component] =
        lowerPosition * (1 - weightBlend) + upperPosition * weightBlend;
      const lowerScale = lowerWeightIndex < 0
        ? pose.scales[posePosition + component]
        : precompositionComponent(precomposition, base, base.scales,
          lowerWeightIndex, slot, component, firstPhase, secondPhase, phaseBlend,
          firstAction, secondAction, actionBlend);
      const upperScale = precompositionComponent(precomposition, base, base.scales,
        upperWeightIndex, slot, component, firstPhase, secondPhase, phaseBlend,
        firstAction, secondAction, actionBlend);
      pose.scales[posePosition + component] =
        lowerScale * (1 - weightBlend) + upperScale * weightBlend;
    }
    if (lowerWeightIndex < 0) {
      for (let component = 0; component < 4; component++) {
        scratch.precompositionRotationA[component] = pose.rotations[poseRotation + component];
      }
    } else {
      precompositionRotation(precomposition, base, lowerWeightIndex, slot,
        firstPhase, secondPhase, phaseBlend, firstAction, secondAction, actionBlend,
        scratch, scratch.precompositionRotationA);
    }
    precompositionRotation(precomposition, base, upperWeightIndex, slot,
      firstPhase, secondPhase, phaseBlend, firstAction, secondAction, actionBlend,
      scratch, scratch.precompositionRotationB);
    slerpInto(scratch.precompositionRotationA, 0,
      scratch.precompositionRotationB, 0, weightBlend,
      pose.rotations, poseRotation);
  }
  return pose;
}

function composePalette(sourcePackage, targetPose, scratch, fromPose = null, blend = 1,
                        actionPose = null, actionMask = null, actionWeight = 0) {
  const { local, globals, position, rotation, scale, palette } = scratch;
  for (let bone = 0; bone < sourcePackage.jointCount; bone++) {
    const positionOffset = bone * 3;
    const rotationOffset = bone * 4;
    if (fromPose) {
      for (let component = 0; component < 3; component++) {
        position[component] = fromPose.positions[positionOffset + component] * (1 - blend) +
          targetPose.positions[positionOffset + component] * blend;
        scale[component] = fromPose.scales[positionOffset + component] * (1 - blend) +
          targetPose.scales[positionOffset + component] * blend;
      }
      slerpInto(fromPose.rotations, rotationOffset, targetPose.rotations, rotationOffset,
        blend, rotation);
    } else {
      for (let component = 0; component < 3; component++) {
        position[component] = targetPose.positions[positionOffset + component];
        scale[component] = targetPose.scales[positionOffset + component];
      }
      for (let component = 0; component < 4; component++) {
        rotation[component] = targetPose.rotations[rotationOffset + component];
      }
    }
    const layerWeight = actionPose ? actionMask[bone] * actionWeight : 0;
    if (layerWeight > 0) {
      for (let component = 0; component < 3; component++) {
        position[component] = position[component] * (1 - layerWeight) +
          actionPose.positions[positionOffset + component] * layerWeight;
        scale[component] = scale[component] * (1 - layerWeight) +
          actionPose.scales[positionOffset + component] * layerWeight;
      }
      slerpInto(rotation, 0, actionPose.rotations, rotationOffset, layerWeight, rotation);
    }
    composeInto(position, rotation, scale, local);
    const parent = sourcePackage.bones[bone].parent;
    if (parent < 0) globals.set(local, bone * 16);
    else multiplyInto(globals, parent * 16, local, 0, globals, bone * 16);
  }
  for (let paletteIndex = 0; paletteIndex < sourcePackage.weightedBoneIndices.length; paletteIndex++) {
    const bone = sourcePackage.weightedBoneIndices[paletteIndex];
    multiplyInto(globals, bone * 16, sourcePackage.mesh.inverseBindMatrices, bone * 16,
      palette, paletteIndex * 16);
  }
  return palette;
}

function makePoseScratch(sourcePackage) {
  return {
    positions: new Float32Array(sourcePackage.jointCount * 3),
    rotations: new Float32Array(sourcePackage.jointCount * 4),
    scales: new Float32Array(sourcePackage.jointCount * 3),
  };
}

function makeScratch(sourcePackage) {
  return {
    pose: makePoseScratch(sourcePackage),
    local: new Float32Array(16), globals: new Float32Array(sourcePackage.jointCount * 16),
    position: new Float32Array(3), rotation: new Float32Array(4), scale: new Float32Array(3),
    precompositionRotationA: new Float32Array(4),
    precompositionRotationB: new Float32Array(4),
    precompositionRotationC: new Float32Array(4),
    precompositionRotationD: new Float32Array(4),
    palette: new Float32Array(sourcePackage.weightedJointCount * 16),
  };
}

function evaluatePalette(sourcePackage, clip, time, playback, scratch,
                         actionPose = null, actionMask = null, actionWeight = 0) {
  sampleLocalPose(sourcePackage, clip, time, playback, scratch.pose);
  return composePalette(sourcePackage, scratch.pose, scratch, null, 1,
    actionPose, actionMask, actionWeight);
}

function resolveTransition(sourcePackage, toClip, transition) {
  if (!transition || typeof transition !== 'object' || Array.isArray(transition) ||
      typeof transition.fromClip !== 'string' || !sourcePackage.clips[transition.fromClip] ||
      typeof transition.fromTime !== 'number' || !Number.isFinite(transition.fromTime) ||
      (transition.fromPlayback !== 'loop' && transition.fromPlayback !== 'clamp') ||
      typeof transition.elapsed !== 'number' || !Number.isFinite(transition.elapsed) ||
      transition.elapsed < 0) {
    throw new TypeError('transition requires a sampled fromClip/fromTime/fromPlayback and nonnegative elapsed');
  }
  const key = transition.fromClip + '->' + toClip;
  const contract = sourcePackage.transitions[key];
  if (!contract) throw new Error('Native transition unavailable: ' + key);
  return contract;
}

function resolveActionLayer(sourcePackage, action) {
  if (!action || typeof action !== 'object' || Array.isArray(action) ||
      typeof action.state !== 'string' ||
      typeof action.time !== 'number' || !Number.isFinite(action.time) ||
      typeof action.weight !== 'number' || !Number.isFinite(action.weight)) {
    throw new TypeError('action requires state, finite raw source-clip time and finite weight');
  }
  if (action.blend != null && (typeof action.blend !== 'number' ||
      !Number.isFinite(action.blend) || action.blend < 0 || action.blend > 1)) {
    throw new RangeError('action blend must be finite and in [0,1]');
  }
  const layer = sourcePackage.actionLayers[action.state];
  if (!layer) throw new Error('Native action layer unavailable: ' + action.state);
  if (!layer.webComposable) {
    throw new Error('Native action layer unavailable: ' + action.state + '; ' + layer.blocker);
  }
  const precomposition = sourcePackage.actionPrecompositions[action.state];
  if (precomposition) {
    if (action.weight < 0 || action.weight > 1) {
      throw new RangeError('Precomposed native action weight must be in [0,1]');
    }
  } else if (action.weight !== 1 || (action.blend != null && action.blend !== 1)) {
    throw new TypeError('Masked override action requires exactly evidenced weight and blend 1');
  }
  if (layer.mode !== 'override' && !precomposition) {
    throw new Error('Unsupported native action composition mode: ' + layer.mode);
  }
  return layer;
}

function evaluateTransitionPalette(sourcePackage, toClipName, toClip, time, playback, transition,
                                   scratch, fromPose, result,
                                   actionPose = null, actionMask = null, actionWeight = 0) {
  const contract = resolveTransition(sourcePackage, toClipName, transition);
  result.key = transition.fromClip + '->' + toClipName;
  result.duration = contract.duration;
  if (transition.elapsed <= 0) {
    result.weight = 0;
    return evaluatePalette(sourcePackage, sourcePackage.clips[transition.fromClip],
      transition.fromTime, transition.fromPlayback, scratch,
      actionPose, actionMask, actionWeight);
  }
  if (transition.elapsed >= contract.duration) {
    result.weight = 1;
    return evaluatePalette(sourcePackage, toClip, time, playback, scratch,
      actionPose, actionMask, actionWeight);
  }
  sampleLocalPose(sourcePackage, sourcePackage.clips[transition.fromClip],
    transition.fromTime, transition.fromPlayback, fromPose);
  sampleLocalPose(sourcePackage, toClip, time, playback, scratch.pose);
  result.weight = transition.elapsed / contract.duration;
  return composePalette(sourcePackage, scratch.pose, scratch, fromPose, result.weight,
    actionPose, actionMask, actionWeight);
}

function evaluatePrecomposedActionPalette(sourcePackage, precomposition,
                                          toClipName, toClip, time, playback,
                                          actionTime, actionWeight, transition, scratch,
                                          targetPose, fromPose, result) {
  if (transition === null) {
    sampleActionPrecomposition(sourcePackage, precomposition, toClipName,
      toClip, time, playback, actionTime, actionWeight, targetPose, scratch);
    return composePalette(sourcePackage, targetPose, scratch);
  }
  const contract = resolveTransition(sourcePackage, toClipName, transition);
  result.key = transition.fromClip + '->' + toClipName;
  result.duration = contract.duration;
  if (transition.elapsed <= 0) {
    result.weight = 0;
    sampleActionPrecomposition(sourcePackage, precomposition, transition.fromClip,
      sourcePackage.clips[transition.fromClip], transition.fromTime,
      transition.fromPlayback, actionTime, actionWeight, targetPose, scratch);
    return composePalette(sourcePackage, targetPose, scratch);
  }
  if (transition.elapsed >= contract.duration) {
    result.weight = 1;
    sampleActionPrecomposition(sourcePackage, precomposition, toClipName,
      toClip, time, playback, actionTime, actionWeight, targetPose, scratch);
    return composePalette(sourcePackage, targetPose, scratch);
  }
  sampleActionPrecomposition(sourcePackage, precomposition, transition.fromClip,
    sourcePackage.clips[transition.fromClip], transition.fromTime,
    transition.fromPlayback, actionTime, actionWeight, fromPose, scratch);
  sampleActionPrecomposition(sourcePackage, precomposition, toClipName,
    toClip, time, playback, actionTime, actionWeight, targetPose, scratch);
  result.weight = transition.elapsed / contract.duration;
  return composePalette(sourcePackage, targetPose, scratch, fromPose, result.weight);
}

/** Deterministically sample a native base clip with optional evidenced transition/action layer. */
export function sampleNativeSkinPalette(sourcePackage, {
  clip: clipName, time, playback, transition = null, action = null,
} = {}) {
  const loaded = loadNativeSkinPackage(sourcePackage);
  const clip = loaded.clips[clipName];
  if (!clip) throw new Error('Native sampled clip unavailable: ' + String(clipName));
  const scratch = makeScratch(loaded);
  const actionPose = action ? makePoseScratch(loaded) : null;
  const actionFromPose = action ? makePoseScratch(loaded) : null;
  const layer = action ? resolveActionLayer(loaded, action) : null;
  const precomposition = action ? loaded.actionPrecompositions[action.state] : null;
  if (layer && !precomposition) {
    const state = loaded.states[action.state];
    sampleLocalPose(loaded, loaded.clips[state.clip], action.time, state.playback, actionPose);
  }
  const transitionResult = {};
  let palette;
  if (precomposition) {
    palette = evaluatePrecomposedActionPalette(loaded, precomposition,
      clipName, clip, time, playback, action.time, action.weight * (action.blend ?? 1),
      transition, scratch,
      actionPose, actionFromPose, transitionResult);
  } else {
    palette = transition
      ? evaluateTransitionPalette(loaded, clipName, clip, time, playback, transition,
        scratch, makePoseScratch(loaded), transitionResult,
        actionPose, layer?.mask, action?.weight ?? 0)
      : evaluatePalette(loaded, clip, time, playback, scratch,
        actionPose, layer?.mask, action?.weight ?? 0);
  }
  return new Float32Array(palette);
}

function compileShader(gl, kind, source) {
  const shader = gl.createShader(kind);
  if (!shader) throw new Error('WebGL2 failed to allocate a character shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(message || 'Native skin shader compilation failed');
  }
  return shader;
}

function createProgram(gl, jointCount) {
  const program = gl.createProgram();
  if (!program) throw new Error('WebGL2 failed to allocate a native skin program');
  let vertex = null, fragment = null;
  try {
    vertex = compileShader(gl, gl.VERTEX_SHADER, vertexShader(jointCount));
    fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShader);
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || 'Native skin program link failed');
    }
    return program;
  } catch (error) {
    gl.deleteProgram(program);
    throw error;
  } finally {
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
  }
}

function uploadAttribute(gl, location, values, size, integer = false) {
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error('WebGL2 failed to allocate a native skin buffer');
  try {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, values, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(location);
    if (integer) gl.vertexAttribIPointer(location, size, gl.UNSIGNED_BYTE, 0, 0);
    else gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
    return buffer;
  } catch (error) {
    gl.deleteBuffer(buffer);
    throw error;
  }
}

/**
 * Direct WebGL2 indexed skin pass. It owns one clean source-reconstructed
 * Red Crystal/default-focus shader with a generated-light fallback, preserves
 * caller-selected native clip sampling, and restores program/VAO/front-face
 * state after its single indexed draw.
 */
export function createNativeSkinPass(gl, sourcePackage, {
  lighting = createGeneratedLighting(),
} = {}) {
  if (!gl || typeof gl.getParameter !== 'function') throw new TypeError('A WebGL2 context is required');
  const loaded = loadNativeSkinPackage(sourcePackage);
  const requiredUniformVectors = loaded.weightedJointCount * 4 + 11;
  const uniformLimit = gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS);
  if (!Number.isFinite(uniformLimit) || uniformLimit < requiredUniformVectors) {
    throw new RangeError('Native skin needs ' + requiredUniformVectors +
      ' vertex uniform vectors; WebGL2 exposes ' + String(uniformLimit));
  }
  const light = lightingUniformPacket(lighting);
  const program = createProgram(gl, loaded.weightedJointCount);
  const attributes = {};
  const uniforms = {};
  for (const name of ['aPosition', 'aNormal', 'aJointIndices', 'aWeights']) {
    attributes[name] = gl.getAttribLocation(program, name);
    if (attributes[name] < 0) {
      gl.deleteProgram(program);
      throw new Error('Native skin shader is missing attribute ' + name);
    }
  }
  attributes.aUV0 = 4;
  for (const name of ['uModel', 'uViewProjection', 'uJoints[0]', 'uLightDirection',
    'uLightCoefficients', 'uColor', 'uRedCrystalControl', 'uCameraPosition',
    'uSourceLightDirection']) {
    uniforms[name] = gl.getUniformLocation(program, name);
    if (uniforms[name] == null) {
      gl.deleteProgram(program);
      throw new Error('Native skin shader is missing uniform ' + name);
    }
  }

  const oldVao = gl.getParameter(gl.VERTEX_ARRAY_BINDING);
  const oldArrayBuffer = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
  const vao = gl.createVertexArray();
  const buffers = [];
  if (!vao) {
    gl.deleteProgram(program);
    throw new Error('WebGL2 failed to allocate a native skin VAO');
  }
  try {
    gl.bindVertexArray(vao);
    buffers.push(uploadAttribute(gl, attributes.aPosition, loaded.mesh.positions, 3));
    buffers.push(uploadAttribute(gl, attributes.aNormal, loaded.mesh.normals, 3));
    buffers.push(uploadAttribute(gl, attributes.aJointIndices, loaded.mesh.gpuJointIndices, 4, true));
    buffers.push(uploadAttribute(gl, attributes.aWeights, loaded.mesh.weights, 4));
    if (loaded.mesh.uv0) buffers.push(uploadAttribute(gl, attributes.aUV0, loaded.mesh.uv0, 2));
    const elementBuffer = gl.createBuffer();
    if (!elementBuffer) throw new Error('WebGL2 failed to allocate a native skin index buffer');
    buffers.push(elementBuffer);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elementBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, loaded.mesh.indices, gl.STATIC_DRAW);
  } catch (error) {
    for (const buffer of buffers) gl.deleteBuffer(buffer);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(program);
    throw error;
  } finally {
    gl.bindVertexArray(oldVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, oldArrayBuffer);
  }

  const scratch = makeScratch(loaded);
  const transitionPose = makePoseScratch(loaded);
  const actionPose = makePoseScratch(loaded);
  const actionFromPose = makePoseScratch(loaded);
  const transitionInput = { fromClip: '', fromTime: 0, fromPlayback: 'clamp', elapsed: 0 };
  const transitionResult = { key: null, duration: 0, weight: 1 };
  const instances = new WeakSet();
  let disposed = false;
  function loadInstance({ clip, playback } = {}) {
    if (disposed) throw new Error('Cannot load an instance into a disposed native skin pass');
    if (!loaded.clips[clip]) throw new Error('Native sampled clip unavailable: ' + String(clip));
    if (playback !== 'loop' && playback !== 'clamp') {
      throw new TypeError('Instance playback must explicitly be loop or clamp');
    }
    if (playback === 'loop' && loaded.clips[clip].duration <= 0) {
      throw new RangeError('A zero-duration clip cannot loop');
    }
    const instance = Object.freeze({ clip, playback });
    instances.add(instance);
    return instance;
  }
  const createInstance = loadInstance;
  function createStateInstance(stateName) {
    const state = loaded.states[stateName];
    if (!state) throw new Error('Native animation state unavailable: ' + String(stateName));
    return loadInstance({
      clip: loaded.clips[stateName] ? stateName : state.clip,
      playback: state.playback,
    });
  }

  const camera = new Float32Array(3);
  function draw({ instance, modelMatrix, viewProjection, time, shaderTime,
                  cameraPosition = null, color, transition = null, action = null } = {}) {
    if (disposed) throw new Error('Cannot draw a disposed native skin pass');
    if (!instances.has(instance)) throw new TypeError('draw requires an instance created by this pass');
    const mirrored = affineDeterminant(modelMatrix, 'modelMatrix') < 0;
    numericArray(viewProjection, 16, 'viewProjection');
    for (let i = 0; i < 16; i++) {
      if (!Number.isFinite(Math.fround(viewProjection[i]))) {
        throw new RangeError('viewProjection exceeds float32');
      }
    }
    numericArray(color, 4, 'color');
    for (let i = 0; i < 4; i++) {
      if (color[i] < 0 || color[i] > 1) {
        throw new RangeError('color components must be in [0,1]');
      }
    }
    const shaderTimeProvided = shaderTime !== undefined;
    if (!shaderTimeProvided) shaderTime = time;
    if (!Number.isFinite(shaderTime) || !Number.isFinite(Math.fround(shaderTime))) {
      throw new TypeError('shaderTime must be a finite float32 source-clock sample');
    }
    const cameraProvided = cameraPosition != null;
    const indexedCamera = Array.isArray(cameraPosition) || ArrayBuffer.isView(cameraPosition);
    if (cameraProvided && !indexedCamera && typeof cameraPosition !== 'object') {
      throw new TypeError('cameraPosition requires xyz components');
    }
    if (indexedCamera) numericArray(cameraPosition, 3, 'cameraPosition');
    for (let component = 0; component < 3; component++) {
      const sourceValue = !cameraProvided ? 0
        : (indexedCamera ? cameraPosition[component]
          : (component === 0 ? cameraPosition.x : component === 1 ? cameraPosition.y : cameraPosition.z));
      const value = Math.fround(sourceValue);
      if (!Number.isFinite(value)) throw new RangeError('cameraPosition requires finite float32 xyz');
      camera[component] = value;
    }
    let palette;
    let actionLayer = null;
    let actionPrecomposition = null;
    let actionWeight = 0;
    if (action !== null) {
      actionLayer = resolveActionLayer(loaded, action);
      actionPrecomposition = loaded.actionPrecompositions[action.state] ?? null;
      actionWeight = action.weight;
      if (!actionPrecomposition) {
        const actionState = loaded.states[action.state];
        sampleLocalPose(loaded, loaded.clips[actionState.clip],
          action.time, actionState.playback, actionPose);
      }
    }
    transitionResult.key = null;
    if (transition !== null) {
      if (!transition || typeof transition !== 'object' || Array.isArray(transition) ||
          !instances.has(transition.from)) {
        throw new TypeError('draw transition.from must be an instance created by this pass');
      }
      transitionInput.fromClip = transition.from.clip;
      transitionInput.fromTime = transition.fromTime;
      transitionInput.fromPlayback = transition.from.playback;
      transitionInput.elapsed = transition.elapsed;
    }
    if (actionPrecomposition) {
      palette = evaluatePrecomposedActionPalette(loaded, actionPrecomposition,
        instance.clip, loaded.clips[instance.clip], time, instance.playback,
        action.time, action.weight * (action.blend ?? 1),
        transition === null ? null : transitionInput, scratch,
        actionPose, actionFromPose, transitionResult);
    } else if (transition !== null) {
      palette = evaluateTransitionPalette(loaded, instance.clip, loaded.clips[instance.clip],
        time, instance.playback, transitionInput, scratch, transitionPose, transitionResult,
        actionLayer ? actionPose : null, actionLayer?.mask, actionWeight);
    } else {
      palette = evaluatePalette(loaded, loaded.clips[instance.clip], time, instance.playback, scratch,
        actionLayer ? actionPose : null, actionLayer?.mask, actionWeight);
    }
    const previousProgram = gl.getParameter(gl.CURRENT_PROGRAM);
    const previousVao = gl.getParameter(gl.VERTEX_ARRAY_BINDING);
    const culling = gl.isEnabled(gl.CULL_FACE);
    const previousWinding = culling ? gl.getParameter(gl.FRONT_FACE) : null;
    try {
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.uniformMatrix4fv(uniforms.uModel, false, modelMatrix);
      gl.uniformMatrix4fv(uniforms.uViewProjection, false, viewProjection);
      gl.uniformMatrix4fv(uniforms['uJoints[0]'], false, palette);
      gl.uniform3f(uniforms.uLightDirection, ...light.direction);
      gl.uniform2f(uniforms.uLightCoefficients, light.ambient, light.diffuse);
      gl.uniform4f(uniforms.uColor, color[0], color[1], color[2], color[3]);
      const width = gl.drawingBufferWidth;
      const height = gl.drawingBufferHeight;
      const viewportAspect = Number.isFinite(width) && Number.isFinite(height) && height > 0
        ? width / height : 1;
      gl.uniform4f(uniforms.uRedCrystalControl,
        loaded.mesh.hasSourceUV0 ? 1 : 0, shaderTime, viewportAspect, 0);
      gl.uniform3f(uniforms.uCameraPosition, camera[0], camera[1], camera[2]);
      gl.uniform3f(uniforms.uSourceLightDirection, ...RED_CRYSTAL_SOURCE.directionToLight);
      if (culling) gl.frontFace(mirrored ? gl.CW : gl.CCW);
      gl.drawElements(gl.TRIANGLES, loaded.mesh.indexCount,
        loaded.mesh.indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
    } finally {
      if (culling) gl.frontFace(previousWinding);
      gl.bindVertexArray(previousVao);
      gl.useProgram(previousProgram);
    }
    const report = {
      drawCalls: 1, triangles: loaded.mesh.indexCount / 3,
      clip: instance.clip, sampledTime: time, skinned: true,
      nativeClipSampled: true, runtimeEnemyInstanceVerified: false,
      materialParity: false, redCrystalFinalCompositor: true,
      redCrystalNativeInputsVerified: false, lightingProvenance: light.source,
    };
    if (loaded.mesh.hasSourceUV0) {
      report.redCrystalSourceDefaultForward = true;
      report.lightingProvenance = 'compiled-red-crystal-default-forward-static-partial';
      report.redCrystalShader = RED_CRYSTAL_SOURCE.shader;
      report.redCrystalPass = RED_CRYSTAL_SOURCE.pass;
      report.redCrystalVertexProgramSha256 = RED_CRYSTAL_SOURCE.vertexProgramSha256;
      report.redCrystalFragmentProgramSha256 = RED_CRYSTAL_SOURCE.fragmentProgramSha256;
      report.redCrystalUvProvenance = 'private-package-mesh-uv0';
      report.redCrystalDirectionalProvenance = RED_CRYSTAL_SOURCE.directionProvenance;
      report.redCrystalShaderTime = shaderTime;
      report.redCrystalShaderTimeProvenance = shaderTimeProvided
        ? 'caller-supplied-clock-unmatched-native-global-phase'
        : 'animation-sample-time-fallback-unmatched-native-global-phase';
      report.redCrystalCameraProvenance = cameraProvided
        ? 'caller-world-camera-unmatched-native-capture'
        : 'origin-fallback-unmatched-native-camera';
      report.redCrystalRecoveredTerms =
        'compiled-default-focus-uv-camera-seeds-procedural-reflection-highlight-directional-distance-color';
      report.redCrystalRemainingInputs =
        'source-color0-threshold,local-fog,false-crystal-lights,focus-glitch,forward-add,shadows,postprocess';
    }
    if (transitionResult.key !== null) {
      report.transition = transitionResult.key;
      report.transitionDuration = transitionResult.duration;
      report.transitionWeight = transitionResult.weight;
    }
    if (actionLayer) {
      report.action = actionLayer.name;
      report.actionMode = actionLayer.mode;
      report.actionTime = action.time;
      report.actionWeight = actionWeight;
      report.actionBlend = action.blend ?? 1;
      report.actionEffectiveWeight = actionWeight * report.actionBlend;
      if (actionPrecomposition) {
        report.actionComposition = actionPrecomposition.composition;
        report.actionApproximation = true;
      }
    }
    return Object.freeze(report);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const buffer of buffers) gl.deleteBuffer(buffer);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(program);
  }

  return Object.freeze({
    source: loaded.source, coordinates: loaded.coordinates,
    jointCount: loaded.jointCount, weightedJointCount: loaded.weightedJointCount,
    availableClips: loaded.availableClips, clipDurations: loaded.clipDurations,
    states: loaded.states, actionTiming: loaded.actionTiming,
    actionLayers: loaded.actionLayers, actionPrecompositions: loaded.actionPrecompositions,
    availableActions: loaded.availableActions,
    availableTransitions: loaded.availableTransitions,
    createInstance, createStateInstance, loadInstance, draw, dispose,
  });
}
