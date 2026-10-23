import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {echo} from './world.js';

// The Drowned Choir: original painted-theatre figures, authored as articulated
// 3D cloth and paper surfaces. Geometry is shared into a few material batches.
const TAU=Math.PI*2;
const up=new THREE.Vector3(0,1,0);
const clamp=THREE.MathUtils.clamp;
const smooth=(a,b,x)=>THREE.MathUtils.smoothstep(x,a,b);
const colorA=new THREE.Color(),colorB=new THREE.Color();
const lanternParentQ=new THREE.Quaternion(),lanternWorldQ=new THREE.Quaternion(),lanternSwingQ=new THREE.Quaternion();
const surfaceMaps=new Map();

function surfaceMap(type,bump=false){
 const key=type+(bump?'-bump':'');if(surfaceMaps.has(key))return surfaceMaps.get(key);
 const size=128,data=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const n=Math.sin(x*127.1+y*311.7)*43758.5453,random=n-Math.floor(n);
  const blotch=Math.max(0,Math.sin(x*.073+Math.sin(y*.047))*Math.sin(y*.113-x*.02));
  const brush=Math.sin(y*.62+Math.sin(x*.11)*1.7)*Math.sin(x*.021+y*.017);
  let value;
  if(bump)value=type==='hair'?115+Math.sin(x*1.25+Math.sin(y*.12)*.8)*42:120+(random-.5)*38+brush*12+(x%3===0?10:0)-(y%7===0?9:0);
  else value=type==='hair'?225+Math.sin(x*1.25+Math.sin(y*.12)*.8)*15:247-blotch*(type==='skin'?13:29)+brush*(type==='skin'?2:7)+(random-.5)*(type==='skin'?6:17);
  const o=(y*size+x)*4;data[o]=clamp(value,0,255);data[o+1]=clamp(value-(bump?0:blotch*3),0,255);data[o+2]=clamp(value-(bump?0:blotch*7),0,255);data[o+3]=255;
 }
 const t=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);t.wrapS=t.wrapT=THREE.RepeatWrapping;
 t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;
 t.colorSpace=bump?THREE.NoColorSpace:THREE.SRGBColorSpace;t.needsUpdate=true;surfaceMaps.set(key,t);return t;
}

export async function loadActors(){
 return {drifter:{kind:'drifter'},listener:{kind:'listener'}};
}

function actorMaterial(color,roughness,metalness,reveal){
 const mat=new THREE.MeshStandardMaterial({color,roughness,metalness,vertexColors:true,
  emissive:'#695a4a',emissiveIntensity:.035});
 mat.onBeforeCompile=shader=>{
  shader.uniforms.actorReveal=reveal;
  shader.uniforms.actorEchoColor=echo.color;
  shader.fragmentShader='uniform float actorReveal; uniform vec3 actorEchoColor;\n'+shader.fragmentShader.replace(
   '#include <emissivemap_fragment>',
   '#include <emissivemap_fragment>\nfloat actorRim=pow(1.0-abs(dot(normal,normalize(vViewPosition))),2.6);\ntotalEmissiveRadiance+=actorEchoColor*actorReveal*(.09+actorRim*.95);'
  );
 };
 mat.customProgramCacheKey=()=> 'echo-painted-choir-character-1';
 return mat;
}

function rig(kind){
 const monster=kind==='listener';
 const bones=[],index={},joint={};
 function bone(name,parent,p){
  const b=new THREE.Bone();b.name=name;b.position.set(...p);
  if(parent)joint[parent].add(b);
  index[name]=bones.length;bones.push(b);joint[name]=b;return b;
 }
 const hip=monster?1.14:.99;
 bone('hips',null,[0,hip,0]);
 bone('spine','hips',[0,monster?.27:.18,0]);
 bone('chest','spine',[0,monster?.43:.25,monster?.015:0]);
 bone('neck','chest',[0,monster?.24:.16,monster?.02:.005]);
 bone('head','neck',[0,monster?.18:.15,.012]);
 for(const side of ['L','R']){
  const s=side==='L'?1:-1;
  bone('upperArm'+side,'chest',[s*(monster?.29:.205),monster?.045:.015,0]);
  bone('forearm'+side,'upperArm'+side,[s*(monster?.085:.027),monster?-.54:-.285,.008]);
  bone('hand'+side,'forearm'+side,[s*(monster?.052:.018),monster?-.59:-.255,.012]);
  bone('thigh'+side,'hips',[s*(monster?.115:.104),-.025,0]);
  bone('shin'+side,'thigh'+side,[s*(monster?.025:0),monster?-.54:-.435,.018]);
  bone('foot'+side,'shin'+side,[0,monster?-.46:-.415,-.018]);
  bone('coat'+side,'hips',[s*.11,-.015,-.018]);
  for(let f=0;f<5;f++){
   const x=(f-1.5)*(monster?.026:.017);
   const px=f===4?s*(monster?.075:.045):x;
   const py=f===4?-.025:monster?-.108:-.057;
   bone('finger'+side+f,'hand'+side,[px,py,f===4?.008:.01]);
   bone('tip'+side+f,'finger'+side+f,[0,-(monster?.105:.039)*(f===4?.7:1),.009]);
  }
 }
 if(!monster){
  bone('scarf','chest',[0,.12,-.08]);
  bone('lantern','handR',[0,-.015,.045]);
 }
 joint.hips.updateWorldMatrix(true,true);
 const origin={};
 for(const name of Object.keys(joint))origin[name]=joint[name].getWorldPosition(new THREE.Vector3());
 return {bones,index,joint,origin,hip};
}

