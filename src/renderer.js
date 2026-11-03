import { cameraAxes } from './math.js';
import { uploadIndexedMesh } from './render/gpu-mesh.js';
import { createGeneratedLighting, lightingUniformPacket } from './render/lighting-model.js';
import { createEnemyStaticIndexedPass } from './characters/native-enemy-local.js';
import { enemyRedCrystalDiagnosticWebPacket } from './render/material-model.js';
import { createNativeSkinPass } from './characters/native-skin-pass.js';
import { createNativeActorSkinRuntime } from './characters/native-actor-skin.js';
import { createDojoPlayerAnimationPass } from './characters/native-player-animation.js';
import { createNativeWorldPass } from './render/native-world-pass.js';

// Legacy Web fog is generated, not MCD. SH-13 owns the source-qualified lighting model.
const GENERATED_FOG_STRENGTH = lightingUniformPacket(createGeneratedLighting()).fogStrength;

const vertexShaderSource = `#version 300 es
precision highp float;
in vec3 aPosition;
in vec3 aNormal;
in vec2 aUV;
uniform vec4 uTextureST;
uniform vec3 uTranslate;
uniform vec3 uScale;
uniform vec3 uRotate;
uniform int uUseAffine;
uniform mat4 uAffineModel;
uniform mat3 uAffineNormal;
uniform vec3 uCamPos;
uniform vec4 uColor;
uniform mat4 uViewProjection;
out vec3 vColor;
out float vFog;
out float vAlpha;
out vec2 vUV;
vec3 rotate3(vec3 p) {
  float a = cos(uRotate.x), b = sin(uRotate.x);
  p = vec3(p.x, a*p.y-b*p.z, b*p.y+a*p.z);
  a = cos(uRotate.y); b = sin(uRotate.y);
  p = vec3(a*p.x+b*p.z, p.y, -b*p.x+a*p.z);
  a = cos(uRotate.z); b = sin(uRotate.z);
  return vec3(a*p.x-b*p.y, b*p.x+a*p.y, p.z);
}
void main() {
  vec3 world = uUseAffine == 1
    ? (uAffineModel * vec4(aPosition, 1.0)).xyz
    : rotate3(aPosition * uScale) + uTranslate;
  gl_Position = uViewProjection * vec4(world, 1.0);
  vec3 normal = normalize(uUseAffine == 1
    ? uAffineNormal * aNormal
    : rotate3(aNormal));
  float illumination = 0.64 + 0.36 * max(dot(normal, normalize(vec3(-.55,.90,.42))), 0.0);
  vColor = uColor.rgb * illumination;
  vFog = clamp((distance(world, uCamPos) - 14.0) / 56.0, 0.0, 1.0);
  vAlpha = uColor.a;
  vUV = aUV * uTextureST.xy + uTextureST.zw;
}`;

const fragmentShaderSource = `#version 300 es
precision highp float;
in vec3 vColor;
in float vFog;
in float vAlpha;
in vec2 vUV;
uniform int uUseTexture;
uniform sampler2D uAlbedo;
uniform float uFogStrength;
out vec4 fragColor;
vec3 srgbToLinear(vec3 value) {
  return mix(pow((value + 0.055) / 1.055, vec3(2.4)), value / 12.92,
    lessThanEqual(value, vec3(0.04045)));
}
vec3 linearToSrgb(vec3 value) {
  return mix(1.055 * pow(value, vec3(1.0 / 2.4)) - 0.055, value * 12.92,
    lessThanEqual(value, vec3(0.0031308)));
}
void main() {
  vec3 fog = vec3(.927,.948,.966);
  if (uUseTexture == 1) {
    // SRGB8_ALPHA8 sampling decodes albedo before filtering/lighting.
    // This directional illumination is generated, not the original material shader.
    vec3 lit = texture(uAlbedo, vUV).rgb * vColor;
    vec3 linearColor = mix(lit, srgbToLinear(fog), vFog * uFogStrength);
    fragColor = vec4(linearToSrgb(linearColor), vAlpha);
    return;
  }
  vec3 color = mix(vColor, fog, vFog * uFogStrength);
  fragColor = vec4(color, vAlpha);
}`;

