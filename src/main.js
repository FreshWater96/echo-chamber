import * as THREE from 'three';
import {ROOMS,createGame,start,update,pulse,radio,throwBottle,interact,context,clamp,objective,restoreCheckpoint,chooseEnding,listeningHint} from './logic.js';
import {loadMaterials,buildRoom,updateRoom,echo,createSonarRing,setSonarOcclusion} from './world.js';
import {loadActors,createActor,updateActor} from './actors.js';
import {createEffects} from './effects.js';
import {Soundscape} from './audio.js';
import {createAudioGuard} from './audio-guard.js';
import {snapshotGame,restoreGame} from './persistence.js';
import {DEFAULT_BINDINGS,ACTION_LABELS,keyLabel,setBinding,sanitizeSettings} from './preferences.js';
import {MEMORIES,ENDINGS,journalEntries} from './story.js';
const $=id=>document.getElementById(id),held=new Set(),sound=new Soundscape(),audio=createAudioGuard(sound);
let state=createGame(),renderer,scene,camera,effects,hero,listener,light,enemyLight,ring,textures,actorArt;
let currentRoom=null,ready=false,lowQuality=false,lastTime=performance.now(),lastUI=0,lastScope=0;
let toastTimer,roomTimer,captionTimer,endTimer,saveTimer,endStarted=0,gamepadLast=[],ghost=null,lastAutosave=0,bindingAction=null,settingsFromTitle=false;
const rooms=new Map(),thrown=[];
const SETTINGS_KEY='echo-orison-settings-v4',CHECKPOINT_KEY='echo-orison-ferry-v1',SAVE_KEY='echo-orison-journey-v1';
let settings=sanitizeSettings({},matchMedia('(prefers-reduced-motion: reduce)').matches);
try{settings=sanitizeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}'),settings.reducedMotion);}catch{}
lowQuality=settings.quality==='low';
function savedJourney(){try{return restoreGame(JSON.parse(localStorage.getItem(SAVE_KEY)||'null'));}catch{return null;}}
function saveJourney(notify=false){
 const data=snapshotGame(state);if(!data)return;
 try{localStorage.setItem(SAVE_KEY,JSON.stringify(data));lastAutosave=state.time;if(notify){$('save-indicator').classList.remove('hidden');clearTimeout(saveTimer);saveTimer=setTimeout(()=>$('save-indicator').classList.add('hidden'),1800);}}catch{}
}
function checkpoint(){try{const value=JSON.parse(localStorage.getItem(CHECKPOINT_KEY)||'null');return restoreCheckpoint(value).checkpoint;}catch{return null;}}
function saveSettings(){try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));}catch{}audio.call('settings',settings);}
sound.caption=text=>{if(!settings.captions||!state.playing||state.paused)return;$('audio-caption').textContent=text;$('audio-caption').classList.remove('hidden');clearTimeout(captionTimer);captionTimer=setTimeout(()=>$('audio-caption').classList.add('hidden'),2400);};
function message(text){$('toast').textContent=text;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),5100);}
function flashRoom(){const r=ROOMS[state.room];$('room-flash').querySelector('h2').textContent=r.name;$('room-flash').classList.add('show');clearTimeout(roomTimer);roomTimer=setTimeout(()=>$('room-flash').classList.remove('show'),2900);}
function switchRoom(id,fade=true){
 if(!rooms.has(id)){const g=buildRoom(id,textures);rooms.set(id,g);scene.add(g);}for(const [key,g] of rooms)g.visible=key===id;currentRoom=rooms.get(id);
 $('room-name').textContent=ROOMS[id].name;$('room-subtitle').textContent=ROOMS[id].subtitle;
 if(fade){const overlay=$('transition');overlay.style.transition='none';overlay.style.opacity='1';requestAnimationFrame(()=>{overlay.style.transition='opacity .35s';setTimeout(()=>{overlay.style.opacity='0';},100);});flashRoom();}
 if(camera){const max=Math.max(.5,ROOMS[id].width/2-6);camera.position.x=clamp(state.player.x,-max,max);}audio.call('setRoom',id);
}
function updateMap(){
 const list=$('map-rooms');list.replaceChildren();const ns='http://www.w3.org/2000/svg',nodes=$('map-nodes');nodes.replaceChildren();
 const positions={cryo:[30,105],intake:[130,105],gallery:[250,105],archive:[250,12],containment:[380,105],airlock:[510,105]};
 for(const [id,r] of Object.entries(ROOMS)){
  const known=state.visited.has(id),key=r.key,el=document.createElement('div');el.className='map-room'+(known?' visited':'')+(state.room===id?' current':'');
  const b=document.createElement('b');b.textContent=known?r.name:'Uncharted passage';el.appendChild(b);const small=document.createElement('small');small.textContent=state.room===id?'YOU ARE HERE':known?'REMEMBERED':'NOT YET HEARD';el.appendChild(small);
  if(key&&known){const e=document.createElement('em');e.textContent=state.cards.has(key.id)?'Voice recovered':'Voice not recovered';el.appendChild(e);}
  if(r.exit&&known){const e=document.createElement('em');e.textContent=state.extraction.ready?'Final refrain complete':state.cards.size===3?'Three voices recovered':'Ferry bell silent';el.appendChild(e);}list.appendChild(el);
  const [x,y]=positions[id],g=document.createElementNS(ns,'g');g.classList.add('map-point');if(state.room===id)g.classList.add('current');if(!known)g.classList.add('unknown');
  const rect=document.createElementNS(ns,'rect');for(const [k,v] of Object.entries({x,y,width:100,height:50,rx:2}))rect.setAttribute(k,v);g.appendChild(rect);
  const label=document.createElementNS(ns,'text');label.setAttribute('x',x+50);label.setAttribute('y',y+23);label.setAttribute('text-anchor','middle');label.textContent=known?({cryo:'CLOISTER',intake:'PLATFORM',gallery:'GALLERY',archive:'WAX ARCHIVE',containment:'CHOIR PIT',airlock:'FERRY GATE'})[id]:'?';g.appendChild(label);
  if(state.room===id){const marker=document.createElementNS(ns,'text');marker.setAttribute('x',x+50);marker.setAttribute('y',y+40);marker.setAttribute('text-anchor','middle');marker.textContent='YOU';g.appendChild(marker);}nodes.appendChild(g);
 }
}
function toggleMap(force){
 if(!ready||state.ended||!state.playing||state.awaitingEnding)return;
 const show=typeof force==='boolean'?force:$('map-screen').classList.contains('hidden');
 $('pause-screen').classList.add('hidden');$('journal-screen').classList.add('hidden');$('map-screen').classList.toggle('hidden',!show);state.paused=show;held.clear();if(show)updateMap();
}
function updateJournal(){
 const container=$('journal-entries');container.replaceChildren();
 for(const entry of journalEntries(state)){
  const el=document.createElement('article');el.className='journal-entry'+(entry.found?'':' locked');
  const number=document.createElement('span');number.textContent=entry.number;const title=document.createElement('h3');title.textContent=entry.found?entry.title:'A voice still missing';el.append(number,title);
  const quote=document.createElement('blockquote');quote.textContent=entry.found?'“'+entry.line+'”':'Somewhere in the city, the wax remembers.';const text=document.createElement('p');text.textContent=entry.found?entry.text:'Recover this recording to hear its story.';el.append(quote,text);container.append(el);
 }
}
function toggleJournal(force){
 if(!ready||!state.playing||state.ended||state.awaitingEnding)return;
 const show=typeof force==='boolean'?force:$('journal-screen').classList.contains('hidden');$('map-screen').classList.add('hidden');$('pause-screen').classList.add('hidden');$('journal-screen').classList.toggle('hidden',!show);state.paused=show;held.clear();if(show)updateJournal();
}
function pauseGame(force){
 if(!ready||state.awaitingEnding)return;
 if(!state.playing||state.ended){$('pause-screen').classList.add('hidden');return;}
 if(!$('journal-screen').classList.contains('hidden')){toggleJournal(false);return;}if(!$('map-screen').classList.contains('hidden')){toggleMap(false);return;}
 const paused=typeof force==='boolean'?force:!state.paused;settingsFromTitle=false;state.paused=paused;$('resume-btn').querySelector('span').textContent='Continue';$('restart-pause-btn').classList.remove('hidden');$('pause-screen').classList.toggle('hidden',!paused);held.clear();bindingAction=null;updateBindings();
}
function openSettings(){settingsFromTitle=true;$('pause-screen').classList.remove('hidden');$('resume-btn').querySelector('span').textContent='Return';$('restart-pause-btn').classList.add('hidden');held.clear();}
function closeSettings(){bindingAction=null;updateBindings();if(settingsFromTitle){$('pause-screen').classList.add('hidden');settingsFromTitle=false;}else pauseGame(false);}
function openPrologue(){if(!ready)return;state.paused=true;held.clear();$('prologue-screen').classList.remove('hidden');}
function startGame(mode='new'){
 if(!ready)return;clearTimeout(endTimer);endStarted=0;audio.reset();
 const stored=mode==='continue'?savedJourney():null,cp=checkpoint();
 state=mode==='checkpoint'?restoreCheckpoint(cp):mode==='continue'?(cp&&(!stored||stored.cards.size<3)?restoreCheckpoint(cp):stored||createGame({difficulty:settings.difficulty})):createGame({difficulty:settings.difficulty});
 start(state);lastAutosave=state.time;sound.init().then(()=>{audio.call('reset');audio.call('settings',settings);audio.call('setRoom',state.room);}).catch(error=>console.info('Audio unavailable',error));held.clear();bindingAction=null;
 for(const id of ['title-screen','prologue-screen','end-screen','pause-screen','map-screen','journal-screen','ending-choice-screen','audio-caption','memory-caption'])$(id).classList.add('hidden');
 for(const id of ['hud','bottom-hud','mobile-controls','objective'])$(id).classList.remove('hidden');$('help-line').style.opacity='1';
 for(const vial of thrown){scene.remove(vial.mesh);vial.mesh.geometry.dispose();vial.mesh.material.dispose();}thrown.length=0;clearGhost();
 echo.age.value=100;ring.material.opacity=0;switchRoom(state.room,true);refreshUI();updateBindings();saveJourney();
 if(mode!=='new')message('Your journey continues. '+objective(state));
}
function showEnd(victory){
 $('end-screen').classList.remove('hidden');for(const id of ['ending-choice-screen','interaction','threat','audio-caption','breath-panel','purge-panel','memory-caption','listening-panel'])$(id).classList.add('hidden');
 const ending=ENDINGS[state.ending];$('end-eyebrow').textContent=victory?ending.eyebrow:'THE SONG GOES ON';$('end-title').textContent=victory?ending.title:'Your echo stays behind.';
 $('end-copy').textContent=victory?ending.text:'The Cantor found the sound you left. A glass decoy can change its path. Cover can break its sight. In the confessionals, silence is a choice you make one breath at a time.';
 $('end-last-line').textContent=victory?ending.lastLine:'The city will remember you. You can try again.';
 $('end-time').textContent=formatTime(state.survived);$('end-cards').textContent=state.cards.size+' / 3';$('end-pulses').textContent=String(state.pulses);$('checkpoint-btn').classList.toggle('hidden',victory||!checkpoint()&&!savedJourney());$('checkpoint-btn').querySelector('span').textContent=checkpoint()?'Retry from the ferry gate':'Continue from your last safe place';
}
function formatTime(t){const n=Math.floor(t);return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
function consumeEvents(){
 for(const e of state.events.splice(0)){
  audio.call('event',e,state);
  if(e.type==='toast')message(e.text);
  if(e.type==='room'){switchRoom(e.to,true);saveJourney(true);}
  if(e.type==='caught'){endStarted=performance.now();endTimer=setTimeout(()=>showEnd(false),950);}
  if(e.type==='win'){endStarted=performance.now();showEnd(true);try{localStorage.removeItem(CHECKPOINT_KEY);localStorage.removeItem(SAVE_KEY);}catch{}}
  if(e.type==='checkpoint'){try{localStorage.setItem(CHECKPOINT_KEY,JSON.stringify(e.checkpoint));}catch{}}
  if(e.type==='memory'){spawnMemory(e);saveJourney(true);}
  if(e.type==='ending-choice'){$('ending-choice-screen').classList.remove('hidden');held.clear();}
  if(e.type==='throw')spawnVial(e);
  if(e.type==='lockon')effects.triggerGlitch(state.time);
  if(e.type==='pulse'){
   setSonarOcclusion(state.room,state.pulse);const pad=navigator.getGamepads?.()[0];if(pad?.vibrationActuator&&!settings.reducedMotion)pad.vibrationActuator.playEffect('dual-rumble',{duration:160,weakMagnitude:.35,strongMagnitude:.2}).catch(()=>{});
  }
 }
}
function clearGhost(){if(!ghost)return;scene.remove(ghost.group);ghost.group.traverse(o=>{o.geometry?.dispose();});ghost.material.dispose();ghost=null;}
function spawnMemory(e){
 clearGhost();const group=new THREE.Group(),material=new THREE.LineBasicMaterial({color:'#b2d8ce',transparent:true,opacity:.65,blending:THREE.AdditiveBlending,depthWrite:false});
 const body=[[-.12,.05,0],[-.19,.6,0],[0,1.0,0],[.05,1.45,0]],right=[[.1,.05,0],[.26,.5,.05],[0,1,0]],arm=[[-.38,1.12,0],[0,1.35,0],[.3,1.15,.12],[.6,1.3,.15]];
 for(const points of [body,right,arm]){const curve=new THREE.CatmullRomCurve3(points.map(v=>new THREE.Vector3(...v)));group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(24)),material));}
 const head=new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(.135,10,7)),material);head.position.set(.06,1.6,0);group.add(head);
 for(let i=0;i<5;i++){const curve=new THREE.EllipseCurve(0,0,.32+i*.07,.32+i*.07,0,Math.PI*2);const points=curve.getPoints(40).map(v=>new THREE.Vector3(v.x,1.0+Math.sin(v.x*8)*.03,v.y));group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),material));}
 group.position.set(state.player.x+state.player.facing*1.1,0,.65);scene.add(group);ghost={group,material,time:state.time,room:state.room};
 $('memory-speaker').textContent=e.speaker;$('memory-line').textContent='“'+e.line+'”';$('memory-caption').classList.remove('hidden');
}
function updateMemory(){
 if(!ghost)return;const age=state.time-ghost.time;if(age>9||ghost.room!==state.room){clearGhost();$('memory-caption').classList.add('hidden');return;}
 ghost.material.opacity=Math.sin(Math.min(1,age/.8)*Math.PI/2)*Math.max(0,1-age/9)*.55;ghost.group.position.y=Math.sin(age*.7)*.025;ghost.group.rotation.y=Math.sin(age*.4)*.07;
}
function spawnVial(e){const mesh=new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,.16,8),new THREE.MeshStandardMaterial({color:'#b7c5b5',metalness:.3,roughness:.3}));mesh.position.set(e.from.x,1.1,e.from.z);scene.add(mesh);thrown.push({mesh,from:e.from,to:e.target,start:state.time,room:state.room});}
function updateThrown(){
 for(let i=thrown.length-1;i>=0;i--){const v=thrown[i],t=(state.time-v.start)/.55;if(t>1||v.room!==state.room){scene.remove(v.mesh);v.mesh.geometry.dispose();v.mesh.material.dispose();thrown.splice(i,1);continue;}
 v.mesh.position.set(THREE.MathUtils.lerp(v.from.x,v.to.x,t),1.1*(1-t)+Math.sin(t*Math.PI)*1.1,THREE.MathUtils.lerp(v.from.z,v.to.z,t));v.mesh.rotation.z=t*15;}
}
function refreshUI(){
 const p=state.player,c=context(state);$('stamina').style.width=p.stamina+'%';$('state-label').textContent=p.hidden?(p.holdingBreath?'Holding your breath':'Breathing slowly'):p.listening?'Listening to the city':p.sneaking?'Moving quietly':p.sprinting?'Your footsteps carry':'Walk softly.';
 document.querySelectorAll('#cards i').forEach(el=>el.classList.toggle('got',state.cards.has(el.dataset.key)));$('card-status').textContent=state.cards.size===3?'The ferry bell is waiting':state.cards.size+' of 3 voices recovered';
 const remaining=Math.max(0,state.nextPulse-state.time);$('pulse-ready').textContent=remaining>0?remaining.toFixed(1)+' s':'LANTERN';$('pulse-btn').classList.toggle('cooldown',remaining>0);
 $('bottle-count').textContent=state.bottles+' DECOY'+(state.bottles===1?'':'S');$('radio-count').textContent=state.radios+' WIND'+(state.radios===1?'':'S');
 const n=state.noise;$('resonance-fill').style.width=n+'%';$('resonance-fill').style.background=n>75?'#b5614b':n>40?'#c5a265':'#73aeb3';$('resonance-caption').textContent=n>75?'OVERLOAD · THE CITY HEARS':n>40?'RESONANCE IS BUILDING':'SOMETHING IS LISTENING';
 $('objective').textContent=objective(state);if(c&&state.playing&&!state.paused){$('interaction').classList.remove('hidden');$('interaction').querySelector('span').textContent=c.label;}else $('interaction').classList.add('hidden');
 const same=state.monster.room===state.room,mode=state.monster.mode,danger=same&&['hunt','lockon','search'].includes(mode)&&state.playing;
 $('threat').classList.toggle('hidden',!danger);$('threat').classList.toggle('hunt',mode==='hunt');$('threat').querySelector('span').textContent=p.hidden?(p.holdingBreath?'Stay still. Stay silent.':'Hold your breath if it comes close.'):mode==='lockon'?'The Cantor heard you':mode==='hunt'?'Break line of sight':'It is searching where you were';
 $('breath-panel').classList.toggle('hidden',!p.hidden||!state.playing);$('breath-panel').classList.toggle('critical',p.breath<25);$('breath-fill').style.width=p.breath+'%';$('breath-title').textContent=p.holdingBreath?'BREATH HELD':'RECOVERING BREATH';$('breath-hint').textContent=p.holdingBreath?(p.breath<25?'Release Ctrl / C before you gasp':'Release Ctrl / C to recover'):'Hold Ctrl / C when it comes close';
 $('purge-panel').classList.toggle('hidden',!state.extraction.started||!state.playing);$('purge-panel').classList.toggle('ready',state.extraction.ready);$('purge-time').textContent=state.extraction.ready?'RETURN TO THE BELL':Math.ceil(state.extraction.remaining)+' s';$('purge-fill').style.width=(1-state.extraction.remaining/24)*100+'%';
 $('difficulty-label').textContent=state.difficulty==='story'?'· STORY JOURNEY':'· THE RESTORER';$('listening-panel').classList.toggle('hidden',!p.listening||!state.playing||state.paused);$('listen-btn').classList.toggle('active',p.listening);const hint=listeningHint(state);if($('listening-hint').textContent!==hint)$('listening-hint').textContent=hint;
}
function keyboardInput(){return {x:(held.has('d')||held.has('arrowright')?1:0)-(held.has('a')||held.has('arrowleft')?1:0),z:(held.has('s')||held.has('arrowdown')?1:0)-(held.has('w')||held.has('arrowup')?1:0),sneak:held.has('control')||held.has('c'),sprint:held.has('shift'),listen:held.has(settings.bindings.listen)};}
function getInput(){
 const input=keyboardInput(),pad=navigator.getGamepads?.()[0];if(pad){if(Math.abs(pad.axes[0])>.18)input.x=pad.axes[0];if(Math.abs(pad.axes[1])>.18)input.z=pad.axes[1];input.listen=input.listen||pad.buttons[5]?.pressed;input.sneak=input.sneak||pad.buttons[4]?.pressed;input.sprint=input.sprint||pad.buttons[7]?.pressed;
 const actions={0:()=>interact(state),1:()=>throwBottle(state),2:()=>pulse(state),3:()=>radio(state),9:()=>pauseGame()};for(const [idx,action] of Object.entries(actions))if(pad.buttons[idx]?.pressed&&!gamepadLast[idx])action();gamepadLast=pad.buttons.map(b=>b.pressed);}return input;
}
function resize(){if(!renderer)return;const w=window.innerWidth,h=window.innerHeight;renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,lowQuality?1:1.5));renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();effects?.composer.setSize(w,h);}
function setQuality(){lowQuality=!lowQuality;settings.quality=lowQuality?'low':'high';if(renderer){renderer.shadowMap.enabled=!lowQuality;effects.quality(!lowQuality);resize();}$('quality-btn').textContent='GRAPHICS: '+(lowQuality?'LOW':'HIGH');saveSettings();}
function updateBindings(){
 document.querySelectorAll('[data-binding]').forEach(el=>el.textContent=keyLabel(settings.bindings[el.dataset.binding]));
 const list=$('binding-controls');list.replaceChildren();
 for(const [action,label] of Object.entries(ACTION_LABELS)){
  const button=document.createElement('button');button.className='binding-button'+(bindingAction===action?' armed':'');button.type='button';const text=document.createElement('span');text.textContent=label;const key=document.createElement('b');key.textContent=bindingAction===action?'PRESS KEY':keyLabel(settings.bindings[action]);button.append(text,key);button.addEventListener('click',()=>{bindingAction=action;held.clear();updateBindings();});list.append(button);
 }
 $('help-line').textContent='WASD MOVE · CTRL CROUCH / BREATH · SHIFT RUN · HOLD '+keyLabel(settings.bindings.listen)+' LISTEN · '+keyLabel(settings.bindings.interact)+' INTERACT';
 $('close-journal').textContent=keyLabel(settings.bindings.journal)+' / CLOSE JOURNAL';
}
function keydown(e){
 const k=e.key.toLowerCase();
 if(bindingAction){e.preventDefault();if(k==='escape'){bindingAction=null;updateBindings();return;}if(setBinding(settings.bindings,bindingAction,k)){bindingAction=null;saveSettings();updateBindings();}return;}
 if((e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement)&&!['escape','tab'].includes(k))return;
 if([' ','arrowup','arrowdown','arrowleft','arrowright','tab'].includes(k))e.preventDefault();
 if(!$('prologue-screen').classList.contains('hidden')){if(k==='enter'&&!e.repeat)startGame();if(k==='escape')$('prologue-screen').classList.add('hidden');return;}
 if(!$('pause-screen').classList.contains('hidden')&&settingsFromTitle){if(k==='escape')closeSettings();return;}
 if(k==='escape'){pauseGame();return;}if(k==='tab'){if(!e.repeat)toggleMap();return;}
 if(k===settings.bindings.journal){if(!e.repeat)toggleJournal();return;}if(e.repeat){held.add(k);return;}
 if(k===settings.bindings.pulse||k==='q'){pulse(state);return;}if(k===settings.bindings.interact){interact(state);return;}if(k===settings.bindings.throw){throwBottle(state);return;}if(k===settings.bindings.radio){radio(state);return;}
 if(k==='enter'&&(!state.playing||state.ended)){if(!$('title-screen').classList.contains('hidden'))openPrologue();else startGame();return;}held.add(k);
}
window.addEventListener('keydown',keydown);window.addEventListener('keyup',e=>held.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>{held.clear();if(state.playing&&!state.paused)pauseGame(true);});window.addEventListener('resize',resize);
$('start-btn').addEventListener('click',openPrologue);$('follow-voice-btn').addEventListener('click',()=>startGame());$('prologue-back-btn').addEventListener('click',()=>$('prologue-screen').classList.add('hidden'));
for(const id of ['restart-btn','restart-pause-btn'])$(id).addEventListener('click',()=>startGame());
$('checkpoint-btn').addEventListener('click',()=>startGame(checkpoint()?'checkpoint':'continue'));$('continue-title-btn').addEventListener('click',()=>startGame('continue'));
$('title-settings-btn').addEventListener('click',openSettings);$('resume-btn').addEventListener('click',closeSettings);$('pause-btn').addEventListener('click',()=>pauseGame());$('map-btn').addEventListener('click',()=>toggleMap());$('close-map').addEventListener('click',()=>toggleMap(false));$('journal-btn').addEventListener('click',()=>toggleJournal());$('close-journal').addEventListener('click',()=>toggleJournal(false));
$('pulse-btn').addEventListener('click',()=>pulse(state));$('throw-btn').addEventListener('click',()=>throwBottle(state));$('radio-btn').addEventListener('click',()=>radio(state));$('touch-interact').addEventListener('click',()=>interact(state));$('quality-btn').addEventListener('click',setQuality);$('sound-btn').addEventListener('click',()=>{$('sound-btn').textContent=sound.toggle()?'SOUND ON':'SOUND OFF';});
$('carry-ending-btn').addEventListener('click',()=>chooseEnding(state,'carry'));$('release-ending-btn').addEventListener('click',()=>chooseEnding(state,'release'));
for(const name of ['brightness','volume','music']){const input=$(name+'-setting');input.value=settings[name];$(name+'-value').textContent=Math.round(settings[name]*100)+'%';input.addEventListener('input',()=>{settings[name]=Number(input.value);$(name+'-value').textContent=Math.round(settings[name]*100)+'%';saveSettings();});}
for(const [id,key] of [['captions-setting','captions'],['motion-setting','reducedMotion']]){const input=$(id);input.checked=settings[key];input.addEventListener('change',()=>{settings[key]=input.checked;saveSettings();if(!settings.captions)$('audio-caption').classList.add('hidden');});}
$('difficulty-setting').value=settings.difficulty;$('difficulty-setting').addEventListener('change',()=>{settings.difficulty=$('difficulty-setting').value;saveSettings();});
$('reset-controls-btn').addEventListener('click',()=>{settings.bindings={...DEFAULT_BINDINGS};bindingAction=null;saveSettings();updateBindings();});
$('fullscreen-btn').classList.toggle('hidden',!document.fullscreenEnabled);$('fullscreen-btn').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('game').requestFullscreen();}catch(error){console.info('Fullscreen unavailable',error);}});
document.addEventListener('fullscreenchange',()=>{$('fullscreen-btn').textContent=document.fullscreenElement?'EXIT FULLSCREEN':'ENTER FULLSCREEN';});
updateBindings();$('quality-btn').textContent='GRAPHICS: '+(lowQuality?'LOW':'HIGH');
function holdButton(el,k){el.addEventListener('pointerdown',e=>{e.preventDefault();el.setPointerCapture(e.pointerId);held.add(k);});for(const ev of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(ev,()=>held.delete(k));}
document.querySelectorAll('[data-move]').forEach(el=>holdButton(el,({up:'w',down:'s',left:'a',right:'d'})[el.dataset.move]));holdButton($('touch-crouch'),'c');holdButton($('touch-sprint'),'shift');
$('listen-btn').addEventListener('pointerdown',e=>{e.preventDefault();$('listen-btn').setPointerCapture(e.pointerId);held.add(settings.bindings.listen);});for(const ev of ['pointerup','pointercancel','lostpointercapture'])$('listen-btn').addEventListener(ev,()=>held.delete(settings.bindings.listen));
function animate(now){
 const dt=Math.min(.05,(now-lastTime)/1000);lastTime=now;if(!ready)return;const input=getInput();if(state.playing)update(state,dt,input);consumeEvents();
 const title=!$('title-screen').classList.contains('hidden'),time=title?now/1000:state.time+(endStarted?Math.min(1.5,(now-endStarted)/1000):0);
 if(title){updateActor(hero,{x:2.1,z:.6,facing:1,action:'idle'},time,false,null,'intake');listener.visible=false;}
 else{updateActor(hero,state.player,time,state.player.moving&&state.playing,state.pulse,state.room,state.player.sneaking);listener.visible=state.monster.room===state.room;if(listener.visible)updateActor(listener,state.monster,time,state.monster.moving&&state.playing,state.pulse,state.room);}
 updateRoom(currentRoom,state,state.paused||state.ended?0:dt);updateThrown();updateMemory();if(state.time-lastAutosave>15)saveJourney();
 light.position.set(hero.position.x+.16,1.45,hero.position.z+.7);light.intensity=state.player.hidden?0:title?4.5:2.4;light.distance=title?5:4.2;
 const same=state.monster.room===state.room;enemyLight.position.set(state.monster.x,1.7,state.monster.z+.7);enemyLight.intensity=same&&state.playing?(state.monster.mode==='hunt'?.55:.06):0;
 const room=ROOMS[state.room],desired=title?-.9:state.player.x+state.player.facing*.75,z=state.player.hidden?9.4:state.player.listening?10.5:11.2,halfView=z*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect,max=Math.max(.2,room.width/2-halfView+.8),targetX=clamp(desired,-max,max);
 camera.position.x=THREE.MathUtils.lerp(camera.position.x,targetX,settings.reducedMotion?1:1-Math.exp(-dt*3));camera.position.z=THREE.MathUtils.lerp(camera.position.z,z,1-Math.exp(-dt*2));camera.position.y=THREE.MathUtils.lerp(camera.position.y,state.player.hidden?2.9:3.6,1-Math.exp(-dt*2));camera.lookAt(camera.position.x,1.8,-.5);camera.updateMatrixWorld();
 const age=state.pulse&&state.pulse.room===state.room?state.time-state.pulse.time:100;echo.age.value=age;echo.color.value.set(state.noise>75?'#c18561':state.noise>40?'#c2ab77':'#75b2bd');
 if(state.pulse){echo.origin.value.set(state.pulse.x,1,state.pulse.z);ring.position.set(state.pulse.x,.022,state.pulse.z);ring.scale.setScalar(Math.max(.01,age*6.8));ring.material.opacity=age>=0&&age<3?Math.pow(1-age/3,2)*.32:0;ring.material.color.copy(echo.color.value);}
 effects.update(state,now/1000,settings);audio.call('update',state);if(now-lastUI>100){refreshUI();lastUI=now;}if(now-lastScope>45){audio.call('drawScope',$('oscilloscope'),state.noise);lastScope=now;}effects.composer.render(dt);
}
async function boot(){
 try{
  renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:'high-performance',stencil:false});renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.setClearColor('#07121b');$('viewport').appendChild(renderer.domElement);
  scene=new THREE.Scene();scene.background=new THREE.Color('#07121b');scene.fog=new THREE.FogExp2('#10212c',.028);camera=new THREE.PerspectiveCamera(42,window.innerWidth/window.innerHeight,.1,70);camera.position.set(-.9,3.45,10.6);camera.lookAt(-.9,1.6,-.5);
  scene.add(new THREE.HemisphereLight('#96b9cd','#2b1820',.24));scene.add(new THREE.AmbientLight('#7d9dba',.055));const fill=new THREE.DirectionalLight('#afc6d8',.2);fill.position.set(-3,7,5);scene.add(fill);
  effects=createEffects(renderer,scene,camera);renderer.shadowMap.enabled=!lowQuality;effects.quality(!lowQuality);$('help-line').style.opacity='0';resize();
  [textures,actorArt]=await Promise.all([loadMaterials((n,total)=>{$('loading-status').textContent='Preparing materials · '+Math.round(n/total*100)+'%';}),loadActors()]);hero=createActor(actorArt.drifter,'drifter');listener=createActor(actorArt.listener,'listener');scene.add(hero,listener);
  light=new THREE.PointLight('#e5b46f',2.4,4.2,2);scene.add(light);enemyLight=new THREE.PointLight('#a24b3f',0,3,2);scene.add(enemyLight);ring=createSonarRing();scene.add(ring);switchRoom('intake',false);$('loading-status').textContent='Lighting the stage…';if(renderer.compileAsync)await renderer.compileAsync(scene,camera);
  ready=true;$('start-btn').disabled=false;$('loading-status').textContent='THE CURTAIN IS RAISED · ORIGINAL PLAYABLE PROLOGUE';$('continue-title-btn').classList.toggle('hidden',!checkpoint()&&!savedJourney());
  renderer.setAnimationLoop(animate);window.__ECHO__={version:'4.0.0',state:()=>state,renderInfo:()=>renderer.info,rooms:()=>rooms.size,audio:()=>({mode:sound.resonance?'resonance':'native',samples:sound.samples.size,pool:sound.spatialPool.length})};
 }catch(error){console.error(error);$('loading-status').textContent='Saint Orison could not load. Enable hardware acceleration and reload.';$('start-btn').querySelector('span').textContent='Raise the curtain again';$('start-btn').disabled=false;$('start-btn').onclick=()=>location.reload();}
}
boot();
