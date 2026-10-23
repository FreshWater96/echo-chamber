// Shared authored layout: navigation, occlusion, acoustics and rendering use these footprints.
export const ROOMS={
 intake:{name:'The Last Platform',subtitle:'Saint Orison · Before the last tide',width:24,theme:'intake',surface:'wood',reverb:1.1,
  doors:[{x:-10.7,z:.1,to:'cryo',label:'Flooded Cloister',spawn:{x:7.5,z:.2}},{x:10.7,z:.1,to:'gallery',label:'Processional Gallery',spawn:{x:-10.3,z:.2}}],lockers:[{x:-4.6,z:-.75}],key:null},
 cryo:{name:'Flooded Cloister',subtitle:'Moonlight cannot reach what the water remembers',width:20,theme:'cryo',surface:'concrete',reverb:2.1,
  doors:[{x:8.7,z:.1,to:'intake',label:'The Last Platform',spawn:{x:-9.5,z:.2}}],lockers:[{x:5.5,z:-.75}],key:{id:'cryo',label:'Cloister voice cylinder',x:-6.1,z:-.6}},
 gallery:{name:'Processional Gallery',subtitle:'A thousand empty seats. One unfinished song.',width:26,theme:'gallery',surface:'wood',reverb:1.9,
  doors:[{x:-11.7,z:.1,to:'intake',label:'The Last Platform',spawn:{x:9.5,z:.2}},{x:11.7,z:.1,to:'containment',label:'The Choir Pit',spawn:{x:-9.8,z:.25}},{x:0,z:-1.05,to:'archive',label:'The Wax Archive',spawn:{x:0,z:.4},rear:true}],lockers:[{x:6.6,z:-.75}],key:null},
 archive:{name:'The Wax Archive',subtitle:'The gramophone turns the cabinet latch',width:20,theme:'archive',surface:'wood',reverb:.7,
  doors:[{x:0,z:-1.05,to:'gallery',label:'Processional Gallery',spawn:{x:0,z:.4},rear:true}],lockers:[{x:-8.5,z:-.75}],key:{id:'archive',label:'Archive voice cylinder',x:6.1,z:-.65}},
 containment:{name:'The Choir Pit',subtitle:'The Cantor conducts what remains',width:24,theme:'containment',surface:'concrete',reverb:2.7,
  doors:[{x:-10.7,z:.1,to:'gallery',label:'Processional Gallery',spawn:{x:10.5,z:.2}},{x:10.7,z:.1,to:'airlock',label:'Ferryman’s Gate',spawn:{x:-6.8,z:.2}}],lockers:[{x:-5.5,z:-.75}],key:{id:'containment',label:'Choir voice cylinder',x:6.3,z:-.7}},
 airlock:{name:'Ferryman’s Gate',subtitle:'Ring the ferry bell. Survive its final refrain.',width:18,theme:'airlock',surface:'metal',reverb:1.5,
  doors:[{x:-7.7,z:.1,to:'containment',label:'The Choir Pit',spawn:{x:9.5,z:.2}}],lockers:[{x:-5.3,z:-.75},{x:-1.7,z:-.75}],key:null,exit:{x:5.7,z:-.55}}
};
export const RADIO={room:'archive',x:-5.8,z:-.7};
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const block=(name,x,z,w,d,h,extra={})=>({name,x,z,w,d,h,solid:true,...extra});
export const COLLIDERS={
 intake:[block('fallen piano',-7.7,.9,2.38,.98,1.2),block('stool',3.8,-.95,.5,.5,.58),block('desk',4.4,-1.9,3,.9,1.02)],
 cryo:[block('fallen piano',2.1,.6,2.38,.98,1.2),block('desk',-6.1,-1.15,2.5,.9,1.05),block('bell reliquary',-1.8,-1.7,1.1,1.1,2.5)],
 gallery:[block('fallen piano',-8.3,1.2,2.38,.98,1.2),block('velvet curtain',9.2,-1.35,2.7,.1,2.9,{solid:false})],
 archive:[block('east desk',6.1,-1.15,2.7,.9,1.05),block('gramophone altar',-5.8,-1.1,2.3,.9,1.05),block('stool',5.7,-.2,.48,.48,.58),block('shelf',2.4,.6,1.35,.65,1.85)],
 containment:[block('fallen choir bench',0,-.2,2.38,.98,1.25),block('desk',6.3,-1.1,2.2,.9,1.05),block('tank',5.8,-1.95,1.1,1.1,2.6),block('tank',8.6,-1.95,1.1,1.1,2.6),block('velvet curtain',-7,-1.5,2.7,.1,2.9,{solid:false})],
 airlock:[block('trunk stack',2.8,.55,1.45,.7,1.55),block('desk',1,-1.9,2,.9,1.05)]
};
export const GLASS={containment:[{x:0,z:1.04,w:4.5,d:1.35}],gallery:[{x:-3,z:.9,w:1.7,d:1.2}]};
export function surfaceAt(room,p){return (GLASS[room]||[]).some(b=>Math.abs(p.x-b.x)<b.w/2&&Math.abs(p.z-b.z)<b.d/2)?'glass':ROOMS[room].surface;}
export function route(from,to){
 if(!ROOMS[from]||!ROOMS[to])return [];
 const q=[[from]],seen=new Set([from]);
 for(let i=0;i<q.length;i++){const p=q[i],id=p.at(-1);if(id===to)return p;for(const d of ROOMS[id].doors)if(!seen.has(d.to)){seen.add(d.to);q.push([...p,d.to]);}}
 return [];
}
export function roomBounds(room,radius=.24){return {minX:-ROOMS[room].width/2+1.0,maxX:ROOMS[room].width/2-1.0,minZ:-1.35,maxZ:1.75,radius};}
