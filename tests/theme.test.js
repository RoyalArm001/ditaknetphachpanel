'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../src/client/js/theme'),'utf8');
function app(time,entries={}){
  let now=new Date(time).getTime(),timer;
  const values=new Map(Object.entries(entries)),events={},attributes={};
  const toggle={setAttribute:(key,value)=>attributes[key]=value,addEventListener:(name,fn)=>events['button:'+name]=fn};
  const context={Date:class extends Date{constructor(...args){super(...(args.length?args:[now]));}},
    localStorage:{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)},
    document:{documentElement:{dataset:{}},visibilityState:'visible',querySelector:()=>null,getElementById:id=>id==='themeToggle'?toggle:null,addEventListener:(name,fn)=>events[name]=fn},
    window:{addEventListener:(name,fn)=>events[name]=fn},setTimeout:fn=>{timer=fn;return 1;},clearTimeout(){}};
  vm.createContext(context);vm.runInContext(source,context);events.DOMContentLoaded();
  return {context,values,events,attributes,theme:()=>context.document.documentElement.dataset.theme,
    at:time=>{now=new Date(time).getTime();timer();},click:()=>events['button:click']()};
}
test('automatic theme follows local night boundaries and a suspended page catches up',()=>{
  const a=app('2026-10-08T19:59:59');assert.equal(a.theme(),'light');
  a.at('2026-10-08T20:00:00');assert.equal(a.theme(),'dark');
  a.at('2026-10-09T06:59:59');assert.equal(a.theme(),'dark');
  a.at('2026-10-09T07:00:00');assert.equal(a.theme(),'light');
  a.at('2026-10-10T22:00:00');a.events.visibilitychange();assert.equal(a.theme(),'dark');
});
test('manual toggle in automatic mode lasts through reload only until the next boundary',()=>{
  const a=app('2026-10-08T21:00:00');a.click();assert.equal(a.theme(),'light');
  const reopened=app('2026-10-09T06:00:00',Object.fromEntries(a.values));assert.equal(reopened.theme(),'light');
  reopened.at('2026-10-09T20:00:00');assert.equal(reopened.theme(),'dark');
  const day=app('2026-10-08T12:00:00');day.click();assert.equal(day.theme(),'dark');
  day.at('2026-10-09T07:00:00');assert.equal(day.theme(),'light');
});
test('permanent preferences persist; automatic can be restored; other tabs stay synchronized',()=>{
  const a=app('2026-10-08T21:00:00');a.context.RackTheme.setPreference('light');
  a.at('2026-10-09T22:00:00');assert.equal(a.theme(),'light');
  const reopened=app('2026-10-09T22:00:00',Object.fromEntries(a.values));assert.equal(reopened.theme(),'light');
  reopened.click();assert.equal(reopened.context.RackTheme.preference,'dark');
  reopened.context.RackTheme.setPreference('auto');assert.equal(reopened.theme(),'dark');
  reopened.at('2026-10-10T10:00:00');assert.equal(reopened.theme(),'light');
  reopened.values.set('mypatch-theme-mode','dark');reopened.events.storage({key:'mypatch-theme-mode'});assert.equal(reopened.theme(),'dark');
});
test('old theme values enable the new schedule and unavailable storage does not break switching',()=>{
  const a=app('2026-10-08T21:00:00',{'mypatch-theme':'light'});assert.equal(a.theme(),'dark');
  a.context.localStorage.setItem=()=>{throw Error('blocked');};a.click();assert.equal(a.theme(),'light');
  a.at('2026-10-09T20:00:00');assert.equal(a.theme(),'dark');
});
