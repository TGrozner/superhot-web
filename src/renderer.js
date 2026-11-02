import { cameraAxes } from './math.js';
import { uploadIndexedMesh } from './render/gpu-mesh.js';
import { createGeneratedLighting, lightingUniformPacket } from './render/lighting-model.js';

// Legacy Web fog is generated, not MCD. SH-13 owns the source-qualified lighting model.
const GENERATED_FOG_STRENGTH = lightingUniformPacket(createGeneratedLighting()).fogStrength;

const vertexShaderSource = `#version 300 es
precision highp float;
in vec3 aPosition;
in vec3 aNormal;
uniform vec3 uTranslate;
uniform vec3 uScale;
uniform vec3 uRotate;
uniform int uUseAffine;
uniform mat4 uAffineModel;
uniform mat3 uAffineNormal;
uniform vec3 uCamPos;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform vec4 uColor;
uniform vec2 uProjection;
out vec3 vColor;
out float vFog;
out float vAlpha;
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
  vec3 rel = world - uCamPos;
  vec3 cam = vec3(dot(rel, uRight), dot(rel, uUp), dot(rel, uForward));
  float f = 1.58;
  float near = .045, far = 120.0;
  gl_Position = vec4(cam.x * f / uProjection.x, cam.y * f,
    cam.z * (far+near) / (far-near) - 2.0 * far * near / (far-near), cam.z);
  vec3 normal = normalize(uUseAffine == 1
    ? uAffineNormal * aNormal
    : rotate3(aNormal));
  float illumination = 0.64 + 0.36 * max(dot(normal, normalize(vec3(-.55,.90,.42))), 0.0);
  vColor = uColor.rgb * illumination;
  vFog = clamp((distance(world, uCamPos) - 14.0) / 56.0, 0.0, 1.0);
  vAlpha = uColor.a;
}`;

const fragmentShaderSource = `#version 300 es
precision highp float;
in vec3 vColor;
in float vFog;
in float vAlpha;
uniform float uFogStrength;
out vec4 fragColor;
void main() {
  vec3 fog = vec3(.927,.948,.966);
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
  for (const key of ['uTranslate','uScale','uRotate','uUseAffine','uAffineModel','uAffineNormal','uCamPos','uRight','uUp','uForward','uColor','uProjection','uFogStrength']) {
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
  let drawCalls=0;
  function begin(camera, { fogStrength = GENERATED_FOG_STRENGTH } = {}) {
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
    gl.uniform3f(uniforms.uCamPos,camera.x,camera.y,camera.z);
    gl.uniform3f(uniforms.uRight,...Object.values(axes.right));
    gl.uniform3f(uniforms.uUp,...Object.values(axes.up));
    gl.uniform3f(uniforms.uForward,...Object.values(axes.forward));
    gl.uniform2f(uniforms.uProjection,width/height,1);
    gl.uniform1f(uniforms.uFogStrength,fogStrength);
    drawCalls=0;
  }
  function draw(mesh,x,y,z,sx,sy,sz,color,rx=0,ry=0,rz=0,alpha=1) {
    const obj=meshes[mesh];
    if (!obj) throw new Error('Unknown mesh: '+mesh);
    gl.uniform1i(uniforms.uUseAffine,0);
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
    const uploaded = uploadIndexedMesh(gl, program, sourceMesh);
    privateMeshes.get(slot)?.dispose();
    privateMeshes.set(slot, uploaded);
    return { triangles: uploaded.triangleCount, bounds: uploaded.bounds };
  }
  function drawPrivateMesh(slot, color) {
    const mesh = privateMeshes.get(slot);
    if (!mesh) return false;
    if (!colorCache.has(color)) colorCache.set(color, colorToRgba(color));
    const rgba = colorCache.get(color);
    gl.uniform1i(uniforms.uUseAffine, 1);
    gl.uniformMatrix4fv(uniforms.uAffineModel, false, identity4);
    gl.uniformMatrix3fv(uniforms.uAffineNormal, false, identity3);
    gl.uniform4f(uniforms.uColor, rgba[0], rgba[1], rgba[2], 1);
    mesh.draw();
    drawCalls++;
    return true;
  }
  return {
    begin,draw,affineBox,replacePrivateMesh,drawPrivateMesh,
    box: (...args)=>draw('box',...args),
    shard: (...args)=>draw('shard',...args),
    getDrawCalls:()=>drawCalls,
  };
}
