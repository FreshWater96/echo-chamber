import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,start,update,pulse,interact,chooseEnding,listeningHint} from '../src/logic.js';
import {snapshotGame,restoreGame} from '../src/persistence.js';
import {sanitizeSettings,setBinding,DEFAULT_BINDINGS} from '../src/preferences.js';
import {journalEntries,ENDINGS} from '../src/story.js';
const tick=(s,seconds,input={})=>{for(let i=0;i<Math.ceil(seconds/.05);i++)update(s,.05,input);};
test('saved journeys survive JSON roundtrip with progression, resources, location and difficulty',()=>{
 const s=createGame({difficulty:'story'});start(s);s.room='archive';s.visited.add('archive');s.cards.add('cryo');s.player.x=4;s.player.z=1.5;s.bottles=2;s.radios=1;s.cryoScanned=true;s.archiveReleased=true;s.time=73;
 const data=snapshotGame(s),restored=restoreGame(JSON.parse(JSON.stringify(data)));assert.ok(restored);assert.equal(restored.room,'archive');assert.equal(restored.difficulty,'story');assert.deepEqual([...restored.cards],['cryo']);assert.equal(restored.player.x,4);assert.equal(restored.bottles,2);assert.equal(restored.radios,1);assert.equal(restored.time,73);assert.ok(restored.archiveReleased);assert.equal(restored.playing,false);
});
test('capture, hunting, hiding and final refrain never overwrite a safe autosave',()=>{
 const s=createGame();start(s);assert.ok(snapshotGame(s));s.monster.room=s.room;s.monster.mode='hunt';assert.equal(snapshotGame(s),null);s.monster.mode='roam';s.player.hidden=true;assert.equal(snapshotGame(s),null);s.player.hidden=false;s.extraction.started=true;assert.equal(snapshotGame(s),null);s.extraction.started=false;s.ended=true;assert.equal(snapshotGame(s),null);
});
test('invalid and old saved data is rejected and restored positions avoid furniture',()=>{
 for(const bad of [null,{},[],{version:0},{version:1,room:'missing',cards:[]},{version:1,room:'intake',cards:['bad'],player:{x:0,z:0},time:1}])assert.equal(restoreGame(bad),null);
 const s=createGame();start(s);const data=snapshotGame(s);data.room='containment';data.player={x:0,z:-.2};const restored=restoreGame(data);assert.ok(restored);assert.ok(Math.abs(restored.player.x)>1.3||restored.player.z>.5||restored.player.z<-.9);
});
test('listening is quiet, slows movement and gives a useful directional cue',()=>{
 const s=createGame();start(s);s.monster.room='intake';s.monster.x=5;s.monster.awake=true;s.monster.facing=1;s.player.z=-.3;
 tick(s,1,{x:1,listen:true});assert.ok(s.player.listening);assert.ok(s.player.sneaking);assert.ok(s.player.x<0);assert.match(listeningHint(s),/right/);assert.equal(s.noise,0);assert.equal(s.pulses,0);assert.equal(s.ended,false);
});
test('each lost voice opens its journal chapter and the finale offers two deliberate endings',()=>{
 const s=createGame();assert.equal(journalEntries(s).filter(e=>e.found).length,0);s.cards.add('cryo');assert.equal(journalEntries(s).filter(e=>e.found).length,1);assert.equal(chooseEnding(s,'carry'),false);
 for(const ending of ['carry','release']){const s=createGame();start(s);s.cards=new Set(['cryo','archive','containment']);s.room='airlock';Object.assign(s.player,{x:5.7,z:-.55});s.extraction.started=true;s.extraction.ready=true;assert.ok(interact(s));assert.ok(s.awaitingEnding);assert.equal(s.won,false);const time=s.time;tick(s,1,{x:1});assert.equal(s.time,time);assert.equal(chooseEnding(s,'invalid'),false);assert.ok(chooseEnding(s,ending));assert.ok(s.won);assert.equal(s.ending,ending);assert.ok(ENDINGS[ending].text);assert.equal(chooseEnding(s,ending),false);}
});
test('Story difficulty has more supplies and a faster lantern recovery',()=>{
 const standard=createGame(),story=createGame({difficulty:'story'});assert.ok(story.bottles>standard.bottles);assert.ok(story.radios>standard.radios);start(story);start(standard);pulse(story);pulse(standard);assert.ok(story.nextPulse<standard.nextPulse);
});
test('controls reject reserved or duplicate keys and settings reject malformed stored values',()=>{
 const keys={...DEFAULT_BINDINGS};assert.equal(setBinding(keys,'pulse','w'),false);assert.equal(setBinding(keys,'pulse','e'),false);assert.ok(setBinding(keys,'pulse','z'));assert.equal(keys.pulse,'z');const safe=sanitizeSettings({brightness:99,music:-3,volume:'loud',bindings:{pulse:'w'},difficulty:'unknown'});assert.equal(safe.brightness,1.7);assert.equal(safe.music,0);assert.equal(safe.volume,.7);assert.deepEqual(safe.bindings,DEFAULT_BINDINGS);assert.equal(safe.difficulty,'standard');assert.deepEqual(sanitizeSettings({bindings:keys}).bindings,keys);
});
