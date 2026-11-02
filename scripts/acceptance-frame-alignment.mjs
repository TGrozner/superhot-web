/**
 * SH-10: fail-closed frame camera/projection preflight for privately paired
 * MCD/Web PNGs. Pure metadata check; neither native provenance nor pixels
 * can be certified by this function.
 */
const finite = v => typeof v === 'number' && Number.isFinite(v);
const poseOK = c => c && ['x','y','z','yaw','pitch'].every(k => finite(c[k]));
const projectionOK = p => p && ['verticalScale','near','far','aspect'].every(k => finite(p[k])) &&
  p.verticalScale > 0 && p.near > 0 && p.far > p.near && p.aspect > 0;
const headingDelta = (a, b) => Math.abs(Math.atan2(Math.sin(a-b), Math.cos(a-b)));
const delta = (a, b) => ({
  position: Math.hypot(a.x-b.x, a.y-b.y, a.z-b.z),
  angle: Math.hypot(headingDelta(a.yaw,b.yaw), a.pitch-b.pitch),
});
const fov = p => 2*Math.atan(1/p.verticalScale)*180/Math.PI;
const max = (...v) => Math.max(...v);
const limitFields = ['cameraPosition','cameraAngle','cameraFov','projectionNear','projectionFar','projectionAspect'];

export function framePairAlignment(web, native, limits) {
  const reasons=[],deltas=[],exceeded=[];
  if (!limits || limitFields.some(k => !finite(limits[k]) || limits[k] < 0))
    reasons.push('FRAME_ALIGNMENT_LIMITS_UNKNOWN');
  if (!Array.isArray(web?.frames) || web.frames.length !== 2 ||
      !Array.isArray(native?.frames) || native.frames.length !== 2)
    reasons.push('FRAME_ALIGNMENT_SAMPLES_UNKNOWN');
  if (reasons.length) return {status:'INCONNU',reasons,deltas,exceeded};
  for(let i=0;i<2;i++) {
    const w=web.frames[i],n=native.frames[i];
    const before=w?.renderedCameraBefore,after=w?.renderedCameraAfter,nativeCamera=n?.camera;
    const beforeP=w?.renderedProjectionBefore,afterP=w?.renderedProjectionAfter,nativeP=n?.projection;
    if (!poseOK(before) || !poseOK(after)) reasons.push(`WEB_FRAME_${i}_CAMERA_UNOBSERVED`);
    if (!poseOK(nativeCamera) || nativeCamera.source !== 'RUNTIME_OBSERVED')
      reasons.push(`NATIVE_FRAME_${i}_CAMERA_UNOBSERVED`);
    if (!projectionOK(beforeP) || !projectionOK(afterP))
      reasons.push(`WEB_FRAME_${i}_PROJECTION_UNOBSERVED`);
    if (!projectionOK(nativeP) || nativeP.source !== 'RUNTIME_OBSERVED')
      reasons.push(`NATIVE_FRAME_${i}_PROJECTION_UNOBSERVED`);
    if (reasons.some(r => r.includes(`FRAME_${i}_`))) continue;
    const positions=[delta(before,nativeCamera),delta(after,nativeCamera),delta(before,after)];
    const focal=[beforeP,afterP,nativeP].map(fov);
    const aspect=web?.viewport?.width/web?.viewport?.height;
    if (!finite(aspect) || aspect<=0) {reasons.push('WEB_VIEWPORT_ASPECT_UNKNOWN');continue;}
    const measured={
      frame:i,
      cameraPosition:max(...positions.map(p=>p.position)),
      cameraAngle:max(...positions.map(p=>p.angle)),
      cameraFov:max(Math.abs(focal[0]-focal[2]),Math.abs(focal[1]-focal[2]),Math.abs(focal[0]-focal[1])),
      projectionNear:max(Math.abs(beforeP.near-nativeP.near),Math.abs(afterP.near-nativeP.near),Math.abs(beforeP.near-afterP.near)),
      projectionFar:max(Math.abs(beforeP.far-nativeP.far),Math.abs(afterP.far-nativeP.far),Math.abs(beforeP.far-afterP.far)),
      projectionAspect:max(Math.abs(beforeP.aspect-nativeP.aspect),Math.abs(afterP.aspect-nativeP.aspect),
        Math.abs(beforeP.aspect-afterP.aspect),Math.abs(beforeP.aspect-aspect),Math.abs(afterP.aspect-aspect),Math.abs(nativeP.aspect-aspect)),
    };
    deltas.push(measured);
    for(const field of limitFields)if(measured[field]>limits[field])exceeded.push(`FRAME_${i}_${field.toUpperCase()}_OUT_OF_TOLERANCE`);
  }
  return {status: reasons.length?'INCONNU':exceeded.length?'NON_COMPARABLE_CAMERA_POSE':
    'FRAME_CONTEXT_PAIRED_NOT_NATIVE_CERTIFIED',reasons,deltas,exceeded};
}