function compile(gl, kind, source) {
  const shader = gl.createShader(kind);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(message || 'Shader compilation failed');
  }
  return shader;
}

const face = (vertices, corners, normal) => {
  for (const i of [0, 1, 2, 0, 2, 3]) {
    vertices.push(...corners[i], ...normal);
  }
};
const makeCube = () => {
  const v = [], a = -.5, b = .5;
  face(v, [[a,a,b],[b,a,b],[b,b,b],[a,b,b]], [0,0,1]);
  face(v, [[b,a,a],[a,a,a],[a,b,a],[b,b,a]], [0,0,-1]);
  face(v, [[a,a,a],[a,a,b],[a,b,b],[a,b,a]], [-1,0,0]);
  face(v, [[b,a,b],[b,a,a],[b,b,a],[b,b,b]], [1,0,0]);
  face(v, [[a,b,b],[b,b,b],[b,b,a],[a,b,a]], [0,1,0]);
  face(v, [[a,a,a],[b,a,a],[b,a,b],[a,a,b]], [0,-1,0]);
  return new Float32Array(v);
};
const makeOctahedron = () => {
  const vertices = [];
  const top = [0,.5,0], bottom = [0,-.5,0];
  const ring = [[.5,0,0],[0,0,.5],[-.5,0,0],[0,0,-.5]];
  for (let i=0;i<4;i++) {
    const next=(i+1)%4;
    for (const tri of [[top,ring[i],ring[next]],[bottom,ring[next],ring[i]]]) {
      const u=tri[1].map((p,j)=>p-tri[0][j]);
      const w=tri[2].map((p,j)=>p-tri[0][j]);
      const norm=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]];
      const inv=1/Math.hypot(...norm);
      for (const p of tri) vertices.push(...p,...norm.map(n=>n*inv));
    }
  }
  return new Float32Array(vertices);
};

