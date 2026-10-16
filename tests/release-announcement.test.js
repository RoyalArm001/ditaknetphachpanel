'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../src/client/js/pwa'),'utf8');
const announce=source.slice(source.indexOf('  async function announceRelease(){'),source.indexOf("  if(location.protocol!=="));
const standalone=source.slice(source.indexOf('  const standalone='),source.indexOf('  let isInstalled='));
function harness(mode='',ios=false){
 const storage=new Map(),messages=[],version={};let release='3.0.5',ok=true;
 const context=vm.createContext({window:{matchMedia:q=>({matches:q===`(display-mode: ${mode})`})},navigator:{standalone:ios},document:{querySelector:s=>s==='#appVersion'?version:null},fetch:async()=>({ok,json:async()=>({version:release})}),AbortSignal:{timeout:()=>undefined},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},tr:x=>x,toast:m=>messages.push(m),modal:()=>assert.fail('Automatic release modals must never open')});
 vm.runInContext(standalone+announce,context);
 return {storage,messages,version,run:()=>context.announceRelease(),setRelease:v=>release=v,offline:()=>ok=false};
}
test('normal browser tabs show no release notice even if an installation flag exists',async()=>{
 const h=harness();h.storage.set('mypatch-app-installed','true');await h.run();assert.deepEqual(h.messages,[]);assert.equal(h.storage.has('mypatch-seen-release'),false);assert.equal(h.version.textContent,'v3.0.5');
});
test('installed app modes show a short toast once per release, without details or modal',async()=>{
 for(const [mode,ios] of [['standalone',false],['minimal-ui',false],['window-controls-overlay',false],['',true]]){
  const h=harness(mode,ios);await h.run();await h.run();assert.deepEqual(h.messages,['Հավելվածը թարմացվել է · v3.0.5']);h.setRelease('3.0.6');await h.run();assert.equal(h.messages.length,2);assert.equal(h.storage.get('mypatch-seen-release'),'3.0.6');
 }
});
test('an already seen release and unavailable release metadata stay silent',async()=>{
 const h=harness('standalone');h.storage.set('mypatch-seen-release','3.0.5');await h.run();h.offline();await h.run();assert.deepEqual(h.messages,[]);
});
