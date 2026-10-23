import {Uniform,Matrix4,Vector2,Vector3,Color,HalfFloatType} from 'three';
import {EffectComposer,RenderPass,EffectPass,Effect,EffectAttribute,BlendFunction,BloomEffect,ChromaticAberrationEffect,VignetteEffect,NoiseEffect,ToneMappingEffect,ToneMappingMode} from 'postprocessing';
import {echo} from './world.js';
// Reconstruct the visible surface from the depth buffer; the scan hugs actual 3D geometry.
const sonarFragment=`
 uniform mat4 inverseProjection;uniform mat4 cameraWorld;uniform vec3 origin;uniform float age;uniform vec3 sonarColor;uniform float grainTime;uniform float breathStress;uniform float glitch;uniform float brightness;uniform float aspect;uniform sampler2D occlusion;
 float echoHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 void mainImage(const in vec4 inputColor,const in vec2 uv,out vec4 outputColor){
  float depth=readDepth(uv);vec4 view=inverseProjection*vec4(uv*2.0-1.0,depth*2.0-1.0,1.0);view/=view.w;
  vec3 world=(cameraWorld*view).xyz;vec3 delta=world-origin;float distanceToPulse=length(delta);float flatDistance=length(delta.xz);
  float radius=age*6.8;float fade=max(0.0,1.0-age/4.0);float front=exp(-pow((distanceToPulse-radius)*3.2,2.0))*fade;
  float behind=step(distanceToPulse,radius)*max(0.0,1.0-(age-distanceToPulse/6.8)/3.5)*fade;
  float edge=smoothstep(.0001,.002,abs(dFdx(depth))+abs(dFdy(depth)));
  float angle=atan(delta.z,delta.x)/6.2831853+.5;float limit=texture2D(occlusion,vec2(angle,.5)).r*32.0;
  float shadow=.22+.78*(1.0-smoothstep(limit,limit+.7,flatDistance));
  vec3 col=inputColor.rgb+sonarColor*(front*.35+edge*behind*.24)*shadow*step(depth,.9999);
  float line=step(.975,echoHash(vec2(floor(uv.y*100.0),floor(grainTime*19.0))));
  col+=vec3(.15,.08,.04)*line*glitch;
  float stress=smoothstep(.12,.71,length((uv-.5)*vec2(1.0,.9)))*breathStress;col*=1.0-stress*.35;
  outputColor=vec4(col*brightness,inputColor.a);
 }
`;
export function createEffectPass(camera){
 const bloom=new BloomEffect({intensity:.32,luminanceThreshold:.78,luminanceSmoothing:.25,mipmapBlur:true});
 const chromatic=new ChromaticAberrationEffect({offset:new Vector2(.00008,.00008),radialModulation:true,modulationOffset:.35});
 const vignette=new VignetteEffect({offset:.24,darkness:.52});const noise=new NoiseEffect({blendFunction:BlendFunction.SOFT_LIGHT,premultiply:true});noise.blendMode.opacity.value=.075;
 const sonar=new Effect('EchoSurface',sonarFragment,{attributes:EffectAttribute.DEPTH,blendFunction:BlendFunction.NORMAL,uniforms:new Map([
  ['inverseProjection',new Uniform(new Matrix4())],['cameraWorld',new Uniform(new Matrix4())],['origin',echo.origin],['age',echo.age],['sonarColor',echo.color],['occlusion',echo.occlusion],
  ['grainTime',new Uniform(0)],['breathStress',new Uniform(0)],['glitch',new Uniform(0)],['brightness',new Uniform(1)],['aspect',new Uniform(1)]
 ])});
 const tone=new ToneMappingEffect({mode:ToneMappingMode.ACES_FILMIC});
 const pass=new EffectPass(camera,sonar,bloom,chromatic,vignette,noise,tone);
 return {pass,sonar,bloom,chromatic,vignette,noise};
}
export function createEffects(renderer,scene,camera){
 const {pass,sonar,bloom,chromatic,vignette,noise}=createEffectPass(camera);
 const composer=new EffectComposer(renderer,{frameBufferType:HalfFloatType,multisampling:0});composer.addPass(new RenderPass(scene,camera));composer.addPass(pass);
 let glitchUntil=-1,enabled=true;
 return {composer,sonar,bloom,triggerGlitch(time){glitchUntil=time+.3;},quality(high){enabled=high;bloom.intensity=high?.32:0;noise.blendMode.opacity.value=high?.075:.025;},
  update(state,now,settings={}){
   sonar.uniforms.get('inverseProjection').value.copy(camera.projectionMatrixInverse);sonar.uniforms.get('cameraWorld').value.copy(camera.matrixWorld);
   sonar.uniforms.get('grainTime').value=now;sonar.uniforms.get('aspect').value=camera.aspect;sonar.uniforms.get('brightness').value=settings.brightness??1;
   sonar.uniforms.get('breathStress').value=state.player.hidden?1-state.player.breath/100:state.player.listening?.2:0;
   const burst=!settings.reducedMotion&&state.time<glitchUntil?(glitchUntil-state.time)/.3:0;sonar.uniforms.get('glitch').value=burst;
   chromatic.offset.setScalar(burst*.0017+(enabled&&!settings.reducedMotion?.00008:0));
   noise.blendMode.opacity.value=settings.reducedMotion?0:(enabled?.045:.018)*(state.player.listening?.35:1);
   vignette.darkness=.48+(state.player.hidden?(1-state.player.breath/100)*.15:0);
  }};
}