function makeBuilder(skeleton,materials){
 const batches=new Map();
 function add(g,material,bone,weights=null,tint=null){
  if(!g.getAttribute('normal'))g.computeVertexNormals();
  if(!g.getAttribute('uv'))g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count*2),2));
  if(g.index)g=g.toNonIndexed();
  const p=g.attributes.position,n=p.count;
  const indices=new Uint16Array(n*4),skin=new Float32Array(n*4),colors=new Float32Array(n*3);
  for(let i=0;i<n;i++){
   const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
   const mix=weights?weights(x,y,z):[[bone,1]];
   let total=0;for(let j=0;j<Math.min(4,mix.length);j++)total+=mix[j][1];
   for(let j=0;j<Math.min(4,mix.length);j++){
    indices[i*4+j]=skeleton.index[mix[j][0]]??0;skin[i*4+j]=mix[j][1]/(total||1);
   }
   // Broad discoloration and fine unevenness keep the surfaces from reading
   // as clean plastic primitives, without fetching texture files.
   const dirt=Math.sin(x*31+y*8+z*19)*Math.sin(y*19-z*37)*.028;
   const stain=Math.max(0,Math.sin(x*19+y*5+z*9))*Math.max(0,Math.sin(y*13-x*7))*.10;
   const shade=clamp(.96+dirt-stain,.73,1.03);
   colorA.setRGB(shade,shade,shade*.98);
   if(tint){colorB.set(tint);colorA.multiply(colorB);}
   colors[i*3]=colorA.r;colors[i*3+1]=colorA.g;colors[i*3+2]=colorA.b;
  }
  g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));
  g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(skin,4));
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  if(!batches.has(material))batches.set(material,[]);batches.get(material).push(g);
 }
 function ellipsoid(mat,bone,center,scale,rot=null,segments=16){
  const g=new THREE.SphereGeometry(1,segments,12);g.scale(...scale);
  if(rot){g.rotateX(rot[0]||0);g.rotateY(rot[1]||0);g.rotateZ(rot[2]||0);}
  g.translate(...center);add(g,mat,bone);
 }
 function localSphere(mat,bone,offset,scale,rot=null,segments=16){
  ellipsoid(mat,bone,skeleton.origin[bone].clone().add(new THREE.Vector3(...offset)).toArray(),scale,rot,segments);
 }
 function tube(mat,bone,points,radius=.012,radial=7){
  const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
  add(new THREE.TubeGeometry(curve,Math.max(5,points.length*3),radius,radial,false),mat,bone);
 }
 function localTube(mat,bone,points,radius=.012,radial=7){
  const o=skeleton.origin[bone];tube(mat,bone,points.map(p=>[p[0]+o.x,p[1]+o.y,p[2]+o.z]),radius,radial);
 }
 function ribbon(mat,bone,points,widths){
  const positions=[],uv=[],indices=[];
  for(let i=0;i<points.length;i++){
   const [x,y,z]=points[i],w=widths[Math.min(i,widths.length-1)];
   positions.push(x-w*.5,y,z,x+w*.5,y,z);uv.push(0,i/(points.length-1),1,i/(points.length-1));
   if(i<points.length-1){const n=i*2;indices.push(n,n+1,n+2,n+1,n+3,n+2);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
  const o=skeleton.origin[bone];g.translate(o.x,o.y,o.z);add(g,mat,bone);
 }
 function segment(mat,bone,next,profile,depth=1){
  const start=skeleton.origin[bone],end=skeleton.origin[next],delta=end.clone().sub(start);
  const q=new THREE.Quaternion().setFromUnitVectors(up,delta.clone().normalize());
  const rings=profile.map(([t,r])=>[t*delta.length(),r,r*depth]);
  const g=loft(rings,16);g.applyQuaternion(q);g.translate(start.x,start.y,start.z);
  const length2=delta.lengthSq();
  add(g,mat,bone,(x,y,z)=>{
   const t=((x-start.x)*delta.x+(y-start.y)*delta.y+(z-start.z)*delta.z)/length2;
   const blend=smooth(.80,1,t)*.45;return [[bone,1-blend],[next,blend]];
  });
 }
 function patch(mat,bone,points,depth=.005){
  const shape=new THREE.Shape();shape.moveTo(points[0][0],points[0][1]);
  for(let i=1;i<points.length;i++)shape.lineTo(points[i][0],points[i][1]);shape.closePath();
  const g=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelThickness:.002,bevelSize:.002,bevelSegments:1,steps:1});
  const o=skeleton.origin[bone];g.translate(o.x,o.y,o.z+points[0][2]);add(g,mat,bone);
 }
 function finish(root){
  const skel=new THREE.Skeleton(skeleton.bones);root.add(skeleton.joint.hips);root.updateMatrixWorld(true);
  const meshes=[];
  for(const [key,parts] of batches){
   const g=mergeGeometries(parts,false);g.computeBoundingSphere();
   const mesh=new THREE.SkinnedMesh(g,materials[key]);mesh.name='character-'+key;
   mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;
   root.add(mesh);mesh.bind(skel);meshes.push(mesh);
   for(const p of parts)p.dispose();
  }
  return {skeleton:skel,meshes};
 }
 return {add,ellipsoid,localSphere,tube,localTube,ribbon,segment,patch,finish};
}

