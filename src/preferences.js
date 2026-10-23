export const DEFAULT_BINDINGS={pulse:' ',interact:'e',throw:'f',radio:'r',listen:'v',journal:'j'};
export const ACTION_LABELS={pulse:'Sound lantern',interact:'Interact',throw:'Throw glass',radio:'Gramophone',listen:'Listen',journal:'Journal'};
export const keyLabel=k=>k===' '?'SPACE':k.toUpperCase();
const RESERVED=new Set(['w','a','s','d','q','c','control','shift','alt','meta','escape','tab','enter']);
export function validBinding(key){return typeof key==='string'&&key.length===1&&!RESERVED.has(key)&&/^[a-z0-9 ]$/.test(key);}
export function setBinding(bindings,action,key){
 key=key?.toLowerCase();if(!Object.hasOwn(DEFAULT_BINDINGS,action)||!validBinding(key)||Object.entries(bindings).some(([name,value])=>name!==action&&value===key))return false;
 bindings[action]=key;return true;
}
export function sanitizeSettings(data={},reducedMotion=false){
 const s={brightness:1.1,volume:.7,music:.35,captions:true,reducedMotion,difficulty:'standard',quality:'high',bindings:{...DEFAULT_BINDINGS}};
 if(!data||typeof data!=='object')return s;
 for(const [key,min,max] of [['brightness',.7,1.7],['volume',0,1],['music',0,1]])if(Number.isFinite(data[key]))s[key]=Math.max(min,Math.min(max,data[key]));
 for(const key of ['captions','reducedMotion'])if(typeof data[key]==='boolean')s[key]=data[key];
 if(data.difficulty==='story')s.difficulty='story';if(data.quality==='low')s.quality='low';
 if(data.bindings&&Object.keys(DEFAULT_BINDINGS).every(key=>validBinding(data.bindings[key]))&&new Set(Object.values(data.bindings)).size===Object.keys(DEFAULT_BINDINGS).length)s.bindings={...data.bindings};
 return s;
}
