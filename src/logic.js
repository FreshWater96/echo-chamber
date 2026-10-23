import {GameEntity,State,StateMachine,MemorySystem} from 'yuka';
import {ROOMS,RADIO,clamp,distance,route,surfaceAt} from './facility.js';
import {MEMORIES} from './story.js';
import {blocked,slideMove,lineOfSight,findPath,acousticPath} from './navigation.js';
export {ROOMS,RADIO,clamp,distance,route};
const brains=new WeakMap();
export function emit(s,type,data={}){s.events.push({type,...data});}
function say(s,text){emit(s,'toast',{text});}
function action(s,name,duration){Object.assign(s.player,{action:name,actionStart:s.time,actionUntil:s.time+duration});}
export function createGame(options={}){
 const difficulty=options.difficulty==='story'?'story':'standard';
 return {difficulty,ending:null,awaitingEnding:false,memory:null,time:0,playing:false,ended:false,won:false,paused:false,room:'intake',visited:new Set(['intake']),cards:new Set(),
  player:{x:-1.3,z:.5,facing:1,hidden:false,hidingAt:null,moving:false,sneaking:false,sprinting:false,listening:false,stamina:100,breath:100,holdingBreath:false,action:'idle',actionUntil:0,actionStart:0},
  monster:{room:'containment',x:7.3,z:.3,facing:-1,mode:'roam',targetRoom:'containment',target:{x:3.5,z:.3},memoryUntil:0,lockUntil:0,travel:0,patrol:0,awake:false,moving:false,seen:false,path:[],pathGoal:null,since:0},
  noise:0,pulse:null,pulses:0,nextPulse:0,bottles:difficulty==='story'?5:4,radios:difficulty==='story'?4:3,radioUntil:0,transition:0,nextStepNoise:0,pending:[],events:[],doorUntil:0,
  nextBreath:0,gaspUntil:0,archiveReleased:false,cryoScanned:false,encounters:new Set(),tutorial:{stage:0,until:0},
  extraction:{started:false,remaining:24,ready:false,nextNoise:0},checkpoint:null,survived:0};
}
export function start(s){s.playing=true;s.ended=false;emit(s,'start');say(s,'Mara. If you can hear this, follow the bells. Pulse your echo-lantern to find the way.');}
class Behaviour extends State{
 constructor(name,execute){super();this.name=name;this.run=execute;}
 enter(b){b.m.mode=this.name;b.m.since=b.s.time;b.m.path=[];b.m.pathGoal=null;}
 execute(b){this.run(b);}
}
function change(b,name){if(!b.fsm.in(name))b.fsm.changeTo(name);}
function getBrain(s){
 let b=brains.get(s);if(b)return b;
 b={s,m:s.monster,dt:0,entity:new GameEntity(),stimuli:new Map(),valid:[],nextPath:0};b.memory=new MemorySystem(b.entity);b.memory.memorySpan=9;
 b.fsm=new StateMachine(b);
 b.fsm.add('roam',new Behaviour('roam',patrol));
 b.fsm.add('investigate',new Behaviour('investigate',investigate));
 b.fsm.add('lockon',new Behaviour('lockon',b=>{b.m.moving=false;if(b.s.time>=b.m.lockUntil){change(b,'hunt');emit(b.s,'hunt');}}));
 b.fsm.add('hunt',new Behaviour('hunt',hunt));
 b.fsm.add('search',new Behaviour('search',search));
 b.fsm.changeTo(s.monster.mode);brains.set(s,b);return b;
}
function remember(b,source,duration){
 const key=source.kind+':'+source.room;let entity=b.stimuli.get(key);
 if(!entity){entity=new GameEntity();b.stimuli.set(key,entity);b.memory.createRecord(entity);}
 const record=b.memory.getRecord(entity);record.timeLastSensed=b.s.time;record.timeBecameVisible=b.s.time;record.visible=source.kind==='sight';record.lastSensedPosition.set(source.x,0,source.z);record.room=source.room;
 const retarget=b.m.targetRoom!==source.room||distance(b.m.target,{x:source.x,z:source.z})>1.2;
 b.m.targetRoom=source.room;b.m.target={x:record.lastSensedPosition.x,z:record.lastSensedPosition.z};b.m.memoryUntil=b.s.time+duration;b.m.lastStimulus=source.kind;
 if(retarget)b.m.pathGoal=null;
}
function lockOn(b,source){
 remember(b,source,7);if(!['lockon','hunt'].includes(b.m.mode)){change(b,'lockon');b.m.lockUntil=b.s.time+(b.s.difficulty==='story'?1.6:1.05);emit(b.s,'lockon',{x:b.m.x,z:b.m.z,room:b.m.room});}
}
export function noiseEvent(s,source){
 const e={volume:1,reach:2,...source};emit(s,'noise',e);
 const m=s.monster,b=getBrain(s);if(!m.awake&&!['sonar','radio','purge','glass'].includes(e.kind))return false;
 const a=acousticPath(e.room,e,m.room,m);
 const strength=e.volume*a.gain;
 if(a.hops>e.reach||strength<(e.kind==='sonar'?.075:.12))return false;
 // The first pulse is a safe lesson: the distant creature wakes on a later transmission or card pickup.
 if(!m.awake&&s.pulses<=1&&s.cards.size===0&&e.kind==='sonar')return false;
 m.awake=true;
 if(m.mode==='hunt'&&m.room===s.room&&m.seen&&distance(m,s.player)<3.2)return true;
 const duration=e.kind==='radio'?20:e.kind==='purge'?32:e.kind==='sonar'?13:8;
 remember(b,e,duration);
 if(e.room===m.room&&a.distance<4.6&&lineOfSight(m.room,m,e,.95)&&['sonar','running','gasp'].includes(e.kind))lockOn(b,e);
 else change(b,'investigate');
 return true;
}
export function pulse(s){
 if(!s.playing||s.ended||s.paused)return false;
 if(s.time<s.nextPulse){say(s,'The echo-lantern needs a moment.');return false;}
 if(s.player.hidden){say(s,'Leave the confessional before sounding the lantern.');return false;}
 s.pulse={x:s.player.x,z:s.player.z,room:s.room,time:s.time};s.nextPulse=s.time+(s.difficulty==='story'?3.5:4.2);s.pulses++;s.noise=clamp(s.noise+31,0,100);action(s,'scan',.8);emit(s,'pulse',s.pulse);
 if(s.tutorial.stage===0){s.tutorial.stage=1;s.tutorial.until=s.time+5;}
 if(s.room==='cryo'&&distance(s.player,ROOMS.cryo.key)<8.5){s.cryoScanned=true;emit(s,'objective');}
 noiseEvent(s,{kind:'sonar',room:s.room,x:s.player.x,z:s.player.z,volume:1.5+s.noise*.008,reach:s.noise>75?5:3});
 return true;
}
export function radio(s){
 if(!s.playing||s.ended||s.paused||s.player.hidden)return false;
 if(s.radios<=0){say(s,'No gramophone winds remain. Try a glass decoy.');return false;}
 s.radios--;s.radioUntil=s.time+11;s.archiveReleased=true;
 noiseEvent(s,{...RADIO,kind:'radio',volume:2.8,reach:5});emit(s,'radio',{...RADIO});say(s,'The gramophone sings. A cabinet opens in the Wax Archive.');return true;
}
export function throwBottle(s){
 if(!s.playing||s.ended||s.paused||s.player.hidden)return false;
 if(s.bottles<=0){say(s,'No glass decoys remaining.');return false;}
 const w=ROOMS[s.room].width/2-1.15;
 const target={room:s.room,x:clamp(s.player.x+s.player.facing*5.4,-w,w),z:clamp(s.player.z-.15,-1.1,1.5)};
 s.bottles--;action(s,'throw',.7);s.pending.push({at:s.time+.55,source:{...target,kind:'glass',volume:1.65,reach:2}});
 emit(s,'throw',{from:{x:s.player.x,z:s.player.z},target});return true;
}
export function context(s){
 if(s.player.hidden)return {type:'leave',label:'Leave confessional',x:s.player.x,z:s.player.z};
 const p=s.player,r=ROOMS[s.room],options=[];
 if(r.key&&!s.cards.has(r.key.id))options.push({...r.key,type:'card',label:s.room==='cryo'&&!s.cryoScanned?'Sound the lantern to find the cylinder':s.room==='archive'&&!s.archiveReleased?'Cylinder cabinet · Wind the gramophone':'Take '+r.key.label});
 for(const d of r.doors)options.push({...d,type:'door',label:'Enter '+d.label});
 for(const l of r.lockers)options.push({...l,type:'hide',label:'Hide in confessional'});
 if(s.room===RADIO.room)options.push({...RADIO,type:'radio',label:'Wind gramophone · Release cylinder cabinet'});
 if(r.exit)options.push({...r.exit,type:'exit',label:s.cards.size!==3?'Ferry bell · '+s.cards.size+' / 3 voices':s.extraction.ready?'Finish the song':s.extraction.started?'Final refrain · '+Math.ceil(s.extraction.remaining)+' seconds':'Ring the ferry bell · 24-second refrain'});
 options.sort((a,b)=>distance(a,p)-distance(b,p));return options.length&&distance(options[0],p)<1.4?options[0]:null;
}
function makeCheckpoint(s){
 s.checkpoint={difficulty:s.difficulty,cards:[...s.cards],visited:[...s.visited],bottles:Math.max(s.bottles,2),radios:Math.max(s.radios,1),time:s.time,pulses:s.pulses};emit(s,'checkpoint',{checkpoint:s.checkpoint});
}
export function restoreCheckpoint(checkpoint){
 const s=createGame({difficulty:checkpoint?.difficulty});if(!checkpoint||!Array.isArray(checkpoint.cards)||checkpoint.cards.length!==3)return s;
 const ids=new Set(['cryo','archive','containment']);if(checkpoint.cards.some(k=>!ids.has(k))||new Set(checkpoint.cards).size!==3)return s;
 s.cards=new Set(checkpoint.cards);s.visited=new Set(Object.keys(ROOMS));s.room='airlock';Object.assign(s.player,{x:-6.4,z:.5});
 s.bottles=clamp(checkpoint.bottles||2,2,4);s.radios=clamp(checkpoint.radios||1,1,3);s.time=Number.isFinite(checkpoint.time)?Math.max(0,checkpoint.time):0;s.pulses=Number.isFinite(checkpoint.pulses)?checkpoint.pulses:0;
 s.cryoScanned=true;s.archiveReleased=true;s.tutorial.stage=5;s.monster.awake=true;s.monster.room='containment';s.monster.x=2.4;s.monster.z=1.1;s.checkpoint=checkpoint;return s;
}
export function interact(s){
 if(!s.playing||s.ended||s.paused)return false;const c=context(s);if(!c)return false;const p=s.player,m=s.monster,b=getBrain(s);
 if(c.type==='leave'){p.hidden=false;p.hidingAt=null;p.holdingBreath=false;p.z=Math.min(1.5,p.z+.45);action(s,'hide',.45);emit(s,'hide',{hidden:false});return true;}
 if(c.type==='card'){
  if(c.id==='cryo'&&!s.cryoScanned){say(s,'Sound the lantern near the cloister altar. The cylinder is hidden in the darkness.');return false;}
  if(c.id==='archive'&&!s.archiveReleased){say(s,'The cabinet mechanism turns with the gramophone. Wind it remotely, or use the western altar.');emit(s,'locked');return false;}
  s.cards.add(c.id);s.memory={id:c.id,room:s.room,x:c.x,z:c.z,time:s.time};emit(s,'memory',{...s.memory,...MEMORIES[c.id]});action(s,'scan',.65);emit(s,'card',{id:c.id,label:c.label});say(s,c.label+' recovered. '+s.cards.size+' of 3 voices.');
  m.awake=true;
  if(c.id==='cryo'){say(s,'The Cantor heard the latch. The gramophone can draw it away.');noiseEvent(s,{kind:'latch',room:s.room,x:p.x,z:p.z,volume:.65,reach:1});}
  if(s.cards.size===3){makeCheckpoint(s);say(s,'Three voices recovered. Ferry checkpoint saved. The final bell will carry.');}return true;
 }
 if(c.type==='hide'){
  const seen=m.room===s.room&&m.seen&&distance(m,p)<4&&lineOfSight(s.room,m,p,p.sneaking?.85:1.5);
  if(seen&&['hunt','lockon'].includes(m.mode)){say(s,'It can see you enter. Break line of sight first.');return false;}
  p.hidden=true;p.hidingAt={x:c.x,z:c.z};p.x=c.x;p.z=c.z;action(s,'hide',.5);emit(s,'hide',{hidden:true});say(s,'Hidden. Hold Ctrl / C to silence your breathing. Release to recover.');
  // A locker never deletes the pursuer's memory of the last observed location.
  return true;
 }
 if(c.type==='radio')return radio(s);
 if(c.type==='exit'){
  if(s.cards.size!==3){say(s,'The ferry bell needs three voice cylinders.');emit(s,'locked');return false;}
  if(!s.extraction.started){s.extraction.started=true;s.extraction.nextNoise=s.time;emit(s,'purge');say(s,'The bell is ringing. Survive its 24-second refrain, then return to the wheel.');return true;}
  if(!s.extraction.ready){say(s,'The bell is still singing · '+Math.ceil(s.extraction.remaining)+' seconds remaining.');return false;}
  s.awaitingEnding=true;s.paused=true;emit(s,'ending-choice');return true;
 }
 if(c.type==='door'){
  if(s.time<s.doorUntil)return false;
  const from=s.room;s.room=c.to;p.x=c.spawn.x;p.z=c.spawn.z;p.hidden=false;p.holdingBreath=false;p.hidingAt=null;s.visited.add(s.room);s.transition=.45;s.doorUntil=s.time+.8;
  action(s,'door',.6);emit(s,'room',{from,to:s.room});
  if(m.room===from&&m.seen){remember(b,{kind:'door',room:from,x:c.x,z:c.z},8);change(b,'investigate');}
  if(!s.encounters.has(s.room)){s.encounters.add(s.room);emit(s,'encounter',{room:s.room});
   const hints={cryo:'The cloister has no light. Sound the lantern. Step around the fallen piano.',archive:'The gramophone opens the cylinder cabinet. Its song also carries through every door.',containment:'Broken glass surrounds the fallen choir bench. Crouch to cross it quietly.',airlock:'The ferry bell rings for 24 seconds. Use confessionals, cover, and any remaining decoys.'};if(hints[s.room])say(s,hints[s.room]);
  }
  noiseEvent(s,{kind:'door',room:from,x:c.x,z:c.z,volume:.4,reach:1});return true;
 }
 return false;
}
function movePlayer(s,dt,input){
 const p=s.player;p.moving=false;p.listening=!!input.listen&&!p.hidden;p.sneaking=!!input.sneak||p.listening;p.sprinting=false;
 if(p.hidden||s.transition>0)return;
 let x=input.x||0,z=input.z||0,n=Math.hypot(x,z);
 if(n>.01){
  x/=Math.max(1,n);z/=Math.max(1,n);const sprint=!!input.sprint&&!p.sneaking&&p.stamina>3,speed=p.listening?.65:p.sneaking?1.3:sprint?3.65:2.45;
  p.moving=slideMove(s.room,p,x*speed*dt,z*speed*dt,.23);p.sprinting=sprint&&p.moving;if(Math.abs(x)>.1)p.facing=x>0?1:-1;
  p.stamina=clamp(p.stamina+(p.sprinting?-23:7)*dt,0,100);
  if(p.moving&&s.time>=s.nextStepNoise){
   s.nextStepNoise=s.time+(p.sprinting?.3:p.sneaking?.65:.46);const surface=surfaceAt(s.room,p);
   const volume=p.sneaking?.035:surface==='glass'?1.15:p.sprinting?.8:.28;
   if(p.sprinting||surface==='glass'&&!p.sneaking)s.noise=clamp(s.noise+(surface==='glass'?7:3),0,100);
   emit(s,'footstep',{room:s.room,x:p.x,z:p.z,surface,sneaking:p.sneaking,sprinting:p.sprinting});
   noiseEvent(s,{kind:p.sprinting?'running':surface==='glass'?'glass-step':'step',room:s.room,x:p.x,z:p.z,volume,reach:p.sprinting||surface==='glass'?1:0});
  }
 }else p.stamina=clamp(p.stamina+15*dt,0,100);
}
function updateBreath(s,dt,input){
 const p=s.player;p.holdingBreath=p.hidden&&!!input.sneak&&p.breath>1&&s.time>=s.gaspUntil;
 if(p.holdingBreath)p.breath=Math.max(0,p.breath-dt*(s.difficulty==='story'?12:17));
 else p.breath=clamp(p.breath+dt*(p.sprinting?-4:p.hidden?11:18),0,100);
 if(p.hidden&&p.breath<1&&s.time>=s.gaspUntil){s.gaspUntil=s.time+2.5;p.holdingBreath=false;emit(s,'gasp');say(s,'Your breath breaks. Release Ctrl / C to recover.');noiseEvent(s,{kind:'gasp',room:s.room,x:p.x,z:p.z,volume:.75,reach:0});}
 if(p.hidden&&!p.holdingBreath&&s.time>=s.nextBreath){
  s.nextBreath=s.time+2.1;emit(s,'breath',{strained:p.breath<30});
  if(s.monster.room===s.room&&distance(s.monster,p)<1.35&&s.monster.awake){
   s.monster.target={x:p.x,z:p.z};s.monster.targetRoom=s.room;s.monster.memoryUntil=s.time+5;
   if(s.monster.mode!=='lockon'&&s.monster.mode!=='hunt'){const b=getBrain(s);change(b,'lockon');s.monster.lockUntil=s.time+1.4;emit(s,'lockon');say(s,'The Cantor is listening at the confessional. Hold your breath.');}
   if(s.monster.mode==='hunt'&&s.time>s.monster.since+1)capture(s);
  }
 }
}
function moveTo(b,goal,speed){
 const {s,m,dt}=b;
 const destination=m.targetRoom!==m.room?ROOMS[m.room].doors.find(d=>d.to===route(m.room,m.targetRoom)[1]):goal;
 if(!destination){m.moving=false;return false;}
 const key=m.room+':'+destination.x.toFixed(1)+','+destination.z.toFixed(1);
 if(!m.pathGoal||s.time>b.nextPath||(m.targetRoom!==m.room&&m.pathGoal!==key)){m.path=findPath(m.room,m,destination,.25);m.navEndpoint=m.path.at(-1)||{x:m.x,z:m.z};m.pathGoal=key;b.nextPath=s.time+(m.mode==='hunt'?.45:.85);}
 while(m.path.length&&distance(m,m.path[0])<.14)m.path.shift();
 const target=m.path[0]||m.navEndpoint||destination,dx=target.x-m.x,dz=target.z-m.z,n=Math.hypot(dx,dz);
 m.moving=n>.1;if(n>.1){const amount=Math.min(speed*dt,n);slideMove(m.room,m,dx/n*amount,dz/n*amount,.25);if(Math.abs(dx)>.04)m.facing=dx>0?1:-1;}
 if(m.targetRoom!==m.room&&distance(m,destination)<.48){
  m.travel+=dt;if(m.travel>.7){const previous=m.room,next=destination.to,entry=ROOMS[next].doors.find(d=>d.to===previous);m.room=next;m.x=clamp(entry.x,-ROOMS[next].width/2+1.1,ROOMS[next].width/2-1.1);m.z=Math.max(entry.z,.25);m.travel=0;m.path=[];m.pathGoal=null;emit(s,'monster-room',{room:next,x:m.x,z:m.z});}return false;
 }
 m.travel=0;return m.targetRoom===m.room&&distance(m,m.navEndpoint||goal)<.25;
}
function patrol(b){
 const {s,m}=b;if(!m.awake){m.moving=false;return;}
 if(s.time<m.waitUntil){m.moving=false;return;}
 if(moveTo(b,m.target,.78)){
  m.patrol++;m.waitUntil=s.time+1.5;
  if(m.patrol%3===0){const options=ROOMS[m.room].doors.filter(d=>d.to!=='cryo'&&d.to!=='airlock');if(options.length)m.targetRoom=options[Math.floor(m.patrol/3)%options.length].to;}
  m.target={x:(m.patrol%2?1:-1)*ROOMS[m.targetRoom].width*.29,z:m.patrol%2?.8:-.15};
 }
}
function investigate(b){
 if(moveTo(b,b.m.target,1.75)){change(b,'search');b.m.searchOrigin={...b.m.target};b.m.searchUntil=b.s.time+7.5;b.m.searchIndex=0;}
 if(b.s.time>b.m.memoryUntil&&b.m.targetRoom!==b.m.room){change(b,'roam');b.m.targetRoom=b.m.room;b.m.target={x:clamp(b.m.x+1.5*b.m.facing,-ROOMS[b.m.room].width/2+1.3,ROOMS[b.m.room].width/2-1.3),z:.65};}
}
function hunt(b){
 if(moveTo(b,b.m.target,b.s.difficulty==='story'?2.25:2.95)||b.s.time>b.m.memoryUntil){change(b,'search');b.m.searchOrigin={...b.m.target};b.m.searchUntil=b.s.time+7.5;b.m.searchIndex=0;}
}
function search(b){
 const {s,m}=b;if(s.time>(m.searchUntil||m.memoryUntil)){change(b,'roam');m.targetRoom=m.room;m.target={x:clamp(m.x+1.2*m.facing,-ROOMS[m.room].width/2+1.3,ROOMS[m.room].width/2-1.3),z:.65};return;}
 const origin=m.searchOrigin||m.target,phase=Math.floor((s.time-m.since)/1.9);
 const candidates=[{x:origin.x+1.6,z:.95},{x:origin.x-1.9,z:-.2},{x:origin.x+.3,z:1.25},{x:origin.x-2.8,z:.3}];
 const target=candidates[phase%4];target.x=clamp(target.x,-ROOMS[m.room].width/2+1.2,ROOMS[m.room].width/2-1.2);m.targetRoom=m.room;moveTo(b,target,.95);
}
function capture(s){if(s.ended)return;s.ended=true;s.playing=false;s.won=false;s.survived=s.time;action(s,'caught',1.2);emit(s,'caught');}
function updateMonster(s,dt){
 const m=s.monster,p=s.player,b=getBrain(s);b.dt=dt;b.entity.position.set(m.x,1.8,m.z);m.seen=false;
 // No proximity omniscience: cover, facing, darkness and the last sensed coordinate govern pursuit.
 if(m.awake&&m.room===s.room&&!p.hidden){
  const d=distance(m,p),age=s.pulse?.room===s.room?s.time-s.pulse.time:99;
  const lit=Math.abs(Math.abs(p.x)-ROOMS[s.room].width*.28)<1.25&&s.room!=='cryo';
  const range=p.sneaking?1.8:p.sprinting?5.5:lit?5.3:3.1;
  const facing=(p.x-m.x)*m.facing>-.2||d<1.15;
  if(d<(age<1?Math.max(range,6.5):range)&&facing&&lineOfSight(s.room,m,p,p.sneaking?.9:1.48)){
   m.seen=true;lockOn(b,{kind:'sight',room:s.room,x:p.x,z:p.z});
  }
 }
 b.memory.getValidMemoryRecords(s.time,b.valid);b.fsm.update();
 if(m.room===s.room&&!p.hidden&&m.mode==='hunt'&&distance(m,p)<.6&&lineOfSight(s.room,m,p,.7))capture(s);
}
function updateTutorial(s){
 if(s.tutorial.stage===1&&s.time>=s.tutorial.until){s.tutorial.stage=2;s.tutorial.until=s.time+7;say(s,'Every echo reveals you as well. Use W / S to step around objects. Hold V to listen without making a sound.');}
 else if(s.tutorial.stage===2&&s.time>=s.tutorial.until){s.tutorial.stage=3;s.tutorial.until=s.time+8;say(s,'The Flooded Cloister lies west. Crouch to stay quiet. Interact with doors and confessionals.');}
 else if(s.tutorial.stage===3&&s.time>=s.tutorial.until){s.tutorial.stage=4;say(s,'Throw glass to leave a sound elsewhere. The gramophone can call the Cantor back to the Archive.');}
}
export function objective(s){
 if(s.cards.size===3)return s.extraction.ready?'The final refrain is over. Return to the ferry wheel.':s.extraction.started?'Survive the bell. Use cover, confessionals, and decoys.':'Reach Ferryman’s Gate. Ring the final bell.';
 if(s.room==='cryo'&&!s.cards.has('cryo'))return s.cryoScanned?'Take the voice cylinder from the western altar.':'Sound the lantern near the western altar to reveal the lost voice.';
 if(s.room==='archive'&&!s.cards.has('archive'))return s.archiveReleased?'The cabinet is open. Take the voice at the eastern altar.':'Wind the gramophone to open the cylinder cabinet.';
 if(s.room==='containment'&&!s.cards.has('containment'))return 'Crouch across broken glass. Take the final voice.';
 return 'Find three lost voices. Cloister west · Archive north · Choir east.';
}
export function update(s,dt,input={}){
 if(!s.playing||s.ended||s.paused)return;dt=clamp(dt,0,.05);s.time+=dt;s.transition=Math.max(0,s.transition-dt);s.noise=Math.max(0,s.noise-dt*3.3);
 movePlayer(s,dt,input);updateBreath(s,dt,input);updateTutorial(s);
 for(let i=s.pending.length-1;i>=0;i--)if(s.time>=s.pending[i].at){noiseEvent(s,s.pending[i].source);emit(s,'glass',s.pending[i].source);s.pending.splice(i,1);}
 if(s.extraction.started&&!s.extraction.ready){
  s.extraction.remaining=Math.max(0,s.extraction.remaining-dt);
  if(s.time>=s.extraction.nextNoise){s.extraction.nextNoise=s.time+4;noiseEvent(s,{kind:'purge',room:'airlock',x:5.7,z:-.55,volume:3,reach:5});emit(s,'pressure');}
  if(s.extraction.remaining<=0){s.extraction.ready=true;emit(s,'purge-ready');say(s,'The bell falls silent. Return to the ferry wheel and finish the song.');}
 }
 if(s.ended)return;updateMonster(s,dt);
}

export function chooseEnding(s,choice){
 if(!s.awaitingEnding||s.ended||!['carry','release'].includes(choice))return false;
 s.ending=choice;s.awaitingEnding=false;s.paused=false;s.won=true;s.ended=true;s.playing=false;s.survived=s.time;emit(s,'win',{ending:choice});return true;
}
export function listeningHint(s){
 if(!s.player.listening)return '';
 const path=route(s.room,s.monster.room),same=s.room===s.monster.room;
 if(!s.monster.awake)return 'Only water. Somewhere below it, a held breath.';
 if(same){const d=distance(s.player,s.monster);return d<2.5?'A breath beside you. Do not move.':s.monster.x<s.player.x?'A ragged breath to the left.':'A ragged breath to the right.';}
 if(path.length===2)return 'A low voice beyond the '+ROOMS[s.room].doors.find(d=>d.to===path[1]).label+' door.';
 return 'The Cantor is distant. Rain fills the space between you.';
}
