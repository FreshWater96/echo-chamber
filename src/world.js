import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {ROOMS,RADIO,COLLIDERS,GLASS} from './facility.js';

export const echo={origin:{value:new THREE.Vector3()},age:{value:100},color:{value:new THREE.Color('#66aeb4')}};
const visibilityData=new Uint8Array(256*4).fill(255);
const visibilityMap=new THREE.DataTexture(visibilityData,256,1,THREE.RGBAFormat);visibilityMap.wrapS=THREE.RepeatWrapping;visibilityMap.minFilter=THREE.LinearFilter;visibilityMap.magFilter=THREE.LinearFilter;visibilityMap.needsUpdate=true;
echo.occlusion={value:visibilityMap};
export function setSonarOcclusion(room,pulse){
 const objects=COLLIDERS[room].filter(o=>o.h>1.15);
 for(let i=0;i<256;i++){
  const angle=(i/256-.5)*Math.PI*2,dx=Math.cos(angle),dz=Math.sin(angle);let length=32;
  for(let d=.25;d<32;d+=.12){const x=pulse.x+dx*d,z=pulse.z+dz*d;if(Math.abs(x)>ROOMS[room].width/2||Math.abs(z)>2.8||objects.some(o=>Math.abs(x-o.x)<o.w/2&&Math.abs(z-o.z)<o.d/2)){length=d;break;}}
  const v=Math.round(length/32*255);visibilityData[i*4]=v;visibilityData[i*4+1]=v;visibilityData[i*4+2]=v;visibilityData[i*4+3]=255;
 }
 visibilityMap.needsUpdate=true;
}
const assets='./assets/';
const texLoader=new THREE.TextureLoader();
const geom=new Map();
const seeded=n=>{let x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};
function geo(key,make){if(!geom.has(key))geom.set(key,make());return geom.get(key);}
function echoMaterial(m){
 if(!m.isMeshStandardMaterial)return m;
 m.onBeforeCompile=shader=>{
  shader.uniforms.echoOrigin=echo.origin;shader.uniforms.echoAge=echo.age;shader.uniforms.echoColor=echo.color;shader.uniforms.echoOcclusion=echo.occlusion;
  shader.vertexShader='varying vec3 echoWorld;\n'+shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nechoWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
  shader.fragmentShader='varying vec3 echoWorld; uniform vec3 echoOrigin; uniform float echoAge; uniform vec3 echoColor; uniform sampler2D echoOcclusion;\n'+shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\nfloat ed=distance(echoWorld.xz,echoOrigin.xz);float er=echoAge*6.8;float ef=max(0.0,1.0-echoAge/4.0);float ew=exp(-pow((ed-er)*2.2,2.0));float ei=1.0-smoothstep(er-.35,er+.35,ed);float ea=atan(echoWorld.z-echoOrigin.z,echoWorld.x-echoOrigin.x)/6.2831853+.5;float el=texture2D(echoOcclusion,vec2(ea,.5)).r*32.0;float es=.22+.78*(1.0-smoothstep(el,el+.7,ed));totalEmissiveRadiance+=echoColor*(ew*1.5+ei*.13)*ef*es;');
 };
 m.customProgramCacheKey=()=> 'echo-material-3';
 return m;
}
function material(color,props={}){return echoMaterial(new THREE.MeshStandardMaterial({color,roughness:.85,...props}));}
function canvasTexture(w,h,draw){
 const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;
}
function repeat(t,x,y){if(!t)return null;const c=t.clone();c.wrapS=c.wrapT=THREE.RepeatWrapping;c.repeat.set(x,y);c.needsUpdate=true;return c;}
export async function loadMaterials(progress=()=>{}){
 const names=['wall-diff.jpg','wall-normal.jpg','wall-rough.jpg','floor-diff.jpg','floor-normal.jpg','floor-rough.jpg'];
 const maps=await Promise.all(names.map(async(n,i)=>{try{const t=await texLoader.loadAsync(assets+n);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;if(n.includes('diff'))t.colorSpace=THREE.SRGBColorSpace;progress(i+1,names.length);return t;}catch{progress(i+1,names.length);return null;}}));
 let skyline=null;try{skyline=await texLoader.loadAsync(assets+'orison-skyline.webp');skyline.colorSpace=THREE.SRGBColorSpace;skyline.anisotropy=4;}catch{}
 const paper=canvasTexture(512,512,(c,w,h)=>{
  c.fillStyle='#baa877';c.fillRect(0,0,w,h);c.strokeStyle='#494244';c.lineWidth=1;
  for(let row=0;row<5;row++){for(let j=0;j<5;j++){c.beginPath();c.moveTo(30,125+row*65+j*7);c.lineTo(482,125+row*65+j*7);c.stroke();}for(let i=0;i<12;i++){const x=40+i*36,y=140+row*65+Math.sin(i*2+row)*12;c.fillStyle='#3c3338';c.beginPath();c.ellipse(x,y,5,3,-.3,0,Math.PI*2);c.fill();c.fillRect(x+4,y-23,1,23);}}
  c.textAlign='center';c.font='32px Georgia';c.fillText('SAINT ORISON',256,48);c.font='italic 17px Georgia';c.fillText('Requiem for the Unremembered',256,78);c.font='14px Georgia';c.fillText('Do not sing back.',256,486);
  for(let i=0;i<1300;i++){c.fillStyle='rgba(44,29,32,'+seeded(i)*.18+')';c.fillRect(seeded(i+10)*w,seeded(i+77)*h,1+seeded(i+5)*9,1);}
 });
 const tile=canvasTexture(512,512,(c,w,h)=>{c.fillStyle='#494452';c.fillRect(0,0,w,h);for(let x=0;x<8;x++)for(let y=0;y<8;y++){c.fillStyle=(x+y)%2?'#948981':'#292c41';c.fillRect(x*64+2,y*64+2,60,60);}for(let i=0;i<5000;i++){c.fillStyle='rgba(10,17,30,'+seeded(i+32)*.25+')';c.fillRect(seeded(i)*512,seeded(i+9)*512,seeded(i+5)*6,1);}});
 const stain=canvasTexture(256,512,(c,w,h)=>{for(let i=0;i<120;i++){c.fillStyle='rgba(8,17,40,'+(.03+seeded(i)*.12)+')';c.fillRect(seeded(i+9)*w,0,1+seeded(i+3)*7,100+seeded(i+4)*h);}});
 return {wall:maps[0],wallN:maps[1],wallR:maps[2],floor:maps[3],floorN:maps[4],floorR:maps[5],paper,tile,stain,skyline};
}
export function makePalette(t,theme,width){
 return {
  wall:material('#c4b6a1',{map:repeat(t.wall,width/3.5,1.5),normalMap:repeat(t.wallN,width/3.5,1.5),normalScale:new THREE.Vector2(.7,.7),roughness:.92}),
  pale:material('#c7b9a3',{map:t.wall,normalMap:t.wallN,normalScale:new THREE.Vector2(.35,.35)}),
  wood:material('#44313a',{map:repeat(t.floor,2,1),normalMap:t.floorN,normalScale:new THREE.Vector2(.4,.4)}),
  floor:material('#807178',{map:repeat(t.floor,width/3,2),normalMap:repeat(t.floorN,width/3,2),normalScale:new THREE.Vector2(.6,.6),roughness:.63}),
  tile:material('#918582',{map:repeat(t.tile,width/4,1.5),roughness:.5,metalness:.1}),
  iron:material('#172231',{metalness:.7,roughness:.6}),dark:material('#101522'),
  brass:material('#a88b4f',{metalness:.72,roughness:.38}),red:material('#6b203b',{map:t.wall,roughness:1}),
  cloth:material('#751d3d',{map:t.wall,roughness:1,side:THREE.DoubleSide}),
  glass:material('#91c8d7',{transparent:true,opacity:.24,metalness:.4,roughness:.16,depthWrite:false,side:THREE.DoubleSide}),
  water:material('#101e3d',{roughness:.12,metalness:.75,transparent:true,opacity:.88,depthWrite:false}),
  paper:material('#e1cfab',{map:t.paper,side:THREE.DoubleSide}),
  glow:new THREE.MeshStandardMaterial({color:'#ffd494',emissive:'#f6a552',emissiveIntensity:2.4}),
  coolGlow:new THREE.MeshStandardMaterial({color:'#9adee2',emissive:'#4dabb9',emissiveIntensity:1.8}),
  stain:new THREE.MeshBasicMaterial({map:t.stain,transparent:true,depthWrite:false,side:THREE.DoubleSide})
 };
}
function mesh(parent,g,m,x=0,y=0,z=0){const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.castShadow=!m.transparent;o.receiveShadow=true;parent.add(o);return o;}
function box(p,m,x,y,z,w,h,d,r=.012){return mesh(p,geo('b'+[w,h,d,r],()=>r?new RoundedBoxGeometry(w,h,d,1,r):new THREE.BoxGeometry(w,h,d)),m,x,y,z);}
function cylinder(p,m,x,y,z,rt,rb,h,n=16){return mesh(p,geo('c'+[rt,rb,h,n],()=>new THREE.CylinderGeometry(rt,rb,h,n)),m,x,y,z);}
function sphere(p,m,x,y,z,r,sx=1,sy=1,sz=1){const o=mesh(p,geo('s'+r,()=>new THREE.SphereGeometry(r,16,10)),m,x,y,z);o.scale.set(sx,sy,sz);return o;}
function group(p,x=0,y=0,z=0){const g=new THREE.Group();g.position.set(x,y,z);p.add(g);return g;}
function rod(p,m,a,b,r=.025){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),v=bv.clone().sub(av);const o=cylinder(p,m,...av.clone().add(bv).multiplyScalar(.5).toArray(),r,r,v.length(),8);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());return o;}
function tube(p,m,pts,r=.025){return mesh(p,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(v=>new THREE.Vector3(...v))),Math.max(10,pts.length*5),r,7,false),m);}
function torus(p,m,x,y,z,r,t=.025){return mesh(p,geo('t'+[r,t],()=>new THREE.TorusGeometry(r,t,8,36)),m,x,y,z);}
function arch(p,m,x,y,z,w,h,thick=.11){
 const points=[];for(let i=0;i<=24;i++){const a=Math.PI-i/24*Math.PI;points.push([x+Math.cos(a)*w/2,y+Math.sin(a)*h,z]);}tube(p,m,points,thick);
}
function pointedArch(p,m,x,z,w=2.7,h=4.7){
 for(const side of [-1,1]){const xx=x+side*w/2;box(p,m.pale,xx,h*.38,z,.21,h*.76,.35,.015);box(p,m.pale,xx,.18,z,.42,.36,.5,.02);box(p,m.brass,xx,h*.65,z+.19,.26,.07,.025,.002);}
 tube(p,m.pale,[[x-w/2,h*.75,z],[x-w*.42,h*.91,z],[x,h*1.08,z],[x+w*.42,h*.91,z],[x+w/2,h*.75,z]],.11);
 tube(p,m.brass,[[x-w/2+.15,h*.75,z+.06],[x-w*.37,h*.88,z+.06],[x,h*1.035,z+.06],[x+w*.37,h*.88,z+.06],[x+w/2-.15,h*.75,z+.06]],.018);
}
function plaque(p,m,text,x,y,z,w=2){
 const tex=canvasTexture(768,128,(c,ww,hh)=>{c.fillStyle='#171b2b';c.fillRect(0,0,ww,hh);c.strokeStyle='#9e855e';c.lineWidth=2;c.strokeRect(10,10,ww-20,hh-20);c.fillStyle='#ddd0b3';c.textAlign='center';c.textBaseline='middle';c.font=(text.length>24?'25':'33')+'px Georgia';c.fillText(text.toUpperCase(),ww/2,hh/2);});
 box(p,m.brass,x,y,z,w+.07,.37,.055,.004);mesh(p,new THREE.PlaneGeometry(w,.31),new THREE.MeshBasicMaterial({map:tex}),x,y,z+.032);
}
function drape(p,m,x,z,w=2.7,h=3.1,y=1.6){
 const g=group(p,x,0,z),geometry=new THREE.PlaneGeometry(w,h,30,15),a=geometry.attributes.position;
 for(let i=0;i<a.count;i++){const xx=a.getX(i),yy=a.getY(i);a.setZ(i,Math.sin(xx*18)*.085+Math.sin(xx*7)*.055);a.setY(i,yy+.10*Math.cos(xx*5)*(1-(yy/h+.5)));}geometry.computeVertexNormals();mesh(g,geometry,m.cloth,0,y,0);rod(g,m.brass,[-w/2-.1,y+h/2+.06,0],[w/2+.1,y+h/2+.06,0],.03);
 for(let i=0;i<7;i++){const xx=-w/2+i*w/6;rod(g,m.brass,[xx,y-h/2-.01,.03],[xx,y-h/2-.14,.03],.009);}return g;
}
function candle(p,m,x,y,z,lit=true){
 cylinder(p,m.brass,x,y+.05,z,.09,.11,.1,10);cylinder(p,m.pale,x,y+.20,z,.035,.045,.25,10);
 if(lit){sphere(p,m.glow,x,y+.365,z,.045,.5,1.7,.5);}
}
function candelabrum(p,m,x,z,scale=1,lit=true){
 const g=group(p,x,0,z);g.scale.setScalar(scale);cylinder(g,m.brass,0,.06,0,.17,.23,.12);rod(g,m.brass,[0,.1,0],[0,1.7,0],.04);
 for(const side of [-1,1])tube(g,m.brass,[[0,1.2,0],[side*.25,1.12,0],[side*.39,1.42,0]],.026);
 candle(g,m,0,1.7,0,lit);candle(g,m,-.39,1.42,0,lit);candle(g,m,.39,1.42,0,lit);
 if(lit){const l=new THREE.PointLight('#f5ac72',2.1,4.8,2);l.position.set(0,1.95,.1);g.add(l);return l;}return null;
}
function bell(p,m,x,y,z,s=1){
 const pts=[[0,.35],[.10,.35],[.17,.29],[.19,.08],[.25,-.17],[.36,-.30],[.38,-.34],[.35,-.39],[0,-.39]].map(v=>new THREE.Vector2(v[0]*s,v[1]*s));
 mesh(p,new THREE.LatheGeometry(pts,24),m.brass,x,y,z);sphere(p,m.dark,x,y-.32*s,z,.065*s);rod(p,m.brass,[x,y+.36*s,z],[x,y+.65*s,z],.03*s);
}
function confessional(p,m,x,z){
 const g=group(p,x,0,z);box(g,m.wood,0,1.15,0,1.2,2.3,.7,.02);pointedArch(g,m,0,.37,1.05,2.25);box(g,m.dark,0,1.15,.37,.83,2,.04,.004);
 for(let i=0;i<9;i++){rod(g,m.brass,[-.4,1.12+i*.065,.4],[.4,1.12+i*.065,.4],.009);}
 for(let i=0;i<6;i++)rod(g,m.wood,[-.34+i*.135,.98,.41],[-.34+i*.135,1.75,.41],.014);
 drape(g,m,0,.43,.9,1.1,.55);torus(g,m.brass,.32,.85,.48,.04,.012);box(g,m.brass,0,2.57,.37,.06,.25,.06,.002);box(g,m.brass,0,2.59,.37,.2,.04,.06,.002);
}
function altar(p,m,o){
 const g=group(p,o.x,0,o.z);box(g,m.pale,0,.12,0,o.w,.24,o.d,.02);box(g,m.dark,0,.55,0,o.w*.85,.7,o.d*.76,.02);
 box(g,m.pale,0,o.h-.09,0,o.w,.18,o.d,.018);for(const xx of [-o.w*.41,o.w*.41]){box(g,m.pale,xx,.58,0,.13,.8,o.d*.86,.01);}
 for(let i=0;i<4;i++)box(g,m.brass,-o.w*.3+i*o.w*.2,.55,o.d*.39,.025,.3,.025,.002);
 const score=mesh(g,new THREE.PlaneGeometry(.48,.32),m.paper,0,o.h+.006,.07);score.rotation.x=-Math.PI/2;score.rotation.z=.1;
 candle(g,m,-o.w*.3,o.h,-.17,false);candle(g,m,o.w*.3,o.h,-.17,false);
}
function fallenPiano(p,m,o){
 const g=group(p,o.x,0,o.z);box(g,m.wood,0,.48,0,o.w,.65,o.d,.055);box(g,m.iron,0,.12,0,o.w,.16,o.d,.02);
 const lid=box(g,m.wood,0,.88,-.17,o.w,.10,o.d*.77,.025);lid.rotation.x=-.25;
 box(g,m.dark,0,.72,o.d*.46,o.w*.86,.08,.16,.002);
 for(let i=0;i<22;i++){const xx=-o.w*.405+i*o.w*.038;box(g,i%7===1||i%7===3||i%7===6?m.dark:m.pale,xx,.76,o.d*.46,.067,.035,.15,.001);}
 for(const xx of [-o.w*.38,o.w*.38])box(g,m.brass,xx,.12,.1,.1,.23,.1,.02);
 const strut=box(g,m.wood,o.w*.27,1.05,-.05,.5,.12,.7,.02);strut.rotation.z=-.25;
}
function choirBench(p,m,o){
 const g=group(p,o.x,0,o.z);box(g,m.wood,0,.54,0,o.w,.14,o.d,.02);
 for(const xx of [-o.w*.4,o.w*.4]){box(g,m.wood,xx,.25,0,.12,.5,o.d*.7,.02);box(g,m.pale,xx,.59,0,.17,.12,o.d*.88,.015);}
 for(let i=0;i<3;i++){const slat=box(g,m.wood,0,.73+i*.16,-o.d*.39,o.w,.10,.08,.01);slat.rotation.z=i===2?-.05:0;}
 const broken=box(g,m.wood,o.w*.26,1.02,-o.d*.28,.65,.085,.13,.006);broken.rotation.z=.35;
 for(const xx of [-o.w*.43,o.w*.43])box(g,m.brass,xx,.86,-o.d*.4,.025,.7,.025,.003);
}
function trunks(p,m,o){
 const g=group(p,o.x,0,o.z),h=o.h/3;
 for(let i=0;i<3;i++){const ww=o.w*(1-i*.07),dd=o.d*(1-i*.06),y=h*(i+.5);box(g,i%2?m.red:m.wood,0,y,0,ww,h-.025,dd,.035);
  for(const xx of [-ww*.33,ww*.33]){box(g,m.brass,xx,y,dd/2+.005,.035,h-.05,.014,.002);box(g,m.brass,xx,y+(h-.025)/2,0,.035,.012,dd,.002);}
  box(g,m.brass,0,y,dd/2+.02,.12,.08,.025,.004);torus(g,m.dark,0,y+.06,dd/2+.025,.04,.009);
 }
}
function reliquary(p,m,o){
 const g=group(p,o.x,0,o.z),r=Math.min(o.w,o.d)*.45;
 cylinder(g,m.pale,0,.13,0,r,r+.05,.26,12);cylinder(g,m.pale,0,o.h-.18,0,r+.04,r,.24,12);
 for(let i=0;i<6;i++){const a=i*Math.PI/3;rod(g,m.brass,[Math.sin(a)*r,.25,Math.cos(a)*r],[Math.sin(a)*r,o.h-.28,Math.cos(a)*r],.025);}
 bell(g,m,0,o.h*.58,0,.8);arch(g,m.brass,0,o.h-.22,0,r*2,.45,.035);cylinder(g,m.glass,0,o.h/2,0,r*.96,r*.96,o.h-.5,24);
}
function cylinderCabinet(p,m,x,z,w=1.5,h=2.6,d=.5){
 const g=group(p,x,0,z);box(g,m.wood,0,h/2,0,w,h,d,.02);box(g,m.dark,0,h*.55,d*.51,w-.12,h*.8,.025,.003);
 for(let j=0;j<5;j++){const y=.3+j*(h-.42)/5;box(g,m.brass,0,y,d*.58,w-.1,.035,.1,.003);for(let i=0;i<6;i++){const xx=-w*.4+i*w*.16;cylinder(g,m.red,xx,y+.13,d*.25,.055,.055,.18,10).rotation.x=Math.PI/2;cylinder(g,m.brass,xx,y+.13,d*.46,.057,.057,.025,10).rotation.x=Math.PI/2;}}
 for(const xx of [-w*.47,w*.47])box(g,m.brass,xx,h/2,d*.54,.035,h,.035,.003);box(g,m.pale,0,h+.04,0,w+.16,.1,d+.14,.02);return g;
}
function gramophone(p,m,x,y,z){
 const g=group(p,x,y,z);box(g,m.wood,0,.09,0,.7,.18,.55,.02);cylinder(g,m.dark,0,.2,0,.23,.23,.025,24);cylinder(g,m.brass,0,.22,0,.07,.07,.02,16);
 tube(g,m.brass,[[.24,.21,-.13],[.34,.41,-.2],[.1,.55,-.15]],.028);
 const horn=mesh(g,new THREE.ConeGeometry(.36,.65,24,1,true),m.brass,.16,.78,-.13);horn.rotation.z=-.57;box(g,m.brass,.4,.07,0,.23,.035,.035,.004);rod(g,m.brass,[.51,.07,0],[.51,.16,0],.02);return g;
}
function roseWindow(p,m,x,y,z,r=1.65){
 torus(p,m.pale,x,y,z,r,.16);torus(p,m.brass,x,y,z+.06,r-.17,.025);torus(p,m.pale,x,y,z,.33,.07);
 const sectors=12;for(let i=0;i<sectors;i++){
  const a=i*Math.PI*2/sectors;rod(p,m.pale,[x+Math.cos(a)*.36,y+Math.sin(a)*.36,z],[x+Math.cos(a)*(r-.12),y+Math.sin(a)*(r-.12),z],.035);
  if(i===2||i===3||i===8)continue;
  const b=a+Math.PI*2/sectors*.85,pts=[new THREE.Vector2(Math.cos(a)*.4,Math.sin(a)*.4),new THREE.Vector2(Math.cos(a)*(r-.19),Math.sin(a)*(r-.19)),new THREE.Vector2(Math.cos(b)*(r-.19),Math.sin(b)*(r-.19)),new THREE.Vector2(Math.cos(b)*.4,Math.sin(b)*.4)];
  const sh=new THREE.Shape(pts);const pane=mesh(p,new THREE.ShapeGeometry(sh),i%3===0?m.red:m.glass,x,y,z-.035);pane.castShadow=false;
 }
 for(let i=0;i<6;i++){const a=i*Math.PI/3;torus(p,m.brass,x+Math.cos(a)*.82,y+Math.sin(a)*.82,z+.04,.38,.018);}
}
function organ(p,m,x,z,w=5){
 const g=group(p,x,0,z);box(g,m.wood,0,.65,0,w,1.3,.85,.04);box(g,m.dark,0,2.5,-.15,w-.2,3.5,.25,.02);
 for(let i=0;i<17;i++){const xx=(i-8)*(w-.6)/17,h=1.25+2.8*(1-Math.abs(i-8)/10);cylinder(g,m.brass,xx,1.25+h/2,0,.08,.08,h,12);box(g,m.dark,xx,1.37,.08,.07,.11,.015,.002);}
 for(const xx of [-w/2,w/2])pointedArch(g,m,xx,0,.65,3.85);
 box(g,m.wood,0,1.05,.58,w*.52,.16,.5,.015);for(let i=0;i<26;i++)box(g,i%5===1||i%5===3?m.dark:m.pale,(i-12.5)*w*.017,1.15,.72,w*.014,.035,.22,.001);
 arch(g,m.pale,0,3.6,.0,w*.95,1.6,.09);return g;
}
function background(p,m,w,id,skyline){
 const sky=new THREE.MeshBasicMaterial({color:id==='cryo'?'#111522':'#29334b',fog:false});box(p,sky,0,5,-14,w*2.2,15,.1,0);
 if(skyline){const backdrop=mesh(p,new THREE.PlaneGeometry(w*2.2,w*2.2/3),new THREE.MeshBasicMaterial({map:skyline,color:id==='cryo'?'#45495e':'#b4bccb',fog:false,toneMapped:false}),0,w*.0953-.6,-13.85);backdrop.castShadow=false;backdrop.receiveShadow=false;}else{const moon=mesh(p,new THREE.CircleGeometry(1.15,48),new THREE.MeshBasicMaterial({color:'#aeb8c1',fog:false}),w*.21,5.1,-13.8);moon.scale.y=1.04;}
 for(let layer=0;layer<3;layer++){
  const z=-12+layer*2.5,col=['#333746','#202638','#161e2d'][layer],mat=material(col,{roughness:1});
  for(let i=0;i<14;i++){const x=(i/13-.5)*w*1.65+seeded(i+layer*4),h=1+seeded(i+layer*35)*5;
   box(p,mat,x,h/2-1.1,z,.65+seeded(i+3)*1.15,h,.6,0);
   if(i%3===0){mesh(p,new THREE.ConeGeometry(.65,.9,4),mat,x,h-.7,z).rotation.y=Math.PI/4;rod(p,mat,[x,h-.4,z],[x,h+.5,z],.025);}
   if(layer<2&&i%2===0)for(let j=0;j<3;j++)box(p,m.coolGlow,x,1+j*.7,z+.33,.04,.18,.015,0);
  }
 }
 // Painted floodwater extends beneath the suspended stage into the distant city.
 const water=mesh(p,new THREE.PlaneGeometry(w*2,30,40,16),m.water,0,-.63,-1);water.rotation.x=-Math.PI/2;water.userData.dynamic=true;
 for(let i=0;i<23;i++){const x=(seeded(i+11)-.5)*w*1.6,z=-10+seeded(i+3)*15;
  const streak=box(p,i%4===0?m.brass:m.coolGlow,x,-.615,z,.015,.003,.25+seeded(i+5)*1.2,0);streak.material=streak.material.clone();streak.material.transparent=true;streak.material.opacity=.12;streak.material.depthWrite=false;}
 return water;
}
function particles(p,w){
 const count=220,a=new Float32Array(count*3);for(let i=0;i<count;i++){a[i*3]=(seeded(i)-.5)*(w+4);a[i*3+1]=seeded(i+41)*6;a[i*3+2]=-7+seeded(i+200)*9;}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(a,3));const rain=new THREE.Points(g,new THREE.PointsMaterial({color:'#b7bdc7',size:.017,transparent:true,opacity:.24,depthWrite:false}));p.add(rain);return rain;
}
function batchStatics(root){
 const buckets=new Map(),originals=[];
 root.updateMatrixWorld(true);
 root.traverse(o=>{
  if(!o.isMesh||Array.isArray(o.material)||o.material.transparent)return;
  let current=o;while(current){if(current.userData.dynamic)return;current=current.parent;}
  const key=o.material.uuid;
  if(!buckets.has(key))buckets.set(key,{material:o.material,geometries:[]});
  let g=o.geometry.clone();if(g.index)g=g.toNonIndexed();g.applyMatrix4(o.matrixWorld);
  // All generated environment meshes use the same normal/UV attribute set.
  for(const attr of Object.keys(g.attributes))if(!['position','normal','uv'].includes(attr))g.deleteAttribute(attr);
  buckets.get(key).geometries.push(g);originals.push(o);
 });
 for(const o of originals)o.removeFromParent();
 const edgeMaterial=new THREE.ShaderMaterial({
  uniforms:{echoOrigin:echo.origin,echoAge:echo.age,echoColor:echo.color,echoOcclusion:echo.occlusion},
  vertexShader:'varying vec3 wpos;void main(){vec4 w=modelMatrix*vec4(position,1.0);wpos=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
  fragmentShader:'varying vec3 wpos;uniform vec3 echoOrigin;uniform float echoAge;uniform vec3 echoColor;uniform sampler2D echoOcclusion;void main(){float d=distance(wpos.xz,echoOrigin.xz);float r=echoAge*6.8;float f=max(0.0,1.0-echoAge/4.0);float front=exp(-pow((d-r)*2.8,2.0));float inside=1.0-smoothstep(r-.3,r+.3,d);float angle=atan(wpos.z-echoOrigin.z,wpos.x-echoOrigin.x)/6.2831853+.5;float limit=texture2D(echoOcclusion,vec2(angle,.5)).r*32.0;float shade=.22+.78*(1.0-smoothstep(limit,limit+.7,d));float a=(front*1.6+inside*.46)*f*shade;if(a<.012)discard;gl_FragColor=vec4(echoColor,a);}',
  transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false
 });
 for(const b of buckets.values()){
  const merged=mergeGeometries(b.geometries,false);if(!merged)continue;
  const mesh=new THREE.Mesh(merged,b.material);mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);
  if(b.material.isMeshStandardMaterial){const edges=new THREE.LineSegments(new THREE.EdgesGeometry(merged,48),edgeMaterial);root.add(edges);}
  b.geometries.forEach(g=>g.dispose());
 }
}
export function buildRoom(id,textures){
 const config=ROOMS[id],w=config.width,m=makePalette(textures,id,w),root=new THREE.Group();root.name='room-'+id;root.userData.roomId=id;
 const water=background(root,m,w,id,textures.skyline);
 box(root,m.dark,0,-.25,0,w+.5,.48,6.1,.02);
 const floor=mesh(root,new THREE.PlaneGeometry(w,6),id==='gallery'||id==='cryo'?m.tile:m.floor,0,.003,0);floor.rotation.x=-Math.PI/2;
 // The cutaway is a stage suspended over a flooded city, rather than an enclosed box.
 for(const y of [-.12,-.34])box(root,m.pale,0,y,3.03,w+.3,.06,.15,.01);
 for(let x=-w/2+.25;x<w/2;x+=.9){box(root,m.wood,x,-.47,2.98,.07,.25,.09,.008);}
 box(root,m.wall,0,.56,-2.8,w,1.12,.28,.008);box(root,m.brass,0,1.1,-2.6,w,.055,.08,.005);
 for(let x=-w/2+.25;x<w/2;x+=3.25){pointedArch(root,m,x,-2.65,2.9,id==='cryo'?4.8:4.45);}
 for(let x=-w/2+.3;x<w/2;x+=.55){box(root,m.pale,x,.5,-2.61,.035,.78,.04,.005);}
 // Broken high vault fragments frame each theatrical composition.
 for(const side of [-1,1]){
  box(root,m.dark,side*(w/2+.05),2.2,-1.55,.38,4.4,2.6,.015);
  box(root,m.pale,side*(w/2-.15),2.2,-1.85,.17,4.4,.38,.01);
  drape(root,m,side*(w/2-.5),-2.3,1.1,3.7,3.3);
  tube(root,m.pale,[[side*w/2,4.5,-2.5],[side*(w/2-1.3),5.05,-2.5],[side*(w/2-2.2),5.3,-2.5]],.10);
 }
 for(const d of config.doors){
  const z=-2.48;box(root,m.dark,d.x,1.28,z,1.5,2.56,.16,.01);pointedArch(root,m,d.x,z+.15,1.65,2.8);
  for(let j=0;j<9;j++)box(root,m.wood,d.x-.62+j*.155,1.23,z+.1,.12,2.4,.07,.004);
  arch(root,m.brass,d.x,1.9,z+.17,1.2,.62,.025);torus(root,m.brass,d.x+.43,1.1,z+.22,.065,.018);
  plaque(root,m,ROOMS[d.to].name,d.x,3.3,z+.17,2.15);
 }
 config.lockers.forEach(l=>confessional(root,m,l.x,-1.85));
 // Every solid set piece uses the same exact authored footprint as stealth and pathfinding.
 for(const o of COLLIDERS[id]){
  if(!o.solid){drape(root,m,o.x,o.z,o.w,o.h,o.h/2+.13);continue;}
  if(o.name.includes('gurney')||o.name.includes('operating')||o.name.includes('piano'))fallenPiano(root,m,o);
  else if(o.name.includes('choir bench'))choirBench(root,m,o);
  else if(o.name.includes('tank')||o.name.includes('reliquary'))reliquary(root,m,o);
  else if(o.name.includes('trunk'))trunks(root,m,o);
  else if(o.name.includes('stool')){cylinder(root,m.wood,o.x,o.h-.06,o.z,o.w/2,o.w/2,.12);for(let a=0;a<3;a++){const an=a*Math.PI*2/3;rod(root,m.brass,[o.x+Math.sin(an)*o.w*.36,.02,o.z+Math.cos(an)*o.d*.36],[o.x+Math.sin(an)*o.w*.25,o.h-.1,o.z+Math.cos(an)*o.d*.25],.025);}}
  else if(o.name.includes('shelf')||o.name.includes('cabinet'))cylinderCabinet(root,m,o.x,o.z,o.w,o.h,o.d);
  else altar(root,m,o);
 }
 const lamps=[];
 const addCandle=(x,z,s=1)=>{const l=candelabrum(root,m,x,z,s,id!=='cryo');if(l)lamps.push(l);};
 addCandle(-w*.29,-2.23);addCandle(w*.30,-2.23);
 const backlight=new THREE.SpotLight('#8babc7',id==='cryo'?.025:2.3,13,.8,.8,2);backlight.position.set(0,5.2,-3.8);backlight.target.position.set(0,0,.2);root.add(backlight,backlight.target);lamps.push(backlight);
 const keyLight=new THREE.SpotLight('#f1b48a',id==='cryo'?.018:3.8,10,.9,.85,2);keyLight.position.set(-3.5,5.1,1.5);keyLight.target.position.set(0,.4,-1.2);keyLight.castShadow=true;keyLight.shadow.mapSize.set(1024,1024);keyLight.shadow.bias=-.0002;keyLight.shadow.normalBias=.035;root.add(keyLight,keyLight.target);lamps.push(keyLight);
 if(id==='intake'){
  // A railway platform inside the drowned opera: departure board, empty luggage, monumental station clock.
  plaque(root,m,'THE LAST TRAIN HAS ALREADY LEFT',.4,3.25,-2.48,5.6);
  for(const x of [-8.5,7.5]){box(root,m.wood,x,.52,-2.1,2.2,.11,.6,.02);for(const xx of [-.85,.85])rod(root,m.brass,[x+xx,.03,-2.1],[x+xx,.5,-2.1],.035);for(let j=0;j<3;j++)box(root,m.wood,x,.72+j*.15,-2.37,2.2,.08,.06,.008);}
  torus(root,m.brass,0,4.5,-2.5,.65,.06);cylinder(root,m.pale,0,4.5,-2.55,.59,.59,.08,40).rotation.x=Math.PI/2;
  for(let i=0;i<12;i++){const a=i*Math.PI/6;rod(root,m.dark,[Math.sin(a)*.48,4.5+Math.cos(a)*.48,-2.48],[Math.sin(a)*.54,4.5+Math.cos(a)*.54,-2.48],.012);}
  rod(root,m.dark,[0,4.5,-2.45],[.34,4.61,-2.45],.016);rod(root,m.dark,[0,4.5,-2.44],[-.11,4.9,-2.44],.012);
  for(let i=0;i<3;i++){const x=6.7+i*.38;box(root,m.red,x,.15,-1.94,.48,.3,.3,.04);torus(root,m.brass,x,.34,-1.94,.08,.013).rotation.x=Math.PI/2;}
  bell(root,m,2.4,3.7,-2.4,.9);
 }else if(id==='cryo'){
  // Silent reliquaries hang above black floodwater. Sonar provides the route.
  for(const x of [-7.6,-4,1.7,5.2]){pointedArch(root,m,x,-3.0,2,5.5);bell(root,m,x,3.3+seeded(x)*.9,-2.8,1.2);rod(root,m.iron,[x,4,-2.8],[x,6,-2.8],.015);}
  for(const x of [-7,-3,0,4]){const a=box(root,m.pale,x,.12,-2.25,.9,.23,.7,.035);a.rotation.y=.15;}
  plaque(root,m,'THE FLOODED CLOISTER',-1,4.65,-2.5,3.9);
  for(let i=0;i<4;i++){const mist=mesh(root,new THREE.PlaneGeometry(w,1),new THREE.MeshBasicMaterial({color:'#667b9a',transparent:true,opacity:.025,depthWrite:false}),0,.3+i*.12,-1+i*.7);mist.rotation.x=-.15;}
 }else if(id==='gallery'){
  // Twelve spokes, missing stained glass and a torn processional banner become the room landmark.
  roseWindow(root,m,3.2,4,-2.95,2.45);plaque(root,m,'PROCESSIONAL GALLERY',-4.1,3.35,-2.5,3.8);
  for(const x of [-6.3,7.8]){box(root,m.pale,x,.25,-2.25,1.1,.5,.8,.015);sphere(root,m.pale,x,1.35,-2.22,.32,.7,2,.7);sphere(root,m.pale,x,2.1,-2.22,.21,.8,1,.8);drape(root,m,x,-2.34,.9,1.6,1.55);}
  for(let i=0;i<5;i++){const x=-4.5+i*.48;box(root,m.brass,x,4,-2.4,.06,1.4,.04,.005);drape(root,m,x,-2.42,.35,1.2,3.45+i*.08);}
 }else if(id==='archive'){
  // The wax cylinders are a physical memory archive, arranged like an impossible chapel library.
  for(const x of [-7.1,-3.3,3.7,7.9])cylinderCabinet(root,m,x,-2.12,1.8,3.25,.64);
  plaque(root,m,'THE WAX ARCHIVE',0,4.7,-2.6,3.5);
  for(let i=0;i<5;i++){const x=-1.5+i*.65;bell(root,m,x,3.2+Math.sin(i)*.23,-2.45,.38);rod(root,m.brass,[x,3.4,-2.45],[x,4.4,-2.45],.009);}
  drape(root,m,5.8,-2.48,2.1,3.2,2.3);
 }else if(id==='containment'){
  organ(root,m,0,-3.1,6);plaque(root,m,'THE CHOIR PIT',5.7,4.45,-2.5,3.25);
  for(const x of [-8.5,-4.3,4]){rod(root,m.brass,[x,2.5,-2.45],[x,5,-2.45],.012);bell(root,m,x,2.8,-2.45,.6);}
  // Empty choir silhouettes are carved masks, never additional hostile actors.
  for(let i=0;i<9;i++){const x=-3+i*.75;sphere(root,m.pale,x,2.25,-3.5,.15,.8,1.2,.5);box(root,m.dark,x,1.6,-3.5,.29,1.05,.2,.04);}
  const red=new THREE.PointLight('#b1254e',1.9,7,2);red.position.set(0,3.2,-1.8);root.add(red);lamps.push(red);
 }else if(id==='airlock'){
  // Ferryman's gate: a bell mechanism above an iron ferry portal.
  const g=group(root,5.7,0,-2.3);box(g,m.dark,0,1.8,0,2.5,3.6,.2,.02);pointedArch(g,m,0,.13,2.65,3.7);
  const gate=group(g,0,0,.2);gate.userData.dynamic=true;
  for(let i=0;i<11;i++){const x=-1.08+i*.216;rod(gate,m.iron,[x,.1,0],[x,3.05-Math.abs(x)*.34,0],.025);sphere(gate,m.brass,x,3.08-Math.abs(x)*.34,0,.045,.6,1.7,.6);}
  for(const y of [.6,1.5,2.4])box(gate,m.brass,0,y,0,2.3,.04,.035,.002);root.userData.ferryGate=gate;
  bell(root,m,5.7,4.15,-2.3,1.75);plaque(root,m,'FERRYMAN’S GATE',5.7,5.05,-2.2,3.5);
  for(let i=0;i<3;i++){const x=4.92+i*.78;box(root,m.brass,x,.55,-1.93,.15,.5,.17,.01);torus(root,m.brass,x,.85,-1.91,.12,.022);}
  for(let i=0;i<4;i++){const z=-5-i*.45;box(root,m.wood,5.7,-.48,z,2.5,.15,.3,.015);}
  const boat=group(root,5.7,-.48,-7.5);sphere(boat,m.dark,0,.12,0,1,1.15,.35,2.2);box(boat,m.red,0,.3,0,1.3,.08,2.4,.02);rod(boat,m.brass,[.8,.2,-.5],[1.7,1.4,-.8],.025);
 }
 if(config.key){
  const k=config.key,kg=group(root,k.x,1.1,k.z);kg.userData.dynamic=true;
  // A wax voice cylinder with etched gold end caps, readable from the side camera.
  cylinder(kg,m.red,0,0,0,.085,.085,.24,20).rotation.z=Math.PI/2;
  for(const x of [-.12,.12])cylinder(kg,m.brass,x,0,0,.093,.093,.022,20).rotation.z=Math.PI/2;
  for(let i=0;i<7;i++)torus(kg,m.brass,-.08+i*.026,0,0,.086,.002).rotation.y=Math.PI/2;
  const l=new THREE.PointLight('#69b7c6',id==='cryo'?.12:.5,1.3,2);l.position.y=.12;kg.add(l);root.userData.key=kg;
 }
 let radioLight=null;if(id===RADIO.room){const rg=gramophone(root,m,RADIO.x,1.07,RADIO.z);rg.userData.dynamic=true;radioLight=new THREE.PointLight('#e1aa69',0,2.8,2);radioLight.position.set(0,.5,.2);rg.add(radioLight);root.userData.gramophone=rg;}
 for(const patch of GLASS[id]||[])for(let i=0;i<38;i++){const size=.03+seeded(i+102)*.075;const shard=mesh(root,new THREE.ConeGeometry(size,size*.18,3),i%4===0?m.red:m.glass,patch.x+(seeded(i+id.length*31)-.5)*patch.w,.027,patch.z+(seeded(i+71)-.5)*patch.d);shard.rotation.z=seeded(i+83)*3;shard.rotation.y=seeded(i+112)*6;}
 // Foreground proscenium, rigging and loose ribbons create real perspective parallax.
 for(const side of [-1,1]){
  const x=side*w*.39;box(root,m.dark,x,2.4,2.8,.26,4.8,.36,.025);tube(root,m.dark,[[x,4.8,2.7],[x+side*.4,3.8,2.8],[x+side*.2,2.9,2.8]],.035);
  drape(root,m,x+side*.5,2.9,.75,1.6,3.7);bell(root,m,x,4.5,2.8,.45);
 }
 for(let i=0;i<7;i++){const x=(seeded(i+71)-.5)*(w-3),z=(seeded(i+23)-.5)*4.6;const score=mesh(root,new THREE.PlaneGeometry(.25+seeded(i)*.25,.3),m.paper,x,.013,z);score.rotation.x=-Math.PI/2;score.rotation.z=seeded(i+3)*5;}
 const rain=particles(root,w),beacon=new THREE.PointLight('#b85d72',id==='cryo'?.025:.25,3,2);beacon.position.set(id==='airlock'?5.7:-w*.36,2.7,-1.7);root.add(beacon);
 root.updateMatrixWorld(true);batchStatics(root);
 Object.assign(root.userData,{materials:m,lamps,radioLight,dust:rain,water,beacon});return root;
}
export function updateRoom(root,state,dt){
 const t=state.time||performance.now()/1000,id=root.userData.roomId;
 (root.userData.lamps||[]).forEach((l,i)=>{if(l.userData.base===undefined)l.userData.base=l.intensity;l.intensity=l.userData.base*(.97+Math.sin(t*2.7+i)*.018+Math.sin(t*17+i*5)*.012);});
 const kg=root.userData.key;if(kg){kg.visible=!state.cards.has(ROOMS[id].key.id)&&(id!=='cryo'||state.cryoScanned);kg.rotation.y=t*.3;kg.position.y=1.1+Math.sin(t*1.6)*.025;}
 if(root.userData.beacon&&id==='airlock'){root.userData.beacon.color.set(state.extraction?.ready?'#71d8cb':'#b85d72');root.userData.beacon.intensity=state.extraction?.started?1.4+Math.sin(t*5)*.35:.25;}
 if(root.userData.ferryGate){const target=state.extraction?.ready?3.2:0;root.userData.ferryGate.position.y=THREE.MathUtils.damp(root.userData.ferryGate.position.y,target,2,dt);}
 if(root.userData.radioLight)root.userData.radioLight.intensity=state.time<state.radioUntil?1.7+Math.sin(t*25)*.4:0;
 if(root.userData.dust){const a=root.userData.dust.geometry.attributes.position;for(let i=0;i<a.count;i++){let y=a.getY(i)-dt*(.8+seeded(i)*.8);if(y<-.7)y=5.7;a.setY(i,y);}a.needsUpdate=true;}
 if(root.userData.water){const a=root.userData.water.geometry.attributes.position;for(let i=0;i<a.count;i++){a.setZ(i,Math.sin(a.getX(i)*1.5+t*.8)*.018+Math.sin(a.getY(i)*2.3+t)*.012);}a.needsUpdate=true;root.userData.water.geometry.computeVertexNormals();}
}
export function createSonarRing(){const mat=new THREE.MeshBasicMaterial({color:'#75d1d7',transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});const ring=new THREE.Mesh(new THREE.RingGeometry(.99,1.012,96),mat);ring.rotation.x=-Math.PI/2;ring.position.y=.024;return ring;}