// Oval cross-sections form continuous sculpted clothing and anatomy. Angles
// start at the front centre and travel around the back of the body.
function loft(rings,segments=24,start=0,end=TAU,fold=0){
 const p=[],uv=[],index=[];
 for(let j=0;j<rings.length;j++){
  const [y,rx,rz,cx=0,cz=0]=rings[j];
  for(let i=0;i<=segments;i++){
   const t=i/segments,a=start+(end-start)*t;
   const wrinkle=1+fold*Math.sin(a*11+j*.7)+fold*.45*Math.sin(a*19-j*.8);
   p.push(cx+Math.sin(a)*rx*wrinkle,y,cz+Math.cos(a)*rz*wrinkle);uv.push(t,j/(rings.length-1));
   if(i<segments&&j<rings.length-1){const a0=j*(segments+1)+i,b=a0+segments+1;index.push(a0,a0+1,b,a0+1,b+1,b);}
  }
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(index);g.computeVertexNormals();return g;
}

function buildHands(b,r,monster){
 for(const side of ['L','R']){
  const name='hand'+side,s=side==='L'?1:-1;
  b.localSphere('skin',name,[0,monster?-.065:-.03,.01],monster?[.064,.114,.035]:[.036,.058,.022]);
  for(let f=0;f<5;f++){
   const finger='finger'+side+f,tip='tip'+side+f;
   const len=(monster?.095:.039)*(f===4?.7:f===3?.86:1),rad=monster?.013:.0075;
   b.segment('skin',finger,tip,[[0,rad*1.13],[.3,rad],[.72,rad*.91],[1,rad*.8]],.8);
   b.localSphere('skin',tip,[0,-len*.34,.006],[rad*.79,len*.43,rad*.69],[.14,0,0],10);
   b.localSphere(monster?'nail':'skin',tip,[0,-len*.64,.015],monster?[rad*.65,.035,.009]:[rad*.61,.010,.003],[-.18,0,0],8);
  }
  if(monster){
   for(let f=0;f<4;f++){
    const x=(f-1.5)*.026;
    b.localTube('skin',name,[[x*.35,.055,-.025],[x,-.025,-.029],[x,-.095,-.014]],.006,5);
   }
  }else{
   b.localSphere('coat',name,[0,.024,0],[.048,.035,.039]);
   b.localTube('seam',name,[[-.039,.011,.014],[-.02,.006,.033],[.015,.009,.034],[.039,.017,.009]],.004,5);
  }
 }
}

function addHero(b,r){
 const trunkWeights=(x,y)=>{const t=smooth(1.05,1.4,y);return [['hips',1-t],['chest',t]];};
 b.add(loft([[.91,.123,.091],[1.04,.124,.095],[1.23,.155,.095],[1.40,.178,.10],[1.47,.127,.075]],20,0,TAU,.023),'shirt','chest',trunkWeights);
 b.add(loft([[1.04,.144,.111],[1.20,.166,.113],[1.39,.211,.114],[1.47,.172,.080]],24,.25,TAU-.25,.035),'coat','chest',trunkWeights);
 // Mara's short storm cape, pressed lapels and long, slightly uneven hem read
 // as a painted travelling coat rather than a medical uniform.
 const cape=loft([[1.30,.244,.141],[1.35,.245,.153],[1.45,.224,.143],[1.52,.091,.077]],24,.67,TAU-.67,.052);
 b.add(cape,'coat','chest');
 b.add(loft([[1.015,.151,.119],[1.052,.150,.118]],24,.28,TAU-.28,.012),'leather','hips');
 b.localSphere('metal','hips',[.040,.045,.125],[.027,.023,.007],null,10);
 for(const side of ['L','R']){
  const s=side==='L'?1:-1,name='coat'+side;
  const start=side==='L'?.18:Math.PI+.09,end=side==='L'?Math.PI-.09:TAU-.18;
  const g=loft([[.405,.235,.169],[.49,.224,.158],[.71,.194,.141],[.91,.157,.119],[1.10,.149,.109]],22,start,end,.057);
  const hem=g.attributes.position;for(let i=0;i<hem.count;i++)if(hem.getY(i)<.42)hem.setY(i,hem.getY(i)+.014*Math.sin(hem.getX(i)*43)+.008*Math.cos(hem.getZ(i)*54));g.computeVertexNormals();
  b.add(g,'coat',name,(x,y)=>{const blend=smooth(.91,1.1,y);return [[name,1-blend],['hips',blend]];});
  b.patch('badge','chest',[[s*.026,-.03,.129],[s*.105,.10,.129],[s*.131,.018,.129],[s*.056,-.183,.129]],.008);
  b.patch('coat','chest',[[s*.028,-.02,.139],[s*.10,.105,.139],[s*.113,.018,.139],[s*.055,-.160,.139]],.009);
  b.localTube('seam','chest',[[s*.026,-.018,.146],[s*.09,.082,.129],[s*.118,.018,.12],[s*.055,-.17,.13]],.0035,5);
  b.patch('coat',name,[[-s*.02,-.06,.122],[s*.04,-.06,.122],[s*.035,-.19,.122],[-s*.02,-.19,.122]],.004);
  b.localTube('seam',name,[[-s*.02,-.058,.13],[s*.04,-.058,.13]],.003,5);
  const arm='upperArm'+side,fore='forearm'+side,hand='hand'+side;
  b.localSphere('coat',arm,[0,-.033,0],[.088,.099,.078],[0,0,s*.18]);
  b.segment('coat',arm,fore,[[0,.077],[.24,.075],[.54,.063],[.78,.058],[1,.055]],.84);
  b.segment('coat',fore,hand,[[0,.056],[.25,.052],[.57,.048],[.88,.043],[1,.045]],.85);
  const oa=r.origin[fore];
  for(let j=0;j<3;j++)b.ellipsoid('coat',fore,[oa.x,oa.y-.025-j*.035,oa.z+.015],[.056-j*.003,.017,.048],[0,0,s*.1],12);
  b.segment('trouser','thigh'+side,'shin'+side,[[0,.080],[.18,.084],[.55,.068],[.85,.053],[1,.053]],.83);
  b.segment('trouser','shin'+side,'foot'+side,[[0,.055],[.24,.057],[.52,.047],[.81,.039],[1,.039]],.90);
  b.localSphere('leather','foot'+side,[0,-.013,.047],[.059,.079,.127],[-.12,0,0]);
  b.localSphere('leather','foot'+side,[0,-.067,.070],[.061,.026,.135],null,12);
  b.localSphere('leather','foot'+side,[0,.077,-.012],[.046,.145,.052]);
  b.localTube('metal','foot'+side,[[-.037,.082,.025],[0,.076,.048],[.037,.082,.025]],.004,5);
  for(let j=0;j<3;j++)b.localTube('seam','foot'+side,[[-.034,.018+j*.018,.047],[0,.012+j*.018,.061],[.034,.018+j*.018,.047]],.003,5);
  const a=r.origin['thigh'+side],k=r.origin['shin'+side];
  b.tube('seam','thigh'+side,[[a.x+s*.069,a.y-.03,a.z],[a.x+s*.059,(a.y+k.y)*.5,a.z],[k.x+s*.047,k.y+.015,k.z]],.0025,5);
 }
 b.add(loft([[1.51,.044,.038],[1.60,.043,.038],[1.70,.047,.041]],16),'skin','neck');
 b.localSphere('skin','head',[0,.012,.007],[.103,.143,.093]);
 b.localSphere('skin','head',[0,-.062,.020],[.075,.078,.071]);
 for(const s of [-1,1]){
  b.localSphere('skin','head',[s*.096,-.006,.005],[.018,.037,.017]);
  b.localSphere('skin','head',[s*.043,.007,.086],[.027,.018,.010]);
  b.localSphere('eye','head',[s*.043,.009,.094],[.018,.007,.005],null,10);
  b.localSphere('hair','head',[s*.044,.008,.098],[.007,.006,.003],null,8);
  b.localTube('hair','head',[[s*.020,.035,.087],[s*.044,.041,.090],[s*.066,.031,.081]],.004,5);
  b.localTube('skin','head',[[s*.024,.014,.094],[s*.043,.020,.100],[s*.061,.014,.091]],.004,5);
 }
 b.localSphere('skin','head',[0,-.009,.097],[.017,.037,.018],[-.12,0,0],12);
 b.localSphere('skin','head',[0,-.030,.111],[.019,.012,.016],null,12);
 b.localTube('lip','head',[[-.026,-.059,.083],[0,-.063,.092],[.024,-.060,.084]],.003,6);
 b.localSphere('skin','head',[0,-.085,.066],[.036,.022,.025]);
 const cap=new THREE.SphereGeometry(1,24,14,0,TAU,0,Math.PI*.57);
 cap.scale(.113,.156,.103);cap.translate(0,.010,0);cap.translate(...r.origin.head.toArray());b.add(cap,'hair','head');
 for(let i=0;i<15;i++){
  const a=.92+i*(TAU-1.84)/14,x=Math.sin(a)*.103,z=Math.cos(a)*.092;
  b.localSphere('hair','head',[x,-.018,z],[.025,.106+(i%3)*.005,.029],[Math.cos(a)*-.12,0,Math.sin(a)*.12],12);
  b.localTube('hairLight','head',[[x*.96,.088,z*.96],[x*1.04,-.01,z*1.04],[x*.95,-.107,z*.97]],.002,5);
 }
 b.localSphere('hair','head',[-.037,.090,.077],[.064,.047,.024],[0,0,-.30],14);
 b.localSphere('hair','head',[.055,.062,.081],[.038,.061,.023],[0,0,.35],12);
 const scarf=loft([[1.46,.081,.078],[1.51,.089,.078],[1.57,.055,.052]],20,0,TAU,.065);b.add(scarf,'coat','neck');
 b.ribbon('coat','scarf',[[0,0,0],[-.045,-.06,-.045],[-.08,-.18,-.14],[-.055,-.32,-.18],[-.075,-.49,-.14]],[.085,.10,.10,.09,.075]);
 b.localTube('seam','scarf',[[-.041,0,.004],[-.093,-.18,-.135],[-.098,-.32,-.175],[-.11,-.49,-.136]],.0025,5);
 for(let i=0;i<7;i++)b.localTube('coat','scarf',[[-.11+i*.011,-.48,-.14],[-.112+i*.011,-.515-(i%3)*.008,-.137]],.002,4);
 b.ribbon('coat','chest',[[.031,.065,.146],[.045,-.05,.15],[.068,-.19,.143],[.055,-.31,.137]],[.058,.061,.054,.049]);
 for(let j=0;j<4;j++)b.localSphere('metal','chest',[-.025,-.12-j*.075,.125],[.007,.007,.004],null,8);
 // The city seal is a small worn brass rosette, with no lab badge or screen.
 b.localSphere('metal','chest',[-.121,.005,.124],[.018,.022,.006],null,12);
 b.localTube('seam','chest',[[-.134,-.006,.132],[-.111,.017,.132]],.003,5);
 addLantern(b,r);
 buildHands(b,r,false);
}

function addLantern(b,r){
 const name='lantern',o=r.origin[name];
 b.localTube('metal',name,[[-.062,-.165,0],[-.072,-.088,0],[-.052,-.022,0],[0,.006,0],[.052,-.022,0],[.072,-.088,0],[.062,-.165,0]],.0075,7);
 const roof=loft([[-.385,.055,.055],[-.367,.077,.077],[-.350,.074,.074]],12,0,TAU,.035);roof.translate(o.x,o.y,o.z);b.add(roof,'metal',name);
 const cap=loft([[-.188,.075,.075],[-.171,.075,.075],[-.134,.035,.035],[-.127,.031,.031]],12,0,TAU,.035);cap.translate(o.x,o.y,o.z);b.add(cap,'metal',name);
 b.localSphere('glow',name,[0,-.267,0],[.050,.078,.050],null,12);
 for(let i=0;i<6;i++){
  const a=i*TAU/6,x=Math.sin(a)*.065,z=Math.cos(a)*.065;
  b.localTube('metal',name,[[x,-.177,z],[x*1.07,-.263,z*1.07],[x,-.36,z]],.0055,6);
 }
 for(const yy of [-.195,-.344]){
  const ring=[];for(let i=0;i<=20;i++){const a=i*TAU/20;ring.push([Math.sin(a)*.068,yy,Math.cos(a)*.068]);}
  b.localTube('metal',name,ring,.0055,6);
 }
 b.localSphere('leather',name,[0,-.369,0],[.048,.015,.048],null,12);
 b.localSphere('metal',name,[0,-.401,0],[.012,.022,.012],null,10);
}

function earGeometry(side){
 const p=[],uv=[],ind=[],rings=7,segments=28;
 for(let j=0;j<=rings;j++){
  const r=j/rings;
  for(let i=0;i<=segments;i++){
   const a=i/segments*TAU,fold=1+.10*Math.sin(a*3);
   p.push(side*(.125+r*.105*Math.cos(a)*fold),.015+r*.184*Math.sin(a),.015+.058*Math.pow(r,1.7)-.018*Math.sin(a)*r);
   uv.push(i/segments,r);
   if(i<segments&&j<rings){const k=j*(segments+1)+i,l=k+segments+1;ind.push(k,l,k+1,k+1,l,l+1);}
  }
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ind);g.computeVertexNormals();return g;
}

function addListener(b,r){
 const trunkWeights=(x,y)=>{const t=smooth(1.35,1.87,y);return [['hips',1-t],['chest',t]];};
 // The Cantor is a solemn wrapped choir figure. A black, pleated vestment
 // conceals the torso; pale arms and a bound oval head remain the landmarks.
 b.add(loft([[1.10,.135,.11],[1.32,.151,.13],[1.57,.195,.15],[1.83,.263,.151],[1.94,.193,.12]],24,0,TAU,.04),'cloth','chest',trunkWeights);
 b.add(loft([[1.69,.29,.16],[1.77,.323,.178],[1.88,.30,.164],[2.00,.10,.09]],24,.38,TAU-.38,.065),'cloth','chest');
 for(const side of ['L','R']){
  const s=side==='L'?1:-1,arm='upperArm'+side,fore='forearm'+side,hand='hand'+side;
  b.localSphere('cloth',arm,[s*.012,-.01,0],[.104,.137,.096],[0,0,s*.25]);
  b.segment('cloth',arm,fore,[[0,.098],[.25,.088],[.54,.075],[.84,.066],[1,.072]],.96);
  b.segment('skin',fore,hand,[[0,.053],[.20,.061],[.48,.052],[.74,.041],[1,.033]],.88);
  b.localSphere('bone',fore,[0,.008,-.015],[.052,.064,.048]);
  // Broad winding bands give the long arms an ivory-wrapped silhouette.
  const wrap=[];
  for(let k=0;k<=52;k++){
   const t=k/52,a=t*TAU*3.25,rad=.062-t*.029;
   wrap.push([s*.052*t+Math.cos(a)*rad,-.035-t*.505,.012*t+Math.sin(a)*rad]);
  }
  b.localTube('bone',fore,wrap,.0065,5);
  b.localTube('leather',fore,[[-.043,-.035,.036],[0,-.028,.057],[.043,-.035,.036]],.010,6);
  b.localSphere('metal',fore,[.023,-.032,.059],[.014,.019,.006],null,8);
  b.segment('skin','thigh'+side,'shin'+side,[[0,.082],[.25,.085],[.58,.068],[1,.052]],.85);
  b.segment('skin','shin'+side,'foot'+side,[[0,.053],[.27,.061],[.62,.046],[1,.033]],.88);
  b.localSphere('skin','foot'+side,[0,-.044,.059],[.064,.061,.166]);
  for(let t=0;t<4;t++)b.localSphere('bone','foot'+side,[(t-1.5)*.030,-.055,.183],[.020,.025,.059-(t%2)*.01],[-.15,0,0],10);
  const start=side==='L'?.15:Math.PI+.08,end=side==='L'?Math.PI-.08:TAU-.15;
  const skirt=loft([[.275,.249,.192],[.43,.238,.184],[.76,.213,.168],[1.03,.181,.147],[1.24,.164,.132]],24,start,end,.085);
  const a=skirt.attributes.position;
  for(let i=0;i<a.count;i++)if(a.getY(i)<.29)a.setY(i,a.getY(i)+.033*Math.sin(a.getX(i)*51)+.021*Math.sin(a.getZ(i)*79));
  skirt.computeVertexNormals();
  b.add(skirt,'cloth','coat'+side,(x,y)=>{const blend=smooth(1.04,1.24,y);return [['coat'+side,1-blend],['hips',blend]];});
  // Long pale stoles are the only bright marks over the black choir dress.
  b.ribbon('bone','chest',[[s*.13,.10,.154],[s*.155,-.05,.169],[s*.124,-.22,.162],[s*.111,-.42,.149],[s*.12,-.57,.145]],[.047,.051,.046,.044,.039]);
  b.localTube('metal','chest',[[s*.118,-.45,.153],[s*.118,-.54,.153]],.0035,5);
  b.localTube('metal','chest',[[s*.099,-.49,.153],[s*.135,-.49,.153]],.003,5);
 }
 const tabard=loft([[.37,.152,.202],[.71,.155,.183],[1.03,.145,.159],[1.34,.151,.173],[1.70,.166,.181]],20,-1.0,1.0,.075);
 const ta=tabard.attributes.position;
 for(let i=0;i<ta.count;i++)if(ta.getY(i)<.38)ta.setY(i,ta.getY(i)+.026*Math.sin(ta.getX(i)*57));
 tabard.computeVertexNormals();b.add(tabard,'cloth','hips',trunkWeights);
 b.localTube('metal','chest',[[-.12,.07,.167],[0,.015,.196],[.12,.07,.167]],.0065,6);
 b.localSphere('metal','chest',[0,.006,.198],[.022,.034,.006],null,12);
 b.add(loft([[1.98,.077,.081],[2.08,.074,.077],[2.19,.066,.069]],20,0,TAU,.05),'bone','neck');
 b.localSphere('skin','head',[0,.021,.006],[.130,.179,.119]);
 b.localSphere('skin','head',[0,-.077,.022],[.097,.075,.096]);
 // Faceless linen: overlapping diagonal wraps cover every feature. No eyes,
 // mouth, or anatomical horror details remain from the laboratory creature.
 for(let k=0;k<6;k++){
  const y=-.113+k*.049,f=Math.sqrt(Math.max(.15,1-Math.pow((y-.021)/.183,2)));
  const g=loft([[y-.015,.132*f+.004,.121*f+.004],[y+.015,.132*f+.004,.121*f+.004]],20,0,TAU,.023);
  g.rotateZ(-.11+k*.025);g.translate(...r.origin.head.toArray());b.add(g,'bone','head');
 }
 b.localTube('scar','head',[[-.045,.125,.091],[-.025,.060,.120],[.005,-.025,.129],[.025,-.099,.100]],.0035,5);
 // Tarnished brass acoustic cups and a broken resonating halo frame the mask.
 for(const s of [-1,1]){
  const ear=earGeometry(s);ear.translate(...r.origin.head.toArray());b.add(ear,'metal','head');
  const edge=[];
  for(let i=0;i<=20;i++){const a=i/20*TAU,fold=1+.10*Math.sin(a*3);edge.push([s*(.125+.105*Math.cos(a)*fold),.015+.184*Math.sin(a),.073-.018*Math.sin(a)]);}
  b.localTube('metal','head',edge,.0085,6);
  b.localTube('scar','head',[[s*.14,-.10,.033],[s*.19,-.03,.046],[s*.18,.075,.04],[s*.135,.098,.033]],.0065,5);
  b.localSphere('scar','head',[s*.133,-.012,.034],[.026,.041,.006],null,10);
  b.localTube('metal','head',[[s*.15,.01,-.01],[s*.235,.025,-.077],[s*.267,.040,-.10]],.006,6);
 }
 for(const radius of [.269,.286]){
  const arc=[];
  for(let i=0;i<=32;i++){const a=-2.76+i/32*5.52;arc.push([Math.sin(a)*radius,Math.cos(a)*radius*1.10+.018,-.103]);}
  b.localTube('metal','head',arc,.0055,6);
 }
 for(let k=0;k<5;k++){
  const a=-1.8+k*.9;
  b.localSphere('metal','head',[Math.sin(a)*.278,Math.cos(a)*.306+.018,-.103],[.009,.014,.006],[0,0,-a],8);
 }
 buildHands(b,r,true);
}

function contactShadow(monster){
 const size=48,data=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const radius=Math.hypot((x+.5-size/2)/(size/2),(y+.5-size/2)/(size/2));
  data[(y*size+x)*4+3]=Math.round(Math.pow(Math.max(0,1-radius),2)*125);
 }
 const map=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);map.needsUpdate=true;
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(monster?1.1:.78,monster?.64:.48),new THREE.MeshBasicMaterial({map,transparent:true,depthWrite:false,opacity:.85}));
 mesh.rotation.x=-Math.PI/2;mesh.position.y=.008;mesh.name='contact-shadow';return mesh;
}