function colorToRgba(color, alpha=1) {
  const hex=color.replace('#','');
  const n=parseInt(hex,16);
  return [((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255,alpha];
}

/**
 * Matrix packets are column-major. This right-multiplies a source-neutral
 * affine world matrix by a generated primitive's local dimensions.
 * The translation stays in world units and rotations/shears are preserved.
 */
export function boxModelMatrix(world, size) {
  if (!world || world.length !== 16 || [...world].some((n) => !Number.isFinite(n)) ||
      world[3] !== 0 || world[7] !== 0 || world[11] !== 0 || world[15] !== 1) {
    throw new TypeError('Generated mesh requires a finite affine 4x4 matrix');
  }
  if (!size || !['x', 'y', 'z'].every((axis) =>
    Number.isFinite(size[axis]) && size[axis] > 0)) {
    throw new RangeError('Generated box dimensions must be finite and positive');
  }
  const matrix = Array.from(world);
  for (const [axis, component] of ['x', 'y', 'z'].entries()) {
    for (let row = 0; row < 3; row++) matrix[axis * 4 + row] *= size[component];
  }
  if (matrix.some((n) => !Number.isFinite(Math.fround(n)))) {
    throw new RangeError('Generated model matrix exceeds WebGL2 float32');
  }
  return matrix;
}

/** Inverse transpose of the affine 3x3: correct normals under shear/reflection. */
export function normalMatrixFromAffine(matrix) {
  if (!matrix || matrix.length !== 16 || [...matrix].some((n) => !Number.isFinite(n))) {
    throw new TypeError('Normal matrix requires finite 4x4 values');
  }
  const a = [matrix[0], matrix[1], matrix[2]];
  const b = [matrix[4], matrix[5], matrix[6]];
  const c = [matrix[8], matrix[9], matrix[10]];
  const cross = (x, y) => [
    x[1] * y[2] - x[2] * y[1],
    x[2] * y[0] - x[0] * y[2],
    x[0] * y[1] - x[1] * y[0],
  ];
  const n0 = cross(b, c), n1 = cross(c, a), n2 = cross(a, b);
  const determinant = a[0] * n0[0] + a[1] * n0[1] + a[2] * n0[2];
  if (!Number.isFinite(determinant) || determinant === 0) {
    throw new RangeError('Singular or overflowing affine normal matrix');
  }
  const values = [...n0, ...n1, ...n2].map((v) => v / determinant);
  if (values.some((n) => !Number.isFinite(Math.fround(n)))) {
    throw new RangeError('Normal matrix exceeds WebGL2 float32');
  }
  return values;
}

export function createRenderer(canvas) {
  const gl=canvas.getContext('webgl2',{antialias:true,powerPreference:'high-performance',alpha:false});
  if (!gl) throw new Error('WebGL 2 indisponible. Essaie une version récente de Chrome, Edge ou Firefox.');
  const program=gl.createProgram();
  gl.attachShader(program, compile(gl,gl.VERTEX_SHADER,vertexShaderSource));
  gl.attachShader(program, compile(gl,gl.FRAGMENT_SHADER,fragmentShaderSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program)||'Shader link failed');
  gl.useProgram(program);
  const uniforms={};
  for (const key of ['uTranslate','uScale','uRotate','uUseAffine','uAffineModel','uAffineNormal','uCamPos','uColor','uViewProjection','uFogStrength','uTextureST','uUseTexture','uAlbedo']) {
    uniforms[key]=gl.getUniformLocation(program,key);
  }
  const meshes={};
  for (const [name,data] of [['box',makeCube()],['shard',makeOctahedron()]]) {
    const vao=gl.createVertexArray(), buffer=gl.createBuffer();
    gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
    const position=gl.getAttribLocation(program,'aPosition');
    const normal=gl.getAttribLocation(program,'aNormal');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position,3,gl.FLOAT,false,24,0);
    gl.enableVertexAttribArray(normal);
    gl.vertexAttribPointer(normal,3,gl.FLOAT,false,24,12);
    meshes[name]={vao,count:data.length/6};
  }
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  gl.disable(gl.CULL_FACE);
  const colorCache=new Map();
  const privateMeshes = new Map();
  // No asset bytes are included or fetched: uploads originate from local File inputs.
  const identity4 = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const identity3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  let privateTexture = null, hasPrivateTexture = false;
  function uploadTexture(source, width, height) {
    if (gl.isContextLost() || gl.getError() !== gl.NO_ERROR) {
      throw new Error('WebGL2 is not ready for texture upload');
    }
    const texture = gl.createTexture();
    if (!texture) throw new Error('WebGL2 failed to allocate a texture');
    gl.activeTexture(gl.TEXTURE0);
    try {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      if (ArrayBuffer.isView(source)) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, width, height, 0,
          gl.RGBA, gl.UNSIGNED_BYTE, source);
      } else {
        // ImageBitmap orientation/premultiplication are set by its caller.
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8,
          gl.RGBA, gl.UNSIGNED_BYTE, source);
      }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.generateMipmap(gl.TEXTURE_2D);
      const error = gl.getError();
      if (error !== gl.NO_ERROR || gl.isContextLost()) {
        throw new Error(`WebGL2 texture upload failed (${error})`);
      }
      return texture;
    } catch (error) {
      gl.deleteTexture(texture);
      gl.bindTexture(gl.TEXTURE_2D, privateTexture);
      throw error;
    }
  }
  // Keep the sampler complete even before a local texture is selected.
  privateTexture = uploadTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  gl.uniform1i(uniforms.uAlbedo, 0);
  gl.uniform1i(uniforms.uUseTexture, 0);
  let drawCalls=0;
  const viewProjection = new Float32Array(16);
  let currentCamera = null;
  const currentSceneClock = { scaledTime: 0, unscaledTime: 0, timeScale: 1 };
  let projectionState = null;
  function begin(camera, { fogStrength = GENERATED_FOG_STRENGTH, projection = null,
    scaledTime = 0, unscaledTime = 0, timeScale = 1 } = {}) {
    currentCamera = camera;
    currentSceneClock.scaledTime = scaledTime;
    currentSceneClock.unscaledTime = unscaledTime;
    currentSceneClock.timeScale = timeScale;
    if (!Number.isFinite(fogStrength) || fogStrength < 0 || fogStrength > 1) {
      throw new RangeError('fogStrength must be finite and within [0,1]');
    }
    const width=Math.max(1,Math.floor(canvas.clientWidth*Math.min(window.devicePixelRatio||1,2)));
    const height=Math.max(1,Math.floor(canvas.clientHeight*Math.min(window.devicePixelRatio||1,2)));
    if (canvas.width!==width||canvas.height!==height) {
      canvas.width=width; canvas.height=height;
      gl.viewport(0,0,width,height);
    }
    gl.clearColor(.927,.948,.966,1); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.useProgram(program);
    const axes=cameraAxes(camera.yaw,camera.pitch);
    const focal = projection ? 1 / Math.tan(projection.fieldOfViewDegrees * Math.PI / 360) : 1.58;
    const near = projection?.near ?? .045, far = projection?.far ?? 120;
    if (![focal, near, far].every(Number.isFinite) || focal <= 0 || near <= 0 || far <= near) {
      throw new RangeError('Perspective projection requires finite positive scale and ordered clipping planes');
    }
    projectionState = { verticalScale: focal, near, far, aspect: width / height };
    const depth = (far + near) / (far - near), offset = -2 * far * near / (far - near);
    const right = axes.right, up = axes.up, forward = axes.forward;
    for (let i = 0; i < 3; i++) {
      const key = ['x', 'y', 'z'][i];
      viewProjection[i * 4] = right[key] * focal * height / width;
      viewProjection[i * 4 + 1] = up[key] * focal;
      viewProjection[i * 4 + 2] = forward[key] * depth;
      viewProjection[i * 4 + 3] = forward[key];
    }
    const dot = axis => axis.x * camera.x + axis.y * camera.y + axis.z * camera.z;
    viewProjection[12] = -dot(right) * focal * height / width;
    viewProjection[13] = -dot(up) * focal;
    viewProjection[14] = -dot(forward) * depth + offset;
    viewProjection[15] = -dot(forward);
    gl.uniformMatrix4fv(uniforms.uViewProjection, false, viewProjection);
    gl.uniform3f(uniforms.uCamPos,camera.x,camera.y,camera.z);
    gl.uniform1f(uniforms.uFogStrength,fogStrength);
    drawCalls=0;
  }
  function draw(mesh,x,y,z,sx,sy,sz,color,rx=0,ry=0,rz=0,alpha=1) {
    const obj=meshes[mesh];
    if (!obj) throw new Error('Unknown mesh: '+mesh);
    gl.uniform1i(uniforms.uUseAffine,0);
    gl.uniform1i(uniforms.uUseTexture,0);
    gl.uniform3f(uniforms.uTranslate,x,y,z);
    gl.uniform3f(uniforms.uScale,sx,sy,sz);
    gl.uniform3f(uniforms.uRotate,rx,ry,rz);
    if (!colorCache.has(color)) colorCache.set(color,colorToRgba(color));
    const rgba=colorCache.get(color);
    gl.uniform4f(uniforms.uColor,rgba[0],rgba[1],rgba[2],alpha);
    gl.bindVertexArray(obj.vao);
    gl.drawArrays(gl.TRIANGLES,0,obj.count);
    drawCalls++;
  }
  function affineBox(worldMatrix, size, color, alpha=1) {
    const obj=meshes.box;
    const model=boxModelMatrix(worldMatrix,size);
    const normal=normalMatrixFromAffine(model);
    if (!colorCache.has(color)) colorCache.set(color,colorToRgba(color));
    const rgba=colorCache.get(color);
    gl.uniform1i(uniforms.uUseAffine,1);
    gl.uniform1i(uniforms.uUseTexture,0);
    gl.uniformMatrix4fv(uniforms.uAffineModel,false,new Float32Array(model));
    gl.uniformMatrix3fv(uniforms.uAffineNormal,false,new Float32Array(normal));
    gl.uniform4f(uniforms.uColor,rgba[0],rgba[1],rgba[2],alpha);
    gl.bindVertexArray(obj.vao);
    gl.drawArrays(gl.TRIANGLES,0,obj.count);
    drawCalls++;
  }
  function replacePrivateMesh(slot, sourceMesh) {
    if (slot !== 'mesh6' && slot !== 'mesh7') throw new RangeError('Unsupported private mesh slot');
    // Upload first, then dispose previous mesh: failed loads do not destroy preview.
    const uploaded = uploadIndexedMesh(gl, program, sourceMesh, { requireUV: true });
    privateMeshes.get(slot)?.dispose();
    privateMeshes.set(slot, uploaded);
    return { triangles: uploaded.triangleCount, bounds: uploaded.bounds };
  }
  function replacePrivateTexture(imageBitmap, { scale = [0.1, 0.1], offset = [0, 0] } = {}) {
    const width = imageBitmap?.width, height = imageBitmap?.height;
    const maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
        width <= 0 || height <= 0 || width > maxSize || height > maxSize) {
      throw new RangeError(`Local texture dimensions must be within 1–${maxSize}`);
    }
    for (const pair of [scale, offset]) {
      if (!pair || pair.length !== 2 ||
          !Number.isFinite(pair[0]) || !Number.isFinite(Math.fround(pair[0])) ||
          !Number.isFinite(pair[1]) || !Number.isFinite(Math.fround(pair[1]))) {
        throw new TypeError('Texture scale and offset require two finite float32 values');
      }
    }
    const uploaded = uploadTexture(imageBitmap, width, height);
    gl.deleteTexture(privateTexture);
    privateTexture = uploaded;
    hasPrivateTexture = true;
    gl.useProgram(program);
    gl.uniform4f(uniforms.uTextureST, scale[0], scale[1], offset[0], offset[1]);
    return { width, height };
  }
  let nativeEnemyPass = null;
  function drawLocalEnemyDiagnostic(worldMatrix) {
    if (!nativeEnemyPass) return null;
    // Cargo concrete must never leak into the red crystal character pass.
    gl.uniform1i(uniforms.uUseTexture, 0);
    const report = nativeEnemyPass.draw(worldMatrix);
    drawCalls += report.drawCalls;
    return report;
  }
  let skinnedEnemy = null;
  let actorSkinRuntime = null;
  let skinClips = {};
  let skinStates = {};
  function replaceNativeCharacter(receipt, sourcePackage = null) {
    let nextSkin = null, nextStatic = null, nextActors = null;
    const instances = {};
    const stateInstances = {};
    try {
      if (sourcePackage) {
        if (sourcePackage.source?.variant !== receipt.variant) throw new Error('Character mesh and rig variants differ');
        nextSkin = createNativeSkinPass(gl, sourcePackage);
        nextActors = createNativeActorSkinRuntime(nextSkin);
        for (const clip of nextSkin.availableClips) {
          instances[clip] = nextSkin.createInstance({ clip,
            playback: ['idle', 'walk', 'run'].includes(clip) ? 'loop' : 'clamp' });
        }
        for (const state of Object.keys(nextSkin.states)) {
          stateInstances[state] = nextSkin.createStateInstance(state);
        }
      }
      nextStatic = createEnemyStaticIndexedPass(gl, program, uniforms, receipt, {
        diagnosticColor: enemyRedCrystalDiagnosticWebPacket(receipt.rendererPathId).color,
      });
    } catch (error) { nextSkin?.dispose(); nextStatic?.dispose(); throw error; }
    skinnedEnemy?.dispose();
    nativeEnemyPass?.dispose();
    skinnedEnemy = nextSkin;
    actorSkinRuntime = nextActors;
    nativeEnemyPass = nextStatic;
    skinClips = instances;
    skinStates = stateInstances;
    return nextSkin ? { bones: nextSkin.jointCount, weightedBones: nextSkin.weightedJointCount,
      skinRig: nextSkin.rig,
      clips: nextSkin.availableClips, states: nextSkin.states, clipDurations: nextSkin.clipDurations,
      actionTiming: nextSkin.actionTiming,
      availableActions: nextSkin.availableActions,
      actionDurations: Object.fromEntries(Object.entries(nextSkin.actionPrecompositions)
        .map(([name, action]) => [name, action.actionDuration])),
      transitions: Object.fromEntries(nextSkin.availableTransitions.map(key =>
        [key, sourcePackage.transitions[key].duration])) } : null;
  }
  function drawNativeSkin(modelMatrix, clip, time, {
    statePlayback = false, transition = null, action = null, solvedPose = null, shaderTime = 0,
    cameraPosition = currentCamera,
  } = {}) {
    if (!skinnedEnemy) return null;
    const instance = (statePlayback ? skinStates : skinClips)[clip];
    if (!instance) throw new Error('Native animation unavailable: ' + clip);
    const scale = name => statePlayback ? skinnedEnemy.states[name].speed : 1;
    const report = skinnedEnemy.draw({
      instance, modelMatrix, viewProjection, time: time * scale(clip),
      transition: transition ? { from: (statePlayback ? skinStates : skinClips)[transition.from],
        fromTime: transition.fromTime * scale(transition.from), elapsed: transition.elapsed } : null,
      action, solvedPose, shaderTime, cameraPosition, sourceLighting: nativeSkinLighting,
      color: [0.720588207244873, 0, 0, 1],
    });
    drawCalls += report.drawCalls;
    return report;
  }

  // The SH-14 runtime returns owned per-actor bone matrices and weapon
  // sockets, unlike the GPU pass's reusable draw scratch. Web gameplay still
  // chooses its own pose; no native controller execution is inferred.
  function drawNativeActorSkin(actorId, modelMatrix, clip, time, {
    statePlayback = false, transition = null, action = null, solvedPose = null,
    shaderTime = 0, cameraPosition = currentCamera,
  } = {}) {
    if (!actorSkinRuntime) return null;
    const selection = (name, elapsed) => statePlayback
      ? {state: name, time: elapsed}
      : {clip: name, playback: ['idle', 'walk', 'run'].includes(name) ? 'loop' : 'clamp', time: elapsed};
    const pose = selection(clip, time);
    if (transition) pose.transition = {
      from: selection(transition.from, transition.fromTime),
      elapsed: transition.elapsed,
    };
    if (action) pose.action = action;
    if (solvedPose) pose.solvedPose = solvedPose;
    const report = actorSkinRuntime.drawActor({
      actorId, pose, modelMatrix, viewProjection, shaderTime,
      cameraPosition, sourceLighting: nativeSkinLighting,
      color: [0.720588207244873, 0, 0, 1],
    });
    drawCalls += report.drawCalls;
    return report;
  }
  let nativePlayerHands = null;
  function replaceDojoPlayerHands(playerPacket = null, rig = null, clips = null) {
    // Only scene-authorized private packets may instantiate a first-person
    // skinned draw. Replacing a scene drops the previous GL resources first.
    nativePlayerHands?.dispose();
    nativePlayerHands = null;
    if (!playerPacket) return false;
    nativePlayerHands = createDojoPlayerAnimationPass(gl, { playerPacket, rig, clips });
    return true;
  }
  function drawDojoPlayerHands({ heldItem, profileId = null, modelMatrix, phase = 'held',
      sourceClipTime, descriptor = null } = {}) {
    // Source profile validation remains inside the GPU pass. In particular,
    // only explicit, source-visible unarmed descriptors may render after throw.
    const sourceUnarmed=heldItem == null && profileId === 'unarmed';
    if (!nativePlayerHands || (!sourceUnarmed && heldItem?.isKatana !== true)) return null;
    const report = nativePlayerHands.draw({
      heldItem, profileId, phase, sourceClipTime, modelMatrix,
      descriptor, viewProjection, cameraPosition: currentCamera,
      shaderTime: currentSceneClock.unscaledTime,
      // Diagnostic Web-lit tint: no claim of native hands shader parity.
      color: [0.81, 0.84, 0.87, 1],
    });
    if (report) drawCalls += report.handsDrawCalls;
    return report;
  }
  let nativeWorld = null;
  let nativeSkinLighting;
  function replaceNativeWorld(prepared, images) {
    const next = createNativeWorldPass(gl, prepared, images);
    nativeWorld?.dispose();
    nativeWorld = next;
    nativeSkinLighting = Object.freeze({
      directionToLight: prepared.concreteLighting.globals.worldSpaceLightDirection,
      directionProvenance: `${prepared.source.serializedOwner}-serialized-realtime-direction-web-space`,
    });
  }
  function getNativeInstanceBounds(id) {
    if (!nativeWorld) throw new Error('Native scene is not loaded');
    return nativeWorld.getInstanceBounds(id);
  }
  function drawNativeWorld(warningPackets = null) {
    if (!nativeWorld) return null;
    // Packets are sampled by SH-07's source controller; drawing never advances its clock.
    const report = nativeWorld.draw(viewProjection, currentCamera, currentSceneClock, warningPackets);
    drawCalls += report.drawCalls;
    return report;
  }
  function drawNativeWeapon(modelMatrix, enemy = false) {
    if (!nativeWorld) return false;
    const report = nativeWorld.drawWeapon(viewProjection, currentCamera, modelMatrix, currentSceneClock, enemy);
    if (!report) return false;
    drawCalls += report.drawCalls;
    return true;
  }
  function drawFirstPersonWeapon(modelMatrix) {
    if (!nativeWorld) return false;
    const report = nativeWorld.drawFirstPersonWeapon(viewProjection, currentCamera, modelMatrix, currentSceneClock);
    if (!report) return false;
    drawCalls += report.drawCalls;
    return report.drawCalls > 0;
  }
  function setNativeInstanceVisible(id, visible) {
    return nativeWorld?.setInstanceVisible(id, visible) ?? false;
  }
  function drawNativeInstance(id, matrix, held = false) {
    if (!nativeWorld) return false;
    const report = held
      ? nativeWorld.drawHeldInstance(id, matrix, viewProjection, currentCamera, currentSceneClock)
      : nativeWorld.drawInstance(id, matrix, viewProjection, currentCamera, currentSceneClock);
    if (!report) return false;
    drawCalls += report.drawCalls;
    return report.drawCalls > 0;
  }
  // A local, source-converted OBJ may be reused for different serialized
  // submesh placements via per-draw affine transforms (SH-04/11 #68/#63).
  // No original data is shipped; non-identity models remain opt-in.
  function drawPrivateMesh(slot, color, modelMatrix = null, drawRange = null) {
    const mesh = privateMeshes.get(slot);
    if (!mesh) return false;
    let model = identity4, normal = identity3;
    if (modelMatrix !== null) {
      if (!modelMatrix || modelMatrix.length !== 16 ||
          [...modelMatrix].some((v) => !Number.isFinite(v) || !Number.isFinite(Math.fround(v))) ||
          modelMatrix[3] !== 0 || modelMatrix[7] !== 0 ||
          modelMatrix[11] !== 0 || modelMatrix[15] !== 1) {
        throw new TypeError('Private mesh requires a finite affine 4x4 model matrix');
      }
      model = new Float32Array(modelMatrix);
      normal = new Float32Array(normalMatrixFromAffine(modelMatrix));
    }
    let rgba;
    if (!hasPrivateTexture) {
      if (!colorCache.has(color)) colorCache.set(color, colorToRgba(color));
      rgba = colorCache.get(color);
    }
    gl.uniform1i(uniforms.uUseAffine, 1);
    gl.uniform1i(uniforms.uUseTexture, hasPrivateTexture ? 1 : 0);
    gl.uniformMatrix4fv(uniforms.uAffineModel, false, model);
    gl.uniformMatrix3fv(uniforms.uAffineNormal, false, normal);
    if (hasPrivateTexture) gl.uniform4f(uniforms.uColor, 1, 1, 1, 1);
    else gl.uniform4f(uniforms.uColor, rgba[0], rgba[1], rgba[2], 1);
    mesh.draw(drawRange);
    // Only suppress a matching generated proxy after an accepted GL draw.
    if (gl.isContextLost() || gl.getError() !== gl.NO_ERROR) return false;
    drawCalls++;
    return true;
  }
  return {
    begin,draw,affineBox,replacePrivateMesh,replacePrivateTexture,drawPrivateMesh,
    replaceNativeCharacter, drawLocalEnemyDiagnostic, drawNativeSkin, drawNativeActorSkin,
    replaceNativeWorld, drawNativeWorld, drawNativeWeapon, drawFirstPersonWeapon,
    replaceDojoPlayerHands, drawDojoPlayerHands,
    setNativeInstanceVisible, drawNativeInstance, getNativeInstanceBounds,
    box: (...args)=>draw('box',...args),
    shard: (...args)=>draw('shard',...args),
    getDrawCalls:()=>drawCalls,
    getProjectionState: () => projectionState && ({ ...projectionState, viewProjection: Array.from(viewProjection) }),
  };
}
