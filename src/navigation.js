import {Graph,NavNode,NavEdge,AStar} from 'yuka';
import {ROOMS,COLLIDERS,roomBounds,clamp,distance,route} from './facility.js';
const cache=new Map();
export function blocked(room,x,z,radius=.24){
 const b=roomBounds(room,radius);if(x<b.minX||x>b.maxX||z<b.minZ||z>b.maxZ)return true;
 return COLLIDERS[room].some(o=>o.solid&&Math.abs(x-o.x)<o.w/2+radius&&Math.abs(z-o.z)<o.d/2+radius);
}
function intersects(a,b,o,pad=0){
 let enter=0,exit=1;
 for(const [axis,half] of [['x',o.w/2+pad],['z',o.d/2+pad]]){
  const delta=b[axis]-a[axis],lo=o[axis]-half,hi=o[axis]+half;
  if(Math.abs(delta)<1e-7){if(a[axis]<=lo||a[axis]>=hi)return false;continue;}
  let t0=(lo-a[axis])/delta,t1=(hi-a[axis])/delta;if(t0>t1)[t0,t1]=[t1,t0];
  enter=Math.max(enter,t0);exit=Math.min(exit,t1);if(enter>=exit)return false;
 }
 return true;
}
export function lineOfSight(room,a,b,targetHeight=1.5){
 return !COLLIDERS[room].some(o=>o.h>=targetHeight&&intersects(a,b,o,.015));
}
export function clearPath(room,a,b,radius=.26){
 return !blocked(room,b.x,b.z,radius)&&!COLLIDERS[room].some(o=>o.solid&&intersects(a,b,o,radius));
}
export function slideMove(room,p,dx,dz,radius=.24){
 const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.1)),b=roomBounds(room,radius);let moved=false;
 for(let i=0;i<steps;i++){
  const nx=clamp(p.x+dx/steps,b.minX,b.maxX),nz=clamp(p.z+dz/steps,b.minZ,b.maxZ);
  if(!blocked(room,nx,p.z,radius)){moved=moved||nx!==p.x;p.x=nx;}
  if(!blocked(room,p.x,nz,radius)){moved=moved||nz!==p.z;p.z=nz;}
 }
 return moved;
}
function makeGrid(room,radius){
 const key=room+':'+radius;if(cache.has(key))return cache.get(key);
 const b=roomBounds(room,radius),cell=.28,cols=Math.floor((b.maxX-b.minX)/cell)+1,rows=Math.floor((b.maxZ-b.minZ)/cell)+1;
 const graph=new Graph(false),nodes=[],lookup=new Map();
 for(let x=0;x<cols;x++)for(let z=0;z<rows;z++){
  const p={x:b.minX+x*cell,z:b.minZ+z*cell};if(blocked(room,p.x,p.z,radius))continue;
  const node=new NavNode(nodes.length);node.position.set(p.x,0,p.z);graph.addNode(node);nodes.push({index:node.index,...p});lookup.set(x+','+z,node.index);
 }
 for(let x=0;x<cols;x++)for(let z=0;z<rows;z++){
  const a=lookup.get(x+','+z);if(a===undefined)continue;
  for(const [dx,dz] of [[1,0],[0,1],[1,1],[1,-1]]){
   const c=lookup.get((x+dx)+','+(z+dz));if(c===undefined)continue;
   if(clearPath(room,nodes[a],nodes[c],radius))graph.addEdge(new NavEdge(a,c,distance(nodes[a],nodes[c])));
  }
 }
 const grid={graph,nodes};cache.set(key,grid);return grid;
}
export function findPath(room,start,goal,radius=.26){
 if(clearPath(room,start,goal,radius))return [{x:goal.x,z:goal.z}];
 const {graph,nodes}=makeGrid(room,radius);if(!nodes.length)return [];
 const nearest=p=>nodes.reduce((a,b)=>distance(a,p)<distance(b,p)?a:b);
 const a=nearest(start),b=nearest(goal),search=new AStar(graph,a.index,b.index);search.search();
 const indices=search.getPath();if(!indices.length)return [];
 const raw=indices.map(i=>({x:nodes[i].x,z:nodes[i].z}));if(!blocked(room,goal.x,goal.z,radius))raw.push({x:goal.x,z:goal.z});
 const path=[];let anchor=start,i=0;
 while(i<raw.length){let j=i;while(j+1<raw.length&&clearPath(room,anchor,raw[j+1],radius))j++;path.push(raw[j]);anchor=raw[j];i=j+1;}
 return path;
}
export function acousticPath(fromRoom,source,toRoom,listener){
 const rooms=route(fromRoom,toRoom);if(!rooms.length)return {gain:0,hops:Infinity,distance:Infinity,cutoff:160};
 let length=0,pos=source,gain=1,occluded=false;
 for(let i=0;i<rooms.length-1;i++){
  const r=rooms[i],door=ROOMS[r].doors.find(d=>d.to===rooms[i+1]);length+=distance(pos,door);gain*=.57;
  const entry=ROOMS[rooms[i+1]].doors.find(d=>d.to===r);pos={x:entry.x,z:Math.max(-1,entry.z)};
 }
 length+=distance(pos,listener);
 if(fromRoom===toRoom&&!lineOfSight(fromRoom,source,listener,1.1)){gain*=.42;occluded=true;}
 const hops=rooms.length-1;
 return {gain:gain/(1+length*.13),hops,distance:length,cutoff:Math.max(230,6500*Math.pow(.38,hops)*(occluded?.22:1)),occluded,rooms};
}
