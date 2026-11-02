import { createGeneratedLighting, lightingUniformPacket } from '../render/lighting-model.js';

const INFLUENCES_PER_VERTEX = 4;
const MAX_VERTICES = 1_000_000;
const MAX_BONES = 256;
const EPSILON = 1e-12;
const loadedPackages = new WeakSet();

const vertexShader = jointCount => `#version 300 es
precision highp float;
in vec3 aPosition;
in vec3 aNormal;
in uvec4 aJointIndices;
in vec4 aWeights;
uniform mat4 uModel;
uniform mat4 uViewProjection;
uniform mat4 uJoints[${jointCount}];
uniform vec3 uLightDirection;
uniform vec2 uLightCoefficients;
out float vLight;
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
  gl_Position = uViewProjection * world;
}`;

const fragmentShader = `#version 300 es
precision highp float;
in float vLight;
uniform vec4 uColor;
out vec4 fragColor;
void main() {
  fragColor = vec4(uColor.rgb * vLight, uColor.a);
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
  Object.freeze(clips);

  const loaded = Object.freeze({
    schemaVersion: 1, source, coordinates,
    mesh: Object.freeze({
      positions, normals, indices, jointIndices, weights, inverseBindMatrices,
      gpuJointIndices, vertexCount, indexCount: indices.length,
    }),
    bones: Object.freeze(checkedBones), clips,
    availableClips: Object.freeze(Object.keys(clips)),
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

function slerpInto(values, firstOffset, secondOffset, t, output) {
  let ax = values[firstOffset], ay = values[firstOffset + 1];
  let az = values[firstOffset + 2], aw = values[firstOffset + 3];
  let bx = values[secondOffset], by = values[secondOffset + 1];
  let bz = values[secondOffset + 2], bw = values[secondOffset + 3];
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
  output[0] = x/length; output[1] = y/length; output[2] = z/length; output[3] = w/length;
}

function evaluatePalette(sourcePackage, clip, time, playback, scratch) {
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
  const { local, globals, position, rotation, scale, palette } = scratch;
  for (let bone = 0; bone < boneCount; bone++) {
    const p0 = firstFrame * positionWidth + bone * 3;
    const p1 = secondFrame * positionWidth + bone * 3;
    const s0 = firstFrame * scaleWidth + bone * 3;
    const s1 = secondFrame * scaleWidth + bone * 3;
    for (let component = 0; component < 3; component++) {
      position[component] = clip.positions[p0 + component] * (1 - blend) + clip.positions[p1 + component] * blend;
      scale[component] = clip.scales[s0 + component] * (1 - blend) + clip.scales[s1 + component] * blend;
    }
    slerpInto(clip.rotations, firstFrame * rotationWidth + bone * 4,
      secondFrame * rotationWidth + bone * 4, blend, rotation);
    composeInto(position, rotation, scale, local);
    const parent = sourcePackage.bones[bone].parent;
    if (parent < 0) globals.set(local, bone * 16);
    else multiplyInto(globals, parent * 16, local, 0, globals, bone * 16);
  }
  sourcePackage.weightedBoneIndices.forEach((bone, paletteIndex) => {
    multiplyInto(globals, bone * 16, sourcePackage.mesh.inverseBindMatrices, bone * 16,
      palette, paletteIndex * 16);
  });
  return palette;
}

function makeScratch(sourcePackage) {
  return {
    local: new Float32Array(16), globals: new Float32Array(sourcePackage.jointCount * 16),
    position: new Float32Array(3), rotation: new Float32Array(4), scale: new Float32Array(3),
    palette: new Float32Array(sourcePackage.weightedJointCount * 16),
  };
}

/** Deterministically sample a native local-TRS clip into mesh-local skin matrices. */
export function sampleNativeSkinPalette(sourcePackage, { clip: clipName, time, playback } = {}) {
  const loaded = loadNativeSkinPackage(sourcePackage);
  const clip = loaded.clips[clipName];
  if (!clip) throw new Error('Native sampled clip unavailable: ' + String(clipName));
  return new Float32Array(evaluatePalette(loaded, clip, time, playback, makeScratch(loaded)));
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
 * Direct WebGL2 indexed skin pass. It owns one generated shader program and GPU
 * mesh copy, samples only caller-selected native clips at caller time, and
 * restores program/VAO/front-face state after its single indexed draw.
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
  for (const name of ['uModel', 'uViewProjection', 'uJoints[0]', 'uLightDirection', 'uLightCoefficients', 'uColor']) {
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

  function draw({ instance, modelMatrix, viewProjection, time, color } = {}) {
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
    const palette = evaluatePalette(loaded, loaded.clips[instance.clip], time, instance.playback, scratch);
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
      if (culling) gl.frontFace(mirrored ? gl.CW : gl.CCW);
      gl.drawElements(gl.TRIANGLES, loaded.mesh.indexCount,
        loaded.mesh.indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
    } finally {
      if (culling) gl.frontFace(previousWinding);
      gl.bindVertexArray(previousVao);
      gl.useProgram(previousProgram);
    }
    return Object.freeze({
      drawCalls: 1, triangles: loaded.mesh.indexCount / 3,
      clip: instance.clip, sampledTime: time, skinned: true,
      nativeClipSampled: true, runtimeEnemyInstanceVerified: false,
      materialParity: false, lightingProvenance: light.source,
    });
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
    availableClips: loaded.availableClips,
    createInstance, loadInstance, draw, dispose,
  });
}
