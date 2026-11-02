import test from 'node:test';
import assert from 'node:assert/strict';
import { framePairAlignment } from '../scripts/acceptance-frame-alignment.mjs';
// All input is SYNTHETIC metadata. A passing fixture is NOT an MCD capture.
const p={verticalScale:1.7320508075688772,near:.1,far:150,aspect:16/9};
const c={x:1,y:2,z:3,yaw:0,pitch:-.1};
const lim={cameraPosition:.02,cameraAngle:.01,cameraFov:.02,projectionNear:.001,projectionFar:.01,projectionAspect:.001};
function pair(){
  return {
    web:{viewport:{width:1280,height:720},frames:[0,1].map(()=>({renderedCameraBefore:{...c},renderedCameraAfter:{...c},renderedProjectionBefore:{...p},renderedProjectionAfter:{...p}}))},
    native:{frames:[0,1].map(()=>({camera:{...c,source:'RUNTIME_OBSERVED'},projection:{...p,source:'RUNTIME_OBSERVED'}}))},
  };
}
test('stable matched synthetic frame context is not native certification',()=>{
 const {web,native}=pair();const x=framePairAlignment(web,native,lim);
 assert.equal(x.status,'FRAME_CONTEXT_PAIRED_NOT_NATIVE_CERTIFIED');assert.equal(x.deltas.length,2);assert.deepEqual(x.exceeded,[]);
});
test('different camera only in second image is NON_COMPARABLE, not renderer gap',()=>{
 const {web,native}=pair();native.frames[1].camera.x+=.6;
 const x=framePairAlignment(web,native,lim);assert.equal(x.status,'NON_COMPARABLE_CAMERA_POSE');assert.ok(x.exceeded.some(y=>y.startsWith('FRAME_1_CAMERA')));
});
test('screenshot frame bracket camera changed while sampling is NON_COMPARABLE',()=>{
 const {web,native}=pair();web.frames[1].renderedCameraAfter.y+=.2;
 assert.equal(framePairAlignment(web,native,lim).status,'NON_COMPARABLE_CAMERA_POSE');
});
test('mismatched FOV, near, far and aspect are each detected',()=>{
 for(const [k,offset] of [['verticalScale',.3],['near',.2],['far',5],['aspect',.2]]) {
  const {web,native}=pair(); native.frames[0].projection[k]+=offset;
  const x=framePairAlignment(web,native,lim);
  assert.equal(x.status,'NON_COMPARABLE_CAMERA_POSE',k); assert.ok(x.exceeded.some(s=>s.startsWith('FRAME_0_')),k);
 }
});
test('native absent / serialized-only projection is INCONNU, not measured gap',()=>{
 const {web,native}=pair();native.frames[0].projection.source='SERIALIZED_ONLY';
 const x=framePairAlignment(web,native,lim);
 assert.equal(x.status,'INCONNU');assert.ok(x.reasons.includes('NATIVE_FRAME_0_PROJECTION_UNOBSERVED'));
});
test('missing operator near/far tolerances yields INCONNU',()=>{
 const {web,native}=pair();const {projectionNear,...incomplete}=lim;
 assert.equal(framePairAlignment(web,native,incomplete).status,'INCONNU');
});
test('yaw wrapped at 180 degrees compares as same angle',()=>{
 const {web,native}=pair();web.frames[0].renderedCameraBefore.yaw=Math.PI;
 web.frames[0].renderedCameraAfter.yaw=-Math.PI;native.frames[0].camera.yaw=-Math.PI;
 assert.equal(framePairAlignment(web,native,lim).status,'FRAME_CONTEXT_PAIRED_NOT_NATIVE_CERTIFIED');
});
