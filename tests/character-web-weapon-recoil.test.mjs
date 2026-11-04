import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeSkinPass } from '../src/characters/native-skin-pass.js';
import { createNativeActorSkinRuntime } from '../src/characters/native-actor-skin.js';

// Source-neutral 4-joint fixture: only names/ancestry from the published rig.
const id=()=>[1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
const translated=(x,y,z)=>{const m=id();m[12]=x;m[13]=y;m[14]=z;return m;};
const bone=(name,parent,pos)=>({name,parent,position:pos,rotation:[0,0,0,1],scale:[1,1,1]});
function packageFixture() {
  const pose={positions:[0,0,0, 0,1,0, 0,0,1, 0,0,1],
    rotations:Array.from({length:4},()=>[0,0,0,1]).flat(),
    scales:Array.from({length:4},()=>[1,1,1]).flat()};
  return {
    schemaVersion:1,source:{owner:'authored-web-fixture',mesh:1},
    coordinates:{
      space:'synthetic renderer-local space',axes:'+X right, +Y up, +Z forward',
      units:'authored test units',quaternion:'[x,y,z,w]',
      boneOrder:'parent-first; joint indices address bones',
      inverseBindMatrices:'flat column-major matrices for WebGL',
      skinEquation:'vertex = sum(weight * boneModelMatrix * inverseBindMatrix * meshVertex)',
      indices:'original authored indices; one source triangle submesh',
    },
    bones:[bone('root',-1,[0,0,0]),bone('jnt_R_Arm_Shoulder',0,[0,1,0]),
      bone('jnt_R_Arm_Elbow',1,[0,0,1]),bone('jnt_R_Arm_Wrist',2,[0,0,1])],
    mesh:{positions:[0,1,0,0,1,1,0,1,2],normals:[0,0,1,0,0,1,0,0,1],
      indices:[0,1,2],indexComponentBits:16,
      submeshes:[{firstIndex:0,indexCount:3,baseVertex:0,topology:0}],
      jointIndices:[1,0,0,0,2,0,0,0,3,0,0,0],
      weights:[1,0,0,0,1,0,0,0,1,0,0,0],
      inverseBindMatrices:[...id(),...translated(0,-1,0),
        ...translated(0,-1,-1),...translated(0,-1,-2)]},
    clips:{idle:{duration:1,sampleRate:1,frames:[pose,pose]},
      fire:{duration:1,sampleRate:1,frames:[pose,pose]}},
    states:{idle:{clip:'idle',playback:'loop',speed:1},
      fire:{clip:'fire',playback:'clamp',speed:8}},
    actionLayers:{fire:{clip:'fire',mode:'override',defaultWeight:1,
      mask:[0,1,1,1],source:'authored-web-fixture',webComposable:true}},
    weaponAttachment:{bone:'jnt_R_Arm_Wrist',localMatrix:id(),
      source:'authored-web-fixture',coordinates:'test'},
  };
}
function glFixture() {
  let program='host',vao='host',arrayBuffer=null,face=2305,drawCalls=0;
  const palette=[];
  const gl={
    VERTEX_SHADER:35633,FRAGMENT_SHADER:35632,COMPILE_STATUS:35713,LINK_STATUS:35714,
    MAX_VERTEX_UNIFORM_VECTORS:36347,VERTEX_ARRAY_BINDING:34229,
    ARRAY_BUFFER_BINDING:34964,CURRENT_PROGRAM:35725,FRONT_FACE:2886,
    CULL_FACE:2884,ARRAY_BUFFER:34962,ELEMENT_ARRAY_BUFFER:34963,
    STATIC_DRAW:35044,FLOAT:5126,UNSIGNED_BYTE:5121,
    TRIANGLES:4,UNSIGNED_SHORT:5123,UNSIGNED_INT:5125,CW:2304,CCW:2305,
    createShader:()=>({}),shaderSource:()=>{},compileShader:()=>{},
    getShaderParameter:()=>true,getShaderInfoLog:()=>'',deleteShader:()=>{},
    createProgram:()=>({}),attachShader:()=>{},linkProgram:()=>{},
    getProgramParameter:()=>true,getProgramInfoLog:()=>'',deleteProgram:()=>{},
    createVertexArray:()=>({}),createBuffer:()=>({}),
    bindVertexArray:v=>{vao=v},bindBuffer:(t,v)=>{if(t===34962)arrayBuffer=v},
    bufferData:()=>{},enableVertexAttribArray:()=>{},vertexAttribPointer:()=>{},
    vertexAttribIPointer:()=>{},getAttribLocation:(_p,n)=>
      ({aPosition:0,aNormal:1,aJointIndices:2,aWeights:3})[n]??-1,
    getUniformLocation:(_p,name)=>({name}),
    getParameter:k=>({36347:256,34229:vao,34964:arrayBuffer,35725:program,2886:face})[k],
    isEnabled:k=>k===2884,useProgram:p=>{program=p},frontFace:v=>{face=v},
    uniformMatrix4fv:(l,_tr,v)=>{if(l.name==='uJoints[0]')palette.push(Array.from(v))},
    uniform3f:()=>{},uniform2f:()=>{},uniform4f:()=>{},
    drawElements:()=>{drawCalls++},deleteBuffer:()=>{},deleteVertexArray:()=>{},
  };
  return {gl,palette,getDraws:()=>drawCalls};
}
test('accepted source pistol fire bends weighted right arm and world wrist only after shot',()=>{
  const mock=glFixture(),pass=createNativeSkinPass(mock.gl,packageFixture());
  assert.equal(pass.webFireArmKickAvailable,true);
  assert.equal(pass.webFireArmPivotBone,1);
  const actors=createNativeActorSkinRuntime(pass);
  const draw=t=>actors.drawActor({actorId:'gunner',pose:{
    state:'idle',time:.4,action:{state:'fire',time:t,weight:1,blend:1}},
    modelMatrix:id(),viewProjection:id(),color:[.8,.1,.2,1]});
  const edge=draw(0);
  assert.equal(edge.actorWebFireArmKick,null);
  assert.equal(edge.webFireArmKickApplied,false);
  const kicked=draw(.15);
  assert.ok(kicked.webFireArmKickApplied);
  const torsoOnly=pass.draw({instance:pass.createStateInstance('idle'),time:.4,
    action:{state:'fire',time:.15,weight:1,blend:1},
    webPoseLean:kicked.actorWebPoseReaction,
    modelMatrix:id(),viewProjection:id(),color:[.8,.1,.2,1]});
  assert.deepEqual(Array.from(kicked.boneModelMatrices.slice(0,16)),
    Array.from(torsoOnly.boneModelMatrices.slice(0,16)));
  assert.ok(kicked.weaponAttachmentMatrix[13]>torsoOnly.weaponAttachmentMatrix[13]+.1);
  assert.ok(kicked.boneModelMatrices[3*16+13]>torsoOnly.boneModelMatrices[3*16+13]+.1);
  assert.equal(mock.getDraws(),3,'no duplicate draw or replacement geometry');
  assert.equal(mock.palette.length,3);
  assert.throws(()=>pass.draw({instance:pass.createStateInstance('idle'),time:.4,
    modelMatrix:id(),viewProjection:id(),color:[1,1,1,1],
    webFireArmKick:{pitch:1,yaw:0,roll:0}}),/gun kick requires/);
  pass.dispose();
  const noChain=packageFixture();
  noChain.bones[2]={...noChain.bones[2],name:'unrelated-elbow'};
  const alternate=createNativeSkinPass(glFixture().gl,noChain);
  assert.equal(alternate.webFireArmKickAvailable,false);
  alternate.dispose();
});
