import {build} from 'esbuild';
import {cp,mkdir,rm,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
await rm('dist',{recursive:true,force:true});
await mkdir('dist',{recursive:true});
await cp('public','dist',{recursive:true});
await build({entryPoints:['src/main.js'],bundle:true,minify:true,sourcemap:false,format:'esm',target:['es2022'],outfile:'dist/game.js',plugins:[{
 name:'resonance-embedded-hrir',setup(build){
  build.onResolve({filter:/^\.\.\/node_modules\/omnitone\/build\/omnitone\.js$/},()=>({path:resolve('src/vendor/omnitone-compat.js')}));
  build.onLoad({filter:/resonance-audio\/src\/listener\.js$/},async args=>({contents:(await readFile(args.path,'utf8')).replace('this._renderer.initialize().then(', 'this.initialized = this._renderer.initialize().then('),loader:'js'}));
 }
}]});
console.log('Built Echo Chamber · The Drowned Choir.');