export function createActor(_art,kind){
 const monster=kind==='listener',root=new THREE.Group(),reveal={value:0};root.name=kind;
 const palette=monster?{
  skin:['#c4b99b',.98,0],bone:['#e0d5b4',.99,0],scar:['#413c34',1,0],
  cloth:['#202b2d',1,0],leather:['#2b2823',.94,0],metal:['#947643',.72,.60],nail:['#615843',.95,0]
 }:{
  skin:['#e2d4bb',.96,0],coat:['#b74732',.99,0],shirt:['#294157',1,0],trouser:['#253844',.98,0],
  leather:['#272c2b',.93,.02],hair:['#48291f',.93,0],hairLight:['#855038',.97,0],eye:['#b8b4a0',.91,0],
  lip:['#96665b',.97,0],seam:['#762e28',1,0],metal:['#bd9350',.67,.58],badge:['#243d53',1,0],glow:['#f8c679',.68,.02]
 };
 const materials={};
 for(const [name,[color,roughness,metalness]] of Object.entries(palette))materials[name]=actorMaterial(color,roughness,metalness,reveal);
 for(const name of ['skin','bone','coat','cloth','shirt','trouser','hair','hairLight','leather','badge'])if(materials[name]){
  const type=name.startsWith('hair')?'hair':name==='skin'?'skin':'cloth';
  materials[name].map=surfaceMap(type);materials[name].bumpMap=surfaceMap(type,true);
  materials[name].bumpScale=type==='skin'?.002:type==='hair'?.003:.0045;
 }
 if(materials.glow){materials.glow.emissive.set('#f6bd6a');materials.glow.emissiveIntensity=.80;}
 if(materials.skin&&monster)materials.skin.side=THREE.DoubleSide;
 if(materials.bone)materials.bone.side=THREE.DoubleSide;
 if(materials.metal&&monster)materials.metal.side=THREE.DoubleSide;
 if(materials.cloth)materials.cloth.side=THREE.DoubleSide;
 if(materials.coat)materials.coat.side=THREE.DoubleSide;
 const r=rig(kind),builder=makeBuilder(r,materials);
 if(monster)addListener(builder,r);else addHero(builder,r);
 const built=builder.finish(root),shadow=contactShadow(monster);root.add(shadow);
 root.userData={kind,displayName:monster?'The Cantor':'Mara',costumeStyle:'painted-theatre',height:monster?2.58:1.94,rig:r,materials,reveal,shadow,lanternAnchor:r.joint.lantern||null,
  skeleton:built.skeleton,meshes:built.meshes,lastTime:null,lastFacing:1,pose:'idle'};
 updateActor(root,{x:0,z:0,facing:1},0,false,null,'intake');
 return root;
}

