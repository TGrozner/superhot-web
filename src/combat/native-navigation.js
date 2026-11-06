// Decoded Unity NavMesh polygons, not a replacement for native Detour/crowd simulation.
// Private navigation/scene-contracts.json identifies each scene's data; callers
// supply only that dataset and its reconciled cross-tile portals in scene space.
const xyz = p => ({ x: p[0], y: p[1], z: p[2] });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const mix = (a, b, t) => ({ x: a.x + (b.x-a.x)*t, y: a.y + (b.y-a.y)*t, z: a.z + (b.z-a.z)*t });
const key = (tile, polygon) => `${tile}:${polygon}`;
const finitePoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);

function closestOnTriangle(p, a, b, c) {
  const ab = sub(b,a), ac = sub(c,a), ap = sub(p,a);
  const d1 = dot(ab,ap), d2 = dot(ac,ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p,b), d3 = dot(ab,bp), d4 = dot(ac,bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1*d4-d3*d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return mix(a,b,d1/(d1-d3));
  const cp = sub(p,c), d5 = dot(ab,cp), d6 = dot(ac,cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5*d2-d1*d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return mix(a,c,d2/(d2-d6));
  const va = d3*d6-d5*d4;
  if (va <= 0 && d4-d3 >= 0 && d5-d6 >= 0) return mix(b,c,(d4-d3)/(d4-d3+d5-d6));
  const denominator = va+vb+vc;
  if (denominator === 0) return a;
  const v = vb/denominator, w = vc/denominator;
  return { x:a.x+ab.x*v+ac.x*w, y:a.y+ab.y*v+ac.y*w, z:a.z+ab.z*v+ac.z*w };
}

/** Build once per scene. mapPoint maps native xyz objects to the caller's world. */
export function prepareNativeNavigation({ tiles, portals }, mapPoint = p => p) {
  if (!Array.isArray(tiles) || !Array.isArray(portals)) throw new TypeError('decoded tiles and portals required');
  const nodes = [], byKey = new Map();
  const identity = tiles[0]?.identity;
  for (const tile of tiles) {
    if (tile.identity.owner !== identity.owner || tile.identity.path_id !== identity.path_id)
      throw new TypeError('navigation must contain exactly one source NavMeshData');
    for (const polygon of tile.polygons) {
      const vertices = polygon.vertices.slice(0, polygon.vertex_count).map(i => mapPoint(xyz(tile.vertices[i])));
      if (vertices.length < 3 || vertices.some(p => !finitePoint(p))) throw new TypeError('invalid navigation polygon');
      const center = vertices.reduce((a,p) => ({ x:a.x+p.x/vertices.length, y:a.y+p.y/vertices.length, z:a.z+p.z/vertices.length }), { x:0,y:0,z:0 });
      const node = { index:nodes.length, key:key(tile.identity.tile,polygon.index), vertices, center, links:[] };
      nodes.push(node); byKey.set(node.key,node);
    }
  }
  function link(from, to, point) {
    if (!from || !to || from === to) return;
    if (!finitePoint(point)) throw new TypeError('invalid portal point');
    from.links.push({ to:to.index, point, cost:distance(from.center,point)+distance(point,to.center) });
  }
  for (const tile of tiles) for (const polygon of tile.polygons) {
    const from = byKey.get(key(tile.identity.tile,polygon.index));
    for (const edge of polygon.edges) if (edge.kind === 'internal_polygon') {
      link(from, byKey.get(key(tile.identity.tile,edge.polygon)), mix(from.vertices[edge.edge],from.vertices[(edge.edge+1)%from.vertices.length],.5));
    }
  }
  for (const portal of portals) {
    if (portal.id[0] !== identity?.owner || portal.id[1] !== identity?.path_id) throw new TypeError('portal source differs from NavMeshData');
    // Preserve source reconciliation: do not connect merely nearby boundaries.
    for (const check of portal.candidate_checks ?? []) {
      if (!check.accepted) continue;
      const from = byKey.get(key(portal.id[2],portal.id[3]));
      const to = byKey.get(key(check.target[2],check.target[3]));
      const a = xyz(portal.vertices[0]), b = xyz(portal.vertices[1]);
      const axis = Math.abs(b.x-a.x) > Math.abs(b.z-a.z) ? 'x' : 'z';
      // Native slab overlap can cover only part of an edge. Its midpoint is
      // inside both polygons; the full-edge midpoint need not be.
      for (const slab of check.slab_checks ?? []) if (slab.accepted) {
        const coordinate = (slab.shrunken_overlap[0]+slab.shrunken_overlap[1])/2;
        const t = (coordinate-a[axis])/(b[axis]-a[axis]);
        if (Number.isFinite(t) && t >= 0 && t <= 1) link(from,to,mapPoint(mix(a,b,t)));
      }
    }
  }
  return { nodes, source:identity ? { owner:identity.owner, pathId:identity.path_id } : null };
}

/** Project in 3D, so stacked floors do not silently become connected. */
export function sampleNativeNavigation(nav, point, maxSnapDistance) {
  if (!finitePoint(point) || !Number.isFinite(maxSnapDistance) || maxSnapDistance < 0) throw new TypeError('finite point and nonnegative maxSnapDistance required');
  let best = null, bestDistance = maxSnapDistance;
  for (const node of nav.nodes) for (let i=1; i<node.vertices.length-1; i++) {
    const candidate = closestOnTriangle(point,node.vertices[0],node.vertices[i],node.vertices[i+1]);
    const d = distance(point,candidate);
    if (d <= bestDistance) { bestDistance=d; best={ position:{...candidate}, node:node.index, distance:d }; }
  }
  return best;
}

/** Returns null rather than a straight-line fallback through an unreachable wall.
 * Shared portal midpoints stay in the convex native corridor. Do not revisit
 * polygon centers when replanning from an actor already approaching its exit.
 * Dynamic obstacles/capsule movement remain the collision adapter's responsibility.
 */
export function findNativeRoute(nav, start, target, { maxSnapDistance }) {
  const from = sampleNativeNavigation(nav,start,maxSnapDistance);
  const to = sampleNativeNavigation(nav,target,maxSnapDistance);
  if (!from || !to) return null;
  const count=nav.nodes.length, costs=new Float64Array(count).fill(Infinity);
  const visited=new Uint8Array(count), previous=new Array(count);
  // Spawn eligibility and actor replans call this repeatedly in the Dojo.
  // The old scan of every polygon per expansion was quadratic. The heap's
  // cost then node-index ordering retains deterministic equal-cost routes.
  const heap=[];
  const earlier=(a,b)=>a.cost<b.cost || (a.cost===b.cost && a.node<b.node);
  function enqueue(node,cost) {
    const entry={node,cost};
    let index=heap.length;
    heap.push(entry);
    while(index>0) {
      const parent=(index-1)>>1;
      if(!earlier(entry,heap[parent]))break;
      heap[index]=heap[parent];
      index=parent;
    }
    heap[index]=entry;
  }
  function dequeue() {
    const first=heap[0],last=heap.pop();
    if(heap.length>0) {
      let index=0;
      while(true) {
        const left=index*2+1;
        if(left>=heap.length)break;
        const right=left+1;
        const child=right<heap.length && earlier(heap[right],heap[left]) ? right : left;
        if(!earlier(heap[child],last))break;
        heap[index]=heap[child];
        index=child;
      }
      heap[index]=last;
    }
    return first;
  }
  costs[from.node]=0;
  enqueue(from.node,0);
  while(heap.length>0) {
    const {node:current,cost}=dequeue();
    // Obsolete entries do not change predecessors after a shorter route wins.
    if(visited[current] || cost!==costs[current])continue;
    if(current===to.node)break;
    visited[current]=1;
    for(const edge of nav.nodes[current].links) {
      const next=cost+edge.cost;
      if(next<costs[edge.to]) {
        costs[edge.to]=next;
        previous[edge.to]={node:current,point:edge.point};
        enqueue(edge.to,next);
      }
    }
  }
  if(!Number.isFinite(costs[to.node]))return null;
  const corridor=[];
  for (let n=to.node;n!==from.node;n=previous[n].node) corridor.push({ node:n, point:previous[n].point });
  corridor.reverse();
  const points=[from.position];
  for (const edge of corridor) points.push(edge.point);
  points.push(to.position);
  return { points, cursor:0, source:nav.source, startNode:from.node, targetNode:to.node };
}

/** Mutates only route.cursor; collision-check each returned segment in order.
 * Collapsing a multi-corner step to one displacement could cut through a wall.
 * If blocked, restore the old cursor or recompute from actual feet.
 */
export function advanceNativeRoute(route, position, travelDistance) {
  if (!finitePoint(position) || !Number.isFinite(travelDistance) || travelDistance<0) throw new TypeError('finite position and nonnegative travelDistance required');
  let next={...position}, remaining=travelDistance;
  const segments=[];
  while (route.cursor<route.points.length) {
    const target=route.points[route.cursor], length=distance(next,target);
    const end=length>remaining ? mix(next,target,remaining/length) : {...target};
    if (length>0 && remaining>0) segments.push({ from:next, to:end, displacement:sub(end,next) });
    next=end;
    if (length>remaining) break;
    remaining-=length; route.cursor++;
  }
  return { position:next, displacement:sub(next,position), segments, complete:route.cursor===route.points.length };
}
