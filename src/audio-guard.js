// Sound is optional: a playback failure must never abort gameplay or end-screen events.
export function createAudioGuard(sound,onError=error=>console.error('Audio disabled; gameplay continues.',error)){
 let failed=false;
 return {
  call(method,...args){
   if(failed)return;
   try{return sound[method](...args);}catch(error){
    failed=true;
    try{sound.enabled=false;if(sound.master)sound.master.gain.value=0;}catch{}
    onError(error);
   }
  },
  reset(){failed=false;}
 };
}
