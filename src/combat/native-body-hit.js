import { prepareNativeCollision, nativeSphereHit } from '../scenes/native-collision.js';

const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const point=(m,p)=>({x:m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],y:m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],z:m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]});

/** Source limb colliders use Unity bone-local coordinates. The actor matrix
 * already maps the sampled Unity skeleton into browser world space. */
export function sampleNativeBodyShapes(specs, actorMatrix, boneMatrices, output=[]) {
  for(let i=0;i<specs.length;i++) {
    const source=specs[i], offset=source.boneIndex*16;
    if(offset+16>boneMatrices.length)throw new RangeError('Source hit collider bone is absent');
    const shape=output[i]??(output[i]={matrix:new Float32Array(16)}),m=shape.matrix;
    for(let c=0;c<4;c++)for(let r=0;r<4;r++)m[c*4+r]=actorMatrix[r]*boneMatrices[offset+c*4]+actorMatrix[4+r]*boneMatrices[offset+c*4+1]+actorMatrix[8+r]*boneMatrices[offset+c*4+2]+actorMatrix[12+r]*boneMatrices[offset+c*4+3];
    shape.source=source;
    if(source.type==='BoxCollider') {
      shape.box=prepareNativeCollision([{id:'limb',worldMatrix:m,center:source.center,size:source.size}]);
      continue;
    }
    shape.box=null;
    const scale=Math.max(Math.hypot(m[0],m[1],m[2]),Math.hypot(m[4],m[5],m[6]),Math.hypot(m[8],m[9],m[10]));
    shape.radius=source.radius*scale;
    const a=source.center.slice(),b=source.center.slice();
    if(source.type==='CapsuleCollider') {
      const half=Math.max(0,source.height/2-source.radius);
      a[source.direction]-=half;b[source.direction]+=half;
    } else if(source.type!=='SphereCollider')throw new TypeError('Unsupported source body collider');
    shape.a=point(m,a);shape.b=point(m,b);
  }
  output.length=specs.length;
  return output;
}

function sphere(start, delta, center, radius) {
  const v=sub(start,center),c=dot(v,v)-radius*radius;
  if(c<=0)return 0;
  const a=dot(delta,delta),b=dot(v,delta),d=b*b-a*c;
  if(a===0||d<0)return null;
  const t=(-b-Math.sqrt(d))/a;
  return t>=0&&t<=1?t:null;
}
function capsule(start,end,a,b,radius) {
  const ba=sub(b,a),oa=sub(start,a),rd=sub(end,start),length=dot(ba,ba);
  if(length<1e-16)return sphere(start,rd,a,radius);
  const projection=Math.max(0,Math.min(1,dot(oa,ba)/length));
  const nearest={x:a.x+ba.x*projection,y:a.y+ba.y*projection,z:a.z+ba.z*projection};
  const separation=sub(start,nearest);
  if(dot(separation,separation)<=radius*radius)return 0;
  const bard=dot(ba,rd),baoa=dot(ba,oa);
  const qa=length*dot(rd,rd)-bard*bard;
  const qb=length*dot(rd,oa)-baoa*bard;
  const qc=length*dot(oa,oa)-baoa*baoa-radius*radius*length;
  let best=null;
  const discriminant=qb*qb-qa*qc;
  if(qa>1e-16&&discriminant>=0) {
    const t=(-qb-Math.sqrt(discriminant))/qa,y=baoa+t*bard;
    if(t>=0&&t<=1&&y>=0&&y<=length)best=t;
  }
  for(const center of [a,b]) {
    const t=sphere(start,rd,center,radius);
    if(t!==null&&(best===null||t<best))best=t;
  }
  return best;
}

/** Nearest real limb contact, including round caps and source finger boxes. */
export function hitNativeBody(shapes,start,end,radius=0) {
  let hit=null;
  for(const shape of shapes??[]) {
    const t=shape.box?nativeSphereHit(shape.box,start,end,radius)?.t??null:capsule(start,end,shape.a,shape.b,shape.radius+radius);
    if(t===null||(hit&&t>=hit.t))continue;
    hit={...shape.source,t,point:{x:start.x+(end.x-start.x)*t,y:start.y+(end.y-start.y)*t,z:start.z+(end.z-start.z)*t}};
  }
  return hit;
}
