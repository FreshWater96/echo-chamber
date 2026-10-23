import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createGame,start,update,ROOMS,distance,interact,pulse,radio,chooseEnding} from '../src/logic.js';
import {findPath} from '../src/navigation.js';
// Replace browser-only DSP libraries at their boundary; execute the real
// Soundscape event/update code and its native oscillator scheduling below.
const dir=await mkdtemp(join(tmpdir(),'echo-audio-regression-'));after(()=>rm(dir,{recursive:true,force:true}));
const result=await build({entryPoints:['src/audio.js'],bundle:true,format:'esm',platform:'node',write:false,plugins:[{
 name:'test-dsp-boundary',setup(build){
  build.onResolve({filter:/^(tone|resonance-audio\/src\/resonance-audio.js)$/},args=>({path:args.path,namespace:'dsp-stub'}));
  build.onLoad({filter:/.*/,namespace:'dsp-stub'},args=>({contents:args.path==='tone'?`
   const parameter=()=>({value:0,rampTo(){}});
   export function setContext(){}
   export class FMOscillator {constructor(){this.modulationIndex=parameter();}chain(){}start(){}}
   export class Filter {constructor(){this.frequency=parameter();}}
   export class Gain {constructor(){this.gain=parameter();}connect(){}}
   export class Distortion {constructor(){this.distortion=0;}}
  `:'export default class ResonanceAudio {}',loader:'js'}));
 }
}]});
const file=join(dir,'audio.mjs');await writeFile(file,result.outputFiles[0].text);const {Soundscape}=await import(pathToFileURL(file));
function setup(){
 const scheduled=[];const param=()=>({value:0,setTargetAtTime(){},setValueAtTime(){},exponentialRampToValueAtTime(){}});
 const node=()=>({gain:param(),frequency:param(),connect(){},disconnect(){},start(){},stop(){}});
 const sound=new Soundscape();sound.ctx={currentTime:0,createGain:node,createOscillator(){const o=node();scheduled.push(o);return o;},listener:{positionX:param(),positionY:param(),positionZ:param(),forwardX:param(),forwardY:param(),forwardZ:param(),upY:param()}};
 sound.ctx.createBuffer=(channels,length,sampleRate)=>({duration:length/sampleRate,getChannelData:()=>new Float32Array(length)});sound.ctx.createBufferSource=()=>({...node(),playbackRate:param()});sound.ctx.createBiquadFilter=node;sound.ctx.createPanner=()=>({...node(),positionX:param(),positionY:param(),positionZ:param()});sound.noiseBuffer=sound.ctx.createBuffer(1,44100,44100);for(const name of ['step-wood','step-concrete','cloth','door','glass','metal-click','breath','listener-breath'])sound.samples.set(name,sound.noiseBuffer);
 sound.master=node();sound.hudBus=node();sound.worldBus=node();sound.musicBus=node();sound.wet=node();sound.room='intake';sound.nextClick=Infinity;
 const s=createGame();start(s);s.time=2;Object.assign(s.monster,{room:'intake',x:2,z:.5,awake:true});return {sound,s,scheduled};
}
test('native alert tones stay callable before and after the adaptive drone starts',()=>{
 const {sound}=setup();assert.equal(typeof sound.tone,'function');sound.makeDrone();assert.equal(typeof sound.tone,'function');
});
test('nearby heartbeat and lock-on, hunt and capture sounds do not interrupt the encounter',()=>{
 const {sound,s,scheduled}=setup();sound.makeDrone();
 assert.doesNotThrow(()=>sound.update(s));assert.equal(scheduled.length,2,'both heartbeat beats are scheduled');
 for(const type of ['lockon','hunt','caught'])assert.doesNotThrow(()=>sound.event({type},s),type);
 assert.equal(scheduled.length,5,'all three alert tones are scheduled');
});
test('movement keeps advancing through repeated close-range sound updates',()=>{
 const {sound,s}=setup();sound.makeDrone();s.monster.awake=false;s.player.z=-.3;
 const before=s.player.x;
 for(let i=0;i<80;i++){update(s,.05,{x:-1});sound.update(s);}
 assert.ok(s.player.x<before-5);assert.ok(s.time>5);assert.equal(s.ended,false);
});
test('an unexpected audio exception is isolated and movement continues without repeated errors',async()=>{
 const {createAudioGuard}=await import('../src/audio-guard.js');let errors=0,calls=0;
 const sound={enabled:true,master:{gain:{value:1}},update(){calls++;throw Error('playback failure');}};
 const audio=createAudioGuard(sound,()=>errors++);const s=createGame();start(s);const before=s.player.x;
 for(let i=0;i<60;i++){update(s,.05,{x:1});audio.call('update',s);}
 assert.ok(s.player.x>before+5);assert.equal(errors,1);assert.equal(calls,1);assert.equal(sound.master.gain.value,0);assert.equal(s.ended,false);
});

test('the complete Drowned Choir journey dispatches every encounter through enabled audio',()=>{
 const {sound}=setup();sound.makeDrone();const s=createGame();start(s);pulse(s);
 const dispatch=()=>{for(const e of s.events.splice(0))sound.event(e,s);sound.ctx.currentTime=s.time;sound.update(s);};
 const step=input=>{update(s,.05,input);dispatch();assert.equal(s.ended&&!s.won,false,'caught at '+s.time+' '+s.room);};
 const go=(goal,opts={})=>{for(const point of findPath(s.room,s.player,goal,.23)){let limit=500;while(distance(s.player,point)>.08&&limit-->0){const x=point.x-s.player.x,z=point.z-s.player.z,n=Math.hypot(x,z);step({x:x/n,z:z/n,...opts});}assert.ok(limit>0);}};
 const door=to=>{go(ROOMS[s.room].doors.find(d=>d.to===to));assert.ok(interact(s));dispatch();};
 dispatch();door('cryo');go(ROOMS.cryo.key);pulse(s);interact(s);dispatch();door('intake');door('gallery');go(ROOMS.gallery.doors.find(d=>d.to==='archive'));radio(s);interact(s);dispatch();go(ROOMS.archive.key);interact(s);dispatch();door('gallery');door('containment');go(ROOMS.containment.key,{sneak:true});interact(s);dispatch();door('airlock');go(ROOMS.airlock.exit);interact(s);dispatch();go({x:4.3,z:1.45},{sneak:true});for(let i=0;i<550&&!s.extraction.ready;i++)step({sneak:true});go(ROOMS.airlock.exit,{sneak:true});interact(s);dispatch();assert.ok(s.awaitingEnding);assert.ok(chooseEnding(s,'release'));dispatch();assert.ok(s.won);assert.ok(sound.enabled);assert.equal(s.cards.size,3);
});