function setRotation(b,x=0,y=0,z=0){b.rotation.set(x,y,z);}
function plantFeet(root,d){
 const monster=d.kind==='listener',center=new THREE.Vector3();
 let low=Infinity;
 for(const side of ['L','R']){
  const foot=d.rig.joint['foot'+side],e=foot.matrixWorld.elements;
  const shapes=monster?[[[0,-.044,.059],[.064,.061,.166]],[[0,-.055,.183],[.058,.025,.059]]]:
   [[[0,-.013,.047],[.059,.079,.127]],[[0,-.067,.070],[.061,.026,.135]]];
  for(const [c,s] of shapes){
   center.set(...c).applyMatrix4(foot.matrixWorld);
   const extent=Math.hypot(e[1]*s[0],e[5]*s[1],e[9]*s[2]);low=Math.min(low,center.y-extent);
  }
 }
 if(Number.isFinite(low))d.rig.joint.hips.position.y+=.012-low;
 root.updateMatrixWorld(true);
}

function hangLantern(root,d,time,moving){
 const lantern=d.rig.joint.lantern;if(!lantern)return;
 lantern.parent.getWorldQuaternion(lanternParentQ);root.getWorldQuaternion(lanternWorldQ);
 const stride=moving?(d.pose==='sprint'?.13:.055):.014;
 lanternSwingQ.setFromEuler(new THREE.Euler(Math.sin(time*3.3)*stride,0,Math.sin(time*2.7)*stride*.55));
 lantern.quaternion.copy(lanternParentQ).invert().multiply(lanternWorldQ).multiply(lanternSwingQ);
 lantern.updateWorldMatrix(false,true);
}

