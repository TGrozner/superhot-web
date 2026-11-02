import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareNativeNavigation, sampleNativeNavigation, findNativeRoute, advanceNativeRoute } from '../src/combat/native-navigation.js';
const p=(x,y,z)=>({x,y,z});
const polygon=(index,vertices,edges=[])=>({index,vertices,vertex_count:vertices.length,edges});
const tile=(index,vertices,polygons)=>({identity:{owner:'synthetic',path_id:1,tile:index},vertices,polygons});
const corner=()=>prepareNativeNavigation({tiles:[tile(0,
  [[0,0,0],[2,0,0],[2,0,2],[0,0,2],[4,0,0],[4,0,2],[4,0,4],[2,0,4]],
  [polygon(0,[0,1,2,3],[{kind:'internal_polygon',edge:1,polygon:1}]),
   polygon(1,[1,4,5,2],[{kind:'internal_polygon',edge:3,polygon:0},{kind:'internal_polygon',edge:2,polygon:2}]),
   polygon(2,[2,5,6,7],[{kind:'internal_polygon',edge:0,polygon:1}])])],portals:[]});

test('routes around a missing floor quadrant rather than chasing through it',()=>{
  const nav=corner(), route=findNativeRoute(nav,p(.5,0,1),p(3,0,3.5),{maxSnapDistance:0});
  assert.ok(route);
  const result=advanceNativeRoute(route,p(.5,0,1),100);
  assert.deepEqual(result.position,p(3,0,3.5));
  assert.equal(result.complete,true);
  for(const segment of result.segments)for(let t=0;t<=1;t+=.1) {
    const q=p(segment.from.x+(segment.to.x-segment.from.x)*t,0,segment.from.z+(segment.to.z-segment.from.z)*t);
    assert.ok(sampleNativeNavigation(nav,q,1e-9),'route stays on connected floor');
  }
});

test('movement consumes scaled travel distance and zero does not move',()=>{
  const route={points:[p(0,0,0),p(1,0,0),p(1,0,2)],cursor:0};
  assert.deepEqual(advanceNativeRoute(route,p(0,0,0),0).position,p(0,0,0));
  const result=advanceNativeRoute(route,p(0,0,0),1.5);
  assert.deepEqual(result.position,p(1,0,.5));
  assert.deepEqual(result.segments,[
    {from:p(0,0,0),to:p(1,0,0),displacement:p(1,0,0)},
    {from:p(1,0,0),to:p(1,0,.5),displacement:p(0,0,.5)},
  ]);
  assert.equal(route.cursor,2);
});

test('native polygon height anchors feet; another floor does not connect',()=>{
  const nav=prepareNativeNavigation({tiles:[tile(0,[[0,.2,0],[2,.2,0],[2,.2,2],[0,.2,2],[0,3,0],[2,3,0],[2,3,2],[0,3,2]],
    [polygon(0,[0,1,2,3]),polygon(1,[4,5,6,7])])],portals:[]});
  assert.ok(Math.abs(sampleNativeNavigation(nav,p(1,.25,1),.1).position.y-.2)<1e-12);
  assert.equal(findNativeRoute(nav,p(1,.2,1),p(1,3,1),{maxSnapDistance:.1}),null);
  assert.equal(sampleNativeNavigation(nav,p(50,.2,50),.1),null);
});

test('only accepted reconciled overlap joins separate native tiles',()=>{
  const tiles=[tile(0,[[0,0,0],[2,0,0],[2,0,2],[0,0,2]],[polygon(0,[0,1,2,3])]),
    tile(1,[[2,0,1],[4,0,1],[4,0,2],[2,0,2]],[polygon(0,[0,1,2,3])])];
  const portal={id:['synthetic',1,0,0,1],vertices:[[2,0,0],[2,0,2]],candidate_checks:[{
    target:['synthetic',1,1,0,3],accepted:true,slab_checks:[{accepted:true,shrunken_overlap:[1.01,1.99]}],
  }]};
  const unconnected=prepareNativeNavigation({tiles,portals:[]});
  assert.equal(findNativeRoute(unconnected,p(1,0,1),p(3,0,1.5),{maxSnapDistance:0}),null);
  const nav=prepareNativeNavigation({tiles,portals:[portal]});
  assert.ok(findNativeRoute(nav,p(1,0,1),p(3,0,1.5),{maxSnapDistance:0}).points.some(q=>q.x===2 && q.z===1.5));
});

test('coordinate conversion transforms all polygon and portal points consistently',()=>{
  const nav=prepareNativeNavigation({tiles:[tile(0,[[0,0,0],[2,0,0],[0,0,2]],[polygon(0,[0,1,2])])],portals:[]},q=>p(q.x+10,q.y+1,-q.z));
  assert.deepEqual(sampleNativeNavigation(nav,p(10.5,1,-.5),.01).position,p(10.5,1,-.5));
});

test('rejects mixed source datasets and unknown movement parameters',()=>{
  const a=tile(0,[[0,0,0],[1,0,0],[0,0,1]],[polygon(0,[0,1,2])]);
  const b={...a,identity:{...a.identity,path_id:2}};
  assert.throws(()=>prepareNativeNavigation({tiles:[a,b],portals:[]}),/one source/);
  assert.throws(()=>findNativeRoute(corner(),p(0,0,0),p(1,0,1),{}),/maxSnapDistance/);
  assert.throws(()=>advanceNativeRoute({points:[],cursor:0},p(0,0,0),-1),/travelDistance/);
});

test('replanning while approaching a portal does not retreat to the polygon center',()=>{
  const nav=corner();
  let position=p(1.6,0,1);
  for(let frame=0;frame<3;frame++) {
    const route=findNativeRoute(nav,position,p(3,0,3.5-frame*.1),{maxSnapDistance:0});
    const next=advanceNativeRoute(route,position,.1).position;
    assert.ok(next.x>position.x);
    position=next;
  }
});
