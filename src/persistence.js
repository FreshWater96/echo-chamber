import {createGame} from './logic.js';
import {ROOMS,clamp,roomBounds} from './facility.js';
import {blocked,findPath} from './navigation.js';
const VOICES=['cryo','archive','containment'];
export function snapshotGame(s){
 if(!s.playing||s.ended||s.awaitingEnding||s.player.hidden||s.extraction.started||s.monster.room===s.room&&['hunt','lockon'].includes(s.monster.mode))return null;
 return {version:1,difficulty:s.difficulty,time:s.time,room:s.room,cards:[...s.cards],visited:[...s.visited],bottles:s.bottles,radios:s.radios,pulses:s.pulses,noise:s.noise,cryoScanned:s.cryoScanned,archiveReleased:s.archiveReleased,
  player:{x:s.player.x,z:s.player.z,facing:s.player.facing,stamina:s.player.stamina},monster:{room:s.monster.room,x:s.monster.x,z:s.monster.z,facing:s.monster.facing,awake:s.monster.awake},checkpoint:s.checkpoint};
}
export function restoreGame(data){
 if(!data||data.version!==1||!ROOMS[data.room]||!Array.isArray(data.cards)||data.cards.length>3||data.cards.some(k=>!VOICES.includes(k))||new Set(data.cards).size!==data.cards.length)return null;
 if(!data.player||!Number.isFinite(data.player.x)||!Number.isFinite(data.player.z)||!Number.isFinite(data.time)||data.time<0)return null;
 const s=createGame({difficulty:data.difficulty}),b=roomBounds(data.room);s.room=data.room;s.time=clamp(data.time,0,36000);s.cards=new Set(data.cards);
 s.visited=new Set((Array.isArray(data.visited)?data.visited:[]).filter(id=>ROOMS[id]));s.visited.add(s.room);s.encounters=new Set(s.visited);
 s.player.x=clamp(data.player.x,b.minX,b.maxX);s.player.z=clamp(data.player.z,b.minZ,b.maxZ);s.player.facing=data.player.facing===-1?-1:1;
 if(blocked(s.room,s.player.x,s.player.z,.23)){
  const entry=ROOMS[s.room].doors[0],path=findPath(s.room,{x:entry.x,z:.3},s.player,.23),valid=path.at(-1);if(!valid)return null;Object.assign(s.player,valid);
 }
 s.player.stamina=clamp(Number.isFinite(data.player.stamina)?data.player.stamina:100,0,100);
 const integer=(n,f,max)=>Number.isFinite(n)?clamp(Math.floor(n),0,max):f;
 s.bottles=integer(data.bottles,4,6);s.radios=integer(data.radios,3,5);s.pulses=integer(data.pulses,0,9999);s.noise=clamp(Number.isFinite(data.noise)?data.noise:0,0,100);
 s.cryoScanned=!!data.cryoScanned||s.cards.has('cryo');s.archiveReleased=!!data.archiveReleased||s.cards.has('archive');s.tutorial.stage=5;
 if(data.monster&&ROOMS[data.monster.room]){
  const m=data.monster,mb=roomBounds(m.room,.25);s.monster.room=m.room;s.monster.x=clamp(Number.isFinite(m.x)?m.x:0,mb.minX,mb.maxX);s.monster.z=clamp(Number.isFinite(m.z)?m.z:.3,mb.minZ,mb.maxZ);s.monster.facing=m.facing===1?1:-1;
  if(blocked(m.room,s.monster.x,s.monster.z,.25)){const door=ROOMS[m.room].doors[0];s.monster.x=door.x;s.monster.z=.3;}
  s.monster.targetRoom=m.room;s.monster.target={x:s.monster.x,z:s.monster.z};s.monster.awake=!!m.awake||s.cards.size>0;
 }
 if(data.checkpoint?.cards?.length===3&&new Set(data.checkpoint.cards).size===3&&data.checkpoint.cards.every(k=>VOICES.includes(k)))s.checkpoint=data.checkpoint;
 return s;
}