function poseRig(d,entity,time,moving,sneaking){
 const r=d.rig,j=r.joint,monster=d.kind==='listener';
 for(const bone of r.bones)bone.rotation.set(0,0,0);
 j.hips.position.set(0,r.hip,0);
 const action=entity.action||'',start=Number.isFinite(entity.actionStart)?entity.actionStart:time;
 const age=Math.max(0,time-start),duration=Number.isFinite(entity.actionUntil)?Math.max(.1,entity.actionUntil-start):1;
 const active=!!action&&(!Number.isFinite(entity.actionUntil)||time<=entity.actionUntil);
 const sprint=monster?entity.mode==='hunt':!!entity.sprinting;
 const crouch=!monster&&(sneaking||entity.hidden||(active&&action==='hide'));
 const frequency=monster?(sprint?2.0:.95):crouch?1.12:sprint?2.85:1.75;
 const cycle=time*frequency*TAU,sine=Math.sin(cycle),cosine=Math.cos(cycle);
 const step=moving?1:0,breathe=Math.sin(time*(monster?1.6:2.1));
 d.pose=monster?(active?action:entity.mode||'roam'):entity.hidden?'hide':active?action:crouch?'crouch':moving?(sprint?'sprint':'walk'):'idle';
 if(monster){
  j.hips.position.y-=.025+Math.abs(sine)*step*.035;
  setRotation(j.hips,0,sine*.035*step,cosine*.022*step);
  setRotation(j.spine,.045,Math.sin(time*.7)*.025,-.018);
  setRotation(j.chest,.075+breathe*.010,sine*-.028*step,.014);
  setRotation(j.neck,.02,Math.sin(time*.43)*.11,Math.sin(time*.61)*.025);
  setRotation(j.head,.11+breathe*.012,Math.sin(time*.78)*.07,-.045);
  for(const side of ['L','R']){
   const s=side==='L'?1:-1,phase=sine*s;
   setRotation(j['thigh'+side],-.13+phase*(sprint?.54:.28)*step,0,s*.035);
   setRotation(j['shin'+side],.23+Math.max(0,-phase)*(sprint?.79:.49)*step);
   setRotation(j['foot'+side],-.10-Math.max(0,phase)*.18*step);
   setRotation(j['upperArm'+side],-.14-phase*(sprint?.43:.22)*step,0,s*.10);
   setRotation(j['forearm'+side],-.19-Math.max(0,phase)*.16*step,0,-s*.04);
   setRotation(j['hand'+side],.09+Math.sin(time*1.2+s)*.04,0,s*.045);
   setRotation(j['coat'+side],.025+Math.sin(cycle-s*.5)*step*.07,0,s*.02+sine*.015*step);
  }
  if(entity.mode==='lockon'){
   const tremble=Math.sin(time*24)*.012;
   j.chest.rotation.x=.10;j.head.rotation.set(-.08+tremble,Math.sin(time*5)*.06,-.12);
   j.upperArmL.rotation.x=-.45;j.upperArmR.rotation.x=-.45;
  }else if(entity.mode==='search'){
   j.head.rotation.y=Math.sin(time*1.65)*.55;j.head.rotation.z=Math.sin(time*.9)*.12;
   j.chest.rotation.x=.14;j.upperArmL.rotation.x=-.30;j.upperArmR.rotation.x=-.21;
  }else if(entity.mode==='hunt'){
   j.spine.rotation.x=.14;j.chest.rotation.x=.21;j.head.rotation.x=.04;
  }
 }else{
  j.hips.position.y+=moving?Math.abs(cosine)*(sprint?.047:.018):breathe*.003;
  setRotation(j.hips,0,sine*.032*step,-sine*.018*step);
  setRotation(j.spine,crouch?.28:sprint?.12:.015+breathe*.008,0,sine*.013*step);
  setRotation(j.chest,crouch?.12:sprint?.10:.015+breathe*.009,-sine*.035*step);
  setRotation(j.neck,crouch?-.28:-.025,Math.sin(time*.35)*.023,0);
  setRotation(j.head,-.018,Math.sin(time*.51)*.025,Math.sin(time*.71)*.012);
  for(const side of ['L','R']){
   const s=side==='L'?1:-1,phase=sine*s;
   setRotation(j['thigh'+side],phase*(sprint?.72:.43)*step,0,s*.020);
   setRotation(j['shin'+side],Math.max(0,-phase)*(sprint?1.12:.72)*step+.045);
   setRotation(j['foot'+side],-.035-Math.max(0,phase)*.24*step);
   setRotation(j['upperArm'+side],-.04-phase*(sprint?.65:.29)*step,0,s*.055);
   setRotation(j['forearm'+side],sprint?-.95:-.12-Math.max(0,phase)*.16*step,0,0);
   setRotation(j['hand'+side],-.06,0,s*.02);
   setRotation(j['coat'+side],.055+Math.sin(cycle-s*.5)*step*(sprint?.24:.095),0,s*.02+sine*.025*step);
  }
  j.forearmR.rotation.x-=.12;j.handR.rotation.x=-.04;
  setRotation(j.scarf,.08+Math.sin(time*2.1)*.035+step*(sprint?.19:.06),Math.sin(time*1.5)*.06,Math.sin(time*1.9)*(.035+step*.04));
  if(crouch){
   j.hips.position.y-=.32;
   for(const side of ['L','R']){
    const s=side==='L'?1:-1,phase=sine*s;
    j['thigh'+side].rotation.x=-.91+phase*.23*step;
    j['shin'+side].rotation.x=1.40+Math.max(0,-phase)*.20*step;
    j['foot'+side].rotation.x=-.50;
    j['upperArm'+side].rotation.x=-.50-phase*.10*step;
    j['forearm'+side].rotation.x=-.53;
    j['coat'+side].rotation.x=.58+phase*.07*step;
    j['coat'+side].rotation.z=s*.14;
   }
  }
  if(active&&(action==='scan'||action==='sonar')){
   const rise=smooth(0,.20,age),fall=1-smooth(Math.max(.25,duration-.30),duration,age),a=rise*fall;
   j.upperArmR.rotation.x=THREE.MathUtils.lerp(j.upperArmR.rotation.x,-.93,a);
   j.forearmR.rotation.x=THREE.MathUtils.lerp(j.forearmR.rotation.x,-.92,a);
   j.handR.rotation.x=-.15;j.head.rotation.x=.07*a;
   j.upperArmR.rotation.z=-.12*a;
  }
  if(active&&(action==='throw'||action==='vial')){
   const t=clamp(age/Math.min(1.05,duration),0,1);
   let shoulder;
   if(t<.35)shoulder=THREE.MathUtils.lerp(-.12,1.32,smooth(0,.35,t));
   else if(t<.60)shoulder=THREE.MathUtils.lerp(1.32,-1.75,smooth(.35,.60,t));
   else shoulder=THREE.MathUtils.lerp(-1.75,-.12,smooth(.60,1,t));
   j.upperArmL.rotation.x=shoulder;j.upperArmL.rotation.z=.16;
   j.forearmL.rotation.x=t<.48?-.9*(1-smooth(.35,.50,t)):-.10;
   j.chest.rotation.y=Math.sin(t*Math.PI)*-.19;
   j.head.rotation.y=.08;
  }
  if(entity.hidden||(active&&(action==='hide'||action==='breath'))){
   j.hips.position.y=r.hip-.34;
   j.spine.rotation.x=.34;j.chest.rotation.x=.19;j.neck.rotation.x=-.12;
   j.head.rotation.x=.25;
   j.upperArmL.rotation.set(-.9,0,.35);j.forearmL.rotation.x=-1.55;
   j.handL.rotation.x=.15;j.upperArmR.rotation.x=-.45;j.forearmR.rotation.x=-1.1;
   if(entity.holdingBreath){j.chest.rotation.x=.18;j.head.rotation.x=.17;}
  }
 }
 for(const side of ['L','R'])for(let f=0;f<5;f++){
  const grasp=monster?.13+Math.sin(time*1.4+f*.8)*.065:side==='R'?.58:.17;
  const release=!monster&&active&&action==='throw'&&side==='L'&&age>.45&&age<.8;
  setRotation(j['finger'+side+f],release?-.1:grasp,0,(f-1.5)*(monster?.05:.025));
  setRotation(j['tip'+side+f],release?0:grasp*.85);
 }
 if(active&&(action==='caught'||action==='capture'||action==='grab')){
  const a=smooth(0,.42,age);
  if(monster){
   j.spine.rotation.x=.30;j.chest.rotation.x=.38;j.head.rotation.x=.08;
   j.upperArmL.rotation.set(-1.48,0,.15);j.upperArmR.rotation.set(-1.48,0,-.15);
   j.forearmL.rotation.x=-.20;j.forearmR.rotation.x=-.20;
  }else{
   j.hips.position.y=r.hip-.18*a;j.spine.rotation.x=-.25*a;j.chest.rotation.x=-.18*a;
   j.head.rotation.x=-.28*a;j.upperArmL.rotation.z=.5*a;j.upperArmR.rotation.z=-.5*a;
   j.forearmL.rotation.x=-1.1*a;j.forearmR.rotation.x=-1.1*a;
   j.thighL.rotation.x=-.28*a;j.shinL.rotation.x=.7*a;
  }
 }
}

