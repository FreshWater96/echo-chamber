import ResonanceAudio from 'resonance-audio/src/resonance-audio.js';
import {setContext,FMOscillator,Filter,Gain,Distortion} from 'tone';
import {ZZFX} from './vendor/zzfx.js';
import {ROOMS,RADIO,clamp,route,distance} from './facility.js';
import {acousticPath} from './navigation.js';
const FILES=['step-concrete','step-wood','cloth','door','glass','metal-click','breath','listener-breath'];
const PRESETS={ping:[.5,0,175,.01,.07,.8,0,1,-.12,0,0,0,0,.02,0,0,.18,.6,.02],card:[.25,0,740,.003,.04,.15,0,1,0,0,360,.055],locked:[.25,0,125,.01,.04,.19,3,1.2,-.04],click:[.2,.1,390,.002,.01,.12,2,1,-.4,0,0,0,0,.12]};
export class Soundscape{
 constructor(){this.ctx=null;this.resonanceReady=false;this.active=new Set();this.nextDread=0;this.nextMotif=0;this.enabled=true;this.master=null;this.samples=new Map();this.breathSource=null;this.sources=new Map();this.spatial=new Set();this.spatialPool=[];this.nextClick=0;this.nextHeart=0;this.nextBreath=0;this.nextRadio=0;this.room=null;this.volume=.7;this.music=.35;this.caption=null;this.paused=false;this.droneRig=null;this.presetBuffers=new Map();}
 async init(){
  if(this.ctx){await this.ctx.resume();return;}
  const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
  this.ctx=new C();await this.ctx.resume();
  this.master=this.ctx.createGain();this.master.gain.value=this.enabled?this.volume*.62:0;
  this.compressor=this.ctx.createDynamicsCompressor();this.compressor.threshold.value=-15;this.compressor.ratio.value=5;this.master.connect(this.compressor);
  this.analyser=this.ctx.createAnalyser();this.analyser.fftSize=512;this.compressor.connect(this.analyser);this.analyser.connect(this.ctx.destination);this.wave=new Uint8Array(this.analyser.fftSize);
  this.hudBus=this.ctx.createGain();this.hudBus.connect(this.master);this.worldBus=this.ctx.createGain();this.worldBus.connect(this.master);this.musicBus=this.ctx.createGain();this.musicBus.gain.value=this.music;this.musicBus.connect(this.master);
  const impulse=this.ctx.createBuffer(2,this.ctx.sampleRate*3,this.ctx.sampleRate);
  for(let c=0;c<2;c++){const a=impulse.getChannelData(c);for(let i=0;i<a.length;i++)a[i]=(Math.random()*2-1)*Math.exp(-i/this.ctx.sampleRate*3.3);}
  this.reverb=this.ctx.createConvolver();this.reverb.buffer=impulse;this.wet=this.ctx.createGain();this.wet.gain.value=.18;this.reverb.connect(this.wet);this.wet.connect(this.worldBus);
  try{
   this.resonance=new ResonanceAudio(this.ctx,{ambisonicOrder:1});this.resonance.output.connect(this.worldBus);
   this.resonance._listener.initialized.then(()=>{this.resonanceReady=true;}).catch(error=>{console.info('Using native HRTF after decoder failure.',error);this.resonance?.output.disconnect();this.resonance=null;this.resonanceReady=false;});
  }catch(error){console.info('Using native HRTF acoustics.',error?.message);this.resonance=null;}
  this.noiseBuffer=this.ctx.createBuffer(1,this.ctx.sampleRate*2,this.ctx.sampleRate);let previous=0;const data=this.noiseBuffer.getChannelData(0);
  for(let i=0;i<data.length;i++){previous=(previous+.04*(Math.random()*2-1))/1.04;data[i]=previous*3;}
  const rain=this.ctx.createBufferSource();rain.buffer=this.noiseBuffer;rain.loop=true;const rainFilter=this.ctx.createBiquadFilter();rainFilter.type='lowpass';rainFilter.frequency.value=1500;this.rainGain=this.ctx.createGain();this.rainGain.gain.value=.012;rain.connect(rainFilter);rainFilter.connect(this.rainGain);this.rainGain.connect(this.worldBus);rain.start();
  this.makeDrone();this.loading=Promise.allSettled(FILES.map(async name=>{const response=await fetch('./assets/audio/'+name+'.ogg');if(!response.ok)throw Error(name);const buffer=await this.ctx.decodeAudioData(await response.arrayBuffer());this.samples.set(name,buffer);}));
 }
 makeDrone(){
  try{
   setContext(this.ctx);const drone=new FMOscillator({frequency:46,type:'sine',modulationType:'sine',harmonicity:.501,modulationIndex:.08});
   const filter=new Filter({frequency:140,type:'lowpass',rolloff:-24}),distortion=new Distortion(.04),gain=new Gain(.018);
   drone.chain(distortion,filter,gain);gain.connect(this.musicBus);drone.start();this.droneRig={drone,filter,distortion,gain};
  }catch(error){console.info('Using native dread drone.',error?.message);const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.frequency.value=46;g.gain.value=.018;o.connect(g);g.connect(this.musicBus);o.start();this.nativeDrone={o,g};}
 }
 reset(){for(const source of this.active){try{source.stop();}catch{}}this.active.clear();this.nextDread=0;this.nextMotif=0;this.nextClick=0;this.nextHeart=0;this.nextBreath=0;this.nextRadio=0;for(const source of this.sources.values()){try{source.stop();}catch{}}this.sources.clear();}
 settings({volume=this.volume,music=this.music}={}){this.volume=clamp(volume,0,1);this.music=clamp(music,0,1);if(this.master){this.master.gain.setTargetAtTime(this.enabled?this.volume*.62:0,this.ctx.currentTime,.08);this.musicBus.gain.setTargetAtTime(this.music,this.ctx.currentTime,.1);}}
 toggle(){this.enabled=!this.enabled;this.settings();return this.enabled;}
 describe(text){this.caption?.(text);}
 setRoom(id){
  if(this.room===id||!this.worldBus)return;this.room=id;const r=ROOMS[id];this.wet.gain.setTargetAtTime(r.reverb*.11,this.ctx.currentTime,.15);
  const floor=r.surface==='wood'?'parquet-on-concrete':r.surface==='metal'?'metal':'polished-concrete-or-tile';
  const materials={left:id==='archive'?'curtain-heavy':'concrete-block-painted',right:'concrete-block-painted',front:id==='gallery'?'glass-thick':'plaster-smooth',back:id==='archive'?'wood-panel':'concrete-block-coarse',down:floor,up:'acoustic-ceiling-tiles'};
  try{this.resonance?.setRoomProperties({width:r.width,height:5.4,depth:6},materials);}catch{this.resonance=null;}
 }
 sourcePosition(room,position,s){
  if(room===s.room)return {x:position.x,y:position.y??1,z:position.z};
  const path=route(s.room,room),door=ROOMS[s.room].doors.find(d=>d.to===path[1]);return {x:door?.x??0,y:1.5,z:door?.z??-1};
 }
 playBuffer(buffer,{volume=.2,rate=1,room,position,cutoff=6500,delay=0,spatial=true,duration}={},s){
  if(!this.ctx||!this.enabled||!buffer)return;
  const source=this.ctx.createBufferSource();source.buffer=buffer;source.playbackRate.value=rate;const t=this.ctx.currentTime+delay;
  const filter=this.ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=cutoff;const gain=this.ctx.createGain();gain.gain.value=volume;
  source.connect(filter);filter.connect(gain);
  const worldPosition=position?{...position}:s?{...s.player}:null,sourceRoom=room||s?.room;
  let disconnect;
  if(spatial&&s&&worldPosition){
   const a=acousticPath(sourceRoom,worldPosition,s.room,s.player),pos=this.sourcePosition(sourceRoom,worldPosition,s);gain.gain.value*=a.gain;filter.frequency.value=Math.min(cutoff,a.cutoff);
   if(this.resonanceReady&&this.resonance){
    let slot=this.spatialPool.find(x=>!x.busy);if(!slot){const node=this.resonance.createSource();node.setMinDistance(1);node.setMaxDistance(40);node.setRolloff('none');slot={node,busy:false};this.spatialPool.push(slot);}
    slot.busy=true;const r=slot.node;r.setPosition(pos.x,pos.y,pos.z);gain.connect(r.input);
    const entry={node:r,source,room:sourceRoom,position:worldPosition,filter,gain,baseVolume:volume,cutoff};this.spatial.add(entry);
    disconnect=()=>{this.spatial.delete(entry);gain.disconnect();slot.busy=false;};
   }else{
    const p=this.ctx.createPanner();p.panningModel='HRTF';p.distanceModel='inverse';p.refDistance=1;p.maxDistance=40;p.rolloffFactor=0;p.positionX.value=pos.x;p.positionY.value=pos.y;p.positionZ.value=pos.z;gain.connect(p);p.connect(this.worldBus);gain.connect(this.reverb);disconnect=()=>{gain.disconnect();p.disconnect();};
   }
  }else{gain.connect(this.hudBus);disconnect=()=>gain.disconnect();}
  source.onended=()=>{this.active.delete(source);source.disconnect();filter.disconnect();disconnect?.();};this.active.add(source);source.start(t);if(duration)source.stop(t+duration);return source;
 }
 sample(name,options,s){
  const buffer=this.samples.get(name);if(buffer)return this.playBuffer(buffer,options,s);
  if(name==='door'||name==='glass'||name.includes('step')||name==='cloth')this.noise(name==='door'?.4:.13,options?.volume||.08,options,s);
 }
 synth(name,options,s){
  let buffer=this.presetBuffers.get(name);if(!buffer){const a=ZZFX.buildSamples(...PRESETS[name]);buffer=this.ctx.createBuffer(1,a.length,ZZFX.sampleRate);buffer.getChannelData(0).set(a);this.presetBuffers.set(name,buffer);}return this.playBuffer(buffer,options,s);
 }
 noise(duration=.2,volume=.1,options={},s){this.playBuffer(this.noiseBuffer,{...options,volume,duration,rate:options.rate||1},s);}
 tone(frequency,duration,volume=.1,options={}){
  if(!this.ctx)return;const o=this.ctx.createOscillator(),g=this.ctx.createGain(),t=this.ctx.currentTime+(options.delay||0);o.type=options.type||'sine';o.frequency.setValueAtTime(frequency,t);o.frequency.exponentialRampToValueAtTime(Math.max(20,frequency*.7),t+duration);g.gain.setValueAtTime(.001,t);g.gain.exponentialRampToValueAtTime(volume,t+.01);g.gain.exponentialRampToValueAtTime(.001,t+duration);o.connect(g);g.connect(this.hudBus);o.start(t);o.stop(t+duration+.02);o.onended=()=>{o.disconnect();g.disconnect();};
 }
 musicTone(frequency,duration,volume=.04,delay=0){
  if(!this.ctx||!this.enabled)return;const o=this.ctx.createOscillator(),g=this.ctx.createGain(),t=this.ctx.currentTime+delay;o.type='sine';o.frequency.value=frequency;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(volume,t+.12);g.gain.exponentialRampToValueAtTime(.0001,t+duration);o.connect(g);g.connect(this.musicBus);this.active.add(o);o.onended=()=>{this.active.delete(o);o.disconnect();g.disconnect();};o.start(t);o.stop(t+duration+.04);
 }
 event(e,s){
  if(!this.master)return;const at={room:e.room||s.room,position:{x:e.x??s.player.x,z:e.z??s.player.z},spatial:true};
  if(e.type==='pulse'){this.synth('ping',{...at,volume:.55},s);this.sample('metal-click',{volume:.04,spatial:false},s);this.describe('[The echo-lantern sounds through the stone]');}
  else if(e.type==='footstep'){
   this.sample(e.surface==='wood'?'step-wood':'step-concrete',{...at,volume:e.sneaking?.07:e.sprinting?.4:.24,rate:e.sneaking?.85:1+Math.random()*.08},s);
   if(e.surface==='glass'&&!e.sneaking){this.sample('glass',{...at,volume:.22,rate:1.3},s);this.describe('[Glass crunches underfoot]');}
   this.sample('cloth',{volume:e.sneaking?.018:.035,spatial:false,rate:1.15},s);
  }
  else if(e.type==='card'){this.synth('card',{volume:.22,spatial:false},s);this.sample('metal-click',{volume:.15,spatial:false},s);}
  else if(e.type==='room'){this.setRoom(e.to);this.sample('door',{volume:.24,spatial:false,rate:.8},s);this.sample('metal-click',{volume:.1,delay:.2,spatial:false},s);this.describe('[A heavy door creaks shut]');}
  else if(e.type==='throw')this.sample('cloth',{volume:.16,spatial:false,rate:1.4},s);
  else if(e.type==='glass'){this.sample('glass',{...at,volume:.65,rate:.9},s);this.noise(.28,.14,{...at,cutoff:6500,delay:.04},s);this.describe('[Glass breaks '+(e.x<s.player.x?'to the left':'to the right')+']');}
  else if(e.type==='radio'){this.noise(.45,.32,{room:'archive',position:RADIO,cutoff:1000},s);this.describe('[Gramophone singing · The Wax Archive]');}
  else if(e.type==='lockon'){this.tone(57,.8,.13);this.sample('listener-breath',{room:s.monster.room,position:s.monster,volume:.6,rate:1.1,duration:1.2},s);this.describe('[The Cantor draws a sharp breath]');}
  else if(e.type==='hunt'){this.tone(79,.5,.08,{type:'sawtooth'});}
  else if(e.type==='hide'){this.sample('cloth',{volume:.12,spatial:false,rate:.8},s);this.sample('metal-click',{volume:.12,spatial:false},s);}
  else if(e.type==='breath'||e.type==='gasp'){this.breathSource=this.sample('breath',{volume:e.type==='gasp'?.32:e.strained?.17:.08,spatial:false,rate:e.type==='gasp'?1.2:.86,duration:1.7},s);}
  else if(e.type==='caught'){this.sample('listener-breath',{volume:.7,spatial:false,rate:.8},s);this.tone(42,1.4,.18,{type:'sawtooth'});this.describe('[Your voice joins the song]');}
  else if(e.type==='locked')this.synth('locked',{volume:.25,spatial:false},s);
  else if(e.type==='memory'){const notes=e.id==='cryo'?[329.63,293.66,220]:e.id==='archive'?[261.63,246.94,196]:[220,164.81,146.83];notes.forEach((f,i)=>this.musicTone(f,1.6,.07,i*.42));}
  else if(e.type==='purge'||e.type==='pressure'){this.musicTone(73.42,3.2,.08);this.musicTone(220,2.4,.04,.05);this.noise(1.3,.13,{room:'airlock',position:{x:5.7,z:-.5},cutoff:1400},s);this.describe('[The ferry bell rings across the water]');}
  else if(e.type==='purge-ready'||e.type==='win'){this.synth('card',{volume:.2,spatial:false},s);this.describe('[The final bell falls silent]');if(e.type==='win'){if(this.droneRig){this.droneRig.gain.gain.rampTo(.007,.6);this.droneRig.distortion.distortion=.01;}const ending=e.ending==='release'?[220,293.66,329.63,440]:[220,246.94,293.66,196];ending.forEach((f,i)=>this.musicTone(f,2.8,.06,i*.7));}}
 }
 update(s){
  if(!this.worldBus)return;this.hudBus.gain.setTargetAtTime(s.paused?0:1,this.ctx.currentTime,.03);const suspended=s.paused||!s.playing;this.worldBus.gain.setTargetAtTime(suspended?0:1,this.ctx.currentTime,.06);this.musicBus.gain.setTargetAtTime(s.paused?0:s.won?this.music*.7:suspended?0:this.music*(s.player.listening?.18:1),this.ctx.currentTime,.12);if(suspended)return;
  this.setRoom(s.room);const p=s.player;if(this.rainGain)this.rainGain.gain.setTargetAtTime(p.listening?.003:.012,this.ctx.currentTime,.2);if(p.holdingBreath&&this.breathSource){try{this.breathSource.stop();}catch{}this.breathSource=null;}this.resonance?.setListenerPosition(p.x,1.6,p.z);this.resonance?.setListenerOrientation(0,0,-1,0,1,0);
  const l=this.ctx.listener;if(l.positionX){l.positionX.value=p.x;l.positionY.value=1.6;l.positionZ.value=p.z;l.forwardX.value=0;l.forwardY.value=0;l.forwardZ.value=-1;l.upY.value=1;}else{l.setPosition(p.x,1.6,p.z);l.setOrientation(0,0,-1,0,1,0);}
  for(const item of this.spatial){const pos=this.sourcePosition(item.room,item.position,s),a=acousticPath(item.room,item.position,s.room,p);item.node.setPosition(pos.x,pos.y,pos.z);item.gain.gain.setTargetAtTime(item.baseVolume*a.gain,this.ctx.currentTime,.03);item.filter.frequency.setTargetAtTime(Math.min(item.cutoff,a.cutoff),this.ctx.currentTime,.04);}
  const acoustic=acousticPath(s.monster.room,s.monster,s.room,p),same=s.monster.room===s.room,d=same?distance(p,s.monster):acoustic.distance+8;
  const dread=clamp((same?1-d/11:.12)+(['hunt','lockon'].includes(s.monster.mode)?.38:0)+(s.extraction.started&&!s.extraction.ready?.22:0),0,1);
  if(this.droneRig&&s.time>this.nextDread){this.nextDread=s.time+.12;this.droneRig.drone.modulationIndex.rampTo(.08+dread*8,.15);this.droneRig.filter.frequency.rampTo(110+dread*420,.2);this.droneRig.distortion.distortion=.03+dread*.3;this.droneRig.gain.gain.rampTo(.013+dread*.025,.2);}
  if(dread<.45&&s.time>this.nextMotif){this.nextMotif=s.time+19;[220,261.63,246.94,196,220,164.81,146.83].forEach((f,i)=>this.musicTone(f,2.6,.026,i*.82));}
  if(s.monster.awake&&s.time>this.nextClick){
   this.nextClick=s.time+(s.monster.mode==='hunt'?1.3:3.5+Math.random()*1.5);
   if(acoustic.gain>.025){this.sample('listener-breath',{room:s.monster.room,position:s.monster,volume:p.listening?.8:.5,rate:s.monster.mode==='hunt'?1.25:.75,duration:2.8},s);this.synth('click',{room:s.monster.room,position:s.monster,volume:.22,delay:.2},s);this.describe('[Ragged breathing '+(same?(s.monster.x<p.x?'to the left':'to the right'):'beyond a door')+']');}
  }
  if(s.time<s.radioUntil&&s.time>this.nextRadio){this.nextRadio=s.time+.7;this.noise(.3,.32,{room:'archive',position:RADIO,cutoff:900},s);this.synth('click',{room:'archive',position:RADIO,volume:.09,rate:.7},s);}
  if(same&&d<6&&s.time>this.nextHeart){this.nextHeart=s.time+Math.max(.5,d*.17);this.tone(53,.12,.07*(1-d/9));this.tone(44,.13,.045*(1-d/9),{delay:.17});}
  if(p.sprinting&&p.stamina<45&&s.time>this.nextBreath){this.nextBreath=s.time+3.2;this.sample('breath',{volume:.12,spatial:false,rate:1.05},s);}
 }
 drawScope(canvas,noise=0){
  if(!canvas)return;const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);ctx.fillStyle='#07100f';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#24423b';ctx.lineWidth=.5;
  for(let x=0;x<w;x+=w/12){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}for(let y=0;y<h;y+=h/4){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
  ctx.strokeStyle=noise>75?'#d68b6b':noise>40?'#c4ad71':'#86b9ad';ctx.lineWidth=1.3;ctx.shadowColor=ctx.strokeStyle;ctx.shadowBlur=4;ctx.beginPath();if(this.analyser)this.analyser.getByteTimeDomainData(this.wave);
  for(let x=0;x<w;x++){const a=this.wave?(this.wave[Math.floor(x/w*this.wave.length)]-128)/128:0,y=h*.5-a*h*.44;if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();ctx.shadowBlur=0;
 }
}
