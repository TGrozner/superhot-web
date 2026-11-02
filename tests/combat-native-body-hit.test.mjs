import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleNativeBodyShapes, hitNativeBody } from '../src/combat/native-body-hit.js';
const identity=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
const p=(x,y,z)=>({x,y,z});
const limb={boneIndex:0,type:'CapsuleCollider',center:[0,0,0],radius:.2,height:2,direction:1,partId:'LeftShin',isArmored:false,isBulletProof:false,isMushroom:false};

test('limb sweeps include round caps but do not fill the empty space beside them',()=>{
  const shapes=sampleNativeBodyShapes([limb],identity(),identity());
  const side=hitNativeBody(shapes,p(-2,0,0),p(2,0,0));
  assert.ok(Math.abs(side.t-.45)<1e-7);
  assert.equal(side.partId,'LeftShin');
  assert.ok(hitNativeBody(shapes,p(-2,.95,0),p(2,.95,0)));
  assert.equal(hitNativeBody(shapes,p(-2,1.01,0),p(2,1.01,0)),null);
  assert.equal(hitNativeBody(shapes,p(-2,0,.201),p(2,0,.201)),null);
  assert.ok(hitNativeBody(shapes,p(-2,0,.25),p(2,0,.25),.06));
});

test('current bone pose moves the collider and nearest contact retains its body-part identity',()=>{
  const actor=identity(),bones=new Float32Array(32);bones.set(identity());bones.set(identity(),16);
  actor[12]=3;bones[16+12]=1;
  const specs=[limb,{...limb,boneIndex:1,partId:'RightShin'}];
  const shapes=sampleNativeBodyShapes(specs,actor,bones);
  assert.equal(hitNativeBody(shapes,p(6,0,0),p(0,0,0)).partId,'RightShin');
  assert.equal(hitNativeBody(shapes,p(0,0,0),p(1,0,0)),null);
  bones[12]=5;bones[16+12]=6;
  sampleNativeBodyShapes(specs,actor,bones,shapes);
  assert.equal(hitNativeBody(shapes,p(2,0,0),p(5,0,0)),null);
  assert.equal(hitNativeBody(shapes,p(7,0,0),p(10,0,0)).partId,'LeftShin');
});

test('rotated finger boxes use their actual faces, not the enclosing world box',()=>{
  const actor=identity(),bone=identity(),c=Math.SQRT1_2;
  bone[0]=c;bone[2]=-c;bone[8]=c;bone[10]=c;
  const shapes=sampleNativeBodyShapes([{boneIndex:0,type:'BoxCollider',center:[0,0,0],size:[2,.2,.2],partId:'RightForearm'}],actor,bone);
  assert.equal(hitNativeBody(shapes,p(.65,1,.65),p(.65,-1,.65)),null);
  assert.ok(hitNativeBody(shapes,p(.5,1,-.5),p(.5,-1,-.5)));
  assert.equal(hitNativeBody(shapes,p(0,0,0),p(0,0,0)).t,0);
});