export function updateActor(root,entity,time,moving,pulse,room,sneaking=false){
 const d=root.userData;
 root.position.set(entity.x,0,entity.z);
 const actionAge=time-(Number.isFinite(entity.actionStart)?entity.actionStart:-100);
 root.visible=!entity.hidden||(entity.action==='hide'&&actionAge<.18);
 const dt=d.lastTime===null?0:clamp(time-d.lastTime,0,.06);
 const facing=entity.facing||d.lastFacing||1;d.lastFacing=facing;
 const target=facing>0?1.14:-1.14;
 if(d.lastTime===null)root.rotation.y=target;
 else if(dt>0)root.rotation.y=THREE.MathUtils.damp(root.rotation.y,target,14,dt);
 d.lastTime=time;
 const activeAction=entity.action&&(!Number.isFinite(entity.actionUntil)||time<=entity.actionUntil)?entity.action:'';
 const signature=[!!moving,!!sneaking,!!entity.sprinting,!!entity.hidden,!!entity.holdingBreath,entity.mode||'',activeAction].join('|');
 if(d.poseSignature!==undefined&&d.poseSignature!==signature){
  d.transition={time,rotations:d.skeleton.bones.map(b=>b.quaternion.clone()),hips:d.rig.joint.hips.position.clone()};
 }
 d.poseSignature=signature;
 poseRig(d,entity,time,!!moving,sneaking);
 if(d.transition){
  const a=smooth(0,d.kind==='listener'?.23:.18,time-d.transition.time);
  d.skeleton.bones.forEach((bone,i)=>bone.quaternion.slerp(d.transition.rotations[i],1-a));
  d.rig.joint.hips.position.lerpVectors(d.transition.hips,d.rig.joint.hips.position,a);
  if(a>=1)d.transition=null;
 }
 let reveal=0;
 if(pulse&&pulse.room===room){
  const age=time-pulse.time,dis=Math.hypot(entity.x-pulse.x,entity.z-pulse.z);
  if(age>=0&&age<4&&dis<age*6.8)reveal=(1-age/4)*1.1;
 }
 d.reveal.value=reveal;
 if(d.materials.glow)d.materials.glow.emissiveIntensity=(activeAction==='scan'?1.25:.78)+Math.sin(time*11.7)*.035+reveal*.65;
 d.shadow.material.opacity=entity.hidden?.35:.85;
 root.updateMatrixWorld(true);plantFeet(root,d);hangLantern(root,d,time,!!moving);d.skeleton.update();
}
