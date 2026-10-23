import test from 'node:test';
import assert from 'node:assert/strict';
import {ROOMS,createGame,start,route,interact,pulse,radio,throwBottle,update,context,noiseEvent,restoreCheckpoint,chooseEnding} from '../src/logic.js';
import {COLLIDERS} from '../src/facility.js';
import {blocked,findPath,clearPath,slideMove,lineOfSight,acousticPath} from '../src/navigation.js';
const tick=(s,seconds,input={})=>{for(let i=0;i<Math.ceil(seconds/.05);i++)update(s,.05,input);};
test('every doorway, keycard, locker and exit has a collision-free approach',()=>{
 for(const [id,r] of Object.entries(ROOMS)){
  assert.ok(route('intake',id).length,id);const from={x:r.doors[0].x,z:.3};
  for(const target of [...r.doors,...r.lockers,...(r.key?[r.key]:[]),...(r.exit?[r.exit]:[])]){
   const path=findPath(id,from,target,.23);assert.ok(path.length,id);let a=from;
   for(const b of path){assert.equal(blocked(id,b.x,b.z,.23),false,id);assert.ok(clearPath(id,a,b,.23),id);a=b;}
   assert.ok(Math.hypot(a.x-target.x,a.z-target.z)<1.4,id+' interaction unreachable');
  }
 }
});
test('furniture blocks movement and paths route around the operating table',()=>{
 const p={x:-2,z:-.2};slideMove('containment',p,4,0,.23);assert.ok(p.x<-1.3);
 const path=findPath('containment',{x:-4,z:0},{x:4,z:0});assert.ok(path.length>1);assert.ok(path.some(p=>p.z>.5||p.z<-1));
});
test('cover blocks sight and attenuates sound; doors attenuate and low-pass neighbouring rooms',()=>{
 const a={x:1,z:.6},b={x:4,z:.6};assert.equal(lineOfSight('archive',a,b,1.5),false);
 const covered=acousticPath('archive',a,'archive',b),open=acousticPath('archive',{x:1,z:1.7},'archive',{x:4,z:1.7});assert.ok(covered.gain<open.gain);assert.ok(covered.cutoff<open.cutoff);
 const door=acousticPath('archive',{x:0,z:-1},'gallery',{x:0,z:.4});assert.equal(door.hops,1);assert.ok(door.cutoff<3000);assert.ok(door.gain<.6);
});
test('Cryo requires sonar, Archive requires radio, and three authorizations begin a timed purge',()=>{
 const s=createGame();start(s);s.room='airlock';Object.assign(s.player,ROOMS.airlock.exit);assert.equal(interact(s),false);
 s.room='cryo';Object.assign(s.player,{x:-6.1,z:.1});assert.equal(context(s).type,'card');assert.equal(interact(s),false);pulse(s);assert.ok(s.cryoScanned);assert.equal(interact(s),true);
 s.room='archive';Object.assign(s.player,{x:6.1,z:.2});assert.equal(interact(s),false);assert.ok(radio(s));assert.ok(interact(s));
 s.room='containment';Object.assign(s.player,{x:6.3,z:.2});assert.ok(interact(s));assert.equal(s.cards.size,3);assert.ok(s.checkpoint);
 s.room='airlock';Object.assign(s.player,ROOMS.airlock.exit);assert.ok(interact(s));assert.equal(s.won,false);assert.equal(s.extraction.started,true);assert.equal(interact(s),false);
 // Isolate the pressure gate from a separately tested pursuer.
 s.monster.awake=false;s.monster.room='cryo';tick(s,24.1);assert.ok(s.extraction.ready);assert.ok(interact(s));assert.ok(s.awaitingEnding);assert.ok(chooseEnding(s,'release'));assert.equal(s.won,true);
});
test('first pulse teaches safely; subsequent audible sonar creates a remembered source',()=>{
 const s=createGame();start(s);pulse(s);assert.equal(s.noise,31);assert.equal(s.monster.awake,false);assert.equal(pulse(s),false);
 tick(s,4.3);s.monster.room='intake';s.monster.x=7;s.monster.z=.3;pulse(s);assert.ok(s.monster.awake);assert.equal(s.monster.targetRoom,'intake');assert.equal(s.monster.target.x,-1.3);assert.equal(s.pulses,2);
});
test('distractions consume inventory and the radio redirects investigation through the room graph',()=>{
 const s=createGame();start(s);assert.ok(radio(s));assert.equal(s.monster.targetRoom,'archive');assert.equal(s.radios,2);throwBottle(s);assert.equal(s.bottles,3);tick(s,.7);assert.ok(s.events.some(e=>e.type==='glass'));
});
test('last known position remains fixed when the player silently moves behind cover',()=>{
 const s=createGame();start(s);s.room='archive';Object.assign(s.monster,{room:'archive',x:.8,z:.6,facing:1,awake:true});Object.assign(s.player,{x:4.2,z:.6,sneaking:true});
 noiseEvent(s,{kind:'glass',room:'archive',x:5,z:.6,volume:2,reach:0});const target={...s.monster.target};
 tick(s,.45,{x:1,sneak:true});assert.equal(s.monster.seen,false);assert.deepEqual(s.monster.target,target);assert.equal(s.ended,false);
});
test('the pursuer navigates around solid cover and visits an adjacent room through its doorway',()=>{
 const s=createGame();start(s);s.room='cryo';s.player.hidden=true;Object.assign(s.monster,{room:'containment',x:-4,z:0,facing:1,awake:true});
 noiseEvent(s,{kind:'glass',room:'containment',x:4,z:0,volume:4,reach:0});
 for(let i=0;i<140;i++){update(s,.05);assert.equal(blocked(s.monster.room,s.monster.x,s.monster.z,.25),false);}
 assert.ok(s.monster.x>1.5);
 noiseEvent(s,{kind:'radio',room:'airlock',x:-5,z:.4,volume:20,reach:5});tick(s,14);assert.equal(s.monster.room,'airlock');
});
test('lockers never force an exit; breath has a visible recovery and exhaustion cycle',()=>{
 const s=createGame();start(s);Object.assign(s.player,ROOMS.intake.lockers[0]);assert.ok(interact(s));tick(s,10);assert.equal(s.player.hidden,true);assert.equal(s.player.breath,100);
 tick(s,4,{sneak:true});assert.ok(s.player.breath<35);const low=s.player.breath;tick(s,2);assert.ok(s.player.breath>low);tick(s,5,{sneak:true});assert.ok(s.events.some(e=>e.type==='gasp'));assert.equal(s.player.hidden,true);interact(s);assert.equal(s.player.hidden,false);
});
test('a witnessed locker entry is denied while an unseen entry preserves the search memory',()=>{
 const s=createGame();start(s);Object.assign(s.player,ROOMS.intake.lockers[0]);Object.assign(s.monster,{room:'intake',x:-3.7,z:-.7,facing:-1,awake:true});tick(s,.05);assert.equal(s.monster.mode,'lockon');assert.equal(interact(s),false);
 s.monster.seen=false;s.monster.x=3;assert.ok(interact(s));assert.equal(s.player.hidden,true);assert.ok(['lockon','hunt'].includes(s.monster.mode));
});
test('airlock checkpoint restores cards, supplies and an unstarted final encounter',()=>{
 const s=restoreCheckpoint({cards:['cryo','archive','containment'],bottles:0,radios:0,time:83,pulses:6});assert.equal(s.room,'airlock');assert.equal(s.cards.size,3);assert.ok(s.bottles>=2);assert.ok(s.radios>=1);assert.equal(s.extraction.started,false);assert.equal(s.player.hidden,false);assert.equal(s.time,83);
 assert.equal(restoreCheckpoint({cards:['bad','bad','bad']}).cards.size,0);
});
test('pausing freezes gameplay, sonar recharge, breathing and extraction',()=>{
 const s=createGame();start(s);pulse(s);s.extraction.started=true;s.paused=true;const time=s.time,pressure=s.extraction.remaining;tick(s,3,{x:1});assert.equal(s.time,time);assert.equal(s.extraction.remaining,pressure);
});
test('a complete authored escape works using movement, doors, sonar, radio and the pressure gate',()=>{
 const s=createGame();start(s);pulse(s);
 const step=input=>{update(s,.05,input);assert.equal(s.ended&&!s.won,false,'caught in '+s.room+' at '+s.time);s.events.length=0;};
 const go=(goal,opts={})=>{
  for(const target of findPath(s.room,s.player,goal,.23)){
   let limit=500;while(Math.hypot(target.x-s.player.x,target.z-s.player.z)>.08&&limit-->0){const dx=target.x-s.player.x,dz=target.z-s.player.z,n=Math.hypot(dx,dz);step({x:dx/n,z:dz/n,...opts});}
   assert.ok(limit>0,'movement stuck in '+s.room);
  }
 };
 const door=to=>{go(ROOMS[s.room].doors.find(d=>d.to===to));assert.ok(interact(s));};
 door('cryo');go(ROOMS.cryo.key);assert.ok(pulse(s));assert.ok(interact(s));door('intake');door('gallery');
 go(ROOMS.gallery.doors.find(d=>d.to==='archive'));assert.ok(radio(s));assert.ok(interact(s));go(ROOMS.archive.key);assert.ok(interact(s));door('gallery');door('containment');
 go(ROOMS.containment.key,{sneak:true});assert.ok(interact(s));door('airlock');go(ROOMS.airlock.exit);assert.ok(interact(s));assert.equal(s.won,false);
 go({x:4.3,z:1.45},{sneak:true});for(let i=0;i<550&&!s.extraction.ready;i++)step({sneak:true});assert.ok(s.extraction.ready);go(ROOMS.airlock.exit,{sneak:true});assert.ok(interact(s));assert.ok(s.awaitingEnding);assert.ok(chooseEnding(s,'carry'));assert.ok(s.won);assert.equal(s.cards.size,3);
});
